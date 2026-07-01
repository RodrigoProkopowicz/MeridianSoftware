/**
 * AdminShell.js
 *
 * Sidebar + topbar dashboard layout. Sidebar holds the brand, nav, and user
 * info. Topbar shows the active section title and exposes a slot
 * (`#admin-topbar-slot`) where each tab injects its own contextual actions.
 * The active tab view is mounted into `<section id="admin-page">`.
 */

import { signOut } from '../../services/AuthenticationService.js';
import { escapeHtml, lockBodyScroll, unlockBodyScroll } from '../../utils/DomHelper.js';
import { renderLeadsTab, initLeadsTab, destroyLeadsTab } from './LeadsTab.js';
import { renderUsersTab, initUsersTab, destroyUsersTab } from './UsersTab.js';
import { renderPromotionalTab, initPromotionalTab, destroyPromotionalTab } from './PromotionalTab.js';

const TABS = [
  {
    id: 'leads',
    label: 'Pedidos',
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
  const accountAvatar = user.photoURL
    ? `<img class="admin-topbar__account-avatar" src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="admin-topbar__account-avatar admin-topbar__account-avatar--initial">${initial}</div>`;

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
          <div class="admin-topbar__account">
            <button class="admin-topbar__account-btn" id="admin-account-btn" type="button"
                    aria-haspopup="true" aria-expanded="false" aria-label="Cuenta y sesión">
              ${accountAvatar}
            </button>
            <div class="admin-topbar__menu" id="admin-account-menu" role="menu" hidden>
              <div class="admin-topbar__menu-user">
                <div class="admin-topbar__menu-name">${displayName}</div>
                <div class="admin-topbar__menu-email">${email}</div>
              </div>
              <a class="admin-topbar__menu-item" href="/" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
                Volver al sitio
              </a>
              <button class="admin-topbar__menu-item admin-topbar__menu-item--danger" id="admin-signout-mobile" type="button" role="menuitem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                Cerrar sesión
              </button>
            </div>
          </div>
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

  initAccountMenu();
  initDetailBackDelegation();
  initCompactGuard();

  mountActiveTab();
}

/**
 * If the viewport grows out of the compact range while a detail sheet is open
 * (e.g. a large phone rotated to landscape past 900px), the sheet's CSS stops
 * applying — so close it and release the scroll-lock to avoid a stuck body.
 */
function initCompactGuard() {
  const mq = window.matchMedia(COMPACT_QUERY);
  const handler = (e) => { if (!e.matches) closeDetailSheet(); };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler); // Safari < 14
}

/**
 * Topbar account menu (mobile). The button toggles a popover with the user
 * info, "back to site" and "sign out". Closes on outside click / Escape.
 */
function initAccountMenu() {
  const btn = document.getElementById('admin-account-btn');
  const menu = document.getElementById('admin-account-menu');
  if (!btn || !menu) return;

  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  const toggle = () => {
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    btn.setAttribute('aria-expanded', String(willOpen));
  };

  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  menu.querySelector('#admin-signout-mobile')?.addEventListener('click', () => signOut());
}

/**
 * One delegated listener on the (stable) page container handles every tab's
 * mobile "back to list" button, so individual tabs don't each wire it up.
 */
function initDetailBackDelegation() {
  const page = document.getElementById('admin-page');
  if (!page) return;
  page.addEventListener('click', (e) => {
    if (e.target.closest('[data-detail-back]')) closeDetailSheet();
  });
}

function mountActiveTab() {
  const page = document.getElementById('admin-page');
  if (!page) return;
  // Releases the body scroll-lock if a detail sheet was left open when the
  // user switched tabs; the new tab re-renders a fresh, closed split.
  closeDetailSheet();
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

const COMPACT_QUERY = '(max-width: 900px)';

/**
 * Open the active tab's detail as a mobile drill-down sheet. On desktop this
 * only sets an inert class (the split is always two-column there), so tabs can
 * call it unconditionally when a row is selected.
 */
export function openDetailSheet() {
  const split = document.querySelector('.admin-split');
  if (!split) return;
  const wasOpen = split.classList.contains('is-detail-open');
  split.classList.add('is-detail-open');
  if (!wasOpen && window.matchMedia(COMPACT_QUERY).matches) {
    lockBodyScroll();
    split.dataset.sheetLocked = 'true';
  }
  split.lastElementChild?.scrollTo?.(0, 0);
}

/** Close the mobile detail sheet and release the scroll-lock if we set one. */
export function closeDetailSheet() {
  const split = document.querySelector('.admin-split');
  if (!split) return;
  split.classList.remove('is-detail-open');
  if (split.dataset.sheetLocked === 'true') {
    unlockBodyScroll();
    delete split.dataset.sheetLocked;
  }
}

/** Markup for the sticky "back to list" bar shown at the top of a detail sheet. */
export function detailBackButtonHtml() {
  return `
    <button class="admin-detail__back" type="button" data-detail-back aria-label="Volver a la lista">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      Volver
    </button>
  `;
}

export function destroyAdminShell() {
  if (currentDestroy) {
    try { currentDestroy(); } catch (_) { /* ignore */ }
    currentDestroy = null;
  }
}
