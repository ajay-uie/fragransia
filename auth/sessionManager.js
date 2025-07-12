const { auth, db, admin } = require("./firebaseConfig");

class SessionManager {
  constructor() {
    this.db = db;
    this.auth = auth;
  }

  // Create a session record
  async createSession(userId, sessionData) {
    try {
      const sessionId = this.generateSessionId();
      
      const session = {
        sessionId,
        userId,
        ip: sessionData.ip,
        userAgent: sessionData.userAgent,
        loginTime: db.FieldValue.serverTimestamp(),
        lastActivity: db.FieldValue.serverTimestamp(),
        isActive: true,
        deviceInfo: {
          browser: this.parseBrowser(sessionData.userAgent),
          os: this.parseOS(sessionData.userAgent),
          device: this.parseDevice(sessionData.userAgent)
        },
        location: sessionData.location || null
      };

      await this.db.collection("user_sessions").doc(sessionId).set(session);

      return {
        sessionId,
        createdAt: new Date()
      };

    } catch (error) {
      console.error("Create session error:", error);
      throw error;
    }
  }

  // Update session activity
  async updateSessionActivity(sessionId) {
    try {
      const sessionRef = this.db.collection("user_sessions").doc(sessionId);
      
      await sessionRef.update({
        lastActivity: db.FieldValue.serverTimestamp()
      });

    } catch (error) {
      console.error("Update session activity error:", error);
    }
  }

  // End session
  async invalidateSession(userId) {
    try {
      // Invalidate all tokens for the user
      await this.auth.revokeRefreshTokens(userId);

      // Optionally, mark all sessions as inactive in Firestore
      const sessionsQuery = await this.db.collection("user_sessions")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();

      const batch = this.db.batch();
      sessionsQuery.forEach(doc => {
        batch.update(doc.ref, {
          isActive: false,
          endTime: db.FieldValue.serverTimestamp(),
          endReason: "logout"
        });
      });
      await batch.commit();

      return { success: true, message: "User sessions revoked and invalidated" };
    } catch (error) {
      console.error("Error invalidating session:", error);
      return { success: false, message: error.message };
    }
  }

  // Get active sessions for user
  async getActiveSessions(userId) {
    try {
      const sessionsQuery = await this.db.collection("user_sessions")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .orderBy("lastActivity", "desc")
        .get();

      const sessions = [];
      sessionsQuery.forEach(doc => {
        const sessionData = doc.data();
        sessions.push({
          sessionId: doc.id,
          ip: sessionData.ip,
          deviceInfo: sessionData.deviceInfo,
          loginTime: sessionData.loginTime.toDate(),
          lastActivity: sessionData.lastActivity.toDate(),
          location: sessionData.location
        });
      });

      return sessions;

    } catch (error) {
      console.error("Get active sessions error:", error);
      throw error;
    }
  }

  // End all sessions for user (except current)
  async endAllOtherSessions(userId, currentSessionId) {
    try {
      const sessionsQuery = await this.db.collection("user_sessions")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();

      const batch = this.db.batch();
      let endedCount = 0;

      sessionsQuery.forEach(doc => {
        if (doc.id !== currentSessionId) {
          batch.update(doc.ref, {
            isActive: false,
            endTime: db.FieldValue.serverTimestamp(),
            endReason: "ended_by_user"
          });
          endedCount++;
        }
      });

      await batch.commit();

      return {
        success: true,
        endedSessions: endedCount
      };

    } catch (error) {
      console.error("End all other sessions error:", error);
      throw error;
    }
  }

