/**
 * PromoPricing.js
 *
 * Tarjeta de precio única y transparente. Aclara qué entra en los $6.499/mes
 * y explica el dominio propio como un pago aparte y opcional.
 */

import { PLAN } from '../config.js';

const INCLUDED = [
  'Diseño profesional a medida',
  'Publicación y hosting de tu web',
  'Versión para celular y computadora',
  'Botón de WhatsApp y formulario de contacto',
  'Optimización para Google',
  'Cambios y actualizaciones de contenido',
  'Mantenimiento y soporte por WhatsApp',
];

export function renderPromoPricing() {
  return `
    <section class="promo-pricing" id="promo-pricing">
      <div class="promo-container">
        <header class="promo-section-head">
          <h2 class="promo-section-title">Un precio claro, sin sorpresas</h2>
          <p class="promo-section-subtitle">
            El desarrollo de tu web no tiene costo. Solo pagás una cuota mensual, sin permanencia.
          </p>
        </header>

        <div class="promo-pricing__card">
          <div class="promo-pricing__header">
            <span class="promo-pricing__badge">Precio promocional</span>
            <span class="promo-pricing__plan">Plan Vecino</span>
            <div class="promo-pricing__amount">
              <span class="promo-pricing__price">${PLAN.priceLabel}</span>
              <span class="promo-pricing__period">${PLAN.period}</span>
            </div>
            <span class="promo-pricing__tagline">Sin costo de desarrollo · Cancelás cuando quieras</span>
          </div>

          <ul class="promo-pricing__list">
            ${INCLUDED.map(item => `
              <li class="promo-pricing__item">
                <svg class="promo-pricing__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                ${item}
              </li>
            `).join('')}
          </ul>

          <a class="promo-btn promo-btn--primary promo-btn--lg promo-pricing__cta" href="#promo-form">
            Quiero mi web por ${PLAN.priceLabel}/mes
          </a>

          <p class="promo-pricing__note">
            <strong>${PLAN.priceLabel}/mes es un precio promocional.</strong> Si tu web crece
            y empieza a recibir mucho más tráfico, ajustamos la cuota de forma justa según
            ese consumo. Siempre te avisamos antes — nunca hay sorpresas.
          </p>

          <div class="promo-pricing__domain">
            <strong>¿Querés un dominio propio?</strong> (ej: <em>tunegocio.com</em>)
            Es opcional y se paga una sola vez, directamente al proveedor del
            dominio. Te pasamos las instrucciones y te acompañamos en el proceso
            sin costo extra.
          </div>
        </div>
      </div>
    </section>
  `;
}
