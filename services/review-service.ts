import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { db, storage } from "./firebase"

export interface Review {
  id: string
  productId: string
  userId: string
  userName: string
  userEmail: string
  rating: number
  title: string
  content: string
  images: string[]
  helpful: number
  notHelpful: number
  verified: boolean
  createdAt: any
  updatedAt: any
}

export interface ReviewStats {
  averageRating: number
  totalReviews: number
  ratingDistribution: { [key: number]: number }
}

class ReviewService {
  private get reviewsCollection() {
    if (!db) throw new Error("Firebase not available")
    return collection(db, "reviews")
  }

  private get helpfulVotesCollection() {
    if (!db) throw new Error("Firebase not available")
    return collection(db, "reviewHelpfulVotes")
  }

  async addReview(reviewData: Omit<Review, "id" | "createdAt" | "updatedAt" | "helpful" | "notHelpful">) {
    try {
      if (!db) {
        console.warn("Firebase not available, skipping review add")
        return "offline-" + Date.now()
      }

      const docRef = await addDoc(this.reviewsCollection, {
        ...reviewData,
        helpful: 0,
        notHelpful: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return docRef.id
    } catch (error) {
      console.error("Error adding review:", error)
      throw error
    }
  }

  async uploadReviewImages(files: File[], reviewId: string): Promise<string[]> {
    try {
      const uploadPromises = files.map(async (file, index) => {
        const imageRef = ref(storage, `reviews/${reviewId}/image_${index}_${Date.now()}`)
        const snapshot = await uploadBytes(imageRef, file)
        return getDownloadURL(snapshot.ref)
      })

      return await Promise.all(uploadPromises)
    } catch (error) {
      console.error("Error uploading review images:", error)
      throw error
    }
  }

  async getProductReviews(
    productId: string,
    sortBy: "newest" | "oldest" | "highest" | "lowest" | "helpful" = "newest",
    limitCount = 10,
  ): Promise<Review[]> {
    try {
      let reviewQuery = query(this.reviewsCollection, where("productId", "==", productId))

      // Apply sorting
      switch (sortBy) {
        case "newest":
          reviewQuery = query(reviewQuery, orderBy("createdAt", "desc"))
          break
        case "oldest":
          reviewQuery = query(reviewQuery, orderBy("createdAt", "asc"))
          break
        case "highest":
          reviewQuery = query(reviewQuery, orderBy("rating", "desc"))
          break
        case "lowest":
          reviewQuery = query(reviewQuery, orderBy("rating", "asc"))
          break
        case "helpful":
          reviewQuery = query(reviewQuery, orderBy("helpful", "desc"))
          break
      }

      reviewQuery = query(reviewQuery, limit(limitCount))

      const snapshot = await getDocs(reviewQuery)
      return snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as Review,
      )
    } catch (error) {
      console.error("Error getting product reviews:", error)
      return []
    }
  }

  async getReviewStats(productId: string): Promise<ReviewStats> {
    try {
      const reviewsQuery = query(this.reviewsCollection, where("productId", "==", productId))
      const snapshot = await getDocs(reviewsQuery)
      const reviews = snapshot.docs.map((doc) => doc.data())

      if (reviews.length === 0) {
        return {
          averageRating: 0,
          totalReviews: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        }
      }

      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0)
      const averageRating = totalRating / reviews.length

      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      reviews.forEach((review) => {
        ratingDistribution[review.rating as keyof typeof ratingDistribution]++
      })

      return {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: reviews.length,
        ratingDistribution,
      }
    } catch (error) {
      console.error("Error getting review stats:", error)
      return {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }
    }
  }

  async markReviewHelpful(reviewId: string, userId: string, isHelpful: boolean) {
    try {
      const voteId = `${reviewId}_${userId}`
      const voteRef = doc(this.helpfulVotesCollection, voteId)
      const reviewRef = doc(this.reviewsCollection, reviewId)

      // Check if user already voted
      const existingVote = await getDoc(voteRef)

      if (existingVote.exists()) {
        const existingData = existingVote.data()
        if (existingData.isHelpful === isHelpful) {
          // Same vote, remove it
          await deleteDoc(voteRef)
          await updateDoc(reviewRef, {
            [isHelpful ? "helpful" : "notHelpful"]: increment(-1),
          })
        } else {
          // Different vote, update it
          await updateDoc(voteRef, { isHelpful })
          await updateDoc(reviewRef, {
            helpful: increment(isHelpful ? 1 : -1),
            notHelpful: increment(isHelpful ? -1 : 1),
          })
        }
      } else {
        // New vote
        await addDoc(this.helpfulVotesCollection, {
          reviewId,
          userId,
          isHelpful,
          createdAt: serverTimestamp(),
        })
        await updateDoc(reviewRef, {
          [isHelpful ? "helpful" : "notHelpful"]: increment(1),
        })
      }
    } catch (error) {
      console.error("Error marking review helpful:", error)
      throw error
    }
  }

  async deleteReview(reviewId: string, userId: string) {
    try {
      const reviewRef = doc(this.reviewsCollection, reviewId)
      const reviewDoc = await getDoc(reviewRef)

      if (!reviewDoc.exists()) {
        throw new Error("Review not found")
      }

      const reviewData = reviewDoc.data()
      if (reviewData.userId !== userId) {
        throw new Error("Unauthorized to delete this review")
      }

      // Delete associated images
      if (reviewData.images && reviewData.images.length > 0) {
        const deletePromises = reviewData.images.map((imageUrl: string) => {
          const imageRef = ref(storage, imageUrl)
          return deleteObject(imageRef).catch(console.error)
        })
        await Promise.all(deletePromises)
      }

      // Delete the review
      await deleteDoc(reviewRef)
    } catch (error) {
      console.error("Error deleting review:", error)
      throw error
    }
  }

  async getUserReviews(userId: string): Promise<Review[]> {
    try {
      const userReviewsQuery = query(
        this.reviewsCollection,
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
      )

      const snapshot = await getDocs(userReviewsQuery)
      return snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as Review,
      )
    } catch (error) {
      console.error("Error getting user reviews:", error)
      return []
    }
  }
}

export const reviewService = new ReviewService()