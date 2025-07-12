const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require("./fragransia-dbms-firebase-adminsdk-fbsvc-4c0ee348b5.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function createAdminUser() {
  try {
    const email = "admin@example.com";
    const password = "admin123";
    const firstName = "Admin";
    const lastName = "User";

    // Check if admin user already exists
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      console.log("Admin user already exists:", userRecord.uid);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Create Firebase user
        userRecord = await admin.auth().createUser({
          email: email,
          password: password,
          displayName: `${firstName} ${lastName}`.trim(),
          emailVerified: true,
        });
        console.log("Successfully created new admin user:", userRecord.uid);
      } else {
        throw error;
      }
    }

    // Hash password for additional security
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create/Update user profile in Firestore
    const db = admin.firestore();
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      firstName: firstName,
      lastName: lastName,
      phoneNumber: "",
      role: "admin",
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
    }, { merge: true }); // Use merge to update if exists
    console.log("Firestore admin user profile created/updated.");

  } catch (error) {
    console.error("Error creating admin user:", error);
  }
}

createAdminUser();


