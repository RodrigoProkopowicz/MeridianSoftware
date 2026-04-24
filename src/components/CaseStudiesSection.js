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
    title: 'Cut checkout drop-off for a 200-store chain',
    summary: 'Rebuilt a legacy React Native app with offline-first sync and a streamlined cart.',
    metric: '43%',
    metricLabel: 'faster checkout',
    accent: 'blue',
    tags: ['React Native', 'Firebase', 'Offline sync'],
  },
  {
    id: 'fintech-dashboard',
    industry: 'Fintech',
    title: 'Real-time portfolio dashboard for 40k traders',
    summary: 'Streaming prices via WebSockets with sub-100ms refresh on a Vue + Rust backend.',
    metric: '92ms',
    metricLabel: 'p95 latency',
    accent: 'green',
    tags: ['Vue 3', 'WebSocket', 'Rust', 'PostgreSQL'],
  },
  {
    id: 'health-patient',
    industry: 'Health',
    title: 'HIPAA-compliant telehealth platform',
    summary: 'End-to-end encrypted video + EHR integrations shipped in under four months.',
    metric: '4mo',
    metricLabel: 'from kickoff to launch',
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
        <div class="section-header">
          <span class="section-label">Proof</span>
          <h2 class="section-title">Work that ships and scales</h2>
          <p class="section-subtitle">
            A selection of projects — each one launched, measured, and maintained.
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
