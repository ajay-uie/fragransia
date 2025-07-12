const validateInput = {
  
  // Validate email format
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    return {
      isValid,
      errors: isValid ? [] : ['Invalid email format']
    };
  },

  // Validate password strength
  validatePassword(password) {
    const errors = [];
    
    if (!password) {
      errors.push('Password is required');
      return { isValid: false, errors };
    }
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate name (first name, last name)
  validateName(name) {
    const errors = [];
    
    if (!name || name.trim().length === 0) {
      errors.push('Name is required');
      return { isValid: false, errors };
    }
    
    if (name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long');
    }
    
    if (name.trim().length > 50) {
      errors.push('Name cannot exceed 50 characters');
    }
    
    if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
      errors.push('Name can only contain letters and spaces');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate phone number (Indian format)
  validatePhoneNumber(phoneNumber) {
    const errors = [];
    
    if (!phoneNumber) {
      errors.push('Phone number is required');
      return { isValid: false, errors };
    }
    
    // Remove all non-digit characters
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    // Check for Indian mobile number format
    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
      errors.push('Invalid Indian mobile number format');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      cleanedPhone
    };
  },

  // Validate pincode (Indian format)
  validatePincode(pincode) {
    const errors = [];
    
    if (!pincode) {
      errors.push('Pincode is required');
      return { isValid: false, errors };
    }
    
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      errors.push('Invalid pincode format (6 digits, cannot start with 0)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate registration data
  validateRegistration(data) {
    const errors = [];
    
    // Validate email
    const emailValidation = this.validateEmail(data.email);
    if (!emailValidation.isValid) {
      errors.push(...emailValidation.errors);
    }
    
    // Validate password
    const passwordValidation = this.validatePassword(data.password);
    if (!passwordValidation.isValid) {
      errors.push(...passwordValidation.errors);
    }
    
    // Validate first name
    const firstNameValidation = this.validateName(data.firstName);
    if (!firstNameValidation.isValid) {
      errors.push(...firstNameValidation.errors.map(err => `First name: ${err}`));
    }
    
    // Validate last name
    const lastNameValidation = this.validateName(data.lastName);
    if (!lastNameValidation.isValid) {
      errors.push(...lastNameValidation.errors.map(err => `Last name: ${err}`));
    }
    
    // Validate phone number if provided
    if (data.phoneNumber) {
      const phoneValidation = this.validatePhoneNumber(data.phoneNumber);
      if (!phoneValidation.isValid) {
        errors.push(...phoneValidation.errors);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate product data
  validateProduct(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length === 0) {
      errors.push('Product name is required');
    } else if (data.name.trim().length > 100) {
      errors.push('Product name cannot exceed 100 characters');
    }
    
    if (!data.description || data.description.trim().length === 0) {
      errors.push('Product description is required');
    } else if (data.description.trim().length > 2000) {
      errors.push('Product description cannot exceed 2000 characters');
    }
    
    if (!data.price || isNaN(data.price) || data.price <= 0) {
      errors.push('Valid product price is required');
    } else if (data.price > 100000) {
      errors.push('Product price cannot exceed ₹100,000');
    }
    
    if (!data.category || data.category.trim().length === 0) {
      errors.push('Product category is required');
    }
    
    if (data.inventory === undefined || isNaN(data.inventory) || data.inventory < 0) {
      errors.push('Valid inventory count is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate order data
  validateOrder(data) {
    const errors = [];
    
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      errors.push('Order must contain at least one item');
    } else {
      data.items.forEach((item, index) => {
        if (!item.productId) {
          errors.push(`Item ${index + 1}: Product ID is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index + 1}: Valid quantity is required`);
        }
      });
    }
    
    if (!data.userDetails) {
      errors.push('User details are required');
    } else {
      if (!data.userDetails.firstName) {
        errors.push('First name is required');
      }
      if (!data.userDetails.lastName) {
        errors.push('Last name is required');
      }
      if (!data.userDetails.email) {
        errors.push('Email is required');
      } else {
        const emailValidation = this.validateEmail(data.userDetails.email);
        if (!emailValidation.isValid) {
          errors.push(...emailValidation.errors);
        }
      }
    }
    
    if (!data.shippingAddress) {
      errors.push('Shipping address is required');
    } else {
      if (!data.shippingAddress.address) {
        errors.push('Address line is required');
      }
      if (!data.shippingAddress.city) {
        errors.push('City is required');
      }
      if (!data.shippingAddress.state) {
        errors.push('State is required');
      }
      if (!data.shippingAddress.pincode) {
        errors.push('Pincode is required');
      } else {
        const pincodeValidation = this.validatePincode(data.shippingAddress.pincode);
        if (!pincodeValidation.isValid) {
          errors.push(...pincodeValidation.errors);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate address data
  validateAddress(data) {
    const errors = [];
    
    if (!data.address || data.address.trim().length === 0) {
      errors.push('Address line is required');
    } else if (data.address.trim().length > 200) {
      errors.push('Address cannot exceed 200 characters');
    }
    
    if (!data.city || data.city.trim().length === 0) {
      errors.push('City is required');
    } else if (data.city.trim().length > 50) {
      errors.push('City name cannot exceed 50 characters');
    }
    
    if (!data.state || data.state.trim().length === 0) {
      errors.push('State is required');
    }
    
    const pincodeValidation = this.validatePincode(data.pincode);
    if (!pincodeValidation.isValid) {
      errors.push(...pincodeValidation.errors);
    }
    
    if (data.landmark && data.landmark.length > 100) {
      errors.push('Landmark cannot exceed 100 characters');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate coupon data
  validateCoupon(data) {
    const errors = [];
    
    if (!data.code || data.code.trim().length === 0) {
      errors.push('Coupon code is required');
    } else if (!/^[A-Z0-9]+$/.test(data.code.trim())) {
      errors.push('Coupon code can only contain uppercase letters and numbers');
    } else if (data.code.trim().length > 20) {
      errors.push('Coupon code cannot exceed 20 characters');
    }
    
    if (!data.type || !['percentage', 'fixed'].includes(data.type)) {
      errors.push('Valid coupon type is required (percentage or fixed)');
    }
    
    if (!data.value || isNaN(data.value) || data.value <= 0) {
      errors.push('Valid coupon value is required');
    } else {
      if (data.type === 'percentage' && data.value > 100) {
        errors.push('Percentage value cannot exceed 100');
      }
      if (data.type === 'fixed' && data.value > 50000) {
        errors.push('Fixed discount cannot exceed ₹50,000');
      }
    }
    
    if (data.minOrderValue && (isNaN(data.minOrderValue) || data.minOrderValue < 0)) {
      errors.push('Minimum order value must be a valid positive number');
    }
    
    if (data.maxDiscount && (isNaN(data.maxDiscount) || data.maxDiscount <= 0)) {
      errors.push('Maximum discount must be a valid positive number');
    }
    
    if (!data.expiryDate) {
      errors.push('Expiry date is required');
    } else {
      const expiryDate = new Date(data.expiryDate);
      if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
        errors.push('Valid future expiry date is required');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate review data
  validateReview(data) {
    const errors = [];
    
    if (!data.productId) {
      errors.push('Product ID is required');
    }
    
    if (!data.rating || isNaN(data.rating) || data.rating < 1 || data.rating > 5) {
      errors.push('Rating must be between 1 and 5');
    }
    
    if (data.title && data.title.length > 100) {
      errors.push('Review title cannot exceed 100 characters');
    }
    
    if (data.comment && data.comment.length > 1000) {
      errors.push('Review comment cannot exceed 1000 characters');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Sanitize string input
  sanitizeString(input) {
    if (typeof input !== 'string') return '';
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/['"]/g, '') // Remove quotes to prevent injection
      .slice(0, 1000); // Limit length
  },

  // Validate and sanitize HTML content (basic)
  sanitizeHTML(html) {
    if (typeof html !== 'string') return '';
    
    // Allow only basic HTML tags
    const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li'];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    
    return html.replace(tagRegex, (match, tagName) => {
      return allowedTags.includes(tagName.toLowerCase()) ? match : '';
    });
  },

  // Validate image URL
  validateImageURL(url) {
    const errors = [];
    
    if (!url) {
      errors.push('Image URL is required');
      return { isValid: false, errors };
    }
    
    try {
      const urlObject = new URL(url);
      if (!['http:', 'https:'].includes(urlObject.protocol)) {
        errors.push('Image URL must use HTTP or HTTPS protocol');
      }
    } catch (e) {
      errors.push('Invalid image URL format');
    }
    
    // Check file extension
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const hasValidExtension = validExtensions.some(ext => 
      url.toLowerCase().includes(ext)
    );
    
    if (!hasValidExtension) {
      errors.push('Image URL must point to a valid image file');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate date range
  validateDateRange(startDate, endDate) {
    const errors = [];
    
    if (!startDate || !endDate) {
      errors.push('Both start date and end date are required');
      return { isValid: false, errors };
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime())) {
      errors.push('Invalid start date format');
    }
    
    if (isNaN(end.getTime())) {
      errors.push('Invalid end date format');
    }
    
    if (start >= end) {
      errors.push('End date must be after start date');
    }
    
    // Check if date range is reasonable (not more than 1 year)
    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if ((end - start) > maxRange) {
      errors.push('Date range cannot exceed 1 year');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

module.exports = { validateInput };
