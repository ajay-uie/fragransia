const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const admin = require('firebase-admin');

// Enhanced rate limiting for different endpoints
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/api/health';
    }
  });
};

// Different rate limits for different endpoints
const rateLimiters = {
  // Strict rate limiting for auth endpoints
  auth: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts
    'Too many authentication attempts, please try again later'
  ),
  
  // Moderate rate limiting for API endpoints
  api: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests
    'Too many API requests, please try again later'
  ),
  
  // Strict rate limiting for password reset
  passwordReset: createRateLimiter(
    60 * 60 * 1000, // 1 hour
    3, // 3 attempts
    'Too many password reset attempts, please try again later'
  ),
  
  // Moderate rate limiting for order creation
  orders: createRateLimiter(
    60 * 1000, // 1 minute
    5, // 5 orders per minute
    'Too many order creation attempts, please slow down'
  )
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    // Remove potentially dangerous characters
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

// SQL injection prevention (for any raw queries)
const preventSQLInjection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|\/\*|\*\/|;|'|"|`)/g,
    /(\bOR\b|\bAND\b).*?[=<>]/gi
  ];

  const checkForSQL = (value) => {
    if (typeof value !== 'string') return false;
    return sqlPatterns.some(pattern => pattern.test(value));
  };

  const checkObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return false;
    
    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && checkForSQL(value)) {
        return true;
      } else if (typeof value === 'object' && checkObject(value)) {
        return true;
      }
    }
    return false;
  };

  // Check body and query for SQL injection patterns
  if ((req.body && checkObject(req.body)) || (req.query && checkObject(req.query))) {
    return res.status(400).json({
      error: 'Invalid input detected',
      message: 'Request contains potentially harmful content'
    });
  }

  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip} - User-Agent: ${req.get('User-Agent')}`);
  
  // Log response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });

  next();
};

// Enhanced authentication middleware
const enhancedAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header is required'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user exists and is active
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User account does not exist'
      });
    }

    const userData = userDoc.data();
    
    if (!userData.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled'
      });
    }

    // Add user info to request
    req.user = {
      ...decodedToken,
      role: userData.role,
      isActive: userData.isActive
    };

    // Update last activity
    await db.collection('users').doc(decodedToken.uid).update({
      lastActivity: admin.firestore.FieldValue.serverTimestamp()
    });

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
};

// Admin role verification
const requireAdmin = async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Admin access required'
    });
  }
  next();
};

// IP whitelist middleware (for admin endpoints)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
      console.warn(`Blocked request from unauthorized IP: ${clientIP}`);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your IP address is not authorized'
      });
    }

    next();
  };
};

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSizeBytes = typeof maxSize === 'string' 
      ? parseInt(maxSize.replace(/[^\d]/g, '')) * (maxSize.includes('mb') ? 1024 * 1024 : 1024)
      : maxSize;

    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        error: 'Request too large',
        message: `Request size exceeds ${maxSize} limit`
      });
    }

    next();
  };
};

// CSRF protection for state-changing operations
const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests and API endpoints with proper auth
  if (req.method === 'GET' || req.path.startsWith('/api/')) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!csrfToken || csrfToken !== sessionToken) {
    return res.status(403).json({
      error: 'CSRF token mismatch',
      message: 'Invalid or missing CSRF token'
    });
  }

  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
      timestamp: new Date().toISOString()
    });
  }
  next();
};

module.exports = {
  rateLimiters,
  sanitizeInput,
  preventSQLInjection,
  requestLogger,
  enhancedAuth,
  requireAdmin,
  ipWhitelist,
  requestSizeLimiter,
  csrfProtection,
  securityHeaders,
  handleValidationErrors
};

