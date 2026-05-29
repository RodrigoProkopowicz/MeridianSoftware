/**
 * PromoFeatures.js
 *
 * "Qué incluye" + "Cómo funciona". Explica el valor concreto y baja la
 * ansiedad mostrando el proceso en 3 pasos simples.
 */

const FEATURES = [
  {
    icon: `<path d="M3 9h18M9 21V9"/><rect x="3" y="3" width="18" height="18" rx="2"/>`,
    title: 'Diseño profesional a medida',
    text: 'Tu web pensada para tu rubro, con tus colores, fotos y textos.',
  },
  {
    icon: `<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>`,
    title: 'Se ve perfecta en el celular',
    text: 'La mayoría de tus clientes te va a encontrar desde el teléfono.',
  },
  {
    icon: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
    title: 'Apareces en Google',
    text: 'Optimizamos tu web para que te encuentren cuando te buscan.',
  },
  {
    icon: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
    title: 'Botón de WhatsApp',
    text: 'Tus clientes te escriben con un toque, directo a tu teléfono.',
  },
  {
    icon: `<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>`,
    title: 'Cambios incluidos',
    text: '¿Cambió un precio o un horario? Lo actualizamos por vos.',
  },
  {
    icon: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>`,
    title: 'Mantenimiento y soporte',
    text: 'Nos ocupamos de que tu web esté siempre online y al día.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Completás el formulario',
    text: 'Nos contás de tu negocio y cómo querés tu web. Te toma 2 minutos.',
  },
  {
    n: '2',
    title: 'La diseñamos y publicamos',
    text: 'Armamos tu página y te la mostramos. Ajustamos lo que necesites.',
  },
  {
    n: '3',
    title: 'Tu web online',
    text: 'Queda publicada y la mantenemos por vos, mes a mes.',
  },
];

export function renderPromoFeatures() {
  return `
    <section class="promo-features" id="promo-features">
      <div class="promo-container">
        <header class="promo-section-head">
          <h2 class="promo-section-title">Todo lo que tu negocio necesita online</h2>
          <p class="promo-section-subtitle">
            Una web no es solo "estar en internet": es que te encuentren, te
            escriban y confíen en vos. Nos ocupamos de todo.
          </p>
        </header>

        <div class="promo-features__grid">
          ${FEATURES.map(f => `
            <article class="promo-feature-card">
              <span class="promo-feature-card__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${f.icon}</svg>
              </span>
              <h3 class="promo-feature-card__title">${f.title}</h3>
              <p class="promo-feature-card__text">${f.text}</p>
            </article>
          `).join('')}
        </div>

        <div class="promo-steps">
          <h2 class="promo-section-title promo-steps__title">Cómo funciona</h2>
          <ol class="promo-steps__list">
            ${STEPS.map(s => `
              <li class="promo-step">
                <span class="promo-step__num">${s.n}</span>
                <h3 class="promo-step__title">${s.title}</h3>
                <p class="promo-step__text">${s.text}</p>
              </li>
            `).join('')}
          </ol>
        </div>
      </div>
    </section>
  `;
}
