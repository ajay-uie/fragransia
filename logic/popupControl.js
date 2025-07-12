const admin = require('firebase-admin');

const popupControl = {
  
  // Get active popups for display
  async getActivePopups(criteria = {}) {
    try {
      const {
        pages = [],
        device = 'desktop',
        userType = 'all',
        country = 'IN',
        userId = null
      } = criteria;

      const db = admin.firestore();
      const now = new Date();

      // Base query for active popups
      let query = db.collection('popups').where('isActive', '==', true);

      const snapshot = await query.get();
      const eligiblePopups = [];

      for (const doc of snapshot.docs) {
        const popup = doc.data();
        
        // Check schedule
        if (popup.schedule?.startDate && now < popup.schedule.startDate.toDate()) {
          continue;
        }
        
        if (popup.schedule?.endDate && now > popup.schedule.endDate.toDate()) {
          continue;
        }

        // Check device targeting
        if (!popup.targeting?.devices?.includes(device)) {
          continue;
        }

        // Check page targeting
        if (popup.triggers?.pages && popup.triggers.pages.length > 0) {
          const pageMatch = popup.triggers.pages.some(page => 
            pages.includes(page) || page === 'all_pages'
          );
          if (!pageMatch) {
            continue;
          }
        }

        // Check user type targeting
        if (popup.targeting?.newVisitors !== undefined || popup.targeting?.returningVisitors !== undefined) {
          const isReturningUser = await this.isReturningUser(userId);
          
          if (popup.targeting.newVisitors === true && isReturningUser) {
            continue;
          }
          
          if (popup.targeting.returningVisitors === true && !isReturningUser) {
            continue;
          }
        }

        // Check frequency rules
        if (userId) {
          const shouldShow = await this.checkFrequencyRules(popup, userId);
          if (!shouldShow) {
            continue;
          }
        }

        eligiblePopups.push({
          id: doc.id,
          ...popup,
          schedule: {
            ...popup.schedule,
            startDate: popup.schedule?.startDate?.toDate()?.toISOString(),
            endDate: popup.schedule?.endDate?.toDate()?.toISOString()
          }
        });
      }

      // Sort by priority (could be added to popup data)
      eligiblePopups.sort((a, b) => {
        // Prioritize by type: exit_intent > promotional > newsletter > announcement
        const typePriority = {
          exit_intent: 4,
          promotional: 3,
          newsletter: 2,
          announcement: 1
        };
        
        return (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
      });

      return {
        success: true,
        popups: eligiblePopups
      };

    } catch (error) {
      console.error('Get active popups error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Check if user is returning visitor
  async isReturningUser(userId) {
    if (!userId) return false;

    try {
      const db = admin.firestore();
      
      // Check user's login history
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) return false;

      const userData = userDoc.data();
      const createdAt = userData.createdAt?.toDate();
      const lastLoginAt = userData.lastLoginAt?.toDate();

      if (!createdAt || !lastLoginAt) return false;

      // Consider returning if last login is different from creation (with some buffer)
      const timeDiff = Math.abs(lastLoginAt - createdAt);
      return timeDiff > 5 * 60 * 1000; // 5 minutes buffer

    } catch (error) {
      console.error('Check returning user error:', error);
      return false;
    }
  },

  // Check frequency rules for popup display
  async checkFrequencyRules(popup, userId) {
    try {
      const db = admin.firestore();
      const now = new Date();
      const frequency = popup.triggers?.frequency || 'once_per_session';

      // Get user's popup interaction history
      const interactionsQuery = await db.collection('popup_interactions')
        .where('popupId', '==', popup.id)
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      if (interactionsQuery.empty) {
        return true; // First time showing
      }

      const lastInteraction = interactionsQuery.docs[0].data();
      const lastShown = lastInteraction.timestamp.toDate();

      switch (frequency) {
        case 'once_per_session':
          // Check if shown in current session (last 30 minutes)
          const sessionDuration = 30 * 60 * 1000; // 30 minutes
          return (now - lastShown) > sessionDuration;

        case 'once_per_day':
          // Check if shown today
          const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
          return lastShown < oneDayAgo;

        case 'once_per_week':
          // Check if shown this week
          const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
          return lastShown < oneWeekAgo;

        case 'always':
          // Always show (with minimum 5 minute gap)
          const minGap = 5 * 60 * 1000; // 5 minutes
          return (now - lastShown) > minGap;

        default:
          return true;
      }

    } catch (error) {
      console.error('Check frequency rules error:', error);
      return true; // Default to show on error
    }
  },

  // Record popup view
  async recordPopupView(popupId, userId = null, metadata = {}) {
    try {
      const db = admin.firestore();

      // Update popup stats
      await db.collection('popups').doc(popupId).update({
        'stats.impressions': admin.firestore.FieldValue.increment(1)
      });

      // Record interaction
      await db.collection('popup_interactions').add({
        popupId,
        userId,
        action: 'view',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        page: metadata.page,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Popup view recorded'
      };

    } catch (error) {
      console.error('Record popup view error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Record popup click
  async recordPopupClick(popupId, userId = null, metadata = {}) {
    try {
      const db = admin.firestore();

      // Update popup stats
      await db.collection('popups').doc(popupId).update({
        'stats.clicks': admin.firestore.FieldValue.increment(1)
      });

      // Record interaction
      await db.collection('popup_interactions').add({
        popupId,
        userId,
        action: 'click',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        clickTarget: metadata.clickTarget,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Recalculate click-through rate
      const popupDoc = await db.collection('popups').doc(popupId).get();
      if (popupDoc.exists) {
        const stats = popupDoc.data().stats;
        const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
        
        await db.collection('popups').doc(popupId).update({
          'stats.clickThroughRate': Math.round(ctr * 100) / 100
        });
      }

      return {
        success: true,
        message: 'Popup click recorded'
      };

    } catch (error) {
      console.error('Record popup click error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Record popup close
  async recordPopupClose(popupId, userId = null, metadata = {}) {
    try {
      const db = admin.firestore();

      // Record interaction
      await db.collection('popup_interactions').add({
        popupId,
        userId,
        action: 'close',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        closeReason: metadata.closeReason || 'user_action',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Popup close recorded'
      };

    } catch (error) {
      console.error('Record popup close error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Record popup conversion
  async recordPopupConversion(popupId, userId = null, metadata = {}) {
    try {
      const db = admin.firestore();

      // Update popup stats
      await db.collection('popups').doc(popupId).update({
        'stats.conversions': admin.firestore.FieldValue.increment(1)
      });

      // Record interaction
      await db.collection('popup_interactions').add({
        popupId,
        userId,
        action: 'conversion',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        conversionType: metadata.conversionType || 'unknown',
        conversionValue: metadata.conversionValue || 0,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Recalculate conversion rate
      const popupDoc = await db.collection('popups').doc(popupId).get();
      if (popupDoc.exists) {
        const stats = popupDoc.data().stats;
        const conversionRate = stats.clicks > 0 ? (stats.conversions / stats.clicks) * 100 : 0;
        
        await db.collection('popups').doc(popupId).update({
          'stats.conversionRate': Math.round(conversionRate * 100) / 100
        });
      }

      return {
        success: true,
        message: 'Popup conversion recorded'
      };

    } catch (error) {
      console.error('Record popup conversion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Get popup analytics
  async getPopupAnalytics(popupId, dateRange = {}) {
    try {
      const db = admin.firestore();

      // Get popup details
      const popupDoc = await db.collection('popups').doc(popupId).get();
      if (!popupDoc.exists) {
        return {
          success: false,
          error: 'Popup not found'
        };
      }

      const popup = popupDoc.data();

      // Build date range query
      let interactionsQuery = db.collection('popup_interactions')
        .where('popupId', '==', popupId);

      if (dateRange.startDate) {
        interactionsQuery = interactionsQuery.where('timestamp', '>=', new Date(dateRange.startDate));
      }

      if (dateRange.endDate) {
        interactionsQuery = interactionsQuery.where('timestamp', '<=', new Date(dateRange.endDate));
      }

      const interactionsSnapshot = await interactionsQuery.get();

      // Analyze interactions
      const analytics = {
        totalInteractions: interactionsSnapshot.size,
        views: 0,
        clicks: 0,
        conversions: 0,
        closes: 0,
        uniqueUsers: new Set(),
        deviceBreakdown: {},
        timelineData: {}
      };

      interactionsSnapshot.forEach(doc => {
        const interaction = doc.data();
        
        analytics[interaction.action]++;
        
        if (interaction.userId) {
          analytics.uniqueUsers.add(interaction.userId);
        }

        // Device breakdown
        const device = this.getDeviceFromUserAgent(interaction.userAgent);
        analytics.deviceBreakdown[device] = (analytics.deviceBreakdown[device] || 0) + 1;

        // Timeline data (daily breakdown)
        const date = interaction.timestamp.toDate().toDateString();
        if (!analytics.timelineData[date]) {
          analytics.timelineData[date] = { views: 0, clicks: 0, conversions: 0 };
        }
        analytics.timelineData[date][interaction.action]++;
      });

      analytics.uniqueUsers = analytics.uniqueUsers.size;

      // Calculate rates
      analytics.clickThroughRate = analytics.views > 0 ? (analytics.clicks / analytics.views) * 100 : 0;
      analytics.conversionRate = analytics.clicks > 0 ? (analytics.conversions / analytics.clicks) * 100 : 0;

      return {
        success: true,
        popup: {
          id: popupId,
          title: popup.title,
          type: popup.type
        },
        analytics
      };

    } catch (error) {
      console.error('Get popup analytics error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Helper method to extract device from user agent
  getDeviceFromUserAgent(userAgent) {
    if (!userAgent) return 'unknown';
    
    if (/Mobile|Android|iPhone/i.test(userAgent)) {
      return 'mobile';
    } else if (/Tablet|iPad/i.test(userAgent)) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  },

  // A/B test popup variants
  async getPopupVariant(popupId, userId) {
    try {
      const db = admin.firestore();

      // Check if popup has variants
      const variantsQuery = await db.collection('popup_variants')
        .where('parentPopupId', '==', popupId)
        .where('isActive', '==', true)
        .get();

      if (variantsQuery.empty) {
        return {
          success: true,
          variant: null // Use original popup
        };
      }

      // Get user's assigned variant (for consistency)
      const userVariantDoc = await db.collection('popup_user_variants')
        .doc(`${popupId}_${userId}`)
        .get();

      if (userVariantDoc.exists) {
        return {
          success: true,
          variant: userVariantDoc.data().variantId
        };
      }

      // Assign new variant based on traffic split
      const variants = [];
      variantsQuery.forEach(doc => {
        variants.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Simple random assignment (could be improved with traffic percentages)
      const randomIndex = Math.floor(Math.random() * variants.length);
      const assignedVariant = variants[randomIndex];

      // Save user's variant assignment
      await db.collection('popup_user_variants').doc(`${popupId}_${userId}`).set({
        popupId,
        userId,
        variantId: assignedVariant.id,
        assignedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        variant: assignedVariant.id
      };

    } catch (error) {
      console.error('Get popup variant error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = popupControl;
