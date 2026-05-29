/**
 * PromoFooter.js
 *
 * Pie de página. El logo (y el enlace) llevan al sitio principal. Incluye los
 * links legales que ya existen en /privacy y /terms para reforzar confianza.
 */

import { MAIN_SITE_URL } from '../config.js';

export function renderPromoFooter() {
  const year = new Date().getFullYear();
  return `
    <footer class="promo-footer">
      <div class="promo-container promo-footer__inner">
        <a class="promo-footer__brand" href="${MAIN_SITE_URL}" aria-label="Ir al sitio principal de Meridian Software">
          <img src="/icon-192.png" alt="" class="promo-footer__logo" width="32" height="32" />
          <span class="promo-footer__brand-name">Meridian Software</span>
        </a>

        <p class="promo-footer__tagline">
          Webs profesionales para los negocios de San Miguel.
        </p>

        <nav class="promo-footer__links" aria-label="Enlaces legales">
          <a href="${MAIN_SITE_URL}">Sitio principal</a>
          <a href="/privacy">Privacidad</a>
          <a href="/terms">Términos</a>
        </nav>

        <p class="promo-footer__copy">© ${year} Meridian Software · Pagos procesados por Mercado Pago</p>
      </div>
    </footer>
  `;
}
