const { auth, db, admin } = require('./firebaseConfig');

class RoleManager {
  constructor() {
    this.db = db;
    this.auth = auth;
  }

  // Define role hierarchy
  getRoleHierarchy() {
    return {
      admin: 4,
      manager: 3,
      staff: 2,
      customer: 1
    };
  }

  // Get permissions for each role
  getRolePermissions() {
    return {
      admin: {
        products: ['create', 'read', 'update', 'delete'],
        orders: ['create', 'read', 'update', 'delete', 'refund'],
        users: ['create', 'read', 'update', 'delete', 'manage_roles'],
        coupons: ['create', 'read', 'update', 'delete'],
        categories: ['create', 'read', 'update', 'delete'],
        content: ['create', 'read', 'update', 'delete'],
        analytics: ['read'],
        settings: ['read', 'update'],
        audit: ['read']
      },
      manager: {
        products: ['create', 'read', 'update'],
        orders: ['read', 'update', 'refund'],
        users: ['read', 'update'],
        coupons: ['create', 'read', 'update'],
        categories: ['read', 'update'],
        content: ['create', 'read', 'update'],
        analytics: ['read']
      },
      staff: {
        products: ['read'],
        orders: ['read', 'update'],
        users: ['read'],
        content: ['read', 'update']
      },
      customer: {
        products: ['read'],
        orders: ['create', 'read'], // Only own orders
        profile: ['read', 'update']
      }
    };
  }

  // Assign role to user
  async assignRole(userId, newRole, assignedBy) {
    try {
      const allowedRoles = ['customer', 'staff', 'manager', 'admin'];
      
      if (!allowedRoles.includes(newRole)) {
        throw new Error(`Invalid role: ${newRole}`);
      }

      // Get current user making the change
      const assignerDoc = await this.db.collection('users').doc(assignedBy).get();
      if (!assignerDoc.exists) {
        throw new Error('Assigner not found');
      }

      const assignerRole = assignerDoc.data().role;
      const hierarchy = this.getRoleHierarchy();

      // Check if assigner has permission to assign this role
      if (hierarchy[assignerRole] <= hierarchy[newRole]) {
        throw new Error('Insufficient privileges to assign this role');
      }

      // Get target user
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const currentUser = userDoc.data();
      const oldRole = currentUser.role;

      // Update user role
      await this.db.collection('users').doc(userId).update({
        role: newRole,
        roleAssignedBy: assignedBy,
        roleAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log role change
      await this.db.collection('role_changes').add({
        userId,
        oldRole,
        newRole,
        assignedBy,
        assignerRole,
        userEmail: currentUser.email,
        reason: 'Manual role assignment',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update custom claims in Firebase Auth
      await this.auth.setCustomUserClaims(userId, {
        role: newRole,
        permissions: this.getRolePermissions()[newRole]
      });

      return {
        success: true,
        message: `Role updated from ${oldRole} to ${newRole}`,
        userId,
        oldRole,
        newRole
      };

    } catch (error) {
      console.error('Role assignment error:', error);
      throw error;
    }
  }

  // Check if user has specific permission
  async hasPermission(userId, resource, action) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return false;
      }

      const userRole = userDoc.data().role;
      const permissions = this.getRolePermissions()[userRole];

      if (!permissions || !permissions[resource]) {
        return false;
      }

      return permissions[resource].includes(action);

    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }

  // Get all users with specific role
  async getUsersByRole(role) {
    try {
      const usersQuery = await this.db.collection('users')
        .where('role', '==', role)
        .where('isActive', '==', true)
        .get();

      const users = [];
      usersQuery.forEach(doc => {
        const userData = doc.data();
        users.push({
          uid: doc.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          createdAt: userData.createdAt,
          lastLoginAt: userData.lastLoginAt
        });
      });

      return users;

    } catch (error) {
      console.error('Get users by role error:', error);
      throw error;
    }
  }

  // Create staff account
  async createStaffAccount(userData, createdBy) {
    try {
      const { email, password, firstName, lastName, role = 'staff' } = userData;

      // Validate role
      const allowedStaffRoles = ['staff', 'manager'];
      if (!allowedStaffRoles.includes(role)) {
        throw new Error('Invalid staff role');
      }

      // Check creator permissions
      const creatorDoc = await this.db.collection('users').doc(createdBy).get();
      if (!creatorDoc.exists) {
        throw new Error('Creator not found');
      }

      const creatorRole = creatorDoc.data().role;
      const hierarchy = this.getRoleHierarchy();

      if (hierarchy[creatorRole] <= hierarchy[role]) {
        throw new Error('Insufficient privileges to create this role');
      }

      // Create user in Firebase Auth
      const userRecord = await this.auth.createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`,
        emailVerified: false
      });

      // Create user profile
      const userProfile = {
        uid: userRecord.uid,
        email,
        firstName,
        lastName,
        role,
        isActive: true,
        isStaff: true,
        emailVerified: false,
        createdBy,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await this.db.collection('users').doc(userRecord.uid).set(userProfile);

      // Set custom claims
      await this.auth.setCustomUserClaims(userRecord.uid, {
        role,
        permissions: this.getRolePermissions()[role]
      });

      // Log staff creation
      await this.db.collection('staff_accounts').add({
        staffId: userRecord.uid,
        email,
        role,
        createdBy,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        staffId: userRecord.uid,
        email,
        role
      };

    } catch (error) {
      console.error('Create staff account error:', error);
      throw error;
    }
  }

  // Deactivate user account
  async deactivateUser(userId, deactivatedBy, reason) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();

      // Update user status
      await this.db.collection('users').doc(userId).update({
        isActive: false,
        deactivatedBy,
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deactivationReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Disable user in Firebase Auth
      await this.auth.updateUser(userId, {
        disabled: true
      });

      // Log deactivation
      await this.db.collection('user_deactivations').add({
        userId,
        userEmail: userData.email,
        userRole: userData.role,
        deactivatedBy,
        reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'User deactivated successfully',
        userId
      };

    } catch (error) {
      console.error('User deactivation error:', error);
      throw error;
    }
  }

  // Get role change history
  async getRoleChangeHistory(userId) {
    try {
      const changesQuery = await this.db.collection('role_changes')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .get();

      const changes = [];
      changesQuery.forEach(doc => {
        changes.push({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate()
        });
      });

      return changes;

    } catch (error) {
      console.error('Get role change history error:', error);
      throw error;
    }
  }
}

module.exports = new RoleManager();
