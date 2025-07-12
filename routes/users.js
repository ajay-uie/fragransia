const express = require('express');
const { body, validationResult } = require('express-validator');
const admin = require('firebase-admin');
const router = express.Router();

const db = admin.firestore();

// Middleware to verify authentication
const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header is required'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
};

// Get user profile
router.get('/profile', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Remove sensitive information
    const { password, ...safeUserData } = userData;

    res.json({
      success: true,
      user: {
        id: userDoc.id,
        ...safeUserData,
        createdAt: userData.createdAt?.toDate(),
        updatedAt: userData.updatedAt?.toDate(),
        lastLogin: userData.lastLogin?.toDate()
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch user profile',
      message: error.message
    });
  }
});

// Update user profile
router.put('/profile', verifyAuth, [
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('phoneNumber').optional().isMobilePhone('en-IN').withMessage('Invalid phone number'),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Invalid gender')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.uid;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.email;
    delete updateData.uid;
    delete updateData.role;
    delete updateData.createdAt;

    // Add update timestamp
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('users').doc(userId).update(updateData);

    // Get updated user data
    const updatedUserDoc = await db.collection('users').doc(userId).get();
    const updatedUserData = updatedUserDoc.data();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUserDoc.id,
        ...updatedUserData,
        createdAt: updatedUserData.createdAt?.toDate(),
        updatedAt: updatedUserData.updatedAt?.toDate(),
        lastLogin: updatedUserData.lastLogin?.toDate()
      }
    });

  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message
    });
  }
});

// Get user addresses
router.get('/addresses', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const addressesQuery = await db.collection('addresses')
      .where('userId', '==', userId)
      .orderBy('isDefault', 'desc')
      .orderBy('createdAt', 'desc')
      .get();

    const addresses = [];
    addressesQuery.forEach(doc => {
      addresses.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      });
    });

    res.json({
      success: true,
      addresses,
      count: addresses.length
    });

  } catch (error) {
    console.error('Get user addresses error:', error);
    res.status(500).json({
      error: 'Failed to fetch addresses',
      message: error.message
    });
  }
});

// Add new address
router.post('/addresses', verifyAuth, [
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('address').trim().isLength({ min: 1 }).withMessage('Address is required'),
  body('city').trim().isLength({ min: 1 }).withMessage('City is required'),
  body('state').trim().isLength({ min: 1 }).withMessage('State is required'),
  body('pincode').isLength({ min: 6, max: 6 }).withMessage('Pincode must be 6 digits'),
  body('phone').isMobilePhone('en-IN').withMessage('Invalid phone number'),
  body('isDefault').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.uid;
    const addressData = {
      ...req.body,
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // If this is set as default, unset other default addresses
    if (addressData.isDefault) {
      const batch = db.batch();
      const existingAddresses = await db.collection('addresses')
        .where('userId', '==', userId)
        .where('isDefault', '==', true)
        .get();

      existingAddresses.forEach(doc => {
        batch.update(doc.ref, { isDefault: false });
      });

      await batch.commit();
    }

    const addressRef = await db.collection('addresses').add(addressData);
    const newAddress = await addressRef.get();

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      address: {
        id: newAddress.id,
        ...newAddress.data(),
        createdAt: newAddress.data().createdAt?.toDate(),
        updatedAt: newAddress.data().updatedAt?.toDate()
      }
    });

  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({
      error: 'Failed to add address',
      message: error.message
    });
  }
});

// Update address
router.put('/addresses/:addressId', verifyAuth, [
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('address').optional().trim().isLength({ min: 1 }).withMessage('Address cannot be empty'),
  body('city').optional().trim().isLength({ min: 1 }).withMessage('City cannot be empty'),
  body('state').optional().trim().isLength({ min: 1 }).withMessage('State cannot be empty'),
  body('pincode').optional().isLength({ min: 6, max: 6 }).withMessage('Pincode must be 6 digits'),
  body('phone').optional().isMobilePhone('en-IN').withMessage('Invalid phone number'),
  body('isDefault').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { addressId } = req.params;
    const userId = req.user.uid;

    // Check if address belongs to user
    const addressDoc = await db.collection('addresses').doc(addressId).get();
    
    if (!addressDoc.exists) {
      return res.status(404).json({
        error: 'Address not found'
      });
    }

    const addressData = addressDoc.data();
    if (addressData.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // If this is set as default, unset other default addresses
    if (updateData.isDefault) {
      const batch = db.batch();
      const existingAddresses = await db.collection('addresses')
        .where('userId', '==', userId)
        .where('isDefault', '==', true)
        .get();

      existingAddresses.forEach(doc => {
        if (doc.id !== addressId) {
          batch.update(doc.ref, { isDefault: false });
        }
      });

      await batch.commit();
    }

    await db.collection('addresses').doc(addressId).update(updateData);

    // Get updated address
    const updatedAddress = await db.collection('addresses').doc(addressId).get();

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: {
        id: updatedAddress.id,
        ...updatedAddress.data(),
        createdAt: updatedAddress.data().createdAt?.toDate(),
        updatedAt: updatedAddress.data().updatedAt?.toDate()
      }
    });

  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      error: 'Failed to update address',
      message: error.message
    });
  }
});

