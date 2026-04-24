/**
 * AnalyticsService.js
 *
 * Thin wrapper around Firebase Analytics. Safe to call in any environment:
 * silently no-ops when Analytics is unsupported (SSR, in-app webviews,
 * browsers with IndexedDB disabled) or when event logging fails.
 *
 * Import event names from AnalyticsEvents.js, not as string literals.
 *
 * Bundle note: `logEvent` is obtained from the `analyticsReady` promise,
 * which dynamically imports `firebase/analytics`. Doing it that way keeps
 * the analytics SDK in its own chunk instead of the main bundle.
 */

import { analyticsReady } from '../config/FirebaseConfig.js';

/**
 * Logs an analytics event.
 * @param {string} eventName - Constant from AnalyticsEvent
 * @param {Object} [params={}] - Event-specific parameters
 * @returns {Promise<void>}
 */
export async function trackEvent(eventName, params = {}) {
  const ready = await analyticsReady;
  if (!ready) return;
  try {
    ready.logEvent(ready.analytics, eventName, params);
  } catch (err) {
    console.warn('AnalyticsService: logEvent failed —', err.message);
  }
}
