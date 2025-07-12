const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');

// Admin login endpoint
const adminLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: 'Missing ID token',
        message: 'Firebase ID token is required'
      });
    }

    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User profile not found',
        message: 'Admin profile does not exist in database'
      });
    }

    const userProfile = userDoc.data();

    // Check if user has admin privileges
    const allowedRoles = ['admin', 'manager', 'staff'];
    if (!allowedRoles.includes(userProfile.role)) {
      return res.status(403).json({
        error: 'Insufficient privileges',
        message: 'Access denied. Admin privileges required.',
        userRole: userProfile.role
      });
    }

    // Check if account is active
    if (!userProfile.isActive) {
      return res.status(403).json({
        error: 'Account deactivated',
        message: 'Your admin account has been deactivated. Contact system administrator.'
      });
    }

    // Update last login time
    await db.collection('users').doc(userId).update({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log admin login activity
    await db.collection('admin_activity').add({
      userId,
      email: userProfile.email,
      role: userProfile.role,
      action: 'admin_login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Get user permissions based on role
    const permissions = getPermissionsByRole(userProfile.role);

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      admin: {
        uid: userId,
        email: userProfile.email,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        role: userProfile.role,
        permissions,
        lastLoginAt: new Date().toISOString()
      },
      sessionInfo: {
        loginTime: new Date().toISOString(),
        expiresAt: new Date(decodedToken.exp * 1000).toISOString()
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Authentication token has expired. Please login again.'
      });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'Token revoked',
        message: 'Authentication token has been revoked'
      });
    }
    
    if (error.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid'
      });
    }

    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
};

// Admin logout endpoint
const adminLogout = async (req, res) => {
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

    // Log admin logout activity
    await db.collection('admin_activity').add({
      userId,
      action: 'admin_logout',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Revoke refresh tokens (this will force re-authentication)
    await admin.auth().revokeRefreshTokens(userId);

    res.status(200).json({
      success: true,
      message: 'Admin logout successful'
    });

  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message
    });
  }
};

// Get admin profile
const getAdminProfile = async (req, res) => {
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
    
    // Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User profile not found'
      });
    }

    const userProfile = userDoc.data();

    // Check admin role
    const allowedRoles = ['admin', 'manager', 'staff'];
    if (!allowedRoles.includes(userProfile.role)) {
      return res.status(403).json({
        error: 'Insufficient privileges'
      });
    }

    // Get recent admin activities
    const recentActivitiesQuery = await db.collection('admin_activity')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const recentActivities = [];
    recentActivitiesQuery.forEach(doc => {
      const activity = doc.data();
      recentActivities.push({
        id: doc.id,
        action: activity.action,
        resourceType: activity.resourceType,
        timestamp: activity.timestamp?.toDate()?.toISOString(),
        details: activity.details
      });
    });

    res.status(200).json({
      success: true,
      profile: {
        uid: userId,
        email: userProfile.email,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        role: userProfile.role,
        isActive: userProfile.isActive,
        createdAt: userProfile.createdAt?.toDate()?.toISOString(),
        lastLoginAt: userProfile.lastLoginAt?.toDate()?.toISOString(),
        permissions: getPermissionsByRole(userProfile.role)
      },
      recentActivities
    });

  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch admin profile',
      message: error.message
    });
  }
};

// Update admin profile
const updateAdminProfile = async (req, res) => {
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
    
    const { firstName, lastName, phoneNumber } = req.body;

    // Validate input
    if (firstName) {
      const nameValidation = validateInput.validateName(firstName);
      if (!nameValidation.isValid) {
        return res.status(400).json({
          error: 'Invalid first name',
          details: nameValidation.errors
        });
      }
    }

    if (lastName) {
      const nameValidation = validateInput.validateName(lastName);
      if (!nameValidation.isValid) {
        return res.status(400).json({
          error: 'Invalid last name',
          details: nameValidation.errors
        });
      }
    }

    if (phoneNumber) {
      const phoneValidation = validateInput.validatePhoneNumber(phoneNumber);
      if (!phoneValidation.isValid) {
        return res.status(400).json({
          error: 'Invalid phone number',
          details: phoneValidation.errors
        });
      }
    }

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update'
      });
    }

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    // Update profile in Firestore
    await db.collection('users').doc(userId).update(updateData);

    // Update Firebase Auth if name changed
    if (firstName || lastName) {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      await admin.auth().updateUser(userId, {
        displayName: `${firstName || userData.firstName} ${lastName || userData.lastName}`
      });
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_profile',
      details: {
        updatedFields: Object.keys(updateData)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message
    });
  }
};

// Get admin activity logs
const getAdminActivityLogs = async (req, res) => {
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
      limit = 50,
      action,
      adminUserId,
      startDate,
      endDate
    } = req.query;

    let query = db.collection('admin_activity');

    // Apply filters
    if (action) {
      query = query.where('action', '==', action);
    }

    if (adminUserId) {
      query = query.where('userId', '==', adminUserId);
    }

    if (startDate) {
      query = query.where('timestamp', '>=', new Date(startDate));
    }

    if (endDate) {
      query = query.where('timestamp', '<=', new Date(endDate));
    }

    // Apply sorting and pagination
    query = query.orderBy('timestamp', 'desc').limit(parseInt(limit) * parseInt(page));

    const snapshot = await query.get();
    const activities = [];

    snapshot.forEach(doc => {
      const activity = doc.data();
      activities.push({
        id: doc.id,
        ...activity,
        timestamp: activity.timestamp?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedActivities = activities.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      activities: paginatedActivities,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(activities.length / parseInt(limit)),
        totalActivities: activities.length,
        hasNextPage: endIndex < activities.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get admin activity logs error:', error);
    res.status(500).json({
      error: 'Failed to fetch activity logs',
      message: error.message
    });
  }
};

// Helper function to get permissions by role
function getPermissionsByRole(role) {
  const permissions = {
    admin: [
      'view_dashboard',
      'manage_products',
      'manage_orders',
      'manage_users',
      'manage_coupons',
      'manage_categories',
      'view_analytics',
      'manage_content',
      'manage_settings',
      'view_audit_logs',
      'manage_staff'
    ],
    manager: [
      'view_dashboard',
      'manage_products',
      'manage_orders',
      'manage_coupons',
      'manage_categories',
      'view_analytics',
      'manage_content'
    ],
    staff: [
      'view_dashboard',
      'manage_orders',
      'view_products',
      'manage_content'
    ]
  };

  return permissions[role] || [];
}

module.exports = {
  adminLogin,
  adminLogout,
  getAdminProfile,
  updateAdminProfile,
  getAdminActivityLogs
};
