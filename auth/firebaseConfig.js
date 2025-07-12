const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

let db, auth, storage, bucket;

// Mock data stores
const mockProducts = {
  "PROD-133793-F2KG": {
    id: "PROD-133793-F2KG",
    name: "Mock Product",
    price: 9.99,
    inventory: 100,
    images: ["mock-image-url"]
  }
};
const mockOrders = {};
const mockUsers = {
  "mock-uid": {
    uid: "mock-uid",
    email: "testuser@example.com",
    firstName: "Test",
    lastName: "User",
    phoneNumber: "9876543210",
    role: "user",
    isActive: true,
    emailVerified: true,
    preferences: {},
    addresses: [],
    wishlist: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};
const mockCoupons = {};
const mockTransactions = {};
const mockRefunds = {};

try {
  // Check if Firebase is already initialized
  if (admin.apps.length === 0) {
    // Initialize Firebase Admin SDK
    let credential;
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // Use service account key from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = admin.credential.cert(serviceAccount);
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      // Use individual environment variables
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      });
    } else {
      // For development/testing - use mock credentials
      console.warn("⚠️  Firebase credentials not found. Using mock configuration for testing.");
      
      // Create a mock Firebase app for testing
      const mockApp = {
        name: "[DEFAULT]",
        options: {
          projectId: "fragransia-test",
          credential: null
        }
      };

      // Mock Firestore
      db = {
        collection: (name) => ({
          doc: (id) => ({
            get: () => {
              if (name === "products") {
                return Promise.resolve({ exists: !!mockProducts[id], data: () => mockProducts[id] });
              } else if (name === "orders") {
                return Promise.resolve({ exists: !!mockOrders[id], data: () => mockOrders[id] });
              } else if (name === "users") {
                return Promise.resolve({ exists: !!mockUsers[id], data: () => mockUsers[id] });
              } else if (name === "coupons") {
                return Promise.resolve({ exists: !!mockCoupons[id], data: () => mockCoupons[id] });
              } else if (name === "transactions") {
                return Promise.resolve({ exists: !!mockTransactions[id], data: () => mockTransactions[id] });
              } else if (name === "refunds") {
                return Promise.resolve({ exists: !!mockRefunds[id], data: () => mockRefunds[id] });
              } else if (name === "categories") {
                return Promise.resolve({ exists: true, data: () => ({}) }); // Always exist for categories
              } else {
                return Promise.resolve({ exists: false, data: () => ({}) });
              }
            },
            set: (data) => {
              if (name === "products") mockProducts[id] = data;
              else if (name === "orders") mockOrders[id] = data;
              else if (name === "users") mockUsers[id] = data;
              else if (name === "coupons") mockCoupons[id] = data;
              else if (name === "transactions") mockTransactions[id] = data;
              else if (name === "refunds") mockRefunds[id] = data;
              return Promise.resolve();
            },
            update: (data) => {
              if (name === "products") mockProducts[id] = { ...mockProducts[id], ...data };
              else if (name === "orders") mockOrders[id] = { ...mockOrders[id], ...data };
              else if (name === "users") mockUsers[id] = { ...mockUsers[id], ...data };
              else if (name === "coupons") mockCoupons[id] = { ...mockCoupons[id], ...data };
              else if (name === "transactions") mockTransactions[id] = { ...mockTransactions[id], ...data };
              else if (name === "refunds") mockRefunds[id] = { ...mockRefunds[id], ...data };
              return Promise.resolve();
            },
            delete: () => {
              if (name === "products") delete mockProducts[id];
              else if (name === "orders") delete mockOrders[id];
              else if (name === "users") delete mockUsers[id];
              else if (name === "coupons") delete mockCoupons[id];
              else if (name === "transactions") delete mockTransactions[id];
              else if (name === "refunds") delete mockRefunds[id];
              return Promise.resolve();
            }
          }),
          add: (data) => {
            const newId = `mock-id-${Date.now()}`;
            if (name === "products") mockProducts[newId] = data;
            else if (name === "orders") mockOrders[newId] = data;
            else if (name === "users") mockUsers[newId] = data;
            else if (name === "coupons") mockCoupons[newId] = data;
            else if (name === "transactions") mockTransactions[newId] = data;
            else if (name === "refunds") mockRefunds[newId] = data;
            return Promise.resolve({ id: newId });
          },
          where: (field, op, value) => ({
            get: () => {
              let filteredDocs = [];
              if (name === "orders") {
                filteredDocs = Object.values(mockOrders).filter(order => {
                  if (op === "==" && order[field] === value) return true;
                  if (op === ">=" && order[field] >= value) return true;
                  if (op === "<=" && order[field] <= value) return true;
                  return false;
                });
              } else if (name === "transactions") {
                filteredDocs = Object.values(mockTransactions).filter(transaction => {
                  if (op === "==" && transaction[field] === value) return true;
                  if (op === ">=" && transaction[field] >= value) return true;
                  if (op === "<=" && transaction[field] <= value) return true;
                  return false;
                });
              }
              return Promise.resolve({ empty: filteredDocs.length === 0, size: filteredDocs.length, docs: filteredDocs.map(doc => ({ id: doc.id, data: () => doc })), forEach: (cb) => filteredDocs.map(doc => ({ id: doc.id, data: () => doc })).forEach(cb) });
            },
            orderBy: () => ({
              get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} }),
              limit: () => ({
                get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} })
              })
            }),
            limit: () => ({
              get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} })
            })
          }),
          orderBy: () => ({
            get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} }),
            limit: () => ({
              get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} })
            }),
            where: () => ({
              get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} })
            })
          }),
          get: () => Promise.resolve({ empty: true, size: 0, docs: [], forEach: () => {} })
        }),
        batch: () => ({
          _updates: [],
          set: (ref, data) => { this._updates.push({ type: "set", ref, data }); },
          update: (ref, data) => { this._updates.push({ type: "update", ref, data }); },
          delete: (ref) => { this._updates.push({ type: "delete", ref }); },
          commit: () => {
            this._updates.forEach(({ type, ref, data }) => {
              const collectionName = ref._path.segments[0];
              const docId = ref._path.segments[1];
              if (type === "set") {
                db.collection(collectionName).doc(docId).set(data);
              } else if (type === "update") {
                let currentData;
                if (collectionName === "products") currentData = mockProducts[docId];
                else if (collectionName === "orders") currentData = mockOrders[docId];
                else if (collectionName === "users") currentData = mockUsers[docId];
                else if (collectionName === "coupons") currentData = mockCoupons[docId];
                else if (collectionName === "transactions") currentData = mockTransactions[docId];
                else if (collectionName === "refunds") currentData = mockRefunds[docId];

                const newData = { ...currentData };
                for (const key in data) {
                  if (data[key]?._method === "increment") {
                    newData[key] = (newData[key] || 0) + data[key]._value;
                  } else if (data[key]?._method === "arrayUnion") {
                    newData[key] = [...(newData[key] || []), ...data[key]._value];
                  } else {
                    newData[key] = data[key];
                  }
                }
                db.collection(collectionName).doc(docId).set(newData);
              } else if (type === "delete") {
                db.collection(collectionName).doc(docId).delete();
              }
            });
            this._updates = [];
            return Promise.resolve();
          }
        }),
        FieldValue: {
          serverTimestamp: () => new Date().toISOString(), // Mock serverTimestamp
          increment: (value) => ({
            _method: "increment",
            _value: value
          }),
          arrayUnion: (value) => ({
            _method: "arrayUnion",
            _value: value
          })
        }
      };

      // Mock Auth
      auth = {
        verifyIdToken: () => Promise.resolve({ uid: "mock-uid", email: "test@example.com" }),
        createUser: (userData) => {
          const uid = `mock-uid-${Date.now()}`;
          mockUsers[uid] = { uid, ...userData };
          return Promise.resolve({ uid });
        },
        updateUser: (uid, data) => {
          if (mockUsers[uid]) mockUsers[uid] = { ...mockUsers[uid], ...data };
          return Promise.resolve();
        },
        deleteUser: (uid) => {
          delete mockUsers[uid];
          return Promise.resolve();
        },
        setCustomUserClaims: () => Promise.resolve(),
        getUser: (uid) => Promise.resolve({ uid: "mock-uid", email: "test@example.com" }),
        getUserByEmail: (email) => {
          const user = Object.values(mockUsers).find(u => u.email === email);
          if (user) {
            return Promise.resolve(user);
          } else {
            return Promise.reject({ code: "auth/user-not-found" });
          }
        },
        generateEmailVerificationLink: (email, actionCodeSettings) => Promise.resolve(`mock-verification-link-${email}`),
        createCustomToken: (uid) => Promise.resolve(`mock-custom-token-${uid}`)
      };

      // Mock Storage
      storage = {
        bucket: () => ({
          file: () => ({
            save: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            getSignedUrl: () => Promise.resolve(["https://mock-url.com"])
          })
        })
      };

      bucket = storage.bucket();

      // Mock admin object
      admin.apps = [mockApp];
      admin.auth = () => auth;
      admin.firestore = () => db;
      admin.storage = () => storage;

      console.log("✅ Mock Firebase configuration initialized for testing");
      
      module.exports = { auth, db, admin, storage, bucket, razorpay: {
        orders: {
          create: (options) => {
            console.log("Mock Razorpay order creation:", options);
            return Promise.resolve({
              id: `order_${Date.now()}`,
              entity: "order",
              amount: options.amount,
              currency: options.currency,
              receipt: options.receipt,
              status: "created",
              attempts: 0,
              notes: options.notes
            });
          }
        },
        payments: {
          refund: (paymentId, refundData) => {
            console.log("Mock Razorpay refund:", paymentId, refundData);
            return Promise.resolve({
              id: `refund_${Date.now()}`,
              entity: "refund",
              payment_id: paymentId,
              amount: refundData.amount,
              currency: "INR",
              status: "processed",
              notes: refundData.notes
            });
          }
        },
        refunds: {
          fetch: (refundId) => {
            console.log("Mock Razorpay refund fetch:", refundId);
            return Promise.resolve({
              id: refundId,
              entity: "refund",
              status: "processed"
            });
          }
        }
      } };
      return;
    }

    // Initialize with real credentials
    admin.initializeApp({
      credential: credential,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });

    console.log("✅ Firebase Admin SDK initialized successfully");
  }

  // Get Firebase services
  db = getFirestore();
  auth = getAuth();
  storage = getStorage();
  bucket = getStorage().bucket();

  // Configure Firestore settings
  db.settings({
    ignoreUndefinedProperties: true
  });

} catch (error) {
  console.error("❌ Firebase initialization error:", error);
  
  // Fallback to mock configuration
  console.warn("⚠️  Falling back to mock Firebase configuration");
  
  // Create mock services
  db = {
    collection: (name) => ({
      doc: (id) => ({
        get: () => {
          if (name === "products") {
            return Promise.resolve({ exists: !!mockProducts[id], data: () => mockProducts[id] });
          } else if (name === "orders") {
            return Promise.resolve({ exists: !!mockOrders[id], data: () => mockOrders[id] });
          } else if (name === "users") {
            return Promise.resolve({ exists: !!mockUsers[id], data: () => mockUsers[id] });
          } else if (name === "coupons") {
            return Promise.resolve({ exists: !!mockCoupons[id], data: () => mockCoupons[id] });
          } else if (name === "transactions") {
            return Promise.resolve({ exists: !!mockTransactions[id], data: () => mockTransactions[id] });
          } else if (name === "refunds") {
            return Promise.resolve({ exists: !!mockRefunds[id], data: () => mockRefunds[id] });
          } else if (name === "categories") {
            return Promise.resolve({ exists: true, data: () => ({}) }); // Always exist for categories
          } else {
            return Promise.resolve({ exists: false, data: () => ({}) });
          }
        },
        set: (data) => {
          if (name === "products") mockProducts[id] = data;
          else if (name === "orders") mockOrders[id] = data;
          else if (name === "users") mockUsers[id] = data;
          else if (name === "coupons") mockCoupons[id] = data;
          else if (name === "transactions") mockTransactions[id] = data;
          else if (name === "refunds") mockRefunds[id] = data;
          return Promise.resolve();
        },
        update: (data) => {
          if (name === "products") mockProducts[id] = { ...mockProducts[id], ...data };
          else if (name === "orders") mockOrders[id] = { ...mockOrders[id], ...data };
          else if (name === "users") mockUsers[id] = { ...mockUsers[id], ...data };
          else if (name === "coupons") mockCoupons[id] = { ...mockCoupons[id], ...data };
          else if (name === "transactions") mockTransactions[id] = { ...mockTransactions[id], ...data };
          else if (name === "refunds") mockRefunds[id] = { ...mockRefunds[id], ...data };
          return Promise.resolve();
        }
      })
    }),
    FieldValue: {
      serverTimestamp: () => new Date().toISOString(), // Mock serverTimestamp
      increment: (value) => ({
        _method: "increment",
        _value: value
      }),
      arrayUnion: (value) => ({
        _method: "arrayUnion",
        _value: value
      })
    }
  };

  auth = {
    verifyIdToken: () => Promise.resolve({ uid: "mock-uid", email: "test@example.com" }),
    createUser: (userData) => {
      const uid = `mock-uid-${Date.now()}`;
      mockUsers[uid] = { uid, ...userData };
      return Promise.resolve({ uid });
    },
    updateUser: (uid, data) => {
      if (mockUsers[uid]) mockUsers[uid] = { ...mockUsers[uid], ...data };
      return Promise.resolve();
    },
    deleteUser: (uid) => {
      delete mockUsers[uid];
      return Promise.resolve();
    },
    getUserByEmail: (email) => {
      const user = Object.values(mockUsers).find(u => u.email === email);
      if (user) {
        return Promise.resolve(user);
      } else {
        return Promise.reject({ code: "auth/user-not-found" });
      }
    },
    generateEmailVerificationLink: (email, actionCodeSettings) => Promise.resolve(`mock-verification-link-${email}`),
    createCustomToken: (uid) => Promise.resolve(`mock-custom-token-${uid}`)
  };

  storage = {
    bucket: () => ({
      file: () => ({
        save: () => Promise.resolve(),
        delete: () => Promise.resolve()
      })
    })
  };

  bucket = storage.bucket();
}

