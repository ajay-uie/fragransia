"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import LoginForm from "./login-form"
import RegisterForm from "./register-form"
import ForgotPasswordForm from "./forgot-password-form"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultMode?: "login" | "register"
}

export default function AuthModal({ isOpen, onClose, defaultMode = "login" }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot-password">(defaultMode)

  const handleSuccess = () => {
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto pointer-events-auto">
              <div className="relative p-8">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {mode === "login" && (
                  <LoginForm
                    onSuccess={handleSuccess}
                    onSwitchToRegister={() => setMode("register")}
                    onForgotPassword={() => setMode("forgot-password")}
                  />
                )}

                {mode === "register" && (
                  <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={() => setMode("login")} />
                )}

                {mode === "forgot-password" && <ForgotPasswordForm onBack={() => setMode("login")} />}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
