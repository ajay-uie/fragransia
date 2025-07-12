"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Cookie, Settings, Shield, BarChart, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { firebaseService, type CookiePreference } from "@/lib/firebase-service"
import { useAuth } from "@/contexts/auth-context"

interface CookieSettings {
  essential: boolean
  analytics: boolean
  marketing: boolean
  preferences: boolean
}

export default function CookieBanner() {
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = sessionStorage.getItem("sessionId")
      if (!id) {
        id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
        sessionStorage.setItem("sessionId", id)
      }
      return id
    }
    return ""
  })

  const [cookieSettings, setCookieSettings] = useState<CookieSettings>({
    essential: true, // Always true, cannot be disabled
    analytics: false,
    marketing: false,
    preferences: false,
  })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkCookiePreferences()
  }, [user, sessionId])

  const checkCookiePreferences = async () => {
    if (!sessionId) return

    try {
      const preferences = await firebaseService.getCookiePreferences(sessionId, user?.uid)

      if (preferences && new Date(preferences.expiresAt) > new Date()) {
        // Valid preferences found, apply them
        setCookieSettings({
          essential: preferences.essential,
          analytics: preferences.analytics,
          marketing: preferences.marketing,
          preferences: preferences.preferences,
        })

        // Apply cookie settings to analytics/tracking
        applyCookieSettings(preferences)
      } else {
        // No valid preferences found, show banner
        const timer = setTimeout(() => {
          setIsVisible(true)
        }, 2000)
        return () => clearTimeout(timer)
      }
    } catch (error) {
      console.error("Error checking cookie preferences:", error)
      // Show banner on error
      setIsVisible(true)
    }
  }

  const applyCookieSettings = (settings: CookiePreference | CookieSettings) => {
    // Apply analytics cookies
    if (settings.analytics) {
      // Enable Google Analytics, Firebase Analytics, etc.
      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("consent", "update", {
          analytics_storage: "granted",
        })
      }
    }

    // Apply marketing cookies
    if (settings.marketing) {
      // Enable marketing/advertising cookies
      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("consent", "update", {
          ad_storage: "granted",
          ad_user_data: "granted",
          ad_personalization: "granted",
        })
      }
    }

    // Apply preference cookies
    if (settings.preferences) {
      // Enable preference/personalization cookies
      localStorage.setItem("cookiePreferences", "granted")
    }
  }

  const saveCookiePreferences = async (settings: CookieSettings) => {
    if (!sessionId) return

    setLoading(true)
    try {
      const preferences: Omit<CookiePreference, "id"> = {
        userId: user?.uid,
        sessionId,
        essential: settings.essential,
        analytics: settings.analytics,
        marketing: settings.marketing,
        preferences: settings.preferences,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        ipAddress: await getClientIP(),
        userAgent: navigator.userAgent,
      }

      await firebaseService.saveCookiePreferences(preferences)
      applyCookieSettings(settings)

      // Log the activity
      if (user) {
        await firebaseService.logUserActivity(user.uid, "cookie_preferences_updated", settings)
      }

      setIsVisible(false)
      setShowSettings(false)
    } catch (error) {
      console.error("Error saving cookie preferences:", error)
    } finally {
      setLoading(false)
    }
  }

  const getClientIP = async (): Promise<string | undefined> => {
    try {
      const response = await fetch("https://api.ipify.org?format=json")
      const data = await response.json()
      return data.ip
    } catch {
      return undefined
    }
  }

  const acceptAll = () => {
    const allAccepted = {
      essential: true,
      analytics: true,
      marketing: true,
      preferences: true,
    }
    setCookieSettings(allAccepted)
    saveCookiePreferences(allAccepted)
  }

  const acceptEssentialOnly = () => {
    const essentialOnly = {
      essential: true,
      analytics: false,
      marketing: false,
      preferences: false,
    }
    setCookieSettings(essentialOnly)
    saveCookiePreferences(essentialOnly)
  }

  const saveCustomSettings = () => {
    saveCookiePreferences(cookieSettings)
  }

  const cookieTypes = [
    {
      key: "essential" as keyof CookieSettings,
      title: "Essential Cookies",
      description: "Required for the website to function properly. Cannot be disabled.",
      icon: Shield,
      required: true,
    },
    {
      key: "analytics" as keyof CookieSettings,
      title: "Analytics Cookies",
      description: "Help us understand how visitors interact with our website.",
      icon: BarChart,
      required: false,
    },
    {
      key: "marketing" as keyof CookieSettings,
      title: "Marketing Cookies",
      description: "Used to deliver personalized advertisements and track campaign performance.",
      icon: Target,
      required: false,
    },
    {
      key: "preferences" as keyof CookieSettings,
      title: "Preference Cookies",
      description: "Remember your settings and preferences for a better experience.",
      icon: Settings,
      required: false,
    },
  ]

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <Cookie className="w-6 h-6 text-gray-600 mt-1 flex-shrink-0" />
                  <div className="text-sm text-gray-700">
                    <h3 className="font-semibold mb-2 text-gray-900">We value your privacy</h3>
                    <p className="text-gray-600 leading-relaxed">
                      We use cookies to enhance your browsing experience, serve personalized content, and analyze our
                      traffic. By clicking "Accept All", you consent to our use of cookies.{" "}
                      <button
                        onClick={() => setShowSettings(true)}
                        className="underline hover:no-underline text-black font-medium"
                      >
                        Customize your preferences
                      </button>{" "}
                      or read our{" "}
                      <a href="/privacy-policy" className="underline hover:no-underline text-black font-medium">
                        Privacy Policy
                      </a>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <Button
                    onClick={() => setShowSettings(true)}
                    variant="outline"
                    className="text-sm border-gray-300 hover:bg-gray-50"
                    disabled={loading}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Customize
                  </Button>
                  <Button
                    onClick={acceptEssentialOnly}
                    variant="outline"
                    className="text-sm border-gray-300 hover:bg-gray-50 bg-transparent"
                    disabled={loading}
                  >
                    Essential Only
                  </Button>
                  <Button
                    onClick={acceptAll}
                    className="text-sm bg-black text-white hover:bg-gray-800"
                    disabled={loading}
                  >
                    {loading ? "Saving..." : "Accept All"}
                  </Button>
                  <button
                    onClick={() => setIsVisible(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    disabled={loading}
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cookie Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="w-5 h-5" />
              Cookie Preferences
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Manage your cookie preferences below. You can enable or disable different types of cookies based on your
              preferences. Essential cookies cannot be disabled as they are necessary for the website to function.
            </p>

            <div className="space-y-4">
              {cookieTypes.map((type) => (
                <div key={type.key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <type.icon className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">{type.title}</h4>
                          {type.required && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Required</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{type.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={cookieSettings[type.key]}
                      onCheckedChange={(checked) => setCookieSettings((prev) => ({ ...prev, [type.key]: checked }))}
                      disabled={type.required || loading}
                      className="ml-4"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveCustomSettings} className="flex-1 bg-black text-white" disabled={loading}>
                {loading ? "Saving..." : "Save Preferences"}
              </Button>
              <Button onClick={() => setShowSettings(false)} variant="outline" disabled={loading}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
