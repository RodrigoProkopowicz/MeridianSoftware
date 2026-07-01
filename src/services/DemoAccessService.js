/**
 * DemoAccessService.js
 *
 * Read helpers for the 7-day demo gating of in-house products (Stock Manager,
 * Medicus). Demo access is now GRANTED BY AN ADMIN from the panel (there is no
 * self-service activation): a visitor requests a trial via the public form, the
 * admin creates the account and writes users/{uid}/demoAccess/{productId}.
 *
 * Stock Manager / Medicus (and /cuenta) read that doc to know whether a demo is
 * active and how many days remain.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/FirebaseConfig.js';

/** Allowed product IDs — must match Firestore rules. */
export const DEMO_PRODUCTS = Object.freeze({
  STOCK_MANAGER: 'stock-manager',
  MEDICUS: 'medicus',
});

/**
 * Returns the existing demo access state for a product, or null if no demo
 * has been activated. Shape: `{ status, grantedAt, expiresAt, expired }`.
 * @param {string} uid
 * @param {string} productId
 */
export async function getDemoAccess(uid, productId) {
  const ref = doc(db, 'users', uid, 'demoAccess', productId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
  return {
    productId,
    status: data.status,
    grantedAt: data.grantedAt ?? null,
    expiresAt: data.expiresAt ?? null,
    expiresAtMs,
    expired: expiresAtMs < Date.now(),
  };
}

/** Days remaining until expiry (0 if expired). */
export function daysRemaining(expiresAtMs) {
  const ms = expiresAtMs - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
