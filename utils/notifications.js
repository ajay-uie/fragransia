const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Email transporter setup
const createEmailTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  orderConfirmation: (orderData) => ({
    subject: `Order Confirmation - ${orderData.orderId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Order Confirmation</h2>
        <p>Dear ${orderData.shippingAddress.firstName},</p>
        <p>Thank you for your order! Your order has been confirmed and is being processed.</p>
        
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <h3>Order Details</h3>
          <p><strong>Order ID:</strong> ${orderData.orderId}</p>
          <p><strong>Total Amount:</strong> ₹${orderData.orderSummary.finalTotal}</p>
          <p><strong>Items:</strong> ${orderData.items.length} item(s)</p>
        </div>
        
        <div style="margin: 20px 0;">
          <h3>Items Ordered</h3>
          ${orderData.items.map(item => `
            <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
              <p><strong>${item.name}</strong></p>
              <p>Quantity: ${item.quantity} | Price: ₹${item.price}</p>
            </div>
          `).join('')}
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <h3>Shipping Address</h3>
          <p>${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}</p>
          <p>${orderData.shippingAddress.address}</p>
          <p>${orderData.shippingAddress.city}, ${orderData.shippingAddress.state} - ${orderData.shippingAddress.pincode}</p>
          <p>Phone: ${orderData.shippingAddress.phone}</p>
        </div>
        
        <p>You can track your order status in your account dashboard.</p>
        <p>Thank you for shopping with Fragransia!</p>
      </div>
    `
  }),

  orderStatusUpdate: (orderData, newStatus) => ({
    subject: `Order Update - ${orderData.orderId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Order Status Update</h2>
        <p>Dear Customer,</p>
        <p>Your order status has been updated.</p>
        
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <p><strong>Order ID:</strong> ${orderData.orderId}</p>
          <p><strong>New Status:</strong> ${newStatus.toUpperCase()}</p>
          ${orderData.trackingNumber ? `<p><strong>Tracking Number:</strong> ${orderData.trackingNumber}</p>` : ''}
        </div>
        
        <p>You can track your order in your account dashboard.</p>
        <p>Thank you for shopping with Fragransia!</p>
      </div>
    `
  }),

  welcomeEmail: (userData) => ({
    subject: 'Welcome to Fragransia!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Fragransia!</h2>
        <p>Dear ${userData.firstName},</p>
        <p>Welcome to Fragransia, your destination for luxury fragrances!</p>
        
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <h3>What's Next?</h3>
          <ul>
            <li>Explore our premium fragrance collection</li>
            <li>Set up your preferences in your profile</li>
            <li>Add your favorite products to wishlist</li>
            <li>Enjoy exclusive member benefits</li>
          </ul>
        </div>
        
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Happy shopping!</p>
      </div>
    `
  }),

  passwordReset: (resetLink) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You have requested to reset your password.</p>
        
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <p>Click the link below to reset your password:</p>
          <a href="${resetLink}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        </div>
        
        <p>This link will expire in 1 hour for security reasons.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  })
};

// Notification service class
class NotificationService {
  constructor(io) {
    this.io = io;
    this.emailTransporter = createEmailTransporter();
  }

  // Send email notification
  async sendEmail(to, template, data) {
    try {
      if (!this.emailTransporter || !process.env.SMTP_USER) {
        console.log('Email not configured, skipping email notification');
        return { success: false, message: 'Email not configured' };
      }

      const emailContent = emailTemplates[template](data);
      
      const mailOptions = {
        from: `"Fragransia" <${process.env.SMTP_USER}>`,
        to,
        subject: emailContent.subject,
        html: emailContent.html
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send real-time notification via Socket.IO
  sendRealTimeNotification(room, event, data) {
    try {
      this.io.to(room).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Real-time notification sent to ${room}:`, event);
      return { success: true };
    } catch (error) {
      console.error('Real-time notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send push notification (Firebase Cloud Messaging)
  async sendPushNotification(userToken, title, body, data = {}) {
    try {
      if (!userToken) {
        return { success: false, message: 'No user token provided' };
      }

      const message = {
        token: userToken,
        notification: {
          title,
          body
        },
        data: {
          ...data,
          timestamp: new Date().toISOString()
        }
      };

      const result = await admin.messaging().send(message);
      console.log('Push notification sent successfully:', result);
      
      return { success: true, messageId: result };
    } catch (error) {
      console.error('Push notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send SMS notification (placeholder - integrate with SMS service)
  async sendSMS(phoneNumber, message) {
    try {
      // Placeholder for SMS service integration
      // You can integrate with services like Twilio, AWS SNS, etc.
      console.log(`SMS to ${phoneNumber}: ${message}`);
      
      return { success: true, message: 'SMS sent (placeholder)' };
    } catch (error) {
      console.error('SMS sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Comprehensive notification for order events
  async notifyOrderEvent(eventType, orderData, additionalData = {}) {
    const notifications = [];

    try {
      // Get user details
      const db = admin.firestore();
      const userDoc = await db.collection('users').doc(orderData.userId).get();
      const userData = userDoc.data();

      switch (eventType) {
        case 'order_created':
          // Email notification
          if (userData.email) {
            const emailResult = await this.sendEmail(
              userData.email,
              'orderConfirmation',
              orderData
            );
            notifications.push({ type: 'email', ...emailResult });
          }

          // Real-time notification to user
          this.sendRealTimeNotification(
            `user-${orderData.userId}`,
            'order-created',
            {
              orderId: orderData.orderId,
              status: orderData.status,
              total: orderData.orderSummary.finalTotal
            }
          );

          // Real-time notification to admin
          this.sendRealTimeNotification('admin', 'new-order', {
            orderId: orderData.orderId,
            userId: orderData.userId,
            total: orderData.orderSummary.finalTotal,
            itemCount: orderData.items.length
          });

          break;

        case 'order_status_updated':
          // Email notification
          if (userData.email) {
            const emailResult = await this.sendEmail(
              userData.email,
              'orderStatusUpdate',
              orderData,
              additionalData.newStatus
            );
            notifications.push({ type: 'email', ...emailResult });
          }

          // Real-time notification to user
          this.sendRealTimeNotification(
            `user-${orderData.userId}`,
            'order-status-updated',
            {
              orderId: orderData.orderId,
              status: additionalData.newStatus,
              trackingNumber: additionalData.trackingNumber
            }
          );

          // SMS for important status updates
          if (userData.phoneNumber && ['shipped', 'delivered'].includes(additionalData.newStatus)) {
            const smsResult = await this.sendSMS(
              userData.phoneNumber,
              `Your order ${orderData.orderId} has been ${additionalData.newStatus}. Track: ${additionalData.trackingNumber || 'N/A'}`
            );
            notifications.push({ type: 'sms', ...smsResult });
          }

          break;

        case 'payment_confirmed':
          // Real-time notification to user
          this.sendRealTimeNotification(
            `user-${orderData.userId}`,
            'payment-confirmed',
            {
              orderId: orderData.orderId,
              amount: orderData.orderSummary.finalTotal
            }
          );

          // Real-time notification to admin
          this.sendRealTimeNotification('admin', 'payment-received', {
            orderId: orderData.orderId,
            userId: orderData.userId,
            amount: orderData.orderSummary.finalTotal
          });

          break;

        case 'user_registered':
          // Welcome email
          if (userData.email) {
            const emailResult = await this.sendEmail(
              userData.email,
              'welcomeEmail',
              userData
            );
            notifications.push({ type: 'email', ...emailResult });
          }

          break;
      }

      return { success: true, notifications };
    } catch (error) {
      console.error('Notification event failed:', error);
      return { success: false, error: error.message, notifications };
    }
  }

  // Admin notification for low stock
  async notifyLowStock(productData) {
    try {
      // Get admin users
      const db = admin.firestore();
      const adminQuery = await db.collection('users')
        .where('role', '==', 'admin')
        .get();

      const notifications = [];

      adminQuery.forEach(async (doc) => {
        const adminData = doc.data();
        
        if (adminData.email) {
          // Send email to admin
          const emailResult = await this.sendEmail(
            adminData.email,
            'lowStockAlert',
            productData
          );
          notifications.push({ type: 'email', admin: adminData.email, ...emailResult });
        }
      });

      // Real-time notification to admin dashboard
      this.sendRealTimeNotification('admin', 'low-stock-alert', {
        productId: productData.id,
        productName: productData.name,
        currentStock: productData.inventory,
        threshold: 10
      });

      return { success: true, notifications };
    } catch (error) {
      console.error('Low stock notification failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;

