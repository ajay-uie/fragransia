const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create banner
const createBanner = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const {
      title,
      subtitle,
      description,
      image,
      mobileImage,
      type = 'promotional', // promotional, hero, announcement, carousel
      position = 'homepage_hero', // homepage_hero, category_top, product_sidebar, checkout_top
      size = 'large', // small, medium, large, full_width
      link,
      buttonText,
      design,
      schedule,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!title || !image) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'image']
      });
    }

    const bannerId = generateID.generateBannerId();

    const bannerData = {
      id: bannerId,
      title,
      subtitle: subtitle || '',
      description: description || '',
      image,
      mobileImage: mobileImage || image,
      type,
      position,
      size,
      link: link || null,
      buttonText: buttonText || null,
      design: {
        backgroundColor: design?.backgroundColor || 'transparent',
        textColor: design?.textColor || '#ffffff',
        buttonColor: design?.buttonColor || '#007bff',
        buttonTextColor: design?.buttonTextColor || '#ffffff',
        overlay: design?.overlay || false,
        overlayColor: design?.overlayColor || 'rgba(0,0,0,0.3)',
        textAlign: design?.textAlign || 'center', // left, center, right
        animation: design?.animation || 'fadeIn', // fadeIn, slideIn, zoomIn, none
        customCSS: design?.customCSS || ''
      },
      schedule: {
        startDate: schedule?.startDate ? new Date(schedule.startDate) : null,
        endDate: schedule?.endDate ? new Date(schedule.endDate) : null,
        timezone: schedule?.timezone || 'UTC'
      },
      targeting: {
        devices: ['desktop', 'mobile', 'tablet'],
        pages: position === 'specific' ? (req.body.targetPages || []) : [],
        userTypes: ['all'], // all, new, returning, logged_in
        countries: []
      },
      stats: {
        impressions: 0,
        clicks: 0,
        clickThroughRate: 0
      },
      isActive,
      sortOrder: 0,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('banners').doc(bannerId).set(bannerData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'create_banner',
      resourceType: 'banner',
      resourceId: bannerId,
      details: {
        title,
        type,
        position
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      banner: {
        id: bannerId,
        title,
        type,
        position,
        isActive
      }
    });

  } catch (error) {
    console.error('Create banner error:', error);
    res.status(500).json({
      error: 'Failed to create banner',
      message: error.message
    });
  }
};

