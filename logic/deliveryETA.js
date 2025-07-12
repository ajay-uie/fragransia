const deliveryETA = {
  
  // Calculate delivery estimate based on pincode
  calculateDelivery(pincode, city = null, state = null) {
    try {
      // Validate pincode
      if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) {
        return {
          available: false,
          error: 'Invalid pincode format'
        };
      }

      // Get zone and delivery info based on pincode
      const deliveryInfo = this.getDeliveryInfoByPincode(pincode);
      
      if (!deliveryInfo.available) {
        return {
          available: false,
          message: 'Delivery not available to this location',
          suggestedPincodes: this.getSuggestedPincodes(pincode)
        };
      }

      // Calculate estimated delivery date
      const now = new Date();
      const estimatedDate = new Date(now);
      estimatedDate.setDate(now.getDate() + deliveryInfo.estimatedDays);

      // Skip weekends for business deliveries
      if (deliveryInfo.zone !== 'metro') {
        while (estimatedDate.getDay() === 0 || estimatedDate.getDay() === 6) {
          estimatedDate.setDate(estimatedDate.getDate() + 1);
        }
      }

      return {
        available: true,
        pincode,
        city: deliveryInfo.city || city,
        state: deliveryInfo.state || state,
        zone: deliveryInfo.zone,
        estimatedDays: deliveryInfo.estimatedDays,
        minDays: deliveryInfo.minDays,
        maxDays: deliveryInfo.maxDays,
        estimatedDate: estimatedDate.toISOString(),
        shippingCharges: deliveryInfo.shippingCharges,
        cashOnDelivery: deliveryInfo.cashOnDelivery,
        expressDelivery: deliveryInfo.expressDelivery,
        courierPartner: deliveryInfo.courierPartner
      };

    } catch (error) {
      console.error('Calculate delivery error:', error);
      return {
        available: false,
        error: 'Unable to calculate delivery estimate'
      };
    }
  },

  // Get delivery information based on pincode
  getDeliveryInfoByPincode(pincode) {
    const pincodeInt = parseInt(pincode);

    // Metro cities (1-2 days)
    const metroPincodes = {
      // Mumbai
      ranges: [[400001, 400104], [421001, 421306]],
      // Delhi
      ranges2: [[110001, 110096]],
      // Bangalore
      ranges3: [[560001, 560100]],
      // Chennai
      ranges4: [[600001, 600123]],
      // Kolkata
      ranges5: [[700001, 700156]],
      // Hyderabad
      ranges6: [[500001, 500095]]
    };

    if (this.isPincodeInMetro(pincodeInt)) {
      return {
        available: true,
        zone: 'metro',
        estimatedDays: 2,
        minDays: 1,
        maxDays: 3,
        shippingCharges: 0, // Free shipping for metro
        cashOnDelivery: true,
        expressDelivery: true,
        courierPartner: 'Express Logistics',
        city: this.getCityByPincode(pincode),
        state: this.getStateByPincode(pincode)
      };
    }

    // Tier 1 cities (2-4 days)
    if (this.isPincodeInTier1(pincodeInt)) {
      return {
        available: true,
        zone: 'tier1',
        estimatedDays: 3,
        minDays: 2,
        maxDays: 4,
        shippingCharges: 40,
        cashOnDelivery: true,
        expressDelivery: true,
        courierPartner: 'Standard Logistics',
        city: this.getCityByPincode(pincode),
        state: this.getStateByPincode(pincode)
      };
    }

    // Tier 2 cities (3-6 days)
    if (this.isPincodeInTier2(pincodeInt)) {
      return {
        available: true,
        zone: 'tier2',
        estimatedDays: 5,
        minDays: 3,
        maxDays: 6,
        shippingCharges: 60,
        cashOnDelivery: true,
        expressDelivery: false,
        courierPartner: 'Regional Logistics',
        city: this.getCityByPincode(pincode),
        state: this.getStateByPincode(pincode)
      };
    }

    // Remote areas (5-10 days)
    if (this.isPincodeInRemote(pincodeInt)) {
      return {
        available: true,
        zone: 'remote',
        estimatedDays: 7,
        minDays: 5,
        maxDays: 10,
        shippingCharges: 100,
        cashOnDelivery: false, // No COD for remote areas
        expressDelivery: false,
        courierPartner: 'Remote Logistics',
        city: this.getCityByPincode(pincode),
        state: this.getStateByPincode(pincode)
      };
    }

    // Not serviceable
    return {
      available: false,
      zone: 'not_serviceable'
    };
  },

  // Check if pincode is in metro area
  isPincodeInMetro(pincode) {
    const metroRanges = [
      [110001, 110096], // Delhi
      [400001, 400104], // Mumbai
      [560001, 560100], // Bangalore
      [600001, 600123], // Chennai
      [700001, 700156], // Kolkata
      [500001, 500095], // Hyderabad
      [411001, 411057], // Pune
      [380001, 380061], // Ahmedabad
      [226001, 226030], // Lucknow
      [302001, 302039]  // Jaipur
    ];

    return metroRanges.some(([start, end]) => pincode >= start && pincode <= end);
  },

  // Check if pincode is in Tier 1 cities
  isPincodeInTier1(pincode) {
    const tier1Ranges = [
      [201001, 201318], // Ghaziabad
      [122001, 122505], // Gurgaon
      [140001, 140308], // Chandigarh
      [160001, 160104], // Chandigarh
      [282001, 282010], // Agra
      [208001, 208027], // Kanpur
      [462001, 462046], // Bhopal
      [751001, 751030], // Bhubaneswar
      [641001, 641659], // Coimbatore
      [682001, 682040], // Kochi
      [695001, 695615]  // Thiruvananthapuram
    ];

    return tier1Ranges.some(([start, end]) => pincode >= start && pincode <= end);
  },

  // Check if pincode is in Tier 2 cities
  isPincodeInTier2(pincode) {
    const tier2Ranges = [
      [244001, 244713], // Moradabad
      [248001, 248196], // Dehradun
      [313001, 313902], // Udaipur
      [324001, 324009], // Kota
      [360001, 360590], // Rajkot
      [395001, 395010], // Surat
      [444001, 444807], // Akola
      [492001, 492014], // Raipur
      [534001, 534484], // West Godavari
      [570001, 571448]  // Mysore
    ];

    return tier2Ranges.some(([start, end]) => pincode >= start && pincode <= end);
  },

  // Check if pincode is in remote areas
  isPincodeInRemote(pincode) {
    // Remote areas typically have specific pincode patterns
    const remotePatterns = [
      // Northeast states
      [790001, 799999],
      // Andaman & Nicobar
      [744001, 744999],
      // Lakshadweep
      [682551, 682559],
      // Remote areas of Rajasthan
      [331001, 335999],
      // Remote areas of UP
      [271001, 285999],
      // Remote areas of MP
      [470001, 488999]
    ];

    return remotePatterns.some(([start, end]) => pincode >= start && pincode <= end);
  },

  // Get city name by pincode (simplified mapping)
  getCityByPincode(pincode) {
    const pincodeInt = parseInt(pincode);
    
    // Major cities mapping
    const cityMapping = {
      110: 'New Delhi',
      400: 'Mumbai',
      560: 'Bangalore',
      600: 'Chennai',
      700: 'Kolkata',
      500: 'Hyderabad',
      411: 'Pune',
      380: 'Ahmedabad',
      201: 'Ghaziabad',
      122: 'Gurgaon'
    };

    const prefix = Math.floor(pincodeInt / 1000);
    return cityMapping[prefix] || 'Unknown';
  },

  // Get state name by pincode
  getStateByPincode(pincode) {
    const firstDigit = parseInt(pincode.charAt(0));
    
    const stateMapping = {
      1: 'Delhi',
      2: 'Haryana',
      3: 'Punjab',
      4: 'Maharashtra',
      5: 'Andhra Pradesh',
      6: 'Tamil Nadu',
      7: 'West Bengal',
      8: 'Bihar'
    };

    return stateMapping[firstDigit] || 'India';
  },

  // Get suggested pincodes for non-serviceable areas
  getSuggestedPincodes(pincode) {
    const nearbyPincodes = [];
    const pincodeInt = parseInt(pincode);

    // Generate nearby serviceable pincodes
    for (let i = -10; i <= 10; i++) {
      const nearbyPincode = pincodeInt + i;
      if (nearbyPincode > 100000 && nearbyPincode < 999999) {
        const nearbyInfo = this.getDeliveryInfoByPincode(nearbyPincode.toString());
        if (nearbyInfo.available) {
          nearbyPincodes.push({
            pincode: nearbyPincode.toString(),
            city: nearbyInfo.city,
            estimatedDays: nearbyInfo.estimatedDays
          });
        }
      }
    }

    return nearbyPincodes.slice(0, 5); // Return top 5 suggestions
  },

  // Check if express delivery is available
  isExpressDeliveryAvailable(pincode, orderValue = 0) {
    const deliveryInfo = this.getDeliveryInfoByPincode(pincode);
    
    if (!deliveryInfo.available || !deliveryInfo.expressDelivery) {
      return {
        available: false,
        reason: 'Express delivery not available for this location'
      };
    }

    // Express delivery minimum order value
    const expressMinimum = 1000;
    if (orderValue < expressMinimum) {
      return {
        available: false,
        reason: `Minimum order value of ₹${expressMinimum} required for express delivery`,
        minimum: expressMinimum
      };
    }

    return {
      available: true,
      estimatedDays: Math.max(1, deliveryInfo.estimatedDays - 1),
      additionalCharges: deliveryInfo.zone === 'metro' ? 50 : 100
    };
  },

  // Get delivery slots for a given date
  getDeliverySlots(deliveryDate, pincode) {
    const deliveryInfo = this.getDeliveryInfoByPincode(pincode);
    
    if (!deliveryInfo.available) {
      return [];
    }

    const slots = [];
    
    if (deliveryInfo.zone === 'metro') {
      slots.push(
        { id: '1', time: '9:00 AM - 12:00 PM', available: true },
        { id: '2', time: '12:00 PM - 3:00 PM', available: true },
        { id: '3', time: '3:00 PM - 6:00 PM', available: true },
        { id: '4', time: '6:00 PM - 9:00 PM', available: true }
      );
    } else {
      slots.push(
        { id: '1', time: '10:00 AM - 2:00 PM', available: true },
        { id: '2', time: '2:00 PM - 6:00 PM', available: true }
      );
    }

    return slots;
  },

  // Track delivery status
  async trackDelivery(orderId, trackingNumber) {
    try {
      // This would integrate with actual courier API
      // For now, return mock tracking data
      const trackingStatuses = [
        'Order Confirmed',
        'Picked Up',
        'In Transit',
        'Out for Delivery',
        'Delivered'
      ];

      // Simulate tracking progress based on order age
      const mockStatus = {
        trackingNumber,
        currentStatus: 'In Transit',
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        timeline: [
          {
            status: 'Order Confirmed',
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            location: 'Warehouse'
          },
          {
            status: 'Picked Up',
            timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            location: 'Local Hub'
          },
          {
            status: 'In Transit',
            timestamp: new Date().toISOString(),
            location: 'Regional Hub'
          }
        ]
      };

      return {
        success: true,
        tracking: mockStatus
      };

    } catch (error) {
      console.error('Track delivery error:', error);
      return {
        success: false,
        error: 'Unable to track delivery'
      };
    }
  }
};

module.exports = { deliveryETA };
