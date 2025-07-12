const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: level(),
    format: format
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  
  // Combined log file
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports,
  exitOnError: false
});

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user.uid : 'anonymous'
  };

  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

// Add error logging helper
logger.logError = (error, req = null, additionalInfo = {}) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...additionalInfo
  };

  if (req) {
    errorData.request = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user.uid : 'anonymous'
    };
  }

  logger.error('Application Error', errorData);
};

// Add business event logging
logger.logBusinessEvent = (event, data = {}) => {
  logger.info('Business Event', {
    event,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add security event logging
logger.logSecurityEvent = (event, req, additionalInfo = {}) => {
  const securityData = {
    event,
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user.uid : 'anonymous',
    url: req.url,
    method: req.method,
    ...additionalInfo
  };

  logger.warn('Security Event', securityData);
};

// Add performance logging
logger.logPerformance = (operation, duration, additionalInfo = {}) => {
  logger.info('Performance', {
    operation,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...additionalInfo
  });
};

// Add database operation logging
logger.logDatabaseOperation = (operation, collection, documentId = null, duration = null) => {
  const logData = {
    operation,
    collection,
    timestamp: new Date().toISOString()
  };

  if (documentId) {
    logData.documentId = documentId;
  }

  if (duration) {
    logData.duration = `${duration}ms`;
  }

  logger.debug('Database Operation', logData);
};

// Add payment logging
logger.logPayment = (event, paymentData) => {
  const sanitizedData = {
    ...paymentData,
    // Remove sensitive information
    cardNumber: paymentData.cardNumber ? '****' + paymentData.cardNumber.slice(-4) : undefined,
    cvv: undefined,
    password: undefined
  };

  logger.info('Payment Event', {
    event,
    timestamp: new Date().toISOString(),
    ...sanitizedData
  });
};

// Add email logging
logger.logEmail = (event, emailData) => {
  logger.info('Email Event', {
    event,
    timestamp: new Date().toISOString(),
    to: emailData.to,
    subject: emailData.subject,
    template: emailData.template,
    success: emailData.success
  });
};

// Add WhatsApp logging
logger.logWhatsApp = (event, whatsappData) => {
  logger.info('WhatsApp Event', {
    event,
    timestamp: new Date().toISOString(),
    to: whatsappData.to,
    messageType: whatsappData.messageType,
    success: whatsappData.success
  });
};

// Add admin action logging
logger.logAdminAction = (action, adminUserId, targetResource, changes = {}) => {
  logger.info('Admin Action', {
    action,
    adminUserId,
    targetResource,
    changes,
    timestamp: new Date().toISOString()
  });
};

// Add inventory logging
logger.logInventory = (event, productId, quantity, reason = '') => {
  logger.info('Inventory Event', {
    event,
    productId,
    quantity,
    reason,
    timestamp: new Date().toISOString()
  });
};

// Add order logging
logger.logOrder = (event, orderData) => {
  logger.info('Order Event', {
    event,
    orderId: orderData.orderId || orderData.id,
    userId: orderData.userId,
    amount: orderData.amount || orderData.total,
    status: orderData.status,
    timestamp: new Date().toISOString()
  });
};

// Add user activity logging
logger.logUserActivity = (activity, userId, additionalInfo = {}) => {
  logger.info('User Activity', {
    activity,
    userId,
    timestamp: new Date().toISOString(),
    ...additionalInfo
  });
};

// Add API usage logging
logger.logApiUsage = (endpoint, method, userId, responseTime, statusCode) => {
  logger.info('API Usage', {
    endpoint,
    method,
    userId: userId || 'anonymous',
    responseTime: `${responseTime}ms`,
    statusCode,
    timestamp: new Date().toISOString()
  });
};

// Add system health logging
logger.logSystemHealth = (metric, value, unit = '') => {
  logger.info('System Health', {
    metric,
    value,
    unit,
    timestamp: new Date().toISOString()
  });
};

// Export the logger
module.exports = logger;
