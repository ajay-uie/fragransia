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

// Add item to wishlist
router.post("/add", verifyAuth, [
  body("productId").notEmpty().withMessage("Product ID is required")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { productId } = req.body;
    const userId = req.user.uid;

    // Check if product exists
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        error: "Product not found"
      });
    }

    const productData = productDoc.data();
    if (!productData.isActive) {
      return res.status(400).json({
        error: "Product not available",
        message: "This product is currently not available"
      });
    }

    // Check if item is already in wishlist
    const existingWishlistQuery = await db.collection("wishlist")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    if (!existingWishlistQuery.empty) {
      return res.status(400).json({
        error: "Already in wishlist",
        message: "This product is already in your wishlist"
      });
    }

    // Add to wishlist
    const wishlistId = "WISH_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const wishlistData = {
      wishlistId,
      userId,
      productId,
      productName: productData.name,
      productBrand: productData.brand,
      productPrice: productData.price,
      productImage: productData.images?.[0] || "",
      productSize: productData.defaultSize || productData.size || "100ml",
      isAvailable: productData.isActive && productData.inventory > 0,
      addedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("wishlist").doc(wishlistId).set(wishlistData);

    res.status(201).json({
      success: true,
      message: "Product added to wishlist",
      wishlistItem: {
        wishlistId,
        productId,
        productName: productData.name,
        addedAt: new Date()
      }
    });

  } catch (error) {
    console.error("Add to wishlist error:", error);
    res.status(500).json({
      error: "Failed to add to wishlist",
      message: error.message
    });
  }
});

// Remove item from wishlist
router.delete("/remove/:productId", verifyAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;

    // Find wishlist item
    const wishlistQuery = await db.collection("wishlist")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    if (wishlistQuery.empty) {
      return res.status(404).json({
        error: "Item not found",
        message: "This product is not in your wishlist"
      });
    }

    // Remove from wishlist
    const wishlistDoc = wishlistQuery.docs[0];
    await db.collection("wishlist").doc(wishlistDoc.id).delete();

    res.json({
      success: true,
      message: "Product removed from wishlist"
    });

  } catch (error) {
    console.error("Remove from wishlist error:", error);
    res.status(500).json({
      error: "Failed to remove from wishlist",
      message: error.message
    });
  }
});

// Get user's wishlist
router.get("/list", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 20, page = 1 } = req.query;

    let query = db.collection("wishlist")
      .where("userId", "==", userId)
      .orderBy("addedAt", "desc");

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

    const wishlistItems = [];
    for (const doc of snapshot.docs) {
      const wishlistData = doc.data();
      
      // Get current product data to check availability and price
      const productDoc = await db.collection("products").doc(wishlistData.productId).get();
      const currentProductData = productDoc.exists ? productDoc.data() : null;

      const item = {
        id: doc.id,
        wishlistId: wishlistData.wishlistId,
        productId: wishlistData.productId,
        productName: wishlistData.productName,
        productBrand: wishlistData.productBrand,
        productPrice: currentProductData?.price || wishlistData.productPrice,
        originalPrice: wishlistData.productPrice,
        productImage: currentProductData?.images?.[0] || wishlistData.productImage,
        productSize: wishlistData.productSize,
        isAvailable: currentProductData?.isActive && currentProductData?.inventory > 0,
        priceChanged: currentProductData && currentProductData.price !== wishlistData.productPrice,
        addedAt: wishlistData.addedAt?.toDate()
      };

      wishlistItems.push(item);
    }

    // Get total count
    const countSnapshot = await db.collection("wishlist").where("userId", "==", userId).get();
    const totalItems = countSnapshot.size;
    const totalPages = Math.ceil(totalItems / parseInt(limit));

    res.json({
      success: true,
      wishlist: wishlistItems,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error("Get wishlist error:", error);
    res.status(500).json({
      error: "Failed to fetch wishlist",
      message: error.message
    });
  }
});

// Check if product is in wishlist
router.get("/check/:productId", verifyAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;

    const wishlistQuery = await db.collection("wishlist")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    const isInWishlist = !wishlistQuery.empty;

    res.json({
      success: true,
      isInWishlist,
      wishlistId: isInWishlist ? wishlistQuery.docs[0].data().wishlistId : null
    });

  } catch (error) {
    console.error("Check wishlist error:", error);
    res.status(500).json({
      error: "Failed to check wishlist",
      message: error.message
    });
  }
});

// Move wishlist item to cart
router.post("/move-to-cart/:productId", verifyAuth, [
  body("quantity").optional().isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("size").optional().notEmpty().withMessage("Size cannot be empty")
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { productId } = req.params;
    const { quantity = 1, size } = req.body;
    const userId = req.user.uid;

    // Check if product is in wishlist
    const wishlistQuery = await db.collection("wishlist")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    if (wishlistQuery.empty) {
      return res.status(404).json({
        error: "Item not found",
        message: "This product is not in your wishlist"
      });
    }

    // Get current product data
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        error: "Product not found"
      });
    }

    const productData = productDoc.data();
    if (!productData.isActive) {
      return res.status(400).json({
        error: "Product not available",
        message: "This product is currently not available"
      });
    }

    if (productData.inventory < quantity) {
      return res.status(400).json({
        error: "Insufficient inventory",
        available: productData.inventory,
        requested: quantity
      });
    }

    // Check if item is already in cart
    const cartQuery = await db.collection("cart")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    if (!cartQuery.empty) {
      // Update existing cart item
      const cartDoc = cartQuery.docs[0];
      const currentQuantity = cartDoc.data().quantity;
      const newQuantity = currentQuantity + quantity;

      if (productData.inventory < newQuantity) {
        return res.status(400).json({
          error: "Insufficient inventory",
          message: `Cannot add ${quantity} more items. Only ${productData.inventory - currentQuantity} available.`
        });
      }

      await db.collection("cart").doc(cartDoc.id).update({
        quantity: newQuantity,
        size: size || cartDoc.data().size,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Add new cart item
      const cartId = "CART_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      const cartData = {
        cartId,
        userId,
        productId,
        quantity,
        size: size || productData.defaultSize || productData.size || "100ml",
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("cart").doc(cartId).set(cartData);
    }

    // Remove from wishlist
    const wishlistDoc = wishlistQuery.docs[0];
    await db.collection("wishlist").doc(wishlistDoc.id).delete();

    res.json({
      success: true,
      message: "Product moved to cart successfully"
    });

  } catch (error) {
    console.error("Move to cart error:", error);
    res.status(500).json({
      error: "Failed to move to cart",
      message: error.message
    });
  }
});

// Clear entire wishlist
router.delete("/clear", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const wishlistQuery = await db.collection("wishlist")
      .where("userId", "==", userId)
      .get();

    if (wishlistQuery.empty) {
      return res.json({
        success: true,
        message: "Wishlist is already empty"
      });
    }

    // Delete all wishlist items
    const batch = db.batch();
    wishlistQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    res.json({
      success: true,
      message: "Wishlist cleared successfully",
      removedItems: wishlistQuery.size
    });

  } catch (error) {
    console.error("Clear wishlist error:", error);
    res.status(500).json({
      error: "Failed to clear wishlist",
      message: error.message
    });
  }
});

module.exports = router;

