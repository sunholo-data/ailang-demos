/**
 * Firebase configuration for the Website Builder portal.
 * Uses the ailang-dev Firebase project.
 *
 * To set up:
 * 1. Go to https://console.firebase.google.com/project/ailang-dev
 * 2. Project settings → Your apps → Web app → Config
 * 3. Copy the config object and replace the placeholder below
 * 4. Enable Authentication → Sign-in method → Google
 * 5. Add your domain to Authorized domains
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// TODO: Replace with real config from Firebase console (ailang-dev project)
const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "ailang-dev.firebaseapp.com",
  projectId: "ailang-dev",
  storageBucket: "ailang-dev.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

// Allowlist for MVP — update with real emails
const ALLOWED_EMAILS = [
  'mark@sunholo.com',
  // add mum's email here
];

let app;
let auth;

export function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    return true;
  } catch (err) {
    console.warn('Firebase init failed (using dev mode):', err.message);
    return false;
  }
}

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
  // In production: check ALLOWED_EMAILS or Firebase custom claims
  // For dev: allow any signed-in user
  return ALLOWED_EMAILS.includes(user.email) || import.meta.env.DEV;
}
