"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, Minus, ShoppingBag, Trash2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import LazyImage from "./lazy-image"
import { useCart } from "../contexts/cart-context"

interface CartPopupProps {
  isOpen: boolean
  onClose: () => void
}

export default function CartPopup({ isOpen, onClose }: CartPopupProps) {
  const { state, removeFromCart, updateQuantity, applyDiscount, removeDiscount, getDiscountedTotal } = useCart()
  const [discountCode, setDiscountCode] = useState("")
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false)

  // Safety check for state
  if (!state) {
    return null
  }

  const { items = [], total = 0, itemCount = 0, discounts = [] } = state

  const handleQuantityChange = (id: string | number, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(id)
    } else {
      updateQuantity(id, newQuantity)
    }
  }

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return

    setIsApplyingDiscount(true)
    try {
      // Simulate discount validation
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Mock discount codes
      const validDiscounts: Record<string, { amount: number; percentage: number }> = {
        SAVE10: { amount: 0, percentage: 10 },
        WELCOME20: { amount: 0, percentage: 20 },
        FLAT500: { amount: 500, percentage: 0 },
      }

      const discount = validDiscounts[discountCode.toUpperCase()]
      if (discount) {
        const discountAmount = discount.percentage > 0 ? (total * discount.percentage) / 100 : discount.amount
        applyDiscount(discountCode.toUpperCase(), discountAmount, discount.percentage)
        setDiscountCode("")
      } else {
        alert("Invalid discount code")
      }
    } catch (error) {
      console.error("Error applying discount:", error)
      alert("Error applying discount code")
    } finally {
      setIsApplyingDiscount(false)
    }
  }

  const discountedTotal = getDiscountedTotal()
  const totalDiscount = total - discountedTotal

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Cart Popup */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Shopping Cart</h2>
                {itemCount > 0 && (
                  <span className="bg-black text-white text-xs px-2 py-1 rounded-full">{itemCount}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-6">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Your cart is empty</h3>
                  <p className="text-gray-500 mb-6">Add some products to get started</p>
                  <Button onClick={onClose} className="bg-black text-white hover:bg-gray-800">
                    Continue Shopping
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <motion.div
                      key={`${item.id}-${item.size}`}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="flex gap-4 p-4 border rounded-lg"
                    >
                      <div className="w-16 h-16 flex-shrink-0">
                        <LazyImage
                          src={item.image || "/placeholder.svg?height=64&width=64"}
                          alt={item.name || "Product"}
                          className="w-full h-full object-cover rounded"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{item.name}</h4>
                        <p className="text-xs text-gray-500">{item.size}</p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-8 h-8 p-0 bg-transparent"
                              onClick={() => handleQuantityChange(item.id, (item.quantity || 1) - 1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity || 1}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-8 h-8 p-0 bg-transparent"
                              onClick={() => handleQuantityChange(item.id, (item.quantity || 1) + 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 p-1"
                            onClick={() => removeFromCart(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="font-semibold">₹{((item.price || 0) * (item.quantity || 1)).toLocaleString()}</p>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <p className="text-xs text-gray-500 line-through">
                            ₹{(item.originalPrice * (item.quantity || 1)).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Discount Section */}
            {items.length > 0 && (
              <div className="border-t p-6">
                <div className="space-y-4">
                  {/* Applied Discounts */}
                  {discounts.length > 0 && (
                    <div className="space-y-2">
                      {discounts.map((discount, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-green-600">
                            {discount.code} (
                            {discount.percentage > 0 ? `${discount.percentage}%` : `₹${discount.amount}`})
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 p-1"
                            onClick={() => removeDiscount(discount.code || "")}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Discount Code Input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Discount code"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleApplyDiscount}
                      disabled={!discountCode.trim() || isApplyingDiscount}
                      className="bg-black text-white hover:bg-gray-800"
                    >
                      {isApplyingDiscount ? "..." : "Apply"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t p-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>₹{total.toLocaleString()}</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-₹{totalDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Total</span>
                    <span>₹{discountedTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Link href="/checkout" onClick={onClose}>
                    <Button className="w-full bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2">
                      Proceed to Checkout
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full bg-transparent" onClick={onClose}>
                    Continue Shopping
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
