"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import { firebaseService, type UserProfile, type Address } from "@/lib/firebase-service"
import { apiClient } from "@/lib/api"
import { socketManager } from "@/lib/socket"
import type { FirebaseError } from "firebase/app"

/* ---------------------------------------------------------------------- */
/*  Error Mapper – converts Firebase codes to friendly text               */
/* ---------------------------------------------------------------------- */
function mapAuthError(err: unknown): Error {
  if ((err as FirebaseError)?.code) {
    const { code } = err as FirebaseError
    const message =
      {
        // e-mail / password
        "auth/invalid-credential": "Invalid email or password.",
        "auth/wrong-password": "Invalid email or password.",
        "auth/user-not-found": "No account exists with that email.",
        // throttling
        "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
        // Google provider
        "auth/popup-closed-by-user": "Google sign-in was cancelled.",
        "auth/popup-blocked": "Pop-up blocked. Please enable pop-ups and try again.",
        "auth/account-exists-with-different-credential":
          "An account already exists with this email using a different sign-in method.",
        // Preview / dev domains not whitelisted
        "auth/unauthorized-domain":
          "This preview domain isn't authorised in Firebase. Ask the site owner to add it to the allowed list.",
      }[code] ?? "Authentication failed. Please try again."
    return new Error(message)
  }
  return new Error("Something went wrong. Please try again.")
}

/* ---------------------------------------------------------------------- */
/*  Auth Context Type                                                     */
/* ---------------------------------------------------------------------- */
interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  /* e-mail / password */
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  /* Google provider */
  loginWithGoogle: () => Promise<void>
  registerWithGoogle: () => Promise<void>
  /* misc */
  logout: () => Promise<void>
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  /* address management */
  addAddress: (address: Omit<Address, "id">) => Promise<string>
  updateAddress: (addressId: string, updates: Partial<Address>) => Promise<void>
  deleteAddress: (addressId: string) => Promise<void>
  setDefaultAddress: (addressId: string) => Promise<void>
  /* utility */
  isAdmin: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

/* ---------------------------------------------------------------------- */
/*  Helper – create or fetch user profile from Firebase                   */
/* ---------------------------------------------------------------------- */
async function ensureUserProfile(user: User): Promise<UserProfile> {
  let profile = await firebaseService.getUserProfile(user.uid)

  if (!profile) {
    // New user - create profile
    const newProfile: Omit<UserProfile, "createdAt" | "updatedAt"> = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "User",
      role: "user",
      preferences: {
        newsletter: true,
        notifications: true,
        theme: "light",
        language: "en",
        currency: "USD",
        emailFrequency: "weekly",
        smsNotifications: false,
      },
      isActive: true,
      ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    }

    await firebaseService.createUserProfile(newProfile)
    profile = await firebaseService.getUserProfile(user.uid)
  }

  // Update last login
  await firebaseService.updateLastLogin(user.uid)

  return profile!
}

