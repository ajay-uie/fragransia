const logger = require('../utils/logger');

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user.uid : 'anonymous'
  });

  // Firebase Auth errors
  if (err.code && err.code.startsWith('auth/')) {
    const message = getFirebaseAuthErrorMessage(err.code);
    return res.status(401).json({
      success: false,
      message,
      code: err.code
    });
  }

  // Firebase Firestore errors
  if (err.code && err.code.includes('firestore/')) {
    const message = getFirestoreErrorMessage(err.code);
    return res.status(400).json({
      success: false,
      message,
      code: err.code
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: message
    });
  }

  // Duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    return res.status(400).json({
      success: false,
      message
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File size too large'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Unexpected file field'
    });
  }

  // Razorpay errors
  if (err.source === 'razorpay') {
    return res.status(400).json({
      success: false,
      message: 'Payment processing error',
      error: err.description || err.message
    });
  }

  // Rate limiting errors
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
      retryAfter: err.retryAfter
    });
  }

  // Default error
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Get user-friendly Firebase Auth error messages
 */
const getFirebaseAuthErrorMessage = (code) => {
  const errorMessages = {
    'auth/user-not-found': 'No user found with this email address',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'An account with this email already exists',
    'auth/weak-password': 'Password is too weak',
    'auth/invalid-email': 'Invalid email address',
    'auth/user-disabled': 'This account has been disabled',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later',
    'auth/operation-not-allowed': 'This operation is not allowed',
    'auth/invalid-credential': 'Invalid credentials provided',
    'auth/credential-already-in-use': 'This credential is already associated with another account',
    'auth/invalid-verification-code': 'Invalid verification code',
    'auth/invalid-verification-id': 'Invalid verification ID',
    'auth/missing-verification-code': 'Verification code is required',
    'auth/missing-verification-id': 'Verification ID is required',
    'auth/code-expired': 'Verification code has expired',
    'auth/invalid-phone-number': 'Invalid phone number',
    'auth/missing-phone-number': 'Phone number is required',
    'auth/quota-exceeded': 'SMS quota exceeded. Please try again later',
    'auth/captcha-check-failed': 'reCAPTCHA verification failed',
    'auth/invalid-app-credential': 'Invalid app credential',
    'auth/invalid-app-id': 'Invalid app ID',
    'auth/network-request-failed': 'Network error. Please check your connection',
    'auth/requires-recent-login': 'This operation requires recent authentication. Please login again',
    'auth/provider-already-linked': 'This account is already linked to another provider',
    'auth/no-such-provider': 'No such provider is linked to this account',
    'auth/invalid-user-token': 'Invalid user token',
    'auth/user-token-expired': 'User token has expired',
    'auth/null-user': 'No user is currently signed in',
    'auth/invalid-api-key': 'Invalid API key',
    'auth/app-deleted': 'This app has been deleted',
    'auth/expired-action-code': 'Action code has expired',
    'auth/invalid-action-code': 'Invalid action code',
    'auth/invalid-message-payload': 'Invalid message payload',
    'auth/invalid-sender': 'Invalid sender',
    'auth/invalid-recipient-email': 'Invalid recipient email',
    'auth/missing-android-pkg-name': 'Missing Android package name',
    'auth/missing-continue-uri': 'Missing continue URI',
    'auth/missing-ios-bundle-id': 'Missing iOS bundle ID',
    'auth/invalid-continue-uri': 'Invalid continue URI',
    'auth/unauthorized-continue-uri': 'Unauthorized continue URI'
  };

  return errorMessages[code] || 'Authentication error occurred';
};

/**
 * Get user-friendly Firestore error messages
 */
const getFirestoreErrorMessage = (code) => {
  const errorMessages = {
    'firestore/permission-denied': 'You do not have permission to perform this operation',
    'firestore/not-found': 'The requested document was not found',
    'firestore/already-exists': 'The document already exists',
    'firestore/resource-exhausted': 'Resource quota exceeded. Please try again later',
    'firestore/failed-precondition': 'Operation failed due to precondition',
    'firestore/aborted': 'Operation was aborted due to conflict',
    'firestore/out-of-range': 'Operation was attempted past the valid range',
    'firestore/unimplemented': 'Operation is not implemented',
    'firestore/internal': 'Internal server error',
    'firestore/unavailable': 'Service is currently unavailable',
    'firestore/data-loss': 'Unrecoverable data loss or corruption',
    'firestore/unauthenticated': 'Authentication is required',
    'firestore/invalid-argument': 'Invalid argument provided',
    'firestore/deadline-exceeded': 'Operation deadline exceeded',
    'firestore/cancelled': 'Operation was cancelled'
  };

  return errorMessages[code] || 'Database error occurred';
};

/**
 * Async error wrapper to catch async errors in route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
};

/**
 * Development error handler with stack trace
 */
const developmentErrorHandler = (err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
    stack: err.stack,
    error: err
  });
};

/**
 * Production error handler without stack trace
 */
const productionErrorHandler = (err, req, res, next) => {
  // Don't leak error details in production
  if (err.statusCode === 500) {
    res.status(500).json({
      success: false,
      message: 'Something went wrong'
    });
  } else {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  developmentErrorHandler,
  productionErrorHandler,
  getFirebaseAuthErrorMessage,
  getFirestoreErrorMessage
};
