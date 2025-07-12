const admin = require("firebase-admin");
const { generateID } = require("../utils/generateID");

module.exports = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== "admin") {
      return res.status(403).json({ error: "Only admins can seed data" });
    }

    // Sample categories
    const categories = [
      {
        id: "mens-fragrance",
        name: "Men's Fragrance",
        description: "Premium fragrances for men",
        image: "https://images.unsplash.com/photo-1594736797933-d0251ba0715f?w=400",
        isActive: true,
        productCount: 0
      },
      {
        id: "womens-fragrance",
        name: "Women's Fragrance",
        description: "Elegant fragrances for women",
        image: "https://images.unsplash.com/photo-1588405748880-12d1d2a59d75?w=400",
        isActive: true,
        productCount: 0
      },
      {
        id: "unisex-fragrance",
        name: "Unisex Fragrance",
        description: "Versatile fragrances for everyone",
        image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400",
        isActive: true,
        productCount: 0
      },
      {
        id: "gift-sets",
        name: "Gift Sets",
        description: "Perfect fragrance gift collections",
        image: "https://images.unsplash.com/photo-1549062572-544a64fb0c56?w=400",
        isActive: true,
        productCount: 0
      }
    ];

    // Sample products
    const products = [
      {
        name: "Party mann",
        description: "A captivating fragrance with notes of Bergamot, Black Currant, Apple, Lemon, Pink Pepper, Pineapple, Patchouli, Moroccan Jasmine, Birch, Musk, Oakmoss, Ambroxan and Cedarwood.",
        price: 2999,
        comparePrice: 3499,
        category: "mens-fragrance",
        brand: "Fragransia",
        fragrance: {
          type: "Oriental",
          intensity: "Strong",
          longevity: "8-10 hours",
          sillage: "Heavy"
        },
        volume: 100,
        concentration: "EDP",
        notes: {
          top: ["Bergamot", "Black Currant", "Apple", "Lemon", "Pink Pepper"],
          middle: ["Pineapple", "Patchouli", "Moroccan Jasmine"],
          base: ["Birch", "Musk", "Oakmoss", "Ambroxan", "Cedarwood"]
        },
        images: [
          "/images/IMG-20250711-WA0005.jpg"
        ],
        inventory: 50,
        weight: 0.35,
        isActive: true,
        isFeatured: true,
        tags: ["oud", "oriental", "evening", "luxury"],
        seo: {
          title: "Party mann - Premium Men's Fragrance | Fragransia",
          description: "Experience the luxury of Party mann, a captivating oriental fragrance.",
          url: "party-mann",
          keywords: ["party mann perfume", "men's fragrance", "oriental perfume", "luxury perfume"]
        }
      },
      {
        name: "Blue man",
        description: "A sophisticated fragrance with notes of Calabrian bergamot, Pepper, Sichuan Pepper, Lavender, Pink Pepper, Vetiver, Patchouli, Geranium, Elemi, Ambroxan, Cedar and Labdanum.",
        price: 2499,
        comparePrice: 2899,
        category: "mens-fragrance",
        brand: "Fragransia",
        fragrance: {
          type: "Aromatic",
          intensity: "Moderate",
          longevity: "6-8 hours",
          sillage: "Moderate"
        },
        volume: 75,
        concentration: "EDP",
        notes: {
          top: ["Calabrian bergamot", "Pepper"],
          middle: ["Sichuan Pepper", "Lavender", "Pink Pepper", "Vetiver", "Patchouli", "Geranium", "Elemi"],
          base: ["Ambroxan", "Cedar", "Labdanum"]
        },
        images: [
          "/images/IMG-20250711-WA0006.jpg"
        ],
        inventory: 75,
        weight: 0.28,
        isActive: true,
        isFeatured: true,
        tags: ["blue man", "aromatic", "masculine", "elegant"],
        seo: {
          title: "Blue man - Men's Aromatic Perfume | Fragransia",
          description: "Discover Blue man, a sophisticated aromatic fragrance for the modern man.",
          url: "blue-man",
          keywords: ["blue man perfume", "men's fragrance", "aromatic perfume", "elegant perfume"]
        }
      },
      {
        name: "Amber Oud",
        description: "A warm and inviting fragrance with notes of Black Currant, Pineapple, Orange, Apple, Rose, Freesia, Heliotrope, Lily-of-the-Valley, Vanilla, Cedar, Sandalwood and Tonka Bean.",
        price: 1899,
        comparePrice: 2199,
        category: "unisex-fragrance",
        brand: "Fragransia",
        fragrance: {
          type: "Gourmand",
          intensity: "Light",
          longevity: "4-6 hours",
          sillage: "Light"
        },
        volume: 50,
        concentration: "EDT",
        notes: {
          top: ["Black Currant", "Pineapple", "Orange", "Apple"],
          middle: ["Rose", "Freesia", "Heliotrope", "Lily-of-the-Valley"],
          base: ["Vanilla", "Cedar", "Sandalwood", "Tonka Bean"]
        },
        images: [
          "/images/IMG-20250711-WA0007.jpg"
        ],
        inventory: 100,
        weight: 0.22,
        isActive: true,
        isFeatured: false,
        tags: ["amber oud", "gourmand", "unisex", "daily"],
        seo: {
          title: "Amber Oud - Warm Unisex Fragrance | Fragransia",
          description: "Energize your day with Amber Oud, a refreshing unisex fragrance.",
          url: "amber-oud",
          keywords: ["amber oud perfume", "unisex fragrance", "warm perfume", "daily wear"]
        }
      },
      {
        name: "Ocean man",
        description: "A fresh and invigorating fragrance with notes of Apple, Plum, Lemon, Bergamot, Oakmoss, Geranium, Cinnamon, Mahogany, Carnation, Vanilla, Sandalwood, Cedar, Vetiver and Olive Tree.",
        price: 2199,
        comparePrice: 2599,
        category: "mens-fragrance",
        brand: "Fragransia",
        fragrance: {
          type: "Aquatic",
          intensity: "Moderate",
          longevity: "7-9 hours",
          sillage: "Moderate"
        },
        volume: 75,
        concentration: "EDP",
        notes: {
          top: ["Apple", "Plum", "Lemon", "Bergamot", "Oakmoss", "Geranium"],
          middle: ["Cinnamon", "Mahogany", "Carnation"],
          base: ["Vanilla", "Sandalwood", "Cedar", "Vetiver", "Olive Tree"]
        },
        images: [
          "/images/IMG-20250711-WA0008.jpg"
        ],
        inventory: 60,
        weight: 0.28,
        isActive: true,
        isFeatured: true,
        tags: ["ocean man", "aquatic", "fresh", "invigorating"],
        seo: {
          title: "Ocean man - Fresh Aquatic Perfume | Fragransia",
          description: "Indulge in Ocean man, a fresh and invigorating aquatic fragrance.",
          url: "ocean-man",
          keywords: ["ocean man perfume", "aquatic fragrance", "fresh perfume", "invigorating scent"]
        }
      }
    ];

    const batch = db.batch();

    // Add categories
    for (const category of categories) {
      const categoryRef = db.collection("categories").doc(category.id);
      batch.set(categoryRef, {
        ...category,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Add products
    let productCount = 0;
    for (const product of products) {
      const productId = generateID.generateProductId();
      const productRef = db.collection("products").doc(productId);
      
      batch.set(productRef, {
        id: productId,
        ...product,
        sku: productId,
        averageRating: 0,
        totalReviews: 0,
        totalSales: Math.floor(Math.random() * 100), // Random sales count
        views: Math.floor(Math.random() * 500), // Random view count
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      productCount++;
    }

    // Update category product counts
    const categoryProductCounts = {
      "mens-fragrance": 2,
      "womens-fragrance": 0,
      "unisex-fragrance": 1,
      "gift-sets": 0
    };

    for (const [categoryId, count] of Object.entries(categoryProductCounts)) {
      const categoryRef = db.collection("categories").doc(categoryId);
      batch.update(categoryRef, {
        productCount: count
      });
    }

    // Add some sample coupons
    const coupons = [
      {
        code: "WELCOME10",
        type: "percentage",
        value: 10,
        minOrderValue: 1000,
        maxDiscount: 500,
        description: "Welcome offer - 10% off on first order",
        isActive: true,
        usageLimit: 1000,
        usageCount: 0,
        perUserLimit: 1,
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        usedBy: []
      },
      {
        code: "FLAT500",
        type: "fixed",
        value: 500,
        minOrderValue: 2500,
        description: "Flat ₹500 off on orders above ₹2500",
        isActive: true,
        usageLimit: 500,
        usageCount: 0,
        perUserLimit: 3,
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        usedBy: []
      }
    ];

    for (const coupon of coupons) {
      const couponRef = db.collection("coupons").doc(coupon.code);
      batch.set(couponRef, {
        ...coupon,
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Commit the batch
    await batch.commit();

    // Log admin activity
    await db.collection("admin_activity").add({
      userId,
      action: "seed_database",
      resourceType: "products",
      details: {
        categoriesAdded: categories.length,
        productsAdded: products.length,
        couponsAdded: coupons.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: "Database seeded successfully",
      seeded: {
        categories: categories.length,
        products: products.length,
        coupons: coupons.length
      }
    });

  } catch (error) {
    console.error("Seed database error:", error);
    res.status(500).json({
      error: "Failed to seed database",
      message: error.message
    });
  }
};

