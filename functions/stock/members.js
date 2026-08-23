/**
 * stock/members.js — Cuentas del equipo de un comercio de Stock Manager.
 *
 * El modelo de cuentas del producto tiene dos niveles:
 *
 *   1. La cuenta **dueña**: la crea un admin desde el panel de Meridian
 *      (`createUser`). Es la administradora de los comercios que da de alta.
 *   2. Las cuentas de **empleado**: las crea el dueño desde la pantalla Equipo,
 *      con permisos recortados. Viven en `businesses/{id}/members/{uid}`.
 *
 * Dar de alta un usuario de Authentication exige el Admin SDK, así que pasa por
 * acá y no por el cliente: nadie se auto-registra. Los cambios de permisos, en
 * cambio, son writes comunes que validan las reglas de Firestore.
 *
 * Exports:
 *   - createBusinessMember       → crea la cuenta + el doc de miembro
 *   - setBusinessMemberPassword  → le pone una contraseña nueva a un empleado
 *   - deleteBusinessMember       → lo saca del comercio (y borra la cuenta si no le queda ninguno)
 *   - syncStockMemberAccess      → propaga el acceso al producto del dueño a su equipo
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

/** Producto dentro de `users/{uid}/demoAccess/{productId}`. */
const PRODUCT_ID = 'stock-manager';

/**
 * Catálogo de permisos. Es el espejo de `src/domain/PermissionRules.js` en
 * Stock Manager: viven en repos distintos y no comparten runtime, así que si
 * allá se agrega un permiso, hay que agregarlo acá para que el servidor no lo
 * descarte. Todo lo que no esté en esta lista se ignora al persistir.
 */
const PERMISSION_KEYS = [
  'stock.view', 'stock.manage', 'stock.delete', 'movements.create',
  'suppliers.view', 'suppliers.manage', 'costs.view',
  'sales.view', 'invoices.create', 'invoices.cancel', 'remitos.create',
  'clients.view', 'clients.manage', 'accounts.view', 'receipts.create',
  'insights.view', 'business.manage', 'team.manage',
];

/**
 * Dependencias entre permisos, espejo de `requires` en el catálogo del cliente.
 * Se expanden acá también: la callable es la única vía para crear un miembro y
 * no puede confiar en que el que llama haya hecho la expansión.
 */
const PERMISSION_REQUIRES = {
  'stock.manage':     ['stock.view'],
  'stock.delete':     ['stock.view', 'stock.manage'],
  'movements.create': ['stock.view'],
  'suppliers.manage': ['suppliers.view'],
  'invoices.create':  ['sales.view', 'clients.view'],
  'invoices.cancel':  ['sales.view'],
  'remitos.create':   ['sales.view', 'clients.view'],
  'clients.manage':   ['clients.view'],
  'accounts.view':    ['clients.view'],
  'receipts.create':  ['clients.view', 'accounts.view'],
};

const ROLES = ['admin', 'vendedor', 'deposito', 'consulta', 'custom'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// ============================================================
// Helpers
// ============================================================

function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión para continuar.');
  return req.auth;
}

/**
 * Quien llama tiene que mandar en el comercio: ser su dueño, un empleado
 * activo con `team.manage`, o el super-admin de Meridian.
 *
 * @returns {Promise<{ businessId: string, ownerId: string, business: object }>}
 */
