import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

export interface AdminUpdate {
  id: string
  type: "product_created" | "product_updated" | "product_deleted" | "order_updated" | "user_registered"
  title: string
  description: string
  data: any
  adminId: string
  adminName: string
  timestamp: Timestamp
  priority: "high" | "medium" | "low"
  read: boolean
}

export interface NotificationData {
  id: string
  type: string
  title: string
  message: string
  priority: "high" | "medium" | "low"
  read: boolean
  createdAt: Timestamp
  userId?: string
}

class FirebaseAdminService {
  // Log admin updates to Firebase
  async logAdminUpdate(update: Omit<AdminUpdate, "id" | "timestamp" | "read">) {
    try {
      const updateRef = doc(collection(db, "admin_updates"))
      await setDoc(updateRef, {
        ...update,
        id: updateRef.id,
        timestamp: serverTimestamp(),
        read: false,
      })

      // Also create a notification
      await this.createNotification({
        type: update.type,
        title: update.title,
        message: update.description,
        priority: update.priority,
      })

      console.log("Admin update logged:", update.type)
    } catch (error) {
      console.error("Error logging admin update:", error)
    }
  }

  // Create notification
  async createNotification(notification: Omit<NotificationData, "id" | "createdAt" | "read">) {
    try {
      const notificationRef = doc(collection(db, "notifications"))
      await setDoc(notificationRef, {
        ...notification,
        id: notificationRef.id,
        createdAt: serverTimestamp(),
        read: false,
      })

      console.log("Notification created:", notification.type)
    } catch (error) {
      console.error("Error creating notification:", error)
    }
  }

  // Subscribe to admin updates
  subscribeToAdminUpdates(callback: (updates: AdminUpdate[]) => void) {
    const q = query(collection(db, "admin_updates"), orderBy("timestamp", "desc"), limit(50))

    return onSnapshot(q, (snapshot) => {
      const updates: AdminUpdate[] = []
      snapshot.forEach((doc) => {
        updates.push(doc.data() as AdminUpdate)
      })
      callback(updates)
    })
  }

  // Subscribe to notifications
  subscribeToNotifications(callback: (notifications: NotificationData[]) => void) {
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(20))

    return onSnapshot(q, (snapshot) => {
      const notifications: NotificationData[] = []
      snapshot.forEach((doc) => {
        notifications.push(doc.data() as NotificationData)
      })
      callback(notifications)
    })
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId: string) {
    try {
      const notificationRef = doc(db, "notifications", notificationId)
      await updateDoc(notificationRef, {
        read: true,
      })
    } catch (error) {
      console.error("Error marking notification as read:", error)
    }
  }

  // Mark admin update as read
  async markAdminUpdateAsRead(updateId: string) {
    try {
      const updateRef = doc(db, "admin_updates", updateId)
      await updateDoc(updateRef, {
        read: true,
      })
    } catch (error) {
      console.error("Error marking admin update as read:", error)
    }
  }

  // Get unread notifications count
  async getUnreadNotificationsCount(): Promise<number> {
    try {
      const q = query(collection(db, "notifications"), where("read", "==", false))
      const snapshot = await getDocs(q)
      return snapshot.size
    } catch (error) {
      console.error("Error getting unread notifications count:", error)
      return 0
    }
  }

  // Sync product data between backend and Firebase
  async syncProductData(productId: string, productData: any) {
    try {
      const productRef = doc(db, "products", productId)
      await setDoc(
        productRef,
        {
          ...productData,
          lastSynced: serverTimestamp(),
        },
        { merge: true },
      )

      console.log("Product data synced to Firebase:", productId)
    } catch (error) {
      console.error("Error syncing product data:", error)
    }
  }

  // Sync order data between backend and Firebase
  async syncOrderData(orderId: string, orderData: any) {
    try {
      const orderRef = doc(db, "orders", orderId)
      await setDoc(
        orderRef,
        {
          ...orderData,
          lastSynced: serverTimestamp(),
        },
        { merge: true },
      )

      console.log("Order data synced to Firebase:", orderId)
    } catch (error) {
      console.error("Error syncing order data:", error)
    }
  }

  // Get real-time dashboard stats
  subscribeToStats(callback: (stats: any) => void) {
    // Subscribe to multiple collections for real-time stats
    const unsubscribers: (() => void)[] = []

    // Products count
    const productsQuery = collection(db, "products")
    unsubscribers.push(
      onSnapshot(productsQuery, (snapshot) => {
        const productsCount = snapshot.size
        callback({ productsCount })
      }),
    )

    // Orders count and revenue
    const ordersQuery = collection(db, "orders")
    unsubscribers.push(
      onSnapshot(ordersQuery, (snapshot) => {
        let ordersCount = 0
        let totalRevenue = 0

        snapshot.forEach((doc) => {
          const order = doc.data()
          ordersCount++
          if (order.total) {
            totalRevenue += order.total
          }
        })

        callback({ ordersCount, totalRevenue })
      }),
    )

    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }

  // Log product operations
  async logProductOperation(
    operation: "create" | "update" | "delete",
    productData: any,
    adminInfo: { id: string; name: string },
  ) {
    const operationMap = {
      create: "product_created",
      update: "product_updated",
      delete: "product_deleted",
    }

    await this.logAdminUpdate({
      type: operationMap[operation] as any,
      title: `Product ${operation}d`,
      description: `${adminInfo.name} ${operation}d product: ${productData.name}`,
      data: productData,
      adminId: adminInfo.id,
      adminName: adminInfo.name,
      priority: operation === "delete" ? "high" : "medium",
    })
  }

  // Log order operations
  async logOrderOperation(operation: "status_updated", orderData: any, adminInfo: { id: string; name: string }) {
    await this.logAdminUpdate({
      type: "order_updated",
      title: "Order Status Updated",
      description: `${adminInfo.name} updated order ${orderData.id} status to ${orderData.status}`,
      data: orderData,
      adminId: adminInfo.id,
      adminName: adminInfo.name,
      priority: "medium",
    })
  }
}

export const firebaseAdminService = new FirebaseAdminService()
