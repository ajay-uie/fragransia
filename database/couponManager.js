const { auth, db, admin } = require('../auth/firebaseConfig');
const { generateID } = require('../utils/generateID');

class CouponManager {
  constructor() {
    this.db = db;
    this.auth = auth;
  }

  // Create new coupon
  async createCoupon(couponData, userId) {
    try {
      const {
        code,
        type, // 'percentage' or 'fixed'
        value,
        minOrderValue,
        maxDiscount,
        maxUsage,
        expiryDate,
        isActive = true,
        description,
        applicableCategories,
        applicableProducts,
        userRestrictions
      } = couponData;

      // Validate required fields
      if (!code || !type || !value) {
        throw new Error('Code, type, and value are required');
      }

      if (!['percentage', 'fixed'].includes(type)) {
        throw new Error('Type must be either "percentage" or "fixed"');
      }

      if (type === 'percentage' && (value < 0 || value > 100)) {
        throw new Error('Percentage value must be between 0 and 100');
      }

      // Check if coupon code already exists
      const existingCoupon = await this.db.collection('coupons').doc(code.toUpperCase()).get();
      if (existingCoupon.exists) {
        throw new Error('Coupon code already exists');
      }

      // Create coupon object
      const coupon = {
        id: code.toUpperCase(),
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        minOrderValue: minOrderValue ? parseFloat(minOrderValue) : 0,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        maxUsage: maxUsage ? parseInt(maxUsage) : null,
        usageCount: 0,
        expiryDate: new Date(expiryDate),
        isActive,
        description: description || '',
        applicableCategories: applicableCategories || [],
        applicableProducts: applicableProducts || [],
        userRestrictions: {
          firstTimeOnly: userRestrictions?.firstTimeOnly || false,
          specificUsers: userRestrictions?.specificUsers || [],
          excludeUsers: userRestrictions?.excludeUsers || []
        },
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Save coupon
      await this.db.collection('coupons').doc(code.toUpperCase()).set(coupon);

      // Log admin activity
      await this.db.collection('admin_activity').add({
        userId,
        action: 'create_coupon',
        resourceType: 'coupon',
        resourceId: code.toUpperCase(),
        details: {
          couponCode: code.toUpperCase(),
          type,
          value
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        couponId: code.toUpperCase(),
        coupon
      };

    } catch (error) {
      console.error('Create coupon error:', error);
      throw error;
    }
  }

  // Validate coupon
  async validateCoupon(couponCode, userId, orderValue, cartItems = []) {
    try {
      const couponDoc = await this.db.collection('coupons').doc(couponCode.toUpperCase()).get();
      
      if (!couponDoc.exists) {
        return {
          valid: false,
          error: 'Coupon code not found'
        };
      }

      const coupon = couponDoc.data();

      // Check if coupon is active
      if (!coupon.isActive) {
        return {
          valid: false,
          error: 'Coupon is not active'
        };
      }

      // Check expiry date
      const now = new Date();
      const expiryDate = coupon.expiryDate.toDate();
      
      if (now > expiryDate) {
        return {
          valid: false,
          error: 'Coupon has expired'
        };
      }

      // Check usage limit
      if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
        return {
          valid: false,
          error: 'Coupon usage limit reached'
        };
      }

      // Check minimum order value
      if (coupon.minOrderValue && orderValue < coupon.minOrderValue) {
        return {
          valid: false,
          error: `Minimum order value of ₹${coupon.minOrderValue} required`
        };
      }

      // Check user restrictions
      if (userId) {
        // Check if user is excluded
        if (coupon.userRestrictions.excludeUsers.includes(userId)) {
          return {
            valid: false,
            error: 'Coupon not applicable for your account'
          };
        }

        // Check if coupon is for specific users only
        if (coupon.userRestrictions.specificUsers.length > 0 && 
            !coupon.userRestrictions.specificUsers.includes(userId)) {
          return {
            valid: false,
            error: 'Coupon not applicable for your account'
          };
        }

        // Check if it's for first-time users only
        if (coupon.userRestrictions.firstTimeOnly) {
          const userOrdersQuery = await this.db.collection('orders')
            .where('userId', '==', userId)
            .where('status', '!=', 'cancelled')
            .limit(1)
            .get();

          if (!userOrdersQuery.empty) {
            return {
              valid: false,
              error: 'Coupon is only for first-time customers'
            };
          }
        }

        // Check if user has already used this coupon
        const userCouponUsage = await this.db.collection('orders')
          .where('userId', '==', userId)
          .where('coupon.code', '==', couponCode.toUpperCase())
          .limit(1)
          .get();

        if (!userCouponUsage.empty) {
          return {
            valid: false,
            error: 'You have already used this coupon'
          };
        }
      }

      // Check category restrictions
      if (coupon.applicableCategories.length > 0 && cartItems.length > 0) {
        const hasApplicableItems = cartItems.some(item => 
          coupon.applicableCategories.includes(item.category)
        );

        if (!hasApplicableItems) {
          return {
            valid: false,
            error: 'Coupon not applicable for items in your cart'
          };
        }
      }

      // Check product restrictions
      if (coupon.applicableProducts.length > 0 && cartItems.length > 0) {
        const hasApplicableItems = cartItems.some(item => 
          coupon.applicableProducts.includes(item.productId)
        );

        if (!hasApplicableItems) {
          return {
            valid: false,
            error: 'Coupon not applicable for items in your cart'
          };
        }
      }

      // Calculate discount
      let discountAmount = 0;
      
      if (coupon.type === 'percentage') {
        discountAmount = (orderValue * coupon.value) / 100;
      } else {
        discountAmount = coupon.value;
      }

      // Apply maximum discount limit
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }

      return {
        valid: true,
        coupon: {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          discountAmount,
          description: coupon.description
        }
      };

    } catch (error) {
      console.error('Validate coupon error:', error);
      return {
        valid: false,
        error: 'Error validating coupon'
      };
    }
  }

  // Update coupon
  async updateCoupon(couponCode, updateData, userId) {
    try {
      const couponDoc = await this.db.collection('coupons').doc(couponCode.toUpperCase()).get();
      
      if (!couponDoc.exists) {
        throw new Error('Coupon not found');
      }

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      // Convert date strings to Date objects
      if (updateData.expiryDate) {
        updateData.expiryDate = new Date(updateData.expiryDate);
      }

      // Add update metadata
      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      updateData.updatedBy = userId;

      // Update coupon
      await this.db.collection('coupons').doc(couponCode.toUpperCase()).update(updateData);

      // Log admin activity
      await this.db.collection('admin_activity').add({
        userId,
        action: 'update_coupon',
        resourceType: 'coupon',
        resourceId: couponCode.toUpperCase(),
        details: {
          updatedFields: Object.keys(updateData),
          couponCode: couponCode.toUpperCase()
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Coupon updated successfully',
        couponCode: couponCode.toUpperCase()
      };

    } catch (error) {
      console.error('Update coupon error:', error);
      throw error;
    }
  }

  // Delete coupon
  async deleteCoupon(couponCode, userId) {
    try {
      const couponDoc = await this.db.collection('coupons').doc(couponCode.toUpperCase()).get();
      
      if (!couponDoc.exists) {
        throw new Error('Coupon not found');
      }

      // Soft delete - mark as inactive
      await this.db.collection('coupons').doc(couponCode.toUpperCase()).update({
        isActive: false,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedBy: userId
      });

      // Log admin activity
      await this.db.collection('admin_activity').add({
        userId,
        action: 'delete_coupon',
        resourceType: 'coupon',
        resourceId: couponCode.toUpperCase(),
        details: {
          couponCode: couponCode.toUpperCase()
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Coupon deleted successfully',
        couponCode: couponCode.toUpperCase()
      };

    } catch (error) {
      console.error('Delete coupon error:', error);
      throw error;
    }
  }

  // Get all coupons
  async getCoupons(includeInactive = false) {
    try {
      let query = this.db.collection('coupons');
      
      if (!includeInactive) {
        query = query.where('isActive', '==', true);
      }

      query = query.orderBy('createdAt', 'desc');

      const snapshot = await query.get();
      const coupons = [];

      snapshot.forEach(doc => {
        const couponData = doc.data();
        coupons.push({
          id: doc.id,
          ...couponData,
          expiryDate: couponData.expiryDate?.toDate()?.toISOString(),
          createdAt: couponData.createdAt?.toDate()?.toISOString(),
          updatedAt: couponData.updatedAt?.toDate()?.toISOString()
        });
      });

      return {
        success: true,
        coupons
      };

    } catch (error) {
      console.error('Get coupons error:', error);
      throw error;
    }
  }

  // Get coupon by code
  async getCouponByCode(couponCode) {
    try {
      const couponDoc = await this.db.collection('coupons').doc(couponCode.toUpperCase()).get();
      
      if (!couponDoc.exists) {
        throw new Error('Coupon not found');
      }

      const coupon = couponDoc.data();

      return {
        success: true,
        coupon: {
          id: couponDoc.id,
          ...coupon,
          expiryDate: coupon.expiryDate?.toDate()?.toISOString(),
          createdAt: coupon.createdAt?.toDate()?.toISOString(),
          updatedAt: coupon.updatedAt?.toDate()?.toISOString()
        }
      };

    } catch (error) {
      console.error('Get coupon by code error:', error);
      throw error;
    }
  }

  // Get coupon usage statistics
  async getCouponStats() {
    try {
      const couponsQuery = await this.db.collection('coupons')
        .where('isActive', '==', true)
        .get();

      let totalCoupons = 0;
      let totalUsage = 0;
      let expiredCoupons = 0;
      const now = new Date();
      const couponStats = [];

      couponsQuery.forEach(doc => {
        const coupon = doc.data();
        totalCoupons++;
        totalUsage += coupon.usageCount || 0;

        if (coupon.expiryDate.toDate() < now) {
          expiredCoupons++;
        }

        couponStats.push({
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          usageCount: coupon.usageCount || 0,
          maxUsage: coupon.maxUsage,
          expiryDate: coupon.expiryDate.toDate().toISOString()
        });
      });

      // Sort by usage count
      couponStats.sort((a, b) => b.usageCount - a.usageCount);

      return {
        success: true,
        stats: {
          totalCoupons,
          totalUsage,
          expiredCoupons,
          activeCoupons: totalCoupons - expiredCoupons,
          topCoupons: couponStats.slice(0, 10)
        }
      };

    } catch (error) {
      console.error('Get coupon stats error:', error);
      throw error;
    }
  }

  // Increment coupon usage
  async incrementUsage(couponCode) {
    try {
      await this.db.collection('coupons').doc(couponCode.toUpperCase()).update({
        usageCount: admin.firestore.FieldValue.increment(1),
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Coupon usage incremented'
      };

    } catch (error) {
      console.error('Increment coupon usage error:', error);
      throw error;
    }
  }
}

module.exports = new CouponManager();
