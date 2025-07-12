const admin = require('firebase-admin');

const cartLogic = {
  
  // Add item to cart
  async addToCart(userId, productId, quantity = 1, options = {}) {
    try {
      const db = admin.firestore();

      // Validate product exists and is active
      const productDoc = await db.collection('products').doc(productId).get();
      if (!productDoc.exists) {
        return {
          success: false,
          error: 'Product not found'
        };
      }

      const product = productDoc.data();
      if (!product.isActive) {
        return {
          success: false,
          error: 'Product is not available'
        };
      }

      // Check inventory
      if (product.inventory < quantity) {
        return {
          success: false,
          error: 'Insufficient inventory',
          available: product.inventory
        };
      }

      // Get or create cart
      const cartRef = db.collection('cart').doc(userId);
      const cartDoc = await cartRef.get();

      let cartData;
      if (cartDoc.exists) {
        cartData = cartDoc.data();
      } else {
        cartData = {
          userId,
          items: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
      }

      // Check if item already exists in cart
      const existingItemIndex = cartData.items.findIndex(item => 
        item.productId === productId && 
        JSON.stringify(item.options) === JSON.stringify(options)
      );

      if (existingItemIndex !== -1) {
        // Update existing item quantity
        const newQuantity = cartData.items[existingItemIndex].quantity + quantity;
        
        // Check total inventory
        if (product.inventory < newQuantity) {
          return {
            success: false,
            error: 'Insufficient inventory for total quantity',
            available: product.inventory,
            currentInCart: cartData.items[existingItemIndex].quantity
          };
        }

        cartData.items[existingItemIndex].quantity = newQuantity;
        cartData.items[existingItemIndex].subtotal = newQuantity * product.price;
      } else {
        // Add new item
        const cartItem = {
          productId,
          name: product.name,
          price: product.price,
          quantity,
          subtotal: quantity * product.price,
          image: product.images?.[0] || null,
          sku: product.sku,
          options,
          addedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        cartData.items.push(cartItem);
      }

      // Update cart totals
      cartData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      
      await cartRef.set(cartData);

      // Calculate cart summary
      const cartSummary = this.calculateCartSummary(cartData);

      return {
        success: true,
        cart: {
          ...cartData,
          summary: cartSummary
        }
      };

    } catch (error) {
      console.error('Add to cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Update cart item quantity
  async updateCartItem(userId, productId, quantity, options = {}) {
    try {
      if (quantity <= 0) {
        return this.removeFromCart(userId, productId, options);
      }

      const db = admin.firestore();

      // Validate product and inventory
      const productDoc = await db.collection('products').doc(productId).get();
      if (!productDoc.exists) {
        return {
          success: false,
          error: 'Product not found'
        };
      }

      const product = productDoc.data();
      if (product.inventory < quantity) {
        return {
          success: false,
          error: 'Insufficient inventory',
          available: product.inventory
        };
      }

      // Get cart
      const cartRef = db.collection('cart').doc(userId);
      const cartDoc = await cartRef.get();

      if (!cartDoc.exists) {
        return {
          success: false,
          error: 'Cart not found'
        };
      }

      const cartData = cartDoc.data();
      const itemIndex = cartData.items.findIndex(item => 
        item.productId === productId && 
        JSON.stringify(item.options) === JSON.stringify(options)
      );

      if (itemIndex === -1) {
        return {
          success: false,
          error: 'Item not found in cart'
        };
      }

      // Update item
      cartData.items[itemIndex].quantity = quantity;
      cartData.items[itemIndex].subtotal = quantity * product.price;
      cartData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await cartRef.set(cartData);

      const cartSummary = this.calculateCartSummary(cartData);

      return {
        success: true,
        cart: {
          ...cartData,
          summary: cartSummary
        }
      };

    } catch (error) {
      console.error('Update cart item error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Remove item from cart
  async removeFromCart(userId, productId, options = {}) {
    try {
      const db = admin.firestore();

      const cartRef = db.collection('cart').doc(userId);
      const cartDoc = await cartRef.get();

      if (!cartDoc.exists) {
        return {
          success: false,
          error: 'Cart not found'
        };
      }

      const cartData = cartDoc.data();
      cartData.items = cartData.items.filter(item => 
        !(item.productId === productId && 
          JSON.stringify(item.options) === JSON.stringify(options))
      );

      cartData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await cartRef.set(cartData);

      const cartSummary = this.calculateCartSummary(cartData);

      return {
        success: true,
        cart: {
          ...cartData,
          summary: cartSummary
        }
      };

    } catch (error) {
      console.error('Remove from cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Get cart
  async getCart(userId) {
    try {
      const db = admin.firestore();

      const cartDoc = await db.collection('cart').doc(userId).get();

      if (!cartDoc.exists) {
        return {
          success: true,
          cart: {
            userId,
            items: [],
            summary: {
              itemCount: 0,
              subtotal: 0,
              total: 0
            }
          }
        };
      }

      const cartData = cartDoc.data();
      
      // Validate items and update prices if needed
      const updatedItems = [];
      let needsUpdate = false;

      for (const item of cartData.items) {
        const productDoc = await db.collection('products').doc(item.productId).get();
        
        if (productDoc.exists) {
          const product = productDoc.data();
          
          if (product.isActive) {
            // Check if price has changed
            if (item.price !== product.price) {
              item.price = product.price;
              item.subtotal = item.quantity * product.price;
              needsUpdate = true;
            }
            
            // Check inventory
            if (product.inventory < item.quantity) {
              item.quantity = Math.max(0, product.inventory);
              item.subtotal = item.quantity * product.price;
              needsUpdate = true;
            }
            
            updatedItems.push(item);
          } else {
            // Remove inactive products
            needsUpdate = true;
          }
        } else {
          // Remove deleted products
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        cartData.items = updatedItems;
        cartData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('cart').doc(userId).set(cartData);
      }

      const cartSummary = this.calculateCartSummary(cartData);

      return {
        success: true,
        cart: {
          ...cartData,
          summary: cartSummary,
          createdAt: cartData.createdAt?.toDate()?.toISOString(),
          updatedAt: cartData.updatedAt?.toDate()?.toISOString()
        }
      };

    } catch (error) {
      console.error('Get cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Clear cart
  async clearCart(userId) {
    try {
      const db = admin.firestore();

      await db.collection('cart').doc(userId).delete();

      return {
        success: true,
        message: 'Cart cleared successfully'
      };

    } catch (error) {
      console.error('Clear cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Calculate cart summary
  calculateCartSummary(cartData) {
    const itemCount = cartData.items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cartData.items.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Calculate shipping (free above ₹500)
    const shippingCharges = subtotal >= 500 ? 0 : 40;
    
    // Calculate GST (18%)
    const gst = Math.round((subtotal + shippingCharges) * 0.18);
    
    const total = subtotal + shippingCharges + gst;

    return {
      itemCount,
      subtotal,
      shippingCharges,
      gst,
      total,
      freeShippingEligible: subtotal >= 500,
      freeShippingThreshold: 500
    };
  },

  // Apply coupon to cart
  async applyCouponToCart(userId, couponCode) {
    try {
      const cartResult = await this.getCart(userId);
      if (!cartResult.success) {
        return cartResult;
      }

      const cart = cartResult.cart;
      
      if (cart.items.length === 0) {
        return {
          success: false,
          error: 'Cart is empty'
        };
      }

      const db = admin.firestore();

      // Get coupon
      const couponDoc = await db.collection('coupons').doc(couponCode.toUpperCase()).get();
      if (!couponDoc.exists) {
        return {
          success: false,
          error: 'Invalid coupon code'
        };
      }

      const coupon = couponDoc.data();

      // Validate coupon
      if (!coupon.isActive) {
        return {
          success: false,
          error: 'Coupon is inactive'
        };
      }

      const now = new Date();
      if (now > coupon.expiryDate.toDate()) {
        return {
          success: false,
          error: 'Coupon has expired'
        };
      }

      if (cart.summary.subtotal < coupon.minOrderValue) {
        return {
          success: false,
          error: `Minimum order value of ₹${coupon.minOrderValue} required`,
          minOrderValue: coupon.minOrderValue
        };
      }

      // Calculate discount
      let discountAmount = 0;
      if (coupon.type === 'percentage') {
        discountAmount = (cart.summary.subtotal * coupon.value) / 100;
        if (coupon.maxDiscount) {
          discountAmount = Math.min(discountAmount, coupon.maxDiscount);
        }
      } else {
        discountAmount = Math.min(coupon.value, cart.summary.subtotal);
      }

      discountAmount = Math.round(discountAmount * 100) / 100;

      // Recalculate totals with discount
      const discountedSubtotal = cart.summary.subtotal - discountAmount;
      const shippingCharges = discountedSubtotal >= 500 ? 0 : 40;
      const gst = Math.round((discountedSubtotal + shippingCharges) * 0.18);
      const total = discountedSubtotal + shippingCharges + gst;

      return {
        success: true,
        coupon: {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          description: coupon.description
        },
        discount: {
          amount: discountAmount,
          percentage: Math.round((discountAmount / cart.summary.subtotal) * 100 * 100) / 100
        },
        summary: {
          ...cart.summary,
          originalSubtotal: cart.summary.subtotal,
          discountAmount,
          discountedSubtotal,
          shippingCharges,
          gst,
          total
        }
      };

    } catch (error) {
      console.error('Apply coupon to cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Save cart for later (move to wishlist)
  async saveForLater(userId, productId, options = {}) {
    try {
      const db = admin.firestore();

      // Remove from cart
      const removeResult = await this.removeFromCart(userId, productId, options);
      if (!removeResult.success) {
        return removeResult;
      }

      // Add to wishlist
      const wishlistRef = db.collection('wishlist').doc(userId);
      const wishlistDoc = await wishlistRef.get();

      let wishlistData;
      if (wishlistDoc.exists) {
        wishlistData = wishlistDoc.data();
      } else {
        wishlistData = {
          userId,
          items: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
      }

      // Check if item already in wishlist
      const existingIndex = wishlistData.items.findIndex(item => 
        item.productId === productId && 
        JSON.stringify(item.options) === JSON.stringify(options)
      );

      if (existingIndex === -1) {
        // Get product details
        const productDoc = await db.collection('products').doc(productId).get();
        if (productDoc.exists) {
          const product = productDoc.data();
          
          wishlistData.items.push({
            productId,
            name: product.name,
            price: product.price,
            image: product.images?.[0] || null,
            options,
            addedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      wishlistData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await wishlistRef.set(wishlistData);

      return {
        success: true,
        message: 'Item saved for later'
      };

    } catch (error) {
      console.error('Save for later error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Move item from wishlist to cart
  async moveToCart(userId, productId, options = {}) {
    try {
      const db = admin.firestore();

      // Remove from wishlist
      const wishlistRef = db.collection('wishlist').doc(userId);
      const wishlistDoc = await wishlistRef.get();

      if (wishlistDoc.exists) {
        const wishlistData = wishlistDoc.data();
        wishlistData.items = wishlistData.items.filter(item => 
          !(item.productId === productId && 
            JSON.stringify(item.options) === JSON.stringify(options))
        );
        wishlistData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await wishlistRef.set(wishlistData);
      }

      // Add to cart
      return this.addToCart(userId, productId, 1, options);

    } catch (error) {
      console.error('Move to cart error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = cartLogic;
