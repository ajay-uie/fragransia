const express = require('express');
const {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  reactivateUser,
  getUserStats
} = require('../database/manageUsers');
const { requireAdminAuth } = require('../auth/adminAuthCheck');

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get all users
router.get('/', getAllUsers);

// Get user statistics
router.get('/stats', getUserStats);

// Get user by ID
router.get('/:targetUserId', getUserById);

// Update user
router.put('/:targetUserId', updateUser);

// Deactivate user
router.patch('/:targetUserId/deactivate', deactivateUser);

// Reactivate user
router.patch('/:targetUserId/reactivate', reactivateUser);

// Get user order history
router.get('/:targetUserId/orders', async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const {
      page = 1,
      limit = 20,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const admin = require('firebase-admin');
    const db = admin.firestore();

    let query = db.collection('orders').where('userId', '==', targetUserId);

    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    const orders = [];

    snapshot.forEach(doc => {
      const order = doc.data();
      orders.push({
        id: doc.id,
        orderId: order.orderId,
        total: order.pricing.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        itemCount: order.items.length,
        createdAt: order.createdAt?.toDate()?.toISOString()
      });
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
    console.error('Get user orders error:', error);
    res.status(500).json({
      error: 'Failed to fetch user orders',
      message: error.message
    });
  }
});

// Reset user password
router.post('/:targetUserId/reset-password', async (req, res) => {
  try {
    const { targetUserId } = req.params;
    
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can reset passwords' });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();

    // Get user details
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    // Generate password reset link
    const resetLink = await admin.auth().generatePasswordResetLink(userData.email, {
      url: `${process.env.FRONTEND_URL || 'https://fragransia.com'}/reset-password`,
      handleCodeInApp: false
    });

    // Send reset email (if email service is configured)
    const { sendEmail } = require('../utils/sendEmail');
    try {
      await sendEmail.sendPasswordResetEmail({
        email: userData.email,
        firstName: userData.firstName,
        resetLink
      });
    } catch (emailError) {
      console.error('Password reset email failed:', emailError);
      // Continue even if email fails
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'reset_user_password',
      resourceType: 'user',
      resourceId: targetUserId,
      details: {
        targetUserEmail: userData.email
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Password reset link generated and sent',
      resetLink: resetLink // Only return in development/testing
    });

  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({
      error: 'Failed to reset user password',
      message: error.message
    });
  }
});

// Bulk user operations
router.patch('/bulk', async (req, res) => {
  try {
    const { userIds, action } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid user IDs',
        message: 'User IDs array is required'
      });
    }

    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can perform bulk operations' });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();
    const batch = db.batch();
    const userId = req.user.uid;

    switch (action) {
      case 'activate':
        userIds.forEach(targetUserId => {
          const userRef = db.collection('users').doc(targetUserId);
          batch.update(userRef, {
            isActive: true,
            reactivatedBy: userId,
            reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        
        // Update Firebase Auth
        for (const targetUserId of userIds) {
          try {
            await admin.auth().updateUser(targetUserId, { disabled: false });
          } catch (authError) {
            console.error(`Failed to enable user ${targetUserId} in Firebase Auth:`, authError);
          }
        }
        break;

      case 'deactivate':
        // Prevent self-deactivation
        if (userIds.includes(userId)) {
          return res.status(400).json({
            error: 'Cannot deactivate your own account'
          });
        }

        userIds.forEach(targetUserId => {
          const userRef = db.collection('users').doc(targetUserId);
          batch.update(userRef, {
            isActive: false,
            deactivatedBy: userId,
            deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            deactivationReason: 'Bulk deactivation',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });

        // Update Firebase Auth
        for (const targetUserId of userIds) {
          try {
            await admin.auth().updateUser(targetUserId, { disabled: true });
          } catch (authError) {
            console.error(`Failed to disable user ${targetUserId} in Firebase Auth:`, authError);
          }
        }
        break;

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Action must be activate or deactivate'
        });
    }

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: `bulk_${action}_users`,
      resourceType: 'user',
      details: {
        userIds,
        count: userIds.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      affectedUsers: userIds.length
    });

  } catch (error) {
    console.error('Bulk user operation error:', error);
    res.status(500).json({
      error: 'Failed to perform bulk operation',
      message: error.message
    });
  }
});

// Export user data
router.get('/:targetUserId/export', async (req, res) => {
  try {
    const { targetUserId } = req.params;
    
    const admin = require('firebase-admin');
    const db = admin.firestore();

    // Get user data
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    // Get user's orders
    const ordersQuery = await db.collection('orders')
      .where('userId', '==', targetUserId)
      .orderBy('createdAt', 'desc')
      .get();

    const orders = [];
    ordersQuery.forEach(doc => {
      const order = doc.data();
      orders.push({
        orderId: order.orderId,
        total: order.pricing.total,
        status: order.status,
        createdAt: order.createdAt?.toDate()?.toISOString(),
        items: order.items
      });
    });

    // Get user's addresses
    const addressesQuery = await db.collection('addresses')
      .where('userId', '==', targetUserId)
      .get();

    const addresses = [];
    addressesQuery.forEach(doc => {
      addresses.push(doc.data());
    });

    const exportData = {
      profile: {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        createdAt: userData.createdAt?.toDate()?.toISOString(),
        lastLoginAt: userData.lastLoginAt?.toDate()?.toISOString()
      },
      orders,
      addresses,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.uid
    };

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'export_user_data',
      resourceType: 'user',
      resourceId: targetUserId,
      details: {
        targetUserEmail: userData.email,
        dataTypes: ['profile', 'orders', 'addresses']
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      userData: exportData
    });

  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({
      error: 'Failed to export user data',
      message: error.message
    });
  }
});

module.exports = router;
