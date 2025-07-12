"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Heart, ShoppingCart, Trash2, Share2, Grid3X3, List, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { useCart } from "@/contexts/cart-context"
import Navigation from "../components/navigation"
import Footer from "../components/footer"
import LazyImage from "../components/lazy-image"
import { getUserWishlist, removeFromWishlist, removeMultipleItems, type WishlistItem } from "@/lib/wishlist-service"

export default function WishlistPage() {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WishlistItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"date" | "price" | "name">("date")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [isCartOpen, setIsCartOpen] = useState(false)

  const { user } = useAuth()
  const { addToCart } = useCart()
  const { toast } = useToast()

  useEffect(() => {
    if (user?.uid) {
      loadWishlist()
    }
  }, [user?.uid])

  useEffect(() => {
    filterAndSortItems()
  }, [wishlistItems, searchQuery, categoryFilter, sortBy])

  const loadWishlist = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const items = await getUserWishlist(user.uid)
      setWishlistItems(items)
    } catch (error) {
      console.error("Error loading wishlist:", error)
      toast({
        title: "Error",
        description: "Failed to load wishlist",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const filterAndSortItems = () => {
    let filtered = [...wishlistItems]

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }

    // Apply category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) => item.category === categoryFilter)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        case "price":
          return a.price - b.price
        case "name":
          return a.name.localeCompare(b.name)
        default:
          return 0
      }
    })

    setFilteredItems(filtered)
  }

  const handleRemoveItem = async (productId: string | number) => {
    if (!user?.uid) return

    try {
      await removeFromWishlist(user.uid, productId)
      setWishlistItems((prev) => prev.filter((item) => item.productId !== productId))
      setSelectedItems((prev) => {
        const newSet = new Set(prev)
        newSet.delete(productId.toString())
        return newSet
      })
      toast({
        title: "Removed from Wishlist",
        description: "Item has been removed from your wishlist",
      })
    } catch (error) {
      console.error("Error removing item:", error)
      toast({
        title: "Error",
        description: "Failed to remove item from wishlist",
        variant: "destructive",
      })
    }
  }

  const handleBulkRemove = async () => {
    if (!user?.uid || selectedItems.size === 0) return

    try {
      const productIds = Array.from(selectedItems).map((id) => (isNaN(Number(id)) ? id : Number(id)))
      await removeMultipleItems(user.uid, productIds)
      setWishlistItems((prev) => prev.filter((item) => !selectedItems.has(item.productId.toString())))
      setSelectedItems(new Set())
      toast({
        title: "Items Removed",
        description: `${selectedItems.size} items removed from wishlist`,
      })
    } catch (error) {
      console.error("Error removing items:", error)
      toast({
        title: "Error",
        description: "Failed to remove items from wishlist",
        variant: "destructive",
      })
    }
  }

  const handleAddToCart = (item: WishlistItem) => {
    addToCart({
      id: item.productId,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice,
      size: item.size,
      image: item.image,
      category: item.category,
    })
    toast({
      title: "Added to Cart",
      description: `${item.name} has been added to your cart`,
    })
  }

  const handleSelectItem = (productId: string | number, checked: boolean) => {
    const newSet = new Set(selectedItems)
    if (checked) {
      newSet.add(productId.toString())
    } else {
      newSet.delete(productId.toString())
    }
    setSelectedItems(newSet)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(filteredItems.map((item) => item.productId.toString())))
    } else {
      setSelectedItems(new Set())
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Wishlist - Fragransia",
          text: "Check out my wishlist on Fragransia",
          url: window.location.href,
        })
      } catch (error) {
        console.error("Error sharing:", error)
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href)
      toast({
        title: "Link Copied",
        description: "Wishlist link copied to clipboard",
      })
    }
  }

  const categories = Array.from(new Set(wishlistItems.map((item) => item.category)))

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation onCartClick={() => setIsCartOpen(true)} />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <Heart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold mb-4">Please Log In</h1>
          <p className="text-gray-600 mb-8">You need to be logged in to view your wishlist</p>
          <Button className="bg-black text-white hover:bg-gray-800">Log In</Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation onCartClick={() => setIsCartOpen(true)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Wishlist</h1>
            <p className="text-gray-600">
              {wishlistItems.length} {wishlistItems.length === 1 ? "item" : "items"}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4 sm:mt-0">
            <Button variant="outline" onClick={handleShare} className="flex items-center gap-2 bg-transparent">
              <Share2 className="w-4 h-4" />
              Share
            </Button>

            {selectedItems.size > 0 && (
              <Button variant="destructive" onClick={handleBulkRemove} className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Remove ({selectedItems.size})
              </Button>
            )}
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search wishlist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value: "date" | "price" | "name") => setSortBy(value)}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort by Date</SelectItem>
              <SelectItem value="price">Sort by Price</SelectItem>
              <SelectItem value="name">Sort by Name</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode */}
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="rounded-r-none"
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="rounded-l-none"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Bulk Actions */}
        {filteredItems.length > 0 && (
          <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <Checkbox checked={selectedItems.size === filteredItems.length} onCheckedChange={handleSelectAll} />
            <span className="text-sm text-gray-600">Select All ({filteredItems.length} items)</span>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-gray-200 aspect-square rounded-lg mb-4" />
                <div className="bg-gray-200 h-4 rounded mb-2" />
                <div className="bg-gray-200 h-4 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {wishlistItems.length === 0 ? "Your wishlist is empty" : "No items match your filters"}
            </h3>
            <p className="text-gray-600 mb-8">
              {wishlistItems.length === 0
                ? "Start adding products you love to your wishlist"
                : "Try adjusting your search or filters"}
            </p>
            {searchQuery || categoryFilter !== "all" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("")
                  setCategoryFilter("all")
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button className="bg-black text-white hover:bg-gray-800">Browse Products</Button>
            )}
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-2 lg:grid-cols-4 gap-6" : "space-y-4"}>
            <AnimatePresence>
              {filteredItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className={
                    viewMode === "grid"
                      ? "group relative bg-white border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                      : "flex gap-4 p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
                  }
                >
                  {/* Selection Checkbox */}
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={selectedItems.has(item.productId.toString())}
                      onCheckedChange={(checked) => handleSelectItem(item.productId, checked as boolean)}
                      className="bg-white/80 backdrop-blur-sm"
                    />
                  </div>

                  {viewMode === "grid" ? (
                    <>
                      {/* Image */}
                      <div className="aspect-square relative">
                        <LazyImage src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        {!item.isAvailable && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white text-sm font-medium">Out of Stock</span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        <h3 className="font-medium text-sm mb-1 line-clamp-2">{item.name}</h3>
                        <p className="text-xs text-gray-500 mb-2">{item.size}</p>

                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="font-semibold">₹{item.price.toLocaleString()}</span>
                            {item.originalPrice && item.originalPrice > item.price && (
                              <span className="text-xs text-gray-500 line-through ml-2">
                                ₹{item.originalPrice.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-black text-white hover:bg-gray-800"
                            onClick={() => handleAddToCart(item)}
                            disabled={!item.isAvailable}
                          >
                            <ShoppingCart className="w-4 h-4 mr-1" />
                            Add to Cart
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleRemoveItem(item.productId)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* List View */}
                      <div className="w-24 h-24 flex-shrink-0">
                        <LazyImage src={item.image} alt={item.name} className="w-full h-full object-cover rounded" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium mb-1">{item.name}</h3>
                        <p className="text-sm text-gray-500 mb-2">
                          {item.size} • {item.category}
                        </p>

                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold">₹{item.price.toLocaleString()}</span>
                            {item.originalPrice && item.originalPrice > item.price && (
                              <span className="text-sm text-gray-500 line-through ml-2">
                                ₹{item.originalPrice.toLocaleString()}
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-black text-white hover:bg-gray-800"
                              onClick={() => handleAddToCart(item)}
                              disabled={!item.isAvailable}
                            >
                              <ShoppingCart className="w-4 h-4 mr-1" />
                              Add to Cart
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleRemoveItem(item.productId)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