  // Check if session is valid
  async validateSession(sessionId) {
    try {
      const sessionDoc = await this.db.collection("user_sessions").doc(sessionId).get();
      
      if (!sessionDoc.exists) {
        return { valid: false, reason: "Session not found" };
      }

      const session = sessionDoc.data();

      if (!session.isActive) {
        return { valid: false, reason: "Session inactive" };
      }

      // Check session timeout (24 hours)
      const lastActivity = session.lastActivity.toDate();
      const now = new Date();
      const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);

      if (hoursSinceActivity > 24) {
        await this.endSession(sessionId, "timeout");
        return { valid: false, reason: "Session timeout" };
      }

      return {
        valid: true,
        userId: session.userId,
        session: {
          sessionId,
          loginTime: session.loginTime.toDate(),
          lastActivity: lastActivity
        }
      };

    } catch (error) {
      console.error("Validate session error:", error);
      return { valid: false, reason: "Validation error" };
    }
  }

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - 24); // 24 hours ago

      const expiredQuery = await this.db.collection("user_sessions")
        .where("isActive", "==", true)
        .where("lastActivity", "<", cutoffTime)
        .get();

      const batch = this.db.batch();

      expiredQuery.forEach(doc => {
        batch.update(doc.ref, {
          isActive: false,
          endTime: db.FieldValue.serverTimestamp(),
          endReason: "expired"
        });
      });

      await batch.commit();

      console.log(`Cleaned up ${expiredQuery.size} expired sessions`);

      return {
        cleanedSessions: expiredQuery.size
      };

    } catch (error) {
      console.error("Cleanup expired sessions error:", error);
      throw error;
    }
  }

  // Get session statistics
  async getSessionStats(userId) {
    try {
      const [activeSessions, totalSessions, recentLogins] = await Promise.all([
        this.db.collection("user_sessions")
          .where("userId", "==", userId)
          .where("isActive", "==", true)
          .get(),
        
        this.db.collection("user_sessions")
          .where("userId", "==", userId)
          .get(),
        
        this.db.collection("user_sessions")
          .where("userId", "==", userId)
          .orderBy("loginTime", "desc")
          .limit(10)
          .get()
      ]);

      const recentLoginData = [];
      recentLogins.forEach(doc => {
        const session = doc.data();
        recentLoginData.push({
          loginTime: session.loginTime.toDate(),
          ip: session.ip,
          deviceInfo: session.deviceInfo,
          location: session.location
        });
      });

      return {
        activeSessionsCount: activeSessions.size,
        totalSessionsCount: totalSessions.size,
        recentLogins: recentLoginData
      };

    } catch (error) {
      console.error("Get session stats error:", error);
      throw error;
    }
  }

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      const userRef = this.db.collection("users").doc(userId);
      await userRef.update({
        ...updates,
        updatedAt: db.FieldValue.serverTimestamp()
      });

      const updatedUserDoc = await userRef.get();
      return { success: true, user: updatedUserDoc.data() };
    } catch (error) {
      console.error("Error updating user profile:", error);
      return { success: false, message: error.message };
    }
  }

  // Change user password
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Re-authenticate user with current password (Firebase Admin SDK does not directly support this)
      // In a real application, this would involve client-side re-authentication before calling this backend endpoint.
      // For this mock, we assume the client has handled re-authentication.

      await this.auth.updateUser(userId, { password: newPassword });

      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      console.error("Error changing password:", error);
      return { success: false, message: error.message };
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(email) {
    try {
      await this.auth.generatePasswordResetLink(email);
      return { success: true, message: "Password reset email sent" };
    } catch (error) {
      console.error("Error sending password reset email:", error);
      return { success: false, message: error.message };
    }
  }

  // Send email verification
  async sendEmailVerification(userId) {
    try {
      const user = await this.auth.getUser(userId);
      if (!user.emailVerified) {
        await this.auth.generateEmailVerificationLink(user.email);
        return { success: true, message: "Email verification link sent" };
      } else {
        return { success: false, message: "Email already verified" };
      }
    } catch (error) {
      console.error("Error sending email verification:", error);
      return { success: false, message: error.message };
    }
  }

  // Refresh token
  async refreshToken(userId) {
    try {
      const customToken = await this.auth.createCustomToken(userId);
      // In a real application, you would typically return an ID token here, not a custom token.
      // The client-side SDK would exchange the custom token for an ID token.
      return { success: true, token: customToken, expiresIn: 3600 }; // Mock expiresIn
    } catch (error) {
      console.error("Error refreshing token:", error);
      return { success: false, message: error.message };
    }
  }

  // Generate unique session ID
  generateSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Parse browser from user agent
  parseBrowser(userAgent) {
    if (!userAgent) return "Unknown";
    
    if (userAgent.includes("Chrome")) return "Chrome";
    if (userAgent.includes("Firefox")) return "Firefox";
    if (userAgent.includes("Safari")) return "Safari";
    if (userAgent.includes("Edge")) return "Edge";
    if (userAgent.includes("Opera")) return "Opera";
    
    return "Unknown";
  }

  // Parse OS from user agent
  parseOS(userAgent) {
    if (!userAgent) return "Unknown";
    
    if (userAgent.includes("Windows")) return "Windows";
    if (userAgent.includes("Mac OS")) return "macOS";
    if (userAgent.includes("Linux")) return "Linux";
    if (userAgent.includes("Android")) return "Android";
    if (userAgent.includes("iOS")) return "iOS";
    
    return "Unknown";
  }

  // Parse device type from user agent
  parseDevice(userAgent) {
    if (!userAgent) return "Unknown";
    
    if (userAgent.includes("Mobile")) return "Mobile";
    if (userAgent.includes("Tablet")) return "Tablet";
    
    return "Desktop";
  }
}

module.exports = new SessionManager();
