/**
 * ProductsSection.js
 *
 * Showcase of in-house SaaS products built and operated by Meridian Software:
 *   - Stock Manager  →  /stock-manager
 *   - Medicus        →  /medicus
 *
 * Both ship with a self-service 7-day demo. The user signs in, clicks
 * "Activar demo de 7 días", and we write users/{uid}/demoAccess/{productId}
 * with an expiresAt 7 days out. Each product checks that doc on login and
 * refuses access once expired.
 */

import { getCurrentUser, onAuthStateChange } from '../services/AuthenticationService.js';
import {
  activateDemoAccess,
  getDemoAccess,
  daysRemaining,
  DEMO_PRODUCTS,
} from '../services/DemoAccessService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { showToast } from '../utils/DomHelper.js';

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

      <div class="product-card__status" data-product-status="${p.id}" aria-live="polite"></div>

      <div class="product-card__actions">
        <button class="button-primary product-card__cta"
                data-product-cta="${p.id}"
                data-product-path="${p.path}">
          Activar demo de 7 días
        </button>
      </div>
    </article>
  `;
}

/**
 * Initializes product card buttons and refreshes their state when auth
 * resolves (so we can show "Demo activa — quedan X días" or "Demo expirada"
 * before the user clicks anything).
 * @param {Function} openAuthModal
 */
export function initProductsSection(openAuthModal) {
  const buttons = document.querySelectorAll('[data-product-cta]');

  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.productCta;
      const path = button.dataset.productPath;
      const user = getCurrentUser();

      if (!user) {
        openAuthModal('product_card');
        return;
      }

      await handleActivateOrEnter(button, productId, path, user.uid);
    });
  });

  // Reflect demo status on the card whenever auth state changes.
  onAuthStateChange(async (user) => {
    if (!user) {
      // Logged out — reset every card to its default CTA.
      PRODUCTS.forEach(p => updateCardState(p.id, null));
      return;
    }
    // Fetch each product's demoAccess doc in parallel.
    await Promise.all(
      PRODUCTS.map(async (p) => {
        try {
          const access = await getDemoAccess(user.uid, p.id);
          updateCardState(p.id, access);
        } catch (err) {
          console.warn(`ProductsSection: failed to read demoAccess/${p.id}`, err.message);
        }
      })
    );
  });
}

/**
 * Reflects the demo state on a product card: tweaks the button label,
 * shows the status pill ("Quedan X días" / "Demo expirada"), and stores
 * the path the button should open when clicked.
 * @param {string} productId
 * @param {{ expired: boolean, expiresAtMs: number }|null} access
 */
function updateCardState(productId, access) {
  const button = document.querySelector(`[data-product-cta="${productId}"]`);
  const statusEl = document.querySelector(`[data-product-status="${productId}"]`);
  if (!button || !statusEl) return;

  if (!access) {
    button.textContent = 'Activar demo de 7 días';
    button.dataset.productMode = 'activate';
    statusEl.innerHTML = '';
    statusEl.className = 'product-card__status';
    return;
  }

  if (access.expired) {
    button.textContent = 'Demo expirada — Contactanos';
    button.dataset.productMode = 'expired';
    statusEl.innerHTML = `
      <span class="product-card__status-pill product-card__status-pill--expired">
        Demo expirada · contactanos para extender
      </span>
    `;
    statusEl.className = 'product-card__status';
    return;
  }

  const days = daysRemaining(access.expiresAtMs);
  button.textContent = days <= 1 ? 'Ingresar (último día)' : 'Ingresar al producto';
  button.dataset.productMode = 'enter';
  statusEl.innerHTML = `
    <span class="product-card__status-pill product-card__status-pill--active">
      Demo activa · ${days} día${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}
    </span>
  `;
  statusEl.className = 'product-card__status';
}

/**
 * Decides whether to activate a fresh demo, redirect into a running demo,
 * or surface the expired/contact path. Updates the card state in place.
 */
async function handleActivateOrEnter(button, productId, path, uid) {
  const previousLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = '<div class="spinner"></div> Procesando...';

  try {
    const access = await getDemoAccess(uid, productId);

    if (access && !access.expired) {
      window.location.href = path;
      return;
    }

    if (access && access.expired) {
      showToast(
        'Tu demo de 7 días expiró. Escribinos en la sección Contacto para extenderla.',
        'error',
        7000,
      );
      // Smooth scroll to contact form so the user has a clear next step.
      const contact = document.getElementById('contact');
      if (contact) contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Fresh activation.
    const { expiresAtMs } = await activateDemoAccess(uid, productId);
    trackEvent(AnalyticsEvent.PRODUCT_DEMO_ACTIVATED, { product_id: productId });
    updateCardState(productId, { expiresAtMs, expired: false });
    showToast(
      `Demo de ${productLabel(productId)} activada por 7 días. ¡Disfrutala!`,
      'success',
      5000,
    );
    // Small delay so the user sees the success toast before redirecting.
    setTimeout(() => { window.location.href = path; }, 900);
  } catch (err) {
    console.error('ProductsSection: activation failed', err);
    showToast('No pudimos activar la demo. Probá de nuevo en unos segundos.', 'error');
    button.textContent = previousLabel;
  } finally {
    button.disabled = false;
  }
}

function productLabel(productId) {
  if (productId === DEMO_PRODUCTS.STOCK_MANAGER) return 'Stock Manager';
  if (productId === DEMO_PRODUCTS.MEDICUS) return 'Medicus';
  return productId;
}
