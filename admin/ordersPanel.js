const express = require('express');
const { auth, db, admin } = require('../auth/firebaseConfig');
const { requireAdminAuth } = require('../auth/adminAuthCheck');
const orderManager = require('../database/orderManager');

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get all orders for admin panel
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      dateFrom,
      dateTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('orders');

    // Apply filters
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    if (paymentStatus && paymentStatus !== 'all') {
      query = query.where('payment.status', '==', paymentStatus);
    }

    if (dateFrom) {
      query = query.where('createdAt', '>=', new Date(dateFrom));
    }

    if (dateTo) {
      query = query.where('createdAt', '<=', new Date(dateTo));
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'updatedAt', 'orderDate'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    let orders = [];

    snapshot.forEach(doc => {
      const orderData = doc.data();
      
      // Apply search filtering
      let includeOrder = true;
      if (search) {
        const searchTerm = search.toLowerCase();
        const customerName = orderData.shipping?.address ? 
          `${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}` : 
          'Unknown Customer';
        const customerEmail = orderData.shipping?.address?.email || '';
        const searchableText = `${orderData.id || doc.id} ${customerName} ${customerEmail}`.toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          includeOrder = false;
        }
      }

      if (includeOrder) {
        const customerName = orderData.shipping?.address ? 
          `${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}` : 
          'Unknown Customer';
        
        orders.push({
          id: doc.id,
          orderId: orderData.id || doc.id,
          customerName,
          customerEmail: orderData.shipping?.address?.email || '',
          customerPhone: orderData.shipping?.address?.phone || '',
          total: orderData.pricing?.total || 0,
          status: orderData.status,
          paymentStatus: orderData.payment?.status || 'pending',
          paymentMethod: orderData.payment?.method || 'unknown',
          itemCount: orderData.items?.length || 0,
          couponUsed: orderData.coupon?.code || null,
          giftWrap: orderData.giftWrap || false,
          createdAt: orderData.createdAt?.toDate()?.toISOString(),
          updatedAt: orderData.updatedAt?.toDate()?.toISOString(),
          estimatedDelivery: orderData.shipping?.estimatedDelivery?.toDate()?.toISOString()
        });
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(orders.length / parseInt(limit)),
        totalOrders: orders.length,
        hasNextPage: endIndex < orders.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get orders for admin error:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: error.message
    });
  }
});

// Get single order details
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Use order manager to get order details
    const orderResult = await orderManager.getOrderById(orderId);

    if (!orderResult.success) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    // Get order notes
    const notesQuery = await db.collection('order_notes')
      .where('orderId', '==', orderId)
      .orderBy('timestamp', 'desc')
      .get();

    const notes = [];
    notesQuery.forEach(doc => {
      const note = doc.data();
      notes.push({
        id: doc.id,
        note: note.note,
        addedBy: note.addedBy,
        addedByName: note.addedByName || 'Unknown',
        isInternal: note.isInternal,
        timestamp: note.timestamp?.toDate()?.toISOString()
      });
    });

    // Get customer details
    let customerDetails = null;
    if (orderResult.order.userId) {
      const userDoc = await db.collection('users').doc(orderResult.order.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        customerDetails = {
          id: userDoc.id,
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          phone: userData.phone,
          totalOrders: userData.totalOrders || 0,
          totalSpent: userData.totalSpent || 0,
          joinDate: userData.createdAt?.toDate()?.toISOString()
        };
      }
    }

    res.status(200).json({
      success: true,
      order: orderResult.order,
      notes,
      customerDetails
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      error: 'Failed to fetch order details',
      message: error.message
    });
  }
});

// Update order status
router.patch('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, message, trackingNumber } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        validStatuses
      });
    }

    // Use order manager to update status
    const result = await orderManager.updateOrderStatus(
      orderId, 
      status, 
      message || `Status updated to ${status}`,
      req.user.uid
    );

    // Add tracking number if provided and status is shipped
    if (trackingNumber && status === 'shipped') {
      await db.collection('orders').doc(orderId).update({
        'tracking.trackingNumber': trackingNumber,
        'tracking.carrier': 'Standard Shipping',
        'tracking.shippedAt': admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'update_order_status',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        newStatus: status,
        message: message || null,
        trackingNumber: trackingNumber || null
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      result
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      error: 'Failed to update order status',
      message: error.message
    });
  }
});

