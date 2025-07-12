const express = require("express");
const { body, validationResult } = require("express-validator");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const router = express.Router();

const db = admin.firestore();

// Middleware to verify authentication
const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authorization header is required"
      });
    }

    const token = authHeader.split("Bearer ")[1];
    let decodedToken;

    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET || "fallback-secret");
    } catch (jwtError) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token"
      });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    if (!userDoc.exists || !userData.isActive) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User not found or account is inactive"
      });
    }

    req.user = { ...decodedToken, role: userData.role };
    next();
  } catch (error) {
    console.error("Authentication verification error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
};

// Submit a review
router.post("/submit", verifyAuth, [
  body("productId").notEmpty().withMessage("Product ID is required"),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
  body("title").isLength({ min: 3, max: 100 }).withMessage("Title must be between 3 and 100 characters"),
  body("comment").isLength({ min: 10, max: 1000 }).withMessage("Comment must be between 10 and 1000 characters")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { productId, rating, title, comment, orderId } = req.body;
    const userId = req.user.uid;

    // Check if product exists
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        error: "Product not found"
      });
    }

    // Check if user has purchased this product (if orderId provided)
    if (orderId) {
      const orderDoc = await db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists || orderDoc.data().userId !== userId) {
        return res.status(403).json({
          error: "Access denied",
          message: "You can only review products you have purchased"
        });
      }

      const orderData = orderDoc.data();
      const hasPurchased = orderData.items.some(item => item.productId === productId);
      if (!hasPurchased) {
        return res.status(403).json({
          error: "Product not found in order",
          message: "You can only review products you have purchased"
        });
      }
    }

    // Check if user has already reviewed this product
    const existingReviewQuery = await db.collection("reviews")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    if (!existingReviewQuery.empty) {
      return res.status(400).json({
        error: "Review already exists",
        message: "You have already reviewed this product"
      });
    }

    // Get user data for review
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    // Create review
    const reviewId = "REV_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const reviewData = {
      reviewId,
      productId,
      userId,
      orderId: orderId || null,
      rating,
      title,
      comment,
      userName: userData.firstName + " " + (userData.lastName || ""),
      userEmail: userData.email,
      status: "pending", // pending, approved, rejected
      isVerifiedPurchase: !!orderId,
      helpfulCount: 0,
      reportCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("reviews").doc(reviewId).set(reviewData);

    // Update product rating statistics
    const productData = productDoc.data();
    const currentRating = productData.rating || 0;
    const currentReviewCount = productData.reviewCount || 0;
    const newReviewCount = currentReviewCount + 1;
    const newRating = ((currentRating * currentReviewCount) + rating) / newReviewCount;

    await db.collection("products").doc(productId).update({
      rating: Math.round(newRating * 10) / 10, // Round to 1 decimal place
      reviewCount: newReviewCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review: {
        reviewId,
        status: "pending",
        message: "Your review is pending approval and will be visible once approved"
      }
    });

  } catch (error) {
    console.error("Submit review error:", error);
    res.status(500).json({
      error: "Failed to submit review",
      message: error.message
    });
  }
});

// Get reviews for a product
router.get("/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 10, page = 1, sortBy = "newest" } = req.query;

    // Check if product exists
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        error: "Product not found"
      });
    }

    let query = db.collection("reviews")
      .where("productId", "==", productId)
      .where("status", "==", "approved");

    // Apply sorting
    switch (sortBy) {
      case "newest":
        query = query.orderBy("createdAt", "desc");
        break;
      case "oldest":
        query = query.orderBy("createdAt", "asc");
        break;
      case "highest":
        query = query.orderBy("rating", "desc").orderBy("createdAt", "desc");
        break;
      case "lowest":
        query = query.orderBy("rating", "asc").orderBy("createdAt", "desc");
        break;
      case "helpful":
        query = query.orderBy("helpfulCount", "desc").orderBy("createdAt", "desc");
        break;
      default:
        query = query.orderBy("createdAt", "desc");
    }

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(parseInt(limit));
    const snapshot = await query.get();

    const reviews = [];
    snapshot.forEach(doc => {
      const reviewData = doc.data();
      reviews.push({
        id: doc.id,
        reviewId: reviewData.reviewId,
        rating: reviewData.rating,
        title: reviewData.title,
        comment: reviewData.comment,
        userName: reviewData.userName,
        isVerifiedPurchase: reviewData.isVerifiedPurchase,
        helpfulCount: reviewData.helpfulCount,
        createdAt: reviewData.createdAt?.toDate()
      });
    });

    // Get total count and rating distribution
    const allReviewsSnapshot = await db.collection("reviews")
      .where("productId", "==", productId)
      .where("status", "==", "approved")
      .get();

    const totalReviews = allReviewsSnapshot.size;
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;

    allReviewsSnapshot.forEach(doc => {
      const rating = doc.data().rating;
      ratingDistribution[rating]++;
      totalRating += rating;
    });

    const averageRating = totalReviews > 0 ? Math.round((totalRating / totalReviews) * 10) / 10 : 0;
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    res.json({
      success: true,
      reviews,
      statistics: {
        totalReviews,
        averageRating,
        ratingDistribution
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error("Get product reviews error:", error);
    res.status(500).json({
      error: "Failed to fetch reviews",
      message: error.message
    });
  }
});

