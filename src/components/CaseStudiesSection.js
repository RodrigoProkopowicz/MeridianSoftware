/**
 * CaseStudiesSection.js
 *
 * Three featured case studies with a hero metric each. Hover reveals a
 * subtle tilt + glow for interactivity.
 *
 * Psychology:
 *   - Loss-aversion framing in headlines ("cut checkout drop-off", not
 *     "improved checkout"). Problems the reader recognizes.
 *   - Concrete metrics anchor expectations ("43% faster" beats "much faster").
 *   - Industry variety signals breadth of capability.
 *
 * TODO — replace CASE_STUDIES with real projects (with permission).
 */

const CASE_STUDIES = [
  {
    id: 'retail-checkout',
    industry: 'Retail',
    title: 'Reducimos el abandono de checkout en una cadena de 200 sucursales',
    summary: 'Rehicimos una app React Native legacy con sincronización offline-first y un carrito simplificado.',
    metric: '43%',
    metricLabel: 'más rápido el checkout',
    accent: 'blue',
    tags: ['React Native', 'Firebase', 'Sync offline'],
  },
  {
    id: 'fintech-dashboard',
    industry: 'Fintech',
    title: 'Dashboard de portafolio en tiempo real para 40k traders',
    summary: 'Streaming de precios vía WebSockets con refresco sub-100ms sobre un backend Vue + Rust.',
    metric: '92ms',
    metricLabel: 'latencia p95',
    accent: 'green',
    tags: ['Vue 3', 'WebSocket', 'Rust', 'PostgreSQL'],
  },
  {
    id: 'health-patient',
    industry: 'Salud',
    title: 'Plataforma de telemedicina HIPAA-compliant',
    summary: 'Video cifrado end-to-end e integraciones EHR entregadas en menos de cuatro meses.',
    metric: '4 meses',
    metricLabel: 'de kickoff a lanzamiento',
    accent: 'amber',
    tags: ['WebRTC', 'HIPAA', 'Next.js', 'AWS'],
  },
];

/**
 * Renders the case studies section HTML.
 * @returns {string}
 */
export function renderCaseStudiesSection() {
  const cardsHTML = CASE_STUDIES.map(renderCard).join('');

  return `
    <section class="case-studies section" id="case-studies">
      <div class="container">
        <div class="section-label-wrapper"></div>
        <div class="section-header">
          <span class="section-label">Casos reales</span>
          <h2 class="section-title">Software que se entrega y escala</h2>
          <p class="section-subtitle">
            Una selección de proyectos — cada uno lanzado, medido y mantenido.
          </p>
        </div>
        <div class="case-studies__grid">
          ${cardsHTML}
        </div>
      </div>
    </section>
  `;
}

function renderCard(cs) {
  const tagsHTML = cs.tags
    .map(t => `<span class="case-card__tag">${t}</span>`)
    .join('');

  return `
    <article class="case-card case-card--${cs.accent} glass-card" data-tilt>
      <div class="case-card__body">
        <span class="case-card__industry">${cs.industry}</span>
        <h3 class="case-card__title">${cs.title}</h3>
        <p class="case-card__summary">${cs.summary}</p>
        <div class="case-card__tags">${tagsHTML}</div>
      </div>
      <div class="case-card__metric">
        <div class="case-card__metric-value">${cs.metric}</div>
        <div class="case-card__metric-label">${cs.metricLabel}</div>
      </div>
    </article>
  `;
}

/**
 * Initializes the 3D tilt hover effect on case cards.
 * Disabled on coarse pointers and when reduced-motion is set.
 */
export function initCaseStudiesSection() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (reduceMotion || coarsePointer) return;

  document.querySelectorAll('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;  // 0..1
      const ny = (e.clientY - rect.top) / rect.height;  // 0..1
      const rx = (ny - 0.5) * -6;
      const ry = (nx - 0.5) * 6;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}
