const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendOrderConfirmation(orderData) {
    try {
      const {
        customerName,
        customerEmail,
        orderNumber,
        orderDate,
        estimatedDelivery,
        items,
        totalAmount,
        shippingAddress,
        trackingUrl
      } = orderData;

      const itemsHtml = items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td>${item.size}</td>
          <td>${item.quantity}</td>
          <td>₹${item.price}</td>
        </tr>
      `).join('');

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Order Confirmation - ${orderNumber}</h2>
          <p>Dear ${customerName},</p>
          <p>Thank you for your order! We're excited to get your fragrances to you.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0;">
            <h3>Order Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Order Date:</strong> ${orderDate}</p>
            <p><strong>Estimated Delivery:</strong> ${estimatedDelivery}</p>
          </div>

          <h3>Items Ordered</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Product</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Size</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Quantity</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin: 20px 0; text-align: right;">
            <h3>Total: ₹${totalAmount}</h3>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0;">
            <h3>Shipping Address</h3>
            <p>${shippingAddress}</p>
          </div>

          ${trackingUrl ? `<p><a href="${trackingUrl}">Track your order</a></p>` : ''}

          <p>If you have any questions, please don't hesitate to contact us.</p>
          <p>Thank you for choosing Fragransia!</p>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `Order Confirmation - ${orderNumber}`,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error('Error sending order confirmation email:', error);
      throw error;
    }
  }

  async sendPasswordReset(email, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your Fragransia account.</p>
          <p>Click the link below to reset your password:</p>
          <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset - Fragransia',
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();

