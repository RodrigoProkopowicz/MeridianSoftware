/**
 * AdminShell.js
 *
 * Top bar + tab switcher. Mounts one of the two tab views (LeadsTab,
 * UsersTab) into <section id="admin-main">.
 */

import { signOut } from '../../services/AuthenticationService.js';
import { escapeHtml } from '../../utils/DomHelper.js';
import { renderLeadsTab, initLeadsTab, destroyLeadsTab } from './LeadsTab.js';
import { renderUsersTab, initUsersTab, destroyUsersTab } from './UsersTab.js';

const TABS = [
  { id: 'leads', label: 'Leads' },
  { id: 'users', label: 'Usuarios' },
];

let activeTab = 'leads';

export function renderAdminShell(user) {
  const initial = escapeHtml((user.displayName || user.email || 'A')[0].toUpperCase());
  const name = escapeHtml(user.displayName || user.email || 'Admin');
  const avatar = user.photoURL
    ? `<img class="admin-shell__avatar" src="${escapeHtml(user.photoURL)}" alt="${name}" />`
    : `<div class="admin-shell__avatar admin-shell__avatar--initial">${initial}</div>`;

  return `
    <div class="admin-shell">
      <header class="admin-shell__header">
        <a class="admin-shell__brand" href="/" aria-label="Volver al sitio">
          <img src="/logo.png" alt="Meridian" class="admin-shell__logo" />
          <span class="admin-shell__brand-text">
            <span class="admin-shell__brand-name">Meridian</span>
            <span class="admin-shell__brand-tag">Admin</span>
          </span>
        </a>
        <nav class="admin-shell__tabs" role="tablist">
          ${TABS.map(t => `
            <button class="admin-shell__tab${t.id === activeTab ? ' is-active' : ''}"
                    data-tab="${t.id}" role="tab"
                    aria-selected="${t.id === activeTab ? 'true' : 'false'}">
              ${escapeHtml(t.label)}
            </button>
          `).join('')}
        </nav>
        <div class="admin-shell__user">
          ${avatar}
          <span class="admin-shell__user-name">${name}</span>
          <button class="admin-button admin-button--ghost admin-button--sm" id="admin-signout">
            Cerrar sesión
          </button>
        </div>
      </header>
      <section class="admin-shell__main" id="admin-main"></section>
    </div>
  `;
}

let currentDestroy = null;

export function initAdminShell() {
  document.querySelectorAll('.admin-shell__tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      if (next === activeTab) return;
      activeTab = next;
      document.querySelectorAll('.admin-shell__tab').forEach(b => {
        const isActive = b.dataset.tab === activeTab;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      mountActiveTab();
    });
  });

  const out = document.getElementById('admin-signout');
  if (out) out.addEventListener('click', () => signOut());

  mountActiveTab();
}

function mountActiveTab() {
  const main = document.getElementById('admin-main');
  if (!main) return;
  if (currentDestroy) {
    try { currentDestroy(); } catch (_) { /* ignore */ }
    currentDestroy = null;
  }
  if (activeTab === 'leads') {
    main.innerHTML = renderLeadsTab();
    initLeadsTab();
    currentDestroy = destroyLeadsTab;
  } else if (activeTab === 'users') {
    main.innerHTML = renderUsersTab();
    initUsersTab();
    currentDestroy = destroyUsersTab;
  }
}

export function destroyAdminShell() {
  if (currentDestroy) {
    try { currentDestroy(); } catch (_) { /* ignore */ }
    currentDestroy = null;
  }
}
