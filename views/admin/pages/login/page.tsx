"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Shield, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import Link from "next/link"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [attempts, setAttempts] = useState(0)
  const [isLocked, setIsLocked] = useState(false)

  const { login, user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && user && userProfile?.role === "admin") {
      router.push("/admin")
    } else if (!authLoading && user && userProfile?.role !== "admin") {
      setError("Access denied. Admin privileges required.")
    }
  }, [user, userProfile, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isLocked) {
      setError("Too many failed attempts. Please wait before trying again.")
      return
    }

    setLoading(true)
    setError("")

    try {
      await login(email, password)

      // Check if user has admin role after login
      if (userProfile?.role !== "admin") {
        setError("Access denied. Admin privileges required.")
        setAttempts((prev) => prev + 1)

        if (attempts >= 2) {
          setIsLocked(true)
          setTimeout(() => setIsLocked(false), 300000) // 5 minutes lockout
        }
        return
      }

      router.push("/admin")
    } catch (error: any) {
      setError(error.message || "Login failed")
      setAttempts((prev) => prev + 1)

      if (attempts >= 2) {
        setIsLocked(true)
        setTimeout(() => setIsLocked(false), 300000) // 5 minutes lockout
      }
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="mb-6">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-light text-white mb-2">Admin Access</h1>
            <p className="text-gray-400">Restricted Area - Authorized Personnel Only</p>
          </div>
        </div>

        {/* Security Warning */}
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-200">
              <p className="font-medium mb-1">Security Notice</p>
              <p>This is a secure admin area. All access attempts are logged and monitored.</p>
            </div>
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-900/30 border border-red-500/50 rounded-lg p-3"
              >
                <p className="text-red-200 text-sm">{error}</p>
              </motion.div>
            )}

            {attempts > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3">
                <p className="text-yellow-200 text-sm">
                  Failed attempts: {attempts}/3 {attempts >= 3 && "(Account temporarily locked)"}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter admin email"
                  className="pl-10 h-12 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
                  required
                  disabled={isLocked}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Admin Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="pl-10 pr-10 h-12 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
                  required
                  disabled={isLocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  disabled={isLocked}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || isLocked}
              className="w-full bg-red-600 text-white hover:bg-red-700 h-12 font-medium disabled:opacity-50"
            >
              {loading ? "Authenticating..." : isLocked ? "Account Locked" : "Access Admin Panel"}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-gray-400 hover:text-white">
                Regular User Login
              </Link>
            </div>
          </form>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 bg-gray-800/30 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Demo Credentials</h3>
          <div className="text-xs text-gray-400 space-y-1">
            <p>Email: admin@fragransia.com</p>
            <p>Password: admin123</p>
            <p className="text-yellow-400 mt-2">⚠️ For demonstration purposes only</p>
          </div>
        </div>

        {/* Security Features */}
        <div className="mt-6 text-center">
          <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
            <div>
              <div className="w-8 h-8 bg-gray-700 rounded-full mx-auto mb-2 flex items-center justify-center">🔒</div>
              Encrypted
            </div>
            <div>
              <div className="w-8 h-8 bg-gray-700 rounded-full mx-auto mb-2 flex items-center justify-center">📊</div>
              Monitored
            </div>
            <div>
              <div className="w-8 h-8 bg-gray-700 rounded-full mx-auto mb-2 flex items-center justify-center">⚡</div>
              Rate Limited
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
