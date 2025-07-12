"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Trash2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { apiClient, type Product } from "@/lib/api"
import { firebaseAdminService } from "@/lib/firebase-admin-service"
import ProductForm from "./product-form"

export default function ProductsManagement() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Mock admin info - in real app, get from auth context
  const adminInfo = { id: "admin1", name: "Admin User" }

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.getProducts({ limit: 100 })

      if (response.success && response.data) {
        setProducts(response.data.products)
      } else {
        throw new Error(response.error || "Failed to fetch products")
      }
    } catch (error) {
      console.error("Failed to fetch products:", error)
      setError("Failed to load products. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProduct = async (productData: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    try {
      setError(null)

      // Log to Firebase first
      await firebaseAdminService.logProductOperation("create", productData, adminInfo)

      // Then call backend API
      const response = await apiClient.createProduct(productData)

      if (response.success && response.data) {
        // Sync to Firebase
        await firebaseAdminService.syncProductData(response.data.id, response.data)

        setProducts((prev) => [response.data!, ...prev])
        setSuccess("Product created successfully!")
        setIsFormOpen(false)

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000)
      } else {
        throw new Error(response.error || "Failed to create product")
      }
    } catch (error) {
      console.error("Failed to create product:", error)
      setError(error instanceof Error ? error.message : "Failed to create product")
    }
  }

  const handleUpdateProduct = async (productId: string, updates: Partial<Product>) => {
    try {
      setError(null)

      // Log to Firebase first
      await firebaseAdminService.logProductOperation("update", { id: productId, ...updates }, adminInfo)

      // Then call backend API
      const response = await apiClient.updateProduct(productId, updates)

      if (response.success && response.data) {
        // Sync to Firebase
        await firebaseAdminService.syncProductData(response.data.id, response.data)

        setProducts((prev) => prev.map((product) => (product.id === productId ? response.data! : product)))
        setSuccess("Product updated successfully!")
        setIsFormOpen(false)
        setSelectedProduct(null)

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000)
      } else {
        throw new Error(response.error || "Failed to update product")
      }
    } catch (error) {
      console.error("Failed to update product:", error)
      setError(error instanceof Error ? error.message : "Failed to update product")
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return

    try {
      setError(null)

      const productToDelete = products.find((p) => p.id === productId)

      // Log to Firebase first
      if (productToDelete) {
        await firebaseAdminService.logProductOperation("delete", productToDelete, adminInfo)
      }

      // Then call backend API
      const response = await apiClient.deleteProduct(productId)

      if (response.success) {
        setProducts((prev) => prev.filter((product) => product.id !== productId))
        setSuccess("Product deleted successfully!")

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000)
      } else {
        throw new Error(response.error || "Failed to delete product")
      }
    } catch (error) {
      console.error("Failed to delete product:", error)
      setError(error instanceof Error ? error.message : "Failed to delete product")
    }
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const openCreateForm = () => {
    setSelectedProduct(null)
    setIsEditing(false)
    setIsFormOpen(true)
  }

  const openEditForm = (product: Product) => {
    setSelectedProduct(product)
    setIsEditing(true)
    setIsFormOpen(true)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Products Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Products Management
          </div>
          <Button onClick={openCreateForm} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Product
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Products List */}
        <div className="space-y-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No products found</p>
            </div>
          ) : (
            filteredProducts.map((product) => (
              <div key={product.id} className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-gray-50">
                <img
                  src={product.image || "/placeholder.svg"}
                  alt={product.name}
                  className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1">
                  <h3 className="font-medium">{product.name}</h3>
                  <p className="text-sm text-gray-600">₹{product.price}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={product.status === "active" ? "default" : "secondary"}>{product.status}</Badge>
                    <Badge variant="outline">{product.category}</Badge>
                    <span className="text-xs text-gray-500">Stock: {product.stock}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEditForm(product)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteProduct(product.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Product Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit Product" : "Create New Product"}</DialogTitle>
            </DialogHeader>
            <ProductForm
              product={selectedProduct}
              onSubmit={isEditing ? (data) => handleUpdateProduct(selectedProduct!.id, data) : handleCreateProduct}
              onCancel={() => setIsFormOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
