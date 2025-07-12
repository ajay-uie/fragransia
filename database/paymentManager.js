const { db, admin, razorpay: mockRazorpay } = require("../auth/firebaseConfig");
const Razorpay = require("razorpay");
const { generateID } = require("../utils/generateID");
const orderManager = require("./orderManager");

class PaymentManager {
  constructor() {
    if (process.env.NODE_ENV === "production") {
      this.razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
    } else {
      this.razorpay = mockRazorpay;
    }
  }

  async createRazorpayOrder(amount, currency, receipt, notes) {
    try {
      const options = {
        amount: Math.round(amount * 100), // amount in the smallest currency unit
        currency,
        receipt,
        notes,
      };
      const order = await this.razorpay.orders.create(options);
      return { success: true, order, statusCode: 201 };
    } catch (error) {
      console.error("Error creating Razorpay order:", error);
      return { success: false, message: "Failed to create Razorpay order", error: error.message, statusCode: 500 };
    }
  }

  async verifyRazorpayPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId, userId) {
    try {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const crypto = require("crypto");
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature === razorpay_signature) {
        // Payment is successful, update order status
        const updateResult = await orderManager.updateOrderStatus(orderId, { status: "confirmed", notes: "Payment successful" }, userId);

        if (!updateResult.success) {
          return { success: false, message: "Failed to update order status after payment", statusCode: 500 };
        }

        // Save transaction details
        const transactionId = generateID.generateTransactionId();
        await db.collection("transactions").doc(transactionId).set({
          id: transactionId,
          orderId,
          userId,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          amount: updateResult.order.pricing.total,
          currency: "INR", // Assuming INR for now
          status: "captured",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { success: true, message: "Payment verified and order confirmed", order: updateResult.order, statusCode: 200 };
      } else {
        return { success: false, message: "Invalid signature", statusCode: 400 };
      }
    } catch (error) {
      console.error("Error verifying Razorpay payment:", error);
      return { success: false, message: "Failed to verify payment", error: error.message, statusCode: 500 };
    }
  }

  async getOrderPayments(orderId, userId, userRole) {
    try {
      const orderDoc = await db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) {
        return { success: false, message: "Order not found", statusCode: 404 };
      }

      const orderData = orderDoc.data();

      if (orderData.userId !== userId && !["admin", "staff"].includes(userRole)) {
        return { success: false, message: "Access denied", statusCode: 403 };
      }

      const paymentsSnapshot = await db.collection("transactions")
        .where("orderId", "==", orderId)
        .orderBy("createdAt", "desc")
        .get();

      const payments = [];
      paymentsSnapshot.forEach(doc => {
        payments.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate()?.toISOString()
        });
      });

      return { success: true, payments, orderPaymentStatus: orderData.payment, statusCode: 200 };
    } catch (error) {
      console.error("Error fetching order payments:", error);
      return { success: false, message: "Failed to fetch payment details", error: error.message, statusCode: 500 };
    }
  }

  async initiateRefund(paymentId, amount, reason, notes, userId) {
    try {
      const refundData = {
        amount: amount ? Math.round(amount * 100) : undefined,
        notes: {
          reason,
          processedBy: userId,
          ...notes
        }
      };

      const refund = await this.razorpay.payments.refund(paymentId, refundData);

      const refundRecordId = generateID.generateRefundId();
      await db.collection("refunds").doc(refundRecordId).set({
        id: refundRecordId,
        razorpayRefundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        reason,
        processedBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        razorpayData: refund
      });

      return { success: true, message: "Refund initiated successfully", refund: { ...refund, id: refundRecordId }, statusCode: 200 };
    } catch (error) {
      console.error("Error initiating refund:", error);
      return { success: false, message: "Error processing refund", error: error.message, statusCode: 500 };
    }
  }

  async getRefundStatus(refundId) {
    try {
      const refundDoc = await db.collection("refunds").doc(refundId).get();
      if (!refundDoc.exists) {
        return { success: false, message: "Refund not found", statusCode: 404 };
      }

      const refundData = refundDoc.data();

      const razorpayRefund = await this.razorpay.refunds.fetch(refundData.razorpayRefundId);

      if (razorpayRefund.status !== refundData.status) {
        await db.collection("refunds").doc(refundId).update({
          status: razorpayRefund.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        refundData.status = razorpayRefund.status;
      }

      return { success: true, refund: { ...refundData, currentStatus: razorpayRefund.status }, statusCode: 200 };
    } catch (error) {
      console.error("Error fetching refund status:", error);
      return { success: false, message: "Error fetching refund status", error: error.message, statusCode: 500 };
    }
  }

  async getPaymentMethods() {
    const paymentMethods = {
      razorpay: {
        enabled: true,
        methods: [
          "card",
          "netbanking",
          "wallet",
          "upi",
          "emi"
        ],
        cards: {
          visa: true,
          mastercard: true,
          amex: true,
          rupay: true
        },
        wallets: [
          "paytm",
          "phonepe",
          "googlepay",
          "amazonpay",
          "mobikwik"
        ],
        upi: {
          enabled: true,
          apps: [
            "googlepay",
            "phonepe",
            "paytm",
            "bhim"
          ]
        }
      },
      cod: {
        enabled: process.env.COD_ENABLED === "true",
        minAmount: parseFloat(process.env.COD_MIN_AMOUNT) || 0,
        maxAmount: parseFloat(process.env.COD_MAX_AMOUNT) || 5000,
        charges: parseFloat(process.env.COD_CHARGES) || 0
      }
    };
    return { success: true, paymentMethods, statusCode: 200 };
  }

  async getPaymentStats() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const todayPayments = await db.collection("transactions")
        .where("createdAt", ">=", startOfDay)
        .where("status", "==", "captured")
        .get();

      const monthPayments = await db.collection("transactions")
        .where("createdAt", ">=", startOfMonth)
        .where("status", "==", "captured")
        .get();

      let todayTotal = 0;
      let monthTotal = 0;
      let todayCount = 0;
      let monthCount = 0;

      todayPayments.forEach(doc => {
        const data = doc.data();
        todayTotal += data.amount || 0;
        todayCount++;
      });

      monthPayments.forEach(doc => {
        const data = doc.data();
        monthTotal += data.amount || 0;
        monthCount++;
      });

      const failedPayments = await db.collection("transactions")
        .where("createdAt", ">=", startOfMonth)
        .where("status", "==", "failed")
        .get();

      const stats = {
        today: {
          total: todayTotal,
          count: todayCount,
          average: todayCount > 0 ? todayTotal / todayCount : 0
        },
        month: {
          total: monthTotal,
          count: monthCount,
          average: monthCount > 0 ? monthTotal / monthCount : 0
        },
        failed: {
          count: failedPayments.size,
          rate: monthCount > 0 ? (failedPayments.size / (monthCount + failedPayments.size)) * 100 : 0
        }
      };

      return { success: true, stats, statusCode: 200 };
    } catch (error) {
      console.error("Error fetching payment stats:", error);
      return { success: false, message: "Failed to fetch payment statistics", error: error.message, statusCode: 500 };
    }
  }
}

module.exports = new PaymentManager();
