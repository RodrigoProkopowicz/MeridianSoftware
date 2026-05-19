/**
 * AdminService.js
 *
 * All Firestore + Functions calls used by the admin panel. Lives under
 * src/admin/ so the imports stay out of the public landing bundle.
 */

import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../config/FirebaseConfig.js';
import firebaseApp from '../../config/FirebaseConfig.js';

const functions = getFunctions(firebaseApp);
const setAdminClaimCallable = httpsCallable(functions, 'setAdminClaim');

/** Products that can have a demoAccess doc. Keep in sync with StockManager / Medicus. */
export const DEMO_PRODUCTS = [
  { id: 'stock-manager', label: 'Stock Manager' },
  { id: 'medicus', label: 'Medicus' },
];

const DEFAULT_DEMO_DAYS = 7;
const MAX_DEMO_DAYS = 7; // Rules cap expiresAt at now + 7d + 5min.

/**
 * Verifies the signed-in user has the `admin` custom claim. Returns the
 * decoded token if so, throws otherwise. Forces a token refresh so a
 * just-granted claim is picked up without requiring a re-login.
 *
 * @param {import('firebase/auth').User} user
 * @returns {Promise<import('firebase/auth').IdTokenResult>}
 */
export async function verifyAdmin(user) {
  if (!user) throw new Error('not-signed-in');
  const tokenResult = await user.getIdTokenResult(true);
  if (tokenResult.claims.admin !== true) {
    throw new Error('not-admin');
  }
  return tokenResult;
}

/**
 * Lists contactSubmissions, newest first.
 * @param {number} [max=100]
 */
export async function listContactSubmissions(max = 100) {
  const q = query(
    collection(db, 'contactSubmissions'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, _type: 'contact', ...d.data() }));
}

/**
 * Lists demoRequests, newest first.
 * @param {number} [max=100]
 */
export async function listDemoRequests(max = 100) {
  const q = query(
    collection(db, 'demoRequests'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, _type: 'demo', ...d.data() }));
}

/**
 * Combined lead feed: contactSubmissions + demoRequests, sorted by createdAt
 * desc. Each item carries `_type` ('contact' | 'demo') so the UI can render
 * the right detail view.
 */
export async function listLeads({ contactLimit = 100, demoLimit = 100 } = {}) {
  const [contacts, demos] = await Promise.all([
    listContactSubmissions(contactLimit),
    listDemoRequests(demoLimit),
  ]);
  return [...contacts, ...demos].sort((a, b) => {
    const aMs = a.createdAt?.toMillis?.() ?? 0;
    const bMs = b.createdAt?.toMillis?.() ?? 0;
    return bMs - aMs;
  });
}

/**
 * Updates `status` and/or `adminNotes` on a lead document.
 * @param {'contact'|'demo'} type
 * @param {string} id
 * @param {{ status?: string, adminNotes?: string }} patch
 */
export async function updateLead(type, id, patch) {
  const collectionName = type === 'contact' ? 'contactSubmissions' : 'demoRequests';
  await updateDoc(doc(db, collectionName, id), patch);
}

/**
 * Lists registered users, ordered by lastLoginAt desc.
 * @param {number} [max=200]
 */
export async function listUsers(max = 200) {
  const q = query(
    collection(db, 'users'),
    orderBy('lastLoginAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Reads all demoAccess docs for a given user.
 * @param {string} uid
 */
export async function listDemoAccess(uid) {
  const q = collection(db, 'users', uid, 'demoAccess');
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ productId: d.id, ...d.data() }));
}

/**
 * Grants (or re-grants, overwriting any existing doc) a demoAccess for a
 * user-product pair. `expiresAt` is set to now + `days` (max 7d, capped to
 * match Firestore rules).
 *
 * @param {string} uid
 * @param {string} productId   — 'stock-manager' | 'medicus'
 * @param {number} [days=7]
 */
export async function grantDemoAccess(uid, productId, days = DEFAULT_DEMO_DAYS) {
  const safeDays = Math.max(1, Math.min(days, MAX_DEMO_DAYS));
  const expiresAt = Timestamp.fromMillis(Date.now() + safeDays * 24 * 60 * 60 * 1000);
  await setDoc(doc(db, 'users', uid, 'demoAccess', productId), {
    productId,
    grantedAt: serverTimestamp(),
    expiresAt,
    status: 'active',
  });
}

/**
 * Revokes a user's demo for a given product by deleting the doc.
 */
export async function revokeDemoAccess(uid, productId) {
  await deleteDoc(doc(db, 'users', uid, 'demoAccess', productId));
}

/**
 * Extends an existing demo by deleting + recreating with a fresh expiresAt.
 * Necessary because rules make the doc immutable on the client side; we
 * sidestep that by removing it first. Admins can do this; regular users
 * cannot.
 */
export async function extendDemoAccess(uid, productId, days = DEFAULT_DEMO_DAYS) {
  await revokeDemoAccess(uid, productId);
  await grantDemoAccess(uid, productId, days);
}

/**
 * Promotes or demotes another user via the setAdminClaim callable.
 * @param {string} uid
 * @param {boolean} admin
 */
export async function setAdminClaim(uid, admin) {
  const result = await setAdminClaimCallable({ uid, admin });
  return result.data;
}

/**
 * Convenience: fetches a single user profile by uid (admin-only read).
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

// Re-export for UI consumers that need to format Firestore Timestamps.
export { Timestamp };
// `collectionGroup` is exported in case future tabs need it (e.g. all
// demoAccess docs across users). Not used today.
export { collectionGroup };
