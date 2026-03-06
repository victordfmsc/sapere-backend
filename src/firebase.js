const admin = require('firebase-admin');

let db, storage;

function initFirebase() {
  if (admin.apps.length === 0) {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Option 1: Full JSON as single env var (most reliable)
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
      console.log('[Firebase] Using FIREBASE_SERVICE_ACCOUNT JSON');
    } else {
      // Option 2: Individual env vars
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      });
      console.log('[Firebase] Using individual env vars');
    }

    admin.initializeApp({
      credential,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET ||
        (process.env.FIREBASE_SERVICE_ACCOUNT
          ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).project_id + '.firebasestorage.app'
          : undefined),
    });
    console.log('[Firebase] Initialized successfully');
  }
  db = admin.firestore();
  storage = admin.storage().bucket();
}

function getDb() {
  if (!db) initFirebase();
  return db;
}

function getStorage() {
  if (!storage) initFirebase();
  return storage;
}

module.exports = { initFirebase, getDb, getStorage };
