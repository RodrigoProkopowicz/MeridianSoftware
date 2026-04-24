/**
 * AnalyticsEvents.js
 *
 * Centralized registry of analytics event names. All `trackEvent` calls
 * should pass a constant from this object — never a string literal — so
 * there is a single source of truth for what the site tracks.
 *
 * Values are snake_case to match GA4 conventions. When a Firebase-recommended
 * event name exists for a concept (https://firebase.google.com/docs/analytics/events),
 * we use it so GA4 can auto-populate its pre-built reports.
 */

export const AnalyticsEvent = Object.freeze({
  /**
   * User successfully authenticated.
   * Params: `{ method: 'google' | 'apple' }`.
   * Firebase-recommended.
   */
  LOGIN: 'login',

  /**
   * User signed out.
   * Custom event — no Firebase equivalent.
   */
  LOGOUT: 'logout',

  /**
   * User opened the sign-in modal (before attempting auth).
   * Custom.
   */
  AUTH_MODAL_OPENED: 'auth_modal_opened',

  /**
   * Lead captured via a form submission.
   * Params: `{ form: 'contact' | 'demo', solution_type?: string }`.
   * Firebase-recommended.
   */
  GENERATE_LEAD: 'generate_lead',

  /**
   * User clicked "Request Demo" on a solution card.
   * Params: `{ solution_id: string }`.
   * Custom.
   */
  SOLUTION_DEMO_CLICKED: 'solution_demo_clicked',

  /**
   * User clicked a primary CTA or navigation item.
   * Params: `{ content_type: string, item_id: string }`.
   * Firebase-recommended.
   */
  SELECT_CONTENT: 'select_content',
});
