/**
 * config.js
 *
 * Constantes de presentación del plan promocional. El monto real que se cobra
 * lo define el backend (functions/promotional) — esto es solo para mostrar en
 * la UI. Si cambia el precio, actualizalo también en functions/promotional.
 */

export const PLAN = Object.freeze({
  /** Monto mensual de la suscripción, en pesos. */
  amount: 6499,
  currency: 'ARS',
  /** Etiqueta legible del precio. */
  priceLabel: '$6.499',
  period: 'por mes',
});

/** WhatsApp de contacto del vendedor (solo dígitos, con código de país). */
export const CONTACT_WHATSAPP = '5491100000000';

/** URL del sitio principal — el logo redirige acá. */
export const MAIN_SITE_URL = '/';
