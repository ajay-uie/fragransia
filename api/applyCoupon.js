const express = require('express');
const { auth, db, admin } = require('../auth/firebaseConfig');
const { validateInput } = require('../utils/validateInput');
const couponManager = require('../database/couponManager');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { couponCode, orderAmount, cartItems = [] } = req.body;

    // Validate input
    if (!couponCode || !orderAmount) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['couponCode', 'orderAmount']
      });
    }

    if (orderAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid order amount',
        message: 'Order amount must be greater than 0'
      });
    }

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const authenticatedUserId = decodedToken.uid;

    // Validate coupon using coupon manager
    const couponValidation = await couponManager.validateCoupon(
      couponCode,
      authenticatedUserId,
      orderAmount,
      cartItems
    );

    if (!couponValidation.valid) {
      return res.status(400).json({
        error: 'Invalid coupon',
        message: couponValidation.error
      });
    }

    const coupon = couponValidation.coupon;
    const discountAmount = coupon.discountAmount;
    const newTotal = orderAmount - discountAmount;

    // Calculate savings percentage
    const savingsPercentage = Math.round((discountAmount / orderAmount) * 100 * 100) / 100;

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description
      },
      discount: {
        amount: discountAmount,
        percentage: savingsPercentage,
        savings: `You save ₹${discountAmount}`
      },
      orderSummary: {
        originalAmount: orderAmount,
        discountAmount,
        finalAmount: newTotal,
        totalSavings: discountAmount
      },
      message: `Coupon applied successfully! You saved ₹${discountAmount}`
    });

  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({
      error: 'Failed to apply coupon',
      message: error.message
    });
  }
});

// Remove coupon endpoint
router.delete('/', async (req, res) => {
  try {
    const { orderAmount } = req.body;

    if (!orderAmount) {
      return res.status(400).json({
        error: 'Missing order amount'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coupon removed successfully',
      orderSummary: {
        originalAmount: orderAmount,
        discountAmount: 0,
        finalAmount: orderAmount
      }
    });

  } catch (error) {
    console.error('Remove coupon error:', error);
    res.status(500).json({
      error: 'Failed to remove coupon',
      message: error.message
    });
  }
});

// Get available coupons for user
router.get('/available', async (req, res) => {
  try {
    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const { orderAmount = 0 } = req.query;

    // Get all active coupons
    const couponsResult = await couponManager.getCoupons(false);
    
    if (!couponsResult.success) {
      return res.status(500).json({
        error: 'Failed to fetch coupons'
      });
    }

    const availableCoupons = [];
    const now = new Date();

    for (const coupon of couponsResult.coupons) {
      // Check if coupon is still valid
      const expiryDate = new Date(coupon.expiryDate);
      if (expiryDate < now) continue;

      // Check if user is eligible
      if (coupon.userRestrictions.specificUsers.length > 0 && 
          !coupon.userRestrictions.specificUsers.includes(userId)) {
        continue;
      }

      if (coupon.userRestrictions.excludeUsers.includes(userId)) {
        continue;
      }

      // Check if user has already used this coupon
      const userOrdersQuery = await db.collection('orders')
        .where('userId', '==', userId)
        .where('coupon.code', '==', coupon.code)
        .limit(1)
        .get();

      if (!userOrdersQuery.empty) continue;

      // Check if it's for first-time users only
      if (coupon.userRestrictions.firstTimeOnly) {
        const userOrdersQuery = await db.collection('orders')
          .where('userId', '==', userId)
          .where('status', '!=', 'cancelled')
          .limit(1)
          .get();

        if (!userOrdersQuery.empty) continue;
      }

      // Calculate potential discount
      let potentialDiscount = 0;
      if (orderAmount > 0 && orderAmount >= coupon.minOrderValue) {
        if (coupon.type === 'percentage') {
          potentialDiscount = (orderAmount * coupon.value) / 100;
          if (coupon.maxDiscount) {
            potentialDiscount = Math.min(potentialDiscount, coupon.maxDiscount);
          }
        } else {
          potentialDiscount = coupon.value;
        }
      }

      availableCoupons.push({
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        expiryDate: coupon.expiryDate,
        potentialDiscount: Math.round(potentialDiscount * 100) / 100,
        applicable: orderAmount >= coupon.minOrderValue
      });
    }

    // Sort by potential discount (highest first)
    availableCoupons.sort((a, b) => b.potentialDiscount - a.potentialDiscount);

    res.status(200).json({
      success: true,
      coupons: availableCoupons,
      totalCoupons: availableCoupons.length
    });

  } catch (error) {
    console.error('Get available coupons error:', error);
    res.status(500).json({
      error: 'Failed to fetch available coupons',
      message: error.message
    });
  }
});

module.exports = router;
