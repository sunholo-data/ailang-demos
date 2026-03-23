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
import {
  initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, addDoc,
  onSnapshot, orderBy, serverTimestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';

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
  // Any signed-in user is allowed — access is controlled by Firebase Auth
  // authorized domains and Firestore security rules
  return !!user;
}

// ── Firestore: User Settings ─────────────────────────────────────────────────
// Schema: users/{uid} → { repoConfig, formSheetId, buildMode, messagesEnabled, messagesEndpoint }
// NOTE: API keys (gemini, anthropic, openai) are stored in localStorage only — never persisted to Firestore.

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
    console.warn('Failed to load user settings from Firestore:', err.message,
      '— check that Firestore security rules are deployed (website_builder/scripts/check-firestore.sh deploy-rules)');
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

// ── Firestore: Site Metadata & Sharing ──────────────────────────────────────

export function siteDocId(ownerUid, siteSlug) {
  return `${ownerUid}_${siteSlug}`;
}

export async function saveSiteMetadata(ownerUid, siteSlug, metadata) {
  if (!db) return;
  try {
    const id = siteDocId(ownerUid, siteSlug);
    const ref = doc(db, 'sites', id);
    const data = {
      ownerUid,
      siteSlug,
      ...metadata,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), // set on create, overwritten harmlessly on update
    };
    // Try update first (existing doc) — skips createdAt overwrite
    try {
      const { createdAt, ...updateData } = data;
      await updateDoc(ref, updateData);
    } catch (updateErr) {
      // Doc doesn't exist yet — create with createdAt
      await setDoc(ref, data);
    }
  } catch (err) {
    console.warn('Failed to save site metadata:', err.message);
  }
}

export async function listUserSitesMeta(ownerUid) {
  if (!db) return {};
  try {
    const q = query(collection(db, 'sites'), where('ownerUid', '==', ownerUid));
    const snap = await getDocs(q);
    const meta = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.siteSlug) meta[data.siteSlug] = data;
    });
    return meta;
  } catch (err) {
    console.warn('Failed to list site metadata:', err.message);
    return {};
  }
}

export async function getSiteMetadata(ownerUid, siteSlug) {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'sites', siteDocId(ownerUid, siteSlug)));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('Failed to load site metadata:', err.message);
    return null;
  }
}

export async function shareSite(ownerUid, siteSlug, email) {
  if (!db) return;
  const id = siteDocId(ownerUid, siteSlug);
  // Use setDoc(merge) so it works even if the metadata doc doesn't exist yet
  await setDoc(doc(db, 'sites', id), {
    ownerUid,
    siteSlug,
    sharedWith: arrayUnion(email.toLowerCase()),
  }, { merge: true });
}

export async function unshareSite(ownerUid, siteSlug, email) {
  if (!db) return;
  const id = siteDocId(ownerUid, siteSlug);
  await updateDoc(doc(db, 'sites', id), {
    sharedWith: arrayRemove(email.toLowerCase()),
  });
}

export async function getSharedSites(email) {
  if (!db || !email) return [];
  try {
    const q = query(
      collection(db, 'sites'),
      where('sharedWith', 'array-contains', email.toLowerCase())
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Failed to load shared sites:', err.message);
    return [];
  }
}

// ── Firestore: Comments ─────────────────────────────────────────────────────

export function subscribeToComments(ownerUid, siteSlug, callback) {
  if (!db) return () => {};
  const id = siteDocId(ownerUid, siteSlug);
  const q = query(
    collection(db, 'sites', id, 'comments'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.warn('Comments subscription error:', err.message);
    callback([]);
  });
}

export async function addComment(ownerUid, siteSlug, comment) {
  if (!db) return;
  const id = siteDocId(ownerUid, siteSlug);
  await addDoc(collection(db, 'sites', id, 'comments'), {
    ...comment,
    createdAt: serverTimestamp(),
    resolved: false,
  });
}

export async function resolveComment(ownerUid, siteSlug, commentId) {
  if (!db) return;
  const id = siteDocId(ownerUid, siteSlug);
  await updateDoc(doc(db, 'sites', id, 'comments', commentId), { resolved: true });
}

export async function deleteComment(ownerUid, siteSlug, commentId) {
  if (!db) return;
  const id = siteDocId(ownerUid, siteSlug);
  await deleteDoc(doc(db, 'sites', id, 'comments', commentId));
}
