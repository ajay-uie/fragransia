const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Export functions
exports.api = functions.https.onRequest((req, res) => {
  res.send('Perfume Brand API is running');
});
