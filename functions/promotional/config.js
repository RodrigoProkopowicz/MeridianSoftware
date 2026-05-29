/**
 * functions/promotional/config.js
 *
 * Parámetros y constantes del módulo promocional. Aislado del resto de las
 * functions para mantener el módulo desacoplado.
 *
 * Secrets (setear antes del deploy):
 *   firebase functions:secrets:set MP_ACCESS_TOKEN
 *   firebase functions:secrets:set MP_WEBHOOK_SECRET   # opcional
 */

const { defineSecret } = require('firebase-functions/params');

/** Access token de Mercado Pago (privado). Requerido para crear/leer suscripciones. */
const mpAccessToken = defineSecret('MP_ACCESS_TOKEN');

/**
 * Secreto para validar la firma (x-signature) de los webhooks de MP. Opcional:
 * si no está seteado, el webhook igual re-consulta el recurso contra la API de
 * MP con nuestro access token, así que nunca confía en el body crudo.
 */
const mpWebhookSecret = defineSecret('MP_WEBHOOK_SECRET');

/** Base URL pública del sitio — usada para armar el back_url del checkout. */
const PROMO_BASE_URL = 'https://www.meridian-software.com';

/** Plan promocional. Fuente de verdad del monto INICIAL que se cobra. */
const PLAN = Object.freeze({
  amount: 6499,
  currency: 'ARS',
  frequency: 1,
  frequencyType: 'months',
  reason: 'Meridian — Mantenimiento mensual de tu web',
});

/**
 * Límites del monto mensual que un admin puede fijar por cliente (en ARS).
 * El precio arranca en PLAN.amount y luego se ajusta dentro de este rango.
 */
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000000;

const PROJECT_ID = 'meridiansoftware-6ae75';
const RECAPTCHA_SITE_KEY = '6LdAM8csAAAAAL83hLsjmFczA8eI3IMyuW_005pL';
const RECAPTCHA_THRESHOLD = 0.5;

const MP_API_BASE = 'https://api.mercadopago.com';

module.exports = {
  mpAccessToken,
  mpWebhookSecret,
  PROMO_BASE_URL,
  PLAN,
  MIN_AMOUNT,
  MAX_AMOUNT,
  PROJECT_ID,
  RECAPTCHA_SITE_KEY,
  RECAPTCHA_THRESHOLD,
  MP_API_BASE,
};
