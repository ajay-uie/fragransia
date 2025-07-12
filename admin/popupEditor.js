const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create popup
const createPopup = async (req, res) => {
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
      content,
      type = 'promotional', // promotional, announcement, newsletter, exit_intent
      position = 'center', // center, top, bottom, corner
      size = 'medium', // small, medium, large, fullscreen
      design,
      triggers,
      targeting,
      schedule,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'content']
      });
    }

    const popupId = generateID.generatePopupId();

    const popupData = {
      id: popupId,
      title,
      content,
      type,
      position,
      size,
      design: {
        backgroundColor: design?.backgroundColor || '#ffffff',
        textColor: design?.textColor || '#333333',
        buttonColor: design?.buttonColor || '#007bff',
        buttonTextColor: design?.buttonTextColor || '#ffffff',
        borderRadius: design?.borderRadius || 8,
        overlay: design?.overlay !== false,
        overlayColor: design?.overlayColor || 'rgba(0,0,0,0.5)',
        animation: design?.animation || 'fadeIn',
        customCSS: design?.customCSS || ''
      },
      triggers: {
        showOn: triggers?.showOn || 'page_load', // page_load, scroll, time_delay, exit_intent, click
        delay: triggers?.delay || 0, // seconds
        scrollPercentage: triggers?.scrollPercentage || 50,
        pages: triggers?.pages || [], // specific pages to show on
        frequency: triggers?.frequency || 'once_per_session' // once_per_session, once_per_day, always
      },
      targeting: {
        devices: targeting?.devices || ['desktop', 'mobile', 'tablet'],
        countries: targeting?.countries || [],
        newVisitors: targeting?.newVisitors,
        returningVisitors: targeting?.returningVisitors,
        minPageViews: targeting?.minPageViews || 0
      },
      schedule: {
        startDate: schedule?.startDate ? new Date(schedule.startDate) : null,
        endDate: schedule?.endDate ? new Date(schedule.endDate) : null,
        timezone: schedule?.timezone || 'UTC'
      },
      isActive,
      stats: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        clickThroughRate: 0,
        conversionRate: 0
      },
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('popups').doc(popupId).set(popupData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'create_popup',
      resourceType: 'popup',
      resourceId: popupId,
      details: {
        title,
        type,
        position
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Popup created successfully',
      popup: {
        id: popupId,
        title,
        type,
        isActive
      }
    });

  } catch (error) {
    console.error('Create popup error:', error);
    res.status(500).json({
      error: 'Failed to create popup',
      message: error.message
    });
  }
};

