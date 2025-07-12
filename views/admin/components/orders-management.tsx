"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Eye, Package, Truck, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiClient } from "@/lib/api"

interface Order {
  id: string
  customerName: string
  customerEmail: string
  items: Array<{
    id: string
    name: string
    price: number
    quantity: number
    image: string
  }>
  totalAmount: number
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled"
  paymentStatus: "pending" | "paid" | "failed" | "refunded"
  createdAt: string
  shippingAddress: {
    street: string
    city: string
    state: string
    zipCode: string
  }
}

export default function OrdersManagement() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      const data = await apiClient.getOrders()
      setOrders(data.orders || [])
    } catch (error) {
      console.error("Failed to fetch orders:", error)
      // Mock data for demo
      setOrders([
        {
          id: "ORD-001",
          customerName: "Arjun Sharma",
          customerEmail: "arjun@example.com",
          items: [
            {
              id: "1",
              name: "LEONARDO'S SECRET",
              price: 4740,
              quantity: 1,
              image: "/placeholder.svg?height=400&width=300",
            },
          ],
          totalAmount: 4740,
          status: "confirmed",
          paymentStatus: "paid",
          createdAt: "2024-01-15T10:30:00Z",
          shippingAddress: {
            street: "123 MG Road",
            city: "Mumbai",
            state: "Maharashtra",
            zipCode: "400001",
          },
        },
        {
          id: "ORD-002",
          customerName: "Priya Patel",
          customerEmail: "priya@example.com",
          items: [
            {
              id: "2",
              name: "ITALIAN RENAISSANCE",
              price: 3670,
              quantity: 2,
              image: "/placeholder.svg?height=400&width=300",
            },
          ],
          totalAmount: 7340,
          status: "shipped",
          paymentStatus: "paid",
          createdAt: "2024-01-14T15:45:00Z",
          shippingAddress: {
            street: "456 Park Street",
            city: "Delhi",
            state: "Delhi",
            zipCode: "110001",
          },
        },
        {
          id: "ORD-003",
          customerName: "Rahul Kumar",
          customerEmail: "rahul@example.com",
          items: [
            {
              id: "3",
              name: "ROMAN AFFAIR",
              price: 3790,
              quantity: 1,
              image: "/placeholder.svg?height=400&width=300",
            },
          ],
          totalAmount: 3790,
          status: "pending",
          paymentStatus: "pending",
          createdAt: "2024-01-13T09:20:00Z",
          shippingAddress: {
            street: "789 Brigade Road",
            city: "Bangalore",
            state: "Karnataka",
            zipCode: "560001",
          },
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (orderId: string, newStatus: Order["status"]) => {
    try {
      await apiClient.updateOrder(orderId, { status: newStatus })
      setOrders(orders.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)))
    } catch (error) {
      console.error("Failed to update order status:", error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Package className="w-4 h-4 text-yellow-600" />
      case "confirmed":
        return <CheckCircle className="w-4 h-4 text-blue-600" />
      case "shipped":
        return <Truck className="w-4 h-4 text-purple-600" />
      case "delivered":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "cancelled":
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <Package className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "confirmed":
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

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statuses = ["all", "pending", "confirmed", "shipped", "delivered", "cancelled"]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light text-gray-900">Orders Management</h1>
        <div className="text-sm text-gray-500">
          {filteredOrders.length} of {orders.length} orders
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search orders, customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All Statuses" : status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.map((order, index) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-gray-900">#{order.id}</h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(order.status)}`}
                  >
                    {getStatusIcon(order.status)}
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
                <p className="text-gray-600">{order.customerName}</p>
                <p className="text-sm text-gray-500">{order.customerEmail}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900">₹{order.totalAmount.toLocaleString()}</p>
                <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Order Items */}
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-2">Items ({order.items.length})</h4>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                    <img
                      src={item.image || "/placeholder.svg"}
                      alt={item.name}
                      className="w-10 h-12 object-cover rounded"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        Qty: {item.quantity} × ₹{item.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shipping Address */}
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-1">Shipping Address</h4>
              <p className="text-sm text-gray-600">
                {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} -{" "}
                {order.shippingAddress.zipCode}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Update Status:</span>
                <select
                  value={order.status}
                  onChange={(e) => handleStatusUpdate(order.id, e.target.value as Order["status"])}
                  className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <Button variant="ghost" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No orders found</p>
        </div>
      )}
    </div>
  )
}
