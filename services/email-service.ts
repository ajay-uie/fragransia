interface OrderConfirmationData {
  customerName: string
  customerEmail: string
  orderNumber: string
  orderDate: string
  estimatedDelivery: string
  items: Array<{
    name: string
    size: string
    quantity: number
    price: number
  }>
  totalAmount: number
  shippingAddress: string
  trackingUrl: string
}

interface ShippingNotificationData {
  customerName: string
  customerEmail: string
  orderNumber: string
  trackingNumber: string
  courierName: string
  estimatedDelivery: string
  trackingUrl: string
}

interface DeliveryConfirmationData {
  customerName: string
  customerEmail: string
  orderNumber: string
  deliveryDate: string
  feedbackUrl: string
}

class EmailService {
  private apiKey: string
  private baseUrl = "https://api.emailjs.com/api/v1.0/email/send"

  constructor() {
    this.apiKey = process.env.EMAILJS_API_KEY || ""
  }

  async sendOrderConfirmation(data: OrderConfirmationData): Promise<void> {
    try {
      const emailTemplate = this.generateOrderConfirmationTemplate(data)

      await this.sendEmail({
        to: data.customerEmail,
        subject: `Order Confirmation - ${data.orderNumber}`,
        html: emailTemplate,
      })

      console.log(`Order confirmation email sent to ${data.customerEmail}`)
    } catch (error) {
      console.error("Failed to send order confirmation email:", error)
      throw error
    }
  }

  async sendShippingNotification(data: ShippingNotificationData): Promise<void> {
    try {
      const emailTemplate = this.generateShippingNotificationTemplate(data)

      await this.sendEmail({
        to: data.customerEmail,
        subject: `Your Order is on the Way - ${data.orderNumber}`,
        html: emailTemplate,
      })

      console.log(`Shipping notification email sent to ${data.customerEmail}`)
    } catch (error) {
      console.error("Failed to send shipping notification email:", error)
      throw error
    }
  }

  async sendDeliveryConfirmation(data: DeliveryConfirmationData): Promise<void> {
    try {
      const emailTemplate = this.generateDeliveryConfirmationTemplate(data)

      await this.sendEmail({
        to: data.customerEmail,
        subject: `Order Delivered - ${data.orderNumber}`,
        html: emailTemplate,
      })

      console.log(`Delivery confirmation email sent to ${data.customerEmail}`)
    } catch (error) {
      console.error("Failed to send delivery confirmation email:", error)
      throw error
    }
  }

  private async sendEmail(emailData: {
    to: string
    subject: string
    html: string
  }): Promise<void> {
    try {
      // Using a mock email service for demo
      // In production, integrate with services like SendGrid, Mailgun, or AWS SES

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailData),
      })

      if (!response.ok) {
        throw new Error("Failed to send email")
      }
    } catch (error) {
      console.error("Email sending error:", error)
      throw error
    }
  }

  private generateOrderConfirmationTemplate(data: OrderConfirmationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .item { border-bottom: 1px solid #eee; padding: 10px 0; }
          .total { font-weight: bold; font-size: 18px; }
          .footer { text-align: center; padding: 20px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FRAGRANSIA</h1>
            <h2>Order Confirmation</h2>
          </div>
          
          <div class="content">
            <p>Dear ${data.customerName},</p>
            <p>Thank you for your order! We're excited to prepare your luxury fragrances for you.</p>
            
            <div class="order-details">
              <h3>Order Details</h3>
              <p><strong>Order Number:</strong> ${data.orderNumber}</p>
              <p><strong>Order Date:</strong> ${data.orderDate}</p>
              <p><strong>Estimated Delivery:</strong> ${data.estimatedDelivery}</p>
              
              <h4>Items Ordered:</h4>
              ${data.items
                .map(
                  (item) => `
                <div class="item">
                  <strong>${item.name}</strong> (${item.size})<br>
                  Quantity: ${item.quantity} × ₹${item.price.toLocaleString()} = ₹${(item.quantity * item.price).toLocaleString()}
                </div>
              `,
                )
                .join("")}
              
              <div class="total">
                <p>Total Amount: ₹${data.totalAmount.toLocaleString()}</p>
              </div>
              
              <h4>Shipping Address:</h4>
              <p>${data.shippingAddress}</p>
            </div>
            
            <p>You can track your order using this link: <a href="${data.trackingUrl}">Track Order</a></p>
            
            <p>If you have any questions, please don't hesitate to contact our customer service team.</p>
            
            <p>Thank you for choosing Fragransia!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2024 Fragransia. All rights reserved.</p>
            <p>Visit us at <a href="https://fragransia.com">fragransia.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `
  }

  private generateShippingNotificationTemplate(data: ShippingNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Order is on the Way</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .shipping-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .tracking-button { display: inline-block; background: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FRAGRANSIA</h1>
            <h2>Your Order is on the Way!</h2>
          </div>
          
          <div class="content">
            <p>Dear ${data.customerName},</p>
            <p>Great news! Your order has been shipped and is on its way to you.</p>
            
            <div class="shipping-details">
              <h3>Shipping Details</h3>
              <p><strong>Order Number:</strong> ${data.orderNumber}</p>
              <p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
              <p><strong>Courier:</strong> ${data.courierName}</p>
              <p><strong>Estimated Delivery:</strong> ${data.estimatedDelivery}</p>
              
              <a href="${data.trackingUrl}" class="tracking-button">Track Your Package</a>
            </div>
            
            <p>You'll receive another email once your package has been delivered.</p>
            
            <p>Thank you for choosing Fragransia!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2024 Fragransia. All rights reserved.</p>
            <p>Visit us at <a href="https://fragransia.com">fragransia.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `
  }

  private generateDeliveryConfirmationTemplate(data: DeliveryConfirmationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Delivered</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .delivery-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .feedback-button { display: inline-block; background: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FRAGRANSIA</h1>
            <h2>Order Delivered!</h2>
          </div>
          
          <div class="content">
            <p>Dear ${data.customerName},</p>
            <p>Your order has been successfully delivered! We hope you love your new fragrances.</p>
            
            <div class="delivery-details">
              <h3>Delivery Confirmation</h3>
              <p><strong>Order Number:</strong> ${data.orderNumber}</p>
              <p><strong>Delivered On:</strong> ${data.deliveryDate}</p>
            </div>
            
            <p>We'd love to hear about your experience! Please take a moment to share your feedback:</p>
            <a href="${data.feedbackUrl}" class="feedback-button">Leave Feedback</a>
            
            <p>Thank you for choosing Fragransia. We look forward to serving you again!</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2024 Fragransia. All rights reserved.</p>
            <p>Visit us at <a href="https://fragransia.com">fragransia.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `
  }
}

export const emailService = new EmailService()
