/**
 * PromoHero.js
 *
 * Sección principal: propuesta de valor, precio destacado y CTA al formulario.
 */

import { PLAN } from '../config.js';

export function renderPromoHero() {
  return `
    <section class="promo-hero">
      <div class="promo-container promo-hero__inner">
        <span class="promo-badge">Para vecinos de San Miguel</span>

        <h1 class="promo-hero__title">
          Tu negocio con una web profesional,
          <span class="promo-hero__highlight">sin complicaciones</span>
        </h1>

        <p class="promo-hero__subtitle">
          Diseñamos, publicamos y mantenemos tu página web por vos.
          Vos te dedicás a tu negocio; nosotros nos ocupamos de que tu web
          se vea impecable y funcione siempre.
        </p>

        <div class="promo-hero__price">
          <span class="promo-hero__price-amount">${PLAN.priceLabel}</span>
          <span class="promo-hero__price-period">${PLAN.period}</span>
          <span class="promo-hero__price-note">Sin permanencia · Cancelás cuando quieras</span>
        </div>

        <div class="promo-hero__actions">
          <a class="promo-btn promo-btn--primary promo-btn--lg" href="#promo-form">
            Empezar ahora
          </a>
          <a class="promo-btn promo-btn--ghost promo-btn--lg" href="#promo-features">
            Ver qué incluye
          </a>
        </div>

        <p class="promo-hero__reassurance">
          Primero completás un breve formulario con lo que necesitás. Recién
          después confirmás el pago. Sin sorpresas.
        </p>
      </div>
    </section>
  `;
}