// Get all popups
const getAllPopups = async (req, res) => {
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
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('popups');

    // Apply filters
    if (type) {
      query = query.where('type', '==', type);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'updatedAt', 'title', 'impressions'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    if (sortField === 'impressions') {
      query = query.orderBy('stats.impressions', sortDirection);
    } else {
      query = query.orderBy(sortField, sortDirection);
    }

    const snapshot = await query.get();
    const popups = [];

    snapshot.forEach(doc => {
      const popupData = doc.data();
      popups.push({
        id: doc.id,
        title: popupData.title,
        type: popupData.type,
        position: popupData.position,
        isActive: popupData.isActive,
        stats: popupData.stats,
        schedule: {
          startDate: popupData.schedule?.startDate?.toDate()?.toISOString(),
          endDate: popupData.schedule?.endDate?.toDate()?.toISOString()
        },
        createdAt: popupData.createdAt?.toDate()?.toISOString(),
        updatedAt: popupData.updatedAt?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPopups = popups.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      popups: paginatedPopups,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(popups.length / parseInt(limit)),
        totalPopups: popups.length,
        hasNextPage: endIndex < popups.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all popups error:', error);
    res.status(500).json({
      error: 'Failed to fetch popups',
      message: error.message
    });
  }
};

// Get popup by ID
const getPopupById = async (req, res) => {
  try {
    const { popupId } = req.params;
    
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

    const popupDoc = await db.collection('popups').doc(popupId).get();

    if (!popupDoc.exists) {
      return res.status(404).json({
        error: 'Popup not found'
      });
    }

    const popup = popupDoc.data();

    res.status(200).json({
      success: true,
      popup: {
        id: popupDoc.id,
        ...popup,
        schedule: {
          ...popup.schedule,
          startDate: popup.schedule?.startDate?.toDate()?.toISOString(),
          endDate: popup.schedule?.endDate?.toDate()?.toISOString()
        },
        createdAt: popup.createdAt?.toDate()?.toISOString(),
        updatedAt: popup.updatedAt?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    console.error('Get popup by ID error:', error);
    res.status(500).json({
      error: 'Failed to fetch popup',
      message: error.message
    });
  }
};

// Update popup
const updatePopup = async (req, res) => {
  try {
    const { popupId } = req.params;
    
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

    // Check if popup exists
    const popupDoc = await db.collection('popups').doc(popupId).get();
    if (!popupDoc.exists) {
      return res.status(404).json({ error: 'Popup not found' });
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

    // Update popup
    await db.collection('popups').doc(popupId).update(updateData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_popup',
      resourceType: 'popup',
      resourceId: popupId,
      details: {
        updatedFields: Object.keys(updateData)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Popup updated successfully',
      popupId
    });

  } catch (error) {
    console.error('Update popup error:', error);
    res.status(500).json({
      error: 'Failed to update popup',
      message: error.message
    });
  }
};

// Delete popup
const deletePopup = async (req, res) => {
  try {
    const { popupId } = req.params;
    
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
      return res.status(403).json({ error: 'Only admins can delete popups' });
    }

    // Check if popup exists
    const popupDoc = await db.collection('popups').doc(popupId).get();
    if (!popupDoc.exists) {
      return res.status(404).json({ error: 'Popup not found' });
    }

    const popup = popupDoc.data();

    // Soft delete - mark as inactive
    await db.collection('popups').doc(popupId).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_popup',
      resourceType: 'popup',
      resourceId: popupId,
      details: {
        title: popup.title,
        type: popup.type
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Popup deleted successfully',
      popupId
    });

  } catch (error) {
    console.error('Delete popup error:', error);
    res.status(500).json({
      error: 'Failed to delete popup',
      message: error.message
    });
  }
};

// Track popup interaction
const trackPopupInteraction = async (req, res) => {
  try {
    const { popupId } = req.params;
    const { action, userId = null } = req.body; // action: 'view', 'click', 'close', 'convert'

    const db = admin.firestore();

    // Check if popup exists
    const popupDoc = await db.collection('popups').doc(popupId).get();
    if (!popupDoc.exists) {
      return res.status(404).json({ error: 'Popup not found' });
    }

    // Update popup stats
    const updateStats = {};
    switch (action) {
      case 'view':
        updateStats['stats.impressions'] = admin.firestore.FieldValue.increment(1);
        break;
      case 'click':
        updateStats['stats.clicks'] = admin.firestore.FieldValue.increment(1);
        break;
      case 'convert':
        updateStats['stats.conversions'] = admin.firestore.FieldValue.increment(1);
        break;
    }

    if (Object.keys(updateStats).length > 0) {
      await db.collection('popups').doc(popupId).update(updateStats);

      // Recalculate rates
      const updatedPopup = await db.collection('popups').doc(popupId).get();
      const stats = updatedPopup.data().stats;
      
      const clickThroughRate = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
      const conversionRate = stats.clicks > 0 ? (stats.conversions / stats.clicks) * 100 : 0;

      await db.collection('popups').doc(popupId).update({
        'stats.clickThroughRate': Math.round(clickThroughRate * 100) / 100,
        'stats.conversionRate': Math.round(conversionRate * 100) / 100
      });
    }

    // Log interaction
    await db.collection('popup_interactions').add({
      popupId,
      userId,
      action,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Interaction tracked successfully'
    });

  } catch (error) {
    console.error('Track popup interaction error:', error);
    res.status(500).json({
      error: 'Failed to track interaction',
      message: error.message
    });
  }
};

module.exports = {
  createPopup,
  getAllPopups,
  getPopupById,
  updatePopup,
  deletePopup,
  trackPopupInteraction
};
