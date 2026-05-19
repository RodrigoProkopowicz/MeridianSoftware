/**
 * TrustBarSection.js
 *
 * Logo row positioned immediately after the hero for fast social proof
 * ("you're not the first to consider us"). Placeholder data uses fictional
 * company names — replace the `CLIENTS` array with real customer logos
 * before going live.
 *
 * Psychology: social proof (Cialdini). Studies show trust-bar logos just
 * below the hero raise engagement even when users don't recognize the
 * brands — the mere presence of logos signals legitimacy.
 */

/**
 * TODO — replace with real client logos before going live.
 * Add entries as `{ name: string, svg: string }` where svg is inline
 * SVG markup sized roughly 120×28 so it fits the row without stretching.
 */
const CLIENTS = [
  {
    name: 'Northwind Labs',
    svg: `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 8 L4 24 L9 24 L9 14 L17 24 L22 24 L22 8 L17 8 L17 18 L9 8 Z" fill="currentColor"/>
      <text x="28" y="22" font-family="Inter,sans-serif" font-weight="700" font-size="14" letter-spacing="0.5" fill="currentColor">NORTHWIND</text>
    </svg>`,
  },
  {
    name: 'Helix Retail',
    svg: `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M10 12 Q14 20 18 12" stroke="currentColor" stroke-width="2" fill="none"/>
      <text x="28" y="22" font-family="Inter,sans-serif" font-weight="600" font-size="14" letter-spacing="1" fill="currentColor">HELIX</text>
    </svg>`,
  },
  {
    name: 'Kepler Finance',
    svg: `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="10" width="4" height="14" fill="currentColor"/>
      <rect x="10" y="14" width="4" height="10" fill="currentColor"/>
      <rect x="16" y="6" width="4" height="18" fill="currentColor"/>
      <text x="28" y="22" font-family="Inter,sans-serif" font-weight="700" font-size="14" fill="currentColor">KEPLER</text>
    </svg>`,
  },
  {
    name: 'Orbit Health',
    svg: `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="4" fill="currentColor"/>
      <ellipse cx="14" cy="16" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <text x="32" y="22" font-family="Inter,sans-serif" font-weight="500" font-size="13" letter-spacing="2" fill="currentColor">ORBIT</text>
    </svg>`,
  },
  {
    name: 'Vantage Studio',
    svg: `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 8 L14 24 L24 8 L20 8 L14 18 L8 8 Z" fill="currentColor"/>
      <text x="28" y="22" font-family="Inter,sans-serif" font-weight="800" font-size="14" fill="currentColor">VANTAGE</text>
    </svg>`,
  },
  {
    name: 'Axiom Works',
    svg: `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 24 L14 8 L20 24 M10 18 L18 18" stroke="currentColor" stroke-width="2" fill="none"/>
      <text x="28" y="22" font-family="Inter,sans-serif" font-weight="700" font-size="14" letter-spacing="0.5" fill="currentColor">AXIOM</text>
    </svg>`,
  },
];

/**
 * Renders the trust bar HTML.
 * @returns {string}
 */
export function renderTrustBarSection() {
  const logosHTML = CLIENTS
    .map(c => `
      <div class="trust-bar__logo" title="${c.name}" aria-label="${c.name}">
        ${c.svg}
      </div>
    `)
    .join('');

  return `
    <section class="trust-bar" id="trust-bar" aria-label="Empresas con las que trabajamos">
      <div class="container">
        <p class="trust-bar__label">Equipos que entregan a cualquier escala confían en nosotros</p>
        <div class="trust-bar__logos">
          ${logosHTML}
        </div>
      </div>
    </section>
  `;
}
