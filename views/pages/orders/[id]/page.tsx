"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Package, MapPin, CreditCard, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import OrderTracking from "@/components/orders/order-tracking"
import { useAuth } from "@/contexts/auth-context"

interface OrderItem {
  id: string
  name: string
  price: number
  quantity: number
  size: string
  image: string
}

interface Order {
  id: string
  items: OrderItem[]
  status: string
  total: number
  subtotal: number
  shipping: number
  tax: number
  createdAt: string
  shippingAddress: {
    name: string
    address: string
    city: string
    state: string
    pincode: string
  }
  paymentData: {
    payment_method: string
    razorpay_payment_id?: string
  }
  awbCode?: string
}

export default function OrderDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      router.push("/login")
      return
    }

    // Mock order data - replace with actual API call
    const mockOrder: Order = {
      id: params.id as string,
      items: [
        {
          id: "1",
          name: "Chanel No. 5 Eau de Parfum",
          price: 12500,
          quantity: 1,
          size: "100ml",
          image: "/placeholder.svg?height=100&width=100",
        },
      ],
      status: "confirmed",
      total: 14875,
      subtotal: 12500,
      shipping: 125,
      tax: 2250,
      createdAt: new Date().toISOString(),
      shippingAddress: {
        name: "John Doe",
        address: "123 Main Street",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
      paymentData: {
        payment_method: "card",
        razorpay_payment_id: "pay_123456789",
      },
      awbCode: "AWB123456789",
    }

    setOrder(mockOrder)
    setLoading(false)
  }, [user, params.id, router])

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "confirmed":
        return "bg-green-100 text-green-800"
      case "processing":
        return "bg-blue-100 text-blue-800"
      case "shipped":
        return "bg-purple-100 text-purple-800"
      case "delivered":
        return "bg-green-100 text-green-800"
      case "cancelled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-black rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Order not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Order #{order.id}</h1>
            <Badge className={getStatusColor(order.status)}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </Badge>
          </div>
        </div>

        <div className="space-y-6">
          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5" />
                <span>Order Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div>
                  <h3 className="font-semibold mb-2">Order Date</h3>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Payment Method</h3>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <CreditCard className="w-4 h-4" />
                    <span className="capitalize">{order.paymentData.payment_method}</span>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Total Amount</h3>
                  <p className="text-2xl font-bold text-green-600">₹{order.total.toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Status</h3>
                  <Badge className={getStatusColor(order.status)}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </Badge>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-4">
                <h3 className="font-semibold">Items Ordered</h3>
                {order.items.map((item) => (
                  <motion.div
                    key={`${item.id}-${item.size}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg"
                  >
                    <img
                      src={item.image || "/placeholder.svg"}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-semibold">{item.name}</h4>
                      <p className="text-gray-600">
                        Size: {item.size} • Quantity: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">₹{(item.price * item.quantity).toLocaleString()}</p>
                      <p className="text-sm text-gray-500">₹{item.price.toLocaleString()} each</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <Separator className="my-6" />

              {/* Pricing Breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>₹{order.shipping.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>₹{order.tax.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>₹{order.total.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="w-5 h-5" />
                <span>Shipping Address</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-gray-600">
                <p className="font-semibold text-gray-900">{order.shippingAddress.name}</p>
                <p>{order.shippingAddress.address}</p>
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Order Tracking */}
          {order.awbCode && <OrderTracking orderId={order.id} awbCode={order.awbCode} />}
        </div>
      </div>
    </div>
  )
}
