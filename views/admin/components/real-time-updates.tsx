"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, X, Package, ShoppingCart, Users, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { firebaseAdminService, type AdminUpdate, type NotificationData } from "@/lib/firebase-admin-service"

export default function RealTimeUpdates() {
  const [updates, setUpdates] = useState<AdminUpdate[]>([])
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")

  useEffect(() => {
    let unsubscribeUpdates: (() => void) | null = null
    let unsubscribeNotifications: (() => void) | null = null

    const setupSubscriptions = async () => {
      try {
        // Subscribe to admin updates
        unsubscribeUpdates = firebaseAdminService.subscribeToAdminUpdates((newUpdates) => {
          setUpdates(newUpdates)
          setConnectionStatus("connected")
        })

        // Subscribe to notifications
        unsubscribeNotifications = firebaseAdminService.subscribeToNotifications((newNotifications) => {
          setNotifications(newNotifications)
          const unread = newNotifications.filter((n) => !n.read).length
          setUnreadCount(unread)
        })

        console.log("✅ Real-time subscriptions established")
      } catch (error) {
        console.error("❌ Failed to setup real-time subscriptions:", error)
        setConnectionStatus("disconnected")
      }
    }

    setupSubscriptions()

    return () => {
      if (unsubscribeUpdates) unsubscribeUpdates()
      if (unsubscribeNotifications) unsubscribeNotifications()
    }
  }, [])

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await firebaseAdminService.markNotificationAsRead(notificationId)
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Failed to mark notification as read:", error)
    }
  }

  const getUpdateIcon = (type: string) => {
    switch (type) {
      case "product_created":
      case "product_updated":
      case "product_deleted":
        return <Package className="w-4 h-4" />
      case "order_updated":
        return <ShoppingCart className="w-4 h-4" />
      case "user_registered":
        return <Users className="w-4 h-4" />
      default:
        return <AlertCircle className="w-4 h-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200"
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "text-green-500"
      case "connecting":
        return "text-yellow-500"
      case "disconnected":
        return "text-red-500"
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative bg-transparent border-gray-700 text-white hover:bg-gray-800"
      >
        <Bell className={`w-4 h-4 ${getConnectionStatusColor()}`} />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

            {/* Notifications Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 top-12 w-96 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium">Real-time Updates</h3>
                  <div
                    className={`w-2 h-2 rounded-full ${
                      connectionStatus === "connected"
                        ? "bg-green-500"
                        : connectionStatus === "connecting"
                          ? "bg-yellow-500 animate-pulse"
                          : "bg-red-500"
                    }`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Connection Status */}
              <div className="px-4 py-2 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Status:</span>
                  <span
                    className={`font-medium ${
                      connectionStatus === "connected"
                        ? "text-green-400"
                        : connectionStatus === "connecting"
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {connectionStatus === "connected"
                      ? "Connected"
                      : connectionStatus === "connecting"
                        ? "Connecting..."
                        : "Disconnected"}
                  </span>
                </div>
              </div>

              {/* Notifications List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No notifications yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {notifications.slice(0, 10).map((notification) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-4 hover:bg-gray-750 transition-colors ${!notification.read ? "bg-gray-750" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-full ${getPriorityColor(notification.priority)}`}>
                            {getUpdateIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-white font-medium text-sm truncate">{notification.title}</h4>
                              {!notification.read && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                            </div>
                            <p className="text-gray-300 text-xs mb-2 line-clamp-2">{notification.message}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500 text-xs">
                                {notification.createdAt?.toDate?.()?.toLocaleTimeString() || "Just now"}
                              </span>
                              {!notification.read && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMarkAsRead(notification.id)}
                                  className="text-xs text-blue-400 hover:text-blue-300 h-auto p-1"
                                >
                                  Mark as read
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-3 border-t border-gray-700 bg-gray-900">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{notifications.length} total notifications</span>
                    <span>{unreadCount} unread</span>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
