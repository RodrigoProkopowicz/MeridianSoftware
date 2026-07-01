/**
 * SolutionsSection.js
 * 
 * Showcases the agency's solutions in a card grid with scroll-reveal.
 */

import { renderSolutionCard } from './SolutionCard.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { smoothScrollTo } from '../utils/DomHelper.js';

/** Solution data */
const SOLUTIONS = [
  {
    id: 'mobile-apps',
    icon: '📱',
    title: 'Aplicaciones móviles',
    description: 'Apps nativas y multiplataforma que ofrecen una experiencia fluida en iOS y Android.',
    features: [
      'Desarrollo nativo iOS en Swift',
      'Desarrollo nativo Android en Kotlin',
      'Optimización para App Store y Play Store',
      'Notificaciones push y analítica',
    ],
  },
  {
    id: 'web-platforms',
    icon: '🌐',
    title: 'Plataformas web',
    description: 'Aplicaciones web escalables y de alto rendimiento construidas con frameworks modernos.',
    features: [
      'Progressive Web Apps',
      'Plataformas SaaS',
      'Soluciones de e-commerce',
      'Dashboards en tiempo real',
    ],
  },
  {
    id: 'cloud-devops',
    icon: '☁️',
    title: 'Cloud y DevOps',
    description: 'Infraestructura cloud, pipelines de CI/CD y prácticas DevOps para asegurar la fiabilidad a escala.',
    features: [
      'AWS, GCP y Azure',
      'Docker y Kubernetes',
      'Automatización de CI/CD',
      'Monitoreo y observabilidad',
    ],
  },
  {
    id: 'custom-software',
    icon: '⚙️',
    title: 'Software a medida',
    description: 'Soluciones diseñadas desde cero para resolver desafíos específicos de tu negocio.',
    features: [
      'Análisis de requisitos',
      'Diseño de arquitectura',
      'Integraciones de API',
      'Modernización de sistemas legacy',
    ],
  },
];

/**
 * Renders the solutions section HTML.
 * @returns {string}
 */
export function renderSolutionsSection() {
  const cardsHTML = SOLUTIONS.map(s => renderSolutionCard(s)).join('');

  return `
    <section class="solutions-section section" id="solutions">
      <div class="container">
        <div class="section-header">
          <span class="section-label">Servicios a medida</span>
          <h2 class="section-title">Lo que hacemos</h2>
          <p class="section-subtitle">
            Soluciones de software end-to-end diseñadas para rendimiento,
            escalabilidad y una experiencia de usuario excepcional.
          </p>
        </div>
        <div class="solutions-section__grid">
          ${cardsHTML}
        </div>
      </div>
    </section>
  `;
}

/**
 * Initializes solutions section event listeners. Clicking a solution's demo
 * trigger scrolls to the public request form and pre-selects that solution.
 */
export function initSolutionsSection() {
  document.querySelectorAll('[data-demo-trigger]').forEach(button => {
    button.addEventListener('click', () => {
      const solutionId = button.dataset.demoTrigger;
      trackEvent(AnalyticsEvent.SOLUTION_DEMO_CLICKED, { solution_id: solutionId });
      smoothScrollTo('#demo', 80);
      setTimeout(() => {
        const select = document.getElementById('demo-solution-select');
        if (select) select.value = solutionId;
      }, 600);
    });
  });
}
