/**
 * Cloud Functions — reCAPTCHA Enterprise assessment
 *
 * Fires on every new document in `demoRequests`. Reads the client-generated
 * `recaptchaToken`, asks the reCAPTCHA Enterprise API to score it, then:
 *   - Marks the doc with the score for auditability.
 *   - Deletes the doc when the score is below SCORE_THRESHOLD.
 *
 * El formulario de contacto NO usa Firestore: arma un mailto: del lado del
 * cliente y abre el cliente de email del usuario, así no necesitamos SMTP.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');

initializeApp();

const SITE_KEY = '6LdAM8csAAAAAL83hLsjmFczA8eI3IMyuW_005pL';
const PROJECT_ID = 'meridiansoftware-6ae75';
const SCORE_THRESHOLD = 0.5;

const recaptcha = new RecaptchaEnterpriseServiceClient();

/**
 * Runs a reCAPTCHA Enterprise assessment.
 * @param {string} token - Token from grecaptcha.enterprise.execute
 * @param {string} expectedAction - Action used on the client
 * @returns {Promise<{ valid: boolean, score: number | null, reasons: string[] }>}
 */
async function assessToken(token, expectedAction) {
  if (!token) {
    return { valid: false, score: null, reasons: ['MISSING_TOKEN'] };
  }

  const [response] = await recaptcha.createAssessment({
    parent: `projects/${PROJECT_ID}`,
    assessment: {
      event: {
        token,
        expectedAction,
        siteKey: SITE_KEY,
      },
    },
  });

  const tokenProps = response.tokenProperties || {};
  if (!tokenProps.valid) {
    return {
      valid: false,
      score: null,
      reasons: [tokenProps.invalidReason || 'INVALID_TOKEN'],
    };
  }

  if (tokenProps.action !== expectedAction) {
    return {
      valid: false,
      score: null,
      reasons: [`ACTION_MISMATCH: got ${tokenProps.action}, want ${expectedAction}`],
    };
  }

  const risk = response.riskAnalysis || {};
  return {
    valid: true,
    score: typeof risk.score === 'number' ? risk.score : null,
    reasons: Array.from(risk.reasons || []),
  };
}

/**
 * Applies assessment result to a Firestore document.
 * Low-score docs are deleted; good docs keep their original status and
 * gain `recaptchaScore` for auditing. In either case the raw token is
 * removed (we only ever needed it at assessment time).
 */
async function applyAssessment(snap, expectedAction) {
  const data = snap.data() || {};
  const result = await assessToken(data.recaptchaToken, expectedAction);

  if (!result.valid || (result.score !== null && result.score < SCORE_THRESHOLD)) {
    console.warn(
      `reCAPTCHA: dropping ${snap.ref.path} — score=${result.score}, reasons=${result.reasons.join(',')}`
    );
    await snap.ref.delete();
    return;
  }

  await snap.ref.update({
    recaptchaScore: result.score,
    recaptchaReasons: result.reasons,
    recaptchaToken: null,
  });
}

/**
 * Demo request submissions.
 */
exports.validateDemoRecaptcha = onDocumentCreated(
  'demoRequests/{id}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await applyAssessment(snap, 'DEMO_REQUEST');
    } catch (err) {
      console.error('validateDemoRecaptcha: assessment failed', err);
    }
  }
);

// ============================================================
// Stock Manager — AFIP facturación electrónica
// ============================================================
const afip = require('./afip');
exports.saveAfipConfig      = afip.saveAfipConfig;
exports.clearAfipConfig     = afip.clearAfipConfig;
exports.getAfipStatus       = afip.getAfipStatus;
exports.testAfipConnection  = afip.testAfipConnection;
exports.getAfipLastNumber   = afip.getAfipLastNumber;
exports.requestAfipCAE      = afip.requestAfipCAE;
exports.lookupCuitPadron    = afip.lookupCuitPadron;
exports.setupAfipExpress    = afip.setupAfipExpress;

// ============================================================
// PromotionalSection — suscripciones Mercado Pago
// Módulo autocontenido en functions/promotional/.
// ============================================================
const promotional = require('./promotional');
exports.createPromotionalPreapproval  = promotional.createPromotionalPreapproval;
exports.mercadoPagoWebhook            = promotional.mercadoPagoWebhook;
exports.cancelPromotionalSubscription = promotional.cancelPromotionalSubscription;
exports.updatePromotionalAmount       = promotional.updatePromotionalAmount;
exports.listMyProducts                = promotional.listMyProducts;

/**
 * setAdminClaim — callable that grants or revokes the `admin` custom claim
 * on a target user. Only existing admins may call it.
 *
 * The very first admin is bootstrapped out-of-band via
 * `functions/scripts/grant-first-admin.mjs` (Admin SDK has no claim check).
 *
 * Input:  { uid: string, admin: boolean }
 * Output: { uid, admin }
 */
