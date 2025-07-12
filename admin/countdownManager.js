const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create countdown timer
const createCountdown = async (req, res) => {
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
      description,
      endDate,
      type = 'sale', // sale, event, launch, limited_offer
      displayLocation = 'homepage', // homepage, product_page, cart, checkout, all_pages
      design,
      behavior,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!title || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'endDate']
      });
    }

    // Validate end date
    const endDateTime = new Date(endDate);
    if (endDateTime <= new Date()) {
      return res.status(400).json({
        error: 'Invalid end date',
        message: 'End date must be in the future'
      });
    }

    const countdownId = generateID.generateCountdownId();

    const countdownData = {
      id: countdownId,
      title,
      description: description || '',
      endDate: endDateTime,
      type,
      displayLocation,
      design: {
        theme: design?.theme || 'default', // default, dark, colorful, minimal
        size: design?.size || 'medium', // small, medium, large
        position: design?.position || 'top', // top, bottom, floating, inline
        backgroundColor: design?.backgroundColor || '#ff6b6b',
        textColor: design?.textColor || '#ffffff',
        accentColor: design?.accentColor || '#4ecdc4',
        showDays: design?.showDays !== false,
        showHours: design?.showHours !== false,
        showMinutes: design?.showMinutes !== false,
        showSeconds: design?.showSeconds !== false,
        customCSS: design?.customCSS || ''
      },
      behavior: {
        hideAfterExpiry: behavior?.hideAfterExpiry !== false,
        redirectAfterExpiry: behavior?.redirectAfterExpiry || null,
        showExpiredMessage: behavior?.showExpiredMessage !== false,
        expiredMessage: behavior?.expiredMessage || 'This offer has expired',
        urgencyThreshold: behavior?.urgencyThreshold || 24, // hours to show urgency styling
        blinkEffect: behavior?.blinkEffect === true
      },
      targeting: {
        pages: displayLocation === 'specific' ? (req.body.targetPages || []) : [],
        devices: ['desktop', 'mobile', 'tablet'],
        userTypes: ['all'] // all, new, returning, logged_in
      },
      stats: {
        impressions: 0,
        clicks: 0,
        conversions: 0
      },
      isActive,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('countdowns').doc(countdownId).set(countdownData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'create_countdown',
      resourceType: 'countdown',
      resourceId: countdownId,
      details: {
        title,
        type,
        endDate: endDateTime.toISOString()
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Countdown timer created successfully',
      countdown: {
        id: countdownId,
        title,
        type,
        endDate: endDateTime.toISOString(),
        isActive
      }
    });

  } catch (error) {
    console.error('Create countdown error:', error);
    res.status(500).json({
      error: 'Failed to create countdown timer',
      message: error.message
    });
  }
};

