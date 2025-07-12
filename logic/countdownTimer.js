const admin = require('firebase-admin');

const countdownTimer = {
  
  // Get active countdown timers
  async getActiveCountdowns(location = 'homepage') {
    try {
      const db = admin.firestore();
      const now = new Date();

      // Query active countdowns for the specified location
      let query = db.collection('countdowns')
        .where('isActive', '==', true)
        .where('endDate', '>', now);

      if (location !== 'all_pages') {
        query = query.where('displayLocation', 'in', [location, 'all_pages']);
      }

      const snapshot = await query.orderBy('endDate', 'asc').get();
      const activeCountdowns = [];

      snapshot.forEach(doc => {
        const countdown = doc.data();
        
        // Check if countdown is within schedule
        let isScheduleValid = true;
        
        if (countdown.schedule?.startDate && now < countdown.schedule.startDate.toDate()) {
          isScheduleValid = false;
        }
        
        if (countdown.schedule?.endDate && now > countdown.schedule.endDate.toDate()) {
          isScheduleValid = false;
        }

        if (isScheduleValid) {
          activeCountdowns.push({
            id: doc.id,
            ...countdown,
            endDate: countdown.endDate?.toDate()?.toISOString(),
            timeRemaining: this.calculateTimeRemaining(countdown.endDate.toDate())
          });
        }
      });

      return {
        success: true,
        countdowns: activeCountdowns
      };

    } catch (error) {
      console.error('Get active countdowns error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Calculate time remaining
  calculateTimeRemaining(endDate) {
    const now = new Date();
    const timeLeft = endDate - now;

    if (timeLeft <= 0) {
      return {
        expired: true,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0
      };
    }

    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    return {
      expired: false,
      days,
      hours,
      minutes,
      seconds,
      totalSeconds: Math.floor(timeLeft / 1000),
      isUrgent: timeLeft < (24 * 60 * 60 * 1000) // Less than 24 hours
    };
  },

  // Get countdown by ID
  async getCountdownById(countdownId) {
    try {
      const db = admin.firestore();

      const countdownDoc = await db.collection('countdowns').doc(countdownId).get();
      if (!countdownDoc.exists) {
        return {
          success: false,
          error: 'Countdown not found'
        };
      }

      const countdown = countdownDoc.data();
      const endDate = countdown.endDate?.toDate();

      return {
        success: true,
        countdown: {
          id: countdownDoc.id,
          ...countdown,
          endDate: endDate?.toISOString(),
          timeRemaining: this.calculateTimeRemaining(endDate)
        }
      };

    } catch (error) {
      console.error('Get countdown by ID error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Record countdown impression
  async recordCountdownImpression(countdownId, metadata = {}) {
    try {
      const db = admin.firestore();

      // Update countdown stats
      await db.collection('countdowns').doc(countdownId).update({
        'stats.impressions': admin.firestore.FieldValue.increment(1)
      });

      // Record interaction
      await db.collection('countdown_interactions').add({
        countdownId,
        userId: metadata.userId || null,
        action: 'impression',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        page: metadata.page,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Countdown impression recorded'
      };

    } catch (error) {
      console.error('Record countdown impression error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Record countdown click
  async recordCountdownClick(countdownId, metadata = {}) {
    try {
      const db = admin.firestore();

      // Update countdown stats
      await db.collection('countdowns').doc(countdownId).update({
        'stats.clicks': admin.firestore.FieldValue.increment(1)
      });

      // Record interaction
      await db.collection('countdown_interactions').add({
        countdownId,
        userId: metadata.userId || null,
        action: 'click',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        clickTarget: metadata.clickTarget,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Countdown click recorded'
      };

    } catch (error) {
      console.error('Record countdown click error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Record countdown conversion
  async recordCountdownConversion(countdownId, metadata = {}) {
    try {
      const db = admin.firestore();

      // Update countdown stats
      await db.collection('countdowns').doc(countdownId).update({
        'stats.conversions': admin.firestore.FieldValue.increment(1)
      });

      // Record interaction
      await db.collection('countdown_interactions').add({
        countdownId,
        userId: metadata.userId || null,
        action: 'conversion',
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        conversionType: metadata.conversionType || 'purchase',
        conversionValue: metadata.conversionValue || 0,
        orderId: metadata.orderId || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Countdown conversion recorded'
      };

    } catch (error) {
      console.error('Record countdown conversion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Handle countdown expiry
  async handleCountdownExpiry(countdownId) {
    try {
      const db = admin.firestore();

      const countdownDoc = await db.collection('countdowns').doc(countdownId).get();
      if (!countdownDoc.exists) {
        return {
          success: false,
          error: 'Countdown not found'
        };
      }

      const countdown = countdownDoc.data();
      const behavior = countdown.behavior || {};

      // Update countdown status
      await db.collection('countdowns').doc(countdownId).update({
        isActive: behavior.hideAfterExpiry !== false ? false : true,
        expiredAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log expiry event
      await db.collection('countdown_interactions').add({
        countdownId,
        action: 'expired',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Handle post-expiry actions
      const actions = [];
      
      if (behavior.redirectAfterExpiry) {
        actions.push({
          type: 'redirect',
          url: behavior.redirectAfterExpiry
        });
      }

      if (behavior.showExpiredMessage) {
        actions.push({
          type: 'show_message',
          message: behavior.expiredMessage || 'This offer has expired'
        });
      }

      return {
        success: true,
        message: 'Countdown expiry handled',
        actions
      };

    } catch (error) {
      console.error('Handle countdown expiry error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Get countdown analytics
  async getCountdownAnalytics(countdownId, dateRange = {}) {
    try {
      const db = admin.firestore();

      // Get countdown details
      const countdownDoc = await db.collection('countdowns').doc(countdownId).get();
      if (!countdownDoc.exists) {
        return {
          success: false,
          error: 'Countdown not found'
        };
      }

      const countdown = countdownDoc.data();

      // Build date range query
      let interactionsQuery = db.collection('countdown_interactions')
        .where('countdownId', '==', countdownId);

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
        impressions: 0,
        clicks: 0,
        conversions: 0,
        uniqueUsers: new Set(),
        deviceBreakdown: {},
        timelineData: {},
        conversionValue: 0
      };

      interactionsSnapshot.forEach(doc => {
        const interaction = doc.data();
        
        if (interaction.action === 'impression') analytics.impressions++;
        if (interaction.action === 'click') analytics.clicks++;
        if (interaction.action === 'conversion') {
          analytics.conversions++;
          analytics.conversionValue += interaction.conversionValue || 0;
        }
        
        if (interaction.userId) {
          analytics.uniqueUsers.add(interaction.userId);
        }

        // Device breakdown
        const device = this.getDeviceFromUserAgent(interaction.userAgent);
        analytics.deviceBreakdown[device] = (analytics.deviceBreakdown[device] || 0) + 1;

        // Timeline data (daily breakdown)
        const date = interaction.timestamp.toDate().toDateString();
        if (!analytics.timelineData[date]) {
          analytics.timelineData[date] = { impressions: 0, clicks: 0, conversions: 0 };
        }
        if (interaction.action in analytics.timelineData[date]) {
          analytics.timelineData[date][interaction.action]++;
        }
      });

      analytics.uniqueUsers = analytics.uniqueUsers.size;

      // Calculate rates
      analytics.clickThroughRate = analytics.impressions > 0 ? (analytics.clicks / analytics.impressions) * 100 : 0;
      analytics.conversionRate = analytics.clicks > 0 ? (analytics.conversions / analytics.clicks) * 100 : 0;

      // Calculate urgency effectiveness
      const urgencyThreshold = countdown.behavior?.urgencyThreshold || 24; // hours
      const urgencyPeriod = urgencyThreshold * 60 * 60 * 1000; // milliseconds
      const now = new Date();
      const urgencyStart = new Date(countdown.endDate.toDate() - urgencyPeriod);

      let urgencyImpressions = 0;
      let urgencyConversions = 0;

      interactionsSnapshot.forEach(doc => {
        const interaction = doc.data();
        const interactionTime = interaction.timestamp.toDate();
        
        if (interactionTime >= urgencyStart) {
          if (interaction.action === 'impression') urgencyImpressions++;
          if (interaction.action === 'conversion') urgencyConversions++;
        }
      });

      analytics.urgencyEffectiveness = {
        urgencyImpressions,
        urgencyConversions,
        urgencyConversionRate: urgencyImpressions > 0 ? (urgencyConversions / urgencyImpressions) * 100 : 0
      };

      return {
        success: true,
        countdown: {
          id: countdownId,
          title: countdown.title,
          type: countdown.type,
          endDate: countdown.endDate?.toDate()?.toISOString()
        },
        analytics
      };

    } catch (error) {
      console.error('Get countdown analytics error:', error);
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

  // Format time remaining for display
  formatTimeRemaining(timeRemaining) {
    if (timeRemaining.expired) {
      return 'EXPIRED';
    }

    const { days, hours, minutes, seconds } = timeRemaining;
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  },

  // Get countdown display configuration
  getDisplayConfig(countdown) {
    const timeRemaining = this.calculateTimeRemaining(new Date(countdown.endDate));
    const design = countdown.design || {};
    const behavior = countdown.behavior || {};

    // Determine if urgency styling should be applied
    const isUrgent = timeRemaining.isUrgent && behavior.urgencyThreshold;
    const shouldBlink = isUrgent && behavior.blinkEffect;

    return {
      timeRemaining: this.formatTimeRemaining(timeRemaining),
      rawTime: timeRemaining,
      style: {
        backgroundColor: design.backgroundColor || '#ff6b6b',
        textColor: design.textColor || '#ffffff',
        accentColor: design.accentColor || '#4ecdc4',
        size: design.size || 'medium',
        position: design.position || 'top',
        showDays: design.showDays !== false,
        showHours: design.showHours !== false,
        showMinutes: design.showMinutes !== false,
        showSeconds: design.showSeconds !== false,
        customCSS: design.customCSS || ''
      },
      behavior: {
        isUrgent,
        shouldBlink,
        hideAfterExpiry: behavior.hideAfterExpiry !== false,
        expiredMessage: behavior.expiredMessage || 'This offer has expired',
        redirectAfterExpiry: behavior.redirectAfterExpiry
      }
    };
  }
};

module.exports = countdownTimer;
