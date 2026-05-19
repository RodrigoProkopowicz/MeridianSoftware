/**
 * DemoAccessService.js
 *
 * Self-service 7-day demo gating for in-house products (Stock Manager, Medicus).
 *
 * Flow:
 *   1. User signs in on meridian-software.com.
 *   2. Clicks "Activar demo de 7 días" on a product card.
 *   3. We write users/{uid}/demoAccess/{productId} with grantedAt + expiresAt.
 *   4. Stock Manager / Medicus check that doc on every login and refuse access
 *      when it doesn't exist or is past expiresAt.
 *
 * The doc is immutable per Firestore rules — extending or renewing requires
 * server-side intervention (Firebase Console / Admin SDK).
 */

import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../config/FirebaseConfig.js';

/** Duration of the demo trial in milliseconds. */
const DEMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Activates a 7-day demo for the given product. Idempotent only in the sense
 * that subsequent calls fail at the rules level (the doc is immutable once
 * created). Caller should check `getDemoAccess` first to avoid the failed
 * write round-trip.
 * @param {string} uid
 * @param {string} productId — one of DEMO_PRODUCTS.*
 * @returns {Promise<{ expiresAtMs: number }>}
 */
export async function activateDemoAccess(uid, productId) {
  if (productId !== DEMO_PRODUCTS.STOCK_MANAGER && productId !== DEMO_PRODUCTS.MEDICUS) {
    throw new Error(`DemoAccessService: invalid productId ${productId}`);
  }

  const expiresAtMs = Date.now() + DEMO_DURATION_MS;
  const expiresAt = Timestamp.fromMillis(expiresAtMs);

  const ref = doc(db, 'users', uid, 'demoAccess', productId);
  await setDoc(ref, {
    productId,
    grantedAt: serverTimestamp(),
    expiresAt,
    status: 'active',
  });

  return { expiresAtMs };
}

/** Days remaining until expiry (0 if expired). */
export function daysRemaining(expiresAtMs) {
  const ms = expiresAtMs - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
