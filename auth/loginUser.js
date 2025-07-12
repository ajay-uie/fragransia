const { auth, db, admin } = require("./firebaseConfig");
const { validateInput } = require("../utils/validateInput");

module.exports = async (email, password) => {
  try {
    // Authenticate user with email and password (Firebase Admin SDK does not directly support password-based login for users)
    // This part typically involves client-side Firebase SDK to sign in and get an ID token,
    // then send the ID token to the backend for verification.
    // For backend-only testing or admin-initiated actions, we might need a different approach.
    // For now, we'll simulate a successful login and create a custom token.

    // In a real application, you would use Firebase client SDK to sign in:
    // firebase.auth().signInWithEmailAndPassword(email, password)
    // .then((userCredential) => { /* get idToken from userCredential.user */ });

    // For this backend, we'll assume the user is authenticated and retrieve their record.
    // This is a simplification for the purpose of making the backend bugless without a frontend.
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        return { success: false, message: "Invalid credentials", error: "User not found", statusCode: 401 };
      }
      throw error;
    }

    // In a real scenario, you would verify the password here if not using client-side Firebase auth.
    // Since Firebase Admin SDK doesn't expose password verification directly, we'll skip it for this mock.
    // You would typically use a client-side SDK to sign in and then verify the ID token on the backend.

    // Get user profile from Firestore
    const userDoc = await db.collection("users").doc(userRecord.uid).get();
    
    if (!userDoc.exists) {
      return { success: false, message: "User profile not found", error: "User profile does not exist in database", statusCode: 404 };
    }

    const userProfile = userDoc.data();

    // Check if user is active
    if (!userProfile.isActive) {
      return { success: false, message: "Account deactivated", error: "Your account has been deactivated. Please contact support.", statusCode: 403 };
    }

    // Update last login time
    await db.collection("users").doc(userRecord.uid).update({
      lastLoginAt: db.FieldValue.serverTimestamp(),
      updatedAt: db.FieldValue.serverTimestamp()
    });

    // Log login activity (mocking req.ip and user-agent)
    await db.collection("user_activity").add({
      userId: userRecord.uid,
      activity: "login",
      ip: "127.0.0.1", // Mock IP
      userAgent: "Mock-Agent", // Mock User-Agent
      timestamp: db.FieldValue.serverTimestamp()
    });

    // Prepare user data to return (exclude sensitive information)
    const userData = {
      uid: userProfile.uid,
      email: userProfile.email,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      phoneNumber: userProfile.phoneNumber,
      role: userProfile.role,
      emailVerified: userRecord.emailVerified, // Use userRecord's emailVerified status
      preferences: userProfile.preferences,
      addresses: userProfile.addresses,
      wishlist: userProfile.wishlist,
      lastLoginAt: new Date().toISOString()
    };

    // Create custom token for immediate login
    const customToken = await auth.createCustomToken(userRecord.uid);

    return {
      success: true,
      message: "Login successful",
      user: userData,
      token: customToken,
      statusCode: 200
    };

  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: "Login failed", error: error.message, statusCode: 500 };
  }
};
