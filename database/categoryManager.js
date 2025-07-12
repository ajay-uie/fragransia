const { auth, db, admin } = require('../auth/firebaseConfig');
const { generateID } = require('../utils/generateID');

class CategoryManager {
  constructor() {
    this.db = db;
    this.auth = auth;
  }

  // Create new category
  async createCategory(categoryData, userId) {
    try {
      const { name, description, image, parentCategory, isActive = true, seoUrl } = categoryData;

      // Validate required fields
      if (!name) {
        throw new Error('Category name is required');
      }

      // Generate category ID
      const categoryId = generateID.generateCategoryId(name);

      // Check if category already exists
      const existingCategory = await this.db.collection('categories').doc(categoryId).get();
      if (existingCategory.exists) {
        throw new Error('Category with this name already exists');
      }

      // Validate parent category if provided
      if (parentCategory) {
        const parentDoc = await this.db.collection('categories').doc(parentCategory).get();
        if (!parentDoc.exists) {
          throw new Error('Parent category does not exist');
        }
      }

      // Generate SEO URL
      const seoFriendlyUrl = seoUrl || name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Create category object
      const category = {
        id: categoryId,
        name,
        description: description || '',
        image: image || null,
        parentCategory: parentCategory || null,
        isActive,
        productCount: 0,
        seo: {
          url: seoFriendlyUrl,
          title: name,
          description: description || `Shop ${name} perfumes at Fragransia`
        },
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Save category
      await this.db.collection('categories').doc(categoryId).set(category);

      // Update parent category's subcategory count if applicable
      if (parentCategory) {
        await this.db.collection('categories').doc(parentCategory).update({
          subcategoryCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Log admin activity
      await this.db.collection('admin_activity').add({
        userId,
        action: 'create_category',
        resourceType: 'category',
        resourceId: categoryId,
        details: {
          categoryName: name,
          parentCategory
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        categoryId,
        category
      };

    } catch (error) {
      console.error('Create category error:', error);
      throw error;
    }
  }

  // Update category
  async updateCategory(categoryId, updateData, userId) {
    try {
      const categoryDoc = await this.db.collection('categories').doc(categoryId).get();
      
      if (!categoryDoc.exists) {
        throw new Error('Category not found');
      }

      const currentCategory = categoryDoc.data();

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      // Update SEO URL if name changed
      if (updateData.name && updateData.name !== currentCategory.name) {
        updateData.seo = {
          ...currentCategory.seo,
          url: updateData.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''),
          title: updateData.name
        };
      }

      // Add update metadata
      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      updateData.updatedBy = userId;

      // Update category
      await this.db.collection('categories').doc(categoryId).update(updateData);

      // Log admin activity
      await this.db.collection('admin_activity').add({
        userId,
        action: 'update_category',
        resourceType: 'category',
        resourceId: categoryId,
        details: {
          updatedFields: Object.keys(updateData),
          categoryName: updateData.name || currentCategory.name
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        categoryId,
        message: 'Category updated successfully'
      };

    } catch (error) {
      console.error('Update category error:', error);
      throw error;
    }
  }

  // Delete category
  async deleteCategory(categoryId, userId) {
    try {
      const categoryDoc = await this.db.collection('categories').doc(categoryId).get();
      
      if (!categoryDoc.exists) {
        throw new Error('Category not found');
      }

      const category = categoryDoc.data();

      // Check if category has products
      const productsQuery = await this.db.collection('products')
        .where('category', '==', categoryId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!productsQuery.empty) {
        throw new Error('Cannot delete category with active products');
      }

      // Check if category has subcategories
      const subcategoriesQuery = await this.db.collection('categories')
        .where('parentCategory', '==', categoryId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!subcategoriesQuery.empty) {
        throw new Error('Cannot delete category with active subcategories');
      }

      // Soft delete - mark as inactive
      await this.db.collection('categories').doc(categoryId).update({
        isActive: false,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedBy: userId
      });

      // Update parent category's subcategory count if applicable
      if (category.parentCategory) {
        await this.db.collection('categories').doc(category.parentCategory).update({
          subcategoryCount: admin.firestore.FieldValue.increment(-1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Log admin activity
      await this.db.collection('admin_activity').add({
        userId,
        action: 'delete_category',
        resourceType: 'category',
        resourceId: categoryId,
        details: {
          categoryName: category.name
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Category deleted successfully',
        categoryId
      };

    } catch (error) {
      console.error('Delete category error:', error);
      throw error;
    }
  }

  // Get all categories
  async getCategories(includeInactive = false) {
    try {
      let query = this.db.collection('categories');
      
      if (!includeInactive) {
        query = query.where('isActive', '==', true);
      }

      query = query.orderBy('name', 'asc');

      const snapshot = await query.get();
      const categories = [];

      snapshot.forEach(doc => {
        const categoryData = doc.data();
        categories.push({
          id: doc.id,
          ...categoryData,
          createdAt: categoryData.createdAt?.toDate()?.toISOString(),
          updatedAt: categoryData.updatedAt?.toDate()?.toISOString()
        });
      });

      // Organize into hierarchy
      const hierarchy = this.buildCategoryHierarchy(categories);

      return {
        success: true,
        categories,
        hierarchy
      };

    } catch (error) {
      console.error('Get categories error:', error);
      throw error;
    }
  }

  // Get category by ID
  async getCategoryById(categoryId) {
    try {
      const categoryDoc = await this.db.collection('categories').doc(categoryId).get();
      
      if (!categoryDoc.exists) {
        throw new Error('Category not found');
      }

      const category = categoryDoc.data();

      // Get subcategories
      const subcategoriesQuery = await this.db.collection('categories')
        .where('parentCategory', '==', categoryId)
        .where('isActive', '==', true)
        .orderBy('name', 'asc')
        .get();

      const subcategories = [];
      subcategoriesQuery.forEach(doc => {
        subcategories.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        category: {
          id: categoryId,
          ...category,
          createdAt: category.createdAt?.toDate()?.toISOString(),
          updatedAt: category.updatedAt?.toDate()?.toISOString(),
          subcategories
        }
      };

    } catch (error) {
      console.error('Get category by ID error:', error);
      throw error;
    }
  }

  // Build category hierarchy
  buildCategoryHierarchy(categories) {
    const categoryMap = new Map();
    const rootCategories = [];

    // Create map for quick lookup
    categories.forEach(category => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    // Build hierarchy
    categories.forEach(category => {
      if (category.parentCategory) {
        const parent = categoryMap.get(category.parentCategory);
        if (parent) {
          parent.children.push(categoryMap.get(category.id));
        }
      } else {
        rootCategories.push(categoryMap.get(category.id));
      }
    });

    return rootCategories;
  }

  // Get category statistics
  async getCategoryStats() {
    try {
      const categoriesQuery = await this.db.collection('categories')
        .where('isActive', '==', true)
        .get();

      let totalCategories = 0;
      let totalProducts = 0;
      const categoryStats = [];

      categoriesQuery.forEach(doc => {
        const category = doc.data();
        totalCategories++;
        totalProducts += category.productCount || 0;

        categoryStats.push({
          id: doc.id,
          name: category.name,
          productCount: category.productCount || 0,
          subcategoryCount: category.subcategoryCount || 0
        });
      });

      // Sort by product count
      categoryStats.sort((a, b) => b.productCount - a.productCount);

      return {
        success: true,
        stats: {
          totalCategories,
          totalProducts,
          averageProductsPerCategory: totalCategories > 0 ? totalProducts / totalCategories : 0,
          topCategories: categoryStats.slice(0, 10)
        }
      };

    } catch (error) {
      console.error('Get category stats error:', error);
      throw error;
    }
  }

  // Update product count for category
  async updateProductCount(categoryId, increment = 1) {
    try {
      await this.db.collection('categories').doc(categoryId).update({
        productCount: admin.firestore.FieldValue.increment(increment),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Product count updated'
      };

    } catch (error) {
      console.error('Update product count error:', error);
      throw error;
    }
  }
}

module.exports = new CategoryManager();
