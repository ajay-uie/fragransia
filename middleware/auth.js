const { auth, db, admin } = require("../auth/firebaseConfig");

/**
 * Authentication middleware to verify Firebase JWT tokens
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided or invalid format."
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Token is required."
      });
    }

    let decodedToken;

    // --- START MOCK TOKEN HANDLING ---
    if (token.startsWith("mock-custom-token-")) {
      const uid = token.replace("mock-custom-token-", "");
      decodedToken = { uid: uid, email: "testuser@example.com", email_verified: true }; // Mock decoded token
    } else {
    // --- END MOCK TOKEN HANDLING ---

      // Verify token with Firebase Admin
      decodedToken = await admin.auth().verifyIdToken(token);
    }
    
    // Get user data from Firestore
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        message: "User not found in database."
      });
    }

    const userData = userDoc.data();

    // Check if user is active
    if (userData.isActive === false) {
      return res.status(401).json({
        success: false,
        message: "Account has been deactivated. Please contact support."
      });
    }

    // Attach user data to request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      ...userData,
      firebaseToken: decodedToken
    };

    next();

  } catch (error) {
    console.error("Auth middleware error:", error);
    
    // Handle specific Firebase Auth errors
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        success: false,
        message: "Token has expired. Please login again.",
        code: "TOKEN_EXPIRED"
      });
    }
    
    if (error.code === "auth/id-token-revoked") {
      return res.status(401).json({
        success: false,
        message: "Token has been revoked. Please login again.",
        code: "TOKEN_REVOKED"
      });
    }
    
    if (error.code === "auth/invalid-id-token") {
      return res.status(401).json({
        success: false,
        message: "Invalid token provided.",
        code: "INVALID_TOKEN"
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
      code: "AUTH_ERROR"
    });
  }
};

/**
 * Admin role middleware - requires admin role
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required."
    });
  }

  next();
};

/**
 * Staff role middleware - requires admin or staff role
 */
const staffMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  if (!["admin", "staff"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Staff access required."
    });
  }

  next();
};

/**
 * Optional auth middleware - doesn"t fail if no token provided
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token provided, continue without user data
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      req.user = null;
      return next();
    }

    let decodedToken;
    // --- START MOCK TOKEN HANDLING ---
    if (token.startsWith("mock-custom-token-")) {
      const uid = token.replace("mock-custom-token-", "");
      decodedToken = { uid: uid, email: "testuser@example.com", email_verified: true }; // Mock decoded token
    } else {
    // --- END MOCK TOKEN HANDLING ---
      // Verify token
      decodedToken = await admin.auth().verifyIdToken(token);
    }
    
    // Get user data
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        ...userData,
        firebaseToken: decodedToken
      };
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    // If token verification fails, continue without user data
    req.user = null;
    next();
  }
};

/**
 * Rate limiting middleware for sensitive operations
 */
const sensitiveOperationLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();

  return (req, res, next) => {
    const key = req.ip + (req.user ? req.user.uid : "");
    const now = Date.now();
    
    // Clean old entries
    for (const [k, v] of attempts.entries()) {
      if (now - v.firstAttempt > windowMs) {
        attempts.delete(k);
      }
    }

    const userAttempts = attempts.get(key);
    
    if (!userAttempts) {
      attempts.set(key, { count: 1, firstAttempt: now });
      return next();
    }

    if (userAttempts.count >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please try again later.",
        retryAfter: Math.ceil((userAttempts.firstAttempt + windowMs - now) / 1000)
      });
    }

    userAttempts.count++;
    next();
  };
};

/**
 * Middleware to check if user owns the resource
 */
const ownershipMiddleware = (resourceUserIdField = "userId") => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    // Admin can access any resource
    if (req.user.role === "admin") {
      return next();
    }

    // Check if user owns the resource
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (resourceUserId && resourceUserId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own resources."
      });
    }

    next();
  };
};

/**
 * Middleware to validate API key for webhook endpoints
 */
const webhookAuthMiddleware = (req, res, next) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;
  
  if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
    return res.status(401).json({
      success: false,
      message: "Invalid API key."
    });
  }

  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  staffMiddleware,
  optionalAuthMiddleware,
  sensitiveOperationLimit,
  ownershipMiddleware,
  webhookAuthMiddleware
};