/* ---------------------------------------------------------------------- */
/*  Provider                                                               */
/* ---------------------------------------------------------------------- */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileSubscription, setProfileSubscription] = useState<(() => void) | null>(null)

  /* -------------------------------------------------- */
  /*  Handle auth state + Google redirect results       */
  /* -------------------------------------------------- */
  useEffect(() => {
    // Check if Firebase auth is available
    if (!auth) {
      console.warn("Firebase auth not available, skipping auth state management")
      setLoading(false)
      return
    }

    // First, check if we're landing from a Google redirect
    ;(async () => {
      try {
        const redirectResult = await getRedirectResult(auth)
        if (redirectResult?.user) {
          console.info("Handled Google redirect sign-in")
        }
      } catch (err) {
        console.error("Google redirect handling error", err)
      }
    })()

    const unsub = onAuthStateChanged(auth, async (usr) => {
      setUser(usr)

      // Clean up previous subscription
      if (profileSubscription) {
        profileSubscription()
        setProfileSubscription(null)
      }

      if (usr) {
        // Set up real-time profile subscription
        const unsubscribeProfile = firebaseService.subscribeToUserProfile(usr.uid, (profile) => {
          setUserProfile(profile)
        })
        setProfileSubscription(() => unsubscribeProfile)

        // Ensure profile exists and get initial data
        await ensureUserProfile(usr)

        // API & sockets - get Firebase token and set it for API calls
        const token = await usr.getIdToken()
        apiClient.setToken(token)
        socketManager.connect(token)

        // Log page view
        await firebaseService.logPageView(usr.uid, window.location.pathname, document.referrer)
      } else {
        setUserProfile(null)
        apiClient.clearToken()
        socketManager.disconnect()
      }

      setLoading(false)
    })

    return () => {
      unsub()
      if (profileSubscription) {
        profileSubscription()
      }
    }
  }, [])

  const isAdmin = userProfile?.role === "admin"

  /* -------------------------------------------------- */
  /*  Email / Password with Backend Integration          */
  /* -------------------------------------------------- */
  const login = async (email: string, password: string) => {
    if (!auth) {
      throw new Error("Authentication service not available")
    }
    
    try {
      // First authenticate with Firebase
      const res = await signInWithEmailAndPassword(auth, email, password)
      const token = await res.user.getIdToken()

      // Then authenticate with backend API
      try {
        await apiClient.login({ email, password })
      } catch (apiError) {
        console.warn("Backend login failed, continuing with Firebase auth:", apiError)
      }

      apiClient.setToken(token)
      socketManager.connect(token)

      // Log login activity
      await firebaseService.logUserActivity(res.user.uid, "login", { method: "email" })
    } catch (err) {
      console.error("Login error:", err)
      throw mapAuthError(err)
    }
  }

  const register = async (email: string, password: string, displayName: string) => {
    if (!auth) {
      throw new Error("Authentication service not available")
    }
    
    try {
      // First register with Firebase
      const res = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(res.user, { displayName })

      // Then register with backend API
      try {
        await apiClient.register({ name: displayName, email, password })
      } catch (apiError) {
        console.warn("Backend registration failed, continuing with Firebase auth:", apiError)
      }

      // Create user profile in Firestore
      await ensureUserProfile({ ...res.user, displayName } as User)

      const token = await res.user.getIdToken()
      apiClient.setToken(token)
      socketManager.connect(token)

      // Log registration activity
      await firebaseService.logUserActivity(res.user.uid, "register", { method: "email" })
    } catch (err) {
      console.error("Registration error:", err)
      throw mapAuthError(err)
    }
  }

  /* -------------------------------------------------- */
  /*  Google Auth flow with pop-up ➜ redirect fallback  */
  /* -------------------------------------------------- */
  const googleSignIn = async (isRegistration = false) => {
    if (!auth) {
      throw new Error("Authentication service not available")
    }
    
    const provider = new GoogleAuthProvider()
    provider.addScope("email")
    provider.addScope("profile")

    try {
      // Try a regular pop-up first (nicer UX)
      const res = await signInWithPopup(auth, provider)
      await ensureUserProfile(res.user)
      const token = await res.user.getIdToken()

      // Sync with backend if needed
      try {
        if (isRegistration) {
          await apiClient.register({
            name: res.user.displayName || "User",
            email: res.user.email || "",
            password: "google-auth", // Backend should handle Google auth differently
          })
        }
      } catch (apiError) {
        console.warn("Backend sync failed for Google auth:", apiError)
      }

      apiClient.setToken(token)
      socketManager.connect(token)

      // Log Google sign-in activity
      await firebaseService.logUserActivity(res.user.uid, isRegistration ? "register" : "login", { method: "google" })
    } catch (err) {
      const fbErr = err as FirebaseError
      if (fbErr?.code === "auth/unauthorized-domain") {
        console.warn("Domain not authorised for pop-up, falling back to redirect")
        await signInWithRedirect(auth, provider)
        return
      }
      console.error("Google auth error:", err)
      throw mapAuthError(err)
    }
  }

  const loginWithGoogle = () => googleSignIn(false)
  const registerWithGoogle = () => googleSignIn(true)

  /* -------------------------------------------------- */
  /*  Profile Management                                */
  /* -------------------------------------------------- */
  const logout = async () => {
    if (!auth) {
      console.warn("Authentication service not available")
      return
    }
    
    if (user) {
      await firebaseService.logUserActivity(user.uid, "logout")
    }
    await signOut(auth)
    apiClient.logout()
    socketManager.disconnect()
  }

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user || !userProfile) return

    await firebaseService.updateUserProfile(user.uid, data)

    // Update Firebase Auth profile if display name changed
    if (data.displayName) {
      await updateProfile(user, { displayName: data.displayName })
    }

    // Log profile update activity
    await firebaseService.logUserActivity(user.uid, "profile_updated", { fields: Object.keys(data) })
  }

  const refreshProfile = async () => {
    if (!user) return
    const profile = await firebaseService.getUserProfile(user.uid)
    setUserProfile(profile)
  }

  const resetPassword = async (email: string) => {
    if (!auth) {
      throw new Error("Authentication service not available")
    }
    
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (err) {
      throw mapAuthError(err)
    }
  }

  /* -------------------------------------------------- */
  /*  Address Management                                */
  /* -------------------------------------------------- */
  const addAddress = async (address: Omit<Address, "id">): Promise<string> => {
    if (!user) throw new Error("User not authenticated")

    const addressId = await firebaseService.addAddress(user.uid, address)
    await firebaseService.logUserActivity(user.uid, "address_added", { addressId })
    return addressId
  }

  const updateAddress = async (addressId: string, updates: Partial<Address>) => {
    if (!user) throw new Error("User not authenticated")

    await firebaseService.updateAddress(user.uid, addressId, updates)
    await firebaseService.logUserActivity(user.uid, "address_updated", { addressId, fields: Object.keys(updates) })
  }

  const deleteAddress = async (addressId: string) => {
    if (!user) throw new Error("User not authenticated")

    await firebaseService.deleteAddress(user.uid, addressId)
    await firebaseService.logUserActivity(user.uid, "address_deleted", { addressId })
  }

  const setDefaultAddress = async (addressId: string) => {
    if (!user || !userProfile) throw new Error("User not authenticated")

    const addresses = userProfile.addresses || []
    const updatedAddresses = addresses.map((addr) => ({
      ...addr,
      isDefault: addr.id === addressId,
    }))

    await firebaseService.updateUserProfile(user.uid, { addresses: updatedAddresses })
    await firebaseService.logUserActivity(user.uid, "default_address_changed", { addressId })
  }

  /* -------------------------------------------------- */
  /*  Context value                                     */
  /* -------------------------------------------------- */
  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    login,
    register,
    loginWithGoogle,
    registerWithGoogle,
    logout,
    updateUserProfile,
    resetPassword,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    isAdmin,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* ---------------------------------------------------------------------- */
/*  Hook                                                                   */
/* ---------------------------------------------------------------------- */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
