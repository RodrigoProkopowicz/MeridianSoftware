/**
 * afip/store.js — Lectura/escritura de la config AFIP de cada comercio.
 *
 * Path: businesses/{businessId}/secrets/afip
 *
 * Solo accesible vía admin SDK (las reglas de Firestore deniegan acceso
 * directo desde el cliente — el cliente interactúa via callable functions).
 *
 * El SDK @afipsdk/afip.js cachea internamente el TA (token de AFIP), por eso
 * no necesitamos guardarlo en Firestore.
 *
 * Estructura del documento:
 * {
 *   env:           'homologation' | 'production',
 *   cuit:          string (11 dígitos),
 *   pointOfSale:   number,
 *   taxCondition:  'RI' | 'MT',
 *   configuredAt:  Timestamp,
 *   updatedAt:     Timestamp,
 * }
 */

const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function secretRef(businessId) {
  return getFirestore().doc(`businesses/${businessId}/secrets/afip`);
}

async function readSecret(businessId) {
  const snap = await secretRef(businessId).get();
  return snap.exists ? snap.data() : null;
}

async function writeSecret(businessId, patch) {
  await secretRef(businessId).set({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function assertBusinessOwner(businessId, uid) {
  const snap = await getFirestore().doc(`businesses/${businessId}`).get();
  if (!snap.exists) {
    const err = new Error('Comercio no encontrado');
    err.code = 'not-found';
    throw err;
  }
  if (snap.data().ownerId !== uid) {
    const err = new Error('Sin permisos sobre este comercio');
    err.code = 'permission-denied';
    throw err;
  }
  return snap.data();
}

module.exports = {
  readSecret,
  writeSecret,
  assertBusinessOwner,
};
