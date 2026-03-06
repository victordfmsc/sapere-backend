const admin = require('firebase-admin');

let db, storage;

function initFirebase() {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          : undefined,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
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
