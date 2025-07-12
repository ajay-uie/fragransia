const { db, admin } = require('../auth/firebaseConfig');

// Collection references
const collections = {
  users: db.collection('users'),
  products: db.collection('products'),
  categories: db.collection('categories'),
  orders: db.collection('orders'),
  coupons: db.collection('coupons'),
  reviews: db.collection('reviews'),
  blogPosts: db.collection('blog_posts'),
  userSessions: db.collection('user_sessions'),
  adminActivity: db.collection('admin_activity'),
  userActivity: db.collection('user_activity'),
  whatsappMessages: db.collection('whatsapp_messages'),
  emailLogs: db.collection('email_logs'),
  auditLogs: db.collection('audit_logs'),
  siteSettings: db.collection('site_settings'),
  popups: db.collection('popups'),
  banners: db.collection('banners'),
  inventory: db.collection('inventory'),
  wishlist: db.collection('wishlist'),
  cart: db.collection('cart'),
  addresses: db.collection('addresses')
};

// Utility functions for common operations
const firestoreUtils = {
  
  // Create document with auto-generated ID
  async create(collectionName, data) {
    try {
      const docRef = await collections[collectionName].add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        id: docRef.id,
        success: true
      };
    } catch (error) {
      console.error(`Error creating document in ${collectionName}:`, error);
      throw error;
    }
  },

  // Create document with specific ID
  async createWithId(collectionName, id, data) {
    try {
      await collections[collectionName].doc(id).set({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        id,
        success: true
      };
    } catch (error) {
      console.error(`Error creating document with ID in ${collectionName}:`, error);
      throw error;
    }
  },

  // Get document by ID
  async getById(collectionName, id) {
    try {
      const doc = await collections[collectionName].doc(id).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      console.error(`Error getting document from ${collectionName}:`, error);
      throw error;
    }
  },

  // Update document
  async update(collectionName, id, data) {
    try {
      await collections[collectionName].doc(id).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        id,
        success: true
      };
    } catch (error) {
      console.error(`Error updating document in ${collectionName}:`, error);
      throw error;
    }
  },

  // Delete document
  async delete(collectionName, id) {
    try {
      await collections[collectionName].doc(id).delete();
      
      return {
        id,
        success: true
      };
    } catch (error) {
      console.error(`Error deleting document from ${collectionName}:`, error);
      throw error;
    }
  },

  // Get multiple documents with query
  async getWhere(collectionName, field, operator, value, orderBy = null, limit = null) {
    try {
      let query = collections[collectionName].where(field, operator, value);
      
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const snapshot = await query.get();
      
      const documents = [];
      snapshot.forEach(doc => {
        documents.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return documents;
    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      throw error;
    }
  },

  // Get all documents from collection
  async getAll(collectionName, orderBy = null, limit = null) {
    try {
      let query = collections[collectionName];
      
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const snapshot = await query.get();
      
      const documents = [];
      snapshot.forEach(doc => {
        documents.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return documents;
    } catch (error) {
      console.error(`Error getting all documents from ${collectionName}:`, error);
      throw error;
    }
  },

  // Paginated query
  async getPaginated(collectionName, pageSize = 20, lastDoc = null, orderBy = 'createdAt') {
    try {
      let query = collections[collectionName].orderBy(orderBy, 'desc').limit(pageSize);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      
      const snapshot = await query.get();
      
      const documents = [];
      let lastVisible = null;
      
      snapshot.forEach(doc => {
        documents.push({
          id: doc.id,
          ...doc.data()
        });
        lastVisible = doc;
      });
      
      return {
        documents,
        lastVisible,
        hasMore: documents.length === pageSize
      };
    } catch (error) {
      console.error(`Error getting paginated documents from ${collectionName}:`, error);
      throw error;
    }
  },

  // Batch operations
  async batchWrite(operations) {
    try {
      const batch = db.batch();
      
      operations.forEach(operation => {
        const { type, collection, id, data } = operation;
        const docRef = collections[collection].doc(id);
        
        switch (type) {
          case 'set':
            batch.set(docRef, {
              ...data,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            break;
          case 'update':
            batch.update(docRef, {
              ...data,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            break;
          case 'delete':
            batch.delete(docRef);
            break;
        }
      });
      
      await batch.commit();
      
      return {
        success: true,
        operationsCount: operations.length
      };
    } catch (error) {
      console.error('Error executing batch write:', error);
      throw error;
    }
  },

  // Transaction wrapper
  async runTransaction(transactionFunction) {
    try {
      return await db.runTransaction(transactionFunction);
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  },

  // Search functionality
  async search(collectionName, searchFields, searchTerm, limit = 20) {
    try {
      const searchTermLower = searchTerm.toLowerCase();
      const documents = [];
      
      // This is a simple search implementation
      // For more advanced search, consider using Algolia or Elasticsearch
      for (const field of searchFields) {
        const query = collections[collectionName]
          .where(field, '>=', searchTermLower)
          .where(field, '<=', searchTermLower + '\uf8ff')
          .limit(limit);
          
        const snapshot = await query.get();
        
        snapshot.forEach(doc => {
          const docData = { id: doc.id, ...doc.data() };
          // Avoid duplicates
          if (!documents.find(d => d.id === doc.id)) {
            documents.push(docData);
          }
        });
      }
      
      return documents.slice(0, limit);
    } catch (error) {
      console.error(`Error searching ${collectionName}:`, error);
      throw error;
    }
  },

  // Count documents in collection
  async count(collectionName, whereClause = null) {
    try {
      let query = collections[collectionName];
      
      if (whereClause) {
        query = query.where(whereClause.field, whereClause.operator, whereClause.value);
      }
      
      const snapshot = await query.get();
      return snapshot.size;
    } catch (error) {
      console.error(`Error counting documents in ${collectionName}:`, error);
      throw error;
    }
  }
};

module.exports = {
  db,
  collections,
  firestoreUtils,
  admin
};
