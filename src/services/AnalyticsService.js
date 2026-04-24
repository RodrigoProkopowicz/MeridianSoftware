/**
 * AnalyticsService.js
 *
 * Thin wrapper around Firebase Analytics. Safe to call in any environment:
 * silently no-ops when Analytics is unsupported (SSR, in-app webviews,
 * browsers with IndexedDB disabled) or when event logging fails.
 *
 * Import event names from AnalyticsEvents.js, not as string literals.
 */

import { logEvent } from 'firebase/analytics';
import { analyticsReady } from '../config/FirebaseConfig.js';

/**
 * Logs an analytics event.
 * @param {string} eventName - Constant from AnalyticsEvent
 * @param {Object} [params={}] - Event-specific parameters
 * @returns {Promise<void>}
 */
export async function trackEvent(eventName, params = {}) {
  const analytics = await analyticsReady;
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, params);
  } catch (err) {
    console.warn('AnalyticsService: logEvent failed —', err.message);
  }
}
