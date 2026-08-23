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

/**
 * Quién puede tocar esto: el dueño siempre, y un empleado activo si su doc de
 * miembro le da el permiso pedido (o si tiene rol admin en el comercio).
 *
 * Existe porque las callables de ARCA son la única vía a la facturación
 * electrónica: si acá solo entrara el dueño, un empleado con `invoices.create`
 * podría cargar la factura pero nunca pedirle el CAE a ARCA, y la promesa del
 * permiso quedaría a medias.
 *
 * @param {string} businessId
 * @param {string} uid
 * @param {string|string[]|null} permission  Permiso(s) que habilitan; con una
 *   lista alcanza con tener uno. null = solo el dueño.
 */
async function assertBusinessAccess(businessId, uid, permission) {
  const db = getFirestore();
  const snap = await db.doc(`businesses/${businessId}`).get();
  if (!snap.exists) {
    const err = new Error('Comercio no encontrado');
    err.code = 'not-found';
    throw err;
  }

  const business = snap.data();
  if (business.ownerId === uid) return business;

  const required = Array.isArray(permission) ? permission : (permission ? [permission] : []);
  if (required.length > 0) {
    const member = await db.doc(`businesses/${businessId}/members/${uid}`).get();
    const data = member.exists ? member.data() : null;
    const permissions = (data && data.permissions) || {};
    const allowed = !!data
      && data.active !== false
      && (data.role === 'admin' || required.some(key => permissions[key] === true));
    if (allowed) return business;
  }

  const err = new Error('Sin permisos sobre este comercio');
  err.code = 'permission-denied';
  throw err;
}

module.exports = {
  readSecret,
  writeSecret,
  assertBusinessAccess,
};
