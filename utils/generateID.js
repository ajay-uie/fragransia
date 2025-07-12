const generateID = {
  
  // Generate random string
  generateRandomString(length = 8, includeNumbers = true, includeSpecial = false) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    
    let characters = letters;
    if (includeNumbers) characters += numbers;
    if (includeSpecial) characters += special;
    
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return result;
  },

  // Generate Order ID
  generateOrderId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORD-${timestamp.slice(-8)}-${random}`;
  },

  // Generate Product ID/SKU
  generateProductId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PROD-${timestamp.slice(-6)}-${random}`;
  },

  // Generate User ID (if needed for custom implementation)
  generateUserId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `user_${timestamp}_${random}`;
  },

  // Generate Coupon Code
  generateCouponCode(prefix = 'FRAG', length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    
    for (let i = 0; i < length - prefix.length; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return code;
  },

  // Generate Invoice Number
  generateInvoiceNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    
    return `FRAG-INV-${year}${month}-${timestamp}`;
  },

  // Generate Transaction ID
  generateTransactionId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  },

  // Generate Tracking Number
  generateTrackingNumber() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TRACK-${timestamp.slice(-8)}-${random}`;
  },

  // Generate Refund ID
  generateRefundId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REF-${timestamp.slice(-8)}-${random}`;
  },

  // Generate Review ID
  generateReviewId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `review_${timestamp}_${random}`;
  },

  // Generate Blog Post ID
  generateBlogPostId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `post_${timestamp}_${random}`;
  },

  // Generate Category ID
  generateCategoryId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `cat_${timestamp}_${random}`;
  },

  // Generate Popup ID
  generatePopupId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `popup_${timestamp}_${random}`;
  },

  // Generate Banner ID
  generateBannerId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `banner_${timestamp}_${random}`;
  },

  // Generate Countdown ID
  generateCountdownId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `countdown_${timestamp}_${random}`;
  },

  // Generate Page ID
  generatePageId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `page_${timestamp}_${random}`;
  },

  // Generate Session ID
  generateSessionId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 10);
    return `sess_${timestamp}_${random}`;
  },

  // Generate API Key
  generateApiKey(length = 32) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    
    for (let i = 0; i < length; i++) {
      apiKey += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return apiKey;
  },

  // Generate UUID v4 (simplified)
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // Generate Short URL ID
  generateShortId(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let shortId = '';
    
    for (let i = 0; i < length; i++) {
      shortId += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return shortId;
  },

  // Generate OTP
  generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < length; i++) {
      otp += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    
    return otp;
  },

  // Generate Verification Token
  generateVerificationToken() {
    const timestamp = Date.now().toString();
    const random = this.generateRandomString(16, true, false);
    return `${timestamp}_${random}`;
  },

  // Generate Reset Token
  generateResetToken() {
    const timestamp = Date.now().toString();
    const random = this.generateRandomString(20, true, false);
    return `${timestamp}_${random}`;
  },

  // Generate Webhook Secret
  generateWebhookSecret() {
    return this.generateRandomString(32, true, true);
  },

  // Generate File Name
  generateFileName(originalName, prefix = '') {
    const timestamp = Date.now();
    const random = this.generateRandomString(6);
    const extension = originalName ? originalName.split('.').pop() : 'tmp';
    
    return `${prefix}${timestamp}_${random}.${extension}`;
  },

  // Generate Batch ID
  generateBatchId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `BATCH-${timestamp.slice(-8)}-${random}`;
  },

  // Generate Campaign ID
  generateCampaignId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    return `campaign_${timestamp}_${random}`;
  },

  // Generate Affiliate Code
  generateAffiliateCode(userId = '') {
    const userPrefix = userId ? userId.substring(0, 4).toUpperCase() : 'ANON';
    const random = this.generateRandomString(6, true, false).toUpperCase();
    return `AFF-${userPrefix}-${random}`;
  },

  // Generate Promo Code
  generatePromoCode(eventName = '', length = 8) {
    const eventPrefix = eventName ? eventName.substring(0, 4).toUpperCase() : 'PROMO';
    const random = this.generateRandomString(length - eventPrefix.length, true, false).toUpperCase();
    return `${eventPrefix}${random}`;
  },

  // Generate Unique Identifier with custom format
  generateCustomId(format) {
    // Format: {prefix}-{timestamp}-{random}
    // Example: "CUST-{timestamp:8}-{random:6}"
    
    let id = format;
    
    // Replace timestamp placeholder
    if (id.includes('{timestamp')) {
      const timestampMatch = id.match(/\{timestamp:?(\d+)?\}/);
      const timestampLength = timestampMatch[1] ? parseInt(timestampMatch[1]) : 13;
      const timestamp = Date.now().toString().slice(-timestampLength);
      id = id.replace(/\{timestamp:?\d*\}/, timestamp);
    }
    
    // Replace random placeholder
    if (id.includes('{random')) {
      const randomMatch = id.match(/\{random:?(\d+)?\}/);
      const randomLength = randomMatch[1] ? parseInt(randomMatch[1]) : 6;
      const random = this.generateRandomString(randomLength, true, false).toUpperCase();
      id = id.replace(/\{random:?\d*\}/, random);
    }
    
    // Replace UUID placeholder
    if (id.includes('{uuid}')) {
      id = id.replace('{uuid}', this.generateUUID());
    }
    
    return id;
  }
};

module.exports = { generateID };
