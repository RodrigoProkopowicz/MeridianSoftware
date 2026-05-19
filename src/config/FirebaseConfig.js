/**
 * FirebaseConfig.js
 *
 * Initializes the Firebase app and exports shared service instances.
 * All Firebase configuration is read from environment variables.
 *
 * Bundle strategy: `firebase/app`, `firebase/auth`, and `firebase/firestore`
 * are loaded eagerly because they're needed on first paint (auth listener,
 * form writes). `firebase/analytics` and `firebase/app-check` are dynamic
 * imports — they defer their chunks off the critical path.
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = REQUIRED_ENV_VARS.filter(
  key => !import.meta.env[key] || String(import.meta.env[key]).startsWith('your-')
);

if (missing.length > 0) {
  throw new Error(
    `FirebaseConfig: missing or placeholder env vars — ${missing.join(', ')}. ` +
    `Copy your Firebase web app credentials into .env.`
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebaseApp = initializeApp(firebaseConfig);

// ---- App Check (deferred) ----
// Dynamic import keeps the firebase/app-check SDK out of the main bundle.
// We schedule init off the critical path AND expose `appCheckReady` so any
// Firestore write that can fire before first paint (e.g. the profile write
// inside onAuthStateChanged when a session is restored from localStorage)
// can await it — without that, a write could race past init and reach
// Firestore without an App Check token.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

let resolveAppCheckReady;
/**
 * Resolves once App Check finishes initializing — or to `null` if init
 * failed or no reCAPTCHA key is configured. Await this before any write
 * that may run before first paint.
 * @type {Promise<import('firebase/app-check').AppCheck | null>}
 */
export const appCheckReady = recaptchaSiteKey
  ? new Promise(resolve => { resolveAppCheckReady = resolve; })
  : Promise.resolve(null);

if (recaptchaSiteKey) {
  if (import.meta.env.DEV) {
    // @ts-ignore - Firebase reads this global flag.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  const initAppCheck = () =>
    import('firebase/app-check')
      .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
        const appCheck = initializeAppCheck(firebaseApp, {
          provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
        resolveAppCheckReady(appCheck);
      })
      .catch(err => {
        console.warn('FirebaseConfig: App Check init failed —', err.message);
        resolveAppCheckReady(null);
      });

  // Prefer `requestIdleCallback` when available. Otherwise (older Safari)
  // wait for `load` — that's the first moment guaranteed to be past first
  // paint in every browser. The previous `setTimeout(initAppCheck, 500)`
  // was an arbitrary delay any consumer could race past.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(initAppCheck, { timeout: 2000 });
  } else if (document.readyState === 'complete') {
    setTimeout(initAppCheck, 0);
  } else {
    window.addEventListener('load', () => setTimeout(initAppCheck, 0), { once: true });
  }
}

/** Firebase Authentication instance */
export const auth = getAuth(firebaseApp);

/** Cloud Firestore instance */
export const db = getFirestore(firebaseApp);

/**
 * Firebase Analytics bundle — dynamically imported so the SDK doesn't ship
 * in the initial JS bundle. Resolves to an object `{ analytics, logEvent }`
 * in supported environments, or `null` otherwise (SSR, private browsing
 * without indexedDB, in-app webviews, etc.).
 *
 * Both the Analytics instance AND the `logEvent` function come from this
 * promise so the consuming service (AnalyticsService) never needs a static
 * import of `firebase/analytics` — that keeps the split effective.
 * @type {Promise<{ analytics: import('firebase/analytics').Analytics, logEvent: Function } | null>}
 */
export const analyticsReady = firebaseConfig.measurementId
  ? import('firebase/analytics')
      .then(async (mod) => {
        const supported = await mod.isSupported();
        if (!supported) return null;
        return { analytics: mod.getAnalytics(firebaseApp), logEvent: mod.logEvent };
      })
      .catch(err => {
        console.warn('FirebaseConfig: Analytics unavailable —', err.message);
        return null;
      })
  : Promise.resolve(null);

export default firebaseApp;
