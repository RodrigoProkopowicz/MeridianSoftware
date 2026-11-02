/**
 * stock/members.js — Cuentas del equipo de un comercio de Stock Manager.
 *
 * El modelo de cuentas del producto tiene dos niveles:
 *
 *   1. La cuenta **dueña**: la crea un admin desde el panel de Meridian
 *      (`createUser`). Es la administradora de los comercios que da de alta.
 *   2. Las cuentas de **empleado**: las crea el dueño desde la pantalla Equipo,
 *      con permisos recortados. Viven en `businesses/{id}/members/{uid}`, un doc
 *      por comercio: la misma persona puede trabajar en varios del mismo dueño,
 *      con un rol y permisos distintos en cada uno.
 *
 * Dar de alta un usuario de Authentication exige el Admin SDK, así que pasa por
 * acá y no por el cliente: nadie se auto-registra. Los cambios de permisos, en
 * cambio, son writes comunes que validan las reglas de Firestore.
 *
 * Exports:
 *   - createBusinessMember       → crea la cuenta + el doc de miembro
 *   - assignBusinessMember       → suma a un empleado a otro comercio del mismo dueño
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
  'stockcount.perform', 'stockcount.manage',
  'suppliers.view', 'suppliers.manage', 'costs.view',
  'sales.view', 'invoices.create', 'invoices.cancel', 'remitos.create',
  'clients.view', 'clients.manage', 'accounts.view', 'receipts.create',
  'profits.view',
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
  'stockcount.perform': ['stock.view'],
  'stockcount.manage':  ['stock.view', 'stockcount.perform'],
  'suppliers.manage': ['suppliers.view'],
  'invoices.create':  ['sales.view', 'clients.view'],
  'invoices.cancel':  ['sales.view'],
  'remitos.create':   ['sales.view', 'clients.view'],
  'clients.manage':   ['clients.view'],
  'accounts.view':    ['clients.view', 'sales.view'],
  'receipts.create':  ['clients.view', 'accounts.view'],
  // La ganancia neta se calcula sobre los comprobantes: sin verlos no hay de
  // dónde sacarla. No viene con ningún rol salvo admin.
  'profits.view':     ['sales.view'],
  'insights.view':    ['stock.view'],
};

const ROLES = ['admin', 'vendedor', 'deposito', 'consulta', 'custom'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Código gRPC con el que Firestore rechaza `create()` sobre un doc que ya existe. */
const GRPC_ALREADY_EXISTS = 6;

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
 * `isAdmin` dice si además lo administra (dueño, super-admin o rol admin), que
 * es más que manejar el equipo: `team.manage` es un tilde, y el rol admin es lo
 * que ningún tilde tiene que poder otorgar.
 *
 * @returns {Promise<{ businessId: string, ownerId: string, business: object, isAdmin: boolean }>}
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
  if (business.ownerId === auth.uid) return { businessId, ownerId: business.ownerId, business, isAdmin: true };
  if (auth.token.admin === true) return { businessId, ownerId: business.ownerId, business, isAdmin: true };

  const member = await db.doc(`businesses/${businessId}/members/${auth.uid}`).get();
  const data = member.exists ? member.data() : null;
  const canManage = data
    && data.active !== false
    && (data.role === 'admin' || (data.permissions || {})['team.manage'] === true);
  if (!canManage) {
    throw new HttpsError('permission-denied', 'No administrás el equipo de este comercio.');
  }

  return { businessId, ownerId: business.ownerId, business, isAdmin: data.role === 'admin' };
}

/**
 * El rol admin lo da solo quien administra el comercio. Si alcanzara con
 * `team.manage`, un encargado crearía una cuenta admin y entraría con ella a
 * leer el registro, y lo que hiciera dejaría de registrarse. Las reglas lo
 * frenan en el update de `members`, pero estas callables se las saltean.
 */
function assertCanGrantRole(role, isAdmin) {
  if (role === 'admin' && !isAdmin) {
    throw new HttpsError('permission-denied',
      'El rol Administrador lo da solo quien administra el comercio.');
  }
}

