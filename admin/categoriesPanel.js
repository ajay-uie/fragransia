const express = require('express');
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} = require('../database/categoryManager');
const { requireAdminAuth } = require('../auth/adminAuthCheck');

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get all categories
router.get('/', getAllCategories);

// Get category by ID
router.get('/:categoryId', getCategoryById);

// Create new category
router.post('/', createCategory);

// Update category
router.put('/:categoryId', updateCategory);

// Delete category
router.delete('/:categoryId', deleteCategory);

// Reorder categories
router.patch('/reorder', async (req, res) => {
  try {
    const { categoryOrders } = req.body;

    if (!categoryOrders || !Array.isArray(categoryOrders)) {
      return res.status(400).json({
        error: 'Invalid category orders',
        message: 'Category orders array is required'
      });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();
    const batch = db.batch();
    const userId = req.user.uid;

    // Update sort order for each category
    categoryOrders.forEach(({ categoryId, sortOrder }) => {
      const categoryRef = db.collection('categories').doc(categoryId);
      batch.update(categoryRef, {
        sortOrder: parseInt(sortOrder),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      });
    });

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'reorder_categories',
      resourceType: 'category',
      details: {
        categoryOrders
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Categories reordered successfully'
    });

  } catch (error) {
    console.error('Reorder categories error:', error);
    res.status(500).json({
      error: 'Failed to reorder categories',
      message: error.message
    });
  }
});

// Get category tree with product counts
router.get('/tree/overview', async (req, res) => {
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();

    // Get all categories
    const categoriesSnapshot = await db.collection('categories')
      .where('isActive', '==', true)
      .orderBy('sortOrder', 'asc')
      .get();

    const categories = [];
    categoriesSnapshot.forEach(doc => {
      const categoryData = doc.data();
      categories.push({
        id: doc.id,
        name: categoryData.name,
        parentCategory: categoryData.parentCategory,
        productCount: categoryData.productCount || 0,
        sortOrder: categoryData.sortOrder || 0
      });
    });

    // Build category tree
    const categoryTree = buildCategoryTree(categories);

    res.status(200).json({
      success: true,
      categoryTree
    });

  } catch (error) {
    console.error('Get category tree error:', error);
    res.status(500).json({
      error: 'Failed to fetch category tree',
      message: error.message
    });
  }
});

// Update category product counts
router.post('/update-counts', async (req, res) => {
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    const userId = req.user.uid;

    // Get all categories
    const categoriesSnapshot = await db.collection('categories').get();
    const batch = db.batch();

    for (const categoryDoc of categoriesSnapshot.docs) {
      const categoryId = categoryDoc.id;
      
      // Count products in this category
      const productsQuery = await db.collection('products')
        .where('category', '==', categoryId)
        .where('isActive', '==', true)
        .get();

      const productCount = productsQuery.size;

      // Update category product count
      batch.update(categoryDoc.ref, {
        productCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      });
    }

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_category_counts',
      resourceType: 'category',
      details: {
        categoriesUpdated: categoriesSnapshot.size
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Category product counts updated successfully',
      categoriesUpdated: categoriesSnapshot.size
    });

  } catch (error) {
    console.error('Update category counts error:', error);
    res.status(500).json({
      error: 'Failed to update category counts',
      message: error.message
    });
  }
});

// Helper function to build category tree
function buildCategoryTree(categories) {
  const categoryMap = {};
  const rootCategories = [];

  // Create a map of categories
  categories.forEach(category => {
    categoryMap[category.id] = { ...category, children: [] };
  });

  // Build the tree
  categories.forEach(category => {
    if (category.parentCategory && categoryMap[category.parentCategory]) {
      categoryMap[category.parentCategory].children.push(categoryMap[category.id]);
    } else {
      rootCategories.push(categoryMap[category.id]);
    }
  });

  return rootCategories;
}

module.exports = router;
