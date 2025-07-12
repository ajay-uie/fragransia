const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ 
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Rate limiting for Firebase Functions
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session management middleware
app.use(async (req, res, next) => {
  try {
    req.sessionInfo = {
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    next();
  }
});

// Import route modules
const ordersRouter = require('./routes/orders');
const reviewsRouter = require('./routes/reviews');
const wishlistRouter = require('./routes/wishlist');
const cartRouter = require('./routes/cart');

// API Routes - E-commerce Core
app.use('/api/orders', ordersRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/cart', cartRouter);

// Orders API
app.post('/api/orders/create', async (req, res) => {
  try {
    const { items, userDetails, shippingAddress, couponCode, giftWrap } = req.body;
    
    if (!items || !userDetails || !shippingAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['items', 'userDetails', 'shippingAddress']
      });
    }

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Calculate order total and validate items
    let orderTotal = 0;
    const processedItems = [];

    for (const item of items) {
      const productDoc = await db.collection('products').doc(item.productId).get();
      
      if (!productDoc.exists) {
        return res.status(404).json({ 
          error: 'Product not found', 
          productId: item.productId 
        });
      }

      const product = productDoc.data();
      
      // Check inventory
      if (product.inventory < item.quantity) {
        return res.status(400).json({
          error: 'Insufficient inventory',
          productId: item.productId,
          available: product.inventory,
          requested: item.quantity
        });
      }

      const itemTotal = product.price * item.quantity;
      orderTotal += itemTotal;

      processedItems.push({
        productId: item.productId,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        total: itemTotal
      });
    }

    // Generate order ID
    const orderId = 'ORDER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Create Razorpay order
    const razorpayUtils = require('./logic/razorpayInstance');
    const razorpayOrder = await razorpayUtils.createOrder({
      amount: orderTotal,
      currency: 'INR',
      receipt: orderId
    });

    if (!razorpayOrder.success) {
      return res.status(500).json({
        error: 'Failed to create payment order',
        message: razorpayOrder.error
      });
    }

    // Create order document
    const orderData = {
      orderId,
      userId,
      items: processedItems,
      userDetails,
      shippingAddress,
      totalAmount: orderTotal,
      couponCode: couponCode || null,
      giftWrap: giftWrap || null,
      razorpayOrderId: razorpayOrder.order.id,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('orders').doc(orderId).set(orderData);

    res.status(201).json({
      success: true,
      order: {
        orderId,
        razorpayOrderId: razorpayOrder.order.id,
        amount: orderTotal,
        currency: 'INR'
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      error: 'Failed to create order',
      message: error.message
    });
  }
});

// Payment verification API
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const crypto = require('crypto');
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        error: 'Payment verification failed',
        message: 'Invalid signature'
      });
    }

    const db = admin.firestore();
    
    // Update order status
    await db.collection('orders').doc(orderId).update({
      paymentStatus: 'completed',
      status: 'confirmed',
      razorpayPaymentId: razorpay_payment_id,
      paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      error: 'Payment verification failed',
      message: error.message
    });
  }
});

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const db = admin.firestore();
    const { limit = 20, category, isActive, isFeatured, minPrice, maxPrice, search } = req.query;
    
    let query = db.collection('products');
    
    if (category) {
      query = query.where('category', '==', category);
    }
    
    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }
    
    if (isFeatured !== undefined) {
      query = query.where('isFeatured', '==', isFeatured === 'true');
    }
    
    query = query.orderBy('createdAt', 'desc').limit(parseInt(limit));
    
    const snapshot = await query.get();
    let products = [];
    
    snapshot.forEach(doc => {
      const productData = doc.data();
      
      if (minPrice && productData.price < parseFloat(minPrice)) return;
      if (maxPrice && productData.price > parseFloat(maxPrice)) return;
      
      if (search) {
        const searchTerm = search.toLowerCase();
        const nameMatch = productData.name.toLowerCase().includes(searchTerm);
        const descMatch = productData.description?.toLowerCase().includes(searchTerm);
        if (!nameMatch && !descMatch) return;
      }
      
      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      });
    });

    res.json({
      success: true,
      products,
      count: products.length
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Categories API
app.get('/api/categories', async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('categories')
      .where('isActive', '==', true)
      .orderBy('name')
      .get();
      
    const categories = [];
    snapshot.forEach(doc => {
      categories.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      });
    });

    res.json({ 
      success: true, 
      categories,
      count: categories.length
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Coupon application API
app.post('/api/coupons/apply', async (req, res) => {
  try {
    const { couponCode, orderAmount, userId } = req.body;

    if (!couponCode || !orderAmount) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['couponCode', 'orderAmount']
      });
    }

    const db = admin.firestore();
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();

    if (!couponDoc.exists) {
      return res.status(404).json({
        error: 'Invalid coupon code',
        message: 'Coupon not found'
      });
    }

    const coupon = couponDoc.data();

    if (!coupon.isActive) {
      return res.status(400).json({
        error: 'Coupon inactive',
        message: 'This coupon is no longer active'
      });
    }

    // Check expiry date
    const now = new Date();
    const expiryDate = coupon.expiryDate.toDate();
    if (now > expiryDate) {
      return res.status(400).json({
        error: 'Coupon expired',
        message: 'This coupon has expired'
      });
    }

    // Calculate discount
    let discountAmount = 0;
    
    if (coupon.type === 'percentage') {
      discountAmount = (orderAmount * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else if (coupon.type === 'fixed') {
      discountAmount = Math.min(coupon.value, orderAmount);
    }

    discountAmount = Math.round(discountAmount * 100) / 100;
    const newTotal = orderAmount - discountAmount;

    res.json({
      success: true,
      coupon: {
        code: couponCode.toUpperCase(),
        type: coupon.type,
        value: coupon.value,
        description: coupon.description
      },
      discount: {
        amount: discountAmount,
        percentage: Math.round((discountAmount / orderAmount) * 100 * 100) / 100
      },
      orderSummary: {
        originalAmount: orderAmount,
        discountAmount,
        finalAmount: newTotal
      }
    });

  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({
      error: 'Failed to apply coupon',
      message: error.message
    });
  }
});

// Delivery estimation API
app.post('/api/delivery/estimate', async (req, res) => {
  try {
    const { pincode, items } = req.body;
    
    if (!pincode) {
      return res.status(400).json({
        error: 'Pincode is required for delivery estimation'
      });
    }

    // Basic delivery estimation logic
    const estimatedDays = pincode.startsWith('1') || pincode.startsWith('2') ? 
      '1-2 business days' : '3-5 business days';

    res.json({
      success: true,
      pincode,
      estimatedDelivery: estimatedDays,
      shippingCost: 50, // Basic shipping cost
      freeShippingThreshold: 500
    });
  } catch (error) {
    console.error('Delivery estimation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User authentication APIs
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber } = req.body;
    
    if (!email || !password || !firstName) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'password', 'firstName']
      });
    }

    // Create Firebase user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`.trim()
    });

    // Create user profile in Firestore
    const db = admin.firestore();
    await db.collection('users').doc(userRecord.uid).set({
      email,
      firstName,
      lastName,
      phoneNumber: phoneNumber || '',
      role: 'customer',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: userRecord.uid
    });

  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const db = admin.firestore();
    await db.collection('system').doc('health').get();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'Fragransia Backend API',
      version: '1.0.0',
      environment: 'firebase'
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'Fragransia E-commerce API',
    version: '1.0.0',
    environment: 'Firebase Functions',
    endpoints: {
      'GET /api/products': 'Get products list with filters',
      'GET /api/categories': 'Get product categories',
      'POST /api/orders/create': 'Create new order',
      'POST /api/payments/verify': 'Verify payment',
      'POST /api/coupons/apply': 'Apply coupon code',
      'POST /api/delivery/estimate': 'Estimate delivery',
      'POST /api/auth/register': 'Register new user',
      'GET /api/health': 'Health check'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);

// Firebase Firestore Triggers (commented out for development)
// Uncomment when deploying to Firebase Functions
/*
exports.processOrder = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    const orderData = snap.data();
    const orderId = context.params.orderId;
    
    console.log(`Processing new order: ${orderId}`);
    
    try {
      // Send confirmation email
      const sendEmail = require('./utils/sendEmail');
      await sendEmail.sendOrderConfirmation(orderData);
      
      // Send WhatsApp notification
      const whatsappBot = require('./utils/whatsappBot');
      await whatsappBot.sendOrderNotification(orderData);
    } catch (error) {
      console.error('Order processing error:', error);
    }
    
    return null;
  });
*/

exports.updateInventory = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Handle inventory updates when order status changes
    if (before.status !== after.status && after.status === 'confirmed') {
      try {
        const db = admin.firestore();
        const batch = db.batch();
        
        for (const item of after.items) {
          const productRef = db.collection('products').doc(item.productId);
          batch.update(productRef, {
            inventory: admin.firestore.FieldValue.increment(-item.quantity)
          });
        }
        
        await batch.commit();
        console.log(`Inventory updated for order: ${context.params.orderId}`);
      } catch (error) {
        console.error('Inventory update error:', error);
      }
    }
    
    return null;
  });
