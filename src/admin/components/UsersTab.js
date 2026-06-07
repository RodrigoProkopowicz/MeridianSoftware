/**
 * UsersTab.js
 *
 * Searchable users list. Selecting a user opens a detail panel that exposes:
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
  deleteUser,
  DEMO_PRODUCTS,
} from '../services/AdminService.js';
import { getCurrentUser } from '../../services/AuthenticationService.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';
import { formatTimestamp, formatRelative } from '../utils/Format.js';
import { renderTopbarActions, setTopbarMeta, openDetailSheet, closeDetailSheet, detailBackButtonHtml } from './AdminShell.js';

let users = [];
let filteredUsers = [];
let searchTerm = '';
let selectedUid = null;
let selectedDemos = [];

export function renderUsersTab() {
  return `
    <div class="admin-split">
      <div class="admin-panel admin-panel--scroll" id="users-list">
        <div class="admin-empty">Cargando…</div>
      </div>
      <div id="users-detail">
        ${detailPlaceholder()}
      </div>
    </div>
  `;
}

export function initUsersTab() {
  renderTopbarActions((slot) => {
    slot.innerHTML = `
      <input class="admin-input admin-input--search" id="users-search"
             type="search" placeholder="Buscar por nombre o email…" autocomplete="off" />
      <button class="admin-button" id="users-refresh" type="button">Actualizar</button>
    `;
    const search = slot.querySelector('#users-search');
    if (search) {
      search.value = searchTerm;
      search.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        applyFilter();
        renderList();
        setTopbarMeta(metaText());
      });
    }
    slot.querySelector('#users-refresh')?.addEventListener('click', loadUsers);
  });
  loadUsers();
}

export function destroyUsersTab() {
  users = [];
  filteredUsers = [];
  searchTerm = '';
  selectedUid = null;
  selectedDemos = [];
  setTopbarMeta('');
}

async function loadUsers() {
  const list = document.getElementById('users-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty">Cargando…</div>';
  try {
    users = await listUsers();
    applyFilter();
    renderList();
    setTopbarMeta(metaText());
  } catch (err) {
    console.error('UsersTab: load failed', err);
    list.innerHTML = `<div class="admin-empty admin-empty--error">No pudimos cargar los usuarios: ${escapeHtml(err.message)}</div>`;
    setTopbarMeta('');
  }
}

function metaText() {
  const total = users.length;
  const shown = filteredUsers.length;
  if (!total) return '';
  if (searchTerm) return `${shown} de ${total}`;
  return `${total} ${total === 1 ? 'usuario' : 'usuarios'}`;
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
  const name = escapeHtml(u.displayName || u.email || 'Usuario');
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
  detail.innerHTML = `
    <div class="admin-detail">
      ${detailBackButtonHtml()}
      <div class="admin-detail__placeholder">
        <span class="admin-spinner admin-spinner--lg"></span>
        <div style="margin-top: 0.5rem;">Cargando usuario…</div>
      </div>
    </div>
  `;
  openDetailSheet();
  try {
    selectedDemos = await listDemoAccess(uid);
    renderDetail();
  } catch (err) {
    console.error('UsersTab: load demos failed', err);
    detail.innerHTML = `<div class="admin-detail"><div class="admin-empty admin-empty--error">No pudimos cargar las demos: ${escapeHtml(err.message)}</div></div>`;
  }
}

function detailPlaceholder() {
  return `
    <div class="admin-detail">
      <div class="admin-detail__placeholder">
        <svg class="admin-detail__placeholder-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5"/>
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>
        </svg>
        Seleccioná un usuario para gestionar
        sus accesos y permisos.
      </div>
    </div>
  `;
}

function renderDetail() {
  const detail = document.getElementById('users-detail');
  if (!detail) return;
  const user = users.find(u => u.uid === selectedUid);
  if (!user) return;

  const isSelf = getCurrentUser()?.uid === user.uid;
  const isAdmin = user.admin === true;
  const name = escapeHtml(user.displayName || user.email || 'Usuario');
  const email = escapeHtml(user.email || '—');

  detail.innerHTML = `
    <div class="admin-detail">
      ${detailBackButtonHtml()}
      <div class="admin-detail__head">
        <span class="admin-detail__title">${name}${isAdmin ? ' <span class="admin-pill admin-pill--active">Admin</span>' : ''}</span>
        <span class="admin-detail__date">${escapeHtml(formatTimestamp(user.createdAt))}</span>
      </div>
      <dl class="admin-detail__list">
        <dt>Email</dt><dd>${email}</dd>
        <dt>Proveedor</dt><dd>${escapeHtml(user.provider || '—')}</dd>
        <dt>UID</dt><dd><code>${escapeHtml(user.uid)}</code></dd>
        <dt>Último ingreso</dt><dd>${escapeHtml(formatTimestamp(user.lastLoginAt))}</dd>
      </dl>

      <h4 class="admin-detail__subtitle">Acceso a demos</h4>
      <div class="admin-demos">
        ${DEMO_PRODUCTS.map(p => renderProductRow(p, findDemo(p.id))).join('')}
      </div>

      <h4 class="admin-detail__subtitle">Permisos de admin</h4>
      <div class="admin-detail__actions">
        ${isAdmin
          ? `<button class="admin-button admin-button--danger" id="user-toggle-admin"${isSelf ? ' disabled title="No podés cambiar tu propio rol"' : ''}>Revocar admin</button>`
          : `<button class="admin-button admin-button--primary" id="user-toggle-admin"${isSelf ? ' disabled title="No podés cambiar tu propio rol"' : ''}>Otorgar admin</button>`}
      </div>
      <p class="admin-detail__hint">
        El usuario tiene que cerrar sesión y volver a entrar (o esperar hasta
        una hora) para que el nuevo permiso aparezca del lado del cliente.
      </p>

      <h4 class="admin-detail__subtitle">Zona peligrosa</h4>
      <div class="admin-detail__actions">
        <button class="admin-button admin-button--danger" id="user-delete"${isSelf ? ' disabled title="No podés eliminar tu propia cuenta"' : ''}>
          Eliminar usuario
        </button>
      </div>
      <p class="admin-detail__hint">
        Borra la cuenta, el perfil y los accesos demo. No se puede deshacer.
      </p>
    </div>
  `;

  DEMO_PRODUCTS.forEach(p => attachDemoHandlers(p.id));
  document.getElementById('user-toggle-admin')?.addEventListener('click', () => updateAdmin(user, !isAdmin));
  document.getElementById('user-delete')?.addEventListener('click', () => removeUser(user));
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
          <button class="admin-button" data-demo-action="extend" data-product-id="${escapeHtml(product.id)}">Extender</button>
          <button class="admin-button admin-button--danger" data-demo-action="revoke" data-product-id="${escapeHtml(product.id)}">Revocar</button>
        ` : `
          <button class="admin-button admin-button--primary" data-demo-action="grant" data-product-id="${escapeHtml(product.id)}">Otorgar</button>
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
  const btn = document.getElementById('user-toggle-admin');
  if (btn) btn.disabled = true;
  try {
    await setAdminClaim(user.uid, makeAdmin);
    user.admin = makeAdmin; // reflejar localmente para que el botón cambie
    renderList();
    renderDetail();
    showToast(makeAdmin ? 'Admin otorgado' : 'Admin revocado', 'success');
  } catch (err) {
    console.error('UsersTab: setAdminClaim failed', err);
    const msg = err.code === 'functions/permission-denied'
      ? 'No tenés permiso para cambiar roles de admin.'
      : err.message || 'No pudimos completar la operación.';
    showToast(msg, 'error');
    if (btn) btn.disabled = false;
  }
}

async function removeUser(user) {
  const ok = window.confirm(
    `¿Eliminar definitivamente a "${user.displayName || user.email || 'este usuario'}"?\n\n` +
    'Se borra su cuenta, su perfil y sus accesos demo. Esta acción no se puede deshacer.'
  );
  if (!ok) return;

  const btn = document.getElementById('user-delete');
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }

  try {
    await deleteUser(user.uid);
    users = users.filter(u => u.uid !== user.uid);
    selectedUid = null;
    selectedDemos = [];
    closeDetailSheet();
    applyFilter();
    renderList();
    setTopbarMeta(metaText());
    const detail = document.getElementById('users-detail');
    if (detail) detail.innerHTML = detailPlaceholder();
    showToast('Usuario eliminado', 'success');
  } catch (err) {
    console.error('UsersTab: delete user failed', err);
    showToast(`No pudimos eliminar el usuario: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Eliminar usuario'; }
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
