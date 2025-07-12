const { auth, db } = require("./firebaseConfig");
const { validateInput } = require("../utils/validateInput");
const { sendEmail } = require("../utils/sendEmail");

module.exports = async (userData) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, dateOfBirth } = userData;

    // Validate input
    const validation = validateInput.validateRegistration({
      email,
      password,
      firstName,
      lastName,
      phoneNumber
    });

    if (!validation.isValid) {
      return { success: false, message: "Validation failed", errors: validation.errors, statusCode: 400 };
    }

    // Check if user already exists
    try {
      await auth.getUserByEmail(email);
      return { success: false, message: "An account with this email already exists", error: "User already exists", statusCode: 409 };
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
      phoneNumber: phoneNumber ? `+91${phoneNumber}` : undefined,
      emailVerified: false
    });

    // Create user profile in Firestore
    const userProfile = {
      uid: userRecord.uid,
      email,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      role: "customer",
      isActive: true,
      emailVerified: false,
      preferences: {
        newsletter: true,
        orderUpdates: true,
        promotions: true
      },
      addresses: [],
      wishlist: [],
      createdAt: db.FieldValue.serverTimestamp(),
      updatedAt: db.FieldValue.serverTimestamp()
    };

    await db.collection("users").doc(userRecord.uid).set(userProfile);

    // Generate email verification link
    const actionCodeSettings = {
      url: `${process.env.FRONTEND_URL || "https://fragransia.com"}/verify-email`,
      handleCodeInApp: true
    };

    const verificationLink = await auth
      .generateEmailVerificationLink(email, actionCodeSettings);

    // Send welcome email with verification link
    try {
      await sendEmail.sendWelcomeEmail({
        email,
        firstName,
        verificationLink
      });
    } catch (emailError) {
      console.error("Welcome email failed:", emailError);
      // Don't fail registration if email fails
    }

    // Create custom token for immediate login
    const customToken = await auth.createCustomToken(userRecord.uid);

    return {
      success: true,
      message: "User registered successfully",
      user: {
        uid: userRecord.uid,
        email,
        firstName,
        lastName,
        phoneNumber,
        emailVerified: false
      },
      token: customToken,
      verificationEmailSent: true,
      statusCode: 201
    };

  } catch (error) {
    console.error("Registration error:", error);
    
    if (error.code === "auth/email-already-exists") {
      return { success: false, message: "An account with this email already exists", error: "Email already exists", statusCode: 409 };
    }
    
    if (error.code === "auth/phone-number-already-exists") {
      return { success: false, message: "An account with this phone number already exists", error: "Phone number already exists", statusCode: 409 };
    }

    return { success: false, message: "Registration failed", error: error.message, statusCode: 500 };
  }
};
