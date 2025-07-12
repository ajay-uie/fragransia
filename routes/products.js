const express = require('express');
const { body, validationResult, query } = require('express-validator');
const admin = require('firebase-admin');
const router = express.Router();

const db = admin.firestore();

// Get all products with filtering and pagination
router.get('/', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('category').optional().isString(),
  query('minPrice').optional().isFloat({ min: 0 }),
  query('maxPrice').optional().isFloat({ min: 0 }),
  query('search').optional().isString(),
  query('sortBy').optional().isIn(['name', 'price', 'createdAt', 'rating']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      limit = 20,
      page = 1,
      category,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive = 'true',
      isFeatured
    } = req.query;

    let query = db.collection('products');

    // Apply filters
    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    if (isFeatured !== undefined) {
      query = query.where('isFeatured', '==', isFeatured === 'true');
    }

    // Apply sorting
    query = query.orderBy(sortBy, sortOrder);

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(parseInt(limit));

    const snapshot = await query.get();
    let products = [];

    snapshot.forEach(doc => {
      const productData = doc.data();

      // Apply price filters
      if (minPrice && productData.price < parseFloat(minPrice)) return;
      if (maxPrice && productData.price > parseFloat(maxPrice)) return;

      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        const nameMatch = productData.name.toLowerCase().includes(searchTerm);
        const descMatch = productData.description?.toLowerCase().includes(searchTerm);
        const brandMatch = productData.brand?.toLowerCase().includes(searchTerm);
        if (!nameMatch && !descMatch && !brandMatch) return;
      }

      products.push({
        id: doc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      });
    });

    // Get total count for pagination
    let countQuery = db.collection('products');
    if (category && category !== 'all') {
      countQuery = countQuery.where('category', '==', category);
    }
    if (isActive !== undefined) {
      countQuery = countQuery.where('isActive', '==', isActive === 'true');
    }

    const countSnapshot = await countQuery.get();
    const totalProducts = countSnapshot.size;
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        category,
        minPrice,
        maxPrice,
        search,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const productDoc = await db.collection('products').doc(id).get();

    if (!productDoc.exists) {
      return res.status(404).json({
        error: 'Product not found',
        message: 'The requested product does not exist'
      });
    }

    const productData = productDoc.data();

    // Get related products (same category, excluding current product)
    const relatedQuery = await db.collection('products')
      .where('category', '==', productData.category)
      .where('isActive', '==', true)
      .limit(4)
      .get();

    const relatedProducts = [];
    relatedQuery.forEach(doc => {
      if (doc.id !== id) {
        relatedProducts.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        });
      }
    });

    res.json({
      success: true,
      product: {
        id: productDoc.id,
        ...productData,
        createdAt: productData.createdAt?.toDate(),
        updatedAt: productData.updatedAt?.toDate()
      },
      relatedProducts: relatedProducts.slice(0, 3)
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      error: 'Failed to fetch product',
      message: error.message
    });
  }
});

// Get product categories
router.get('/categories/list', async (req, res) => {
  try {
    const snapshot = await db.collection('categories')
      .where('isActive', '==', true)
      .orderBy('name')
      .get();

    const categories = [];
    snapshot.forEach(doc => {
      categories.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      });
    });

    res.json({
      success: true,
      categories,
      count: categories.length
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
});

// Get featured products
router.get('/featured/list', async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const snapshot = await db.collection('products')
      .where('isFeatured', '==', true)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const products = [];
    snapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      });
    });

    res.json({
      success: true,
      products,
      count: products.length
    });

  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({
      error: 'Failed to fetch featured products',
      message: error.message
    });
  }
});

// Search products
router.get('/search/query', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { q: searchQuery, limit = 20 } = req.query;
    const searchTerm = searchQuery.toLowerCase();

    // Get all active products for client-side filtering
    // In production, consider using Algolia or Elasticsearch for better search
    const snapshot = await db.collection('products')
      .where('isActive', '==', true)
      .limit(100)
      .get();

    const products = [];
    snapshot.forEach(doc => {
      const productData = doc.data();
      
      // Search in name, description, brand, and tags
      const nameMatch = productData.name.toLowerCase().includes(searchTerm);
      const descMatch = productData.description?.toLowerCase().includes(searchTerm);
      const brandMatch = productData.brand?.toLowerCase().includes(searchTerm);
      const tagsMatch = productData.tags?.some(tag => 
        tag.toLowerCase().includes(searchTerm)
      );

      if (nameMatch || descMatch || brandMatch || tagsMatch) {
        products.push({
          id: doc.id,
          ...productData,
          createdAt: productData.createdAt?.toDate(),
          updatedAt: productData.updatedAt?.toDate()
        });
      }
    });

    // Sort by relevance (name matches first, then description, etc.)
    products.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(searchTerm);
      const bNameMatch = b.name.toLowerCase().includes(searchTerm);
      
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      
      return 0;
    });

    const limitedProducts = products.slice(0, parseInt(limit));

    res.json({
      success: true,
      products: limitedProducts,
      query: searchQuery,
      totalResults: products.length,
      showing: limitedProducts.length
    });

  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

// Get product reviews
router.get('/:id/reviews', [
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('page').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;

    // Check if product exists
    const productDoc = await db.collection('products').doc(id).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    let query = db.collection('reviews')
      .where('productId', '==', id)
      .where('isApproved', '==', true)
      .orderBy('createdAt', 'desc');

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    if (offset > 0) {
      const offsetSnapshot = await query.limit(offset).get();
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(parseInt(limit));
    const snapshot = await query.get();

    const reviews = [];
    snapshot.forEach(doc => {
      reviews.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      });
    });

    // Get total count
    const countSnapshot = await db.collection('reviews')
      .where('productId', '==', id)
      .where('isApproved', '==', true)
      .get();

    const totalReviews = countSnapshot.size;
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReviews,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      error: 'Failed to fetch reviews',
      message: error.message
    });
  }
});

module.exports = router;

