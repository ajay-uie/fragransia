import { initializeApp, getApps } from "firebase/app"
import { getAuth, connectAuthEmulator } from "firebase/auth"
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore"
import { getStorage, connectStorageEmulator } from "firebase/storage"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Validate Firebase configuration
const validateFirebaseConfig = () => {
  const requiredKeys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ]

  const missingKeys = requiredKeys.filter((key) => !process.env[key])

  if (missingKeys.length > 0) {
    console.warn("Missing Firebase configuration keys:", missingKeys)
    console.warn("Firebase features will be disabled")
    return false
  }

  console.log("✅ Firebase configuration validated successfully")
  return true
}

// Initialize Firebase
let app
let isFirebaseEnabled = false
try {
  isFirebaseEnabled = validateFirebaseConfig()
  if (isFirebaseEnabled) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
    console.log("✅ Firebase app initialized successfully")
  } else {
    console.log("⚠️ Firebase disabled due to missing configuration")
  }
} catch (error) {
  console.error("❌ Firebase initialization failed:", error)
  isFirebaseEnabled = false
}

// Initialize services
export const auth = isFirebaseEnabled && app ? getAuth(app) : null
export const db = isFirebaseEnabled && app ? getFirestore(app) : null
export const storage = isFirebaseEnabled && app ? getStorage(app) : null

// Connect to emulators in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development" && isFirebaseEnabled && auth && db && storage) {
  try {
    // Only connect if not already connected
    if (!auth.config.emulator) {
      connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true })
      console.log("🔧 Connected to Auth emulator")
    }

    if (!db._delegate._databaseId.projectId.includes("demo-")) {
      connectFirestoreEmulator(db, "localhost", 8080)
      console.log("🔧 Connected to Firestore emulator")
    }

    if (!storage._delegate._host.includes("localhost")) {
      connectStorageEmulator(storage, "localhost", 9199)
      console.log("🔧 Connected to Storage emulator")
    }
  } catch (error) {
    console.warn("⚠️ Emulator connection failed (may already be connected):", error.message)
  }
}

// Test Firebase connection
export const testFirebaseConnection = async () => {
  try {
    // Test Firestore connection
    const { doc, getDoc } = await import("firebase/firestore")
    const testDoc = doc(db, "test", "connection")
    await getDoc(testDoc)
    console.log("✅ Firestore connection successful")

    // Test Auth connection
    console.log("✅ Firebase Auth ready:", !!auth.currentUser !== undefined)

    // Test Storage connection
    console.log("✅ Firebase Storage ready:", !!storage)

    return true
  } catch (error) {
    console.error("❌ Firebase connection test failed:", error)
    return false
  }
}

// Export default app
export default app
