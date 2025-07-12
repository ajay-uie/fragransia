const express = require('express');
const { body, validationResult } = require('express-validator');
const admin = require('firebase-admin');
const crypto = require('crypto');
const router = express.Router();

const db = admin.firestore();

// Middleware to verify authentication
const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header is required'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
};

// Create Razorpay order
router.post('/create-order', verifyAuth, [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('currency').optional().isIn(['INR', 'USD']).withMessage('Invalid currency'),
  body('orderId').notEmpty().withMessage('Order ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { amount, currency = 'INR', orderId } = req.body;

    // Verify order exists and belongs to user
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    const orderData = orderDoc.data();
    
    if (orderData.userId !== req.user.uid) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    if (orderData.paymentStatus === 'completed') {
      return res.status(400).json({
        error: 'Order already paid'
      });
    }

    // Mock Razorpay order creation
    // In production, use actual Razorpay SDK
    const razorpayOrder = {
      id: 'order_' + Math.random().toString(36).substr(2, 14),
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: orderId,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000)
    };

    // Update order with Razorpay order ID
    await db.collection('orders').doc(orderId).update({
      razorpayOrderId: razorpayOrder.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_key'
    });

  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({
      error: 'Failed to create payment order',
      message: error.message
    });
  }
});

// Verify payment
router.post('/verify', verifyAuth, [
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('orderId').notEmpty().withMessage('Order ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      orderId 
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test_secret')
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        error: 'Payment verification failed',
        message: 'Invalid signature'
      });
    }

    // Get order
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    const orderData = orderDoc.data();
    
    if (orderData.userId !== req.user.uid) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Update order status
    await db.collection('orders').doc(orderId).update({
      paymentStatus: 'completed',
      status: 'confirmed',
      razorpayPaymentId: razorpay_payment_id,
      paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update inventory
    const batch = db.batch();
    for (const item of orderData.items) {
      const productRef = db.collection('products').doc(item.productId);
      batch.update(productRef, {
        inventory: admin.firestore.FieldValue.increment(-item.quantity),
        soldCount: admin.firestore.FieldValue.increment(item.quantity)
      });
    }
    await batch.commit();

    // Create payment record
    const paymentData = {
      orderId,
      userId: req.user.uid,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: orderData.orderSummary.finalTotal,
      currency: 'INR',
      status: 'success',
      method: 'razorpay',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('payments').add(paymentData);

    // Emit real-time updates
    req.io.to('admin').emit('payment-received', {
      orderId,
      userId: req.user.uid,
      amount: orderData.orderSummary.finalTotal,
      paymentId: razorpay_payment_id
    });

    req.io.to(`user-${req.user.uid}`).emit('payment-confirmed', {
      orderId,
      status: 'confirmed'
    });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId,
      paymentId: razorpay_payment_id
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      error: 'Payment verification failed',
      message: error.message
    });
  }
});

// Handle payment failure
router.post('/failure', verifyAuth, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('error').isObject().withMessage('Error details are required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { orderId, error: paymentError } = req.body;

    // Get order
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    const orderData = orderDoc.data();
    
    if (orderData.userId !== req.user.uid) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Update order status
    await db.collection('orders').doc(orderId).update({
      paymentStatus: 'failed',
      paymentError: paymentError,
      paymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create payment failure record
    const paymentData = {
      orderId,
      userId: req.user.uid,
      amount: orderData.orderSummary.finalTotal,
      currency: 'INR',
      status: 'failed',
      method: 'razorpay',
      error: paymentError,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('payments').add(paymentData);

    // Emit real-time update
    req.io.to(`user-${req.user.uid}`).emit('payment-failed', {
      orderId,
      error: paymentError
    });

    res.json({
      success: true,
      message: 'Payment failure recorded',
      orderId
    });

  } catch (error) {
    console.error('Payment failure handling error:', error);
    res.status(500).json({
      error: 'Failed to handle payment failure',
      message: error.message
    });
  }
});

// Get payment history for user
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 10, page = 1 } = req.query;

    let query = db.collection('payments')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(parseInt(limit));
    const snapshot = await query.get();

    const payments = [];
    snapshot.forEach(doc => {
      const paymentData = doc.data();
      payments.push({
        id: doc.id,
        ...paymentData,
        createdAt: paymentData.createdAt?.toDate()
      });
    });

    // Get total count
    const countSnapshot = await db.collection('payments')
      .where('userId', '==', userId)
      .get();

    const totalPayments = countSnapshot.size;
    const totalPages = Math.ceil(totalPayments / parseInt(limit));

    res.json({
      success: true,
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPayments,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      error: 'Failed to fetch payment history',
      message: error.message
    });
  }
});

// Refund payment (admin only)
router.post('/refund', verifyAuth, [
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Invalid refund amount'),
  body('reason').notEmpty().withMessage('Refund reason is required')
], async (req, res) => {
  try {
    // Check if user is admin
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data();
    
    if (!userData || userData.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin access required'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { paymentId, amount, reason } = req.body;

    // Get payment record
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    
    if (!paymentDoc.exists) {
      return res.status(404).json({
        error: 'Payment not found'
      });
    }

    const paymentData = paymentDoc.data();
    const refundAmount = amount || paymentData.amount;

    // Mock refund process
    // In production, use actual Razorpay refund API
    const refundId = 'rfnd_' + Math.random().toString(36).substr(2, 14);

    // Create refund record
    const refundData = {
      paymentId,
      orderId: paymentData.orderId,
      userId: paymentData.userId,
      refundId,
      amount: refundAmount,
      reason,
      status: 'processed',
      processedBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('refunds').add(refundData);

    // Update payment status
    await db.collection('payments').doc(paymentId).update({
      refundStatus: 'refunded',
      refundAmount,
      refundedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Emit real-time update
    req.io.to(`user-${paymentData.userId}`).emit('refund-processed', {
      orderId: paymentData.orderId,
      refundAmount,
      refundId
    });

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: {
        refundId,
        amount: refundAmount,
        status: 'processed'
      }
    });

  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      message: error.message
    });
  }
});

module.exports = router;