// Health check function
const checkFirebaseConnection = async () => {
  try {
    if (process.env.NODE_ENV === "production") {
      // Only do real health check in production
      await db.collection("health").doc("check").get();
      console.log("✅ Firebase connection healthy");
      return true;
    }
    console.log("✅ Mock Firebase connection (development mode)");
    return true;
  } catch (error) {
    console.error("❌ Firebase connection failed:", error);
    return false;
  }
};

// Export Firebase services
module.exports = {
  auth,
  db,
  admin,
  storage,
  bucket,
  checkFirebaseConnection,
  razorpay: {
    orders: {
      create: (options) => {
        console.log("Mock Razorpay order creation:", options);
        return Promise.resolve({
          id: `order_${Date.now()}`,
          entity: "order",
          amount: options.amount,
          currency: options.currency,
          receipt: options.receipt,
          status: "created",
          attempts: 0,
          notes: options.notes
        });
      }
    },
    payments: {
      refund: (paymentId, refundData) => {
        console.log("Mock Razorpay refund:", paymentId, refundData);
        return Promise.resolve({
          id: `refund_${Date.now()}`,
          entity: "refund",
          payment_id: paymentId,
          amount: refundData.amount,
          currency: "INR",
          status: "processed",
          notes: refundData.notes
        });
      }
    },
    refunds: {
      fetch: (refundId) => {
        console.log("Mock Razorpay refund fetch:", refundId);
        return Promise.resolve({
          id: refundId,
          entity: "refund",
          status: "processed"
        });
      }
    }
  }
};
