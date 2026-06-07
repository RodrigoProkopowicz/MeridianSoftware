/**
 * config.js
 *
 * Constantes de presentación del plan promocional. El monto real que se cobra
 * lo define el backend (functions/promotional) — esto es solo para mostrar en
 * la UI. Si cambia el precio, actualizalo también en functions/promotional.
 */

/**
 * Monto mensual de la suscripción, en pesos. Única fuente del número en el
 * front: `priceLabel` se deriva de acá, así no hay dos literales que diverjan.
 * (El cobro real lo define el backend en `functions/promotional/config.js`;
 * ambos deben coincidir.)
 */
const AMOUNT = 6499;

export const PLAN = Object.freeze({
  amount: AMOUNT,
  currency: 'ARS',
  /** Etiqueta legible, derivada de `amount` (separador de miles es-AR). */
  priceLabel: `$${AMOUNT.toLocaleString('es-AR')}`,
  period: 'por mes',
});

/**
 * Fin de la promoción (precio promocional + cuenta regresiva).
 * Instante fijo con offset de Argentina (UTC-3): sábado 6/6/2026 03:00 AM ART.
 */
export const PROMO_DEADLINE = '2026-06-06T03:00:00-03:00';

/** URL del sitio principal — el logo redirige acá. */
export const MAIN_SITE_URL = '/';