// Get user's reviews
router.get("/user/list", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 10, page = 1 } = req.query;

    let query = db.collection("reviews")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc");

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(parseInt(limit));
    const snapshot = await query.get();

    const reviews = [];
    for (const doc of snapshot.docs) {
      const reviewData = doc.data();
      
      // Get product data
      const productDoc = await db.collection("products").doc(reviewData.productId).get();
      const productData = productDoc.exists ? productDoc.data() : null;

      reviews.push({
        id: doc.id,
        reviewId: reviewData.reviewId,
        productId: reviewData.productId,
        productName: productData?.name || "Unknown Product",
        productImage: productData?.images?.[0] || "",
        rating: reviewData.rating,
        title: reviewData.title,
        comment: reviewData.comment,
        status: reviewData.status,
        helpfulCount: reviewData.helpfulCount,
        createdAt: reviewData.createdAt?.toDate()
      });
    }

    // Get total count
    const countSnapshot = await db.collection("reviews").where("userId", "==", userId).get();
    const totalReviews = countSnapshot.size;
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReviews,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error("Get user reviews error:", error);
    res.status(500).json({
      error: "Failed to fetch user reviews",
      message: error.message
    });
  }
});

// Mark review as helpful
router.post("/:reviewId/helpful", verifyAuth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.uid;

    const reviewDoc = await db.collection("reviews").doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        error: "Review not found"
      });
    }

    // Check if user has already marked this review as helpful
    const helpfulDoc = await db.collection("review_helpful")
      .where("reviewId", "==", reviewId)
      .where("userId", "==", userId)
      .get();

    if (!helpfulDoc.empty) {
      return res.status(400).json({
        error: "Already marked as helpful",
        message: "You have already marked this review as helpful"
      });
    }

    // Add helpful record
    await db.collection("review_helpful").add({
      reviewId,
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Increment helpful count
    await db.collection("reviews").doc(reviewId).update({
      helpfulCount: admin.firestore.FieldValue.increment(1)
    });

    res.json({
      success: true,
      message: "Review marked as helpful"
    });

  } catch (error) {
    console.error("Mark review helpful error:", error);
    res.status(500).json({
      error: "Failed to mark review as helpful",
      message: error.message
    });
  }
});

// Report review
router.post("/:reviewId/report", verifyAuth, [
  body("reason").notEmpty().withMessage("Report reason is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { reviewId } = req.params;
    const { reason } = req.body;
    const userId = req.user.uid;

    const reviewDoc = await db.collection("reviews").doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({
        error: "Review not found"
      });
    }

    // Check if user has already reported this review
    const reportDoc = await db.collection("review_reports")
      .where("reviewId", "==", reviewId)
      .where("userId", "==", userId)
      .get();

    if (!reportDoc.empty) {
      return res.status(400).json({
        error: "Already reported",
        message: "You have already reported this review"
      });
    }

    // Add report record
    await db.collection("review_reports").add({
      reviewId,
      userId,
      reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Increment report count
    await db.collection("reviews").doc(reviewId).update({
      reportCount: admin.firestore.FieldValue.increment(1)
    });

    res.json({
      success: true,
      message: "Review reported successfully"
    });

  } catch (error) {
    console.error("Report review error:", error);
    res.status(500).json({
      error: "Failed to report review",
      message: error.message
    });
  }
});

module.exports = router;

