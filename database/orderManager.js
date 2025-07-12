const { auth, db, admin } = require("../auth/firebaseConfig");
const { generateID } = require("../utils/generateID");
const { sendEmail } = require("../utils/sendEmail");

class OrderManager {
  constructor() {
    this.db = db;
    this.auth = auth;
  }

  // Create new order
  async createOrder(orderData, userId) {
    try {
      const orderId = generateID.generateOrderId();
      
      // Validate order data
      if (!orderData.items || orderData.items.length === 0) {
        return { success: false, message: "Order must contain at least one item", statusCode: 400 };
      }

      // Calculate totals
      let subtotal = 0;
      const processedItems = [];

      for (const item of orderData.items) {
        const productDoc = await this.db.collection("products").doc(item.productId).get();
        
        if (!productDoc.exists) {
          return { success: false, message: `Product ${item.productId} not found`, statusCode: 404 };
        }

        const product = productDoc.data();
        
        // Check inventory
        if (product.inventory < item.quantity) {
          return { success: false, message: `Insufficient inventory for ${product.name}`, statusCode: 400 };
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        processedItems.push({
          productId: item.productId,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          total: itemTotal,
          sku: product.sku,
          image: product.images?.[0] || null
        });
      }

      // Calculate taxes and shipping
      const taxRate = 0.18; // 18% GST
      const taxAmount = subtotal * taxRate;
      const shippingCost = orderData.shippingCost || (subtotal > 500 ? 0 : 50);
      const total = subtotal + taxAmount + shippingCost;

      // Apply coupon if provided
      let discountAmount = 0;
      let couponCode = null;
      
      if (orderData.coupon?.code) {
        const couponDoc = await this.db.collection("coupons").doc(orderData.coupon.code).get();
        
        if (couponDoc.exists) {
          const coupon = couponDoc.data();
          
          if (coupon.isActive && new Date() <= coupon.expiryDate.toDate()) {
            if (coupon.type === "percentage") {
              discountAmount = (subtotal * coupon.value) / 100;
            } else {
              discountAmount = coupon.value;
            }
            
            // Apply maximum discount limit
            if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
              discountAmount = coupon.maxDiscount;
            }
            
            couponCode = orderData.coupon.code;
          }
        }
      }

      const finalTotal = total - discountAmount;

      // Create order object
      const order = {
        id: orderId,
        userId,
        items: processedItems,
        pricing: {
          subtotal,
          taxAmount,
          shippingCost,
          discountAmount,
          total: finalTotal
        },
        coupon: couponCode ? {
          code: couponCode,
          discountAmount
        } : null,
        shipping: {
          address: orderData.shipping.address,
          method: orderData.shipping.method || "standard",
          estimatedDelivery: this.calculateDeliveryDate(orderData.shipping.address)
        },
        billing: {
          address: orderData.billing?.address || orderData.shipping.address
        },
        payment: {
          method: orderData.payment?.method,
          status: "pending",
          razorpayOrderId: orderData.payment?.razorpayOrderId || null
        },
        status: "pending",
        orderDate: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: [{
          status: "pending",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          note: "Order created"
        }],
        giftWrap: orderData.giftWrap || false,
        specialInstructions: orderData.specialInstructions || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Save order to database
      await this.db.collection("orders").doc(orderId).set(order);

      // Update product inventory (reserve items)
      const batch = this.db.batch();
      
      for (const item of processedItems) {
        const productRef = this.db.collection("products").doc(item.productId);
        batch.update(productRef, {
          inventory: admin.firestore.FieldValue.increment(-item.quantity),
          totalSales: admin.firestore.FieldValue.increment(item.quantity)
        });
      }

      // Update coupon usage if applicable
      if (couponCode) {
        const couponRef = this.db.collection("coupons").doc(couponCode);
        batch.update(couponRef, {
          usageCount: admin.firestore.FieldValue.increment(1)
        });
      }

      await batch.commit();

      return {
        success: true,
        orderId,
        total: finalTotal,
        order,
        statusCode: 201
      };

    } catch (error) {
      console.error("Create order error:", error);
      return { success: false, message: "Failed to create order", error: error.message, statusCode: 500 };
    }
  }

  // Update order status
  async updateOrderStatus(orderId, updateData, updatedBy) {
    try {
      const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"];
      
      if (!validStatuses.includes(updateData.status)) {
        return { success: false, message: "Invalid order status", statusCode: 400 };
      }

      const orderDoc = await this.db.collection("orders").doc(orderId).get();
      
      if (!orderDoc.exists) {
        return { success: false, message: "Order not found", statusCode: 404 };
      }

      const order = orderDoc.data();
      const currentStatus = order.status;

      // Validate status transition
      if (!this.isValidStatusTransition(currentStatus, updateData.status)) {
        return { success: false, message: `Cannot change status from ${currentStatus} to ${updateData.status}`, statusCode: 400 };
      }

      // Update order
      const statusUpdate = {
        status: updateData.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: updateData.status,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          note: updateData.notes || "",
          updatedBy
        })
      };

      // Add tracking info for shipped orders
      if (updateData.status === "shipped") {
        statusUpdate.tracking = {
          trackingNumber: updateData.trackingNumber,
          carrier: "Standard Shipping",
          shippedAt: admin.firestore.FieldValue.serverTimestamp()
        };
      }

      await this.db.collection("orders").doc(orderId).update(statusUpdate);

      // Send notification email
      try {
        const userDoc = await this.db.collection("users").doc(order.userId).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          await sendEmail.sendOrderStatusUpdate({
            email: user.email,
            firstName: user.firstName,
            orderId,
            status: updateData.status,
            trackingNumber: updateData.status === "shipped" ? updateData.trackingNumber : null
          });
        }
      } catch (emailError) {
        console.error("Order status email error:", emailError);
        // Don't fail the status update if email fails
      }

