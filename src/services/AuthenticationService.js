/**
 * AuthenticationService.js
 *
 * Manages Firebase Authentication flows. Accounts are provisioned by an admin
 * from the panel (email + password) — there is NO self-service registration.
 * This service only signs an existing account in/out, exposes password reset,
 * and keeps the user's Firestore profile fresh (lastLoginAt) on login.
 */

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, appCheckReady } from '../config/FirebaseConfig.js';

/** @type {Array<Function>} */
const authStateListeners = [];

/** @type {import('firebase/auth').User|null} */
let currentUser = null;

/** True once Firebase has delivered the first auth state (logged in or out). */
let authResolved = false;

/**
 * Initializes the auth state listener.
 * Call this once at app startup.
 */
export function initializeAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    authResolved = true;
    if (user) {
      // Fire-and-forget: don't block listener propagation on the Firestore write.
      createOrUpdateUserProfile(user).catch(err =>
        console.error('AuthenticationService: Failed to update user profile', err)
      );
    }
    authStateListeners.forEach(callback => callback(user));
  });
}

/**
 * Sign in with an email + password. The account must have been created by an
 * admin beforehand (there is no self-service sign-up).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signInWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Sends a password-reset email so a user can set / recover their password.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

/**
 * Signs out the current user.
 * @returns {Promise<void>}
 */
export async function signOut() {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    // Cerrar sesión es prácticamente infalible (el estado local se limpia igual)
    // y un fallo no es accionable para el caller. Lo logueamos y NO rechazamos,
    // así los varios handlers de logout fire-and-forget
    // (AdminShell, AdminGate, PromoForm, AccountHeader) no generan
    // unhandled rejections.
    console.error('AuthenticationService: signOut failed', err);
  }
}

/**
 * Subscribes to auth state changes.
 * Only fires once Firebase has resolved the initial state, so subscribers
 * never see a spurious null before session restoration completes.
 * @param {Function} callback - Called with user object or null
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  authStateListeners.push(callback);
  if (authResolved) {
    callback(currentUser);
  }
  return () => {
    const index = authStateListeners.indexOf(callback);
    if (index > -1) authStateListeners.splice(index, 1);
  };
}

/** True once Firebase has delivered its first auth-state event. */
export function isAuthResolved() {
  return authResolved;
}

/**
 * Returns the currently authenticated user.
 * @returns {import('firebase/auth').User|null}
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Creates or updates a user profile document in Firestore.
 * @param {import('firebase/auth').User} user
 */
async function createOrUpdateUserProfile(user) {
  // Wait for App Check before the first Firestore round-trip. Session
  // restoration can fire this in milliseconds — earlier than the deferred
  // App Check init — and a write without a token gets rejected when
  // enforcement is on.
  await appCheckReady;

  const userRef = doc(db, 'users', user.uid);

  try {
    const userSnap = await getDoc(userRef);
    const providerData = user.providerData[0] || {};

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        provider: providerData.providerId || 'unknown',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        lastLoginAt: serverTimestamp(),
        displayName: user.displayName || userSnap.data().displayName,
        photoURL: user.photoURL || userSnap.data().photoURL,
      }, { merge: true });
    }
  } catch (error) {
    console.error('AuthenticationService: Failed to update user profile', error);
  }
}
