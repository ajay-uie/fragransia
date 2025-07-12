import { collection, addDoc, getDocs, query, where, orderBy, writeBatch } from "firebase/firestore"
import { db } from "./firebase"

export interface WishlistItem {
  id?: string
  userId: string
  productId: string | number
  name: string
  price: number
  originalPrice?: number
  image: string
  size: string
  category: string
  addedAt: Date
  isAvailable: boolean
}

class WishlistService {
  private collectionName = "wishlists"

  async addToWishlist(userId: string, product: Omit<WishlistItem, "id" | "userId" | "addedAt">): Promise<string> {
    try {
      // Check if item already exists
      const existingItem = await this.isInWishlist(userId, product.productId)
      if (existingItem) {
        throw new Error("Item already in wishlist")
      }

      const wishlistItem: Omit<WishlistItem, "id"> = {
        userId,
        ...product,
        addedAt: new Date(),
        isAvailable: true,
      }

      const docRef = await addDoc(collection(db, this.collectionName), wishlistItem)
      return docRef.id
    } catch (error) {
      console.error("Error adding to wishlist:", error)
      throw error
    }
  }

  async removeFromWishlist(userId: string, productId: string | number): Promise<void> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where("userId", "==", userId),
        where("productId", "==", productId),
      )

      const querySnapshot = await getDocs(q)
      const batch = writeBatch(db)

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
    } catch (error) {
      console.error("Error removing from wishlist:", error)
      throw error
    }
  }

  async isInWishlist(userId: string, productId: string | number): Promise<boolean> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where("userId", "==", userId),
        where("productId", "==", productId),
      )

      const querySnapshot = await getDocs(q)
      return !querySnapshot.empty
    } catch (error) {
      console.error("Error checking wishlist:", error)
      return false
    }
  }

  async getUserWishlist(userId: string): Promise<WishlistItem[]> {
    try {
      const q = query(collection(db, this.collectionName), where("userId", "==", userId), orderBy("addedAt", "desc"))

      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as WishlistItem,
      )
    } catch (error) {
      console.error("Error getting user wishlist:", error)
      return []
    }
  }

  async removeMultipleItems(userId: string, productIds: (string | number)[]): Promise<void> {
    try {
      const batch = writeBatch(db)

      for (const productId of productIds) {
        const q = query(
          collection(db, this.collectionName),
          where("userId", "==", userId),
          where("productId", "==", productId),
        )

        const querySnapshot = await getDocs(q)
        querySnapshot.forEach((doc) => {
          batch.delete(doc.ref)
        })
      }

      await batch.commit()
    } catch (error) {
      console.error("Error removing multiple items:", error)
      throw error
    }
  }

  async updateItemAvailability(productId: string | number, isAvailable: boolean): Promise<void> {
    try {
      const q = query(collection(db, this.collectionName), where("productId", "==", productId))

      const querySnapshot = await getDocs(q)
      const batch = writeBatch(db)

      querySnapshot.forEach((doc) => {
        batch.update(doc.ref, { isAvailable })
      })

      await batch.commit()
    } catch (error) {
      console.error("Error updating item availability:", error)
      throw error
    }
  }

  async getWishlistCount(userId: string): Promise<number> {
    try {
      const q = query(collection(db, this.collectionName), where("userId", "==", userId))

      const querySnapshot = await getDocs(q)
      return querySnapshot.size
    } catch (error) {
      console.error("Error getting wishlist count:", error)
      return 0
    }
  }
}

// Create singleton instance
const wishlistService = new WishlistService()

// Named exports for direct use
export const addToWishlist = (userId: string, product: Omit<WishlistItem, "id" | "userId" | "addedAt">) =>
  wishlistService.addToWishlist(userId, product)

export const removeFromWishlist = (userId: string, productId: string | number) =>
  wishlistService.removeFromWishlist(userId, productId)

export const isInWishlist = (userId: string, productId: string | number) =>
  wishlistService.isInWishlist(userId, productId)

export const getUserWishlist = (userId: string) => wishlistService.getUserWishlist(userId)

export const removeMultipleItems = (userId: string, productIds: (string | number)[]) =>
  wishlistService.removeMultipleItems(userId, productIds)

export const updateItemAvailability = (productId: string | number, isAvailable: boolean) =>
  wishlistService.updateItemAvailability(productId, isAvailable)

export const getWishlistCount = (userId: string) => wishlistService.getWishlistCount(userId)

// Default export
export default wishlistService