// Get all countdown timers
const getAllCountdowns = async (req, res) => {
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
      status, // active, expired, upcoming
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('countdowns');

    // Apply filters
    if (type) {
      query = query.where('type', '==', type);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'updatedAt', 'endDate', 'title'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    let countdowns = [];

    const now = new Date();

    snapshot.forEach(doc => {
      const countdownData = doc.data();
      const endDate = countdownData.endDate.toDate();
      
      // Determine status
      let countdownStatus = 'active';
      if (endDate < now) {
        countdownStatus = 'expired';
      } else if (endDate > now && !countdownData.isActive) {
        countdownStatus = 'upcoming';
      }

      // Apply status filter
      if (status && status !== countdownStatus) {
        return;
      }

      countdowns.push({
        id: doc.id,
        title: countdownData.title,
        type: countdownData.type,
        displayLocation: countdownData.displayLocation,
        endDate: endDate.toISOString(),
        status: countdownStatus,
        isActive: countdownData.isActive,
        stats: countdownData.stats,
        createdAt: countdownData.createdAt?.toDate()?.toISOString(),
        updatedAt: countdownData.updatedAt?.toDate()?.toISOString()
      });
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedCountdowns = countdowns.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      countdowns: paginatedCountdowns,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(countdowns.length / parseInt(limit)),
        totalCountdowns: countdowns.length,
        hasNextPage: endIndex < countdowns.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all countdowns error:', error);
    res.status(500).json({
      error: 'Failed to fetch countdown timers',
      message: error.message
    });
  }
};

// Get countdown by ID
const getCountdownById = async (req, res) => {
  try {
    const { countdownId } = req.params;
    
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

    const countdownDoc = await db.collection('countdowns').doc(countdownId).get();

    if (!countdownDoc.exists) {
      return res.status(404).json({
        error: 'Countdown timer not found'
      });
    }

    const countdown = countdownDoc.data();

    res.status(200).json({
      success: true,
      countdown: {
        id: countdownDoc.id,
        ...countdown,
        endDate: countdown.endDate?.toDate()?.toISOString(),
        createdAt: countdown.createdAt?.toDate()?.toISOString(),
        updatedAt: countdown.updatedAt?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    console.error('Get countdown by ID error:', error);
    res.status(500).json({
      error: 'Failed to fetch countdown timer',
      message: error.message
    });
  }
};

// Update countdown timer
const updateCountdown = async (req, res) => {
  try {
    const { countdownId } = req.params;
    
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

    // Check if countdown exists
    const countdownDoc = await db.collection('countdowns').doc(countdownId).get();
    if (!countdownDoc.exists) {
      return res.status(404).json({ error: 'Countdown timer not found' });
    }

    const updateData = { ...req.body };

    // Handle end date
    if (updateData.endDate) {
      const endDateTime = new Date(updateData.endDate);
      if (endDateTime <= new Date()) {
        return res.status(400).json({
          error: 'Invalid end date',
          message: 'End date must be in the future'
        });
      }
      updateData.endDate = endDateTime;
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

    // Update countdown
    await db.collection('countdowns').doc(countdownId).update(updateData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_countdown',
      resourceType: 'countdown',
      resourceId: countdownId,
      details: {
        updatedFields: Object.keys(updateData)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Countdown timer updated successfully',
      countdownId
    });

  } catch (error) {
    console.error('Update countdown error:', error);
    res.status(500).json({
      error: 'Failed to update countdown timer',
      message: error.message
    });
  }
};

// Delete countdown timer
const deleteCountdown = async (req, res) => {
  try {
    const { countdownId } = req.params;
    
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
      return res.status(403).json({ error: 'Only admins can delete countdown timers' });
    }

    // Check if countdown exists
    const countdownDoc = await db.collection('countdowns').doc(countdownId).get();
    if (!countdownDoc.exists) {
      return res.status(404).json({ error: 'Countdown timer not found' });
    }

    const countdown = countdownDoc.data();

    // Soft delete - mark as inactive
    await db.collection('countdowns').doc(countdownId).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_countdown',
      resourceType: 'countdown',
      resourceId: countdownId,
      details: {
        title: countdown.title,
        type: countdown.type
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Countdown timer deleted successfully',
      countdownId
    });

  } catch (error) {
    console.error('Delete countdown error:', error);
    res.status(500).json({
      error: 'Failed to delete countdown timer',
      message: error.message
    });
  }
};

// Get active countdown for display
const getActiveCountdown = async (req, res) => {
  try {
    const { location = 'homepage' } = req.query;
    const db = admin.firestore();

    const now = new Date();

    // Get active countdowns for the specified location
    let query = db.collection('countdowns')
      .where('isActive', '==', true)
      .where('endDate', '>', now);

    if (location !== 'all_pages') {
      query = query.where('displayLocation', 'in', [location, 'all_pages']);
    }

    const snapshot = await query.orderBy('endDate', 'asc').limit(1).get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        countdown: null,
        message: 'No active countdown timer found'
      });
    }

    const countdownDoc = snapshot.docs[0];
    const countdown = countdownDoc.data();

    // Track impression
    await db.collection('countdowns').doc(countdownDoc.id).update({
      'stats.impressions': admin.firestore.FieldValue.increment(1)
    });

    res.status(200).json({
      success: true,
      countdown: {
        id: countdownDoc.id,
        title: countdown.title,
        description: countdown.description,
        endDate: countdown.endDate.toDate().toISOString(),
        type: countdown.type,
        design: countdown.design,
        behavior: countdown.behavior
      }
    });

  } catch (error) {
    console.error('Get active countdown error:', error);
    res.status(500).json({
      error: 'Failed to fetch active countdown timer',
      message: error.message
    });
  }
};

// Track countdown interaction
const trackCountdownInteraction = async (req, res) => {
  try {
    const { countdownId } = req.params;
    const { action } = req.body; // click, conversion

    const db = admin.firestore();

    // Check if countdown exists
    const countdownDoc = await db.collection('countdowns').doc(countdownId).get();
    if (!countdownDoc.exists) {
      return res.status(404).json({ error: 'Countdown timer not found' });
    }

    // Update stats
    const updateStats = {};
    if (action === 'click') {
      updateStats['stats.clicks'] = admin.firestore.FieldValue.increment(1);
    } else if (action === 'conversion') {
      updateStats['stats.conversions'] = admin.firestore.FieldValue.increment(1);
    }

    if (Object.keys(updateStats).length > 0) {
      await db.collection('countdowns').doc(countdownId).update(updateStats);
    }

    res.status(200).json({
      success: true,
      message: 'Interaction tracked successfully'
    });

  } catch (error) {
    console.error('Track countdown interaction error:', error);
    res.status(500).json({
      error: 'Failed to track interaction',
      message: error.message
    });
  }
};

module.exports = {
  createCountdown,
  getAllCountdowns,
  getCountdownById,
  updateCountdown,
  deleteCountdown,
  getActiveCountdown,
  trackCountdownInteraction
};
