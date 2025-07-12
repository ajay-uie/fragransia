const { auth, db, admin } = require('../auth/firebaseConfig');
const orderManager = require('../database/orderManager');
const categoryManager = require('../database/categoryManager');
const couponManager = require('../database/couponManager');

const getDashboardStats = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get basic counts
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      totalUsers,
      activeUsers,
      categoriesResult,
      couponsResult
    ] = await Promise.all([
      db.collection('products').get(),
      db.collection('products').where('isActive', '==', true).get(),
      db.collection('orders').get(),
      db.collection('users').get(),
      db.collection('users').where('isActive', '==', true).get(),
      categoryManager.getCategories(false),
      couponManager.getCoupons(false)
    ]);

    // Get recent orders
    const recentOrdersQuery = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const recentOrders = [];
    recentOrdersQuery.forEach(doc => {
      const order = doc.data();
      recentOrders.push({
        id: doc.id,
        orderId: order.id || doc.id,
        customerName: order.shipping?.address?.firstName ? 
          `${order.shipping.address.firstName} ${order.shipping.address.lastName}` : 
          'Unknown Customer',
        total: order.pricing?.total || 0,
        status: order.status,
        createdAt: order.createdAt?.toDate()?.toISOString()
      });
    });

    // Get orders in different time periods for analytics
    const [
      todayOrders,
      weekOrders,
      monthOrders
    ] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', today).get(),
      db.collection('orders').where('createdAt', '>=', sevenDaysAgo).get(),
      db.collection('orders').where('createdAt', '>=', thirtyDaysAgo).get()
    ]);

    // Calculate revenue
    let todayRevenue = 0;
    let weekRevenue = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;

    const calculateRevenue = (ordersSnapshot) => {
      let revenue = 0;
      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
          revenue += order.pricing?.total || 0;
        }
      });
      return revenue;
    };

    todayRevenue = calculateRevenue(todayOrders);
    weekRevenue = calculateRevenue(weekOrders);
    monthRevenue = calculateRevenue(monthOrders);
    totalRevenue = calculateRevenue(totalOrders);

    // Get order status distribution
    const orderStatuses = {};
    totalOrders.forEach(doc => {
      const order = doc.data();
      orderStatuses[order.status] = (orderStatuses[order.status] || 0) + 1;
    });

    // Get top selling products
    const productsQuery = await db.collection('products')
      .where('isActive', '==', true)
      .orderBy('totalSales', 'desc')
      .limit(5)
      .get();

    const topProducts = [];
    productsQuery.forEach(doc => {
      const product = doc.data();
      topProducts.push({
        id: doc.id,
        name: product.name,
        sales: product.totalSales || 0,
        revenue: (product.totalSales || 0) * product.price,
        image: product.images?.[0] || null,
        sku: product.sku
      });
    });

    // Get low stock products
    const lowStockQuery = await db.collection('products')
      .where('isActive', '==', true)
      .where('inventory', '<=', 10)
      .orderBy('inventory', 'asc')
      .limit(10)
      .get();

    const lowStockProducts = [];
    lowStockQuery.forEach(doc => {
      const product = doc.data();
      lowStockProducts.push({
        id: doc.id,
        name: product.name,
        inventory: product.inventory,
        sku: product.sku,
        price: product.price
      });
    });

    // Get recent user registrations
    const recentUsersQuery = await db.collection('users')
      .where('createdAt', '>=', sevenDaysAgo)
      .orderBy('createdAt', 'desc')
      .get();

    // Get pending orders count
    const pendingOrdersQuery = await db.collection('orders')
      .where('status', '==', 'pending')
      .get();

    // Get orders requiring attention (processing, shipped)
    const ordersRequiringAttention = await db.collection('orders')
      .where('status', 'in', ['processing', 'shipped'])
      .get();

    // Calculate average order value
    const avgOrderValue = totalOrders.size > 0 ? totalRevenue / totalOrders.size : 0;

    // Get conversion rate (simplified - orders vs total users)
    const conversionRate = totalUsers.size > 0 ? (totalOrders.size / totalUsers.size) * 100 : 0;

    res.status(200).json({
      success: true,
      stats: {
        overview: {
          totalProducts: totalProducts.size,
          activeProducts: activeProducts.size,
          totalOrders: totalOrders.size,
          totalUsers: totalUsers.size,
          activeUsers: activeUsers.size,
          totalCategories: categoriesResult.success ? categoriesResult.categories.length : 0,
          activeCoupons: couponsResult.success ? couponsResult.coupons.length : 0,
          pendingOrders: pendingOrdersQuery.size,
          ordersRequiringAttention: ordersRequiringAttention.size
        },
        revenue: {
          today: Math.round(todayRevenue * 100) / 100,
          week: Math.round(weekRevenue * 100) / 100,
          month: Math.round(monthRevenue * 100) / 100,
          total: Math.round(totalRevenue * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100
        },
        orders: {
          today: todayOrders.size,
          week: weekOrders.size,
          month: monthOrders.size,
          total: totalOrders.size,
          pending: pendingOrdersQuery.size,
          statusDistribution: orderStatuses
        },
        users: {
          newThisWeek: recentUsersQuery.size,
          total: totalUsers.size,
          active: activeUsers.size,
          conversionRate: Math.round(conversionRate * 100) / 100
        },
        performance: {
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          conversionRate: Math.round(conversionRate * 100) / 100,
          repeatCustomerRate: 0 // Would need more complex calculation
        }
      },
      recentOrders,
      topProducts,
      lowStockProducts,
      recentActivity: {
        newUsers: recentUsersQuery.size,
        newOrders: weekOrders.size,
        pendingOrders: pendingOrdersQuery.size
      },
      alerts: {
        lowStock: lowStockProducts.length,
        pendingOrders: pendingOrdersQuery.size,
        expiredCoupons: 0 // Would need to check coupon expiry dates
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
};

// Get sales analytics
const getSalesAnalytics = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const { period = 'month', startDate, endDate } = req.query;

    let start, end;
    const now = new Date();

    switch (period) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case 'year':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        end = now;
        break;
      case 'custom':
        if (startDate && endDate) {
          start = new Date(startDate);
          end = new Date(endDate);
        } else {
          return res.status(400).json({
            error: 'Start date and end date required for custom period'
          });
        }
        break;
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = now;
    }

    // Use order manager for analytics
    const analyticsResult = await orderManager.getOrderAnalytics(start, end);

    if (!analyticsResult.success) {
      return res.status(500).json({
        error: 'Failed to fetch analytics data'
      });
    }

    // Get orders in the specified period for detailed analysis
    const ordersQuery = await db.collection('orders')
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .orderBy('createdAt', 'asc')
      .get();

    const dailyRevenue = {};
    const categoryRevenue = {};
    const paymentMethodStats = {};

    ordersQuery.forEach(doc => {
      const order = doc.data();
      const orderDate = order.createdAt.toDate();
      const dateKey = orderDate.toISOString().split('T')[0];

      if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
        const revenue = order.pricing?.total || 0;

        // Daily revenue
        if (!dailyRevenue[dateKey]) {
          dailyRevenue[dateKey] = { revenue: 0, orders: 0 };
        }
        dailyRevenue[dateKey].revenue += revenue;
        dailyRevenue[dateKey].orders += 1;

        // Payment method stats
        const paymentMethod = order.payment?.method || 'unknown';
        if (!paymentMethodStats[paymentMethod]) {
          paymentMethodStats[paymentMethod] = { count: 0, revenue: 0 };
        }
        paymentMethodStats[paymentMethod].count += 1;
        paymentMethodStats[paymentMethod].revenue += revenue;

        // Category revenue (simplified - would need product category lookup)
        order.items?.forEach(item => {
          const itemRevenue = item.total || item.subtotal || 0;
          categoryRevenue['General'] = (categoryRevenue['General'] || 0) + itemRevenue;
        });
      }
    });

    // Convert daily revenue to array format
    const dailySales = Object.entries(dailyRevenue)
      .map(([date, data]) => ({
        date,
        revenue: Math.round(data.revenue * 100) / 100,
        orders: data.orders
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Convert category revenue to array format
    const totalCategoryRevenue = Object.values(categoryRevenue).reduce((sum, rev) => sum + rev, 0);
    const categorySales = Object.entries(categoryRevenue).map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      percentage: Math.round((revenue / totalCategoryRevenue) * 100 * 100) / 100
    }));

    // Convert payment method stats to array format
    const paymentMethods = Object.entries(paymentMethodStats).map(([method, data]) => ({
      method,
      count: data.count,
      revenue: Math.round(data.revenue * 100) / 100,
      percentage: Math.round((data.count / analyticsResult.analytics.totalOrders) * 100 * 100) / 100
    }));

    res.status(200).json({
      success: true,
      analytics: {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          type: period
        },
        summary: {
          totalRevenue: Math.round(analyticsResult.analytics.totalRevenue * 100) / 100,
          totalOrders: analyticsResult.analytics.totalOrders,
          averageOrderValue: Math.round(analyticsResult.analytics.averageOrderValue * 100) / 100
        },
        dailySales,
        categorySales,
        paymentMethods,
        topProducts: analyticsResult.analytics.topProducts.slice(0, 10),
        statusCounts: analyticsResult.analytics.statusCounts
      }
    });

  } catch (error) {
    console.error('Get sales analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch sales analytics',
      message: error.message
    });
  }
};

