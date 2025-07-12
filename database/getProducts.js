const { auth, db, admin } = require("../auth/firebaseConfig");
const { firestoreUtils } = require("./firestore");

const getProducts = async (filters) => {
  try {
    const {
      category,
      subCategory,
      brand,
      minPrice,
      maxPrice,
      concentration,
      volume,
      tags,
      sort: sortBy = "createdAt",
      order: sortOrder = "desc",
      limit = 20,
      page = 1,
      search,
      featured,
      isActive: active = true,
      productId,
      includeInactive
    } = filters;

    let query = db.collection("products");

    if (productId) {
      const productDoc = await query.doc(productId).get();
      if (productDoc.exists) {
        return {
          success: true,
          products: [{
            id: productDoc.id,
            ...productDoc.data(),
            createdAt: productDoc.data().createdAt?.toDate()?.toISOString(),
            updatedAt: productDoc.data().updatedAt?.toDate()?.toISOString()
          }],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalProducts: 1,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      } else {
        return {
          success: false,
          message: "Product not found"
        };
      }
    }

    // Apply filters
    if (active !== undefined) {
      query = query.where("isActive", "==", active);
    }

    if (featured !== undefined) {
      query = query.where("isFeatured", "==", featured);
    }

    if (category) {
      query = query.where("category", "==", category);
    }

    if (subCategory) {
      query = query.where("subCategory", "==", subCategory);
    }

    if (brand) {
      query = query.where("brand", "==", brand);
    }

    if (concentration) {
      query = query.where("concentration", "==", concentration);
    }

    if (volume) {
      query = query.where("volume", "==", parseInt(volume));
    }

    if (tags && Array.isArray(tags)) {
      query = query.where("tags", "array-contains-any", tags);
    }

    // Apply sorting
    const validSortFields = ["createdAt", "price", "name", "averageRating", "totalSales"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? "asc" : "desc";

    query = query.orderBy(sortField, sortDirection);

    // Execute query
    const snapshot = await query.get();
    let products = [];

    snapshot.forEach(doc => {
      const productData = doc.data();

      // Apply price filtering in memory
      let includeProduct = true;

      if (minPrice && productData.price < parseFloat(minPrice)) {
        includeProduct = false;
      }

      if (maxPrice && productData.price > parseFloat(maxPrice)) {
        includeProduct = false;
      }

      // Apply search filtering
      if (search && includeProduct) {
        const searchTerm = search.toLowerCase();
        const searchableText = `${productData.name} ${productData.description} ${productData.brand} ${productData.tags?.join(" ")}`.toLowerCase();

        if (!searchableText.includes(searchTerm)) {
          includeProduct = false;
        }
      }

      if (includeProduct) {
        products.push({
          id: doc.id,
          ...productData,
          // Convert Firestore timestamps to ISO strings
          createdAt: productData.createdAt?.toDate()?.toISOString(),
          updatedAt: productData.updatedAt?.toDate()?.toISOString()
        });
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedProducts = products.slice(startIndex, endIndex);

    return {
      success: true,
      products: paginatedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(products.length / parseInt(limit)),
        totalProducts: products.length,
        hasNextPage: endIndex < products.length,
        hasPrevPage: parseInt(page) > 1
      }
    };

  } catch (error) {
    console.error("Get products error:", error);
    return {
      success: false,
      message: "Failed to fetch products",
      error: error.message
    };
  }
};

module.exports = { getProducts };

// The following functions are no longer needed here as they are now handled by the refactored getProducts
// const getProductById = async (req, res) => { ... };
// const getFeaturedProducts = async (req, res) => { ... };
// const getProductsByCategory = async (req, res) => { ... };