// Add order note
router.post('/:orderId/notes', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { note, isInternal = false } = req.body;

    if (!note || note.trim().length === 0) {
      return res.status(400).json({
        error: 'Note content is required'
      });
    }

    // Get admin user details
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const addedByName = userData ? `${userData.firstName} ${userData.lastName}` : 'Admin';

    // Add note to database
    const noteData = {
      orderId,
      note: note.trim(),
      addedBy: req.user.uid,
      addedByName,
      isInternal,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    const noteRef = await db.collection('order_notes').add(noteData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'add_order_note',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        noteId: noteRef.id,
        isInternal
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Note added successfully',
      noteId: noteRef.id
    });

  } catch (error) {
    console.error('Add order note error:', error);
    res.status(500).json({
      error: 'Failed to add order note',
      message: error.message
    });
  }
});

// Process refund
router.post('/:orderId/refund', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { refundAmount, reason, refundType = 'full' } = req.body;

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        error: 'Valid refund amount is required'
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        error: 'Refund reason is required'
      });
    }

    // Get order details
    const orderResult = await orderManager.getOrderById(orderId);
    if (!orderResult.success) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    const order = orderResult.order;

    // Validate refund amount
    if (refundAmount > order.pricing.total) {
      return res.status(400).json({
        error: 'Refund amount cannot exceed order total'
      });
    }

    // Create refund record
    const refundData = {
      orderId,
      originalAmount: order.pricing.total,
      refundAmount: parseFloat(refundAmount),
      reason: reason.trim(),
      refundType,
      status: 'pending',
      processedBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const refundRef = await db.collection('refunds').add(refundData);

    // Update order status to refunded if full refund
    if (refundType === 'full' || refundAmount >= order.pricing.total) {
      await orderManager.updateOrderStatus(
        orderId,
        'refunded',
        `Full refund processed: ${reason}`,
        req.user.uid
      );
    } else {
      // Add note for partial refund
      await db.collection('order_notes').add({
        orderId,
        note: `Partial refund of ₹${refundAmount} processed. Reason: ${reason}`,
        addedBy: req.user.uid,
        addedByName: 'System',
        isInternal: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Restore inventory for refunded items
    if (refundType === 'full') {
      const batch = db.batch();
      
      for (const item of order.items) {
        const productRef = db.collection('products').doc(item.productId);
        batch.update(productRef, {
          inventory: admin.firestore.FieldValue.increment(item.quantity),
          totalSales: admin.firestore.FieldValue.increment(-item.quantity)
        });
      }
      
      await batch.commit();
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'process_refund',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        refundId: refundRef.id,
        refundAmount: parseFloat(refundAmount),
        refundType,
        reason
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      refundId: refundRef.id,
      refundAmount: parseFloat(refundAmount)
    });

  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      error: 'Failed to process refund',
      message: error.message
    });
  }
});

// Get order statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      refundedOrders,
      todayOrders,
      weekOrders,
      monthOrders
    ] = await Promise.all([
      db.collection('orders').get(),
      db.collection('orders').where('status', '==', 'pending').get(),
      db.collection('orders').where('status', '==', 'confirmed').get(),
      db.collection('orders').where('status', '==', 'processing').get(),
      db.collection('orders').where('status', '==', 'shipped').get(),
      db.collection('orders').where('status', '==', 'delivered').get(),
      db.collection('orders').where('status', '==', 'cancelled').get(),
      db.collection('orders').where('status', '==', 'refunded').get(),
      db.collection('orders').where('createdAt', '>=', today).get(),
      db.collection('orders').where('createdAt', '>=', sevenDaysAgo).get(),
      db.collection('orders').where('createdAt', '>=', thirtyDaysAgo).get()
    ]);

    // Calculate revenue
    let totalRevenue = 0;
    let weekRevenue = 0;
    let monthRevenue = 0;
    let todayRevenue = 0;

    const calculateRevenue = (ordersSnapshot) => {
      let revenue = 0;
      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
          revenue += order.pricing?.total || 0;
        }
      });
      return revenue;
    };

    totalRevenue = calculateRevenue(totalOrders);
    weekRevenue = calculateRevenue(weekOrders);
    monthRevenue = calculateRevenue(monthOrders);
    todayRevenue = calculateRevenue(todayOrders);

    // Get payment method distribution
    const paymentMethods = {};
    totalOrders.forEach(doc => {
      const order = doc.data();
      const method = order.payment?.method || 'unknown';
      paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });

    // Get orders requiring attention
    const ordersRequiringAttention = pendingOrders.size + processingOrders.size;

    res.status(200).json({
      success: true,
      stats: {
        orderCounts: {
          total: totalOrders.size,
          pending: pendingOrders.size,
          confirmed: confirmedOrders.size,
          processing: processingOrders.size,
          shipped: shippedOrders.size,
          delivered: deliveredOrders.size,
          cancelled: cancelledOrders.size,
          refunded: refundedOrders.size,
          requiresAttention: ordersRequiringAttention
        },
        periodCounts: {
          today: todayOrders.size,
          week: weekOrders.size,
          month: monthOrders.size
        },
        revenue: {
          total: Math.round(totalRevenue * 100) / 100,
          today: Math.round(todayRevenue * 100) / 100,
          week: Math.round(weekRevenue * 100) / 100,
          month: Math.round(monthRevenue * 100) / 100,
          averageOrderValue: totalOrders.size > 0 ? 
            Math.round((totalRevenue / totalOrders.size) * 100) / 100 : 0
        },
        paymentMethods,
        fulfillmentRate: totalOrders.size > 0 ? 
          Math.round((deliveredOrders.size / totalOrders.size) * 100 * 100) / 100 : 0,
        cancellationRate: totalOrders.size > 0 ? 
          Math.round((cancelledOrders.size / totalOrders.size) * 100 * 100) / 100 : 0
      }
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch order statistics',
      message: error.message
    });
  }
});

