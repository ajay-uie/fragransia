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

// Add item to cart
router.post("/add", verifyAuth, [
  body("productId").notEmpty().withMessage("Product ID is required"),
  body("quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
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

    const { productId, quantity, size } = req.body;
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

    // Check inventory
    if (productData.inventory < quantity) {
      return res.status(400).json({
        error: "Insufficient inventory",
        available: productData.inventory,
        requested: quantity
      });
    }

    // Check if item is already in cart
    const existingCartQuery = await db.collection("cart")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .get();

    if (!existingCartQuery.empty) {
      // Update existing cart item
      const cartDoc = existingCartQuery.docs[0];
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

      return res.json({
        success: true,
        message: "Cart item updated successfully",
        cartItem: {
          cartId: cartDoc.data().cartId,
          productId,
          quantity: newQuantity
        }
      });
    }

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

    res.status(201).json({
      success: true,
      message: "Product added to cart",
      cartItem: {
        cartId,
        productId,
        quantity
      }
    });

  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({
      error: "Failed to add to cart",
      message: error.message
    });
  }
});

// Update cart item
router.put("/update/:cartId", verifyAuth, [
  body("quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
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

    const { cartId } = req.params;
    const { quantity, size } = req.body;
    const userId = req.user.uid;

    // Find cart item
    const cartDoc = await db.collection("cart").doc(cartId).get();
    if (!cartDoc.exists) {
      return res.status(404).json({
        error: "Cart item not found"
      });
    }

    const cartData = cartDoc.data();
    if (cartData.userId !== userId) {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only update your own cart items"
      });
    }

    // Check product availability and inventory
    const productDoc = await db.collection("products").doc(cartData.productId).get();
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

    // Update cart item
    const updateData = {
      quantity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (size) {
      updateData.size = size;
    }

    await db.collection("cart").doc(cartId).update(updateData);

    res.json({
      success: true,
      message: "Cart item updated successfully"
    });

  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).json({
      error: "Failed to update cart",
      message: error.message
    });
  }
});

// Remove item from cart
router.delete("/remove/:cartId", verifyAuth, async (req, res) => {
  try {
    const { cartId } = req.params;
    const userId = req.user.uid;

    // Find cart item
    const cartDoc = await db.collection("cart").doc(cartId).get();
    if (!cartDoc.exists) {
      return res.status(404).json({
        error: "Cart item not found"
      });
    }

    const cartData = cartDoc.data();
    if (cartData.userId !== userId) {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only remove your own cart items"
      });
    }

    // Remove cart item
    await db.collection("cart").doc(cartId).delete();

    res.json({
      success: true,
      message: "Cart item removed successfully"
    });

  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({
      error: "Failed to remove from cart",
      message: error.message
    });
  }
});

// Get user's cart
router.get("/list", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const cartQuery = await db.collection("cart")
      .where("userId", "==", userId)
      .orderBy("addedAt", "desc")
      .get();

    const cartItems = [];
    let cartTotal = 0;

    for (const doc of cartQuery.docs) {
      const cartData = doc.data();
      
      // Get current product data
      const productDoc = await db.collection("products").doc(cartData.productId).get();
      if (!productDoc.exists) {
        // Remove invalid cart item
        await db.collection("cart").doc(doc.id).delete();
        continue;
      }

      const productData = productDoc.data();
      const itemTotal = productData.price * cartData.quantity;
      cartTotal += itemTotal;

      const item = {
        id: doc.id,
        cartId: cartData.cartId,
        productId: cartData.productId,
        productName: productData.name,
        productBrand: productData.brand,
        productPrice: productData.price,
        productImage: productData.images?.[0] || "",
        quantity: cartData.quantity,
        size: cartData.size,
        itemTotal,
        isAvailable: productData.isActive && productData.inventory >= cartData.quantity,
        maxQuantity: productData.inventory,
        addedAt: cartData.addedAt?.toDate()
      };

      cartItems.push(item);
    }

    // Calculate shipping
    const shippingCost = cartTotal >= 500 ? 0 : 50;
    const finalTotal = cartTotal + shippingCost;

    res.json({
      success: true,
      cart: {
        items: cartItems,
        summary: {
          itemCount: cartItems.length,
          subtotal: cartTotal,
          shippingCost,
          total: finalTotal,
          freeShippingThreshold: 500,
          qualifiesForFreeShipping: cartTotal >= 500
        }
      }
    });

  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({
      error: "Failed to fetch cart",
      message: error.message
    });
  }
});

// Clear entire cart
router.delete("/clear", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const cartQuery = await db.collection("cart")
      .where("userId", "==", userId)
      .get();

    if (cartQuery.empty) {
      return res.json({
        success: true,
        message: "Cart is already empty"
      });
    }

    // Delete all cart items
    const batch = db.batch();
    cartQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    res.json({
      success: true,
      message: "Cart cleared successfully",
      removedItems: cartQuery.size
    });

  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({
      error: "Failed to clear cart",
      message: error.message
    });
  }
});

// Get cart item count
router.get("/count", verifyAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const cartQuery = await db.collection("cart")
      .where("userId", "==", userId)
      .get();

    let totalItems = 0;
    cartQuery.docs.forEach(doc => {
      totalItems += doc.data().quantity;
    });

    res.json({
      success: true,
      count: totalItems
    });

  } catch (error) {
    console.error("Get cart count error:", error);
    res.status(500).json({
      error: "Failed to get cart count",
      message: error.message
    });
  }
});

module.exports = router;

