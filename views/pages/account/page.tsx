"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { User, Package, Heart, Settings, LogOut, Edit, Save, X, Phone, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import Navigation from "../components/navigation"
import Footer from "../components/footer"
import WhatsAppChat from "../components/whatsapp-chat"
import PhoneVerification from "@/components/auth/phone-verification"
import AddressManager from "@/components/profile/address-manager"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import AuthModal from "@/components/auth/auth-modal"
import { firebaseService } from "@/lib/firebase-service"

export default function AccountPage() {
  const { user, userProfile, logout, updateUserProfile, loading } = useAuth()
  const [activeTab, setActiveTab] = useState("profile")
  const [isEditing, setIsEditing] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState([])
  const [editData, setEditData] = useState({
    displayName: "",
    phone: "",
    preferences: {
      newsletter: true,
      notifications: true,
      theme: "light" as const,
      language: "en",
      currency: "USD",
      emailFrequency: "weekly" as const,
      smsNotifications: false,
    },
  })
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      setShowAuthModal(true)
    }
  }, [user, loading])

  useEffect(() => {
    if (userProfile) {
      setEditData({
        displayName: userProfile.displayName || "",
        phone: userProfile.phone || "",
        preferences: {
          newsletter: userProfile.preferences?.newsletter ?? true,
          notifications: userProfile.preferences?.notifications ?? true,
          theme: userProfile.preferences?.theme ?? "light",
          language: userProfile.preferences?.language ?? "en",
          currency: userProfile.preferences?.currency ?? "USD",
          emailFrequency: userProfile.preferences?.emailFrequency ?? "weekly",
          smsNotifications: userProfile.preferences?.smsNotifications ?? false,
        },
      })
    }
  }, [userProfile])

  useEffect(() => {
    // Load user orders when profile is available
    if (userProfile) {
      loadUserOrders()
    }
  }, [userProfile])

  const loadUserOrders = async () => {
    if (!userProfile) return
    try {
      const userOrders = await firebaseService.getUserOrders(userProfile.uid)
      setOrders(userOrders)
    } catch (error) {
      console.error("Error loading orders:", error)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      router.push("/")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await updateUserProfile({
        displayName: editData.displayName,
        phone: editData.phone,
        preferences: editData.preferences,
      })
      setIsEditing(false)
    } catch (error) {
      console.error("Profile update error:", error)
    } finally {
      setSaving(false)
    }
  }

  const handlePreferenceChange = (key: string, value: any) => {
    setEditData({
      ...editData,
      preferences: {
        ...editData.preferences,
        [key]: value,
      },
    })
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "orders", label: "Orders", icon: Package },
    { id: "wishlist", label: "Wishlist", icon: Heart },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-black"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation onCartClick={() => {}} />
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => {
            setShowAuthModal(false)
            router.push("/")
          }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation onCartClick={() => {}} />

      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="text-center mb-6">
                  <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                    {userProfile?.photoURL ? (
                      <img
                        src={userProfile.photoURL || "/placeholder.svg"}
                        alt={userProfile.displayName}
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    ) : (
                      <User className="w-10 h-10 text-gray-500" />
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900">{userProfile?.displayName}</h3>
                  <p className="text-sm text-gray-500">{userProfile?.email}</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    {userProfile?.role === "admin" && (
                      <span className="inline-block bg-black text-white text-xs px-2 py-1 rounded">
                        <Shield className="w-3 h-3 inline mr-1" />
                        Admin
                      </span>
                    )}
                    {userProfile?.phoneVerified && (
                      <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                        <Phone className="w-3 h-3 inline mr-1" />
                        Verified
                      </span>
                    )}
                  </div>
                </div>

                <nav className="space-y-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        activeTab === tab.id ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <tab.icon className="w-5 h-5" />
                      {tab.label}
                    </button>
                  ))}

                  {userProfile?.role === "admin" && (
                    <button
                      onClick={() => router.push("/admin")}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Settings className="w-5 h-5" />
                      Admin Dashboard
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </nav>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                {activeTab === "profile" && (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-light text-gray-900">Profile Information</h2>
                      {!isEditing ? (
                        <Button
                          onClick={() => setIsEditing(true)}
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSaveProfile}
                            className="flex items-center gap-2 bg-black text-white"
                            disabled={saving}
                          >
                            <Save className="w-4 h-4" />
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            onClick={() => setIsEditing(false)}
                            variant="outline"
                            className="flex items-center gap-2"
                            disabled={saving}
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                        <Input
                          value={editData.displayName}
                          onChange={(e) => setEditData({ ...editData, displayName: e.target.value })}
                          disabled={!isEditing}
                          className="h-12"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <Input value={userProfile?.email || ""} disabled className="h-12 bg-gray-50" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <div className="flex gap-2">
                          <Input
                            value={editData.phone}
                            onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                            disabled={!isEditing}
                            className="h-12"
                            placeholder="Enter phone number"
                          />
                          {!userProfile?.phoneVerified && (
                            <Button onClick={() => setShowPhoneVerification(true)} variant="outline" className="h-12">
                              <Phone className="w-4 h-4 mr-2" />
                              Verify
                            </Button>
                          )}
                        </div>
                        {userProfile?.phoneVerified && (
                          <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            Phone number verified
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                        <select
                          value={editData.preferences.language}
                          onChange={(e) => handlePreferenceChange("language", e.target.value)}
                          disabled={!isEditing}
                          className="w-full h-12 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        >
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                          <option value="de">German</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                        <select
                          value={editData.preferences.currency}
                          onChange={(e) => handlePreferenceChange("currency", e.target.value)}
                          disabled={!isEditing}
                          className="w-full h-12 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        >
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="INR">INR (₹)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
                        <select
                          value={editData.preferences.theme}
                          onChange={(e) => handlePreferenceChange("theme", e.target.value)}
                          disabled={!isEditing}
                          className="w-full h-12 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        >
                          <option value="light">Light</option>
                          <option value="dark">Dark</option>
                          <option value="auto">Auto</option>
                        </select>
                      </div>
                    </div>

                    {/* Address Management */}
                    <div className="border-t pt-8">
                      <AddressManager />
                    </div>
                  </div>
                )}

                {activeTab === "orders" && (
                  <div>
                    <h2 className="text-2xl font-light text-gray-900 mb-6">Order History</h2>
                    {orders.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No orders found</p>
                        <Button className="mt-4 bg-black text-white" onClick={() => router.push("/products")}>
                          Start Shopping
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {orders.map((order: any) => (
                          <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-medium">Order #{order.id.slice(-8)}</h3>
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  order.status === "delivered"
                                    ? "bg-green-100 text-green-800"
                                    : order.status === "shipped"
                                      ? "bg-blue-100 text-blue-800"
                                      : order.status === "confirmed"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              {order.items.length} item(s) • ${order.totalAmount.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">
                              Ordered on {new Date(order.createdAt.seconds * 1000).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "wishlist" && (
                  <div>
                    <h2 className="text-2xl font-light text-gray-900 mb-6">Wishlist</h2>
                    <div className="text-center py-12">
                      <Heart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No items in wishlist</p>
                      <Button className="mt-4 bg-black text-white" onClick={() => router.push("/products")}>
                        Browse Products
                      </Button>
                    </div>
                  </div>
                )}

                {activeTab === "settings" && (
                  <div>
                    <h2 className="text-2xl font-light text-gray-900 mb-6">Account Settings</h2>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">Email Notifications</h3>
                          <p className="text-sm text-gray-500">Receive updates about your orders</p>
                        </div>
                        <Switch
                          checked={editData.preferences.notifications}
                          onCheckedChange={(checked) => handlePreferenceChange("notifications", checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">Newsletter</h3>
                          <p className="text-sm text-gray-500">Get the latest updates and offers</p>
                        </div>
                        <Switch
                          checked={editData.preferences.newsletter}
                          onCheckedChange={(checked) => handlePreferenceChange("newsletter", checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">SMS Notifications</h3>
                          <p className="text-sm text-gray-500">Receive order updates via SMS</p>
                        </div>
                        <Switch
                          checked={editData.preferences.smsNotifications}
                          onCheckedChange={(checked) => handlePreferenceChange("smsNotifications", checked)}
                        />
                      </div>

                      <div className="p-4 border rounded-lg">
                        <h3 className="font-medium mb-2">Email Frequency</h3>
                        <p className="text-sm text-gray-500 mb-3">How often would you like to receive emails?</p>
                        <select
                          value={editData.preferences.emailFrequency}
                          onChange={(e) => handlePreferenceChange("emailFrequency", e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="never">Never</option>
                        </select>
                      </div>

                      <div className="flex gap-3 pt-6 border-t">
                        <Button onClick={handleSaveProfile} className="bg-black text-white" disabled={saving}>
                          {saving ? "Saving..." : "Save Settings"}
                        </Button>
                        <Button
                          onClick={handleLogout}
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 bg-transparent"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Logout
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Phone Verification Modal */}
      {showPhoneVerification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <PhoneVerification
            onVerified={() => {
              setShowPhoneVerification(false)
              // Refresh user profile to show verified status
              window.location.reload()
            }}
            onCancel={() => setShowPhoneVerification(false)}
          />
        </div>
      )}

      <WhatsAppChat />
      <Footer />
    </div>
  )
}
