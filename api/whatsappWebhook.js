const { auth, db, admin } = require('../auth/firebaseConfig');
const { whatsappBot } = require('../utils/whatsappBot');
const orderManager = require('../database/orderManager');

module.exports = async (req, res) => {
  try {
    // Verify webhook (GET request)
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('WhatsApp webhook verified');
        return res.status(200).send(challenge);
      } else {
        console.log('WhatsApp webhook verification failed');
        return res.status(403).json({ error: 'Verification failed' });
      }
    }

    // Handle webhook events (POST request)
    if (req.method === 'POST') {
      const body = req.body;

      if (body.object === 'whatsapp_business_account') {
        body.entry.forEach(async (entry) => {
          const changes = entry.changes;
          
          changes.forEach(async (change) => {
            if (change.field === 'messages') {
              const messages = change.value.messages;
              
              if (messages) {
                for (const message of messages) {
                  await handleIncomingMessage(message, change.value);
                }
              }

              // Handle message status updates
              const statuses = change.value.statuses;
              if (statuses) {
                for (const status of statuses) {
                  await handleMessageStatus(status);
                }
              }
            }
          });
        });

        return res.status(200).json({ success: true });
      }
    }

    res.status(400).json({ error: 'Invalid request' });

  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
};

async function handleIncomingMessage(message, value) {
  try {
    const from = message.from;
    const messageBody = message.text?.body?.toLowerCase();
    const messageType = message.type;

    console.log(`Received ${messageType} message from ${from}: ${messageBody}`);

    // Check if user exists in our system
    const usersQuery = await db.collection('users')
      .where('phoneNumber', '==', `+${from}`)
      .limit(1)
      .get();

    let userId = null;
    let userData = null;
    
    if (!usersQuery.empty) {
      const userDoc = usersQuery.docs[0];
      userId = userDoc.id;
      userData = userDoc.data();
    }

    // Handle different message types
    if (messageType === 'text') {
      await handleTextMessage(from, messageBody, userId, userData);
    } else if (messageType === 'interactive') {
      await handleInteractiveMessage(from, message.interactive, userId, userData);
    } else if (messageType === 'button') {
      await handleButtonMessage(from, message.button, userId, userData);
    }

    // Log message for analytics
    await db.collection('whatsapp_messages').add({
      from,
      to: value.metadata.phone_number_id,
      messageId: message.id,
      type: messageType,
      content: messageBody || JSON.stringify(message),
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      processed: true
    });

  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

async function handleTextMessage(from, messageBody, userId, userData) {
  try {
    // Basic command handling
    if (messageBody.includes('order') || messageBody.includes('status')) {
      if (userId) {
        await handleOrderInquiry(from, userId);
      } else {
        await whatsappBot.sendMessage(from, 
          '📱 Please register on our website first to check your orders.\n\n' +
          '🌐 Visit: https://fragransia.com/register'
        );
      }
    } else if (messageBody.includes('help') || messageBody.includes('support') || messageBody === 'hi' || messageBody === 'hello') {
      await sendWelcomeMessage(from, userData);
    } else if (messageBody.includes('track')) {
      const orderIdMatch = messageBody.match(/track\s+(\w+)/i);
      if (orderIdMatch) {
        const orderId = orderIdMatch[1];
        await handleOrderTracking(from, orderId, userId);
      } else {
        await whatsappBot.sendMessage(from, 
          '📦 Please provide your order ID.\n\n' +
          'Example: "track ORD123456"'
        );
      }
    } else if (messageBody.includes('return') || messageBody.includes('exchange')) {
      await sendReturnPolicy(from);
    } else if (messageBody.includes('catalog') || messageBody.includes('products')) {
      await sendProductCatalog(from);
    } else if (messageBody.includes('offers') || messageBody.includes('discount')) {
      await sendCurrentOffers(from);
    } else {
      // Default response for unrecognized messages
      await sendDefaultResponse(from, userData);
    }

  } catch (error) {
    console.error('Error handling text message:', error);
  }
}

async function sendWelcomeMessage(from, userData) {
  const userName = userData ? userData.firstName : 'there';
  
  const welcomeMessage = `🌸 *Welcome to Fragransia, ${userName}!*\n\n` +
    `I'm here to help you with:\n\n` +
    `🛍️ *Order Status* - Type "order"\n` +
    `📦 *Track Package* - Type "track ORDER_ID"\n` +
    `🔄 *Returns/Exchange* - Type "return"\n` +
    `💰 *Current Offers* - Type "offers"\n` +
    `🛒 *Product Catalog* - Type "catalog"\n` +
    `❓ *Other Help* - Just ask!\n\n` +
    `🌐 Visit our website: https://fragransia.com`;

  await whatsappBot.sendMessage(from, welcomeMessage);
}

async function handleOrderInquiry(from, userId) {
  try {
    const orderResult = await orderManager.getUserOrders(userId, 5, 1);
    
    if (orderResult.success && orderResult.orders.length > 0) {
      let ordersList = '📋 *Your Recent Orders:*\n\n';
      
      orderResult.orders.forEach((order, index) => {
        const statusEmoji = getStatusEmoji(order.status);
        ordersList += `${index + 1}. ${statusEmoji} Order #${order.id}\n`;
        ordersList += `   Status: *${order.status.charAt(0).toUpperCase() + order.status.slice(1)}*\n`;
        ordersList += `   Amount: ₹${order.pricing.total}\n`;
        ordersList += `   Date: ${new Date(order.orderDate).toLocaleDateString()}\n\n`;
      });
      
      ordersList += `💬 Type "track ORDER_ID" for detailed tracking`;
      
      await whatsappBot.sendMessage(from, ordersList);
    } else {
      await whatsappBot.sendMessage(from, 
        '🛍️ You don\'t have any orders yet.\n\n' +
        '✨ Discover our amazing fragrances at:\n' +
        '🌐 https://fragransia.com'
      );
    }
  } catch (error) {
    console.error('Error handling order inquiry:', error);
    await whatsappBot.sendMessage(from, 
      '❌ Sorry, I couldn\'t fetch your orders right now. Please try again later.'
    );
  }
}

async function handleOrderTracking(from, orderId, userId) {
  try {
    const orderResult = await orderManager.getOrderById(orderId, userId);
    
    if (!orderResult.success) {
      await whatsappBot.sendMessage(from, 
        `❌ Order #${orderId} not found or you don't have permission to view it.`
      );
      return;
    }

    const order = orderResult.order;
    const statusEmoji = getStatusEmoji(order.status);
    
    let trackingMessage = `📦 *Order Tracking - #${orderId}*\n\n`;
    trackingMessage += `${statusEmoji} Status: *${order.status.charAt(0).toUpperCase() + order.status.slice(1)}*\n`;
    trackingMessage += `💳 Payment: *${order.payment.status}*\n`;
    trackingMessage += `💰 Amount: ₹${order.pricing.total}\n`;
    trackingMessage += `📅 Order Date: ${new Date(order.orderDate).toLocaleDateString()}\n\n`;

    if (order.shipping.estimatedDelivery) {
      trackingMessage += `🚚 Estimated Delivery: ${new Date(order.shipping.estimatedDelivery).toLocaleDateString()}\n`;
    }

    if (order.tracking?.trackingNumber) {
      trackingMessage += `📋 Tracking Number: ${order.tracking.trackingNumber}\n`;
    }

    // Add status history
    if (order.statusHistory && order.statusHistory.length > 0) {
      trackingMessage += `\n📈 *Status History:*\n`;
      order.statusHistory.slice(-3).forEach(status => {
        const date = new Date(status.timestamp).toLocaleDateString();
        trackingMessage += `• ${status.status} - ${date}\n`;
      });
    }

    await whatsappBot.sendMessage(from, trackingMessage);

  } catch (error) {
    console.error('Error handling order tracking:', error);
    await whatsappBot.sendMessage(from, 
      '❌ Sorry, I couldn\'t fetch the tracking information. Please try again later.'
    );
  }
}

async function sendReturnPolicy(from) {
  const returnMessage = `🔄 *Return & Exchange Policy*\n\n` +
    `✅ *Easy Returns within 7 days*\n` +
    `• Unused products in original packaging\n` +
    `• No questions asked policy\n\n` +
    `📞 *How to Return:*\n` +
    `1. Contact us with your order ID\n` +
    `2. We'll arrange pickup\n` +
    `3. Refund processed within 5-7 days\n\n` +
    `📧 Email: support@fragransia.com\n` +
    `📱 WhatsApp: Just reply here!`;

  await whatsappBot.sendMessage(from, returnMessage);
}

async function sendProductCatalog(from) {
  const catalogMessage = `🛒 *Fragransia Product Catalog*\n\n` +
    `🌸 *Categories:*\n` +
    `• Floral Fragrances\n` +
    `• Woody & Musky\n` +
    `• Fresh & Citrus\n` +
    `• Oriental & Spicy\n` +
    `• Unisex Collection\n\n` +
    `💎 *Premium Brands Available*\n` +
    `🎁 *Gift Sets & Combos*\n` +
    `🚚 *Free Shipping on orders above ₹500*\n\n` +
    `🌐 Browse full catalog: https://fragransia.com/products`;

  await whatsappBot.sendMessage(from, catalogMessage);
}

async function sendCurrentOffers(from) {
  try {
    // Get active coupons
    const couponsQuery = await db.collection('coupons')
      .where('isActive', '==', true)
      .where('expiryDate', '>', new Date())
      .limit(3)
      .get();

    let offersMessage = `🎉 *Current Offers & Discounts*\n\n`;
    
    if (!couponsQuery.empty) {
      couponsQuery.forEach(doc => {
        const coupon = doc.data();
        const discount = coupon.type === 'percentage' ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`;
        offersMessage += `🏷️ *${coupon.code}* - ${discount}\n`;
        if (coupon.description) {
          offersMessage += `   ${coupon.description}\n`;
        }
        offersMessage += `   Min. order: ₹${coupon.minOrderValue || 0}\n\n`;
      });
    } else {
      offersMessage += `🎁 *Special Offers:*\n`;
      offersMessage += `• Free shipping on orders above ₹500\n`;
      offersMessage += `• Buy 2 Get 1 Free on selected items\n`;
      offersMessage += `• First-time buyer discount: 10% OFF\n\n`;
    }
    
    offersMessage += `🛍️ Shop now: https://fragransia.com`;
    
    await whatsappBot.sendMessage(from, offersMessage);
  } catch (error) {
    console.error('Error sending offers:', error);
    await sendDefaultResponse(from);
  }
}

async function sendDefaultResponse(from, userData) {
  const userName = userData ? userData.firstName : '';
  
  const defaultMessage = `Thank you for contacting Fragransia${userName ? `, ${userName}` : ''}! 🌸\n\n` +
    `Our team will get back to you soon. Meanwhile:\n\n` +
    `💬 Type "help" for quick assistance\n` +
    `📦 Type "order" to check your orders\n` +
    `🛒 Type "catalog" to browse products\n` +
    `🎉 Type "offers" for current deals\n\n` +
    `🌐 Visit: https://fragransia.com`;

  await whatsappBot.sendMessage(from, defaultMessage);
}

function getStatusEmoji(status) {
  const statusEmojis = {
    'pending': '⏳',
    'confirmed': '✅',
    'processing': '📦',
    'shipped': '🚚',
    'delivered': '🎉',
    'cancelled': '❌',
    'refunded': '💰'
  };
  
  return statusEmojis[status] || '📋';
}

async function handleInteractiveMessage(from, interactive, userId, userData) {
  // Handle interactive button responses
  try {
    const buttonReply = interactive.button_reply;
    if (buttonReply) {
      const buttonId = buttonReply.id;
      
      switch (buttonId) {
        case 'check_orders':
          await handleOrderInquiry(from, userId);
          break;
        case 'track_order':
          await whatsappBot.sendMessage(from, 'Please provide your order ID to track. Example: "track ORD123456"');
          break;
        case 'view_catalog':
          await sendProductCatalog(from);
          break;
        case 'current_offers':
          await sendCurrentOffers(from);
          break;
        default:
          await sendDefaultResponse(from, userData);
      }
    }
  } catch (error) {
    console.error('Error handling interactive message:', error);
  }
}

async function handleButtonMessage(from, button, userId, userData) {
  // Handle simple button responses
  await handleInteractiveMessage(from, { button_reply: button }, userId, userData);
}

async function handleMessageStatus(status) {
  try {
    // Update message status in database
    await db.collection('whatsapp_message_status').add({
      messageId: status.id,
      recipientId: status.recipient_id,
      status: status.status,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      conversation: status.conversation || null,
      pricing: status.pricing || null
    });

    console.log(`Message ${status.id} status updated to: ${status.status}`);

  } catch (error) {
    console.error('Error handling message status:', error);
  }
}
