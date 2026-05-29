/**
 * checkoutService.js
 *
 * Cliente del flujo de suscripción promocional. Genera un token reCAPTCHA y
 * llama a la Cloud Function `createPromotionalPreapproval`, que:
 *   1. Valida el token server-side.
 *   2. Crea la suscripción (preapproval) en Mercado Pago.
 *   3. Guarda el documento en `promotionalSubscriptions` (Admin SDK).
 *   4. Devuelve el `initPoint` al que hay que redirigir para pagar.
 *
 * El cliente nunca escribe en Firestore ni toca el access token de MP: todo
 * lo sensible vive en el backend.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import firebaseApp from '../../config/FirebaseConfig.js';
import { executeRecaptcha } from '../../services/RecaptchaService.js';
import { RecaptchaAction } from '../../services/RecaptchaActions.js';

const functions = getFunctions(firebaseApp);
const createPreapprovalCallable = httpsCallable(functions, 'createPromotionalPreapproval');

/**
 * @typedef {Object} SubscribePayload
 * @property {string} businessName
 * @property {string} businessType
 * @property {string} email
 * @property {string} phone        - dígitos normalizados
 * @property {string} phoneRaw     - lo que escribió el usuario
 * @property {string} description
 * @property {string} references
 * @property {string} stylePreferences
 * @property {boolean} wantsDomain
 */

/**
 * Inicia la suscripción. Devuelve `{ initPoint, subscriptionId }`.
 * Lanza un Error con un mensaje legible si algo falla.
 *
 * @param {SubscribePayload} payload
 * @returns {Promise<{ initPoint: string, subscriptionId: string }>}
 */
export async function startSubscription(payload) {
  const recaptchaToken = await executeRecaptcha(RecaptchaAction.PROMO_SUBSCRIBE);

  let result;
  try {
    result = await createPreapprovalCallable({ ...payload, recaptchaToken });
  } catch (err) {
    // Los HttpsError de la callable llegan con `.message` legible.
    throw new Error(messageForError(err));
  }

  const data = result?.data || {};
  if (!data.initPoint) {
    throw new Error('No pudimos generar el link de pago. Probá de nuevo en un momento.');
  }
  return { initPoint: data.initPoint, subscriptionId: data.subscriptionId };
}

/**
 * Traduce errores de la callable a mensajes para el usuario.
 * @param {any} err
 * @returns {string}
 */
function messageForError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-argument')) {
    return 'Revisá los datos del formulario e intentá de nuevo.';
  }
  if (code.includes('failed-precondition') || code.includes('unavailable')) {
    return 'El sistema de pagos no está disponible en este momento. Probá más tarde o escribinos por WhatsApp.';
  }
  if (code.includes('permission-denied')) {
    return 'No pudimos validar tu solicitud. Recargá la página e intentá otra vez.';
  }
  return err?.message || 'Ocurrió un error inesperado. Probá de nuevo.';
}