// Get all banners
const getAllBanners = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const {
      page = 1,
      limit = 20,
      type,
      position,
      isActive,
      sortBy = 'sortOrder',
      sortOrder = 'asc'
    } = req.query;

    let query = db.collection('banners');

    // Apply filters
    if (type) {
      query = query.where('type', '==', type);
    }

    if (position) {
      query = query.where('position', '==', position);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    // Apply sorting
    const validSortFields = ['sortOrder', 'createdAt', 'updatedAt', 'title'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'sortOrder';
    const sortDirection = sortOrder === 'desc' ? 'desc' : 'asc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    const banners = [];

    snapshot.forEach(doc => {
      const bannerData = doc.data();
      banners.push({
        id: doc.id,
        title: bannerData.title,
        type: bannerData.type,
        position: bannerData.position,
        size: bannerData.size,
        image: bannerData.image,
        isActive: bannerData.isActive,
        sortOrder: bannerData.sortOrder,
        stats: bannerData.stats,
        schedule: {
          startDate: bannerData.schedule?.startDate?.toDate()?.toISOString(),
          endDate: bannerData.schedule?.endDate?.toDate()?.toISOString()
        },
        createdAt: bannerData.createdAt?.toDate()?.toISOString(),
        updatedAt: bannerData.updatedAt?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedBanners = banners.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      banners: paginatedBanners,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(banners.length / parseInt(limit)),
        totalBanners: banners.length,
        hasNextPage: endIndex < banners.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all banners error:', error);
    res.status(500).json({
      error: 'Failed to fetch banners',
      message: error.message
    });
  }
};

// Get banner by ID
const getBannerById = async (req, res) => {
  try {
    const { bannerId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const bannerDoc = await db.collection('banners').doc(bannerId).get();

    if (!bannerDoc.exists) {
      return res.status(404).json({
        error: 'Banner not found'
      });
    }

    const banner = bannerDoc.data();

    res.status(200).json({
      success: true,
      banner: {
        id: bannerDoc.id,
        ...banner,
        schedule: {
          ...banner.schedule,
          startDate: banner.schedule?.startDate?.toDate()?.toISOString(),
          endDate: banner.schedule?.endDate?.toDate()?.toISOString()
        },
        createdAt: banner.createdAt?.toDate()?.toISOString(),
        updatedAt: banner.updatedAt?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    console.error('Get banner by ID error:', error);
    res.status(500).json({
      error: 'Failed to fetch banner',
      message: error.message
    });
  }
};

// Update banner
const updateBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    // Check if banner exists
    const bannerDoc = await db.collection('banners').doc(bannerId).get();
    if (!bannerDoc.exists) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    const updateData = { ...req.body };

    // Handle schedule dates
    if (updateData.schedule) {
      if (updateData.schedule.startDate) {
        updateData.schedule.startDate = new Date(updateData.schedule.startDate);
      }
      if (updateData.schedule.endDate) {
        updateData.schedule.endDate = new Date(updateData.schedule.endDate);
      }
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Add update metadata
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedBy = userId;

    // Update banner
    await db.collection('banners').doc(bannerId).update(updateData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_banner',
      resourceType: 'banner',
      resourceId: bannerId,
      details: {
        updatedFields: Object.keys(updateData)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      bannerId
    });

  } catch (error) {
    console.error('Update banner error:', error);
    res.status(500).json({
      error: 'Failed to update banner',
      message: error.message
    });
  }
};

// Delete banner
const deleteBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete banners' });
    }

    // Check if banner exists
    const bannerDoc = await db.collection('banners').doc(bannerId).get();
    if (!bannerDoc.exists) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    const banner = bannerDoc.data();

    // Soft delete - mark as inactive
    await db.collection('banners').doc(bannerId).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_banner',
      resourceType: 'banner',
      resourceId: bannerId,
      details: {
        title: banner.title,
        type: banner.type,
        position: banner.position
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully',
      bannerId
    });

  } catch (error) {
    console.error('Delete banner error:', error);
    res.status(500).json({
      error: 'Failed to delete banner',
      message: error.message
    });
  }
};

// Reorder banners
const reorderBanners = async (req, res) => {
  try {
    const { bannerOrders } = req.body;

    if (!bannerOrders || !Array.isArray(bannerOrders)) {
      return res.status(400).json({
        error: 'Invalid banner orders',
        message: 'Banner orders array is required'
      });
    }

    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const batch = db.batch();

    // Update sort order for each banner
    bannerOrders.forEach(({ bannerId, sortOrder }) => {
      const bannerRef = db.collection('banners').doc(bannerId);
      batch.update(bannerRef, {
        sortOrder: parseInt(sortOrder),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      });
    });

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'reorder_banners',
      resourceType: 'banner',
      details: {
        bannerOrders
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Banners reordered successfully'
    });

  } catch (error) {
    console.error('Reorder banners error:', error);
    res.status(500).json({
      error: 'Failed to reorder banners',
      message: error.message
    });
  }
};

// Get banners for display (public endpoint)
const getBannersForDisplay = async (req, res) => {
  try {
    const { position = 'homepage_hero', limit = 10 } = req.query;
    const db = admin.firestore();

    const now = new Date();

    // Get active banners for the specified position
    let query = db.collection('banners')
      .where('isActive', '==', true)
      .where('position', '==', position)
      .orderBy('sortOrder', 'asc')
      .limit(parseInt(limit));

    const snapshot = await query.get();
    const banners = [];

    snapshot.forEach(doc => {
      const banner = doc.data();
      
      // Check if banner is within schedule
      let isScheduleValid = true;
      
      if (banner.schedule?.startDate && now < banner.schedule.startDate.toDate()) {
        isScheduleValid = false;
      }
      
      if (banner.schedule?.endDate && now > banner.schedule.endDate.toDate()) {
        isScheduleValid = false;
      }

      if (isScheduleValid) {
        banners.push({
          id: doc.id,
          title: banner.title,
          subtitle: banner.subtitle,
          description: banner.description,
          image: banner.image,
          mobileImage: banner.mobileImage,
          link: banner.link,
          buttonText: banner.buttonText,
          design: banner.design,
          size: banner.size
        });

        // Track impression
        db.collection('banners').doc(doc.id).update({
          'stats.impressions': admin.firestore.FieldValue.increment(1)
        }).catch(err => console.error('Failed to update banner impressions:', err));
      }
    });

    res.status(200).json({
      success: true,
      banners
    });

  } catch (error) {
    console.error('Get banners for display error:', error);
    res.status(500).json({
      error: 'Failed to fetch banners',
      message: error.message
    });
  }
};

// Track banner click
const trackBannerClick = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const db = admin.firestore();

    // Check if banner exists
    const bannerDoc = await db.collection('banners').doc(bannerId).get();
    if (!bannerDoc.exists) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    // Update click count
    await db.collection('banners').doc(bannerId).update({
      'stats.clicks': admin.firestore.FieldValue.increment(1)
    });

    // Recalculate click-through rate
    const updatedBanner = await db.collection('banners').doc(bannerId).get();
    const stats = updatedBanner.data().stats;
    
    const clickThroughRate = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;

    await db.collection('banners').doc(bannerId).update({
      'stats.clickThroughRate': Math.round(clickThroughRate * 100) / 100
    });

    res.status(200).json({
      success: true,
      message: 'Click tracked successfully'
    });

  } catch (error) {
    console.error('Track banner click error:', error);
    res.status(500).json({
      error: 'Failed to track click',
      message: error.message
    });
  }
};

module.exports = {
  createBanner,
  getAllBanners,
  getBannerById,
  updateBanner,
  deleteBanner,
  reorderBanners,
  getBannersForDisplay,
  trackBannerClick
};
