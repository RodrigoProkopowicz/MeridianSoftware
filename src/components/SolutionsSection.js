/**
 * SolutionsSection.js
 * 
 * Showcases the agency's solutions in a card grid with scroll-reveal.
 */

import { renderSolutionCard } from './SolutionCard.js';
import { getCurrentUser } from '../services/AuthenticationService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { smoothScrollTo } from '../utils/DomHelper.js';

/** Solution data */
const SOLUTIONS = [
  {
    id: 'mobile-apps',
    icon: '📱',
    title: 'Mobile Applications',
    description: 'Native and cross-platform mobile apps that deliver seamless user experiences on iOS and Android.',
    features: [
      'iOS & Android development',
      'React Native & Flutter',
      'App Store optimization',
      'Push notifications & analytics',
    ],
  },
  {
    id: 'web-platforms',
    icon: '🌐',
    title: 'Web Platforms',
    description: 'Scalable, high-performance web applications and platforms built with modern frameworks.',
    features: [
      'Progressive Web Apps',
      'SaaS platforms',
      'E-commerce solutions',
      'Real-time dashboards',
    ],
  },
  {
    id: 'cloud-devops',
    icon: '☁️',
    title: 'Cloud & DevOps',
    description: 'Cloud infrastructure, CI/CD pipelines, and DevOps practices that ensure reliability at scale.',
    features: [
      'AWS, GCP & Azure',
      'Docker & Kubernetes',
      'CI/CD automation',
      'Monitoring & observability',
    ],
  },
  {
    id: 'custom-software',
    icon: '⚙️',
    title: 'Custom Software',
    description: 'Tailored software solutions designed to solve your unique business challenges from the ground up.',
    features: [
      'Requirements analysis',
      'System architecture design',
      'API integrations',
      'Legacy modernization',
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
          <span class="section-label">What We Do</span>
          <h2 class="section-title">Our Solutions</h2>
          <p class="section-subtitle">
            End-to-end software solutions engineered for performance, 
            scalability, and exceptional user experience.
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
 * Initializes solutions section event listeners.
 * @param {Function} openAuthModal - Function to open auth modal
 */
export function initSolutionsSection(openAuthModal) {
  document.querySelectorAll('[data-demo-trigger]').forEach(button => {
    button.addEventListener('click', () => {
      const solutionId = button.dataset.demoTrigger;
      const user = getCurrentUser();

      trackEvent(AnalyticsEvent.SOLUTION_DEMO_CLICKED, { solution_id: solutionId });

      if (!user) {
        openAuthModal('solution_card');
      } else {
        // Scroll to demo section and pre-select solution
        smoothScrollTo('#demo', 80);
        setTimeout(() => {
          const select = document.getElementById('demo-solution-select');
          if (select) select.value = solutionId;
        }, 600);
      }
    });
  });
}
