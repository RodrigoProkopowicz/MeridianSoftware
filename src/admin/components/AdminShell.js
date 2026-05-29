/**
 * AdminShell.js
 *
 * Sidebar + topbar dashboard layout. Sidebar holds the brand, nav, and user
 * info. Topbar shows the active section title and exposes a slot
 * (`#admin-topbar-slot`) where each tab injects its own contextual actions.
 * The active tab view is mounted into `<section id="admin-page">`.
 */

import { signOut } from '../../services/AuthenticationService.js';
import { escapeHtml } from '../../utils/DomHelper.js';
import { renderLeadsTab, initLeadsTab, destroyLeadsTab } from './LeadsTab.js';
import { renderUsersTab, initUsersTab, destroyUsersTab } from './UsersTab.js';
import { renderPromotionalTab, initPromotionalTab, destroyPromotionalTab } from './PromotionalTab.js';

const TABS = [
  {
    id: 'leads',
    label: 'Leads',
    icon: `<path d="M3 7h18M3 12h18M3 17h18"/>`,
  },
  {
    id: 'users',
    label: 'Usuarios',
    icon: `<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>`,
  },
  {
    id: 'promotional',
    label: 'Promocional',
    icon: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>`,
  },
];

let activeTab = 'leads';

export function renderAdminShell(user) {
  const initial = escapeHtml((user.displayName || user.email || 'A')[0].toUpperCase());
  const displayName = escapeHtml(user.displayName || user.email || 'Admin');
  const email = escapeHtml(user.email || '');
  const avatar = user.photoURL
    ? `<img class="admin-sidebar__user-avatar" src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="admin-sidebar__user-avatar admin-sidebar__user-avatar--initial">${initial}</div>`;

  return `
    <div class="admin-app">
      <aside class="admin-sidebar">
        <a class="admin-sidebar__brand" href="/" aria-label="Volver al sitio">
          <img src="/icon-192.png" alt="" class="admin-sidebar__logo" />
          <span class="admin-sidebar__brand-text">
            <span class="admin-sidebar__brand-name">Meridian</span>
            <span class="admin-sidebar__brand-tag">Admin</span>
          </span>
        </a>

        <div class="admin-sidebar__section-label">Gestión</div>
        <nav class="admin-sidebar__nav" role="tablist" aria-label="Secciones">
          ${TABS.map(tabButton).join('')}
        </nav>

        <div class="admin-sidebar__spacer"></div>

        <a class="admin-sidebar__back" href="/">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          Volver al sitio
        </a>

        <div class="admin-sidebar__divider"></div>

        <div class="admin-sidebar__user">
          ${avatar}
          <div class="admin-sidebar__user-info">
            <div class="admin-sidebar__user-name">${displayName}</div>
            <div class="admin-sidebar__user-email">${email}</div>
          </div>
          <button class="admin-sidebar__signout" id="admin-signout" type="button" aria-label="Cerrar sesión" title="Cerrar sesión">
            Salir
          </button>
        </div>
      </aside>

      <main class="admin-main">
        <header class="admin-topbar">
          <h1 class="admin-topbar__title">
            <span id="admin-topbar-title">${escapeHtml(labelFor(activeTab))}</span>
            <span class="admin-topbar__meta" id="admin-topbar-meta"></span>
          </h1>
          <div class="admin-topbar__actions" id="admin-topbar-slot"></div>
        </header>
        <section class="admin-page" id="admin-page"></section>
      </main>
    </div>
  `;
}

function tabButton(tab) {
  const isActive = tab.id === activeTab;
  return `
    <button class="admin-sidebar__nav-item${isActive ? ' is-active' : ''}"
            data-tab="${tab.id}" role="tab"
            aria-selected="${isActive ? 'true' : 'false'}" type="button">
      <svg class="admin-sidebar__nav-icon" viewBox="0 0 24 24" aria-hidden="true">${tab.icon}</svg>
      <span class="admin-sidebar__nav-label">${escapeHtml(tab.label)}</span>
    </button>
  `;
}

function labelFor(id) {
  return TABS.find(t => t.id === id)?.label || '';
}

let currentDestroy = null;

export function initAdminShell() {
  document.querySelectorAll('.admin-sidebar__nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      if (next === activeTab) return;
      activeTab = next;
      document.querySelectorAll('.admin-sidebar__nav-item').forEach(b => {
        const isActive = b.dataset.tab === activeTab;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      const titleEl = document.getElementById('admin-topbar-title');
      if (titleEl) titleEl.textContent = labelFor(activeTab);
      setTopbarMeta('');
      mountActiveTab();
    });
  });

  const out = document.getElementById('admin-signout');
  if (out) out.addEventListener('click', () => signOut());

  mountActiveTab();
}

function mountActiveTab() {
  const page = document.getElementById('admin-page');
  if (!page) return;
  if (currentDestroy) {
    try { currentDestroy(); } catch (_) { /* ignore */ }
    currentDestroy = null;
  }
  clearTopbarSlot();
  if (activeTab === 'leads') {
    page.innerHTML = renderLeadsTab();
    initLeadsTab();
    currentDestroy = destroyLeadsTab;
  } else if (activeTab === 'users') {
    page.innerHTML = renderUsersTab();
    initUsersTab();
    currentDestroy = destroyUsersTab;
  } else if (activeTab === 'promotional') {
    page.innerHTML = renderPromotionalTab();
    initPromotionalTab();
    currentDestroy = destroyPromotionalTab;
  }
}

function clearTopbarSlot() {
  const slot = document.getElementById('admin-topbar-slot');
  if (slot) slot.innerHTML = '';
}

/** Update the small meta string shown next to the topbar title (e.g. "42 resultados"). */
export function setTopbarMeta(text) {
  const el = document.getElementById('admin-topbar-meta');
  if (el) el.textContent = text || '';
}

/**
 * Render contextual actions for the active tab into the topbar slot.
 * Pass a render callback that receives the slot element.
 */
export function renderTopbarActions(renderInto) {
  const slot = document.getElementById('admin-topbar-slot');
  if (!slot) return;
  slot.innerHTML = '';
  renderInto(slot);
}

export function destroyAdminShell() {
  if (currentDestroy) {
    try { currentDestroy(); } catch (_) { /* ignore */ }
    currentDestroy = null;
  }
}
