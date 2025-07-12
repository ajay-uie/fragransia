const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');

// Get all users with pagination
const getAllUsers = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const {
      page = 1,
      limit = 20,
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('users');

    // Apply filters
    if (role) {
      query = query.where('role', '==', role);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'lastLoginAt', 'email', 'firstName'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    // Execute query
    const snapshot = await query.get();
    let users = [];

    snapshot.forEach(doc => {
      const userData = doc.data();
      
      // Apply search filtering
      let includeUser = true;
      if (search) {
        const searchTerm = search.toLowerCase();
        const searchableText = `${userData.firstName} ${userData.lastName} ${userData.email}`.toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          includeUser = false;
        }
      }

      if (includeUser) {
        users.push({
          uid: doc.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phoneNumber: userData.phoneNumber,
          role: userData.role,
          isActive: userData.isActive,
          emailVerified: userData.emailVerified,
          createdAt: userData.createdAt?.toDate()?.toISOString(),
          lastLoginAt: userData.lastLoginAt?.toDate()?.toISOString(),
          totalOrders: userData.totalOrders || 0,
          totalSpent: userData.totalSpent || 0
        });
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = users.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      users: paginatedUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(users.length / parseInt(limit)),
        totalUsers: users.length,
        hasNextPage: endIndex < users.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error.message
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role or self-access
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || (!['admin', 'manager'].includes(userDoc.data().role) && userId !== targetUserId)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    // Get target user
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = targetUserDoc.data();

    // Get user's orders
    const ordersQuery = await db.collection('orders')
      .where('userId', '==', targetUserId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const orders = [];
    ordersQuery.forEach(doc => {
      orders.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()?.toISOString()
      });
    });

    // Get user's addresses
    const addressesQuery = await db.collection('addresses')
      .where('userId', '==', targetUserId)
      .get();

    const addresses = [];
    addressesQuery.forEach(doc => {
      addresses.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.status(200).json({
      success: true,
      user: {
        uid: targetUserId,
        ...targetUser,
        createdAt: targetUser.createdAt?.toDate()?.toISOString(),
        lastLoginAt: targetUser.lastLoginAt?.toDate()?.toISOString(),
        updatedAt: targetUser.updatedAt?.toDate()?.toISOString()
      },
      orders,
      addresses,
      stats: {
        totalOrders: orders.length,
        totalSpent: orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0)
      }
    });

  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: error.message
    });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role or self-access
    const userDoc = await db.collection('users').doc(userId).get();
    const isAdmin = userDoc.exists && ['admin', 'manager'].includes(userDoc.data().role);
    const isSelf = userId === targetUserId;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    // Check if target user exists
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = { ...req.body };

    // Only admins can update certain fields
    const adminOnlyFields = ['role', 'isActive'];
    if (!isAdmin) {
      adminOnlyFields.forEach(field => {
        if (updateData[field] !== undefined) {
          delete updateData[field];
        }
      });
    }

    // Validate email if provided
    if (updateData.email) {
      const validation = validateInput.validateEmail(updateData.email);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Invalid email format'
        });
      }
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Add update metadata
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedBy = userId;

    // Update user in Firestore
    await db.collection('users').doc(targetUserId).update(updateData);

    // Update Firebase Auth if email changed
    if (updateData.email || updateData.phoneNumber) {
      const authUpdateData = {};
      if (updateData.email) authUpdateData.email = updateData.email;
      if (updateData.phoneNumber) authUpdateData.phoneNumber = `+91${updateData.phoneNumber}`;
      
      await admin.auth().updateUser(targetUserId, authUpdateData);
    }

    // Log admin activity if admin update
    if (isAdmin && !isSelf) {
      await db.collection('admin_activity').add({
        userId,
        action: 'update_user',
        resourceType: 'user',
        resourceId: targetUserId,
        details: {
          updatedFields: Object.keys(updateData),
          targetUserEmail: targetUserDoc.data().email
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      userId: targetUserId
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: error.message
    });
  }
};

// Deactivate user
const deactivateUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const { reason } = req.body;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can deactivate users' });
    }

    // Check if target user exists
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deactivation
    if (userId === targetUserId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const targetUser = targetUserDoc.data();

    // Update user status
    await db.collection('users').doc(targetUserId).update({
      isActive: false,
      deactivatedBy: userId,
      deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deactivationReason: reason || 'No reason provided',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Disable user in Firebase Auth
    await admin.auth().updateUser(targetUserId, {
      disabled: true
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'deactivate_user',
      resourceType: 'user',
      resourceId: targetUserId,
      details: {
        targetUserEmail: targetUser.email,
        reason: reason || 'No reason provided'
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      userId: targetUserId
    });

  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({
      error: 'Failed to deactivate user',
      message: error.message
    });
  }
};

// Reactivate user
const reactivateUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can reactivate users' });
    }

    // Check if target user exists
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = targetUserDoc.data();

    // Update user status
    await db.collection('users').doc(targetUserId).update({
      isActive: true,
      reactivatedBy: userId,
      reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Enable user in Firebase Auth
    await admin.auth().updateUser(targetUserId, {
      disabled: false
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'reactivate_user',
      resourceType: 'user',
      resourceId: targetUserId,
      details: {
        targetUserEmail: targetUser.email
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'User reactivated successfully',
      userId: targetUserId
    });

  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({
      error: 'Failed to reactivate user',
      message: error.message
    });
  }
};

// Get user statistics
const getUserStats = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    // Get user counts by role
    const [
      totalUsers,
      adminUsers,
      customerUsers,
      activeUsers,
      inactiveUsers
    ] = await Promise.all([
      db.collection('users').get(),
      db.collection('users').where('role', '==', 'admin').get(),
      db.collection('users').where('role', '==', 'customer').get(),
      db.collection('users').where('isActive', '==', true).get(),
      db.collection('users').where('isActive', '==', false).get()
    ]);

    // Get recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsers = await db.collection('users')
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();

    res.status(200).json({
      success: true,
      stats: {
        total: totalUsers.size,
        byRole: {
          admin: adminUsers.size,
          customer: customerUsers.size
        },
        byStatus: {
          active: activeUsers.size,
          inactive: inactiveUsers.size
        },
        recentRegistrations: recentUsers.size
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch user statistics',
      message: error.message
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  reactivateUser,
  getUserStats
};