async function assertCanManageTeam(req, businessId) {
  const auth = requireAuth(req);
  if (typeof businessId !== 'string' || !businessId) {
    throw new HttpsError('invalid-argument', 'Falta el comercio.');
  }

  const db = getFirestore();
  const snap = await db.doc(`businesses/${businessId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'El comercio no existe.');

  const business = snap.data();
  if (business.ownerId === auth.uid) return { businessId, ownerId: business.ownerId, business };
  if (auth.token.admin === true) return { businessId, ownerId: business.ownerId, business };

  const member = await db.doc(`businesses/${businessId}/members/${auth.uid}`).get();
  const data = member.exists ? member.data() : null;
  const canManage = data
    && data.active !== false
    && (data.role === 'admin' || (data.permissions || {})['team.manage'] === true);
  if (!canManage) {
    throw new HttpsError('permission-denied', 'No administrás el equipo de este comercio.');
  }

  return { businessId, ownerId: business.ownerId, business };
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Ingresá un email válido.');
  return email;
}

function normalizePassword(value) {
  const password = String(value || '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError('invalid-argument',
      `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.length > 128) {
    throw new HttpsError('invalid-argument', 'La contraseña es demasiado larga.');
  }
  return password;
}

function normalizeDisplayName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpsError('invalid-argument', 'Ingresá el nombre del empleado.');
  if (name.length > 80) throw new HttpsError('invalid-argument', 'El nombre es demasiado largo.');
  return name;
}

/**
 * Solo las claves conocidas, todas booleanas, con las dependencias encendidas.
 * El rol admin habilita todo.
 */
function normalizePermissions(input, role) {
  if (role === 'admin') {
    return Object.fromEntries(PERMISSION_KEYS.map(key => [key, true]));
  }

  const source = input && typeof input === 'object' ? input : {};
  const granted = new Set(PERMISSION_KEYS.filter(key => source[key] === true));

  // Las dependencias pueden encadenarse (receipts.create → accounts.view →
  // clients.view): repetimos hasta que no haya nada nuevo que agregar.
  let grew = true;
  while (grew) {
    grew = false;
    granted.forEach(key => {
      (PERMISSION_REQUIRES[key] || []).forEach(dep => {
        if (!granted.has(dep)) {
          granted.add(dep);
          grew = true;
        }
      });
    });
  }

  return Object.fromEntries(PERMISSION_KEYS.map(key => [key, granted.has(key)]));
}

function normalizeRole(value) {
  return ROLES.includes(value) ? value : 'custom';
}

/** El acceso al producto del empleado es el del dueño: se copia tal cual. */
async function mirrorProductAccess(db, ownerId, memberUid) {
  const ownerAccess = await db.doc(`users/${ownerId}/demoAccess/${PRODUCT_ID}`).get();
  if (!ownerAccess.exists) return;

  const { expiresAt, status } = ownerAccess.data();
  await db.doc(`users/${memberUid}/demoAccess/${PRODUCT_ID}`).set({
    productId: PRODUCT_ID,
    grantedAt: FieldValue.serverTimestamp(),
    expiresAt: expiresAt || null,
    status: status || 'active',
    // Marca de origen: este acceso no se otorgó a la persona, se hereda del
    // comercio. El trigger de abajo lo mantiene al día.
    inheritedFrom: ownerId,
  }, { merge: true });
}

// ============================================================
// createBusinessMember
// ============================================================
/**
 * Crea la cuenta de un empleado y lo suma al comercio.
 *
 * Input:  { businessId, email, password, displayName, role, permissions }
 * Output: { uid, email }
 */
