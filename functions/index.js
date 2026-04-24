/**
 * Cloud Functions — reCAPTCHA Enterprise assessment
 *
 * Fires on every new document in `contactSubmissions` and `demoRequests`.
 * Reads the client-generated `recaptchaToken`, asks the reCAPTCHA Enterprise
 * API to score it, then:
 *   - Marks the doc with the score for auditability.
 *   - Sets status = 'spam' and deletes tokens below SCORE_THRESHOLD.
 *
 * The request body uses the exact shape the reCAPTCHA docs specify:
 *   {
 *     event: { token, expectedAction, siteKey }
 *   }
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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
 * Contact form submissions.
 */
exports.validateContactRecaptcha = onDocumentCreated(
  'contactSubmissions/{id}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await applyAssessment(snap, 'CONTACT_SUBMIT');
    } catch (err) {
      console.error('validateContactRecaptcha: assessment failed', err);
    }
  }
);

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
