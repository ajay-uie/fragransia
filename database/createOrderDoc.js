const admin = require('firebase-admin');

const createOrderDoc = async (orderData) => {
  try {
    const db = admin.firestore();
    
    // Create the order document
    await db.collection('orders').doc(orderData.orderId).set({
      ...orderData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create order timeline entry
    await db.collection('order_timeline').add({
      orderId: orderData.orderId,
      status: 'pending',
      message: 'Order created and payment pending',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      orderId: orderData.orderId
    };

  } catch (error) {
    console.error('Create order document error:', error);
    throw error;
  }
};

// Update order status
const updateOrderStatus = async (orderId, status, message = null, additionalData = {}) => {
  try {
    const db = admin.firestore();

    // Update order document
    await db.collection('orders').doc(orderId).update({
      status,
      ...additionalData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Add timeline entry
    await db.collection('order_timeline').add({
      orderId,
      status,
      message: message || `Order status updated to ${status}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      orderId,
      status
    };

  } catch (error) {
    console.error('Update order status error:', error);
    throw error;
  }
};

// Get order timeline
const getOrderTimeline = async (orderId) => {
  try {
    const db = admin.firestore();

    const timelineQuery = await db.collection('order_timeline')
      .where('orderId', '==', orderId)
      .orderBy('timestamp', 'asc')
      .get();

    const timeline = [];
    timelineQuery.forEach(doc => {
      timeline.push({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      });
    });

    return timeline;

  } catch (error) {
    console.error('Get order timeline error:', error);
    throw error;
  }
};

// Add order notes
const addOrderNote = async (orderId, note, addedBy, isInternal = false) => {
  try {
    const db = admin.firestore();

    await db.collection('order_notes').add({
      orderId,
      note,
      addedBy,
      isInternal,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      orderId
    };

  } catch (error) {
    console.error('Add order note error:', error);
    throw error;
  }
};

// Get order notes
const getOrderNotes = async (orderId, includeInternal = false) => {
  try {
    const db = admin.firestore();

    let query = db.collection('order_notes')
      .where('orderId', '==', orderId);

    if (!includeInternal) {
      query = query.where('isInternal', '==', false);
    }

    query = query.orderBy('timestamp', 'desc');

    const notesSnapshot = await query.get();
    const notes = [];

    notesSnapshot.forEach(doc => {
      notes.push({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate()
      });
    });

    return notes;

  } catch (error) {
    console.error('Get order notes error:', error);
    throw error;
  }
};

// Create order invoice
const createOrderInvoice = async (orderId) => {
  try {
    const db = admin.firestore();

    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new Error('Order not found');
    }

    const order = orderDoc.data();

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${orderId.substr(-6)}`;

    const invoice = {
      invoiceNumber,
      orderId,
      userId: order.userId,
      customerDetails: {
        name: `${order.userDetails.firstName} ${order.userDetails.lastName}`,
        email: order.userDetails.email,
        phone: order.userDetails.phoneNumber,
        address: order.shippingAddress
      },
      items: order.items,
      pricing: order.pricing,
      paymentDetails: order.paymentDetails,
      invoiceDate: admin.firestore.FieldValue.serverTimestamp(),
      dueDate: admin.firestore.FieldValue.serverTimestamp(), // Paid invoice
      status: 'paid',
      gstNumber: process.env.COMPANY_GST_NUMBER || 'GST_NUMBER_HERE',
      companyDetails: {
        name: 'Fragransia',
        address: 'Your Company Address',
        email: 'orders@fragransia.com',
        phone: '+91-XXXXXXXXXX'
      }
    };

    await db.collection('invoices').doc(invoiceNumber).set(invoice);

    // Update order with invoice number
    await db.collection('orders').doc(orderId).update({
      invoiceNumber,
      invoiceGenerated: true,
      invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      invoiceNumber,
      invoice
    };

  } catch (error) {
    console.error('Create order invoice error:', error);
    throw error;
  }
};

// Process order refund
const processOrderRefund = async (orderId, refundAmount, reason, processedBy) => {
  try {
    const db = admin.firestore();

    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new Error('Order not found');
    }

    const order = orderDoc.data();

    if (order.status === 'refunded') {
      throw new Error('Order already refunded');
    }

    const refundId = `REF-${Date.now()}-${orderId.substr(-6)}`;

    // Create refund record
    const refund = {
      refundId,
      orderId,
      userId: order.userId,
      originalAmount: order.pricing.total,
      refundAmount: parseFloat(refundAmount),
      reason,
      status: 'processing',
      processedBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('refunds').doc(refundId).set(refund);

    // Update order status
    await updateOrderStatus(orderId, 'refunded', `Refund of ₹${refundAmount} initiated`, {
      refundId,
      refundAmount: parseFloat(refundAmount),
      refundReason: reason
    });

    return {
      success: true,
      refundId,
      refundAmount: parseFloat(refundAmount)
    };

  } catch (error) {
    console.error('Process order refund error:', error);
    throw error;
  }
};

module.exports = {
  createOrderDoc,
  updateOrderStatus,
  getOrderTimeline,
  addOrderNote,
  getOrderNotes,
  createOrderInvoice,
  processOrderRefund
};
