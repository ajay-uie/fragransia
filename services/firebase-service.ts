import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot,
  type QueryConstraint,
} from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { db, storage } from "./firebase"

export interface CookiePreference {
  id: string
  userId?: string
  sessionId: string
  essential: boolean
  analytics: boolean
  marketing: boolean
  preferences: boolean
  acceptedAt: Date
  expiresAt: Date
  ipAddress?: string
  userAgent?: string
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  role: "user" | "admin"
  phone?: string
  phoneVerified?: boolean
  addresses?: Address[]
  preferences?: UserPreferences
  cookiePreferences?: CookiePreference
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
  isActive: boolean
}

export interface Address {
  id: string
  label: string
  street: string
  city: string
  state: string
  zipCode: string
  country: string
  isDefault: boolean
}

export interface UserPreferences {
  newsletter: boolean
  notifications: boolean
  theme: "light" | "dark" | "auto"
  language: string
  currency: string
  emailFrequency: "daily" | "weekly" | "monthly" | "never"
  smsNotifications: boolean
}

export interface Product {
  id: string
  name: string
  description: string
  price: number
  originalPrice?: number
  images: string[]
  category: string
  brand: string
  inStock: boolean
  stockQuantity: number
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export interface Order {
  id: string
  userId: string
  items: OrderItem[]
  totalAmount: number
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled"
  shippingAddress: Address
  billingAddress?: Address
  paymentMethod: string
  paymentStatus: "pending" | "paid" | "failed" | "refunded"
  createdAt: Date
  updatedAt: Date
  trackingNumber?: string
}

export interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
  image: string
}

class FirebaseService {
  async saveCookiePreferences(preferences: Omit<CookiePreference, "id">): Promise<string> {
    const docRef = await addDoc(collection(db, "cookiePreferences"), {
      ...preferences,
      acceptedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    return docRef.id
  }

  async getCookiePreferences(sessionId: string, userId?: string): Promise<CookiePreference | null> {
    const constraints: QueryConstraint[] = [where("sessionId", "==", sessionId)]
    if (userId) constraints.push(where("userId", "==", userId))

    const q = query(collection(db, "cookiePreferences"), ...constraints, orderBy("acceptedAt", "desc"), limit(1))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0]
      return { id: doc.id, ...doc.data() } as CookiePreference
    }
    return null
  }

  async updateCookiePreferences(id: string, preferences: Partial<CookiePreference>): Promise<void> {
    await updateDoc(doc(db, "cookiePreferences", id), {
      ...preferences,
      updatedAt: serverTimestamp(),
    })
  }

  async createUserProfile(profile: Omit<UserProfile, "createdAt" | "updatedAt">): Promise<void> {
    await setDoc(doc(db, "users", profile.uid), {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isActive: true,
    })
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const docSnap = await getDoc(doc(db, "users", uid))
    if (docSnap.exists()) return { uid, ...docSnap.data() } as UserProfile
    return null
  }

  async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
    await updateDoc(doc(db, "users", uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  }

  async updateLastLogin(uid: string): Promise<void> {
    await updateDoc(doc(db, "users", uid), {
      lastLoginAt: serverTimestamp(),
    })
  }

  async addAddress(uid: string, address: Omit<Address, "id">): Promise<string> {
    const userRef = doc(db, "users", uid)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) throw new Error("User not found")

    const userData = userDoc.data() as UserProfile
    const addresses = userData.addresses || []
    const newAddress: Address = {
      ...address,
      id: Date.now().toString(),
      isDefault: addresses.length === 0,
    }

    addresses.push(newAddress)
    await updateDoc(userRef, {
      addresses,
      updatedAt: serverTimestamp(),
    })

    return newAddress.id
  }

  async updateAddress(uid: string, addressId: string, updates: Partial<Address>): Promise<void> {
    const userRef = doc(db, "users", uid)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) return

    const userData = userDoc.data() as UserProfile
    const addresses = userData.addresses || []
    const index = addresses.findIndex((a) => a.id === addressId)

    if (index !== -1) {
      addresses[index] = { ...addresses[index], ...updates }
      await updateDoc(userRef, { addresses, updatedAt: serverTimestamp() })
    }
  }

  async deleteAddress(uid: string, addressId: string): Promise<void> {
    const userRef = doc(db, "users", uid)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) return

    const userData = userDoc.data() as UserProfile
    let addresses = userData.addresses || []

    addresses = addresses.filter((a) => a.id !== addressId)

    if (addresses.length > 0 && !addresses.some((a) => a.isDefault)) {
      addresses[0].isDefault = true
    }

    await updateDoc(userRef, { addresses, updatedAt: serverTimestamp() })
  }

  async createProduct(product: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const docRef = await addDoc(collection(db, "products"), {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return docRef.id
  }

  async getProduct(id: string): Promise<Product | null> {
    const docSnap = await getDoc(doc(db, "products", id))
    if (docSnap.exists()) return { id, ...docSnap.data() } as Product
    return null
  }

  async getProducts(filters?: {
    category?: string
    brand?: string
    inStock?: boolean
    limit?: number
  }): Promise<Product[]> {
    const constraints: QueryConstraint[] = []

    if (filters?.category) constraints.push(where("category", "==", filters.category))
    if (filters?.brand) constraints.push(where("brand", "==", filters.brand))
    if (filters?.inStock !== undefined) constraints.push(where("inStock", "==", filters.inStock))
    if (filters?.limit) constraints.push(limit(filters.limit))

    const q = query(collection(db, "products"), ...constraints, orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Product[]
  }

  async createOrder(order: Omit<Order, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const docRef = await addDoc(collection(db, "orders"), {
      ...order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return docRef.id
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    const q = query(collection(db, "orders"), where("userId", "==", userId), orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[]
  }

  async updateOrderStatus(orderId: string, status: Order["status"]): Promise<void> {
    await updateDoc(doc(db, "orders", orderId), {
      status,
      updatedAt: serverTimestamp(),
    })
  }

  async uploadFile(file: File, path: string): Promise<string> {
    const storageRef = ref(storage, path)
    const snapshot = await uploadBytes(storageRef, file)
    return await getDownloadURL(snapshot.ref)
  }

  async deleteFile(path: string): Promise<void> {
    const storageRef = ref(storage, path)
    await deleteObject(storageRef)
  }

  subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void): () => void {
    return onSnapshot(
      doc(db, "users", uid),
      (doc) => {
        if (doc.exists()) callback({ uid, ...doc.data() } as UserProfile)
        else callback(null)
      },
      (error) => {
        console.error("Error in user profile subscription:", error)
        callback(null)
      },
    )
  }

  subscribeToUserOrders(userId: string, callback: (orders: Order[]) => void): () => void {
    const q = query(collection(db, "orders"), where("userId", "==", userId), orderBy("createdAt", "desc"))

    return onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[]
        callback(orders)
      },
      (error) => {
        console.error("Error in orders subscription:", error)
        callback([])
      },
    )
  }

  async logUserActivity(userId: string, activity: string, metadata?: Record<string, any>): Promise<void> {
    await addDoc(collection(db, "userActivity"), {
      userId,
      activity,
      metadata: metadata || {},
      timestamp: serverTimestamp(),
    })
  }

  async logPageView(userId: string | null, page: string, referrer?: string): Promise<void> {
    await addDoc(collection(db, "pageViews"), {
      userId,
      page,
      referrer: referrer || document.referrer,
      userAgent: navigator.userAgent,
      timestamp: serverTimestamp(),
    })
  }
}

export const firebaseService = new FirebaseService()
export default firebaseService