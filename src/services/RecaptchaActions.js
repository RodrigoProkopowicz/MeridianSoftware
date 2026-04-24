/**
 * RecaptchaActions.js
 *
 * Centralized registry of reCAPTCHA Enterprise action names. Use a constant
 * from this object whenever calling `executeRecaptcha`, never a string literal.
 *
 * Action naming rules (Google):
 *   - 1–100 characters
 *   - Only A-Z, a-z, 0-9, `/`, `_`
 *   - Must not be user-specific (no emails, IDs, etc.)
 *
 * Per-action scores in the Google Cloud Console let you tune thresholds
 * separately for each action (e.g. be stricter on LOGIN than on CONTACT).
 */

export const RecaptchaAction = Object.freeze({
  /** User attempting to sign in with Google or Apple. */
  LOGIN: 'LOGIN',

  /** User submitting the public contact form (anonymous). */
  CONTACT_SUBMIT: 'CONTACT_SUBMIT',

  /** Authenticated user submitting a demo request. */
  DEMO_REQUEST: 'DEMO_REQUEST',
});
