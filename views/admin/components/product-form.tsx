"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { X, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Product } from "@/lib/api"

interface ProductFormProps {
  product?: Product | null
  onSubmit: (data: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<void>
  onCancel: () => void
}

const categories = [
  { value: "woody", label: "Woody" },
  { value: "oriental", label: "Oriental" },
  { value: "fresh", label: "Fresh" },
  { value: "floral", label: "Floral" },
  { value: "citrus", label: "Citrus" },
]

const sizes = ["30ml", "50ml", "100ml", "150ml"]

export default function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    originalPrice: 0,
    category: "woody",
    stock: 0,
    status: "active" as "active" | "inactive",
    image: "",
    size: "100ml",
    notes: {
      top: [""],
      middle: [""],
      base: [""],
    },
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [imagePreview, setImagePreview] = useState("")

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        description: product.description,
        price: product.price,
        originalPrice: product.originalPrice || 0,
        category: product.category,
        stock: product.stock,
        status: product.status,
        image: product.image,
        size: product.size || "100ml",
        notes: product.notes || { top: [""], middle: [""], base: [""] },
      })
      setImagePreview(product.image)
    }
  }, [product])

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleNotesChange = (type: "top" | "middle" | "base", index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [type]: prev.notes[type].map((note, i) => (i === index ? value : note)),
      },
    }))
  }

  const addNote = (type: "top" | "middle" | "base") => {
    setFormData((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [type]: [...prev.notes[type], ""],
      },
    }))
  }

  const removeNote = (type: "top" | "middle" | "base", index: number) => {
    setFormData((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [type]: prev.notes[type].filter((_, i) => i !== index),
      },
    }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        setImagePreview(result)
        setFormData((prev) => ({ ...prev, image: result }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error("Product name is required")
      }
      if (!formData.description.trim()) {
        throw new Error("Product description is required")
      }
      if (formData.price <= 0) {
        throw new Error("Price must be greater than 0")
      }
      if (formData.stock < 0) {
        throw new Error("Stock cannot be negative")
      }

      // Clean up notes (remove empty ones)
      const cleanNotes = {
        top: formData.notes.top.filter((note) => note.trim()),
        middle: formData.notes.middle.filter((note) => note.trim()),
        base: formData.notes.base.filter((note) => note.trim()),
      }

      const productData = {
        ...formData,
        notes: cleanNotes,
        discount:
          formData.originalPrice > formData.price
            ? Math.round(((formData.originalPrice - formData.price) / formData.originalPrice) * 100)
            : 0,
      }

      await onSubmit(productData)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save product")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Basic Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Enter product name"
              required
            />
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => handleInputChange("category", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              required
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            placeholder="Enter product description"
            rows={3}
            required
          />
        </div>
      </div>

      {/* Pricing & Inventory */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Pricing & Inventory</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="price">Price (₹) *</Label>
            <Input
              id="price"
              type="number"
              value={formData.price}
              onChange={(e) => handleInputChange("price", Number(e.target.value))}
              placeholder="0"
              min="0"
              step="0.01"
              required
            />
          </div>

          <div>
            <Label htmlFor="originalPrice">Original Price (₹)</Label>
            <Input
              id="originalPrice"
              type="number"
              value={formData.originalPrice}
              onChange={(e) => handleInputChange("originalPrice", Number(e.target.value))}
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <Label htmlFor="stock">Stock Quantity *</Label>
            <Input
              id="stock"
              type="number"
              value={formData.stock}
              onChange={(e) => handleInputChange("stock", Number(e.target.value))}
              placeholder="0"
              min="0"
              required
            />
          </div>

          <div>
            <Label htmlFor="size">Size</Label>
            <select
              id="size"
              value={formData.size}
              onChange={(e) => handleInputChange("size", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => handleInputChange("status", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Image Upload */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Product Image</h3>

        <div className="flex items-center gap-4">
          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview || "/placeholder.svg"}
                alt="Preview"
                className="w-20 h-24 object-cover rounded border"
              />
              <button
                type="button"
                onClick={() => {
                  setImagePreview("")
                  setFormData((prev) => ({ ...prev, image: "" }))
                }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div>
            <Label htmlFor="image">Upload Image</Label>
            <Input id="image" type="file" accept="image/*" onChange={handleImageUpload} className="cursor-pointer" />
            <p className="text-sm text-gray-500 mt-1">Recommended: 400x300px, JPG or PNG</p>
          </div>
        </div>
      </div>

      {/* Fragrance Notes */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Fragrance Notes</h3>

        {(["top", "middle", "base"] as const).map((noteType) => (
          <div key={noteType} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="capitalize">{noteType} Notes</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addNote(noteType)}
                className="flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Note
              </Button>
            </div>

            <div className="space-y-2">
              {formData.notes[noteType].map((note, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={note}
                    onChange={(e) => handleNotesChange(noteType, index, e.target.value)}
                    placeholder={`Enter ${noteType} note`}
                    className="flex-1"
                  />
                  {formData.notes[noteType].length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeNote(noteType, index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Form Actions */}
      <div className="flex gap-4 pt-6 border-t">
        <Button type="submit" disabled={loading} className="flex-1 bg-black text-white hover:bg-gray-800">
          {loading ? "Saving..." : product ? "Update Product" : "Create Product"}
        </Button>
        <Button type="button" onClick={onCancel} variant="outline" className="flex-1 bg-transparent">
          Cancel
        </Button>
      </div>
    </form>
  )
}
