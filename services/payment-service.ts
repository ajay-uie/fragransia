interface PaymentData {
  amount: number
  description: string
  customerInfo: {
    name: string
    email: string
    phone: string
  }
}

interface PaymentResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

class PaymentService {
  private razorpayKeyId: string

  constructor() {
    this.razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ""
  }

  async processPayment(
    paymentData: PaymentData,
    onSuccess: (response: PaymentResponse) => void,
    onError: (error: any) => void,
  ): Promise<void> {
    try {
      // Create order on backend
      const orderResponse = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: paymentData.amount * 100, // Convert to paise
          currency: "INR",
          receipt: `receipt_${Date.now()}`,
          notes: {
            customer_name: paymentData.customerInfo.name,
            customer_email: paymentData.customerInfo.email,
            customer_phone: paymentData.customerInfo.phone,
          },
        }),
      })

      if (!orderResponse.ok) {
        throw new Error("Failed to create payment order")
      }

      const order = await orderResponse.json()

      // Initialize Razorpay
      const options = {
        key: this.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "Fragransia",
        description: paymentData.description,
        order_id: order.id,
        handler: async (response: PaymentResponse) => {
          try {
            // Verify payment on backend
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })

            if (!verifyResponse.ok) {
              throw new Error("Payment verification failed")
            }

            const verificationResult = await verifyResponse.json()

            if (verificationResult.success) {
              onSuccess(response)
            } else {
              throw new Error("Payment verification failed")
            }
          } catch (error) {
            console.error("Payment verification error:", error)
            onError(error)
          }
        },
        prefill: {
          name: paymentData.customerInfo.name,
          email: paymentData.customerInfo.email,
          contact: paymentData.customerInfo.phone,
        },
        theme: {
          color: "#000000",
        },
        modal: {
          ondismiss: () => {
            onError(new Error("Payment cancelled by user"))
          },
        },
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.on("payment.failed", (response: any) => {
        onError(response.error)
      })
      rzp.open()
    } catch (error) {
      console.error("Payment processing error:", error)
      onError(error)
    }
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    try {
      const response = await fetch(`/api/payments/status/${paymentId}`)
      if (!response.ok) {
        throw new Error("Failed to get payment status")
      }
      return await response.json()
    } catch (error) {
      console.error("Error getting payment status:", error)
      throw error
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<any> {
    try {
      const response = await fetch("/api/payments/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_id: paymentId,
          amount: amount ? amount * 100 : undefined, // Convert to paise if amount provided
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to process refund")
      }

      return await response.json()
    } catch (error) {
      console.error("Refund processing error:", error)
      throw error
    }
  }
}

export const paymentService = new PaymentService()
