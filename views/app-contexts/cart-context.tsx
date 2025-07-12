"use client"

import type React from "react"
import { createContext, useContext, useReducer, useEffect } from "react"

interface CartItem {
  id: string | number
  name: string
  price: number
  originalPrice?: number
  size: string
  image: string
  category: string
  quantity: number
}

interface CartState {
  items: CartItem[]
  total: number
  itemCount: number
  discounts: {
    code?: string
    amount: number
    percentage: number
  }[]
}

type CartAction =
  | { type: "ADD_ITEM"; payload: Omit<CartItem, "quantity"> }
  | { type: "REMOVE_ITEM"; payload: string | number }
  | { type: "UPDATE_QUANTITY"; payload: { id: string | number; quantity: number } }
  | { type: "CLEAR_CART" }
  | { type: "APPLY_DISCOUNT"; payload: { code: string; amount: number; percentage: number } }
  | { type: "REMOVE_DISCOUNT"; payload: string }
  | { type: "LOAD_CART"; payload: CartState }

const initialState: CartState = {
  items: [],
  total: 0,
  itemCount: 0,
  discounts: [],
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      // Ensure state.items exists
      const items = state.items || []
      const existingItemIndex = items.findIndex(
        (item) => item.id === action.payload.id && item.size === action.payload.size,
      )

      let newItems: CartItem[]
      if (existingItemIndex > -1) {
        newItems = items.map((item, index) =>
          index === existingItemIndex ? { ...item, quantity: item.quantity + 1 } : item,
        )
      } else {
        newItems = [...items, { ...action.payload, quantity: 1 }]
      }

      const total = newItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)
      const itemCount = newItems.reduce((sum, item) => sum + (item.quantity || 0), 0)

      return {
        ...state,
        items: newItems,
        total,
        itemCount,
      }
    }

    case "REMOVE_ITEM": {
      const items = state.items || []
      const newItems = items.filter((item) => item.id !== action.payload)
      const total = newItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)
      const itemCount = newItems.reduce((sum, item) => sum + (item.quantity || 0), 0)

      return {
        ...state,
        items: newItems,
        total,
        itemCount,
      }
    }

    case "UPDATE_QUANTITY": {
      if (action.payload.quantity <= 0) {
        return cartReducer(state, { type: "REMOVE_ITEM", payload: action.payload.id })
      }

      const items = state.items || []
      const newItems = items.map((item) =>
        item.id === action.payload.id ? { ...item, quantity: action.payload.quantity } : item,
      )

      const total = newItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)
      const itemCount = newItems.reduce((sum, item) => sum + (item.quantity || 0), 0)

      return {
        ...state,
        items: newItems,
        total,
        itemCount,
      }
    }

    case "CLEAR_CART":
      return {
        ...initialState,
        discounts: state.discounts || [], // Keep discounts for next order
      }

    case "APPLY_DISCOUNT": {
      const discounts = state.discounts || []
      const existingDiscountIndex = discounts.findIndex((d) => d.code === action.payload.code)
      let newDiscounts

      if (existingDiscountIndex > -1) {
        newDiscounts = discounts.map((discount, index) => (index === existingDiscountIndex ? action.payload : discount))
      } else {
        newDiscounts = [...discounts, action.payload]
      }

      return {
        ...state,
        discounts: newDiscounts,
      }
    }

    case "REMOVE_DISCOUNT": {
      const discounts = state.discounts || []
      const newDiscounts = discounts.filter((d) => d.code !== action.payload)
      return {
        ...state,
        discounts: newDiscounts,
      }
    }

    case "LOAD_CART":
      // Ensure loaded cart has proper structure
      return {
        items: action.payload.items || [],
        total: action.payload.total || 0,
        itemCount: action.payload.itemCount || 0,
        discounts: action.payload.discounts || [],
      }

    default:
      return state
  }
}

interface CartContextType {
  state: CartState
  addToCart: (item: Omit<CartItem, "quantity">) => void
  removeFromCart: (id: string | number) => void
  updateQuantity: (id: string | number, quantity: number) => void
  clearCart: () => void
  applyDiscount: (code: string, amount: number, percentage: number) => void
  removeDiscount: (code: string) => void
  getDiscountedTotal: () => number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("fragransia-cart")
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart)
        // Validate the parsed cart structure
        if (parsedCart && typeof parsedCart === "object") {
          dispatch({ type: "LOAD_CART", payload: parsedCart })
        }
      }
    } catch (error) {
      console.error("Error loading cart from localStorage:", error)
      // Clear invalid cart data
      localStorage.removeItem("fragransia-cart")
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("fragransia-cart", JSON.stringify(state))
    } catch (error) {
      console.error("Error saving cart to localStorage:", error)
    }
  }, [state])

  const addToCart = (item: Omit<CartItem, "quantity">) => {
    dispatch({ type: "ADD_ITEM", payload: item })
  }

  const removeFromCart = (id: string | number) => {
    dispatch({ type: "REMOVE_ITEM", payload: id })
  }

  const updateQuantity = (id: string | number, quantity: number) => {
    dispatch({ type: "UPDATE_QUANTITY", payload: { id, quantity } })
  }

  const clearCart = () => {
    dispatch({ type: "CLEAR_CART" })
  }

  const applyDiscount = (code: string, amount: number, percentage: number) => {
    dispatch({ type: "APPLY_DISCOUNT", payload: { code, amount, percentage } })
  }

  const removeDiscount = (code: string) => {
    dispatch({ type: "REMOVE_DISCOUNT", payload: code })
  }

  const getDiscountedTotal = () => {
    const discounts = state.discounts || []
    const discountAmount = discounts.reduce((sum, discount) => sum + (discount.amount || 0), 0)
    return Math.max(0, (state.total || 0) - discountAmount)
  }

  const value: CartContextType = {
    state,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    applyDiscount,
    removeDiscount,
    getDiscountedTotal,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}
