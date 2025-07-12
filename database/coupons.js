const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create coupon
const createCoupon = async (req, res) => {
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
      code,
      type,
      value,
      minOrderValue,
      maxDiscount,
      description,
      startDate,
      expiryDate,
      usageLimit,
      perUserLimit,
      eligibleUsers,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!code || !type || !value || !expiryDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['code', 'type', 'value', 'expiryDate']
      });
    }

    // Validate coupon type
    if (!['percentage', 'fixed'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid coupon type',
        allowed: ['percentage', 'fixed']
      });
    }

    // Validate percentage value
    if (type === 'percentage' && (value < 1 || value > 100)) {
      return res.status(400).json({
        error: 'Percentage value must be between 1 and 100'
      });
    }

    // Check if coupon code already exists
    const existingCoupon = await db.collection('coupons').doc(code.toUpperCase()).get();
    if (existingCoupon.exists) {
      return res.status(409).json({
        error: 'Coupon code already exists',
        message: 'Choose a different coupon code'
      });
    }

    const couponData = {
      code: code.toUpperCase(),
      type,
      value: parseFloat(value),
      minOrderValue: minOrderValue ? parseFloat(minOrderValue) : 0,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      description: description || '',
      startDate: startDate ? new Date(startDate) : admin.firestore.FieldValue.serverTimestamp(),
      expiryDate: new Date(expiryDate),
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      perUserLimit: perUserLimit ? parseInt(perUserLimit) : null,
      eligibleUsers: eligibleUsers || [],
      isActive,
      usageCount: 0,
      usedBy: [],
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('coupons').doc(code.toUpperCase()).set(couponData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'create_coupon',
      resourceType: 'coupon',
      resourceId: code.toUpperCase(),
      details: {
        couponCode: code.toUpperCase(),
        type,
        value: parseFloat(value)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      coupon: {
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        description
      }
    });

  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({
      error: 'Failed to create coupon',
      message: error.message
    });
  }
};

// Get all coupons
const getAllCoupons = async (req, res) => {
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
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const {
      page = 1,
      limit = 20,
      isActive,
      type,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('coupons');

    // Apply filters
    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    if (type) {
      query = query.where('type', '==', type);
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'expiryDate', 'usageCount', 'value'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    const coupons = [];

    snapshot.forEach(doc => {
      const couponData = doc.data();
      coupons.push({
        id: doc.id,
        ...couponData,
        startDate: couponData.startDate?.toDate()?.toISOString(),
        expiryDate: couponData.expiryDate?.toDate()?.toISOString(),
        createdAt: couponData.createdAt?.toDate()?.toISOString(),
        updatedAt: couponData.updatedAt?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedCoupons = coupons.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      coupons: paginatedCoupons,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(coupons.length / parseInt(limit)),
        totalCoupons: coupons.length,
        hasNextPage: endIndex < coupons.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all coupons error:', error);
    res.status(500).json({
      error: 'Failed to fetch coupons',
      message: error.message
    });
  }
};

// Get coupon by code
const getCouponByCode = async (req, res) => {
  try {
    const { couponCode } = req.params;
    const db = admin.firestore();

    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();

    if (!couponDoc.exists) {
      return res.status(404).json({
        error: 'Coupon not found',
        message: 'The specified coupon code does not exist'
      });
    }

    const coupon = couponDoc.data();

    res.status(200).json({
      success: true,
      coupon: {
        id: couponDoc.id,
        ...coupon,
        startDate: coupon.startDate?.toDate()?.toISOString(),
        expiryDate: coupon.expiryDate?.toDate()?.toISOString(),
        createdAt: coupon.createdAt?.toDate()?.toISOString(),
        updatedAt: coupon.updatedAt?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    console.error('Get coupon by code error:', error);
    res.status(500).json({
      error: 'Failed to fetch coupon',
      message: error.message
    });
  }
};

// Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { couponCode } = req.params;
    
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

    // Check if coupon exists
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();
    if (!couponDoc.exists) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    const updateData = { ...req.body };

    // Convert date strings to Date objects
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.expiryDate) {
      updateData.expiryDate = new Date(updateData.expiryDate);
    }

    // Convert numeric values
    if (updateData.value) {
      updateData.value = parseFloat(updateData.value);
    }
    if (updateData.minOrderValue) {
      updateData.minOrderValue = parseFloat(updateData.minOrderValue);
    }
    if (updateData.maxDiscount) {
      updateData.maxDiscount = parseFloat(updateData.maxDiscount);
    }
    if (updateData.usageLimit) {
      updateData.usageLimit = parseInt(updateData.usageLimit);
    }
    if (updateData.perUserLimit) {
      updateData.perUserLimit = parseInt(updateData.perUserLimit);
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

    // Update coupon
    await db.collection('coupons').doc(couponCode.toUpperCase()).update(updateData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_coupon',
      resourceType: 'coupon',
      resourceId: couponCode.toUpperCase(),
      details: {
        couponCode: couponCode.toUpperCase(),
        updatedFields: Object.keys(updateData)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      couponCode: couponCode.toUpperCase()
    });

  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({
      error: 'Failed to update coupon',
      message: error.message
    });
  }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { couponCode } = req.params;
    
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
      return res.status(403).json({ error: 'Only admins can delete coupons' });
    }

    // Check if coupon exists
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();
    if (!couponDoc.exists) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    // Soft delete - deactivate instead of deleting
    await db.collection('coupons').doc(couponCode.toUpperCase()).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_coupon',
      resourceType: 'coupon',
      resourceId: couponCode.toUpperCase(),
      details: {
        couponCode: couponCode.toUpperCase()
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Coupon deactivated successfully',
      couponCode: couponCode.toUpperCase()
    });

  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({
      error: 'Failed to delete coupon',
      message: error.message
    });
  }
};

// Get coupon usage statistics
const getCouponStats = async (req, res) => {
  try {
    const { couponCode } = req.params;
    
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
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    // Get coupon details
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();
    if (!couponDoc.exists) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    const coupon = couponDoc.data();

    // Get orders that used this coupon
    const ordersQuery = await db.collection('orders')
      .where('couponCode', '==', couponCode.toUpperCase())
      .get();

    const orders = [];
    let totalDiscount = 0;
    let totalOrderValue = 0;

    ordersQuery.forEach(doc => {
      const order = doc.data();
      orders.push({
        orderId: order.orderId,
        userId: order.userId,
        discountAmount: order.pricing.discount || 0,
        orderTotal: order.pricing.total,
        createdAt: order.createdAt?.toDate()?.toISOString()
      });
      
      totalDiscount += order.pricing.discount || 0;
      totalOrderValue += order.pricing.total || 0;
    });

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        usageCount: coupon.usageCount,
        usageLimit: coupon.usageLimit
      },
      stats: {
        totalUses: orders.length,
        totalDiscount,
        totalOrderValue,
        averageDiscount: orders.length > 0 ? totalDiscount / orders.length : 0,
        averageOrderValue: orders.length > 0 ? totalOrderValue / orders.length : 0
      },
      recentOrders: orders.slice(0, 10)
    });

  } catch (error) {
    console.error('Get coupon stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch coupon statistics',
      message: error.message
    });
  }
};

module.exports = {
  createCoupon,
  getAllCoupons,
  getCouponByCode,
  updateCoupon,
  deleteCoupon,
  getCouponStats
};
