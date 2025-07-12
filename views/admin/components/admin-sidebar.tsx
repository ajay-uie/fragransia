"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

interface AdminSidebarProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Package },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "users", label: "Users", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "cms", label: "Content", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
]

export default function AdminSidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: AdminSidebarProps) {
  const { logout, userProfile } = useAuth()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return

    setIsLoggingOut(true)
    try {
      await logout()
      router.push("/admin/login")
    } catch (error) {
      console.error("Logout failed:", error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsOpen(false)} />}

      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{
          x: isOpen ? 0 : -280,
          width: isOpen ? 280 : 64,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed left-0 top-0 h-full bg-gray-900 border-r border-gray-800 z-50 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-2"
              >
                <Shield className="w-8 h-8 text-red-500" />
                <div>
                  <h1 className="text-white font-semibold">Admin Panel</h1>
                  <p className="text-gray-400 text-xs">Fragransia</p>
                </div>
              </motion.div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* User Info */}
        {isOpen && userProfile && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-4 border-b border-gray-800"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">{userProfile.displayName.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{userProfile.displayName}</p>
                <p className="text-gray-400 text-sm truncate">{userProfile.email}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Shield className="w-3 h-3 text-red-400" />
                  <span className="text-red-400 text-xs font-medium">Administrator</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            {menuItems.map((item, index) => {
              const Icon = item.icon
              const isActive = activeTab === item.id

              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive ? "bg-red-600 text-white shadow-lg" : "text-gray-300 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-gray-400"}`} />
                  {isOpen && <span className="font-medium">{item.label}</span>}

                  {/* Active indicator */}
                  {isActive && <motion.div layoutId="activeTab" className="ml-auto w-2 h-2 bg-white rounded-full" />}
                </motion.button>
              )
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          <Button
            onClick={handleLogout}
            disabled={isLoggingOut}
            variant="ghost"
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:text-white hover:bg-gray-800 ${
              isOpen ? "justify-start" : "justify-center"
            }`}
          >
            <LogOut className="w-5 h-5" />
            {isOpen && <span className="font-medium">{isLoggingOut ? "Signing out..." : "Sign Out"}</span>}
          </Button>

          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-3 text-center"
            >
              <p className="text-gray-500 text-xs">Version 2.1.0</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-400 text-xs">System Online</span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </>
  )
}