      return {
        success: true,
        orderId,
        oldStatus: currentStatus,
        newStatus: updateData.status,
        order: { ...order, ...statusUpdate },
        statusCode: 200
      };

    } catch (error) {
      console.error("Update order status error:", error);
      return { success: false, message: "Failed to update order status", error: error.message, statusCode: 500 };
    }
  }

  // Get orders for user
  async getOrders(filters) {
    try {
      const { userId, limit = 20, page = 1, status, sort = "createdAt", order = "desc" } = filters;
      const offset = (page - 1) * limit;
      
      let ordersQuery = this.db.collection("orders");

      if (userId) {
        ordersQuery = ordersQuery.where("userId", "==", userId);
      }
      if (status) {
        ordersQuery = ordersQuery.where("status", "==", status);
      }

      ordersQuery = ordersQuery.orderBy(sort, order);
      ordersQuery = ordersQuery.limit(limit);
      ordersQuery = ordersQuery.offset(offset);

      const ordersSnapshot = await ordersQuery.get();

      const orders = [];
      ordersSnapshot.forEach(doc => {
        const orderData = doc.data();
        orders.push({
          id: doc.id,
          ...orderData,
          orderDate: orderData.orderDate?.toDate()?.toISOString(),
          createdAt: orderData.createdAt?.toDate()?.toISOString(),
          updatedAt: orderData.updatedAt?.toDate()?.toISOString()
        });
      });

      return {
        success: true,
        orders,
        pagination: {
          currentPage: page,
          hasMore: orders.length === limit
        },
        statusCode: 200
      };

    } catch (error) {
      console.error("Get orders error:", error);
      return { success: false, message: "Failed to retrieve orders", error: error.message, statusCode: 500 };
    }
  }

  // Get order by ID
  async getOrderById(orderId) {
    try {
      const orderDoc = await this.db.collection("orders").doc(orderId).get();
      
      if (!orderDoc.exists) {
        return { success: false, message: "Order not found", statusCode: 404 };
      }

      const order = orderDoc.data();

      return {
        success: true,
        order: {
          id: orderId,
          ...order,
          orderDate: order.orderDate?.toDate()?.toISOString(),
          createdAt: order.createdAt?.toDate()?.toISOString(),
          updatedAt: order.updatedAt?.toDate()?.toISOString()
        },
        statusCode: 200
      };

    } catch (error) {
      console.error("Get order by ID error:", error);
      return { success: false, message: "Failed to retrieve order", error: error.message, statusCode: 500 };
    }
  }

  // Cancel order
  async cancelOrder(orderId, userId, reason = "") {
    try {
      const orderDoc = await this.db.collection("orders").doc(orderId).get();
      
      if (!orderDoc.exists) {
        return { success: false, message: "Order not found", statusCode: 404 };
      }

      const order = orderDoc.data();

      // Check permissions (only owner or staff can cancel)
      const isOwner = order.userId === userId;
      const userDoc = await this.db.collection("users").doc(userId).get();
      const isStaff = userDoc.exists && ["admin", "staff"].includes(userDoc.data().role);

      if (!isOwner && !isStaff) {
        return { success: false, message: "Unauthorized to cancel this order", statusCode: 403 };
      }

      // Check if order can be cancelled
      const cancellableStatuses = ["pending", "confirmed"];
      if (!cancellableStatuses.includes(order.status) && !isStaff) {
        return { success: false, message: "Order cannot be cancelled at this stage", statusCode: 400 };
      }

      // Update order status
      const updateResult = await this.updateOrderStatus(orderId, { status: "cancelled", notes: reason }, userId);

      if (!updateResult.success) {
        return updateResult;
      }

      // Restore inventory
      const batch = this.db.batch();
      
      for (const item of order.items) {
        const productRef = this.db.collection("products").doc(item.productId);
        batch.update(productRef, {
          inventory: admin.firestore.FieldValue.increment(item.quantity),
          totalSales: admin.firestore.FieldValue.increment(-item.quantity)
        });
      }

      await batch.commit();

      return {
        success: true,
        message: "Order cancelled successfully",
        orderId,
        statusCode: 200
      };

    } catch (error) {
      console.error("Cancel order error:", error);
      return { success: false, message: "Failed to cancel order", error: error.message, statusCode: 500 };
    }
  }

  // Calculate delivery date
  calculateDeliveryDate(address) {
    const today = new Date();
    let deliveryDays = 7; // Default 7 days

    // Adjust based on location (simplified logic)
    if (address.city && address.city.toLowerCase().includes("mumbai")) {
      deliveryDays = 3;
    } else if (address.state && address.state.toLowerCase().includes("maharashtra")) {
      deliveryDays = 5;
    }

    const deliveryDate = new Date(today);
    deliveryDate.setDate(today.getDate() + deliveryDays);
    
    return deliveryDate;
  }

  // Validate status transition
  isValidStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      "pending": ["confirmed", "cancelled"],
      "confirmed": ["processing", "cancelled"],
      "processing": ["shipped", "cancelled"],
      "shipped": ["delivered"],
      "delivered": ["refunded"],
      "cancelled": [],
      "refunded": []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  // Get order analytics
  async getOrderAnalytics(startDate, endDate) {
    try {
      const ordersQuery = await this.db.collection("orders")
        .where("createdAt", ">=", startDate)
        .where("createdAt", "<=", endDate)
        .get();

      let totalOrders = 0;
      let totalRevenue = 0;
      let statusCounts = {};
      let topProducts = {};

      ordersQuery.forEach(doc => {
        const order = doc.data();
        totalOrders++;
        totalRevenue += order.pricing.total;

        // Count by status
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

        // Count products
        order.items.forEach(item => {
          if (!topProducts[item.productId]) {
            topProducts[item.productId] = {
              name: item.name,
              quantity: 0,
              revenue: 0
            };
          }
          topProducts[item.productId].quantity += item.quantity;
          topProducts[item.productId].revenue += item.total;
        });
      });

      // Sort top products
      const sortedProducts = Object.entries(topProducts)
        .sort(([,a], [,b]) => b.quantity - a.quantity)
        .slice(0, 10);

      return {
        success: true,
        analytics: {
          totalOrders,
          totalRevenue,
          averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          statusCounts,
          topProducts: sortedProducts
        },
        statusCode: 200
      };

    } catch (error) {
      console.error("Get order analytics error:", error);
      return { success: false, message: "Failed to retrieve order analytics", error: error.message, statusCode: 500 };
    }
  }

  async addOrderReviews(orderId, reviews, userId) {
    try {
      const orderDoc = await this.db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) {
        return { success: false, message: "Order not found", statusCode: 404 };
      }

      const order = orderDoc.data();

      if (order.userId !== userId) {
        return { success: false, message: "Access denied", statusCode: 403 };
      }

      if (order.status !== "delivered") {
        return { success: false, message: "You can only review delivered orders", statusCode: 400 };
      }

      const batch = this.db.batch();
      const newReviews = [];

      for (const review of reviews) {
        const productId = review.productId;
        const productRef = this.db.collection("products").doc(productId);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
          console.warn(`Product ${productId} not found for review.`);
          continue;
        }

        const currentProduct = productDoc.data();
        const newReviewCount = currentProduct.reviewCount + 1;
        const newAverageRating = ((currentProduct.averageRating * currentProduct.reviewCount) + review.rating) / newReviewCount;

        batch.update(productRef, {
          averageRating: newAverageRating,
          reviewCount: newReviewCount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const reviewId = generateID.generateReviewId();
        const reviewData = {
          id: reviewId,
          productId,
          userId,
          orderId,
          rating: review.rating,
          title: review.title || null,
          comment: review.comment || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(this.db.collection("reviews").doc(reviewId), reviewData);
        newReviews.push(reviewData);
      }

      await batch.commit();

      return { success: true, message: "Reviews added successfully", reviews: newReviews, statusCode: 200 };

    } catch (error) {
      console.error("Add order reviews error:", error);
      return { success: false, message: "Failed to add reviews", error: error.message, statusCode: 500 };
    }
  }

  async getUserOrderStats(userId) {
    try {
      const ordersSnapshot = await this.db.collection("orders")
        .where("userId", "==", userId)
        .get();

      let totalOrders = 0;
      let totalSpent = 0;
      let statusCounts = {};

      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        totalOrders++;
        totalSpent += order.pricing.total;
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      });

      return { success: true, stats: { totalOrders, totalSpent, statusCounts }, statusCode: 200 };

    } catch (error) {
      console.error("Get user order stats error:", error);
      return { success: false, message: "Failed to retrieve user order stats", error: error.message, statusCode: 500 };
    }
  }

  async reorderItems(originalOrder, reorderData) {
    try {
      const { shipping, selectedItems, userId } = reorderData;

      const itemsToReorder = selectedItems ? 
        originalOrder.items.filter(item => selectedItems.includes(item.productId)) :
        originalOrder.items;

      if (itemsToReorder.length === 0) {
        return { success: false, message: "No items selected for reorder", statusCode: 400 };
      }

      const newOrderData = {
        items: itemsToReorder.map(item => ({ productId: item.productId, quantity: item.quantity, price: item.price })),
        shipping: shipping || originalOrder.shipping,
        billing: originalOrder.billing,
        payment: originalOrder.payment,
        coupon: originalOrder.coupon,
        giftWrap: originalOrder.giftWrap,
        specialInstructions: originalOrder.specialInstructions
      };

      const result = await this.createOrder(newOrderData, userId);
      return result;

    } catch (error) {
      console.error("Reorder items error:", error);
      return { success: false, message: "Failed to reorder items", error: error.message, statusCode: 500 };
    }
  }

  async generateInvoice(order) {
    try {
      // This is a placeholder. In a real application, you would generate a PDF or HTML invoice.
      const invoice = {
        orderId: order.id,
        date: new Date().toISOString(),
        customer: order.userDetails,
        items: order.items,
        pricing: order.pricing,
        shippingAddress: order.shipping.address,
        billingAddress: order.billing.address,
        paymentMethod: order.payment.method,
        status: order.status
      };
      return { success: true, invoice, statusCode: 200 };
    } catch (error) {
      console.error("Generate invoice error:", error);
      return { success: false, message: "Failed to generate invoice", error: error.message, statusCode: 500 };
    }
  }
}

module.exports = new OrderManager();
