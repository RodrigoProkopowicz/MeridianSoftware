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

  return { uid, admin };
});
