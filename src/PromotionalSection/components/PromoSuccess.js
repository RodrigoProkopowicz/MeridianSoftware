/**
 * PromoSuccess.js
 *
 * Pantalla que se muestra al volver desde Mercado Pago. Distingue entre pago
 * confirmado/pendiente y un retorno sin confirmación. Da los próximos pasos y
 * un canal de contacto para bajar la incertidumbre.
 */

import { MAIN_SITE_URL } from '../config.js';

/**
 * @param {'success'|'pending'} [variant='success']
 */
export function renderPromoSuccess(variant = 'success') {
  const isPending = variant === 'pending';
  return `
    <main class="promo-result">
      <div class="promo-container promo-result__inner">
        <div class="promo-result__icon ${isPending ? 'is-pending' : 'is-success'}">
          ${isPending
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>`}
        </div>

        <h1 class="promo-result__title">
          ${isPending ? '¡Casi listo!' : '¡Suscripción confirmada!'}
        </h1>
        <p class="promo-result__text">
          ${isPending
            ? 'Tu pago está procesándose. En cuanto Mercado Pago lo confirme, nos ponemos en marcha con tu web.'
            : 'Gracias por confiar en nosotros. Ya recibimos tus datos y vamos a contactarte por WhatsApp para empezar con el diseño de tu web.'}
        </p>

        <ol class="promo-result__steps">
          <li>Revisá tu WhatsApp en las próximas horas hábiles.</li>
          <li>Coordinamos los detalles y te mostramos una primera versión.</li>
          <li>Ajustamos lo que necesites y publicamos tu web.</li>
        </ol>

        <a class="promo-btn promo-btn--primary promo-btn--lg" href="${MAIN_SITE_URL}">
          Ir al sitio principal
        </a>
      </div>
    </main>
  `;
}
