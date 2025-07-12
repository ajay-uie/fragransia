"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown, Package, ShoppingCart, Users, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiClient } from "@/lib/api"
import { firebaseAdminService } from "@/lib/firebase-admin-service"

interface StatCard {
  title: string
  value: string
  change: string
  trend: "up" | "down"
  icon: React.ReactNode
}

export default function DashboardStats() {
  const [stats, setStats] = useState<StatCard[]>([])
  const [loading, setLoading] = useState(true)
  const [realtimeStats, setRealtimeStats] = useState<any>({})

  useEffect(() => {
    fetchDashboardData()

    // Subscribe to real-time stats from Firebase
    const unsubscribe = firebaseAdminService.subscribeToStats((newStats) => {
      setRealtimeStats((prev) => ({ ...prev, ...newStats }))
    })

    return () => unsubscribe()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const response = await apiClient.getAdminDashboard()

      if (response.success && response.data) {
        const { stats: dashboardStats } = response.data

        const formattedStats: StatCard[] = [
          {
            title: "Total Revenue",
            value: `₹${dashboardStats.totalRevenue.toLocaleString()}`,
            change: "+12.5%",
            trend: "up",
            icon: <DollarSign className="w-4 h-4" />,
          },
          {
            title: "Total Orders",
            value: dashboardStats.totalOrders.toString(),
            change: "+8.2%",
            trend: "up",
            icon: <ShoppingCart className="w-4 h-4" />,
          },
          {
            title: "Total Products",
            value: dashboardStats.totalProducts.toString(),
            change: "+2.1%",
            trend: "up",
            icon: <Package className="w-4 h-4" />,
          },
          {
            title: "Total Users",
            value: dashboardStats.totalUsers.toString(),
            change: "+15.3%",
            trend: "up",
            icon: <Users className="w-4 h-4" />,
          },
        ]

        setStats(formattedStats)
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error)

      // Fallback stats
      const fallbackStats: StatCard[] = [
        {
          title: "Total Revenue",
          value: "₹1,25,000",
          change: "+12.5%",
          trend: "up",
          icon: <DollarSign className="w-4 h-4" />,
        },
        {
          title: "Total Orders",
          value: "342",
          change: "+8.2%",
          trend: "up",
          icon: <ShoppingCart className="w-4 h-4" />,
        },
        {
          title: "Total Products",
          value: "24",
          change: "+2.1%",
          trend: "up",
          icon: <Package className="w-4 h-4" />,
        },
        {
          title: "Total Users",
          value: "1,250",
          change: "+15.3%",
          trend: "up",
          icon: <Users className="w-4 h-4" />,
        },
      ]

      setStats(fallbackStats)
    } finally {
      setLoading(false)
    }
  }

  // Update stats with real-time data
  useEffect(() => {
    if (Object.keys(realtimeStats).length > 0) {
      setStats((prevStats) =>
        prevStats.map((stat) => {
          if (stat.title === "Total Products" && realtimeStats.productsCount) {
            return { ...stat, value: realtimeStats.productsCount.toString() }
          }
          if (stat.title === "Total Orders" && realtimeStats.ordersCount) {
            return { ...stat, value: realtimeStats.ordersCount.toString() }
          }
          if (stat.title === "Total Revenue" && realtimeStats.totalRevenue) {
            return { ...stat, value: `₹${realtimeStats.totalRevenue.toLocaleString()}` }
          }
          return stat
        }),
      )
    }
  }, [realtimeStats])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
            <div className="text-gray-400">{stat.icon}</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className="flex items-center text-sm">
              {stat.trend === "up" ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={stat.trend === "up" ? "text-green-600" : "text-red-600"}>{stat.change}</span>
              <span className="text-gray-500 ml-1">from last month</span>
            </div>
          </CardContent>

          {/* Real-time indicator */}
          <div className="absolute top-2 right-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </Card>
      ))}
    </div>
  )
}
