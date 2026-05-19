/**
 * StatsBar.js
 *
 * Four key metrics shown as animated counters. Placeholder numbers —
 * replace with real values before going live.
 *
 * Psychology: specificity bias. Specific numbers ("47") build more trust
 * than rounded approximations ("50+"). Animation on scroll draws the eye
 * and creates a micro-moment of engagement.
 */

/** TODO — replace with real metrics before going live. */
const STATS = [
  { value: 47,  suffix: '',  label: 'Proyectos entregados' },
  { value: 98,  suffix: '%', label: 'Retención de clientes' },
  { value: 24,  suffix: 'h', label: 'Tiempo de respuesta' },
  { value: 12,  suffix: '',  label: 'Industrias atendidas' },
];

/**
 * Renders the stats bar HTML.
 * @returns {string}
 */
export function renderStatsBar() {
  const itemsHTML = STATS
    .map(s => `
      <div class="stats-bar__item">
        <div class="stats-bar__value">
          <span data-countup="${s.value}" data-countup-suffix="${s.suffix}">0</span>
        </div>
        <div class="stats-bar__label">${s.label}</div>
      </div>
    `)
    .join('');

  return `
    <section class="stats-bar" id="stats-bar" aria-label="Key metrics">
      <div class="container">
        <div class="stats-bar__grid">
          ${itemsHTML}
        </div>
      </div>
    </section>
  `;
}
