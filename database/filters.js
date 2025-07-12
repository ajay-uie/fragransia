const admin = require('firebase-admin');

// Get filter options for products
const getProductFilters = async (req, res) => {
  try {
    const { category } = req.query;
    const db = admin.firestore();

    let productsQuery = db.collection('products').where('isActive', '==', true);
    
    // Filter by category if provided
    if (category) {
      productsQuery = productsQuery.where('category', '==', category);
    }

    const productsSnapshot = await productsQuery.get();
    
    // Collect filter data
    const brands = new Set();
    const concentrations = new Set();
    const volumes = new Set();
    const tags = new Set();
    let minPrice = Infinity;
    let maxPrice = 0;

    productsSnapshot.forEach(doc => {
      const product = doc.data();
      
      if (product.brand) brands.add(product.brand);
      if (product.concentration) concentrations.add(product.concentration);
      if (product.volume) volumes.add(product.volume);
      if (product.tags) product.tags.forEach(tag => tags.add(tag));
      
      if (product.price) {
        minPrice = Math.min(minPrice, product.price);
        maxPrice = Math.max(maxPrice, product.price);
      }
    });

    // Get categories
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
        productCount: categoryData.productCount || 0,
        parentCategory: categoryData.parentCategory
      });
    });

    res.status(200).json({
      success: true,
      filters: {
        categories: buildCategoryTree(categories),
        brands: Array.from(brands).sort(),
        concentrations: Array.from(concentrations).sort(),
        volumes: Array.from(volumes).sort((a, b) => a - b),
        tags: Array.from(tags).sort(),
        priceRange: {
          min: minPrice === Infinity ? 0 : minPrice,
          max: maxPrice
        }
      }
    });

  } catch (error) {
    console.error('Get product filters error:', error);
    res.status(500).json({
      error: 'Failed to fetch filters',
      message: error.message
    });
  }
};

// Get search suggestions
const getSearchSuggestions = async (req, res) => {
  try {
    const { query: searchQuery, limit = 10 } = req.query;

    if (!searchQuery || searchQuery.length < 2) {
      return res.status(400).json({
        error: 'Invalid search query',
        message: 'Search query must be at least 2 characters long'
      });
    }

    const db = admin.firestore();
    const searchTerm = searchQuery.toLowerCase();
    
    // Search in products
    const productsQuery = await db.collection('products')
      .where('isActive', '==', true)
      .get();

    const suggestions = [];
    const seenSuggestions = new Set();

    productsQuery.forEach(doc => {
      const product = doc.data();
      
      // Check product name
      if (product.name.toLowerCase().includes(searchTerm)) {
        const suggestion = {
          type: 'product',
          text: product.name,
          id: doc.id,
          image: product.images?.[0] || null,
          price: product.price
        };
        
        if (!seenSuggestions.has(suggestion.text)) {
          suggestions.push(suggestion);
          seenSuggestions.add(suggestion.text);
        }
      }

      // Check brand
      if (product.brand && product.brand.toLowerCase().includes(searchTerm)) {
        const suggestion = {
          type: 'brand',
          text: product.brand,
          filter: { brand: product.brand }
        };
        
        if (!seenSuggestions.has(suggestion.text)) {
          suggestions.push(suggestion);
          seenSuggestions.add(suggestion.text);
        }
      }

      // Check tags
      if (product.tags) {
        product.tags.forEach(tag => {
          if (tag.toLowerCase().includes(searchTerm)) {
            const suggestion = {
              type: 'tag',
              text: tag,
              filter: { tag }
            };
            
            if (!seenSuggestions.has(suggestion.text)) {
              suggestions.push(suggestion);
              seenSuggestions.add(suggestion.text);
            }
          }
        });
      }
    });

    // Search in categories
    const categoriesQuery = await db.collection('categories')
      .where('isActive', '==', true)
      .get();

    categoriesQuery.forEach(doc => {
      const category = doc.data();
      
      if (category.name.toLowerCase().includes(searchTerm)) {
        const suggestion = {
          type: 'category',
          text: category.name,
          id: doc.id,
          filter: { category: doc.id }
        };
        
        if (!seenSuggestions.has(suggestion.text)) {
          suggestions.push(suggestion);
          seenSuggestions.add(suggestion.text);
        }
      }
    });

    // Sort suggestions by relevance and limit
    const sortedSuggestions = suggestions
      .sort((a, b) => {
        // Prioritize exact matches
        const aExact = a.text.toLowerCase() === searchTerm;
        const bExact = b.text.toLowerCase() === searchTerm;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then prioritize starts with
        const aStartsWith = a.text.toLowerCase().startsWith(searchTerm);
        const bStartsWith = b.text.toLowerCase().startsWith(searchTerm);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        // Finally alphabetical
        return a.text.localeCompare(b.text);
      })
      .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      suggestions: sortedSuggestions,
      query: searchQuery
    });

  } catch (error) {
    console.error('Get search suggestions error:', error);
    res.status(500).json({
      error: 'Failed to fetch search suggestions',
      message: error.message
    });
  }
};

// Get trending searches
const getTrendingSearches = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const db = admin.firestore();

    // Get search analytics from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const searchAnalyticsQuery = await db.collection('search_analytics')
      .where('timestamp', '>=', thirtyDaysAgo)
      .get();

    const searchCounts = {};

    searchAnalyticsQuery.forEach(doc => {
      const data = doc.data();
      const query = data.query.toLowerCase().trim();
      
      if (query.length >= 2) {
        searchCounts[query] = (searchCounts[query] || 0) + 1;
      }
    });

    // Sort by frequency and get top searches
    const trendingSearches = Object.entries(searchCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, parseInt(limit))
      .map(([query, count]) => ({
        query,
        count
      }));

    // If no analytics data, return some default trending terms
    if (trendingSearches.length === 0) {
      const defaultTrending = [
        { query: 'oud', count: 0 },
        { query: 'rose', count: 0 },
        { query: 'vanilla', count: 0 },
        { query: 'citrus', count: 0 },
        { query: 'gift set', count: 0 }
      ];
      
      res.status(200).json({
        success: true,
        trending: defaultTrending.slice(0, parseInt(limit))
      });
      return;
    }

    res.status(200).json({
      success: true,
      trending: trendingSearches
    });

  } catch (error) {
    console.error('Get trending searches error:', error);
    res.status(500).json({
      error: 'Failed to fetch trending searches',
      message: error.message
    });
  }
};

// Log search query for analytics
const logSearch = async (req, res) => {
  try {
    const { query, results, userId = null } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing search query'
      });
    }

    const db = admin.firestore();

    // Log search for analytics
    await db.collection('search_analytics').add({
      query: query.toLowerCase().trim(),
      resultsCount: results || 0,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Search logged successfully'
    });

  } catch (error) {
    console.error('Log search error:', error);
    res.status(500).json({
      error: 'Failed to log search',
      message: error.message
    });
  }
};

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

module.exports = {
  getProductFilters,
  getSearchSuggestions,
  getTrendingSearches,
  logSearch
};
