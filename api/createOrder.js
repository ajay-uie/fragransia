const express = require("express");
const { auth, db, admin } = require("../auth/firebaseConfig");
const { validateInput } = require("../utils/validateInput");
const { generateID } = require("../utils/generateID");
const orderManager = require("../database/orderManager");
const couponManager = require("../database/couponManager");
const razorpay = require("../logic/razorpayInstance");
const axios = require("axios"); // For Shiprocket API calls

const router = express.Router();

// Shiprocket API base URL and credentials
const SHIPROCKET_API_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL;
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD;
let shiprocketToken = null;

// Function to get Shiprocket auth token
async function getShiprocketToken() {
  try {
    const response = await axios.post(`${SHIPROCKET_API_BASE_URL}/auth/login`, {
      email: SHIPROCKET_EMAIL,
      password: SHIPROCKET_PASSWORD,
    });
    shiprocketToken = response.data.token;
    return shiprocketToken;
  } catch (error) {
    console.error("Error getting Shiprocket token:", error.response ? error.response.data : error.message);
    throw new Error("Failed to get Shiprocket authentication token.");
  }
}

// Middleware to ensure Shiprocket token is available
router.use(async (req, res, next) => {
  if (!shiprocketToken) {
    try {
      await getShiprocketToken();
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
  next();
});

router.post("/", async (req, res) => {
  try {
    const { items, userDetails, shippingAddress, billingAddress, couponCode, giftWrap, paymentMethod = "razorpay" } = req.body;

    // Validate input
    const validation = validateInput.validateOrder({
      items,
      userDetails,
      shippingAddress
    });

    if (!validation.isValid) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.errors
      });
    }

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Calculate order total
    let orderTotal = 0;
    const processedItems = [];

    for (const item of items) {
      // Get product details
      const productDoc = await db.collection("products").doc(item.productId).get();
      
      if (!productDoc.exists) {
        return res.status(404).json({ 
          error: "Product not found", 
          productId: item.productId 
        });
      }

      const product = productDoc.data();
      
      // Check inventory
      if (product.inventory < item.quantity) {
        return res.status(400).json({
          error: "Insufficient inventory",
          productId: item.productId,
          productName: product.name,
          available: product.inventory,
          requested: item.quantity
        });
      }

      const itemTotal = product.price * item.quantity;
      orderTotal += itemTotal;

      processedItems.push({
        productId: item.productId,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: itemTotal,
        image: product.images?.[0] || null,
        sku: product.sku,
        weight: product.weight || 0.5 // Assuming a default weight if not specified
      });
    }

    // Validate and apply coupon if provided
    let discountAmount = 0;
    let couponValidation = null;
    
    if (couponCode) {
      couponValidation = await couponManager.validateCoupon(
        couponCode, 
        userId, 
        orderTotal, 
        processedItems
      );
      
      if (!couponValidation.valid) {
        return res.status(400).json({
          error: "Invalid coupon",
          message: couponValidation.error
        });
      }
      
      discountAmount = couponValidation.coupon.discountAmount;
    }

    // Add gift wrap charge if selected
    const giftWrapCharge = giftWrap ? 50 : 0;

    // Calculate initial amounts before shipping
    const subtotal = orderTotal;
    const discount = discountAmount;
    const taxableAmount = orderTotal - discount + giftWrapCharge;
    const gst = Math.round(taxableAmount * 0.18); // 18% GST
    
    let shippingCharges = 0; 
    let finalAmount = taxableAmount + gst + shippingCharges;

    // Generate order ID
    const orderId = generateID.generateOrderId();

    // Create Shiprocket order first to get accurate shipping charges
    let shiprocketOrder = null;
    try {
      const shiprocketOrderData = {
        order_id: orderId,
        order_date: new Date().toISOString().split("T")[0],
        pickup_location: "Default", // TODO: This needs to be configured in Shiprocket or fetched dynamically
        channel_id: "", // TODO: Optional, if you have multiple channels, configure or fetch dynamically
        comment: "E-commerce Order",
        billing_customer_name: userDetails.name,
        billing_last_name: "",
        billing_address: billingAddress.address1,
        billing_address_2: billingAddress.address2 || "",
        billing_city: billingAddress.city,
        billing_pincode: billingAddress.pincode,
        billing_state: billingAddress.state,
        billing_country: billingAddress.country,
        billing_email: userDetails.email,
        billing_phone: userDetails.phone,
        shipping_customer_name: userDetails.name,
        shipping_last_name: "",
        shipping_address: shippingAddress.address1,
        shipping_address_2: shippingAddress.address2 || "",
        shipping_city: shippingAddress.city,
        shipping_pincode: shippingAddress.pincode,
        shipping_state: shippingAddress.state,
        shipping_country: shippingAddress.country,
        shipping_email: userDetails.email,
        shipping_phone: userDetails.phone,
        order_items: processedItems.map(item => ({
          name: item.name,
          sku: item.sku,
          units: item.quantity,
          selling_price: item.price,
          discount: 0,
          tax: 0,
          hsn: ""
        })),
        payment_method: paymentMethod === "razorpay" ? "Prepaid" : "COD",
        shipping_charges: 0, // Shiprocket will calculate
        giftwrap_charges: giftWrapCharge,
        transaction_charges: 0,
        total_discount: discount,
        sub_total: subtotal,
        length: 10, // Default values, ideally from product data
        breadth: 10,
        height: 10,
        weight: processedItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0),
      };

      const shiprocketResponse = await axios.post(`${SHIPROCKET_API_BASE_URL}/orders/create/adhoc`, shiprocketOrderData, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${shiprocketToken}`,
        },
      });
      shiprocketOrder = shiprocketResponse.data;
      console.log("Shiprocket Order Created:", shiprocketOrder);

      // Update shipping charges from Shiprocket response if available
      if (shiprocketOrder.data && shiprocketOrder.data.shipping_charges) {
        shippingCharges = shiprocketOrder.data.shipping_charges;
        finalAmount = taxableAmount + gst + shippingCharges;
      }

    } catch (shiprocketError) {
      console.error("Shiprocket order creation error:", shiprocketError.response ? shiprocketError.response.data : shiprocketError.message);
      return res.status(500).json({
        error: "Shipping integration error",
        message: "Failed to create shipment with Shiprocket."
      });
    }

    let razorpayOrderId = null;
    
    // Create Razorpay order if payment method is razorpay (after getting shipping charges)
    if (paymentMethod === "razorpay") {
      try {
        const razorpayOrder = await razorpay.orders.create({
          amount: Math.round(finalAmount * 100), // Amount in paise
          currency: "INR",
          receipt: orderId,
          notes: {
            userId: userId,
            couponCode: couponCode || "",
            giftWrap: giftWrap || false,
            orderType: "perfume_order"
          }
        });
        
        razorpayOrderId = razorpayOrder.id;
      } catch (razorpayError) {
        console.error("Razorpay order creation error:", razorpayError);
        return res.status(500).json({
          error: "Payment gateway error",
          message: "Failed to create payment order"
        });
      }
    }

    // Prepare order data for order manager
    const orderData = {
      items: processedItems,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      couponCode,
      giftWrap,
      paymentMethod,
      razorpayOrderId,
      shippingCost: shippingCharges,
      specialInstructions: req.body.specialInstructions || null,
      shiprocketOrder: shiprocketOrder, // Store Shiprocket order details
    };

    // Create order using order manager
    const orderResult = await orderManager.createOrder(orderData, userId);

    if (!orderResult.success) {
      return res.status(500).json({
        error: "Failed to create order",
        message: "Order creation failed"
      });
    }

    // Prepare response
    const response = {
      success: true,
      order: {
        orderId: orderResult.orderId,
        amount: finalAmount,
        currency: "INR"
      },
      orderDetails: {
        orderId: orderResult.orderId,
        items: processedItems,
        pricing: {
          subtotal,
          discount,
          giftWrapCharge,
          gst,
          shippingCharges,
          total: finalAmount
        },
        coupon: couponValidation?.coupon || null,
        giftWrap: giftWrap || false,
        estimatedDelivery: orderResult.order.shipping.estimatedDelivery,
        shiprocketOrderId: shiprocketOrder.order_id // Include Shiprocket order ID in response
      }
    };

    // Add Razorpay details if applicable
    if (paymentMethod === "razorpay" && razorpayOrderId) {
      response.payment = {
        razorpayOrderId,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
      };
    }

    res.status(201).json(response);

  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      error: "Failed to create order",
      message: error.message
    });
  }
});

module.exports = router;
