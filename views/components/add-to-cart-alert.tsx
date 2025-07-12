"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle, ShoppingBag, X } from "lucide-react"
import { useCart } from "../contexts/cart-context"

interface AddToCartAlertProps {
  product: any
  onClose?: () => void
}

export default function AddToCartAlert({ product, onClose }: AddToCartAlertProps) {
  const { state } = useCart()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (product) {
      setIsVisible(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        onClose?.()
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [product, onClose])

  const handleClose = () => {
    setIsVisible(false)
    onClose?.()
  }

  return (
    <AnimatePresence>
      {isVisible && product && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -100, scale: 0.8 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed top-20 right-4 z-50 bg-white rounded-lg shadow-2xl border border-gray-200 p-4 max-w-sm"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 text-sm">Added to Cart!</h3>
                <p className="text-xs text-gray-600">Cart updated successfully</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-14 bg-gray-100 rounded overflow-hidden">
              <img
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
              <p className="text-xs text-gray-500">{product.size || "100ml"}</p>
              <p className="text-sm font-semibold text-gray-900">₹{product.price.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ShoppingBag className="w-3 h-3" />
              <span>{state.itemCount} items in cart</span>
            </div>
            <div className="text-xs font-medium text-gray-900">Total: ₹{state.total.toLocaleString()}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
