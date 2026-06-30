/**
 * PromotionalSection — entry point.
 *
 * Landing promocional independiente del sitio principal. Se monta bajo
 * #promo-app (promo.html) y vive aislada: no se enlaza desde la web principal,
 * solo se llega por link directo (/promo). Reutiliza la config de Firebase y
 * los tokens de diseño del proyecto, pero no comparte componentes con la landing.
 */

import '../styles/variables.css';
import '../styles/reset.css';
import './styles/promo.css';

import { renderPromoHeader, initPromoHeader } from './components/PromoHeader.js';
import { renderPromoHero } from './components/PromoHero.js';
import { renderPromoCountdown, initPromoCountdown } from './components/PromoCountdown.js';
import { renderPromoTrustBar } from './components/PromoTrustBar.js';
import { renderPromoFeatures } from './components/PromoFeatures.js';
import { renderPromoClients } from './components/PromoClients.js';
import { renderPromoPricing } from './components/PromoPricing.js';
import { renderPromoFAQ } from './components/PromoFAQ.js';
import { renderPromoForm, initPromoForm } from './components/PromoForm.js';
import { renderPromoFooter } from './components/PromoFooter.js';
import { renderPromoSuccess } from './components/PromoSuccess.js';

/**
 * Detecta si volvimos desde el checkout de Mercado Pago.
 * @returns {'success'|'pending'|null}
 */
function paymentReturnVariant() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || params.get('collection_status');
  if (status === 'pending' || status === 'in_process') return 'pending';
  if (status === 'success' || status === 'approved' || status === 'authorized') return 'success';
  // El back_url de preapproval suele volver con preapproval_id al autorizar.
  if (params.has('preapproval_id')) return 'success';
  return null;
}

function boot() {
  const root = document.getElementById('promo-app');
  if (!root) {
    console.error('PromotionalSection/main.js: #promo-app container not found');
    return;
  }

  const returnVariant = paymentReturnVariant();
  if (returnVariant) {
    root.innerHTML = renderPromoSuccess(returnVariant);
    window.scrollTo(0, 0);
    return;
  }

  root.innerHTML = `
    ${renderPromoHeader()}
    <main>
      ${renderPromoHero()}
      ${renderPromoCountdown()}
      ${renderPromoTrustBar()}
      ${renderPromoFeatures()}
      ${renderPromoClients()}
      ${renderPromoPricing()}
      ${renderPromoFAQ()}
      ${renderPromoForm()}
    </main>
    ${renderPromoFooter()}
  `;

  initPromoHeader();
  initPromoCountdown();
  initPromoForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
