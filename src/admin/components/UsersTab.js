/**
 * UsersTab.js
 *
 * Searchable users list. Selecting a user opens a detail card that exposes:
 *   - Demo access management (grant / extend / revoke) for each product
 *   - Promote / demote admin via the setAdminClaim callable
 */

import {
  listUsers,
  listDemoAccess,
  grantDemoAccess,
  extendDemoAccess,
  revokeDemoAccess,
  setAdminClaim,
  DEMO_PRODUCTS,
} from '../services/AdminService.js';
import { getCurrentUser } from '../../services/AuthenticationService.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';
import { formatTimestamp, formatRelative } from '../utils/Format.js';

let users = [];
let filteredUsers = [];
let searchTerm = '';
let selectedUid = null;
let selectedDemos = [];

export function renderUsersTab() {
  return `
    <div class="admin-tab admin-tab--users">
      <div class="admin-tab__header">
        <h2 class="admin-tab__title">Usuarios</h2>
        <div class="admin-tab__controls">
          <input class="admin-input admin-input--search" id="users-search"
                 type="search" placeholder="Buscar por nombre o email…" autocomplete="off" />
          <button class="admin-button admin-button--sm" id="users-refresh">Actualizar</button>
        </div>
      </div>
      <div class="admin-tab__body admin-tab__body--split">
        <div class="admin-users-list" id="users-list">
          <div class="admin-empty">Cargando…</div>
        </div>
        <div class="admin-users-detail" id="users-detail">
          <div class="admin-empty">Seleccioná un usuario para gestionar sus demos y permisos.</div>
        </div>
      </div>
    </div>
  `;
}

export function initUsersTab() {
  document.getElementById('users-refresh')?.addEventListener('click', loadUsers);
  const search = document.getElementById('users-search');
  if (search) {
    search.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      applyFilter();
      renderList();
    });
  }
  loadUsers();
}

export function destroyUsersTab() {
  users = [];
  filteredUsers = [];
  searchTerm = '';
  selectedUid = null;
  selectedDemos = [];
}

