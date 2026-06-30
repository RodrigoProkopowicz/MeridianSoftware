/**
 * PromoClients.js
 *
 * Prueba social: algunos clientes reales con su logo y link al sitio en vivo.
 * Los logos son oscuros, así que van sobre un chip claro para que se vean bien
 * sobre el fondo oscuro del promo. Cada card abre el sitio del cliente.
 */

const CLIENTS = [
  {
    name: 'San Miguel Point',
    url: 'https://www.sanmiguelpoint.com.ar',
    domain: 'sanmiguelpoint.com.ar',
    logo: '/clients/san-miguel-point.png',
  },
  {
    name: 'Pomilio Seguros',
    url: 'https://pomilioseguros.com.ar',
    domain: 'pomilioseguros.com.ar',
    logo: '/clients/pomilio-seguros.svg',
  },
  {
    name: 'Serafino Coffee',
    url: 'https://serafinocoffee.com',
    domain: 'serafinocoffee.com',
    logo: '/clients/serafino-coffee.svg',
  },
  {
    name: 'Florecer Piel',
    url: 'https://florecerpiel.web.app',
    domain: 'florecerpiel.web.app',
    logo: '/clients/florecer-piel.svg',
  },
];

export function renderPromoClients() {
  return `
    <section class="promo-clients" id="promo-clients" aria-label="Algunos de nuestros clientes">
      <div class="promo-container">
        <header class="promo-section-head">
          <h2 class="promo-section-title">Algunos de nuestros clientes en la zona</h2>
          <p class="promo-section-subtitle">
            Webs que ya diseñamos, publicamos y mantenemos. Tocá para visitarlas.
          </p>
        </header>

        <div class="promo-clients__grid">
          ${CLIENTS.map(c => `
            <a class="promo-clients__card" href="${c.url}" target="_blank" rel="noopener noreferrer"
               aria-label="Visitar ${c.name} (se abre en una pestaña nueva)">
              <div class="promo-clients__chip">
                ${c.logo
                  ? `<img class="promo-clients__logo" src="${c.logo}" alt="${c.name}" loading="lazy" />`
                  : `<span class="promo-clients__wordmark">${c.wordmark || c.name}</span>`}
              </div>
              <span class="promo-clients__name">${c.name}</span>
              <span class="promo-clients__link">
                ${c.domain}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
              </span>
            </a>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}
