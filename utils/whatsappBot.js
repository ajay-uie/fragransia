const axios = require('axios');

// WhatsApp Bot utility functions
const whatsappBot = {
  
  // Send order notification via WhatsApp
  async sendOrderNotification(orderData) {
    try {
      if (!this.isWhatsAppConfigured()) {
        console.log('WhatsApp configuration not found, skipping WhatsApp notification');
        return { success: false, message: 'WhatsApp not configured' };
      }

      const phoneNumber = orderData.shipping?.address?.phone || orderData.userDetails?.phoneNumber;
      
      if (!phoneNumber) {
        console.log('No phone number found for WhatsApp notification');
        return { success: false, message: 'No phone number provided' };
      }

      const message = this.generateOrderMessage(orderData);
      
      return await this.sendMessage(phoneNumber, message);

    } catch (error) {
      console.error('Send WhatsApp order notification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send order status update via WhatsApp
  async sendOrderStatusUpdate(orderData, newStatus, trackingNumber = null) {
    try {
      if (!this.isWhatsAppConfigured()) {
        console.log('WhatsApp configuration not found, skipping WhatsApp notification');
        return { success: false, message: 'WhatsApp not configured' };
      }

      const phoneNumber = orderData.shipping?.address?.phone || orderData.userDetails?.phoneNumber;
      
      if (!phoneNumber) {
        console.log('No phone number found for WhatsApp notification');
        return { success: false, message: 'No phone number provided' };
      }

      const message = this.generateStatusUpdateMessage(orderData, newStatus, trackingNumber);
      
      return await this.sendMessage(phoneNumber, message);

    } catch (error) {
      console.error('Send WhatsApp status update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send generic WhatsApp message
  async sendMessage(phoneNumber, message, messageType = 'text') {
    try {
      const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      
      // Clean phone number format
      const cleanedPhone = phoneNumber.replace(/\D/g, '');
      const formattedPhone = cleanedPhone.startsWith('91') ? cleanedPhone : `91${cleanedPhone}`;

      let payload = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: messageType
      };

      if (messageType === 'text') {
        payload.text = {
          body: message
        };
      } else if (messageType === 'template') {
        payload.template = message;
      }

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return {
        success: true,
        messageId: response.data.messages[0].id,
        status: response.data.messages[0].message_status
      };

    } catch (error) {
      console.error('Send WhatsApp message error:', error);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  },

  // Send template message
  async sendTemplateMessage(phoneNumber, templateName, templateParams = []) {
    try {
      const templateMessage = {
        name: templateName,
        language: {
          code: 'en'
        },
        components: [
          {
            type: 'body',
            parameters: templateParams.map(param => ({
              type: 'text',
              text: param
            }))
          }
        ]
      };

      return await this.sendMessage(phoneNumber, templateMessage, 'template');

    } catch (error) {
      console.error('Send WhatsApp template message error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Check if WhatsApp is configured
  isWhatsAppConfigured() {
    return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  },

  // Generate order confirmation message
  generateOrderMessage(orderData) {
    const customerName = orderData.shipping?.address ? 
      `${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}` : 
      'Valued Customer';

    const itemsList = orderData.items.map(item => 
      `• ${item.name} (Qty: ${item.quantity}) - ₹${item.total || (item.price * item.quantity)}`
    ).join('\n');

    const estimatedDelivery = orderData.shipping?.estimatedDelivery ? 
      new Date(orderData.shipping.estimatedDelivery).toLocaleDateString() : 
      'Within 3-5 business days';

    return `🌟 *Fragransia Order Confirmation* 🌟

Hello ${customerName}!

Your order has been confirmed! 🎉

*Order Details:*
📋 Order ID: #${orderData.id}
📅 Date: ${new Date(orderData.orderDate || orderData.createdAt).toLocaleDateString()}
🚚 Estimated Delivery: ${estimatedDelivery}

*Items Ordered:*
${itemsList}

*Order Summary:*
💰 Subtotal: ₹${orderData.pricing.subtotal}
${orderData.pricing.discountAmount > 0 ? `🎫 Discount: -₹${orderData.pricing.discountAmount}\n` : ''}
📦 Shipping: ${orderData.pricing.shippingCost > 0 ? `₹${orderData.pricing.shippingCost}` : 'FREE'}
🧾 Tax: ₹${orderData.pricing.taxAmount}
*Total: ₹${orderData.pricing.total}*

*Delivery Address:*
📍 ${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}
${orderData.shipping.address.address}
${orderData.shipping.address.city}, ${orderData.shipping.address.state} - ${orderData.shipping.address.zipCode}

${orderData.giftWrap ? '🎁 Gift wrapping included\n' : ''}
${orderData.coupon?.code ? `🎫 Coupon applied: ${orderData.coupon.code}\n` : ''}

We'll keep you updated on your order status.

Thank you for choosing Fragransia! 🌸

Track your order: ${process.env.FRONTEND_URL}/orders/${orderData.id}`;
  },

  // Generate status update message
  generateStatusUpdateMessage(orderData, newStatus, trackingNumber = null) {
    const customerName = orderData.shipping?.address ? 
      `${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}` : 
      'Valued Customer';

    const statusEmojis = {
      pending: '⏳',
      confirmed: '✅',
      processing: '🔄',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '❌',
      refunded: '💰'
    };

    const statusMessages = {
      pending: 'Your order is pending confirmation.',
      confirmed: 'Your order has been confirmed and is being processed.',
      processing: 'Your order is being prepared for shipment.',
      shipped: 'Great news! Your order has been shipped and is on its way to you.',
      delivered: 'Your order has been delivered successfully. We hope you love your new fragrance!',
      cancelled: 'Your order has been cancelled as requested.',
      refunded: 'Your refund has been processed and will reflect in your account soon.'
    };

    let message = `${statusEmojis[newStatus] || '📋'} *Order Status Update*

Hello ${customerName}!

*Order ID:* #${orderData.id}
*Status:* ${newStatus.toUpperCase()}

${statusMessages[newStatus] || 'Your order status has been updated.'}`;

    if (trackingNumber && newStatus === 'shipped') {
      message += `\n\n📦 *Tracking Information:*
Tracking Number: ${trackingNumber}
Carrier: Standard Shipping

You can track your package using the tracking number above.`;
    }

    if (newStatus === 'delivered') {
      message += `\n\n⭐ We'd love to hear about your experience! Please consider leaving a review.`;
    }

    message += `\n\nThank you for shopping with Fragransia! 🌸

View order details: ${process.env.FRONTEND_URL}/orders/${orderData.id}`;

    return message;
  },

  // Send welcome message
  async sendWelcomeMessage(phoneNumber, userName) {
    try {
      const message = `🌟 *Welcome to Fragransia!* 🌟

Hello ${userName}!

Thank you for joining our community of fragrance lovers! 

🌸 Discover our premium collection of authentic fragrances
🚚 Enjoy fast and secure delivery
🎁 Get exclusive offers and discounts

As a welcome gift, use code *WELCOME10* for 10% off your first order!

Explore our collection: ${process.env.FRONTEND_URL}/products

Happy shopping! 🌸`;

      return await this.sendMessage(phoneNumber, message);

    } catch (error) {
      console.error('Send WhatsApp welcome message error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send delivery notification
  async sendDeliveryNotification(orderData, trackingInfo) {
    try {
      const customerName = orderData.shipping?.address ? 
        `${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}` : 
        'Valued Customer';

      const message = `🚚 *Out for Delivery!*

Hello ${customerName}!

Your Fragransia order is out for delivery and will reach you soon! 📦

*Order Details:*
📋 Order ID: #${orderData.id}
📦 Tracking Number: ${trackingInfo.trackingNumber || 'N/A'}
🕐 Expected Delivery: ${trackingInfo.expectedDelivery || 'Today'}

*Delivery Address:*
📍 ${orderData.shipping.address.address}
${orderData.shipping.address.city}, ${orderData.shipping.address.state} - ${orderData.shipping.address.zipCode}

Please be available to receive your package. Our delivery partner will contact you before delivery.

Thank you for choosing Fragransia! 🌸`;

      const phoneNumber = orderData.shipping?.address?.phone;
      
      return await this.sendMessage(phoneNumber, message);

    } catch (error) {
      console.error('Send WhatsApp delivery notification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send promotional message
  async sendPromotionalMessage(phoneNumber, promoData) {
    try {
      const { title, description, discountCode, validUntil, ctaLink } = promoData;

      const message = `🎉 *${title}*

${description}

${discountCode ? `🎫 Use code: *${discountCode}*\n` : ''}
${validUntil ? `⏰ Valid until: ${new Date(validUntil).toLocaleDateString()}\n` : ''}

${ctaLink ? `Shop now: ${ctaLink}\n` : ''}

Don't miss out on this amazing offer! 🌸

Fragransia Team`;

      return await this.sendMessage(phoneNumber, message);

    } catch (error) {
      console.error('Send WhatsApp promotional message error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send customer support message
  async sendSupportMessage(phoneNumber, supportData) {
    try {
      const { subject, message, ticketId } = supportData;

      const supportMessage = `🎧 *Customer Support*

Hello!

${subject ? `*Subject:* ${subject}\n` : ''}
${ticketId ? `*Ticket ID:* ${ticketId}\n` : ''}

${message}

Our support team will get back to you soon. For urgent queries, please call our helpline.

Thank you for contacting Fragransia! 🌸`;

      return await this.sendMessage(phoneNumber, supportMessage);

    } catch (error) {
      console.error('Send WhatsApp support message error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Handle incoming webhook
  async handleWebhook(webhookData) {
    try {
      const { entry } = webhookData;
      
      if (!entry || !entry[0] || !entry[0].changes) {
        return { success: false, message: 'Invalid webhook data' };
      }

      const changes = entry[0].changes[0];
      const value = changes.value;

      if (value.messages && value.messages[0]) {
        const message = value.messages[0];
        const from = message.from;
        const messageBody = message.text?.body;

        // Process incoming message
        return await this.processIncomingMessage(from, messageBody);
      }

      return { success: true, message: 'Webhook processed' };

    } catch (error) {
      console.error('Handle WhatsApp webhook error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Process incoming message
  async processIncomingMessage(phoneNumber, messageBody) {
    try {
      const lowerMessage = messageBody.toLowerCase();

      // Auto-reply based on message content
      if (lowerMessage.includes('order') || lowerMessage.includes('status')) {
        const reply = `Hello! 👋

To check your order status, please visit: ${process.env.FRONTEND_URL}/orders

You can also track your order using your order ID.

For further assistance, our customer support team is here to help!

Fragransia Team 🌸`;

        return await this.sendMessage(phoneNumber, reply);
      }

      if (lowerMessage.includes('help') || lowerMessage.includes('support')) {
        const reply = `🎧 *Customer Support*

We're here to help! 

📞 Call us: +91-XXXXXXXXXX
📧 Email: support@fragransia.com
🌐 Website: ${process.env.FRONTEND_URL}

Our support hours: 9 AM - 6 PM (Mon-Sat)

Fragransia Team 🌸`;

        return await this.sendMessage(phoneNumber, reply);
      }

      // Default auto-reply
      const defaultReply = `Hello! 👋

Thank you for contacting Fragransia! 

For quick assistance:
🛍️ Browse products: ${process.env.FRONTEND_URL}/products
📦 Track orders: ${process.env.FRONTEND_URL}/orders
🎧 Customer support: support@fragransia.com

We'll get back to you soon!

Fragransia Team 🌸`;

      return await this.sendMessage(phoneNumber, defaultReply);

    } catch (error) {
      console.error('Process incoming WhatsApp message error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Validate phone number format
  validatePhoneNumber(phoneNumber) {
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    // Check if it's a valid Indian mobile number
    if (cleanedPhone.length === 10 && cleanedPhone.match(/^[6-9]/)) {
      return { valid: true, formatted: `91${cleanedPhone}` };
    }
    
    if (cleanedPhone.length === 12 && cleanedPhone.startsWith('91')) {
      return { valid: true, formatted: cleanedPhone };
    }
    
    return { valid: false, formatted: null };
  },

  // Get message delivery status
  async getMessageStatus(messageId) {
    try {
      const url = `https://graph.facebook.com/v18.0/${messageId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        }
      });

      return {
        success: true,
        status: response.data
      };

    } catch (error) {
      console.error('Get WhatsApp message status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = { whatsappBot };