exports.createBusinessMember = onCall({ enforceAppCheck: true }, async (req) => {
  const { businessId, email, password, displayName, role, permissions } = req.data || {};
  const { ownerId } = await assertCanManageTeam(req, businessId);

  const cleanEmail = normalizeEmail(email);
  const cleanPassword = normalizePassword(password);
  const name = normalizeDisplayName(displayName);
  const cleanRole = normalizeRole(role);
  const cleanPermissions = normalizePermissions(permissions, cleanRole);

  const auth = getAuth();
  const db = getFirestore();

  // 1. Cuenta de Authentication. Si el email ya existe, cortamos: sumar una
  //    cuenta ajena a un comercio se hace a mano y con intención, no por acá.
  let userRecord;
  try {
    userRecord = await auth.createUser({
      email: cleanEmail,
      password: cleanPassword,
      displayName: name,
      emailVerified: false,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ya existe una cuenta con ese email.');
    }
    console.error('createBusinessMember: auth create failed', err.message);
    throw new HttpsError('internal', `No pudimos crear la cuenta: ${err.message}`);
  }

  const uid = userRecord.uid;

  // 2. Perfil. `accountType: 'employee'` es lo que le dice al producto que esta
  //    persona no maneja su plan ni crea comercios propios.
  await db.doc(`users/${uid}`).set({
    email: cleanEmail,
    displayName: name,
    photoURL: '',
    provider: 'password',
    accountType: 'employee',
    employerUid: ownerId,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  });

  // 3. Acceso al producto, heredado del dueño.
  await mirrorProductAccess(db, ownerId, uid);

  // 4. Doc de miembro: el rol y los permisos que la app va a leer.
  await db.doc(`businesses/${businessId}/members/${uid}`).set({
    uid,
    businessId,
    email: cleanEmail,
    displayName: name,
    role: cleanRole,
    permissions: cleanPermissions,
    active: true,
    owner: false,
    createdBy: req.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { uid, email: cleanEmail };
});

// ============================================================
// setBusinessMemberPassword
// ============================================================
/**
 * Cambia la contraseña de un empleado. Existe porque en un comercio la
 * contraseña se pierde y no siempre hay un mail a mano para el reseteo.
 *
 * Input:  { businessId, uid, password }
 * Output: { uid, updated: true }
 */
exports.setBusinessMemberPassword = onCall({ enforceAppCheck: true }, async (req) => {
  const { businessId, uid, password } = req.data || {};
  const { ownerId } = await assertCanManageTeam(req, businessId);

  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'Falta el empleado.');
  }
  if (uid === ownerId) {
    throw new HttpsError('failed-precondition',
      'La contraseña del dueño se cambia desde la pantalla de ingreso.');
  }

  const db = getFirestore();
  const member = await db.doc(`businesses/${businessId}/members/${uid}`).get();
  if (!member.exists) throw new HttpsError('not-found', 'Esa persona no es parte del equipo.');

  await getAuth().updateUser(uid, { password: normalizePassword(password) });
  return { uid, updated: true };
});

// ============================================================
// deleteBusinessMember
// ============================================================
/**
 * Saca a alguien del comercio. Si no le queda ningún otro comercio, además se
 * borra su perfil y su cuenta: una cuenta de empleado sin comercio no sirve
 * para nada y quedaría dando vueltas con acceso al login.
 *
 * Input:  { businessId, uid }
 * Output: { uid, deleted: boolean }  (`deleted` = si se borró también la cuenta)
 */
exports.deleteBusinessMember = onCall({ enforceAppCheck: true }, async (req) => {
  const { businessId, uid } = req.data || {};
  const { ownerId } = await assertCanManageTeam(req, businessId);

  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'Falta el empleado.');
  }
  if (uid === ownerId) {
    throw new HttpsError('failed-precondition', 'No se puede sacar al dueño de su comercio.');
  }
  if (uid === req.auth.uid) {
    throw new HttpsError('failed-precondition', 'No podés sacarte a vos mismo del comercio.');
  }

  const db = getFirestore();
  const memberRef = db.doc(`businesses/${businessId}/members/${uid}`);
  const member = await memberRef.get();
  if (!member.exists) throw new HttpsError('not-found', 'Esa persona no es parte del equipo.');

  // ¿Le queda algún OTRO comercio? Se pregunta ANTES de borrar: si la query
  // fallara con el doc ya borrado, la persona quedaría fuera del equipo pero
  // con la cuenta viva y sin forma de limpiarla desde la app (el segundo
  // intento diría "no es parte del equipo"). Ante un error, asumimos que sí
  // tiene otros comercios: sacarle el acceso acá es lo urgente; borrar la
  // cuenta puede esperar y es lo irreversible.
  let quedanOtros = true;
  try {
    const otros = await db.collectionGroup('members').where('uid', '==', uid).get();
    // El proyecto Firebase es compartido con los otros productos: acotamos a
    // `businesses/*` para que una subcolección `members` de otro producto no
    // cuente como comercio y deje cuentas sin limpiar para siempre, en silencio.
    quedanOtros = otros.docs.some(d => {
      const comercio = d.ref.parent.parent;
      return comercio
        && comercio.parent.id === 'businesses'
        && comercio.id !== businessId;
    });
  } catch (err) {
    console.error('deleteBusinessMember: no pudimos revisar otras membresías', err.message);
  }

  await memberRef.delete();

  if (quedanOtros) return { uid, deleted: false };

  // Cuenta de empleado sin comercios: se va del todo. Nunca tocamos cuentas
  // que no sean de empleado (las de Meridian las administra su propio panel).
  const userRef = db.doc(`users/${uid}`);
  const profile = await userRef.get();
  // Solo se borran cuentas de empleado. Sin perfil no podemos saber qué es esta
  // cuenta (las de Meridian las administra su propio panel), y borrar una de
  // Authentication no tiene vuelta atrás: ante la duda, se queda.
  if (!profile.exists || profile.data().accountType !== 'employee') {
    return { uid, deleted: false };
  }

  const demoDocs = await userRef.collection('demoAccess').get();
  await Promise.all(demoDocs.docs.map(d => d.ref.delete()));
  await userRef.delete();

  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('deleteBusinessMember: auth delete failed', err.message);
      throw new HttpsError('internal', `No pudimos borrar la cuenta: ${err.message}`);
    }
  }

  return { uid, deleted: true };
});

