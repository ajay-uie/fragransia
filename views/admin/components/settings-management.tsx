"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Save, Settings, Globe, Mail, Shield, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/lib/api"

interface SiteSettings {
  siteName: string
  siteDescription: string
  contactEmail: string
  supportEmail: string
  phone: string
  address: string
  socialMedia: {
    facebook: string
    instagram: string
    twitter: string
    youtube: string
  }
  seo: {
    metaTitle: string
    metaDescription: string
    keywords: string
  }
  shipping: {
    freeShippingThreshold: number
    standardShippingCost: number
    expressShippingCost: number
  }
  notifications: {
    emailNotifications: boolean
    smsNotifications: boolean
    pushNotifications: boolean
  }
}

export default function SettingsManagement() {
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Fragransia",
    siteDescription: "Premium luxury fragrances for the discerning individual",
    contactEmail: "contact@fragransia.com",
    supportEmail: "support@fragransia.com",
    phone: "+91 98765 43210",
    address: "123 Luxury Lane, Mumbai, Maharashtra 400001",
    socialMedia: {
      facebook: "https://facebook.com/fragransia",
      instagram: "https://instagram.com/fragransia",
      twitter: "https://twitter.com/fragransia",
      youtube: "https://youtube.com/fragransia",
    },
    seo: {
      metaTitle: "Fragransia - Premium Luxury Fragrances",
      metaDescription:
        "Discover our exclusive collection of luxury fragrances. Premium quality perfumes for men and women.",
      keywords: "luxury fragrances, perfumes, premium scents, fragransia",
    },
    shipping: {
      freeShippingThreshold: 2000,
      standardShippingCost: 100,
      expressShippingCost: 200,
    },
    notifications: {
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
    },
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const data = await apiClient.getSettings()
      if (data.settings) {
        setSettings(data.settings)
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      await apiClient.updateSettings(settings)
      setSuccess("Settings saved successfully!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (error: any) {
      setError(error.message || "Failed to save settings")
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (section: string, field: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section as keyof SiteSettings],
        [field]: value,
      },
    }))
  }

  const handleDirectChange = (field: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light text-gray-900">Settings Management</h1>
        <Button onClick={handleSave} disabled={loading} className="bg-black text-white flex items-center gap-2">
          <Save className="w-4 h-4" />
          {loading ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-lg p-3"
        >
          <p className="text-green-600 text-sm">{success}</p>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-lg p-3"
        >
          <p className="text-red-600 text-sm">{error}</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">General Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
              <Input
                value={settings.siteName}
                onChange={(e) => handleDirectChange("siteName", e.target.value)}
                placeholder="Enter site name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Site Description</label>
              <Textarea
                value={settings.siteDescription}
                onChange={(e) => handleDirectChange("siteDescription", e.target.value)}
                placeholder="Enter site description"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
              <Input
                type="email"
                value={settings.contactEmail}
                onChange={(e) => handleDirectChange("contactEmail", e.target.value)}
                placeholder="contact@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Support Email</label>
              <Input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => handleDirectChange("supportEmail", e.target.value)}
                placeholder="support@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <Input
                value={settings.phone}
                onChange={(e) => handleDirectChange("phone", e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <Textarea
                value={settings.address}
                onChange={(e) => handleDirectChange("address", e.target.value)}
                placeholder="Enter business address"
                rows={2}
              />
            </div>
          </div>
        </motion.div>

        {/* SEO Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">SEO Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Meta Title</label>
              <Input
                value={settings.seo.metaTitle}
                onChange={(e) => handleChange("seo", "metaTitle", e.target.value)}
                placeholder="Enter meta title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Meta Description</label>
              <Textarea
                value={settings.seo.metaDescription}
                onChange={(e) => handleChange("seo", "metaDescription", e.target.value)}
                placeholder="Enter meta description"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Keywords</label>
              <Input
                value={settings.seo.keywords}
                onChange={(e) => handleChange("seo", "keywords", e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
              />
            </div>
          </div>
        </motion.div>

        {/* Social Media */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">Social Media</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Facebook</label>
              <Input
                value={settings.socialMedia.facebook}
                onChange={(e) => handleChange("socialMedia", "facebook", e.target.value)}
                placeholder="https://facebook.com/yourpage"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Instagram</label>
              <Input
                value={settings.socialMedia.instagram}
                onChange={(e) => handleChange("socialMedia", "instagram", e.target.value)}
                placeholder="https://instagram.com/yourpage"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Twitter</label>
              <Input
                value={settings.socialMedia.twitter}
                onChange={(e) => handleChange("socialMedia", "twitter", e.target.value)}
                placeholder="https://twitter.com/yourpage"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">YouTube</label>
              <Input
                value={settings.socialMedia.youtube}
                onChange={(e) => handleChange("socialMedia", "youtube", e.target.value)}
                placeholder="https://youtube.com/yourchannel"
              />
            </div>
          </div>
        </motion.div>

        {/* Shipping Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-medium text-gray-900">Shipping Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Free Shipping Threshold (₹)</label>
              <Input
                type="number"
                value={settings.shipping.freeShippingThreshold}
                onChange={(e) => handleChange("shipping", "freeShippingThreshold", Number(e.target.value))}
                placeholder="2000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Standard Shipping Cost (₹)</label>
              <Input
                type="number"
                value={settings.shipping.standardShippingCost}
                onChange={(e) => handleChange("shipping", "standardShippingCost", Number(e.target.value))}
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Express Shipping Cost (₹)</label>
              <Input
                type="number"
                value={settings.shipping.expressShippingCost}
                onChange={(e) => handleChange("shipping", "expressShippingCost", Number(e.target.value))}
                placeholder="200"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-medium text-gray-900">Notification Settings</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.emailNotifications}
              onChange={(e) => handleChange("notifications", "emailNotifications", e.target.checked)}
              className="rounded border-gray-300 text-black focus:ring-black"
            />
            <span className="ml-2 text-sm text-gray-700">Email Notifications</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.smsNotifications}
              onChange={(e) => handleChange("notifications", "smsNotifications", e.target.checked)}
              className="rounded border-gray-300 text-black focus:ring-black"
            />
            <span className="ml-2 text-sm text-gray-700">SMS Notifications</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications.pushNotifications}
              onChange={(e) => handleChange("notifications", "pushNotifications", e.target.checked)}
              className="rounded border-gray-300 text-black focus:ring-black"
            />
            <span className="ml-2 text-sm text-gray-700">Push Notifications</span>
          </label>
        </div>
      </motion.div>
    </div>
  )
}
