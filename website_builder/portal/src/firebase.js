/**
 * Firebase configuration for the Website Builder portal.
 * Uses the ailang-multivac-dev Firebase project.
 *
 * Config values come from Terraform output (firebase_web_app_config).
 * Run: terraform output firebase_web_app_config
 *
 * Features:
 *   - Google Auth (sign-in with popup)
 *   - Firestore (per-user settings in "website-builder" database)
 *   - Graceful fallback: works without Firebase (dev mode / skip auth)
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// Firebase config from Terraform output (firebase_web_app_config)
const firebaseConfig = {
  apiKey: "AIzaSyCkvFxVilpZkqao1ntOPQbhwMy2GJI0FIE",
  authDomain: "ailang-multivac-dev.firebaseapp.com",
  projectId: "ailang-multivac-dev",
  storageBucket: "ailang-multivac-dev.appspot.com",
  messagingSenderId: "812435936917",
  appId: "1:812435936917:web:2dcf2a315dfc7cb2b66d9c"
};

// Named Firestore database (not default)
const FIRESTORE_DB_ID = 'website-builder';

// Allowlist for MVP — update with real emails
const ALLOWED_EMAILS = [
  'm@sunholo.com',
  // add more emails here
];

let app;
let auth;
let db;

export function initFirebase() {
  try {
    if (firebaseConfig.apiKey.startsWith('REPLACE_WITH')) {
      console.warn('Firebase config not set — running in dev mode');
      return false;
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = initializeFirestore(app, {}, FIRESTORE_DB_ID);
    return true;
  } catch (err) {
    console.warn('Firebase init failed (using dev mode):', err.message);
    return false;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase not initialized');
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}

export function onAuthChange(callback) {
  if (!auth) {
    // Dev mode: call with null user immediately
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export function isAllowed(user) {
  if (!user) return false;
  return ALLOWED_EMAILS.includes(user.email) || import.meta.env.DEV;
}

// ── Firestore: User Settings ─────────────────────────────────────────────────
// Schema: users/{uid} → { geminiApiKey, repoConfig, formSheetId, buildMode, messagesEnabled, messagesEndpoint }

/**
 * Load user settings from Firestore.
 * Returns null if Firestore is not available or user doc doesn't exist.
 */
export async function getUserSettings(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('Failed to load user settings from Firestore:', err.message);
    return null;
  }
}

/**
 * Save user settings to Firestore (merge — doesn't overwrite unset fields).
 * Silently fails if Firestore is not available.
 */
export async function saveUserSettings(uid, settings) {
  if (!db || !uid) return;
  try {
    await setDoc(doc(db, 'users', uid), settings, { merge: true });
  } catch (err) {
    console.warn('Failed to save user settings to Firestore:', err.message);
  }
}