// ============================================================
// syncStockMemberAccess (trigger)
// ============================================================
/**
 * El acceso al producto lo tiene el dueño; sus empleados lo heredan. Cuando el
 * de un dueño cambia (se renueva, se extiende, se da de baja), esto lo propaga
 * a todo su equipo, en todos sus comercios.
 *
 * Sin esto, un empleado seguiría entrando con la copia vieja del acceso —o
 * quedaría afuera después de una renovación que sí le corresponde.
 */
exports.syncStockMemberAccess = onDocumentWritten(
  `users/{uid}/demoAccess/${PRODUCT_ID}`,
  async (event) => {
    const ownerUid = event.params.uid;
    const db = getFirestore();

    // Solo propagan los dueños: si el doc que cambió es el espejo de un
    // empleado, no hay nada que hacer (y así no entramos en un bucle).
    const after = event.data?.after;
    if (after?.exists && after.data().inheritedFrom) return;

    const businesses = await db.collection('businesses').where('ownerId', '==', ownerUid).get();
    if (businesses.empty) return;

    // Un mismo empleado puede estar en varios comercios del mismo dueño.
    const memberUids = new Set();
    for (const business of businesses.docs) {
      const members = await business.ref.collection('members').get();
      members.docs.forEach(m => {
        const uid = m.data().uid || m.id;
        if (uid && uid !== ownerUid) memberUids.add(uid);
      });
    }
    if (memberUids.size === 0) return;

    if (!after?.exists) {
      // Al dueño le sacaron el producto: sus empleados lo pierden también.
      await Promise.all([...memberUids].map(uid =>
        db.doc(`users/${uid}/demoAccess/${PRODUCT_ID}`).delete().catch(err =>
          console.warn('syncStockMemberAccess: delete falló', uid, err.message))
      ));
      return;
    }

    const { expiresAt, status } = after.data();
    await Promise.all([...memberUids].map(uid =>
      db.doc(`users/${uid}/demoAccess/${PRODUCT_ID}`).set({
        productId: PRODUCT_ID,
        expiresAt: expiresAt || null,
        status: status || 'active',
        inheritedFrom: ownerUid,
        syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(err =>
        console.warn('syncStockMemberAccess: sync falló', uid, err.message))
    ));
  },
);
