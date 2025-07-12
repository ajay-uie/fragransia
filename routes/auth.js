const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const admin = require("firebase-admin");
const router = express.Router();

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Validation middleware
const validateRegister = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("firstName").trim().isLength({ min: 1 }).withMessage("First name is required"),
  body("lastName").trim().isLength({ min: 1 }).withMessage("Last name is required"),
];

const validateLogin = [
  body("email").isEmail().normalizeEmail(),
  body("password").exists().withMessage("Password is required"),
];

// Register new user
router.post("/register", validateRegister, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, phoneNumber } = req.body;

    // Check if user already exists
    const existingUserQuery = await db.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!existingUserQuery.empty) {
      return res.status(409).json({
        error: "User already exists",
        message: "An account with this email already exists"
      });
    }

    // Create Firebase user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`.trim(),
      emailVerified: false
    });

    // Hash password for additional security
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user profile in Firestore
    const userData = {
      uid: userRecord.uid,
      email,
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      role: "customer",
      isActive: true,
      emailVerified: false,
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
    };

    await db.collection("users").doc(userRecord.uid).set(userData);

    // Generate JWT token
    const token = jwt.sign(
      { 
        uid: userRecord.uid, 
        email, 
        role: "customer" 
      },
      process.env.JWT_SECRET || "fallback-secret",
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        uid: userRecord.uid,
        email,
        firstName,
        lastName,
        role: "customer"
      },
      token
    });

  } catch (error) {
    console.error("Registration error:", error);
    
    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({
        error: "Email already exists",
        message: "An account with this email already exists"
      });
    }

    res.status(500).json({
      error: "Registration failed",
      message: error.message
    });
  }
});

// Login user
router.post("/login", validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Get user from Firestore
    const userQuery = await db.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (userQuery.empty) {
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Email or password is incorrect"
      });
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    if (!userData.isActive) {
      return res.status(403).json({
        error: "Account disabled",
        message: "Your account has been disabled. Please contact support."
      });
    }

    // Verify password using bcrypt
    const isMatch = await bcrypt.compare(password, userData.hashedPassword);

    if (!isMatch) {
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Email or password is incorrect"
      });
    }

    // Update last login
    await db.collection("users").doc(userData.uid).update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        uid: userData.uid, 
        email: userData.email, 
        role: userData.role 
      },
      process.env.JWT_SECRET || "fallback-secret",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      user: {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        phoneNumber: userData.phoneNumber
      },
      token
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
      message: error.message
    });
  }
});

// Verify token
router.post("/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No token provided",
        message: "Authorization header is required"
      });
    }

    const token = authHeader.split("Bearer ")[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback-secret");
      
      // Get fresh user data
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      
      if (!userDoc.exists) {
        return res.status(401).json({
          error: "User not found",
          message: "User account no longer exists"
        });
      }

      const userData = userDoc.data();
      
      if (!userData.isActive) {
        return res.status(403).json({
          error: "Account disabled",
          message: "Your account has been disabled"
        });
      }

      res.json({
        success: true,
        user: {
          uid: userData.uid,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          phoneNumber: userData.phoneNumber
        }
      });

    } catch (jwtError) {
      return res.status(401).json({
        error: "Invalid token",
        message: "Token is expired or invalid"
      });
    }

  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      error: "Verification failed",
      message: error.message
    });
  }
});

// Logout (optional - mainly for clearing server-side sessions if needed)
router.post("/logout", async (req, res) => {
  try {
    // In a stateless JWT setup, logout is mainly handled on the frontend
    // But we can log the logout event
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split("Bearer ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback-secret");
        console.log(`User ${decoded.uid} logged out at ${new Date().toISOString()}`);
      } catch (error) {
        // Token might be expired, that\'s okay for logout
      }
    }

    res.json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Logout failed",
      message: error.message
    });
  }
});

// Request password reset
router.post("/forgot-password", [
  body("email").isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const { email } = req.body;

    // Check if user exists
    const userQuery = await db.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    // Always return success to prevent email enumeration
    if (userQuery.empty) {
      return res.json({
        success: true,
        message: "If an account with this email exists, a password reset link has been sent."
      });
    }

    // Generate password reset link using Firebase Auth
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    // In production, send email with reset link
    // For now, we\'ll just log it
    console.log(`Password reset link for ${email}: ${resetLink}`);

    res.json({
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
      // Remove this in production
      resetLink: process.env.NODE_ENV === "development" ? resetLink : undefined
    });

  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({
      error: "Password reset failed",
      message: error.message
    });
  }
});

module.exports = router;


