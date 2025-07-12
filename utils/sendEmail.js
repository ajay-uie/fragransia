const nodemailer = require("nodemailer");

// Email utility functions
const sendEmail = {
  
  // Initialize email transporter
  createTransporter() {
    const emailService = process.env.EMAIL_SERVICE || "gmail";
    
    if (emailService === "sendgrid") {
      return nodemailer.createTransport({
        service: "SendGrid",
        auth: {
          user: "apikey",
          pass: process.env.SENDGRID_API_KEY
        }
      });
    } else if (emailService === "smtp") {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // Default to Gmail
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    }
  },

  // Send order confirmation email
  async sendOrderConfirmation(emailData) {
    try {
      if (!this.isEmailConfigured()) {
        console.log("Email configuration not found, skipping email notification");
        return { success: true, message: "Email not configured" }; // Changed to success: true
      }

      const transporter = this.createTransporter();
      
      const mailOptions = {
        from: `"Fragransia" <${process.env.EMAIL_USER}>`,
        to: emailData.email,
        subject: `Order Confirmation - #${emailData.orderId}`,
        html: this.generateOrderConfirmationHTML(emailData),
        text: this.generateOrderConfirmationText(emailData)
      };

      const result = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error("Send order confirmation email error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send order status update email
  async sendOrderStatusUpdate(emailData) {
    try {
      if (!this.isEmailConfigured()) {
        console.log("Email configuration not found, skipping email notification");
        return { success: true, message: "Email not configured" }; // Changed to success: true
      }

      const transporter = this.createTransporter();
      
      const mailOptions = {
        from: `"Fragransia" <${process.env.EMAIL_USER}>`,
        to: emailData.email,
        subject: `Order Update - #${emailData.orderId}`,
        html: this.generateOrderStatusHTML(emailData),
        text: this.generateOrderStatusText(emailData)
      };

      const result = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error("Send order status email error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send welcome email
  async sendWelcomeEmail(emailData) {
    try {
      if (!this.isEmailConfigured()) {
        console.log("Email configuration not found, skipping welcome email");
        return { success: true, message: "Email not configured" }; // Changed to success: true
      }

      const transporter = this.createTransporter();
      
      const mailOptions = {
        from: `"Fragransia" <${process.env.EMAIL_USER}>`,
        to: emailData.email,
        subject: "Welcome to Fragransia! 🌸",
        html: this.generateWelcomeHTML(emailData),
        text: this.generateWelcomeText(emailData)
      };

      const result = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error("Send welcome email error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send password reset email
  async sendPasswordReset(emailData) {
    try {
      if (!this.isEmailConfigured()) {
        console.log("Email configuration not found, skipping password reset email");
        return { success: true, message: "Email not configured" }; // Changed to success: true
      }

      const transporter = this.createTransporter();
      
      const mailOptions = {
        from: `"Fragransia" <${process.env.EMAIL_USER}>`,
        to: emailData.email,
        subject: "Reset Your Fragransia Password",
        html: this.generatePasswordResetHTML(emailData),
        text: this.generatePasswordResetText(emailData)
      };

      const result = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error("Send password reset email error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Send promotional email
  async sendPromotionalEmail(emailData) {
    try {
      if (!this.isEmailConfigured()) {
        console.log("Email configuration not found, skipping promotional email");
        return { success: true, message: "Email not configured" }; // Changed to success: true
      }

      const transporter = this.createTransporter();
      
      const mailOptions = {
        from: `"Fragransia" <${process.env.EMAIL_USER}>`,
        to: emailData.email,
        subject: emailData.subject,
        html: this.generatePromotionalHTML(emailData),
        text: this.generatePromotionalText(emailData)
      };

      const result = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId
      };

    } catch (error) {
      console.error("Send promotional email error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Check if email is configured
  isEmailConfigured() {
    const emailService = process.env.EMAIL_SERVICE || "gmail";
    
    if (emailService === "sendgrid") {
      return !!process.env.SENDGRID_API_KEY;
    } else if (emailService === "smtp") {
      return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    } else {
      return !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
    }
  },

  // Generate order confirmation HTML
  generateOrderConfirmationHTML(emailData) {
    const { firstName, orderId, orderData } = emailData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 30px 20px; }
          .order-info { 
            background-color: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
          }
          .item { 
            border-bottom: 1px solid #eee; 
            padding: 15px 0; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
          }
          .item:last-child { border-bottom: none; }
          .item-details { flex: 1; }
          .item-price { font-weight: bold; color: #667eea; }
          .total-section { 
            background-color: #667eea; 
            color: white; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
          }
          .total-row { 
            display: flex; 
            justify-content: space-between; 
            margin: 5px 0; 
          }
          .total-final { 
            font-size: 20px; 
            font-weight: bold; 
            border-top: 1px solid rgba(255,255,255,0.3); 
            padding-top: 10px; 
            margin-top: 10px; 
          }
          .address-section { 
            background-color: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
          }
          .footer { 
            background-color: #343a40; 
            color: white; 
            padding: 20px; 
            text-align: center; 
          }
          .btn { 
            display: inline-block; 
            background-color: #667eea; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 0; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🌸 Order Confirmed!</h1>
            <p>Thank you for your order, ${firstName}!</p>
          </div>
          
          <div class="content">
            <div class="order-info">
              <h2>Order Details</h2>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${new Date(orderData.orderDate || orderData.createdAt).toLocaleDateString()}</p>
              <p><strong>Payment Status:</strong> ${orderData.payment?.status || 'Completed'}</p>
              ${orderData.shipping?.estimatedDelivery ? 
                `<p><strong>Estimated Delivery:</strong> ${new Date(orderData.shipping.estimatedDelivery).toLocaleDateString()}</p>` : 
                ''
              }
            </div>
            
            <h3>Items Ordered:</h3>
            ${orderData.items.map(item => `
              <div class="item">
                <div class="item-details">
                  <strong>${item.name}</strong><br>
                  <small>SKU: ${item.sku || 'N/A'}</small><br>
                  <small>Quantity: ${item.quantity}</small>
                </div>
                <div class="item-price">₹${item.total || (item.price * item.quantity)}</div>
              </div>
            `).join('')}
            
            <div class="total-section">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>₹${orderData.pricing.subtotal}</span>
              </div>
              ${orderData.pricing.discountAmount > 0 ? `
                <div class="total-row">
                  <span>Discount:</span>
                  <span>-₹${orderData.pricing.discountAmount}</span>
                </div>
              ` : ''}
              <div class="total-row">
                <span>Tax (GST):</span>
                <span>₹${orderData.pricing.taxAmount}</span>
              </div>
              <div class="total-row">
                <span>Shipping:</span>
                <span>${orderData.pricing.shippingCost > 0 ? `₹${orderData.pricing.shippingCost}` : 'FREE'}</span>
              </div>
              <div class="total-row total-final">
                <span>Total Amount:</span>
                <span>₹${orderData.pricing.total}</span>
              </div>
            </div>
            
            <div class="address-section">
              <h3>Shipping Address:</h3>
              <p><strong>${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}</strong></p>
              <p>${orderData.shipping.address.address}</p>
              <p>${orderData.shipping.address.city}, ${orderData.shipping.address.state} - ${orderData.shipping.address.zipCode}</p>
              <p>Phone: ${orderData.shipping.address.phone}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/orders/${orderId}" class="btn">Track Your Order</a>
            </div>
            
            <p>We'll send you updates as your order is processed and shipped. If you have any questions, feel free to contact our customer support.</p>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing Fragransia! 🌸</p>
            <p>Follow us on social media for the latest updates and offers.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  // Generate order confirmation text
  generateOrderConfirmationText(emailData) {
    const { firstName, orderId, orderData } = emailData;
    
    return `
Order Confirmation - Fragransia

Dear ${firstName},

Thank you for your order! Your order has been confirmed and is being processed.

Order Details:
- Order ID: #${orderId}
- Order Date: ${new Date(orderData.orderDate || orderData.createdAt).toLocaleDateString()}
- Total Amount: ₹${orderData.pricing.total}

Items Ordered:
${orderData.items.map(item => `- ${item.name} (Qty: ${item.quantity}) - ₹${item.total || (item.price * item.quantity)}`).join('\n')}

Shipping Address:
${orderData.shipping.address.firstName} ${orderData.shipping.address.lastName}
${orderData.shipping.address.address}
${orderData.shipping.address.city}, ${orderData.shipping.address.state} - ${orderData.shipping.address.zipCode}
Phone: ${orderData.shipping.address.phone}

We'll send you updates as your order is processed and shipped.

Thank you for choosing Fragransia!

Visit: ${process.env.FRONTEND_URL}
    `;
  },

  // Generate order status update HTML
  generateOrderStatusHTML(emailData) {
    const { firstName, orderId, status, trackingNumber } = emailData;
    
    const statusMessages = {
      confirmed: 'Your order has been confirmed and is being processed.',
      processing: 'Your order is being prepared for shipment.',
      shipped: 'Great news! Your order has been shipped and is on its way to you.',
      delivered: 'Your order has been delivered successfully. We hope you love your new fragrance!',
      cancelled: 'Your order has been cancelled as requested.'
    };

    const statusColors = {
      confirmed: '#28a745',
      processing: '#ffc107',
      shipped: '#17a2b8',
      delivered: '#28a745',
      cancelled: '#dc3545'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Status Update</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .content { padding: 30px 20px; }
          .status-update { 
            background-color: ${statusColors[status] || '#667eea'}; 
            color: white; 
            padding: 25px; 
            border-radius: 8px; 
            margin: 20px 0; 
            text-align: center; 
          }
          .status-update h2 { margin: 0 0 10px 0; font-size: 24px; }
          .btn { 
            display: inline-block; 
            background-color: #667eea; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 0; 
          }
          .footer { 
            background-color: #343a40; 
            color: white; 
            padding: 20px; 
            text-align: center; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Order Status Update</h1>
          </div>
          
          <div class="content">
            <p>Dear ${firstName},</p>
            
            <div class="status-update">
              <h2>Order #${orderId}</h2>
              <p><strong>Status: ${status.toUpperCase()}</strong></p>
              <p>${statusMessages[status] || 'Your order status has been updated.'}</p>
              ${trackingNumber ? `<p><strong>Tracking Number:</strong> ${trackingNumber}</p>` : ''}
            </div>
            
            ${status === 'shipped' && trackingNumber ? `
              <p>You can track your package using the tracking number provided above or click the button below:</p>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/orders/${orderId}" class="btn">View Order Details</a>
            </div>
            
            <p>If you have any questions about your order, please don't hesitate to contact our customer support team.</p>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing Fragransia! 🌸</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  // Generate order status update text
  generateOrderStatusText(emailData) {
    const { firstName, orderId, status, trackingNumber } = emailData;
    
    const statusMessages = {
      confirmed: 'Your order has been confirmed and is being processed.',
      processing: 'Your order is being prepared for shipment.',
      shipped: 'Great news! Your order has been shipped and is on its way to you.',
      delivered: 'Your order has been delivered successfully. We hope you love your new fragrance!',
      cancelled: 'Your order has been cancelled as requested.'
    };

    return `
Order Status Update - Fragransia

Dear ${firstName},

Your order #${orderId} status has been updated.

Status: ${status.toUpperCase()}
${statusMessages[status] || 'Your order status has been updated.'}

${trackingNumber ? `Tracking Number: ${trackingNumber}` : ''}

View your order details: ${process.env.FRONTEND_URL}/orders/${orderId}

Thank you for choosing Fragransia!
    `;
  },

  // Generate welcome email HTML
  generateWelcomeHTML(emailData) {
    const { firstName, verificationLink } = emailData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Fragransia</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px 20px; 
            text-align: center; 
          }
          .content { padding: 30px 20px; }
          .welcome-section { 
            text-align: center; 
            margin: 30px 0; 
          }
          .btn { 
            display: inline-block; 
            background-color: #667eea; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
            font-weight: bold; 
          }
          .features { 
            display: flex; 
            flex-wrap: wrap; 
            margin: 30px 0; 
          }
          .feature { 
            flex: 1; 
            min-width: 200px; 
            padding: 20px; 
            text-align: center; 
          }
          .footer { 
            background-color: #343a40; 
            color: white; 
            padding: 20px; 
            text-align: center; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🌸 Welcome to Fragransia!</h1>
            <p>Your journey to finding the perfect fragrance begins here</p>
          </div>
          
          <div class="content">
            <div class="welcome-section">
              <h2>Hello ${firstName}!</h2>
              <p>We're thrilled to have you join the Fragransia family. Get ready to discover an exquisite collection of premium fragrances that will captivate your senses.</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${verificationLink}" class="btn">Verify Your Email</a>
            </div>

            <div class="features">
              <div class="feature">
                <h3>🎁 Premium Quality</h3>
                <p>Authentic fragrances from top brands worldwide</p>
              </div>
              <div class="feature">
                <h3>🚚 Fast Delivery</h3>
                <p>Quick and secure delivery to your doorstep</p>
              </div>
              <div class="feature">
                <h3>💝 Special Offers</h3>
                <p>Exclusive deals and discounts for our members</p>
              </div>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/products" class="btn">Explore Our Collection</a>
            </div>
            
            <p>As a welcome gift, use code <strong>WELCOME10</strong> to get 10% off on your first order!</p>
            
            <p>If you have any questions, our customer support team is always here to help.</p>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing Fragransia! 🌸</p>
            <p>Follow us on social media for the latest updates and exclusive offers.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  // Generate welcome email text
  generateWelcomeText(emailData) {
    const { firstName, verificationLink } = emailData;
    
    return `
Welcome to Fragransia!

Hello ${firstName}!

We're thrilled to have you join the Fragransia family. Get ready to discover an exquisite collection of premium fragrances that will captivate your senses.

Verify your email: ${verificationLink}

What makes Fragransia special:
- Premium Quality: Authentic fragrances from top brands worldwide
- Fast Delivery: Quick and secure delivery to your doorstep  
- Special Offers: Exclusive deals and discounts for our members

As a welcome gift, use code WELCOME10 to get 10% off on your first order!

Explore our collection: ${process.env.FRONTEND_URL}/products

If you have any questions, our customer support team is always here to help.

Thank you for choosing Fragransia!
    `;
  },

  // Generate password reset HTML
  generatePasswordResetHTML(emailData) {
    const { firstName, resetLink, expiryTime } = emailData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .content { padding: 30px 20px; }
          .reset-section { 
            background-color: #f8f9fa; 
            padding: 25px; 
            border-radius: 8px; 
            margin: 20px 0; 
            text-align: center; 
          }
          .btn { 
            display: inline-block; 
            background-color: #dc3545; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
            font-weight: bold; 
          }
          .warning { 
            background-color: #fff3cd; 
            border: 1px solid #ffeaa7; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 20px 0; 
          }
          .footer { 
            background-color: #343a40; 
            color: white; 
            padding: 20px; 
            text-align: center; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          
          <div class="content">
            <p>Dear ${firstName},</p>
            
            <p>We received a request to reset your password for your Fragransia account. If you made this request, click the button below to reset your password:</p>
            
            <div class="reset-section">
              <a href="${resetLink}" class="btn">Reset My Password</a>
              <p><small>This link will expire in ${expiryTime || '1 hour'}</small></p>
            </div>
            
            <div class="warning">
              <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </div>
            
            <p>For security reasons, this link will expire soon. If you need to reset your password after it expires, please request a new reset link.</p>
            
            <p>If you're having trouble clicking the button, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
          </div>
          
          <div class="footer">
            <p>Fragransia Security Team 🌸</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  // Generate password reset text
  generatePasswordResetText(emailData) {
    const { firstName, resetLink, expiryTime } = emailData;
    
    return `
Password Reset Request - Fragransia

Dear ${firstName},

We received a request to reset your password for your Fragransia account.

If you made this request, click the link below to reset your password:
${resetLink}

This link will expire in ${expiryTime || '1 hour'}.

Security Notice: If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

Fragransia Security Team
    `;
  },

  // Generate promotional email HTML
  generatePromotionalHTML(emailData) {
    const { firstName, subject, content, ctaText, ctaLink, imageUrl } = emailData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .content { padding: 30px 20px; }
          .promo-image { 
            width: 100%; 
            max-width: 100%; 
            height: auto; 
            border-radius: 8px; 
            margin: 20px 0; 
          }
          .btn { 
            display: inline-block; 
            background-color: #667eea; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
            font-weight: bold; 
          }
          .footer { 
            background-color: #343a40; 
            color: white; 
            padding: 20px; 
            text-align: center; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${subject}</h1>
          </div>
          
          <div class="content">
            <p>Dear ${firstName},</p>
            
            ${imageUrl ? `<img src="${imageUrl}" alt="Promotional Image" class="promo-image">` : ''}
            
            <div>${content}</div>
            
            ${ctaText && ctaLink ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${ctaLink}" class="btn">${ctaText}</a>
              </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>Thank you for being a valued customer! 🌸</p>
            <p>Fragransia Team</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  // Generate promotional email text
  generatePromotionalText(emailData) {
    const { firstName, subject, content, ctaText, ctaLink } = emailData;
    
    return `
${subject} - Fragransia

Dear ${firstName},

${content}

${ctaText && ctaLink ? `${ctaText}: ${ctaLink}` : ''}

Thank you for being a valued customer!
Fragransia Team
    `;
  }
};

module.exports = { sendEmail };
