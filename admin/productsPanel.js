const express = require('express');
const { auth, db, admin } = require('../auth/firebaseConfig');
const { requireAdminAuth } = require('../auth/adminAuthCheck');
const { generateID } = require('../utils/generateID');
const { validateInput } = require('../utils/validateInput');

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get all products for admin panel
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('products');

    // Apply filters
    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    if (status === 'active') {
      query = query.where('isActive', '==', true);
    } else if (status === 'inactive') {
      query = query.where('isActive', '==', false);
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'name', 'price', 'inventory', 'totalSales'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    let products = [];

    snapshot.forEach(doc => {
      const productData = doc.data();
      
      // Apply search filtering
      let includeProduct = true;
      if (search) {
        const searchTerm = search.toLowerCase();
        const searchableText = `${productData.name} ${productData.description} ${productData.brand} ${productData.sku}`.toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          includeProduct = false;
        }
      }

      if (includeProduct) {
        products.push({
          id: doc.id,
          name: productData.name,
          sku: productData.sku,
          price: productData.price,
          inventory: productData.inventory,
          category: productData.category,
          brand: productData.brand,
          isActive: productData.isActive,
          totalSales: productData.totalSales || 0,
          averageRating: productData.averageRating || 0,
          totalReviews: productData.totalReviews || 0,
          images: productData.images,
          status: productData.inventory === 0 ? 'Out of Stock' : 
                  productData.inventory <= 10 ? 'Low Stock' : 'In Stock',
          createdAt: productData.createdAt?.toDate()?.toISOString(),
          updatedAt: productData.updatedAt?.toDate()?.toISOString()
        });
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedProducts = products.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      products: paginatedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(products.length / parseInt(limit)),
        totalProducts: products.length,
        hasNextPage: endIndex < products.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get products for admin error:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

// Get single product for editing
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const productDoc = await db.collection('products').doc(productId).get();
    
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productData = productDoc.data();

    res.status(200).json({
      success: true,
      product: {
        id: productDoc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate()?.toISOString(),
        updatedAt: productData.updatedAt?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({
      error: 'Failed to fetch product',
      message: error.message
    });
  }
});

// Create new product
router.post('/', async (req, res) => {
  try {
    const productData = req.body;
    const userId = req.user.uid;

    // Validate required fields
    const requiredFields = ['name', 'price', 'category', 'brand'];
    const missingFields = requiredFields.filter(field => !productData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields
      });
    }

    // Generate product ID and SKU
    const productId = generateID.generateProductId();
    const sku = productData.sku || generateID.generateSKU(productData.name, productData.brand);

    // Check if SKU already exists
    const existingSKU = await db.collection('products').where('sku', '==', sku).get();
    if (!existingSKU.empty) {
      return res.status(400).json({
        error: 'SKU already exists',
        message: 'Please provide a unique SKU'
      });
    }

    // Prepare product object
    const product = {
      id: productId,
      name: productData.name,
      description: productData.description || '',
      price: parseFloat(productData.price),
      comparePrice: productData.comparePrice ? parseFloat(productData.comparePrice) : null,
      category: productData.category,
      brand: productData.brand,
      sku,
      inventory: parseInt(productData.inventory) || 0,
      weight: productData.weight ? parseFloat(productData.weight) : null,
      dimensions: productData.dimensions || null,
      images: productData.images || [],
      tags: productData.tags || [],
      isActive: productData.isActive !== false,
      isFeatured: productData.isFeatured || false,
      seo: {
        title: productData.seoTitle || productData.name,
        description: productData.seoDescription || productData.description,
        keywords: productData.seoKeywords || []
      },
      specifications: productData.specifications || {},
      variants: productData.variants || [],
      totalSales: 0,
      averageRating: 0,
      totalReviews: 0,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Save product
    await db.collection('products').doc(productId).set(product);

    // Update category product count
    if (productData.category) {
      await db.collection('categories').doc(productData.category).update({
        productCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'create_product',
      resourceType: 'product',
      resourceId: productId,
      details: {
        productName: productData.name,
        sku,
        category: productData.category
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId,
      product
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

// Update product
router.put('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const updateData = req.body;
    const userId = req.user.uid;

    // Check if product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentProduct = productDoc.data();

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Convert numeric fields
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.comparePrice) updateData.comparePrice = parseFloat(updateData.comparePrice);
    if (updateData.inventory !== undefined) updateData.inventory = parseInt(updateData.inventory);
    if (updateData.weight) updateData.weight = parseFloat(updateData.weight);

    // Check SKU uniqueness if being updated
    if (updateData.sku && updateData.sku !== currentProduct.sku) {
      const existingSKU = await db.collection('products')
        .where('sku', '==', updateData.sku)
        .get();
      
      if (!existingSKU.empty) {
        return res.status(400).json({
          error: 'SKU already exists',
          message: 'Please provide a unique SKU'
        });
      }
    }

    // Add update metadata
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedBy = userId;

    // Update product
    await db.collection('products').doc(productId).update(updateData);

    // Update category product count if category changed
    if (updateData.category && updateData.category !== currentProduct.category) {
      const batch = db.batch();
      
      // Decrease count for old category
      if (currentProduct.category) {
        const oldCategoryRef = db.collection('categories').doc(currentProduct.category);
        batch.update(oldCategoryRef, {
          productCount: admin.firestore.FieldValue.increment(-1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      // Increase count for new category
      const newCategoryRef = db.collection('categories').doc(updateData.category);
      batch.update(newCategoryRef, {
        productCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await batch.commit();
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_product',
      resourceType: 'product',
      resourceId: productId,
      details: {
        productName: updateData.name || currentProduct.name,
        updatedFields: Object.keys(updateData)
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      productId
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      error: 'Failed to update product',
      message: error.message
    });
  }
});

// Delete product (soft delete)
router.delete('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.uid;

    // Check if product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productDoc.data();

    // Check if product has active orders
    const activeOrdersQuery = await db.collection('orders')
      .where('items', 'array-contains-any', [{ productId }])
      .where('status', 'in', ['pending', 'confirmed', 'processing', 'shipped'])
      .limit(1)
      .get();

    if (!activeOrdersQuery.empty) {
      return res.status(400).json({
        error: 'Cannot delete product',
        message: 'Product has active orders. Please deactivate instead.'
      });
    }

    // Soft delete - mark as inactive and deleted
    await db.collection('products').doc(productId).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Update category product count
    if (product.category) {
      await db.collection('categories').doc(product.category).update({
        productCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_product',
      resourceType: 'product',
      resourceId: productId,
      details: {
        productName: product.name,
        sku: product.sku
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      productId
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      error: 'Failed to delete product',
      message: error.message
    });
  }
});

// Bulk update products
router.patch('/bulk', async (req, res) => {
  try {
    const { productIds, updateData, action } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid product IDs',
        message: 'Product IDs array is required'
      });
    }

    if (productIds.length > 100) {
      return res.status(400).json({
        error: 'Too many products',
        message: 'Maximum 100 products allowed per bulk operation'
      });
    }

    const batch = db.batch();
    const userId = req.user.uid;

    switch (action) {
      case 'activate':
        productIds.forEach(productId => {
          const productRef = db.collection('products').doc(productId);
          batch.update(productRef, {
            isActive: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      case 'deactivate':
        productIds.forEach(productId => {
          const productRef = db.collection('products').doc(productId);
          batch.update(productRef, {
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      case 'update':
        if (!updateData || Object.keys(updateData).length === 0) {
          return res.status(400).json({
            error: 'Update data required',
            message: 'Update data object is required for update action'
          });
        }

        // Convert numeric fields
        if (updateData.price) updateData.price = parseFloat(updateData.price);
        if (updateData.comparePrice) updateData.comparePrice = parseFloat(updateData.comparePrice);
        if (updateData.inventory !== undefined) updateData.inventory = parseInt(updateData.inventory);

        productIds.forEach(productId => {
          const productRef = db.collection('products').doc(productId);
          batch.update(productRef, {
            ...updateData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Action must be activate, deactivate, or update'
        });
    }

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: `bulk_${action}_products`,
      resourceType: 'product',
      details: {
        productIds,
        updateData: updateData || null,
        count: productIds.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      affectedProducts: productIds.length
    });

  } catch (error) {
    console.error('Bulk update products error:', error);
    res.status(500).json({
      error: 'Failed to perform bulk update',
      message: error.message
    });
  }
});

// Update product inventory
router.patch('/:productId/inventory', async (req, res) => {
  try {
    const { productId } = req.params;
    const { inventory, operation = 'set', reason = '' } = req.body;

    if (inventory === undefined || inventory < 0) {
      return res.status(400).json({
        error: 'Invalid inventory value',
        message: 'Inventory must be a non-negative number'
      });
    }

    const userId = req.user.uid;

    // Check if product exists
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentProduct = productDoc.data();
    let newInventory;

    switch (operation) {
      case 'set':
        newInventory = parseInt(inventory);
        break;
      case 'add':
        newInventory = (currentProduct.inventory || 0) + parseInt(inventory);
        break;
      case 'subtract':
        newInventory = Math.max(0, (currentProduct.inventory || 0) - parseInt(inventory));
        break;
      default:
        return res.status(400).json({
          error: 'Invalid operation',
          message: 'Operation must be set, add, or subtract'
        });
    }

    // Update inventory
    await db.collection('products').doc(productId).update({
      inventory: newInventory,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userId
    });

    // Log inventory change
    await db.collection('inventory_logs').add({
      productId,
      productName: currentProduct.name,
      sku: currentProduct.sku,
      previousInventory: currentProduct.inventory || 0,
      newInventory,
      operation,
      value: parseInt(inventory),
      reason,
      updatedBy: userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_inventory',
      resourceType: 'product',
      resourceId: productId,
      details: {
        productName: currentProduct.name,
        operation,
        previousInventory: currentProduct.inventory || 0,
        newInventory,
        reason
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      inventory: {
        previous: currentProduct.inventory || 0,
        current: newInventory,
        operation,
        value: parseInt(inventory)
      }
    });

  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({
      error: 'Failed to update inventory',
      message: error.message
    });
  }
});

// Get product statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const [
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts
    ] = await Promise.all([
      db.collection('products').get(),
      db.collection('products').where('isActive', '==', true).get(),
      db.collection('products').where('inventory', '<=', 10).where('inventory', '>', 0).get(),
      db.collection('products').where('inventory', '==', 0).get()
    ]);

    // Calculate total inventory value
    let totalInventoryValue = 0;
    let totalInventoryCount = 0;

    activeProducts.forEach(doc => {
      const product = doc.data();
      const inventoryValue = (product.inventory || 0) * (product.price || 0);
      totalInventoryValue += inventoryValue;
      totalInventoryCount += product.inventory || 0;
    });

    // Get top selling products
    const topSellingQuery = await db.collection('products')
      .where('isActive', '==', true)
      .orderBy('totalSales', 'desc')
      .limit(5)
      .get();

    const topSellingProducts = [];
    topSellingQuery.forEach(doc => {
      const product = doc.data();
      topSellingProducts.push({
        id: doc.id,
        name: product.name,
        sku: product.sku,
        sales: product.totalSales || 0,
        revenue: (product.totalSales || 0) * product.price,
        image: product.images?.[0] || null
      });
    });

    res.status(200).json({
      success: true,
      stats: {
        totalProducts: totalProducts.size,
        activeProducts: activeProducts.size,
        inactiveProducts: totalProducts.size - activeProducts.size,
        lowStockProducts: lowStockProducts.size,
        outOfStockProducts: outOfStockProducts.size,
        totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
        totalInventoryCount,
        averageProductValue: activeProducts.size > 0 ? 
          Math.round((totalInventoryValue / activeProducts.size) * 100) / 100 : 0,
        topSellingProducts
      }
    });

  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch product statistics',
      message: error.message
    });
  }
});

module.exports = router;
