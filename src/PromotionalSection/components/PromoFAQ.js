/**
 * PromoFAQ.js
 *
 * Preguntas frecuentes. Cada respuesta apunta a despejar una duda que frena
 * la decisión (permanencia, qué pasa si cancelo, cómo es el pago, etc.).
 * Acordeón accesible con <details>/<summary> — sin JS.
 */

import { PLAN } from '../config.js';

const FAQS = [
  {
    q: `¿Cómo es el pago de los ${PLAN.priceLabel} por mes?`,
    a: 'Es una suscripción mensual automática a través de Mercado Pago. Se renueva sola cada mes con la tarjeta que cargues, así no tenés que acordarte de pagar. Podés cancelarla cuando quieras.',
  },
  {
    q: '¿Tengo que firmar algún contrato o quedar atado?',
    a: 'No. No hay permanencia ni contrato. Si en algún momento no querés seguir, cancelás la suscripción y listo.',
  },
  {
    q: '¿Necesito saber de tecnología o tener algo preparado?',
    a: 'Para nada. Solo completás el formulario contándonos de tu negocio. Nosotros nos encargamos del diseño, la publicación y todo lo técnico.',
  },
  {
    q: '¿El dominio propio está incluido?',
    a: 'El dominio propio (por ejemplo tunegocio.com) es opcional y se paga una sola vez al proveedor del dominio, aparte de la cuota. Te damos las instrucciones y te acompañamos para conseguirlo si lo querés.',
  },
  {
    q: '¿Qué pasa si quiero cambiar algo de la web?',
    a: 'Los cambios de contenido (precios, horarios, fotos, textos) están incluidos en la cuota mensual. Nos escribís por WhatsApp y lo actualizamos.',
  },
  {
    q: '¿Cuándo empiezo a pagar?',
    a: 'Primero completás el formulario sin compromiso. El cobro recién se activa cuando confirmás la suscripción en Mercado Pago.',
  },
];

export function renderPromoFAQ() {
  return `
    <section class="promo-faq" id="promo-faq">
      <div class="promo-container promo-faq__inner">
        <header class="promo-section-head">
          <h2 class="promo-section-title">Preguntas frecuentes</h2>
          <p class="promo-section-subtitle">Si te queda alguna duda, escribinos por WhatsApp.</p>
        </header>

        <div class="promo-faq__list">
          ${FAQS.map(item => `
            <details class="promo-faq__item">
              <summary class="promo-faq__question">
                <span>${item.q}</span>
                <svg class="promo-faq__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              </summary>
              <p class="promo-faq__answer">${item.a}</p>
            </details>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}