// Delete address
router.delete('/addresses/:addressId', verifyAuth, async (req, res) => {
  try {
    const { addressId } = req.params;
    const userId = req.user.uid;

    // Check if address belongs to user
    const addressDoc = await db.collection('addresses').doc(addressId).get();
    
    if (!addressDoc.exists) {
      return res.status(404).json({
        error: 'Address not found'
      });
    }

    const addressData = addressDoc.data();
    if (addressData.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    await db.collection('addresses').doc(addressId).delete();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      error: 'Failed to delete address',
      message: error.message
    });
  }
});

// Get user wishlist
router.get('/wishlist', verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const wishlistQuery = await db.collection('wishlist')
      .where('userId', '==', userId)
      .orderBy('addedAt', 'desc')
      .get();

    const wishlistItems = [];
    
    for (const doc of wishlistQuery.docs) {
      const wishlistItem = doc.data();
      
      // Get product details
      const productDoc = await db.collection('products').doc(wishlistItem.productId).get();
      
      if (productDoc.exists) {
        const productData = productDoc.data();
        wishlistItems.push({
          id: doc.id,
          productId: wishlistItem.productId,
          addedAt: wishlistItem.addedAt?.toDate(),
          product: {
            id: productDoc.id,
            name: productData.name,
            price: productData.price,
            originalPrice: productData.originalPrice,
            images: productData.images,
            brand: productData.brand,
            category: productData.category,
            isActive: productData.isActive,
            inventory: productData.inventory
          }
        });
      }
    }

    res.json({
      success: true,
      wishlist: wishlistItems,
      count: wishlistItems.length
    });

  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({
      error: 'Failed to fetch wishlist',
      message: error.message
    });
  }
});

// Add to wishlist
router.post('/wishlist', verifyAuth, [
  body('productId').notEmpty().withMessage('Product ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { productId } = req.body;
    const userId = req.user.uid;

    // Check if product exists
    const productDoc = await db.collection('products').doc(productId).get();
    
    if (!productDoc.exists) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    // Check if already in wishlist
    const existingWishlistQuery = await db.collection('wishlist')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .limit(1)
      .get();

    if (!existingWishlistQuery.empty) {
      return res.status(409).json({
        error: 'Product already in wishlist'
      });
    }

    // Add to wishlist
    const wishlistData = {
      userId,
      productId,
      addedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const wishlistRef = await db.collection('wishlist').add(wishlistData);

    res.status(201).json({
      success: true,
      message: 'Product added to wishlist',
      wishlistId: wishlistRef.id
    });

  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({
      error: 'Failed to add to wishlist',
      message: error.message
    });
  }
});

// Remove from wishlist
router.delete('/wishlist/:productId', verifyAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;

    const wishlistQuery = await db.collection('wishlist')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .limit(1)
      .get();

    if (wishlistQuery.empty) {
      return res.status(404).json({
        error: 'Product not found in wishlist'
      });
    }

    const wishlistDoc = wishlistQuery.docs[0];
    await wishlistDoc.ref.delete();

    res.json({
      success: true,
      message: 'Product removed from wishlist'
    });

  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      error: 'Failed to remove from wishlist',
      message: error.message
    });
  }
});

// Update user preferences
router.put('/preferences', verifyAuth, [
  body('newsletter').optional().isBoolean(),
  body('notifications').optional().isBoolean(),
  body('smsUpdates').optional().isBoolean(),
  body('language').optional().isIn(['en', 'hi']).withMessage('Invalid language'),
  body('currency').optional().isIn(['INR', 'USD']).withMessage('Invalid currency')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.uid;
    const preferences = req.body;

    await db.collection('users').doc(userId).update({
      preferences,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      error: 'Failed to update preferences',
      message: error.message
    });
  }
});

module.exports = router;

