/**
 * functions/promotional/recaptcha.js
 *
 * Evaluación de tokens reCAPTCHA Enterprise para el formulario promocional.
 * Autocontenido en el módulo (mismo enfoque que functions/index.js, pero
 * desacoplado para mantener el módulo independiente).
 */

const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
const { PROJECT_ID, RECAPTCHA_SITE_KEY } = require('./config');

let client = null;
function getClient() {
  if (!client) client = new RecaptchaEnterpriseServiceClient();
  return client;
}

/**
 * Corre una evaluación reCAPTCHA Enterprise.
 * @param {string} token
 * @param {string} expectedAction
 * @returns {Promise<{ valid: boolean, score: number|null, reasons: string[] }>}
 */
async function assessToken(token, expectedAction) {
  if (!token) {
    return { valid: false, score: null, reasons: ['MISSING_TOKEN'] };
  }

  const [response] = await getClient().createAssessment({
    parent: `projects/${PROJECT_ID}`,
    assessment: {
      event: { token, expectedAction, siteKey: RECAPTCHA_SITE_KEY },
    },
  });

  const tokenProps = response.tokenProperties || {};
  if (!tokenProps.valid) {
    return { valid: false, score: null, reasons: [tokenProps.invalidReason || 'INVALID_TOKEN'] };
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

module.exports = { assessToken };