/**
 * Lo que se le hace a la cuenta vale para todos sus comercios: quien llama tiene
 * que administrar el equipo de cada uno, no solo el del comercio desde el que lo
 * pide. Si no, un encargado de un local entra con esa cuenta a otro que no
 * administra, y lo que haga queda firmado con el nombre de otra persona en el
 * registro.
 *
 * Donde la persona tiene rol admin, quien llama tiene que ser admin también: con
 * su contraseña, `team.manage` llegaría a lo que ese tilde no da. Por eso se
 * recorren todas las membresías sin saltear ninguna: la cuenta puede ser común
 * en el comercio desde el que se pide y admin en otro.
 *
 * Si la consulta falla, el error sube y no se cambia nada: sin saber en qué
 * comercios está la persona, no hay forma de decir que se puede.
 */
async function assertManagesEveryBusinessOf(req, uid) {
  const memberships = await getFirestore().collectionGroup('members').where('uid', '==', uid).get();

  for (const membership of memberships.docs) {
    // El proyecto es compartido: una subcolección `members` de otro producto no
    // es un comercio (mismo recorte que en deleteBusinessMember).
    const comercio = membership.ref.parent.parent;
    if (!comercio || comercio.parent.id !== 'businesses') continue;

    let access;
    try {
      access = await assertCanManageTeam(req, comercio.id);
    } catch (err) {
      // `deleteBusiness` no borra en cascada: un comercio que ya no existe deja
      // docs de miembro huérfanos, y esos no le dan acceso a nadie.
      if (err.code === 'not-found') continue;
      if (err.code === 'permission-denied') {
        throw new HttpsError('permission-denied',
          'Esa persona también trabaja en otro comercio que no administrás: su contraseña la cambia quien administre todos.');
      }
      throw err;
    }

    if (membership.data().role === 'admin' && !access.isAdmin) {
      throw new HttpsError('permission-denied',
        'Esa persona tiene rol Administrador: su contraseña la cambia otro administrador de ese comercio.');
    }
  }
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
  const { ownerId, isAdmin } = await assertCanManageTeam(req, businessId);

  const cleanEmail = normalizeEmail(email);
  const cleanPassword = normalizePassword(password);
  const name = normalizeDisplayName(displayName);
  const cleanRole = normalizeRole(role);
  assertCanGrantRole(cleanRole, isAdmin);
  const cleanPermissions = normalizePermissions(permissions, cleanRole);

  const auth = getAuth();
  const db = getFirestore();

  // 1. Cuenta de Authentication. Si el email ya existe, cortamos: acá una cuenta
  //    nunca se adopta por su email, porque cualquiera podría sumarse la de otro.
  //    A quien ya trabaja en otro comercio del mismo dueño lo suma
  //    `assignBusinessMember`, que exige administrar los dos. El mensaje orienta
  //    sin decir a quién pertenece la cuenta.
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
      throw new HttpsError('already-exists',
        'Ya existe una cuenta con ese email. Si esa persona trabaja en otro de tus comercios, sumala con "Sumar de otro comercio".');
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
// assignBusinessMember
// ============================================================
/**
 * Suma a un empleado que ya existe a otro comercio del mismo dueño: la misma
 * cuenta, con su propio rol y sus propios permisos en cada lugar.
 *
 * Exige administrar el equipo de los DOS comercios. Si alcanzara con el destino,
 * un encargado podría traerse a alguien de un local que no administra y ganar
 * sobre esa persona la baja y el cambio de contraseña. El rol admin, además, lo
 * da solo quien administra el comercio destino.
 *
 * Solo entre comercios del mismo dueño: el acceso al producto es un único doc
 * por cuenta y se hereda del dueño, así que dos dueños se lo pisarían.
 *
 * La entrada es un uid y no un email, para que no sirva de consulta de qué
 * cuentas existen; el email y el nombre salen del doc de origen, nunca del
 * cliente. No toca Authentication, `users` ni `demoAccess`: con el mismo dueño,
 * la cuenta y su acceso ya están como tienen que estar.
 *
 * Input:  { businessId, sourceBusinessId, uid, role, permissions }
 * Output: { uid, businessId }
 */
exports.assignBusinessMember = onCall({ enforceAppCheck: true }, async (req) => {
  const { businessId, sourceBusinessId, uid, role, permissions } = req.data || {};
  const { ownerId, isAdmin } = await assertCanManageTeam(req, businessId);
  const source = await assertCanManageTeam(req, sourceBusinessId);

  if (businessId === sourceBusinessId || source.ownerId !== ownerId) {
    throw new HttpsError('permission-denied',
      'Solo se puede sumar a alguien desde otro comercio del mismo dueño.');
  }

  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'Falta el empleado.');
  }
  if (uid === ownerId) {
    throw new HttpsError('failed-precondition', 'El dueño ya administra todos sus comercios.');
  }
  if (uid === req.auth.uid) {
    throw new HttpsError('failed-precondition', 'No podés sumarte a vos mismo a un comercio.');
  }

  const db = getFirestore();

  const profile = await db.doc(`users/${uid}`).get();
  const account = profile.exists ? profile.data() : null;
  if (account?.accountType !== 'employee' || account.employerUid !== ownerId) {
    throw new HttpsError('failed-precondition', 'Esa cuenta no es de un empleado de este dueño.');
  }

  const origin = await db.doc(`businesses/${sourceBusinessId}/members/${uid}`).get();
  if (!origin.exists) {
    throw new HttpsError('not-found', 'Esa persona no es parte del equipo de origen.');
  }
  const originData = origin.data();
  if (originData.owner === true) {
    throw new HttpsError('failed-precondition', 'El dueño ya administra todos sus comercios.');
  }
  if (originData.active === false) {
    throw new HttpsError('failed-precondition',
      'Esa persona está desactivada en el comercio de origen: reactivala antes de sumarla a otro.');
  }

  const cleanRole = normalizeRole(role);
  assertCanGrantRole(cleanRole, isAdmin);
  const cleanPermissions = normalizePermissions(permissions, cleanRole);

  // `create()` y no `set()`: si la persona ya está en este comercio, pisar el doc
  // le borraría en silencio el rol y los permisos que tiene acá.
  try {
    await db.doc(`businesses/${businessId}/members/${uid}`).create({
      uid,
      businessId,
      email: originData.email || '',
      displayName: originData.displayName || '',
      role: cleanRole,
      permissions: cleanPermissions,
      active: true,
      owner: false,
      createdBy: req.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err.code === GRPC_ALREADY_EXISTS) {
      throw new HttpsError('already-exists',
        'Esa persona ya es parte de este comercio. Si está desactivada, reactivala desde Equipo.');
    }
    throw err;
  }

  return { uid, businessId };
});