// Bulk order operations
router.patch('/bulk', async (req, res) => {
  try {
    const { orderIds, action, data } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid order IDs',
        message: 'Order IDs array is required'
      });
    }

    if (orderIds.length > 50) {
      return res.status(400).json({
        error: 'Too many orders',
        message: 'Maximum 50 orders allowed per bulk operation'
      });
    }

    const userId = req.user.uid;

    switch (action) {
      case 'update_status':
        if (!data.status) {
          return res.status(400).json({
            error: 'Status is required for update_status action'
          });
        }

        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(data.status)) {
          return res.status(400).json({
            error: 'Invalid status',
            validStatuses
          });
        }

        // Update orders one by one to maintain timeline
        const results = [];
        for (const orderId of orderIds) {
          try {
            const result = await orderManager.updateOrderStatus(
              orderId, 
              data.status, 
              data.message || `Bulk update to ${data.status}`,
              userId
            );
            results.push({ orderId, success: true, result });
          } catch (error) {
            results.push({ orderId, success: false, error: error.message });
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        res.status(200).json({
          success: true,
          message: `Bulk status update completed. ${successCount} successful, ${failureCount} failed.`,
          results,
          summary: {
            total: orderIds.length,
            successful: successCount,
            failed: failureCount
          }
        });
        break;

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Action must be update_status'
        });
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: `bulk_${action}_orders`,
      resourceType: 'order',
      details: {
        orderIds,
        action,
        data,
        count: orderIds.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('Bulk order operation error:', error);
    res.status(500).json({
      error: 'Failed to perform bulk operation',
      message: error.message
    });
  }
});

// Export orders to CSV
router.get('/export/csv', async (req, res) => {
  try {
    const { status, dateFrom, dateTo } = req.query;

    let query = db.collection('orders');

    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    if (dateFrom) {
      query = query.where('createdAt', '>=', new Date(dateFrom));
    }

    if (dateTo) {
      query = query.where('createdAt', '<=', new Date(dateTo));
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    const orders = [];

    snapshot.forEach(doc => {
      const order = doc.data();
      const customerName = order.shipping?.address ? 
        `${order.shipping.address.firstName} ${order.shipping.address.lastName}` : 
        'Unknown Customer';

      orders.push({
        'Order ID': order.id || doc.id,
        'Customer Name': customerName,
        'Customer Email': order.shipping?.address?.email || '',
        'Total Amount': order.pricing?.total || 0,
        'Status': order.status,
        'Payment Status': order.payment?.status || 'pending',
        'Payment Method': order.payment?.method || 'unknown',
        'Items Count': order.items?.length || 0,
        'Coupon Used': order.coupon?.code || '',
        'Gift Wrap': order.giftWrap ? 'Yes' : 'No',
        'Order Date': order.createdAt?.toDate()?.toISOString() || '',
        'Estimated Delivery': order.shipping?.estimatedDelivery?.toDate()?.toISOString() || ''
      });
    });

    // Convert to CSV
    if (orders.length === 0) {
      return res.status(404).json({
        error: 'No orders found',
        message: 'No orders match the specified criteria'
      });
    }

    const headers = Object.keys(orders[0]);
    const csvContent = [
      headers.join(','),
      ...orders.map(order => 
        headers.map(header => 
          `"${String(order[header]).replace(/"/g, '""')}"`
        ).join(',')
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({
      error: 'Failed to export orders',
      message: error.message
    });
  }
});

module.exports = router;