async function loadUsers() {
  const list = document.getElementById('users-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty">Cargando…</div>';
  try {
    users = await listUsers();
    applyFilter();
    renderList();
  } catch (err) {
    console.error('UsersTab: load failed', err);
    list.innerHTML = `<div class="admin-empty admin-empty--error">No pudimos cargar los usuarios: ${escapeHtml(err.message)}</div>`;
  }
}

function applyFilter() {
  if (!searchTerm) {
    filteredUsers = users;
    return;
  }
  filteredUsers = users.filter(u => {
    const haystack = `${u.displayName || ''} ${u.email || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
}

function renderList() {
  const list = document.getElementById('users-list');
  if (!list) return;

  if (filteredUsers.length === 0) {
    list.innerHTML = '<div class="admin-empty">No encontramos usuarios.</div>';
    return;
  }

  list.innerHTML = filteredUsers.map(userRowHtml).join('');
  list.querySelectorAll('[data-uid]').forEach(row => {
    row.addEventListener('click', () => selectUser(row.dataset.uid));
  });
}

function userRowHtml(u) {
  const name = escapeHtml(u.displayName || u.email || 'User');
  const email = escapeHtml(u.email || '');
  const last = u.lastLoginAt ? formatRelative(u.lastLoginAt) : '—';
  const initial = escapeHtml((u.displayName || u.email || 'U')[0].toUpperCase());
  const avatar = u.photoURL
    ? `<img class="admin-user-row__avatar" src="${escapeHtml(u.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="admin-user-row__avatar admin-user-row__avatar--initial">${initial}</div>`;
  const selected = selectedUid === u.uid ? ' is-selected' : '';
  return `
    <button class="admin-user-row${selected}" data-uid="${escapeHtml(u.uid)}" type="button">
      ${avatar}
      <div class="admin-user-row__info">
        <div class="admin-user-row__name">${name}</div>
        <div class="admin-user-row__email">${email}</div>
      </div>
      <div class="admin-user-row__meta">${escapeHtml(last)}</div>
    </button>
  `;
}

async function selectUser(uid) {
  selectedUid = uid;
  selectedDemos = [];
  document.querySelectorAll('.admin-user-row').forEach(r => {
    r.classList.toggle('is-selected', r.dataset.uid === uid);
  });
  const detail = document.getElementById('users-detail');
  if (!detail) return;
  detail.innerHTML = '<div class="admin-empty">Cargando usuario…</div>';
  try {
    selectedDemos = await listDemoAccess(uid);
    renderDetail();
  } catch (err) {
    console.error('UsersTab: load demos failed', err);
    detail.innerHTML = `<div class="admin-empty admin-empty--error">No pudimos cargar las demos: ${escapeHtml(err.message)}</div>`;
  }
}

function renderDetail() {
  const detail = document.getElementById('users-detail');
  if (!detail) return;
  const user = users.find(u => u.uid === selectedUid);
  if (!user) return;

  const isSelf = getCurrentUser()?.uid === user.uid;
  const name = escapeHtml(user.displayName || user.email || 'User');
  const email = escapeHtml(user.email || '—');

  detail.innerHTML = `
    <div class="admin-detail__card">
      <h3 class="admin-detail__title">${name}</h3>
      <dl class="admin-detail__list">
        <dt>Email</dt><dd>${email}</dd>
        <dt>Proveedor</dt><dd>${escapeHtml(user.provider || '—')}</dd>
        <dt>UID</dt><dd><code>${escapeHtml(user.uid)}</code></dd>
        <dt>Creado</dt><dd>${escapeHtml(formatTimestamp(user.createdAt))}</dd>
        <dt>Último ingreso</dt><dd>${escapeHtml(formatTimestamp(user.lastLoginAt))}</dd>
      </dl>

      <h4 class="admin-detail__subtitle">Acceso a demos</h4>
      <div class="admin-demos">
        ${DEMO_PRODUCTS.map(p => renderProductRow(p, findDemo(p.id))).join('')}
      </div>

      <h4 class="admin-detail__subtitle">Permisos de admin</h4>
      <div class="admin-detail__actions">
        <button class="admin-button admin-button--primary" id="user-make-admin"${isSelf ? ' disabled title="No podés cambiar tu propio rol"' : ''}>
          Otorgar admin
        </button>
        <button class="admin-button admin-button--danger" id="user-revoke-admin"${isSelf ? ' disabled title="No podés revocar tu propio rol"' : ''}>
          Revocar admin
        </button>
      </div>
      <p class="admin-detail__hint">
        El usuario tiene que cerrar sesión y volver a entrar (o esperar hasta
        una hora) para que el nuevo permiso aparezca del lado del cliente.
      </p>
    </div>
  `;

  DEMO_PRODUCTS.forEach(p => attachDemoHandlers(p.id));
  document.getElementById('user-make-admin')?.addEventListener('click', () => updateAdmin(user, true));
  document.getElementById('user-revoke-admin')?.addEventListener('click', () => updateAdmin(user, false));
}

function findDemo(productId) {
  return selectedDemos.find(d => d.productId === productId) || null;
}

function renderProductRow(product, demo) {
  const expires = demo?.expiresAt ? formatTimestamp(demo.expiresAt) : null;
  const remaining = demo?.expiresAt ? remainingDays(demo.expiresAt) : null;
  const isExpired = remaining !== null && remaining < 0;
  const statusLabel = !demo
    ? '<span class="admin-pill admin-pill--off">Sin acceso</span>'
    : isExpired
      ? '<span class="admin-pill admin-pill--expired">Expirado</span>'
      : '<span class="admin-pill admin-pill--active">Activo</span>';

  return `
    <div class="admin-demo-row" data-product="${escapeHtml(product.id)}">
      <div class="admin-demo-row__head">
        <div class="admin-demo-row__title">${escapeHtml(product.label)}</div>
        ${statusLabel}
      </div>
      ${demo ? `
        <div class="admin-demo-row__meta">
          Vence ${escapeHtml(expires)}${remaining !== null && !isExpired ? ` &middot; ${remaining}d restantes` : ''}
        </div>
      ` : ''}
      <div class="admin-demo-row__actions">
        <label class="admin-field admin-field--inline">
          <span class="admin-field__label">Días</span>
          <input class="admin-input admin-input--num" type="number"
                 min="1" max="7" value="7" data-demo-days="${escapeHtml(product.id)}" />
        </label>
        ${demo ? `
          <button class="admin-button admin-button--sm" data-demo-action="extend" data-product-id="${escapeHtml(product.id)}">Extender</button>
          <button class="admin-button admin-button--sm admin-button--danger" data-demo-action="revoke" data-product-id="${escapeHtml(product.id)}">Revocar</button>
        ` : `
          <button class="admin-button admin-button--sm admin-button--primary" data-demo-action="grant" data-product-id="${escapeHtml(product.id)}">Otorgar</button>
        `}
      </div>
    </div>
  `;
}

function remainingDays(expiresAt) {
  const ms = expiresAt.toMillis() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function attachDemoHandlers(productId) {
  const row = document.querySelector(`.admin-demo-row[data-product="${cssEscape(productId)}"]`);
  if (!row) return;
  row.querySelectorAll('[data-demo-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.demoAction;
      const days = parseInt(row.querySelector(`[data-demo-days="${cssEscape(productId)}"]`)?.value, 10) || 7;
      btn.disabled = true;
      try {
        if (action === 'grant') await grantDemoAccess(selectedUid, productId, days);
        else if (action === 'extend') await extendDemoAccess(selectedUid, productId, days);
        else if (action === 'revoke') await revokeDemoAccess(selectedUid, productId);
        selectedDemos = await listDemoAccess(selectedUid);
        renderDetail();
        showToast(`Demo ${action === 'revoke' ? 'revocada' : 'actualizada'}`, 'success');
      } catch (err) {
        console.error('UsersTab: demo action failed', err);
        showToast(`No pudimos completar la acción: ${err.message}`, 'error');
        btn.disabled = false;
      }
    });
  });
}

async function updateAdmin(user, makeAdmin) {
  const id = makeAdmin ? 'user-make-admin' : 'user-revoke-admin';
  const btn = document.getElementById(id);
  if (btn) btn.disabled = true;
  try {
    await setAdminClaim(user.uid, makeAdmin);
    showToast(makeAdmin ? 'Admin otorgado' : 'Admin revocado', 'success');
  } catch (err) {
    console.error('UsersTab: setAdminClaim failed', err);
    const msg = err.code === 'functions/permission-denied'
      ? 'No tenés permiso para cambiar roles de admin.'
      : err.message || 'No pudimos completar la operación.';
    showToast(msg, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Minimal CSS.escape polyfill — old browsers may lack it but we still need
 * to interpolate productId / uid into selectors safely.
 */
function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}
