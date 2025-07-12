const Razorpay = require('razorpay');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'your-razorpay-key-id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your-razorpay-key-secret'
});

// Razorpay utility functions
const razorpayUtils = {
  
  // Create order
  async createOrder(orderData) {
    try {
      const options = {
        amount: orderData.amount * 100, // Amount in paise
        currency: orderData.currency || 'INR',
        receipt: orderData.receipt,
        notes: orderData.notes || {},
        payment_capture: 1 // Auto capture payment
      };

      const order = await razorpay.orders.create(options);
      return {
        success: true,
        order
      };
    } catch (error) {
      console.error('Razorpay create order error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Fetch order details
  async fetchOrder(orderId) {
    try {
      const order = await razorpay.orders.fetch(orderId);
      return {
        success: true,
        order
      };
    } catch (error) {
      console.error('Razorpay fetch order error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Fetch payment details
  async fetchPayment(paymentId) {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      return {
        success: true,
        payment
      };
    } catch (error) {
      console.error('Razorpay fetch payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Capture payment
  async capturePayment(paymentId, amount) {
    try {
      const payment = await razorpay.payments.capture(paymentId, amount * 100, 'INR');
      return {
        success: true,
        payment
      };
    } catch (error) {
      console.error('Razorpay capture payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Create refund
  async createRefund(paymentId, refundData) {
    try {
      const options = {
        amount: refundData.amount * 100, // Amount in paise
        speed: refundData.speed || 'normal', // normal, optimum
        notes: refundData.notes || {},
        receipt: refundData.receipt
      };

      const refund = await razorpay.payments.refund(paymentId, options);
      return {
        success: true,
        refund
      };
    } catch (error) {
      console.error('Razorpay create refund error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Fetch refund details
  async fetchRefund(refundId) {
    try {
      const refund = await razorpay.refunds.fetch(refundId);
      return {
        success: true,
        refund
      };
    } catch (error) {
      console.error('Razorpay fetch refund error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Verify webhook signature
  verifyWebhookSignature(body, signature, secret) {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  },

  // Generate payment link
  async createPaymentLink(linkData) {
    try {
      const options = {
        amount: linkData.amount * 100,
        currency: linkData.currency || 'INR',
        accept_partial: linkData.acceptPartial || false,
        first_min_partial_amount: linkData.firstMinPartialAmount ? linkData.firstMinPartialAmount * 100 : undefined,
        description: linkData.description,
        customer: {
          name: linkData.customer.name,
          email: linkData.customer.email,
          contact: linkData.customer.contact
        },
        notify: {
          sms: linkData.notify?.sms || true,
          email: linkData.notify?.email || true
        },
        reminder_enable: linkData.reminderEnable || true,
        notes: linkData.notes || {},
        callback_url: linkData.callbackUrl,
        callback_method: linkData.callbackMethod || 'get'
      };

      const paymentLink = await razorpay.paymentLink.create(options);
      return {
        success: true,
        paymentLink
      };
    } catch (error) {
      console.error('Razorpay create payment link error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Create QR code
  async createQRCode(qrData) {
    try {
      const options = {
        type: qrData.type || 'upi_qr',
        name: qrData.name,
        usage: qrData.usage || 'single_use',
        fixed_amount: qrData.fixedAmount || false,
        payment_amount: qrData.paymentAmount ? qrData.paymentAmount * 100 : undefined,
        description: qrData.description,
        customer_id: qrData.customerId,
        close_by: qrData.closeBy, // Unix timestamp
        notes: qrData.notes || {}
      };

      const qrCode = await razorpay.qrCode.create(options);
      return {
        success: true,
        qrCode
      };
    } catch (error) {
      console.error('Razorpay create QR code error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Create subscription
  async createSubscription(subscriptionData) {
    try {
      const options = {
        plan_id: subscriptionData.planId,
        customer_id: subscriptionData.customerId,
        total_count: subscriptionData.totalCount,
        quantity: subscriptionData.quantity || 1,
        start_at: subscriptionData.startAt, // Unix timestamp
        expire_by: subscriptionData.expireBy, // Unix timestamp
        addons: subscriptionData.addons || [],
        notes: subscriptionData.notes || {},
        notify_info: {
          notify_phone: subscriptionData.notifyInfo?.notifyPhone,
          notify_email: subscriptionData.notifyInfo?.notifyEmail
        }
      };

      const subscription = await razorpay.subscriptions.create(options);
      return {
        success: true,
        subscription
      };
    } catch (error) {
      console.error('Razorpay create subscription error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Validate VPA (Virtual Payment Address)
  async validateVPA(vpa) {
    try {
      const validation = await razorpay.addons.fetch(vpa);
      return {
        success: true,
        validation
      };
    } catch (error) {
      console.error('Razorpay VPA validation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Get payment methods
  getPaymentMethods() {
    return {
      card: {
        name: 'Credit/Debit Card',
        types: ['visa', 'mastercard', 'amex', 'diners', 'rupay']
      },
      netbanking: {
        name: 'Net Banking',
        banks: ['sbi', 'hdfc', 'icici', 'axis', 'kotak', 'ybl', 'other']
      },
      wallet: {
        name: 'Wallets',
        providers: ['paytm', 'phonepe', 'googlepay', 'amazonpay', 'freecharge']
      },
      upi: {
        name: 'UPI',
        providers: ['googlepay', 'phonepe', 'paytm', 'bhim', 'other']
      },
      emi: {
        name: 'EMI',
        types: ['credit_card', 'debit_card', 'cardless']
      },
      paylater: {
        name: 'Pay Later',
        providers: ['simpl', 'lazypay', 'olamoney']
      }
    };
  },

  // Format amount for display
  formatAmount(amount, currency = 'INR') {
    const formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    });
    return formatter.format(amount);
  },

  // Convert paise to rupees
  paiseToRupees(paise) {
    return paise / 100;
  },

  // Convert rupees to paise
  rupeesToPaise(rupees) {
    return Math.round(rupees * 100);
  }
};

module.exports = razorpay;
module.exports.utils = razorpayUtils;
