/**
 * FirebaseConfig.js
 *
 * Initializes the Firebase app and exports shared service instances.
 * All Firebase configuration is read from environment variables.
 */

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

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

// ---- App Check ----
// Must be initialized before any Firestore/Auth/Storage call. Once enforcement
// is enabled in the Firebase Console, unverified requests are rejected at the
// Firebase backend — no custom server code needed.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey) {
  // Dev: print a debug token in the console that you register in
  // Firebase Console → App Check → Apps → Manage debug tokens.
  if (import.meta.env.DEV) {
    // @ts-ignore - Firebase reads this global flag.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('FirebaseConfig: App Check init failed —', err.message);
  }
}

/** Firebase Authentication instance */
export const auth = getAuth(firebaseApp);

/** Cloud Firestore instance */
export const db = getFirestore(firebaseApp);

/**
 * Firebase Analytics — resolves to the Analytics instance in supported
 * environments (most modern browsers) and `null` otherwise (SSR, private
 * browsing modes that block indexedDB, in-app webviews, etc.).
 * @type {Promise<import('firebase/analytics').Analytics | null>}
 */
export const analyticsReady = firebaseConfig.measurementId
  ? isAnalyticsSupported()
      .then(supported => (supported ? getAnalytics(firebaseApp) : null))
      .catch(err => {
        console.warn('FirebaseConfig: Analytics unavailable —', err.message);
        return null;
      })
  : Promise.resolve(null);

export default firebaseApp;
