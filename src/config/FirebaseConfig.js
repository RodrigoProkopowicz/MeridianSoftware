/**
 * FirebaseConfig.js
 *
 * Initializes the Firebase app and exports shared service instances.
 * All Firebase configuration is read from environment variables.
 *
 * Bundle strategy: `firebase/app`, `firebase/auth`, `firebase/firestore` y
 * `firebase/app-check` cargan eager. App Check DEBE inicializarse ANTES que
 * auth/firestore: si no, con enforcement activo esos SDKs emiten requests sin
 * token y fallan — incluida la restauración de sesión en /cuenta y /admin, que
 * deja de resolver y muestra el gate de login aunque haya sesión.
 * `firebase/analytics` sí es dynamic import (fuera del critical path).
 */

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
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

// ---- App Check (SYNC, antes de getAuth/getFirestore) ----
// CRÍTICO: si App Check se inicializa DESPUÉS de auth/firestore, esos SDKs
// emiten requests SIN token y, con enforcement activo, fallan — incluida la
// restauración de sesión en /cuenta y /admin, que entonces no resuelve y
// muestra el gate de login aunque haya sesión válida. Por eso se inicializa
// sincrónicamente acá, antes de getAuth/getFirestore (mismo patrón que
// StockManager/Medicus). Antes se difería con requestIdleCallback para sacar el
// SDK del bundle inicial; ese micro-ahorro causaba el bug.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
let appCheck = null;
if (recaptchaSiteKey) {
  if (import.meta.env.DEV) {
    // @ts-ignore - Firebase reads this global flag.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    appCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('FirebaseConfig: App Check init failed —', err.message);
  }
}

/**
 * Resuelve cuando App Check terminó de inicializar (o a `null` si no hay key).
 * Ahora App Check es síncrono, así que resuelve de inmediato — se mantiene como
 * Promise por compatibilidad con quienes lo await-ean antes de un write.
 * @type {Promise<import('firebase/app-check').AppCheck | null>}
 */
export const appCheckReady = Promise.resolve(appCheck);

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
