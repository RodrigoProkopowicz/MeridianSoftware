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
const AMOUNT = 34999;

export const PLAN = Object.freeze({
  amount: AMOUNT,
  currency: 'ARS',
  /** Etiqueta legible, derivada de `amount` (separador de miles es-AR). */
  priceLabel: `$${AMOUNT.toLocaleString('es-AR')}`,
  period: 'por mes',
});

/** URL del sitio principal — el logo redirige acá. */
export const MAIN_SITE_URL = '/';
