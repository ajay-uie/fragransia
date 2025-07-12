"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ShoppingBag, CheckCircle, Truck, CreditCard, MapPin, User, Phone, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Navigation from "../components/navigation"
import Footer from "../components/footer"
import PaymentForm from "@/components/checkout/payment-form"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/app/contexts/cart-context"
import { firebaseService } from "@/lib/firebase-service"
import Link from "next/link"

interface ShippingAddress {
  fullName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
}

export default function CheckoutPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const { state, clearCart } = useCart()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<"shipping" | "payment" | "confirmation">("shipping")
  const [orderData, setOrderData] = useState<any>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  })

  // Safety checks for cart state
  const cartItems = state?.items || []
  const cartTotal = state?.total || 0
  const cartItemCount = state?.itemCount || 0

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=" + encodeURIComponent("/checkout"))
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (cartItems.length === 0 && step !== "confirmation") {
      router.push("/products")
    }
  }, [cartItems.length, step, router])

  // Pre-fill user data
  useEffect(() => {
    if (user && userProfile) {
      setShippingAddress((prev) => ({
        ...prev,
        fullName: userProfile.displayName || user.displayName || "",
        email: userProfile.email || user.email || "",
        phone: userProfile.phone || "",
      }))
    }
  }, [user, userProfile])

  const calculateTotal = () => {
    const subtotal = cartTotal
    const shipping = subtotal >= 2000 ? 0 : 100
    const tax = Math.round(subtotal * 0.18)
    return subtotal + shipping + tax
  }

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    const requiredFields = ["fullName", "email", "phone", "address", "city", "state", "pincode"]
    const missingFields = requiredFields.filter((field) => !shippingAddress[field as keyof ShippingAddress]?.trim())

    if (missingFields.length > 0) {
      setError(`Please fill in all required fields: ${missingFields.join(", ")}`)
      return
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(shippingAddress.email)) {
      setError("Please enter a valid email address")
      return
    }

    // Validate phone
    const phoneRegex = /^[6-9]\d{9}$/
    if (!phoneRegex.test(shippingAddress.phone)) {
      setError("Please enter a valid 10-digit phone number")
      return
    }

    // Validate pincode
    const pincodeRegex = /^\d{6}$/
    if (!pincodeRegex.test(shippingAddress.pincode)) {
      setError("Please enter a valid 6-digit pincode")
      return
    }

    setError("")
    setStep("payment")
  }

  const handlePaymentSuccess = async (paymentResponse: any) => {
    setProcessing(true)
    try {
      // Create order in database
      const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const orderDetails = {
        orderId,
        userId: user!.uid,
        items: cartItems.map((item) => ({
          productId: item.id.toString(),
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          size: item.size,
          image: item.image,
        })),
        totalAmount: calculateTotal(),
        status: "confirmed",
        shippingAddress,
        paymentMethod: "razorpay",
        paymentStatus: "paid",
        paymentId: paymentResponse.razorpay_payment_id,
        createdAt: new Date().toISOString(),
      }

      // Save order to Firebase
      await firebaseService.createOrder(orderDetails)

      // Send confirmation email (handled by backend)
      // await emailService.sendOrderConfirmation({
      //   customerName: shippingAddress.fullName,
      //   customerEmail: shippingAddress.email,
      //   orderNumber: orderId,
      //   orderDate: new Date().toLocaleDateString(),
      //   estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      //   items: cartItems.map((item) => ({
      //     name: item.name,
      //     size: item.size || "100ml",
      //     quantity: item.quantity,
      //     price: item.price * item.quantity,
      //   })),
      //   totalAmount: calculateTotal(),
      //   shippingAddress: `${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.pincode}`,
      //   trackingUrl: `${window.location.origin}/orders/${orderId}`,
      // })

      setOrderData({
        orderId,
        paymentId: paymentResponse.razorpay_payment_id,
        amount: calculateTotal(),
      })

      clearCart()
      setStep("confirmation")
    } catch (error) {
      console.error("Order creation error:", error)
      setError("Failed to create order. Please contact support.")
    } finally {
      setProcessing(false)
    }
  }

  const handlePaymentError = (error: any) => {
    console.error("Payment error:", error)
    setError(error.message || "Payment failed. Please try again.")
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-black"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (cartItems.length === 0 && step !== "confirmation") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation onCartClick={() => {}} />
        <div className="pt-20 flex items-center justify-center min-h-[80vh] p-4">
          <div className="text-center">
            <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h1 className="text-2xl font-light text-gray-900 mb-2">Your cart is empty</h1>
            <p className="text-gray-600 mb-6">Add some products to continue with checkout</p>
            <Link href="/products">
              <Button className="bg-black text-white hover:bg-gray-800">Continue Shopping</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation onCartClick={() => {}} />

      <div className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-black mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
            <h1 className="text-3xl font-light text-gray-900">Checkout</h1>

            {/* Progress Steps */}
            <div className="flex items-center gap-4 mt-6">
              <div className={`flex items-center gap-2 ${step === "shipping" ? "text-black" : "text-gray-400"}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step === "shipping" ? "bg-black text-white" : "bg-gray-200"
                  }`}
                >
                  <Truck className="w-4 h-4" />
                </div>
                <span className="font-medium">Shipping</span>
              </div>
              <div className="w-8 h-px bg-gray-300"></div>
              <div className={`flex items-center gap-2 ${step === "payment" ? "text-black" : "text-gray-400"}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step === "payment" ? "bg-black text-white" : "bg-gray-200"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                </div>
                <span className="font-medium">Payment</span>
              </div>
              <div className="w-8 h-px bg-gray-300"></div>
              <div className={`flex items-center gap-2 ${step === "confirmation" ? "text-black" : "text-gray-400"}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step === "confirmation" ? "bg-green-600 text-white" : "bg-gray-200"
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                </div>
                <span className="font-medium">Confirmation</span>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === "shipping" && (
              <motion.div
                key="shipping"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
              >
                {/* Shipping Form */}
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Shipping Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleShippingSubmit} className="space-y-6">
                      {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <p className="text-red-800 text-sm">{error}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="fullName" className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Full Name *
                          </Label>
                          <Input
                            id="fullName"
                            value={shippingAddress.fullName}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone" className="flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            Phone Number *
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={shippingAddress.phone}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                            required
                            className="mt-1"
                            placeholder="10-digit mobile number"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="email" className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email Address *
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={shippingAddress.email}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="address">Street Address *</Label>
                        <Input
                          id="address"
                          value={shippingAddress.address}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, address: e.target.value })}
                          required
                          className="mt-1"
                          placeholder="House number, street name, area"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="city">City *</Label>
                          <Input
                            id="city"
                            value={shippingAddress.city}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="state">State *</Label>
                          <Select
                            value={shippingAddress.state}
                            onValueChange={(value) => setShippingAddress({ ...shippingAddress, state: value })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                              <SelectItem value="Delhi">Delhi</SelectItem>
                              <SelectItem value="Gujarat">Gujarat</SelectItem>
                              <SelectItem value="Karnataka">Karnataka</SelectItem>
                              <SelectItem value="Maharashtra">Maharashtra</SelectItem>
                              <SelectItem value="Tamil Nadu">Tamil Nadu</SelectItem>
                              <SelectItem value="Uttar Pradesh">Uttar Pradesh</SelectItem>
                              <SelectItem value="West Bengal">West Bengal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="pincode">Pincode *</Label>
                          <Input
                            id="pincode"
                            value={shippingAddress.pincode}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, pincode: e.target.value })}
                            required
                            className="mt-1"
                            placeholder="6-digit pincode"
                            maxLength={6}
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full h-12 bg-black text-white hover:bg-gray-800">
                        Continue to Payment
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Order Summary */}
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {cartItems.map((item) => (
                      <div key={`${item.id}-${item.size}`} className="flex gap-4">
                        <img
                          src={item.image || "/placeholder.svg?height=80&width=64"}
                          alt={item.name}
                          className="w-16 h-20 object-cover rounded"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{item.name}</h4>
                          <p className="text-sm text-gray-500">{item.size}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                            <span className="font-semibold">₹{(item.price * item.quantity).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal ({cartItemCount} items)</span>
                        <span>₹{cartTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Shipping</span>
                        <span>{cartTotal >= 2000 ? "Free" : "₹100"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Tax (18%)</span>
                        <span>₹{Math.round(cartTotal * 0.18).toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span>₹{calculateTotal().toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {step === "payment" && (
              <motion.div
                key="payment"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
              >
                <div className="space-y-6">
                  <Button variant="outline" onClick={() => setStep("shipping")} className="gap-2 bg-transparent">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Shipping
                  </Button>

                  <PaymentForm
                    amount={calculateTotal()}
                    customerInfo={{
                      name: shippingAddress.fullName,
                      email: shippingAddress.email,
                      phone: shippingAddress.phone,
                    }}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-red-800">{error}</p>
                    </div>
                  )}
                </div>

                {/* Order Summary */}
                <Card className="border-0 shadow-lg h-fit">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal ({cartItemCount} items)</span>
                        <span>₹{cartTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Shipping</span>
                        <span>{cartTotal >= 2000 ? "Free" : "₹100"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Tax (18%)</span>
                        <span>₹{Math.round(cartTotal * 0.18).toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span>₹{calculateTotal().toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {step === "confirmation" && orderData && (
              <motion.div
                key="confirmation"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-2xl mx-auto text-center"
              >
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>

                    <h2 className="text-2xl font-light text-gray-900 mb-4">Order Confirmed!</h2>
                    <p className="text-gray-600 mb-6">
                      Thank you for your purchase. Your order has been confirmed and will be processed shortly.
                    </p>

                    <div className="bg-gray-50 rounded-lg p-6 mb-6">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Order Number:</span>
                          <p className="text-gray-600">{orderData.orderId}</p>
                        </div>
                        <div>
                          <span className="font-medium">Payment ID:</span>
                          <p className="text-gray-600">{orderData.paymentId}</p>
                        </div>
                        <div>
                          <span className="font-medium">Total Amount:</span>
                          <p className="text-gray-600">₹{orderData.amount.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="font-medium">Estimated Delivery:</span>
                          <p className="text-gray-600">
                            {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Link href={`/orders/${orderData.orderId}`}>
                        <Button className="bg-black text-white hover:bg-gray-800">Track Order</Button>
                      </Link>
                      <Link href="/products">
                        <Button variant="outline" className="bg-transparent">
                          Continue Shopping
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {processing && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium">Processing your order...</span>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  )
}
