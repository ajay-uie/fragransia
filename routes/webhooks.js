const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Import modules
const { webhookAuthMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { whatsappWebhook } = require('../api/whatsappWebhook');

/**
 * @route   POST /api/webhooks/whatsapp
 * @desc    WhatsApp webhook endpoint
 * @access  Webhook (API key required)
 */
router.post('/whatsapp', [
  webhookAuthMiddleware
], asyncHandler(async (req, res) => {
  try {
    const result = await whatsappWebhook(req.body);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing WhatsApp webhook'
    });
  }
}));

/**
 * @route   GET /api/webhooks/whatsapp
 * @desc    WhatsApp webhook verification
 * @access  Public
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('WhatsApp webhook verified');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * @route   POST /api/webhooks/razorpay
 * @desc    Razorpay webhook endpoint
 * @access  Webhook (signature verification)
 */
router.post('/razorpay', asyncHandler(async (req, res) => {
  try {
    const crypto = require('crypto');
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
      
      case 'order.paid':
        await handleOrderPaid(payload.order.entity);
        break;
      
      case 'refund.created':
        await handleRefundCreated(payload.refund.entity);
        break;
      
      case 'refund.processed':
        await handleRefundProcessed(payload.refund.entity);
        break;
      
      default:
        console.log(`Unhandled Razorpay webhook event: ${event}`);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Razorpay webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing Razorpay webhook'
    });
  }
}));

/**
 * @route   POST /api/webhooks/email
 * @desc    Email delivery webhook (SendGrid, etc.)
 * @access  Webhook (API key required)
 */
router.post('/email', [
  webhookAuthMiddleware
], asyncHandler(async (req, res) => {
  try {
    const events = req.body;
    
    if (!Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    for (const event of events) {
      await handleEmailEvent(event);
    }

    res.json({
      success: true,
      message: 'Email webhook processed successfully'
    });

  } catch (error) {
    console.error('Email webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing email webhook'
    });
  }
}));

/**
 * @route   POST /api/webhooks/inventory
 * @desc    Inventory update webhook
 * @access  Webhook (API key required)
 */
router.post('/inventory', [
  webhookAuthMiddleware,
  body('productId').notEmpty(),
  body('quantity').isInt(),
  body('operation').isIn(['add', 'subtract', 'set']),
  body('reason').optional().trim()
], asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const { productId, quantity, operation, reason } = req.body;
    const { db } = require('../auth/firebaseConfig');

    // Get current product
    const productDoc = await db.collection('products').doc(productId).get();
    
    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const productData = productDoc.data();
    let newQuantity = productData.inventory || 0;

    // Apply operation
    switch (operation) {
      case 'add':
        newQuantity += quantity;
        break;
      case 'subtract':
        newQuantity = Math.max(0, newQuantity - quantity);
        break;
      case 'set':
        newQuantity = quantity;
        break;
    }

    // Update product inventory
    await db.collection('products').doc(productId).update({
      inventory: newQuantity,
      updatedAt: new Date()
    });

    // Log inventory change
    const { logger } = require('../utils/logger');
    logger.logInventory(`inventory_${operation}`, productId, quantity, reason);

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      previousQuantity: productData.inventory,
      newQuantity
    });

  } catch (error) {
    console.error('Inventory webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing inventory webhook'
    });
  }
}));

// Helper functions for webhook event handling

async function handlePaymentCaptured(payment) {
  try {
    const { db } = require('../auth/firebaseConfig');
    const { logger } = require('../utils/logger');
    
    // Update transaction record
    const transactionRef = db.collection('transactions').doc(payment.id);
    await transactionRef.update({
      status: 'captured',
      capturedAt: new Date(),
      razorpayData: payment
    });

    // Update order payment status
    if (payment.notes && payment.notes.orderId) {
      const orderRef = db.collection('orders').doc(payment.notes.orderId);
      await orderRef.update({
        'payment.status': 'captured',
        'payment.capturedAt': new Date(),
        'payment.razorpayPaymentId': payment.id,
        status: 'confirmed',
        updatedAt: new Date()
      });

      // Send confirmation notifications
      const { sendEmail } = require('../utils/sendEmail');
      const { whatsappBot } = require('../utils/whatsappBot');
      
      const orderDoc = await orderRef.get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data();
        await sendEmail.sendPaymentConfirmation(orderData);
        await whatsappBot.sendPaymentConfirmation(orderData);
      }
    }

    logger.logPayment('payment_captured', {
      paymentId: payment.id,
      amount: payment.amount / 100,
      orderId: payment.notes?.orderId
    });

  } catch (error) {
    console.error('Handle payment captured error:', error);
  }
}

