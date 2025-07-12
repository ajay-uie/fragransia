"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/lib/api"

interface Order {
  id: string
  customerName: string
  email: string
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  createdAt: string
}

export default function RecentOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentOrders()
  }, [])

  const fetchRecentOrders = async () => {
    try {
      const data = await apiClient.getOrders({ limit: 5, sort: "-createdAt" })
      setOrders(data.orders || [])
    } catch (error) {
      console.error("Failed to fetch orders:", error)
      // Mock data for demo
      setOrders([
        {
          id: "1",
          customerName: "John Doe",
          email: "john@example.com",
          total: 4740,
          status: "processing",
          createdAt: "2024-01-15T10:30:00Z",
        },
        {
          id: "2",
          customerName: "Jane Smith",
          email: "jane@example.com",
          total: 3670,
          status: "shipped",
          createdAt: "2024-01-14T15:45:00Z",
        },
        {
          id: "3",
          customerName: "Mike Johnson",
          email: "mike@example.com",
          total: 9975,
          status: "delivered",
          createdAt: "2024-01-13T09:20:00Z",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800"
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Recent Orders</h3>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Recent Orders</h3>
        <Button variant="outline" size="sm">
          View All
        </Button>
      </div>

      <div className="space-y-4">
        {orders.map((order, index) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="font-medium text-gray-900">#{order.id}</h4>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>
              <p className="text-sm text-gray-600">{order.customerName}</p>
              <p className="text-sm text-gray-500">{order.email}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">₹{order.total.toLocaleString()}</p>
              <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-2">
              <Eye className="w-4 h-4" />
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
