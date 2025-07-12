const express = require('express');
const { body, validationResult } = require('express-validator');
const admin = require('firebase-admin');
const router = express.Router();

const db = admin.firestore();

// Apply coupon
router.post('/apply', [
  body('couponCode').notEmpty().withMessage('Coupon code is required'),
  body('orderAmount').isFloat({ min: 0 }).withMessage('Order amount must be a positive number'),
  body('userId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { couponCode, orderAmount, userId } = req.body;

    // Get coupon
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();

    if (!couponDoc.exists) {
      return res.status(404).json({
        error: 'Invalid coupon code',
        message: 'Coupon not found'
      });
    }

    const coupon = couponDoc.data();

    // Check if coupon is active
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

    // Check start date
    if (coupon.startDate) {
      const startDate = coupon.startDate.toDate();
      if (now < startDate) {
        return res.status(400).json({
          error: 'Coupon not yet active',
          message: 'This coupon is not yet active'
        });
      }
    }

    // Check minimum order amount
    if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        error: 'Minimum order amount not met',
        message: `Minimum order amount of ₹${coupon.minOrderAmount} required`
      });
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        error: 'Coupon usage limit exceeded',
        message: 'This coupon has reached its usage limit'
      });
    }

    // Check user-specific usage limit
    if (userId && coupon.userUsageLimit) {
      const userUsageQuery = await db.collection('couponUsage')
        .where('couponCode', '==', couponCode.toUpperCase())
        .where('userId', '==', userId)
        .get();

      if (userUsageQuery.size >= coupon.userUsageLimit) {
        return res.status(400).json({
          error: 'User usage limit exceeded',
          message: 'You have already used this coupon the maximum number of times'
        });
      }
    }

    // Check if coupon is applicable to specific categories
    if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
      // This would require product information to validate
      // For now, we'll assume it's valid
    }

    // Calculate discount
    let discountAmount = 0;
    let freeItems = [];
    
    if (coupon.type === 'percentage') {
      discountAmount = (orderAmount * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else if (coupon.type === 'fixed') {
      discountAmount = Math.min(coupon.value, orderAmount);
    } else if (coupon.type === 'freeShipping') {
      // Free shipping discount would be calculated based on shipping cost
      discountAmount = 50; // Assuming base shipping cost
    } else if (coupon.type === 'buy2get1') {
      // Buy 2 Get 1 Free - requires cart items to calculate properly
      // For now, we'll calculate based on average item price
      // This should be enhanced to work with actual cart items
      const { cartItems } = req.body;
      if (cartItems && cartItems.length >= 2) {
        // Sort items by price (ascending) to give cheapest item free
        const sortedItems = cartItems.sort((a, b) => a.price - b.price);
        const groupsOfThree = Math.floor(cartItems.length / 3);
        const remainingItems = cartItems.length % 3;
        
        // Calculate free items (cheapest in each group of 3)
        for (let i = 0; i < groupsOfThree; i++) {
          const groupStart = i * 3;
          const groupItems = sortedItems.slice(groupStart, groupStart + 3);
          const cheapestItem = groupItems[0];
          freeItems.push(cheapestItem);
          discountAmount += cheapestItem.price * cheapestItem.quantity;
        }
        
        // Handle remaining items (if 2 items left, apply buy 2 get 1)
        if (remainingItems >= 2) {
          const remainingStart = groupsOfThree * 3;
          const remainingGroupItems = sortedItems.slice(remainingStart, remainingStart + 2);
          const cheapestRemaining = remainingGroupItems[0];
          freeItems.push(cheapestRemaining);
          discountAmount += cheapestRemaining.price * cheapestRemaining.quantity;
        }
      }
    } else if (coupon.type === 'buy3special') {
      // Buy 3 at special price - requires cart items and special price
      const { cartItems } = req.body;
      const specialPrice = coupon.specialPrice || coupon.value; // Use specialPrice field or value
      
      if (cartItems && cartItems.length >= 3) {
        const groupsOfThree = Math.floor(cartItems.length / 3);
        let originalThreeItemsPrice = 0;
        
        for (let i = 0; i < groupsOfThree; i++) {
          const groupStart = i * 3;
          const groupItems = cartItems.slice(groupStart, groupStart + 3);
          const groupTotal = groupItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          originalThreeItemsPrice += groupTotal;
        }
        
        const specialPriceTotal = groupsOfThree * specialPrice;
        discountAmount = Math.max(0, originalThreeItemsPrice - specialPriceTotal);
      }
    }

    discountAmount = Math.round(discountAmount * 100) / 100;
    const newTotal = Math.max(0, orderAmount - discountAmount);

    res.json({
      success: true,
      coupon: {
        code: couponCode.toUpperCase(),
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
        minOrderAmount: coupon.minOrderAmount,
        specialPrice: coupon.specialPrice
      },
      discount: {
        amount: discountAmount,
        percentage: orderAmount > 0 ? Math.round((discountAmount / orderAmount) * 100 * 100) / 100 : 0,
        freeItems: freeItems || []
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

// Validate coupon (without applying)
router.post('/validate', [
  body('couponCode').notEmpty().withMessage('Coupon code is required'),
  body('orderAmount').optional().isFloat({ min: 0 }),
  body('userId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { couponCode, orderAmount, userId } = req.body;

    // Get coupon
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();

    if (!couponDoc.exists) {
      return res.status(404).json({
        error: 'Invalid coupon code',
        valid: false
      });
    }

    const coupon = couponDoc.data();
    const validationResult = {
      valid: true,
      coupon: {
        code: couponCode.toUpperCase(),
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscount: coupon.maxDiscount
      },
      issues: []
    };

    // Check various conditions
    if (!coupon.isActive) {
      validationResult.valid = false;
      validationResult.issues.push('Coupon is not active');
    }

    const now = new Date();
    const expiryDate = coupon.expiryDate.toDate();
    if (now > expiryDate) {
      validationResult.valid = false;
      validationResult.issues.push('Coupon has expired');
    }

    if (coupon.startDate) {
      const startDate = coupon.startDate.toDate();
      if (now < startDate) {
        validationResult.valid = false;
        validationResult.issues.push('Coupon is not yet active');
      }
    }

    if (orderAmount && coupon.minOrderAmount && orderAmount < coupon.minOrderAmount) {
      validationResult.valid = false;
      validationResult.issues.push(`Minimum order amount of ₹${coupon.minOrderAmount} required`);
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      validationResult.valid = false;
      validationResult.issues.push('Coupon usage limit exceeded');
    }

    res.json({
      success: true,
      ...validationResult
    });

  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      error: 'Failed to validate coupon',
      message: error.message
    });
  }
});

// Get available coupons for user
router.get('/available', async (req, res) => {
  try {
    const { userId, orderAmount } = req.query;

    let query = db.collection('coupons')
      .where('isActive', '==', true)
      .where('expiryDate', '>', new Date())
      .orderBy('expiryDate')
      .orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    const availableCoupons = [];

    for (const doc of snapshot.docs) {
      const coupon = doc.data();
      let isAvailable = true;

      // Check start date
      if (coupon.startDate && new Date() < coupon.startDate.toDate()) {
        isAvailable = false;
      }

      // Check usage limits
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        isAvailable = false;
      }

      // Check minimum order amount
      if (orderAmount && coupon.minOrderAmount && parseFloat(orderAmount) < coupon.minOrderAmount) {
        isAvailable = false;
      }

      // Check user-specific usage limit
      if (userId && coupon.userUsageLimit) {
        const userUsageQuery = await db.collection('couponUsage')
          .where('couponCode', '==', doc.id)
          .where('userId', '==', userId)
          .get();

        if (userUsageQuery.size >= coupon.userUsageLimit) {
          isAvailable = false;
        }
      }

      if (isAvailable) {
        availableCoupons.push({
          code: doc.id,
          ...coupon,
          expiryDate: coupon.expiryDate.toDate(),
          startDate: coupon.startDate?.toDate(),
          createdAt: coupon.createdAt?.toDate()
        });
      }
    }

    res.json({
      success: true,
      coupons: availableCoupons,
      count: availableCoupons.length
    });

  } catch (error) {
    console.error('Get available coupons error:', error);
    res.status(500).json({
      error: 'Failed to fetch available coupons',
      message: error.message
    });
  }
});

// Record coupon usage (called after successful order)
router.post('/use', [
  body('couponCode').notEmpty().withMessage('Coupon code is required'),
  body('userId').notEmpty().withMessage('User ID is required'),
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('discountAmount').isFloat({ min: 0 }).withMessage('Discount amount is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { couponCode, userId, orderId, discountAmount } = req.body;

    // Record coupon usage
    const usageData = {
      couponCode: couponCode.toUpperCase(),
      userId,
      orderId,
      discountAmount,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('couponUsage').add(usageData);

    // Increment coupon used count
    await db.collection('coupons').doc(couponCode.toUpperCase()).update({
      usedCount: admin.firestore.FieldValue.increment(1),
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Coupon usage recorded successfully'
    });

  } catch (error) {
    console.error('Record coupon usage error:', error);
    res.status(500).json({
      error: 'Failed to record coupon usage',
      message: error.message
    });
  }
});

// Get coupon usage statistics (admin only)
router.get('/stats/:couponCode', async (req, res) => {
  try {
    const { couponCode } = req.params;

    // Get coupon details
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();
    
    if (!couponDoc.exists) {
      return res.status(404).json({
        error: 'Coupon not found'
      });
    }

    const coupon = couponDoc.data();

    // Get usage statistics
    const usageQuery = await db.collection('couponUsage')
      .where('couponCode', '==', couponCode.toUpperCase())
      .get();

    let totalDiscount = 0;
    const userUsage = {};
    const dailyUsage = {};

    usageQuery.forEach(doc => {
      const usage = doc.data();
      totalDiscount += usage.discountAmount;

      // Count per user
      userUsage[usage.userId] = (userUsage[usage.userId] || 0) + 1;

      // Count per day
      const date = usage.usedAt.toDate().toDateString();
      dailyUsage[date] = (dailyUsage[date] || 0) + 1;
    });

    const stats = {
      coupon: {
        code: couponCode.toUpperCase(),
        ...coupon,
        expiryDate: coupon.expiryDate.toDate(),
        startDate: coupon.startDate?.toDate(),
        createdAt: coupon.createdAt?.toDate()
      },
      usage: {
        totalUsage: usageQuery.size,
        totalDiscount,
        uniqueUsers: Object.keys(userUsage).length,
        averageDiscount: usageQuery.size > 0 ? totalDiscount / usageQuery.size : 0
      },
      trends: {
        dailyUsage: Object.entries(dailyUsage).map(([date, count]) => ({
          date,
          count
        }))
      }
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get coupon stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch coupon statistics',
      message: error.message
    });
  }
});

module.exports = router;