// Get real-time dashboard updates
const getRealtimeUpdates = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent activities
    const [
      recentOrders,
      recentUsers,
      recentPayments
    ] = await Promise.all([
      db.collection('orders')
        .where('createdAt', '>=', oneHourAgo)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get(),
      db.collection('users')
        .where('createdAt', '>=', oneHourAgo)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get(),
      db.collection('payment_logs')
        .where('timestamp', '>=', oneHourAgo)
        .where('status', '==', 'success')
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get()
    ]);

    const activities = [];

    // Add recent orders
    recentOrders.forEach(doc => {
      const order = doc.data();
      activities.push({
        type: 'order',
        id: doc.id,
        message: `New order #${order.id || doc.id} - ₹${order.pricing?.total || 0}`,
        timestamp: order.createdAt?.toDate()?.toISOString(),
        status: order.status
      });
    });

    // Add recent users
    recentUsers.forEach(doc => {
      const user = doc.data();
      activities.push({
        type: 'user',
        id: doc.id,
        message: `New user registered: ${user.firstName} ${user.lastName}`,
        timestamp: user.createdAt?.toDate()?.toISOString()
      });
    });

    // Add recent payments
    recentPayments.forEach(doc => {
      const payment = doc.data();
      activities.push({
        type: 'payment',
        id: doc.id,
        message: `Payment received: ₹${payment.amount} for order #${payment.orderId}`,
        timestamp: payment.timestamp?.toDate()?.toISOString()
      });
    });

    // Sort activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({
      success: true,
      updates: {
        recentActivities: activities.slice(0, 10),
        counts: {
          newOrders: recentOrders.size,
          newUsers: recentUsers.size,
          newPayments: recentPayments.size
        },
        timestamp: now.toISOString()
      }
    });

  } catch (error) {
    console.error('Get realtime updates error:', error);
    res.status(500).json({
      error: 'Failed to fetch realtime updates',
      message: error.message
    });
  }
};

module.exports = {
  getDashboardStats,
  getSalesAnalytics,
  getRealtimeUpdates
};
