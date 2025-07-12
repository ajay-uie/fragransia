const { auth, db, admin } = require('./firebaseConfig');

module.exports = async (req, res) => {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No valid authorization token provided'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    
    // Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile does not exist'
      });
    }

    const userProfile = userDoc.data();

    // Check if user has admin or staff privileges
    const allowedRoles = ['admin', 'staff', 'manager'];
    
    if (!allowedRoles.includes(userProfile.role)) {
      return res.status(403).json({
        error: 'Insufficient privileges',
        message: 'Access denied. Admin privileges required.',
        userRole: userProfile.role
      });
    }

    // Check if user account is active
    if (!userProfile.isActive) {
      return res.status(403).json({
        error: 'Account deactivated',
        message: 'Your admin account has been deactivated'
      });
    }

    // Log admin access
    await db.collection('admin_activity').add({
      userId,
      email: userProfile.email,
      role: userProfile.role,
      action: 'admin_access',
      endpoint: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Add user info to request object for use in subsequent middleware
    req.user = {
      uid: userId,
      email: userProfile.email,
      role: userProfile.role,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName
    };

    res.status(200).json({
      success: true,
      message: 'Admin authentication successful',
      user: {
        uid: userId,
        email: userProfile.email,
        role: userProfile.role,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName
      },
      permissions: getPermissionsByRole(userProfile.role)
    });

  } catch (error) {
    console.error('Admin auth check error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Admin session has expired. Please login again.'
      });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'Token revoked',
        message: 'Admin session has been revoked'
      });
    }

    res.status(500).json({
      error: 'Authentication check failed',
      message: error.message
    });
  }
};

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

// Middleware function for protecting admin routes
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  auth.verifyIdToken(idToken)
    .then(async (decodedToken) => {
      const userId = decodedToken.uid;
      
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      const userProfile = userDoc.data();
      const allowedRoles = ['admin', 'staff', 'manager'];
      
      if (!allowedRoles.includes(userProfile.role) || !userProfile.isActive) {
        return res.status(403).json({
          error: 'Insufficient privileges'
        });
      }

      req.user = {
        uid: userId,
        email: userProfile.email,
        role: userProfile.role,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName
      };

      next();
    })
    .catch((error) => {
      console.error('Admin auth middleware error:', error);
      res.status(401).json({
        error: 'Authentication failed',
        message: error.message
      });
    });
}

module.exports.requireAdminAuth = requireAdminAuth;
