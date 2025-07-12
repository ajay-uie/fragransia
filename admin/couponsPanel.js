const express = require('express');
const {
  createCoupon,
  getAllCoupons,
  getCouponByCode,
  updateCoupon,
  deleteCoupon,
  getCouponStats
} = require('../database/coupons');
const { requireAdminAuth } = require('../auth/adminAuthCheck');

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get all coupons
router.get('/', getAllCoupons);

// Get coupon by code
router.get('/:couponCode', getCouponByCode);

// Create new coupon
router.post('/', createCoupon);

// Update coupon
router.put('/:couponCode', updateCoupon);

// Delete coupon
router.delete('/:couponCode', deleteCoupon);

// Get coupon statistics
router.get('/:couponCode/stats', getCouponStats);

// Bulk coupon operations
router.patch('/bulk', async (req, res) => {
  try {
    const { couponCodes, action } = req.body;

    if (!couponCodes || !Array.isArray(couponCodes) || couponCodes.length === 0) {
      return res.status(400).json({
        error: 'Invalid coupon codes',
        message: 'Coupon codes array is required'
      });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();
    const batch = db.batch();
    const userId = req.user.uid;

    switch (action) {
      case 'activate':
        couponCodes.forEach(couponCode => {
          const couponRef = db.collection('coupons').doc(couponCode.toUpperCase());
          batch.update(couponRef, {
            isActive: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      case 'deactivate':
        couponCodes.forEach(couponCode => {
          const couponRef = db.collection('coupons').doc(couponCode.toUpperCase());
          batch.update(couponRef, {
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Action must be activate or deactivate'
        });
    }

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: `bulk_${action}_coupons`,
      resourceType: 'coupon',
      details: {
        couponCodes,
        count: couponCodes.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      affectedCoupons: couponCodes.length
    });

  } catch (error) {
    console.error('Bulk coupon operation error:', error);
    res.status(500).json({
      error: 'Failed to perform bulk operation',
      message: error.message
    });
  }
});

// Generate coupon code
router.post('/generate-code', async (req, res) => {
  try {
    const { prefix = 'FRAG', length = 8 } = req.body;
    
    const generateRandomCode = (prefix, length) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = prefix;
      const remainingLength = Math.max(0, length - prefix.length);
      
      for (let i = 0; i < remainingLength; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      return result;
    };

    const admin = require('firebase-admin');
    const db = admin.firestore();

    let couponCode;
    let attempts = 0;
    const maxAttempts = 10;

    // Try to generate a unique code
    do {
      couponCode = generateRandomCode(prefix, length);
      const existingCoupon = await db.collection('coupons').doc(couponCode).get();
      
      if (!existingCoupon.exists) {
        break;
      }
      
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        error: 'Failed to generate unique coupon code',
        message: 'Try with different prefix or length'
      });
    }

    res.status(200).json({
      success: true,
      couponCode
    });

  } catch (error) {
    console.error('Generate coupon code error:', error);
    res.status(500).json({
      error: 'Failed to generate coupon code',
      message: error.message
    });
  }
});

// Get coupon usage report
router.get('/report/usage', async (req, res) => {
  try {
    const { startDate, endDate, limit = 50 } = req.query;

    const admin = require('firebase-admin');
    const db = admin.firestore();

    let ordersQuery = db.collection('orders');

    // Apply date filters
    if (startDate) {
      ordersQuery = ordersQuery.where('createdAt', '>=', new Date(startDate));
    }
    if (endDate) {
      ordersQuery = ordersQuery.where('createdAt', '<=', new Date(endDate));
    }

    // Get orders with coupons
    ordersQuery = ordersQuery.where('couponCode', '!=', null);
    
    const ordersSnapshot = await ordersQuery.get();
    
    const couponUsage = {};
    let totalDiscount = 0;
    let totalOrderValue = 0;

    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const couponCode = order.couponCode;
      
      if (couponCode) {
        if (!couponUsage[couponCode]) {
          couponUsage[couponCode] = {
            code: couponCode,
            usageCount: 0,
            totalDiscount: 0,
            totalOrderValue: 0,
            orders: []
          };
        }
        
        const discount = order.pricing.discount || 0;
        const orderValue = order.pricing.total || 0;
        
        couponUsage[couponCode].usageCount++;
        couponUsage[couponCode].totalDiscount += discount;
        couponUsage[couponCode].totalOrderValue += orderValue;
        couponUsage[couponCode].orders.push({
          orderId: order.orderId,
          discount,
          orderValue,
          createdAt: order.createdAt?.toDate()?.toISOString()
        });
        
        totalDiscount += discount;
        totalOrderValue += orderValue;
      }
    });

    // Convert to array and sort by usage
    const usageReport = Object.values(couponUsage)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      report: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        summary: {
          totalCouponsUsed: Object.keys(couponUsage).length,
          totalUsageCount: ordersSnapshot.size,
          totalDiscount,
          totalOrderValue,
          averageDiscount: ordersSnapshot.size > 0 ? totalDiscount / ordersSnapshot.size : 0
        },
        coupons: usageReport
      }
    });

  } catch (error) {
    console.error('Get coupon usage report error:', error);
    res.status(500).json({
      error: 'Failed to generate usage report',
      message: error.message
    });
  }
});

// Validate coupon for admin preview
router.post('/validate', async (req, res) => {
  try {
    const { couponCode, orderAmount = 1000 } = req.body;

    if (!couponCode) {
      return res.status(400).json({
        error: 'Coupon code required'
      });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();

    // Get coupon details
    const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();

    if (!couponDoc.exists) {
      return res.status(404).json({
        error: 'Coupon not found'
      });
    }

    const coupon = couponDoc.data();

    // Validate coupon
    const validation = {
      isValid: true,
      errors: [],
      discount: 0
    };

    // Check if coupon is active
    if (!coupon.isActive) {
      validation.isValid = false;
      validation.errors.push('Coupon is inactive');
    }

    // Check expiry date
    const now = new Date();
    const expiryDate = coupon.expiryDate.toDate();
    
    if (now > expiryDate) {
      validation.isValid = false;
      validation.errors.push('Coupon has expired');
    }

    // Check start date
    if (coupon.startDate) {
      const startDate = coupon.startDate.toDate();
      if (now < startDate) {
        validation.isValid = false;
        validation.errors.push('Coupon is not yet active');
      }
    }

    // Check minimum order value
    if (orderAmount < coupon.minOrderValue) {
      validation.isValid = false;
      validation.errors.push(`Minimum order value of ₹${coupon.minOrderValue} required`);
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      validation.isValid = false;
      validation.errors.push('Coupon usage limit exceeded');
    }

    // Calculate discount if valid
    if (validation.isValid) {
      if (coupon.type === 'percentage') {
        validation.discount = (orderAmount * coupon.value) / 100;
        
        if (coupon.maxDiscount) {
          validation.discount = Math.min(validation.discount, coupon.maxDiscount);
        }
      } else if (coupon.type === 'fixed') {
        validation.discount = Math.min(coupon.value, orderAmount);
      }
      
      validation.discount = Math.round(validation.discount * 100) / 100;
    }

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description
      },
      validation,
      testOrder: {
        originalAmount: orderAmount,
        discountAmount: validation.discount,
        finalAmount: orderAmount - validation.discount
      }
    });

  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      error: 'Failed to validate coupon',
      message: error.message
    });
  }
});

module.exports = router;
