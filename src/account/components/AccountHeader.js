/**
 * AccountHeader.js — header liviano del área de cuenta. El logo lleva al inicio.
 */

import { signOut } from '../../services/AuthenticationService.js';
import { escapeHtml } from '../../utils/DomHelper.js';

export function renderAccountHeader(user) {
  const right = user
    ? `
        <div class="account-header__user">
          <span class="account-header__name">${escapeHtml(user.displayName || user.email || 'Mi cuenta')}</span>
          <button class="account-header__signout" id="account-signout" type="button">Salir</button>
        </div>
      `
    : `<a class="account-header__back" href="/">Volver al sitio</a>`;

  return `
    <header class="account-header">
      <div class="account-header__inner">
        <a class="account-header__brand" href="/" aria-label="Ir al inicio de Meridian Software">
          <img src="/icon-192.png" alt="" class="account-header__logo" width="36" height="36" />
          <span class="account-header__brand-text">Meridian <span>Software</span></span>
        </a>
        ${right}
      </div>
    </header>
  `;
}

export function initAccountHeader() {
  document.getElementById('account-signout')?.addEventListener('click', () => signOut());
}
