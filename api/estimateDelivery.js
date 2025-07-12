const express = require('express');
const { deliveryETA } = require('../logic/deliveryETA');
const { validateInput } = require('../utils/validateInput');

const router = express.Router();

// Estimate delivery for a specific pincode
router.post('/', async (req, res) => {
  try {
    const { pincode, city, state, orderValue = 0 } = req.body;

    // Validate input
    if (!pincode) {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['pincode']
      });
    }

    // Validate pincode format
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({
        error: 'Invalid pincode format',
        message: 'Pincode must be 6 digits and cannot start with 0'
      });
    }

    // Calculate delivery estimate
    const deliveryEstimate = deliveryETA.calculateDelivery(pincode, city, state);

    // Check if delivery is available
    if (!deliveryEstimate.available) {
      return res.status(400).json({
        error: 'Delivery not available',
        message: 'We currently do not deliver to this location',
        pincode,
        suggestedPincodes: deliveryEstimate.suggestedPincodes || []
      });
    }

    // Calculate shipping charges based on order value
    let shippingCharges = deliveryEstimate.shippingCharges;
    let freeShipping = false;

    if (orderValue >= 500) {
      shippingCharges = 0;
      freeShipping = true;
    }

    // Calculate estimated delivery date
    const today = new Date();
    const estimatedDate = new Date(today);
    estimatedDate.setDate(today.getDate() + deliveryEstimate.estimatedDays);

    // Format delivery window
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + deliveryEstimate.minDays);
    
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + deliveryEstimate.maxDays);

    res.status(200).json({
      success: true,
      delivery: {
        pincode,
        city: deliveryEstimate.city || city,
        state: deliveryEstimate.state || state,
        zone: deliveryEstimate.zone,
        estimatedDays: deliveryEstimate.estimatedDays,
        minDays: deliveryEstimate.minDays,
        maxDays: deliveryEstimate.maxDays,
        estimatedDate: estimatedDate.toISOString(),
        deliveryWindow: {
          from: minDate.toISOString(),
          to: maxDate.toISOString(),
          formatted: `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`
        },
        shippingCharges,
        originalShippingCharges: deliveryEstimate.shippingCharges,
        freeShipping,
        freeShippingThreshold: 500,
        cashOnDelivery: deliveryEstimate.cashOnDelivery,
        available: deliveryEstimate.available,
        serviceType: deliveryEstimate.serviceType || 'standard'
      },
      message: freeShipping ? 
        'Free shipping available!' : 
        `Shipping charges: ₹${shippingCharges}. Free shipping on orders above ₹500`
    });

  } catch (error) {
    console.error('Delivery estimation error:', error);
    res.status(500).json({
      error: 'Failed to estimate delivery',
      message: error.message
    });
  }
});

// Check if pincode is serviceable
router.get('/check/:pincode', async (req, res) => {
  try {
    const { pincode } = req.params;

    // Validate pincode format
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({
        error: 'Invalid pincode format',
        message: 'Pincode must be 6 digits and cannot start with 0'
      });
    }

    // Check serviceability
    const deliveryEstimate = deliveryETA.calculateDelivery(pincode);

    res.status(200).json({
      success: true,
      pincode,
      serviceable: deliveryEstimate.available,
      zone: deliveryEstimate.zone,
      estimatedDays: deliveryEstimate.estimatedDays,
      cashOnDelivery: deliveryEstimate.cashOnDelivery,
      message: deliveryEstimate.available ? 
        'Delivery available to this location' : 
        'Delivery not available to this location'
    });

  } catch (error) {
    console.error('Pincode check error:', error);
    res.status(500).json({
      error: 'Failed to check pincode serviceability',
      message: error.message
    });
  }
});

// Get delivery zones and charges
router.get('/zones', async (req, res) => {
  try {
    const deliveryZones = deliveryETA.getDeliveryZones();

    res.status(200).json({
      success: true,
      zones: deliveryZones,
      freeShippingThreshold: 500,
      message: 'Delivery zones and charges'
    });

  } catch (error) {
    console.error('Get delivery zones error:', error);
    res.status(500).json({
      error: 'Failed to fetch delivery zones',
      message: error.message
    });
  }
});

// Bulk pincode check
router.post('/bulk-check', async (req, res) => {
  try {
    const { pincodes } = req.body;

    if (!Array.isArray(pincodes) || pincodes.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Pincodes must be a non-empty array'
      });
    }

    if (pincodes.length > 100) {
      return res.status(400).json({
        error: 'Too many pincodes',
        message: 'Maximum 100 pincodes allowed per request'
      });
    }

    const results = [];
    const pincodeRegex = /^[1-9][0-9]{5}$/;

    for (const pincode of pincodes) {
      if (!pincodeRegex.test(pincode)) {
        results.push({
          pincode,
          serviceable: false,
          error: 'Invalid pincode format'
        });
        continue;
      }

      try {
        const deliveryEstimate = deliveryETA.calculateDelivery(pincode);
        results.push({
          pincode,
          serviceable: deliveryEstimate.available,
          zone: deliveryEstimate.zone,
          estimatedDays: deliveryEstimate.estimatedDays,
          shippingCharges: deliveryEstimate.shippingCharges,
          cashOnDelivery: deliveryEstimate.cashOnDelivery
        });
      } catch (error) {
        results.push({
          pincode,
          serviceable: false,
          error: 'Processing error'
        });
      }
    }

    const serviceableCount = results.filter(r => r.serviceable).length;

    res.status(200).json({
      success: true,
      results,
      summary: {
        total: pincodes.length,
        serviceable: serviceableCount,
        nonServiceable: pincodes.length - serviceableCount
      }
    });

  } catch (error) {
    console.error('Bulk pincode check error:', error);
    res.status(500).json({
      error: 'Failed to process bulk pincode check',
      message: error.message
    });
  }
});

module.exports = router;
