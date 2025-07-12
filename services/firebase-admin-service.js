const admin = require('firebase-admin');

class FirebaseAdminService {
  constructor() {
    this.db = admin.firestore();
  }

  async createAdminUpdate(updateData) {
    try {
      const docRef = await this.db.collection('admin_updates').add({
        ...updateData,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('Error creating admin update:', error);
      throw error;
    }
  }

  async getAdminUpdates(limit = 50) {
    try {
      const snapshot = await this.db
        .collection('admin_updates')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const updates = [];
      snapshot.forEach(doc => {
        updates.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: updates };
    } catch (error) {
      console.error('Error getting admin updates:', error);
      throw error;
    }
  }

  async markUpdateAsRead(updateId) {
    try {
      await this.db.collection('admin_updates').doc(updateId).update({
        read: true
      });
      return { success: true };
    } catch (error) {
      console.error('Error marking update as read:', error);
      throw error;
    }
  }

  async sendNotification(notificationData) {
    try {
      const docRef = await this.db.collection('notifications').add({
        ...notificationData,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  async getUserStats() {
    try {
      const usersSnapshot = await this.db.collection('users').get();
      const ordersSnapshot = await this.db.collection('orders').get();
      const productsSnapshot = await this.db.collection('products').get();

      const stats = {
        totalUsers: usersSnapshot.size,
        totalOrders: ordersSnapshot.size,
        totalProducts: productsSnapshot.size,
        activeUsers: 0, // Calculate based on recent activity
        pendingOrders: 0,
        totalRevenue: 0
      };

      // Calculate additional stats
      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        if (order.status === 'pending') {
          stats.pendingOrders++;
        }
        if (order.total) {
          stats.totalRevenue += order.total;
        }
      });

      return { success: true, data: stats };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  async getRecentOrders(limit = 10) {
    try {
      const snapshot = await this.db
        .collection('orders')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const orders = [];
      snapshot.forEach(doc => {
        orders.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: orders };
    } catch (error) {
      console.error('Error getting recent orders:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status) {
    try {
      await this.db.collection('orders').doc(orderId).update({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create admin update
      await this.createAdminUpdate({
        type: 'order_updated',
        title: 'Order Status Updated',
        description: `Order ${orderId} status changed to ${status}`,
        data: { orderId, status },
        adminId: 'system',
        adminName: 'System',
        priority: 'medium'
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseAdminService();

