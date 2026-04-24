/**
 * RecaptchaService.js
 *
 * Thin wrapper around Google reCAPTCHA Enterprise. Safe to call in any
 * environment: returns null when the site key is missing, the script failed
 * to load, or token execution times out.
 *
 * IMPORTANT: tokens generated here are NOT validated anywhere in this
 * project yet. To turn reCAPTCHA into actual protection, you need to:
 *   (a) verify the token server-side (Cloud Function hitting
 *       `recaptchaenterprise.googleapis.com/v1/projects/.../assessments`), or
 *   (b) use Firebase App Check with the ReCaptchaEnterpriseProvider for
 *       automatic server-side enforcement on all Firebase SDK calls.
 */

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

/** Max time to wait for grecaptcha.ready + execute before giving up. */
const TIMEOUT_MS = 4000;

/**
 * Executes a reCAPTCHA Enterprise challenge for a given action.
 * @param {string} action - Constant from RecaptchaAction
 * @returns {Promise<string|null>} Token, or null if unavailable
 */
export function executeRecaptcha(action) {
  if (!SITE_KEY) return Promise.resolve(null);

  const grecaptcha = window.grecaptcha && window.grecaptcha.enterprise;
  if (!grecaptcha) {
    console.warn('RecaptchaService: grecaptcha not loaded yet');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`RecaptchaService: timeout executing '${action}'`);
      resolve(null);
    }, TIMEOUT_MS);

    grecaptcha.ready(async () => {
      try {
        const token = await grecaptcha.execute(SITE_KEY, { action });
        clearTimeout(timer);
        resolve(token);
      } catch (err) {
        clearTimeout(timer);
        console.warn(`RecaptchaService: execute('${action}') failed —`, err.message);
        resolve(null);
      }
    });
  });
}