exports.setAdminClaim = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { uid, admin } = request.data || {};
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('invalid-argument', '`uid` must be a non-empty string.');
  }
  if (typeof admin !== 'boolean') {
    throw new HttpsError('invalid-argument', '`admin` must be a boolean.');
  }

  // Block self-demotion so the panel can't lock every admin out by accident.
  if (uid === request.auth.uid && admin === false) {
    throw new HttpsError('failed-precondition', 'You cannot revoke your own admin access.');
  }

  const auth = getAuth();
  const target = await auth.getUser(uid);
  const nextClaims = { ...(target.customClaims || {}), admin };
  if (!admin) delete nextClaims.admin;
  await auth.setCustomUserClaims(uid, nextClaims);

  // Reflejamos el rol en el doc para que el panel pueda mostrar quién es admin
  // (los custom claims no se pueden consultar desde el cliente). Campo aparte
  // de `role` (que es el super-admin de Stock Manager).
  await getFirestore().collection('users').doc(uid).set({ admin }, { merge: true });

  return { uid, admin };
});

/**
 * createUser — crea una cuenta de usuario (email + contraseña) desde el panel.
 * Los usuarios NO se auto-registran: solo un admin puede darlos de alta.
 *
 * Crea la cuenta en Authentication, escribe el perfil `users/{uid}` (Admin SDK
 * bypassea las reglas), y opcionalmente otorga el claim admin y/o accesos demo.
 *
 * Input:  {
 *   email: string, password: string, displayName?: string, admin?: boolean,
 *   demos?: Array<{ productId: 'stock-manager'|'medicus', days?: number }>
 * }
 * Output: { uid, email }
 */
exports.createUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { email, password, displayName, admin = false, demos = [] } = request.data || {};

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Ingresá un email válido.');
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  }
  if (typeof admin !== 'boolean') {
    throw new HttpsError('invalid-argument', '`admin` debe ser booleano.');
  }
  if (!Array.isArray(demos)) {
    throw new HttpsError('invalid-argument', '`demos` debe ser una lista.');
  }

  const auth = getAuth();
  const db = getFirestore();
  const name = typeof displayName === 'string' ? displayName.trim() : '';

  // 1. Crear la cuenta de Authentication.
  let userRecord;
  try {
    userRecord = await auth.createUser({
      email: email.trim(),
      password,
      displayName: name || undefined,
      emailVerified: false,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ya existe una cuenta con ese email.');
    }
    if (err.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'La contraseña no es válida.');
    }
    console.error('createUser: auth create failed', err.message);
    throw new HttpsError('internal', `No pudimos crear la cuenta: ${err.message}`);
  }

  const uid = userRecord.uid;

  // 2. Claim admin (opcional).
  if (admin) {
    await auth.setCustomUserClaims(uid, { admin: true });
  }

  // 3. Perfil en Firestore.
  await db.collection('users').doc(uid).set({
    email: email.trim(),
    displayName: name,
    photoURL: '',
    provider: 'password',
    admin,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  });

  // 4. Accesos demo (opcional).
  const ALLOWED_PRODUCTS = ['stock-manager', 'medicus'];
  for (const demo of demos) {
    const productId = demo && demo.productId;
    if (!ALLOWED_PRODUCTS.includes(productId)) continue;
    const days = Math.max(1, Math.min(Number(demo.days) || 7, 365));
    const expiresAt = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
    await db.collection('users').doc(uid).collection('demoAccess').doc(productId).set({
      productId,
      grantedAt: FieldValue.serverTimestamp(),
      expiresAt,
      status: 'active',
    });
  }

  return { uid, email: email.trim() };
});

/**
 * deleteUser — borra definitivamente un usuario: su cuenta de Authentication,
 * el doc `users/{uid}` y la subcolección `demoAccess`. Solo admins. No se puede
 * borrar a uno mismo.
 *
 * Input:  { uid: string }
 * Output: { uid, deleted: true }
 */
exports.deleteUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required.');
  }

  const { uid } = request.data || {};
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('invalid-argument', '`uid` must be a non-empty string.');
  }
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'No podés eliminar tu propia cuenta.');
  }

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);

  // 1. Borramos la subcolección demoAccess (no se borra sola al borrar el doc).
  const demoSnap = await userRef.collection('demoAccess').get();
  await Promise.all(demoSnap.docs.map(d => d.ref.delete()));

  // 2. Borramos el doc del usuario.
  await userRef.delete();

  // 3. Borramos la cuenta de Authentication (ignoramos si ya no existe).
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('deleteUser: auth delete failed', err.message);
      throw new HttpsError('internal', `No pudimos borrar la cuenta: ${err.message}`);
    }
  }

  return { uid, deleted: true };
});
