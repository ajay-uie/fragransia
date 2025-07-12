const { auth, db, admin } = require("../auth/firebaseConfig");
const { validateInput } = require("../utils/validateInput");
const { generateID } = require("../utils/generateID");
const { compressImage } = require("../utils/compressImage");

const addProduct = async (productData, userId) => {
  try {
    const {
      name,
      description,
      price,
      comparePrice,
      category,
      subCategory,
      brand,
      fragrance,
      volume,
      concentration,
      notes,
      images,
      inventory,
      sku,
      weight,
      dimensions,
      isActive,
      isFeatured,
      tags,
      metaTitle,
      metaDescription,
      seoUrl
    } = productData;

    // Validate required fields
    const validation = validateInput.validateProduct({
      name,
      description,
      price,
      category,
      inventory
    });

    if (!validation.isValid) {
      return { success: false, message: "Validation failed", errors: validation.errors, statusCode: 400 };
    }

    // Generate product ID if not provided
    const productId = sku || generateID.generateProductId();

    // Check if product with same SKU exists
    const existingProduct = await db.collection("products").doc(productId).get();
    if (existingProduct.exists) {
      return { success: false, message: "Product already exists", statusCode: 409 };
    }

    // Verify category exists
    const categoryDoc = await db.collection("categories").doc(category).get();
    if (!categoryDoc.exists) {
      return { success: false, message: "Category does not exist", statusCode: 400 };
    }

    // Process images (compress and validate)
    const processedImages = [];
    if (images && images.length > 0) {
      for (const image of images) {
        try {
          const compressedImage = await compressImage.compress(image);
          processedImages.push(compressedImage);
        } catch (error) {
          console.error("Image compression error:", error);
          // Use original image if compression fails
          processedImages.push(image);
        }
      }
    }

    // Calculate SEO URL if not provided
    const seoFriendlyUrl = seoUrl || name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Prepare product data
    const newProductData = {
      id: productId,
      name,
      description,
      price: parseFloat(price),
      comparePrice: comparePrice ? parseFloat(comparePrice) : null,
      category,
      subCategory: subCategory || null,
      brand: brand || "Fragransia",
      fragrance: {
        type: fragrance?.type || null,
        intensity: fragrance?.intensity || null,
        longevity: fragrance?.longevity || null,
        sillage: fragrance?.sillage || null
      },
      volume: volume || null,
      concentration: concentration || null,
      notes: {
        top: notes?.top || [],
        middle: notes?.middle || [],
        base: notes?.base || []
      },
      images: processedImages,
      inventory: parseInt(inventory),
      sku: productId,
      weight: weight ? parseFloat(weight) : null,
      dimensions: {
        length: dimensions?.length ? parseFloat(dimensions.length) : null,
        width: dimensions?.width ? parseFloat(dimensions.width) : null,
        height: dimensions?.height ? parseFloat(dimensions.height) : null
      },
      isActive: isActive !== false,
      isFeatured: isFeatured === true,
      tags: tags || [],
      averageRating: 0,
      totalReviews: 0,
      totalSales: 0,
      views: 0,
      seo: {
        title: metaTitle || name,
        description: metaDescription || description,
        url: seoFriendlyUrl,
        keywords: tags || []
      },
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Save product to database
    await db.collection("products").doc(productId).set(newProductData);

    // Update category product count
    await db.collection("categories").doc(category).update({
      productCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log admin activity
    await db.collection("admin_activity").add({
      userId,
      action: "create_product",
      resourceType: "product",
      resourceId: productId,
      details: {
        productName: name,
        price,
        category
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: "Product created successfully",
      product: {
        id: productId,
        name,
        price,
        category,
        sku: productId,
        isActive: newProductData.isActive
      },
      statusCode: 201
    };

  } catch (error) {
    console.error("Add product error:", error);
    return { success: false, message: "Failed to create product", error: error.message, statusCode: 500 };
  }
};

// Update existing product
const updateProduct = async (productId, updateData, userId) => {
  try {
    // Check if product exists
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return { success: false, message: "Product not found", statusCode: 404 };
    }

    const currentProduct = productDoc.data();

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Process images if provided
    if (updateData.images) {
      const processedImages = [];
      for (const image of updateData.images) {
        try {
          const compressedImage = await compressImage.compress(image);
          processedImages.push(compressedImage);
        } catch (error) {
          console.error("Image compression error:", error);
          processedImages.push(image);
        }
      }
      updateData.images = processedImages;
    }

    // Update price-related fields
    if (updateData.price) {
      updateData.price = parseFloat(updateData.price);
    }
    if (updateData.comparePrice) {
      updateData.comparePrice = parseFloat(updateData.comparePrice);
    }

    // Update SEO URL if name changed
    if (updateData.name && updateData.name !== currentProduct.name) {
      updateData.seo = {
        ...currentProduct.seo,
        url: updateData.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      };
    }

    // Add update metadata
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedBy = userId;

    // Update product
    await db.collection("products").doc(productId).update(updateData);

    // Log admin activity
    await db.collection("admin_activity").add({
      userId,
      action: "update_product",
      resourceType: "product",
      resourceId: productId,
      details: {
        updatedFields: Object.keys(updateData),
        productName: updateData.name || currentProduct.name
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: "Product updated successfully",
      productId,
      statusCode: 200
    };

  } catch (error) {
    console.error("Update product error:", error);
    return { success: false, message: "Failed to update product", error: error.message, statusCode: 500 };
  }
};

// Delete product
const deleteProduct = async (productId, userId) => {
  try {
    // Check if product exists
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) {
      return { success: false, message: "Product not found", statusCode: 404 };
    }

    const product = productDoc.data();

    // Soft delete - mark as inactive instead of deleting
    await db.collection("products").doc(productId).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Update category product count
    if (product.category) {
      await db.collection("categories").doc(product.category).update({
        productCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log admin activity
    await db.collection("admin_activity").add({
      userId,
      action: "delete_product",
      resourceType: "product",
      resourceId: productId,
      details: {
        productName: product.name,
        category: product.category
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: "Product deleted successfully",
      productId,
      statusCode: 200
    };

  } catch (error) {
    console.error("Delete product error:", error);
    return { success: false, message: "Failed to delete product", error: error.message, statusCode: 500 };
  }
};

module.exports = {
  addProduct,
  updateProduct,
  deleteProduct
};
