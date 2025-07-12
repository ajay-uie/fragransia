"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Package, Users, ShoppingCart, FileText, Bell, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/auth-context"
import { testFirebaseConnection } from "@/lib/firebase"
import { apiClient } from "@/lib/api"
import AdminSidebar from "@/components/admin/admin-sidebar"
import DashboardStats from "@/components/admin/dashboard-stats"
import RecentOrders from "@/components/admin/recent-orders"
import ProductsManagement from "@/components/admin/products-management"
import UsersManagement from "@/components/admin/users-management"
import OrdersManagement from "@/components/admin/orders-management"
import CMSManagement from "@/components/admin/cms-management"
import SettingsManagement from "@/components/admin/settings-management"
import RealTimeUpdates from "@/components/admin/real-time-updates"

export default function AdminDashboard() {
  const { user, userProfile, loading } = useAuth()
  const [activeTab, setActiveTab] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [systemStatus, setSystemStatus] = useState<{
    firebase: boolean
    api: boolean
    loading: boolean
    errors: string[]
  }>({
    firebase: false,
    api: false,
    loading: true,
    errors: [],
  })
  const router = useRouter()

  // Check system connections on mount
  useEffect(() => {
    checkSystemConnections()
  }, [])

  // Auth check
  useEffect(() => {
    if (!loading && (!user || userProfile?.role !== "admin")) {
      router.push("/admin/login")
    }
  }, [user, userProfile, loading, router])

  const checkSystemConnections = async () => {
    setSystemStatus((prev) => ({ ...prev, loading: true, errors: [] }))
    const errors: string[] = []

    try {
      // Test Firebase connection
      const firebaseStatus = await testFirebaseConnection()

      // Test API connection
      const apiResponse = await apiClient.healthCheck()
      const apiStatus = apiResponse.success

      if (!firebaseStatus) {
        errors.push("Firebase connection failed")
      }
      if (!apiStatus) {
        errors.push("Backend API connection failed")
      }

      setSystemStatus({
        firebase: firebaseStatus,
        api: apiStatus,
        loading: false,
        errors,
      })

      console.log("System Status Check:", {
        firebase: firebaseStatus,
        api: apiStatus,
        errors,
      })
    } catch (error) {
      console.error("System check failed:", error)
      setSystemStatus({
        firebase: false,
        api: false,
        loading: false,
        errors: ["System check failed: " + (error instanceof Error ? error.message : "Unknown error")],
      })
    }
  }

  if (loading || systemStatus.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-black mb-4"></div>
          <p className="text-gray-600">{loading ? "Authenticating..." : "Checking system connections..."}</p>
        </div>
      </div>
    )
  }

  if (!user || userProfile?.role !== "admin") {
    return null
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-light text-gray-900">Dashboard Overview</h1>
              <div className="flex items-center gap-4">
                <RealTimeUpdates />
                <Button
                  variant="outline"
                  onClick={checkSystemConnections}
                  className="flex items-center gap-2 bg-transparent"
                >
                  <Bell className="w-4 h-4" />
                  Refresh Status
                </Button>
              </div>
            </div>

            {/* System Status Alerts */}
            {systemStatus.errors.length > 0 && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-800">
                  <div className="font-medium mb-2">System Issues Detected:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {systemStatus.errors.map((error, index) => (
                      <li key={index} className="text-sm">
                        {error}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Connection Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className={`p-4 rounded-lg border ${
                  systemStatus.firebase ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${systemStatus.firebase ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="font-medium">Firebase Database</span>
                </div>
                <p className={`text-sm mt-1 ${systemStatus.firebase ? "text-green-700" : "text-red-700"}`}>
                  {systemStatus.firebase ? "Connected and operational" : "Connection failed"}
                </p>
              </div>

              <div
                className={`p-4 rounded-lg border ${
                  systemStatus.api ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${systemStatus.api ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="font-medium">Backend API</span>
                </div>
                <p className={`text-sm mt-1 ${systemStatus.api ? "text-green-700" : "text-red-700"}`}>
                  {systemStatus.api ? "Connected and operational" : "Connection failed"}
                </p>
              </div>
            </div>

            <DashboardStats />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RecentOrders />
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={() => setActiveTab("products")}
                    className="flex items-center gap-2 bg-black text-white"
                  >
                    <Package className="w-4 h-4" />
                    Add Product
                  </Button>
                  <Button onClick={() => setActiveTab("orders")} variant="outline" className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    View Orders
                  </Button>
                  <Button onClick={() => setActiveTab("users")} variant="outline" className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Manage Users
                  </Button>
                  <Button onClick={() => setActiveTab("cms")} variant="outline" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Edit Content
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      case "products":
        return <ProductsManagement />
      case "orders":
        return <OrdersManagement />
      case "users":
        return <UsersManagement />
      case "cms":
        return <CMSManagement />
      case "settings":
        return <SettingsManagement />
      default:
        return <DashboardStats />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {renderContent()}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