// ============================================================
// setBusinessMemberPassword
// ============================================================
/**
 * Cambia la contraseña de un empleado. Existe porque en un comercio la
 * contraseña se pierde y no siempre hay un mail a mano para el reseteo.
 *
 * La contraseña es de toda la cuenta, no de este comercio: por eso solo se toca
 * en cuentas de empleado y exige administrar todos los comercios de la persona,
 * y ser admin en los que ella tiene ese rol.
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

  // Sin perfil no podemos saber qué es esta cuenta: ante la duda, no se toca.
  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists || profile.data().accountType !== 'employee') {
    throw new HttpsError('failed-precondition', 'Solo se puede cambiar la contraseña de una cuenta de empleado.');
  }

  await assertManagesEveryBusinessOf(req, uid);

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
 * Output: { uid, deleted: boolean, reason?: string, activeElsewhere?: boolean }
 *
 * `deleted` dice si se borró también la cuenta. Cuando no, `reason` dice por qué,
 * para que el cliente no afirme lo que no pasó:
 *   - 'other-businesses' → sigue en otro comercio
 *   - 'unverified'       → no pudimos confirmar si le queda alguno
 *   - 'not-employee'     → no es una cuenta de empleado
 */
exports.deleteBusinessMember = onCall({ enforceAppCheck: true }, async (req) => {
  const { businessId, uid } = req.data || {};
  const { ownerId, isAdmin } = await assertCanManageTeam(req, businessId);

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
  // Igual que en las reglas de `members`: a un administrador lo toca solo otro.
  if (member.data().role === 'admin' && !isAdmin) {
    throw new HttpsError('permission-denied', 'A un administrador lo saca solo otro administrador.');
  }

  // ¿Le queda algún OTRO comercio? Se pregunta ANTES de borrar: si la query
  // fallara con el doc ya borrado, la persona quedaría fuera del equipo pero
  // con la cuenta viva y sin forma de limpiarla desde la app (el segundo
  // intento diría "no es parte del equipo"). Ante un error, asumimos que sí
  // tiene otros comercios: sacarle el acceso acá es lo urgente; borrar la
  // cuenta puede esperar y es lo irreversible.
  let quedanOtros = true;
  let verificado = false;
  let activeElsewhere;
  try {
    const otros = await db.collectionGroup('members').where('uid', '==', uid).get();
    // El proyecto Firebase es compartido con los otros productos: acotamos a
    // `businesses/*` para que una subcolección `members` de otro producto no
    // cuente como comercio y deje cuentas sin limpiar para siempre, en silencio.
    const membresias = otros.docs.filter(d => {
      const comercio = d.ref.parent.parent;
      return comercio && comercio.parent.id === 'businesses' && comercio.id !== businessId;
    });
    // `deleteBusiness` no borra en cascada: un comercio que ya no existe deja
    // docs de miembro huérfanos, y si contaran, la cuenta quedaría viva sin
    // ningún equipo desde donde sacarla. Mismo criterio que
    // assertManagesEveryBusinessOf. Si esta lectura falla, cae en el catch.
    const comercios = await Promise.all(membresias.map(d => d.ref.parent.parent.get()));
    const vigentes = membresias.filter((d, i) => comercios[i].exists);
    quedanOtros = vigentes.length > 0;
    activeElsewhere = vigentes.some(d => d.data().active !== false);
    verificado = true;
  } catch (err) {
    console.error('deleteBusinessMember: no pudimos revisar otras membresías', err.message);
  }

  if (quedanOtros) {
    await memberRef.delete();
    return { uid, deleted: false, reason: verificado ? 'other-businesses' : 'unverified', activeElsewhere };
  }

  // Cuenta de empleado sin comercios: se va del todo. Nunca tocamos cuentas
  // que no sean de empleado (las de Meridian las administra su propio panel).
  const userRef = db.doc(`users/${uid}`);
  const profile = await userRef.get();
  // Solo se borran cuentas de empleado. Sin perfil no podemos saber qué es esta
  // cuenta (las de Meridian las administra su propio panel), y borrar una de
  // Authentication no tiene vuelta atrás: ante la duda, se queda.
  if (!profile.exists || profile.data().accountType !== 'employee') {
    // Sin perfil puede ser el final de una baja a medias, o una cuenta que el
    // panel de Meridian ya borró: no se dice que la cuenta sigue si no sigue.
    let accountGone = false;
    if (!profile.exists) {
      try {
        await getAuth().getUser(uid);
      } catch (err) {
        if (err.code !== 'auth/user-not-found') {
          throw new HttpsError('internal', `No pudimos revisar la cuenta: ${err.message}`);
        }
        accountGone = true;
      }
    }
    await memberRef.delete();
    return accountGone ? { uid, deleted: true } : { uid, deleted: false, reason: 'not-employee' };
  }

  // El doc de miembro va último: es lo que deja reintentar. Si algo falla antes,
  // la persona sigue en el equipo y el segundo intento termina el trabajo; al
  // revés, diría "no es parte del equipo" con la cuenta viva y sin forma de
  // limpiarla, y el cliente no registraría una baja que sí pasó.
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('deleteBusinessMember: auth delete failed', err.message);
      throw new HttpsError('internal', `No pudimos borrar la cuenta: ${err.message}`);
    }
  }

  const demoDocs = await userRef.collection('demoAccess').get();
  await Promise.all(demoDocs.docs.map(d => d.ref.delete()));
  await userRef.delete();
  await memberRef.delete();

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
