const admin = require("firebase-admin");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require("./fragransia-dbms-firebase-adminsdk-fbsvc-4c0ee348b5.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function resetTestUserPassword() {
  try {
    const email = "testuser@example.com";
    const newPassword = "password123";

    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword,
    });

    console.log("Successfully reset password for user:", userRecord.uid);

  } catch (error) {
    console.error("Error resetting test user password:", error);
  }
}

resetTestUserPassword();


