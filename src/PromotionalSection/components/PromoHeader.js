/**
 * PromoHeader.js
 *
 * Barra superior fija. El logo es un link al sitio principal (requisito:
 * "al presionar sobre el logo se redirige a la web principal"). A la derecha,
 * un CTA que lleva al formulario.
 */

import { MAIN_SITE_URL } from '../config.js';

export function renderPromoHeader() {
  return `
    <header class="promo-header" id="promo-header">
      <div class="promo-container promo-header__inner">
        <a class="promo-header__brand" href="${MAIN_SITE_URL}" aria-label="Ir al sitio principal de Meridian Software">
          <img src="/icon-192.png" alt="" class="promo-header__logo" width="36" height="36" />
          <span class="promo-header__brand-text">
            <span class="promo-header__brand-name">Meridian</span>
            <span class="promo-header__brand-tag">Software</span>
          </span>
        </a>
        <a class="promo-btn promo-btn--primary promo-header__cta" href="#promo-form">
          Quiero mi web
        </a>
      </div>
    </header>
  `;
}

export function initPromoHeader() {
  const header = document.getElementById('promo-header');
  if (!header) return;

  // Sombra al hacer scroll para dar sensación de profundidad/profesionalismo.
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}
