/**
 * PromoTrustBar.js
 *
 * Tira de señales de confianza/seguridad. Refuerza que el pago es seguro y
 * que no hay ataduras — clave para que un vecino se anime a suscribirse.
 */

const ITEMS = [
  {
    icon: `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
    title: 'Pago 100% seguro',
    text: 'Procesado por Mercado Pago. Nunca vemos los datos de tu tarjeta.',
  },
  {
    icon: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
    title: 'Conexión cifrada',
    text: 'Tus datos viajan protegidos con certificado SSL.',
  },
  {
    icon: `<path d="M18 6 6 18M6 6l12 12"/>`,
    title: 'Sin permanencia',
    text: 'Cancelás cuando quieras, sin multas ni letra chica.',
  },
  {
    icon: `<path d="M3 11l19-9-9 19-2-8-8-2z"/>`,
    title: 'Atención local',
    text: 'Somos de la zona. Te respondemos por WhatsApp.',
  },
];

export function renderPromoTrustBar() {
  return `
    <section class="promo-trust" aria-label="Garantías">
      <div class="promo-container promo-trust__grid">
        ${ITEMS.map(item => `
          <div class="promo-trust__item">
            <svg class="promo-trust__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${item.icon}</svg>
            <div class="promo-trust__copy">
              <span class="promo-trust__title">${item.title}</span>
              <span class="promo-trust__text">${item.text}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}
