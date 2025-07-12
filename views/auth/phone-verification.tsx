"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Phone, Shield, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  PhoneAuthProvider,
  linkWithCredential,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import { useAuth } from "@/contexts/auth-context"

interface PhoneVerificationProps {
  onVerified: () => void
  onCancel: () => void
}

export default function PhoneVerification({ onVerified, onCancel }: PhoneVerificationProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [countdown, setCountdown] = useState(0)
  const recaptchaRef = useRef<HTMLDivElement>(null)
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null)
  const { user, updateUserProfile } = useAuth()

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  useEffect(() => {
    return () => {
      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear()
      }
    }
  }, [])

  const initializeRecaptcha = () => {
    if (!recaptchaRef.current || recaptchaVerifier.current) return

    try {
      recaptchaVerifier.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
        size: "normal",
        callback: () => {
          console.log("reCAPTCHA solved")
        },
        "expired-callback": () => {
          setError("reCAPTCHA expired. Please try again.")
          if (recaptchaVerifier.current) {
            recaptchaVerifier.current.clear()
            recaptchaVerifier.current = null
          }
        },
      })
    } catch (error) {
      console.error("Error initializing reCAPTCHA:", error)
      setError("Failed to initialize verification. Please refresh and try again.")
    }
  }

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "")
    if (cleaned.startsWith("91")) {
      return cleaned.slice(0, 12)
    }
    return cleaned.slice(0, 10)
  }

  const validatePhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "")
    if (cleaned.startsWith("91")) {
      return cleaned.length === 12 && /^91[6-9]\d{9}$/.test(cleaned)
    }
    return cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)
  }

  const sendVerificationCode = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      setError("Please enter a valid Indian mobile number")
      return
    }

    setLoading(true)
    setError("")

    try {
      initializeRecaptcha()

      if (!recaptchaVerifier.current) {
        throw new Error("reCAPTCHA not initialized")
      }

      const formattedPhone = phoneNumber.startsWith("+91")
        ? phoneNumber
        : phoneNumber.startsWith("91")
          ? `+${phoneNumber}`
          : `+91${phoneNumber}`

      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier.current)
      setConfirmationResult(result)
      setStep("otp")
      setCountdown(60)
      setSuccess("Verification code sent successfully!")
    } catch (error: any) {
      console.error("SMS sending error:", error)

      let errorMessage = "Failed to send verification code. Please try again."

      if (error.code === "auth/captcha-check-failed") {
        errorMessage = "reCAPTCHA verification failed. Please complete the reCAPTCHA and try again."
      } else if (error.code === "auth/invalid-phone-number") {
        errorMessage = "Invalid phone number format. Please check and try again."
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many attempts. Please wait a moment and try again."
      } else if (error.code === "auth/quota-exceeded") {
        errorMessage = "SMS quota exceeded. Please try again later."
      }

      setError(errorMessage)

      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear()
        recaptchaVerifier.current = null
      }
    } finally {
      setLoading(false)
    }
  }

  const verifyOTP = async () => {
    if (!confirmationResult || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP")
      return
    }

    setLoading(true)
    setError("")

    try {
      const result = await confirmationResult.confirm(otp)

      if (user && result.user.uid !== user.uid) {
        const credential = PhoneAuthProvider.credential(confirmationResult.verificationId, otp)
        await linkWithCredential(user, credential)
      }

      await updateUserProfile({
        phone: phoneNumber,
        phoneVerified: true,
      })

      setSuccess("Phone number verified successfully!")
      setTimeout(() => {
        onVerified()
      }, 1500)
    } catch (error: any) {
      console.error("OTP verification error:", error)

      let errorMessage = "Invalid verification code. Please try again."

      if (error.code === "auth/invalid-verification-code") {
        errorMessage = "Invalid verification code. Please check and try again."
      } else if (error.code === "auth/code-expired") {
        errorMessage = "Verification code has expired. Please request a new one."
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const resendCode = async () => {
    if (countdown > 0) return

    setOtp("")
    setError("")
    await sendVerificationCode()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md"
      >
        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-4">
              {step === "phone" ? <Phone className="w-8 h-8 text-white" /> : <Shield className="w-8 h-8 text-white" />}
            </div>
            <CardTitle className="text-2xl font-light">
              {step === "phone" ? "Verify Phone Number" : "Enter Verification Code"}
            </CardTitle>
            <p className="text-gray-600 text-sm">
              {step === "phone"
                ? "We'll send you a verification code to confirm your number"
                : `Enter the 6-digit code sent to ${phoneNumber}`}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">{error}</AlertDescription>
                  </Alert>
                </motion.div>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">{success}</AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            {step === "phone" ? (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 text-sm">+91</span>
                    </div>
                    <Input
                      type="tel"
                      placeholder="Enter your mobile number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                      className="pl-12 h-12 text-lg"
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Enter 10-digit mobile number without country code</p>
                </div>

                <div ref={recaptchaRef} className="flex justify-center" />

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={onCancel}
                    disabled={loading}
                    className="flex-1 h-12 bg-transparent"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={sendVerificationCode}
                    disabled={loading || !validatePhoneNumber(phoneNumber)}
                    className="flex-1 h-12 bg-black text-white hover:bg-gray-800"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Send Code"
                    )}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Verification Code</label>
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center text-2xl tracking-widest h-12"
                    disabled={loading}
                    maxLength={6}
                  />
                </div>

                <div className="text-center">
                  {countdown > 0 ? (
                    <p className="text-sm text-gray-500">Resend code in {countdown} seconds</p>
                  ) : (
                    <button
                      onClick={resendCode}
                      disabled={loading}
                      className="text-sm text-black hover:underline disabled:opacity-50"
                    >
                      Didn't receive code? Resend
                    </button>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep("phone")}
                    disabled={loading}
                    className="flex-1 h-12 bg-transparent"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={verifyOTP}
                    disabled={loading || otp.length !== 6}
                    className="flex-1 h-12 bg-black text-white hover:bg-gray-800"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Verify"
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
