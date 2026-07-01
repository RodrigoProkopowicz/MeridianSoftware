/**
 * ProductsSection.js
 *
 * Showcase of in-house SaaS products built and operated by Meridian Software:
 *   - Stock Manager  →  /stock-manager
 *   - Medicus        →  /medicus
 *
 * The free trial is request-based: clicking "Solicitar prueba gratuita" scrolls
 * to the public request form (#demo) with the product pre-selected. An admin
 * then creates the account and grants the demo from the panel.
 */

import { DEMO_PRODUCTS } from '../services/DemoAccessService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { smoothScrollTo } from '../utils/DomHelper.js';

const PRODUCTS = [
  {
    id: DEMO_PRODUCTS.STOCK_MANAGER,
    icon: '📦',
    title: 'Stock Manager',
    tagline: 'Control de inventario para tu comercio',
    description:
      'Gestioná productos, movimientos y proveedores en tiempo real. ' +
      'Pensado para comercios que necesitan saber qué tienen, qué se ' +
      'mueve y qué hay que reponer — sin planillas eternas.',
    features: [
      'Alta de productos con SKU, costo y precio',
      'Movimientos de stock (ingresos, egresos, ajustes)',
      'Gestión de proveedores y órdenes',
      'Dashboard con alertas de bajo stock',
      'Insights de rotación y ventas',
    ],
    path: '/stock-manager/',
    accent: 'blue',
  },
  {
    id: DEMO_PRODUCTS.MEDICUS,
    icon: '🩺',
    title: 'Medicus',
    tagline: 'Gestión integral para consultorios y clínicas',
    description:
      'Historia clínica electrónica, agenda de turnos y finanzas en una ' +
      'sola plataforma. Diseñado junto a profesionales de la salud para ' +
      'reducir tiempo administrativo y enfocarse en el paciente.',
    features: [
      'Ficha clínica con historial de visitas',
      'Agenda de turnos con vista calendario',
      'Registro de ingresos y egresos',
      'Pacientes, diagnósticos y tratamientos',
      'Reportes financieros mensuales',
    ],
    path: '/medicus/',
    accent: 'green',
  },
];

/**
 * Renders the products section HTML.
 * @returns {string}
 */
export function renderProductsSection() {
  const cardsHTML = PRODUCTS.map(renderProductCard).join('');

  return `
    <section class="products-section section" id="products">
      <div class="container">
        <div class="section-header">
          <span class="section-label">Productos Meridian</span>
          <h2 class="section-title">Software listo para usar</h2>
          <p class="section-subtitle">
            Plataformas SaaS que construimos, mantenemos y mejoramos.
            Probalas gratis durante 7 días — sin tarjeta, sin compromiso.
          </p>
        </div>
        <div class="products-section__grid">
          ${cardsHTML}
        </div>
      </div>
    </section>
  `;
}

function renderProductCard(p) {
  const featuresHTML = p.features
    .map(f => `
      <li class="product-card__feature">
        <span class="product-card__feature-check" aria-hidden="true">✓</span>
        <span>${f}</span>
      </li>
    `)
    .join('');

  return `
    <article class="product-card product-card--${p.accent} glass-card" data-product-id="${p.id}">
      <header class="product-card__header">
        <div class="product-card__icon" aria-hidden="true">${p.icon}</div>
        <div>
          <h3 class="product-card__title">${p.title}</h3>
          <p class="product-card__tagline">${p.tagline}</p>
        </div>
      </header>

      <p class="product-card__description">${p.description}</p>

      <ul class="product-card__features">
        ${featuresHTML}
      </ul>

      <div class="product-card__actions">
        <button class="button-primary product-card__cta"
                data-product-cta="${p.id}"
                data-product-path="${p.path}">
          Solicitar prueba gratuita
        </button>
      </div>
    </article>
  `;
}

/**
 * Wires each product CTA to scroll to the public request form (#demo) with the
 * matching product pre-selected in the solution dropdown.
 */
export function initProductsSection() {
  document.querySelectorAll('[data-product-cta]').forEach(button => {
    button.addEventListener('click', () => {
      const productId = button.dataset.productCta;
      trackEvent(AnalyticsEvent.SOLUTION_DEMO_CLICKED, { solution_id: productId });
      smoothScrollTo('#demo', 80);
      // Pre-select the product once the smooth scroll has settled.
      setTimeout(() => {
        const select = document.getElementById('demo-solution-select');
        if (select) select.value = productId;
      }, 600);
    });
  });
}