async function handlePaymentFailed(payment) {
  try {
    const { db } = require('../auth/firebaseConfig');
    const { logger } = require('../utils/logger');
    
    // Update transaction record
    const transactionRef = db.collection('transactions').doc(payment.id);
    await transactionRef.update({
      status: 'failed',
      failedAt: new Date(),
      failureReason: payment.error_description,
      razorpayData: payment
    });

    // Update order payment status
    if (payment.notes && payment.notes.orderId) {
      const orderRef = db.collection('orders').doc(payment.notes.orderId);
      await orderRef.update({
        'payment.status': 'failed',
        'payment.failedAt': new Date(),
        'payment.failureReason': payment.error_description,
        updatedAt: new Date()
      });
    }

    logger.logPayment('payment_failed', {
      paymentId: payment.id,
      amount: payment.amount / 100,
      orderId: payment.notes?.orderId,
      reason: payment.error_description
    });

  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
}

async function handleOrderPaid(order) {
  try {
    const { db } = require('../auth/firebaseConfig');
    const { logger } = require('../utils/logger');
    
    // Find order by receipt
    const ordersSnapshot = await db.collection('orders')
      .where('razorpayOrderId', '==', order.id)
      .limit(1)
      .get();

    if (!ordersSnapshot.empty) {
      const orderDoc = ordersSnapshot.docs[0];
      await orderDoc.ref.update({
        'payment.status': 'paid',
        'payment.paidAt': new Date(),
        status: 'confirmed',
        updatedAt: new Date()
      });

      logger.logOrder('order_paid', {
        orderId: orderDoc.id,
        razorpayOrderId: order.id,
        amount: order.amount / 100
      });
    }

  } catch (error) {
    console.error('Handle order paid error:', error);
  }
}

async function handleRefundCreated(refund) {
  try {
    const { db } = require('../auth/firebaseConfig');
    const { logger } = require('../utils/logger');
    
    // Update refund record
    const refundRef = db.collection('refunds').doc(refund.id);
    await refundRef.update({
      status: refund.status,
      updatedAt: new Date(),
      razorpayData: refund
    });

    logger.logPayment('refund_created', {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount / 100
    });

  } catch (error) {
    console.error('Handle refund created error:', error);
  }
}

async function handleRefundProcessed(refund) {
  try {
    const { db } = require('../auth/firebaseConfig');
    const { logger } = require('../utils/logger');
    
    // Update refund record
    const refundRef = db.collection('refunds').doc(refund.id);
    await refundRef.update({
      status: 'processed',
      processedAt: new Date(),
      razorpayData: refund
    });

    // Send refund confirmation
    const { sendEmail } = require('../utils/sendEmail');
    const refundDoc = await refundRef.get();
    if (refundDoc.exists) {
      const refundData = refundDoc.data();
      await sendEmail.sendRefundConfirmation(refundData);
    }

    logger.logPayment('refund_processed', {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount / 100
    });

  } catch (error) {
    console.error('Handle refund processed error:', error);
  }
}

async function handleEmailEvent(event) {
  try {
    const { db } = require('../auth/firebaseConfig');
    const { logger } = require('../utils/logger');
    
    // Log email event
    logger.logEmail(event.event, {
      to: event.email,
      subject: event.subject,
      messageId: event.sg_message_id,
      success: ['delivered', 'opened'].includes(event.event)
    });

    // Update email tracking if needed
    if (event.sg_message_id) {
      const emailTrackingRef = db.collection('emailTracking').doc(event.sg_message_id);
      await emailTrackingRef.set({
        event: event.event,
        timestamp: new Date(event.timestamp * 1000),
        email: event.email,
        reason: event.reason,
        response: event.response
      }, { merge: true });
    }

  } catch (error) {
    console.error('Handle email event error:', error);
  }
}

module.exports = router;
