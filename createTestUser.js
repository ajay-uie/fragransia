const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require("./fragransia-dbms-firebase-adminsdk-fbsvc-4c0ee348b5.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function createTestUser() {
  try {
    const email = "testuser@example.com";
    const password = "password123";
    const displayName = "Test User";

    // Hash password for additional security
    const hashedPassword = await bcrypt.hash(password, 12);

    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName,
      emailVerified: true,
    });

    console.log("Successfully created new user:", userRecord.uid);

    // Also create a Firestore entry for this user
    const db = admin.firestore();
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      firstName: "Test",
      lastName: "User",
      phoneNumber: "",
      role: "customer",
      isActive: true,
      emailVerified: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
      preferences: {
        newsletter: true,
        notifications: true
      },
      addresses: [],
      orderHistory: [],
      hashedPassword: hashedPassword // Store the hashed password
    });
    console.log("Firestore user profile created.");

  } catch (error) {
    console.error("Error creating test user:", error);
  }
}

createTestUser();


