const admin = require('firebase-admin');

const giftWrapLogic = {
  
  // Gift wrap options
  getGiftWrapOptions() {
    return {
      standard: {
        id: 'standard',
        name: 'Standard Gift Wrap',
        description: 'Beautiful gift wrapping with ribbon',
        price: 50,
        image: '/images/gift-wrap/standard.jpg',
        estimatedTime: '1-2 business days'
      },
      premium: {
        id: 'premium',
        name: 'Premium Gift Wrap',
        description: 'Luxury gift box with premium wrapping',
        price: 100,
        image: '/images/gift-wrap/premium.jpg',
        estimatedTime: '2-3 business days'
      },
      custom: {
        id: 'custom',
        name: 'Custom Gift Wrap',
        description: 'Personalized message and custom wrapping',
        price: 150,
        image: '/images/gift-wrap/custom.jpg',
        estimatedTime: '3-5 business days'
      }
    };
  },

  // Validate gift wrap selection
  validateGiftWrap(giftWrapData) {
    const errors = [];
    const options = this.getGiftWrapOptions();

    if (!giftWrapData) {
      return { isValid: true, errors: [] }; // Gift wrap is optional
    }

    // Validate gift wrap type
    if (!giftWrapData.type || !options[giftWrapData.type]) {
      errors.push('Invalid gift wrap type');
    }

    // Validate message length for custom gift wrap
    if (giftWrapData.type === 'custom') {
      if (!giftWrapData.message || giftWrapData.message.trim().length === 0) {
        errors.push('Custom message is required for custom gift wrap');
      } else if (giftWrapData.message.length > 200) {
        errors.push('Gift message cannot exceed 200 characters');
      }
    }

    // Validate recipient information
    if (giftWrapData.recipientName && giftWrapData.recipientName.length > 50) {
      errors.push('Recipient name cannot exceed 50 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Calculate gift wrap cost
  calculateGiftWrapCost(giftWrapData, items = []) {
    if (!giftWrapData || !giftWrapData.type) {
      return {
        cost: 0,
        breakdown: {}
      };
    }

    const options = this.getGiftWrapOptions();
    const selectedOption = options[giftWrapData.type];

    if (!selectedOption) {
      return {
        cost: 0,
        breakdown: {},
        error: 'Invalid gift wrap type'
      };
    }

    // Base cost per item (or flat rate)
    const itemCount = items.length || 1;
    const baseCost = selectedOption.price;
    
    // For multiple items, apply volume discount
    let totalCost = baseCost;
    if (itemCount > 1) {
      totalCost = baseCost + ((itemCount - 1) * (baseCost * 0.7)); // 30% discount for additional items
    }

    // Apply custom message surcharge
    let customMessageCharge = 0;
    if (giftWrapData.type === 'custom' && giftWrapData.message) {
      customMessageCharge = 25;
    }

    const finalCost = Math.round(totalCost + customMessageCharge);

    return {
      cost: finalCost,
      breakdown: {
        basePrice: baseCost,
        itemCount,
        volumeDiscount: itemCount > 1 ? Math.round((baseCost * 0.3) * (itemCount - 1)) : 0,
        customMessageCharge,
        total: finalCost
      }
    };
  },

  // Process gift wrap order
  async processGiftWrapOrder(orderId, giftWrapData) {
    try {
      const db = admin.firestore();

      // Validate gift wrap data
      const validation = this.validateGiftWrap(giftWrapData);
      if (!validation.isValid) {
        throw new Error(`Gift wrap validation failed: ${validation.errors.join(', ')}`);
      }

      // Get order details
      const orderDoc = await db.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        throw new Error('Order not found');
      }

      const order = orderDoc.data();
      const giftWrapCost = this.calculateGiftWrapCost(giftWrapData, order.items);

      // Create gift wrap record
      const giftWrapRecord = {
        orderId,
        type: giftWrapData.type,
        recipientName: giftWrapData.recipientName || '',
        message: giftWrapData.message || '',
        specialInstructions: giftWrapData.specialInstructions || '',
        cost: giftWrapCost.cost,
        costBreakdown: giftWrapCost.breakdown,
        status: 'pending', // pending, in_progress, completed
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Save gift wrap details
      await db.collection('gift_wraps').doc(orderId).set(giftWrapRecord);

      // Update order with gift wrap information
      await db.collection('orders').doc(orderId).update({
        giftWrap: {
          enabled: true,
          type: giftWrapData.type,
          cost: giftWrapCost.cost,
          recipientName: giftWrapData.recipientName || '',
          message: giftWrapData.message || ''
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        giftWrapRecord,
        cost: giftWrapCost.cost
      };

    } catch (error) {
      console.error('Process gift wrap order error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Update gift wrap status
  async updateGiftWrapStatus(orderId, status, notes = '') {
    try {
      const db = admin.firestore();

      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid gift wrap status');
      }

      await db.collection('gift_wraps').doc(orderId).update({
        status,
        statusNotes: notes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log status update
      await db.collection('gift_wrap_status_logs').add({
        orderId,
        status,
        notes,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: `Gift wrap status updated to ${status}`
      };

    } catch (error) {
      console.error('Update gift wrap status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Get gift wrap details for order
  async getGiftWrapDetails(orderId) {
    try {
      const db = admin.firestore();

      const giftWrapDoc = await db.collection('gift_wraps').doc(orderId).get();
      
      if (!giftWrapDoc.exists) {
        return {
          success: false,
          error: 'Gift wrap details not found'
        };
      }

      const giftWrapData = giftWrapDoc.data();

      return {
        success: true,
        giftWrap: {
          ...giftWrapData,
          createdAt: giftWrapData.createdAt?.toDate()?.toISOString(),
          updatedAt: giftWrapData.updatedAt?.toDate()?.toISOString()
        }
      };

    } catch (error) {
      console.error('Get gift wrap details error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Generate gift wrap instructions
  generateGiftWrapInstructions(giftWrapData) {
    const options = this.getGiftWrapOptions();
    const selectedOption = options[giftWrapData.type];

    if (!selectedOption) {
      return null;
    }

    let instructions = `Gift Wrap Type: ${selectedOption.name}\n`;
    instructions += `Description: ${selectedOption.description}\n`;

    if (giftWrapData.recipientName) {
      instructions += `Recipient: ${giftWrapData.recipientName}\n`;
    }

    if (giftWrapData.message) {
      instructions += `Gift Message: "${giftWrapData.message}"\n`;
    }

    if (giftWrapData.specialInstructions) {
      instructions += `Special Instructions: ${giftWrapData.specialInstructions}\n`;
    }

    instructions += `Estimated Completion: ${selectedOption.estimatedTime}`;

    return instructions;
  },

  // Get gift wrap statistics
  async getGiftWrapStats() {
    try {
      const db = admin.firestore();

      const [
        totalGiftWraps,
        pendingGiftWraps,
        completedGiftWraps,
        recentGiftWraps
      ] = await Promise.all([
        db.collection('gift_wraps').get(),
        db.collection('gift_wraps').where('status', '==', 'pending').get(),
        db.collection('gift_wraps').where('status', '==', 'completed').get(),
        db.collection('gift_wraps')
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get()
      ]);

      // Calculate revenue from gift wraps
      let totalRevenue = 0;
      totalGiftWraps.forEach(doc => {
        const giftWrap = doc.data();
        totalRevenue += giftWrap.cost || 0;
      });

      // Get type distribution
      const typeDistribution = {};
      totalGiftWraps.forEach(doc => {
        const giftWrap = doc.data();
        typeDistribution[giftWrap.type] = (typeDistribution[giftWrap.type] || 0) + 1;
      });

      const recentGiftWrapsList = [];
      recentGiftWraps.forEach(doc => {
        const giftWrap = doc.data();
        recentGiftWrapsList.push({
          orderId: giftWrap.orderId,
          type: giftWrap.type,
          cost: giftWrap.cost,
          status: giftWrap.status,
          createdAt: giftWrap.createdAt?.toDate()?.toISOString()
        });
      });

      return {
        success: true,
        stats: {
          total: totalGiftWraps.size,
          pending: pendingGiftWraps.size,
          completed: completedGiftWraps.size,
          revenue: totalRevenue,
          typeDistribution,
          recent: recentGiftWrapsList
        }
      };

    } catch (error) {
      console.error('Get gift wrap stats error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = giftWrapLogic;
