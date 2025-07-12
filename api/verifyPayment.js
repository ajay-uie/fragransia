const express = require('express');
const { auth, db, admin } = require('../auth/firebaseConfig');
const crypto = require('crypto');
const razorpay = require('../logic/razorpayInstance');
const orderManager = require('../database/orderManager');
const couponManager = require('../database/couponManager');
const { sendEmail } = require('../utils/sendEmail');
const { deliveryETA } = require('../logic/deliveryETA');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      orderId 
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'All payment verification fields are required'
      });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('Signature verification failed:', {
        expected: expectedSignature,
        received: razorpay_signature
      });
      
      return res.status(400).json({
        error: 'Payment verification failed',
        message: 'Invalid signature'
      });
    }

    // Verify payment with Razorpay
    let payment;
    try {
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (razorpayError) {
      console.error('Razorpay payment fetch error:', razorpayError);
      return res.status(400).json({
        error: 'Payment verification failed',
        message: 'Unable to verify payment with gateway'
      });
    }
    
    if (payment.status !== 'captured') {
      return res.status(400).json({
        error: 'Payment not captured',
        paymentStatus: payment.status,
        message: 'Payment was not successfully captured'
      });
    }

    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).json({ 
        error: 'Order not found',
        orderId 
      });
    }

    const orderData = orderDoc.data();

    // Check if payment amount matches order amount
    const orderAmount = Math.round(orderData.pricing.total * 100); // Convert to paise
    if (payment.amount !== orderAmount) {
      console.error('Payment amount mismatch:', {
        paymentAmount: payment.amount,
        orderAmount: orderAmount
      });
      
      return res.status(400).json({
        error: 'Payment amount mismatch',
        message: 'Payment amount does not match order total'
      });
    }

    // Calculate delivery estimate
    const estimatedDelivery = deliveryETA.calculateDelivery(
      orderData.shipping.address.pincode || orderData.shipping.address.zipCode
    );

    // Prepare payment details
    const paymentDetails = {
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      amount: payment.amount / 100,
      method: payment.method,
      bank: payment.bank || null,
      wallet: payment.wallet || null,
      card: payment.card ? {
        last4: payment.card.last4,
        network: payment.card.network,
        type: payment.card.type
      } : null,
      capturedAt: new Date(payment.created_at * 1000),
      fee: payment.fee ? payment.fee / 100 : 0,
      tax: payment.tax ? payment.tax / 100 : 0
    };

    // Update order status using order manager
    await orderManager.updateOrderStatus(
      orderId, 
      'confirmed', 
      'Payment verified and captured successfully',
      'system'
    );

    // Update payment details in order
    await db.collection('orders').doc(orderId).update({
      'payment.status': 'completed',
      'payment.details': paymentDetails,
      'shipping.estimatedDelivery': estimatedDelivery,
      paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update coupon usage if applicable
    if (orderData.coupon?.code) {
      try {
        await couponManager.incrementUsage(orderData.coupon.code);
      } catch (couponError) {
        console.error('Coupon usage update failed:', couponError);
        // Don't fail the payment verification if coupon update fails
      }
    }

    // Update product sales count
    const batch = db.batch();
    for (const item of orderData.items) {
      const productRef = db.collection('products').doc(item.productId);
      batch.update(productRef, {
        totalSales: admin.firestore.FieldValue.increment(item.quantity),
        lastSoldAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();

    // Get user details for email
    const userDoc = await db.collection('users').doc(orderData.userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // Send confirmation email
    try {
      if (userData?.email) {
        await sendEmail.sendOrderConfirmation({
          email: userData.email,
          firstName: userData.firstName,
          orderId,
          orderData: {
            ...orderData,
            payment: {
              ...orderData.payment,
              details: paymentDetails
            },
            shipping: {
              ...orderData.shipping,
              estimatedDelivery
            }
          }
        });
      }
    } catch (emailError) {
      console.error('Order confirmation email failed:', emailError);
      // Don't fail the request if email fails
    }

    // Log successful payment
    await db.collection('payment_logs').add({
      orderId,
      userId: orderData.userId,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      amount: payment.amount / 100,
      status: 'success',
      method: payment.method,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      order: {
        orderId,
        status: 'confirmed',
        paymentStatus: 'completed',
        estimatedDelivery: estimatedDelivery.toISOString(),
        paymentDetails: {
          paymentId: razorpay_payment_id,
          amount: payment.amount / 100,
          method: payment.method
        }
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    
    // Log failed payment attempt
    try {
      await db.collection('payment_logs').add({
        orderId: req.body.orderId,
        razorpayPaymentId: req.body.razorpay_payment_id,
        razorpayOrderId: req.body.razorpay_order_id,
        status: 'failed',
        error: error.message,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (logError) {
      console.error('Failed to log payment error:', logError);
    }

    res.status(500).json({
      error: 'Payment verification failed',
      message: error.message
    });
  }
});

module.exports = router;
