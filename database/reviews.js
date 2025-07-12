const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create review
const createReview = async (req, res) => {
  try {
    const { productId, rating, title, comment, recommend } = req.body;

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();

    // Validate required fields
    if (!productId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Product ID and rating (1-5) are required'
      });
    }

    // Check if product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user has purchased this product
    const orderQuery = await db.collection('orders')
      .where('userId', '==', userId)
      .where('status', '==', 'delivered')
      .get();

    let hasPurchased = false;
    orderQuery.forEach(doc => {
      const order = doc.data();
      if (order.items.some(item => item.productId === productId)) {
        hasPurchased = true;
      }
    });

    // Check if user already reviewed this product
    const existingReviewQuery = await db.collection('reviews')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .get();

    if (!existingReviewQuery.empty) {
      return res.status(409).json({
        error: 'Review already exists',
        message: 'You have already reviewed this product'
      });
    }

    // Get user details
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.data();

    const reviewId = generateID.generateReviewId();

    const reviewData = {
      id: reviewId,
      productId,
      userId,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      rating: parseInt(rating),
      title: title || '',
      comment: comment || '',
      recommend: recommend === true,
      isVerifiedPurchase: hasPurchased,
      isApproved: hasPurchased, // Auto-approve if verified purchase
      helpfulCount: 0,
      reportCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('reviews').doc(reviewId).set(reviewData);

    // Update product rating
    await updateProductRating(productId);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review: {
        id: reviewId,
        rating: parseInt(rating),
        isVerifiedPurchase: hasPurchased,
        isApproved: hasPurchased
      }
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      error: 'Failed to create review',
      message: error.message
    });
  }
};

// Get reviews for a product
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      rating,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const db = admin.firestore();

    // Check if product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let query = db.collection('reviews')
      .where('productId', '==', productId)
      .where('isApproved', '==', true);

    // Filter by rating if specified
    if (rating) {
      query = query.where('rating', '==', parseInt(rating));
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'rating', 'helpfulCount'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    const reviews = [];

    snapshot.forEach(doc => {
      const reviewData = doc.data();
      reviews.push({
        id: doc.id,
        ...reviewData,
        createdAt: reviewData.createdAt?.toDate()?.toISOString(),
        updatedAt: reviewData.updatedAt?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    // Get rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };

    reviews.forEach(review => {
      ratingDistribution[review.rating]++;
    });

    const product = productDoc.data();

    res.status(200).json({
      success: true,
      reviews: paginatedReviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(reviews.length / parseInt(limit)),
        totalReviews: reviews.length,
        hasNextPage: endIndex < reviews.length,
        hasPrevPage: parseInt(page) > 1
      },
      summary: {
        averageRating: product.averageRating || 0,
        totalReviews: reviews.length,
        ratingDistribution
      }
    });

  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({
      error: 'Failed to fetch reviews',
      message: error.message
    });
  }
};

// Update review helpful count
const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();

    // Check if review exists
    const reviewDoc = await db.collection('reviews').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Check if user already marked this review as helpful
    const helpfulDoc = await db.collection('review_helpful')
      .where('reviewId', '==', reviewId)
      .where('userId', '==', userId)
      .get();

    if (!helpfulDoc.empty) {
      return res.status(409).json({
        error: 'Already marked',
        message: 'You have already marked this review as helpful'
      });
    }

    // Add helpful record
    await db.collection('review_helpful').add({
      reviewId,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Increment helpful count
    await db.collection('reviews').doc(reviewId).update({
      helpfulCount: admin.firestore.FieldValue.increment(1)
    });

    res.status(200).json({
      success: true,
      message: 'Review marked as helpful'
    });

  } catch (error) {
    console.error('Mark review helpful error:', error);
    res.status(500).json({
      error: 'Failed to mark review as helpful',
      message: error.message
    });
  }
};

// Report review
const reportReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();

    // Check if review exists
    const reviewDoc = await db.collection('reviews').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Check if user already reported this review
    const reportDoc = await db.collection('review_reports')
      .where('reviewId', '==', reviewId)
      .where('reportedBy', '==', userId)
      .get();

    if (!reportDoc.empty) {
      return res.status(409).json({
        error: 'Already reported',
        message: 'You have already reported this review'
      });
    }

    // Add report record
    await db.collection('review_reports').add({
      reviewId,
      reportedBy: userId,
      reason: reason || 'No reason provided',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Increment report count
    await db.collection('reviews').doc(reviewId).update({
      reportCount: admin.firestore.FieldValue.increment(1)
    });

    res.status(200).json({
      success: true,
      message: 'Review reported successfully'
    });

  } catch (error) {
    console.error('Report review error:', error);
    res.status(500).json({
      error: 'Failed to report review',
      message: error.message
    });
  }
};

// Admin functions

// Get all reviews for moderation
const getAllReviews = async (req, res) => {
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
      isApproved,
      rating,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('reviews');

    // Apply filters
    if (isApproved !== undefined) {
      query = query.where('isApproved', '==', isApproved === 'true');
    }

    if (rating) {
      query = query.where('rating', '==', parseInt(rating));
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'rating', 'helpfulCount', 'reportCount'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    const reviews = [];

    snapshot.forEach(doc => {
      const reviewData = doc.data();
      reviews.push({
        id: doc.id,
        ...reviewData,
        createdAt: reviewData.createdAt?.toDate()?.toISOString(),
        updatedAt: reviewData.updatedAt?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      reviews: paginatedReviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(reviews.length / parseInt(limit)),
        totalReviews: reviews.length,
        hasNextPage: endIndex < reviews.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all reviews error:', error);
    res.status(500).json({
      error: 'Failed to fetch reviews',
      message: error.message
    });
  }
};

// Approve/disapprove review
const moderateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { isApproved, moderationNote } = req.body;

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

    // Check if review exists
    const reviewDoc = await db.collection('reviews').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviewDoc.data();

    // Update review approval status
    await db.collection('reviews').doc(reviewId).update({
      isApproved: isApproved === true,
      moderatedBy: userId,
      moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
      moderationNote: moderationNote || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update product rating if approval status changed
    if (review.isApproved !== (isApproved === true)) {
      await updateProductRating(review.productId);
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'moderate_review',
      resourceType: 'review',
      resourceId: reviewId,
      details: {
        isApproved: isApproved === true,
        productId: review.productId,
        moderationNote: moderationNote || ''
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: `Review ${isApproved ? 'approved' : 'disapproved'} successfully`,
      reviewId
    });

  } catch (error) {
    console.error('Moderate review error:', error);
    res.status(500).json({
      error: 'Failed to moderate review',
      message: error.message
    });
  }
};

// Helper function to update product rating
const updateProductRating = async (productId) => {
  try {
    const db = admin.firestore();

    // Get all approved reviews for the product
    const reviewsQuery = await db.collection('reviews')
      .where('productId', '==', productId)
      .where('isApproved', '==', true)
      .get();

    let totalRating = 0;
    let reviewCount = 0;

    reviewsQuery.forEach(doc => {
      const review = doc.data();
      totalRating += review.rating;
      reviewCount++;
    });

    const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

    // Update product with new rating
    await db.collection('products').doc(productId).update({
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      totalReviews: reviewCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('Update product rating error:', error);
  }
};

module.exports = {
  createReview,
  getProductReviews,
  markReviewHelpful,
  reportReview,
  getAllReviews,
  moderateReview
};
