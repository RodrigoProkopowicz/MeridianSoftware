/**
 * PromotionalTab.js
 *
 * Gestión de las suscripciones del módulo /promo (PromotionalSection).
 * Vista master-detail: la lista muestra las suscripciones (más nuevas primero)
 * con filtro por estado de pago; el detalle muestra todos los datos del
 * formulario y permite editar el estado del trabajo, dejar notas internas y
 * cancelar la suscripción en Mercado Pago.
 */

import {
  listPromotionalSubscriptions,
  updatePromotionalSubscription,
  cancelPromotionalSubscription,
  updatePromotionalAmount,
  deletePromotionalSubscription,
} from '../services/AdminService.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';
import { formatTimestamp } from '../utils/Format.js';
import { renderTopbarActions, setTopbarMeta } from './AdminShell.js';

const PAYMENT_LABELS = {
  pending: 'Pendiente',
  authorized: 'Activa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  error: 'Error',
};

const WORK_STATUSES = [
  { value: 'no_iniciado', label: 'No iniciado' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'entregado', label: 'Entregado' },
];

const PAYMENT_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'authorized', label: 'Activas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'error', label: 'Con error' },
];

/** Límites del monto mensual. Deben coincidir con functions/promotional/config.js. */
const PRICE_MIN = 100;
const PRICE_MAX = 1000000;

let subscriptions = [];
let selectedId = null;
let paymentFilter = 'all';

export function renderPromotionalTab() {
  return `
    <div class="admin-split">
      <div class="admin-panel admin-panel--scroll" id="promo-list">
        <div class="admin-empty">Cargando…</div>
      </div>
      <div id="promo-detail">
        ${detailPlaceholder()}
      </div>
    </div>
  `;
}

export function initPromotionalTab() {
  renderTopbarActions((slot) => {
    slot.innerHTML = `
      <label class="admin-field admin-field--inline">
        <select class="admin-input" id="promo-filter">
          ${PAYMENT_FILTERS.map(f => `<option value="${f.value}"${f.value === paymentFilter ? ' selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label>
      <button class="admin-button" id="promo-refresh" type="button">Actualizar</button>
    `;
    slot.querySelector('#promo-refresh')?.addEventListener('click', loadSubscriptions);
    slot.querySelector('#promo-filter')?.addEventListener('change', (e) => {
      paymentFilter = e.target.value;
      renderList();
    });
  });
  loadSubscriptions();
}

export function destroyPromotionalTab() {
  subscriptions = [];
  selectedId = null;
  paymentFilter = 'all';
  setTopbarMeta('');
}

async function loadSubscriptions() {
  const list = document.getElementById('promo-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty">Cargando…</div>';
  try {
    subscriptions = await listPromotionalSubscriptions();
    renderList();
    if (selectedId && !subscriptions.find(s => s.id === selectedId)) {
      selectedId = null;
    }
    renderDetail();
  } catch (err) {
    console.error('PromotionalTab: load failed', err);
    list.innerHTML = `<div class="admin-empty admin-empty--error">No pudimos cargar las suscripciones: ${escapeHtml(err.message)}</div>`;
    setTopbarMeta('');
  }
}

function filteredSubscriptions() {
  if (paymentFilter === 'all') return subscriptions;
  return subscriptions.filter(s => (s.paymentStatus || 'pending') === paymentFilter);
}

function renderList() {
  const list = document.getElementById('promo-list');
  if (!list) return;

  const rows = filteredSubscriptions();
  setTopbarMeta(`${rows.length} ${rows.length === 1 ? 'suscripción' : 'suscripciones'}`);

  if (rows.length === 0) {
    list.innerHTML = '<div class="admin-empty">No hay suscripciones para este filtro.</div>';
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Negocio</th>
          <th>Contacto</th>
          <th>Pago</th>
          <th>Trabajo</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(rowHtml).join('')}
      </tbody>
    </table>
  `;

  list.querySelectorAll('[data-sub-id]').forEach(row => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.subId;
      list.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');
      renderDetail();
    });
  });
}

function rowHtml(sub) {
  const selected = selectedId === sub.id ? ' is-selected' : '';
  const payment = sub.paymentStatus || 'pending';
  const work = sub.workStatus || 'no_iniciado';
  return `
    <tr data-sub-id="${escapeHtml(sub.id)}" class="${selected}">
      <td>${escapeHtml(formatTimestamp(sub.createdAt))}</td>
      <td>${escapeHtml(sub.businessName || '—')}</td>
      <td>${escapeHtml(sub.email || sub.phoneRaw || '—')}</td>
      <td><span class="admin-pill admin-pill--${paymentPill(payment)}">${escapeHtml(PAYMENT_LABELS[payment] || payment)}</span></td>
      <td><span class="admin-pill admin-pill--${workPill(work)}">${escapeHtml(workLabel(work))}</span></td>
    </tr>
  `;
}

function detailPlaceholder() {
  return `
    <div class="admin-detail">
      <div class="admin-detail__placeholder">
        <svg class="admin-detail__placeholder-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5h12M9 12h12M9 19h12M4 5h.01M4 12h.01M4 19h.01"/>
        </svg>
        Seleccioná una suscripción para ver los datos del formulario
        y gestionar el trabajo.
      </div>
    </div>
  `;
}

function renderDetail() {
  const container = document.getElementById('promo-detail');
  if (!container) return;

  const sub = subscriptions.find(s => s.id === selectedId);
  if (!sub) {
    container.innerHTML = detailPlaceholder();
    return;
  }

  const payment = sub.paymentStatus || 'pending';
  const work = sub.workStatus || 'no_iniciado';
  const waLink = sub.phone ? `https://wa.me/${escapeHtml(sub.phone)}` : null;
  const mailLink = sub.email ? `mailto:${escapeHtml(sub.email)}` : null;
  const canCancel = payment === 'authorized' || payment === 'pending' || payment === 'paused';
  // El precio sólo se puede cambiar si hay una suscripción viva en MP.
  const canEditPrice = !!sub.preapprovalId && canCancel;
  // Solo se pueden borrar registros con error o cancelados (limpieza de logs).
  const canDelete = payment === 'error' || payment === 'cancelled';
  const amount = Number(sub.amount ?? 6499);

  container.innerHTML = `
    <div class="admin-detail">
      <div class="admin-detail__head">
        <span class="admin-pill admin-pill--${paymentPill(payment)}">${escapeHtml(PAYMENT_LABELS[payment] || payment)}</span>
        <span class="admin-detail__date">${escapeHtml(formatTimestamp(sub.createdAt))}</span>
      </div>

      <h2 class="admin-detail__name">${escapeHtml(sub.businessName || '—')}</h2>

      <div class="admin-detail__actions admin-detail__actions--contact">
        ${waLink ? `<a class="admin-button admin-button--primary" href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${mailLink ? `<a class="admin-button" href="${mailLink}">Email</a>` : ''}
      </div>

      <dl class="admin-detail__list">
        <dt>Rubro</dt><dd>${escapeHtml(sub.businessType || '—')}</dd>
        <dt>Email</dt><dd>${escapeHtml(sub.email || '—')}</dd>
        ${sub.userEmail ? `<dt>Cuenta</dt><dd>${escapeHtml(sub.userEmail)}</dd>` : ''}
        <dt>Teléfono</dt><dd>${escapeHtml(sub.phoneRaw || sub.phone || '—')}</dd>
        <dt>Dominio propio</dt><dd>${sub.wantsDomain ? 'Sí, le interesa' : 'No'}</dd>
        <dt>Qué necesita</dt>
        <dd class="admin-detail__message">${escapeHtml(sub.description || '—')}</dd>
        ${sub.references ? `<dt>Referencias</dt><dd class="admin-detail__message">${escapeHtml(sub.references)}</dd>` : ''}
        ${sub.stylePreferences ? `<dt>Estilo / colores</dt><dd>${escapeHtml(sub.stylePreferences)}</dd>` : ''}
        <dt>Cuota</dt><dd>$${escapeHtml(String(sub.amount ?? 6499))} ${escapeHtml(sub.currency || 'ARS')} / mes</dd>
        ${sub.lastPaymentAt ? `<dt>Último pago</dt><dd>${escapeHtml(formatTimestamp(sub.lastPaymentAt))}</dd>` : ''}
        ${sub.preapprovalId ? `<dt>ID Mercado Pago</dt><dd><code>${escapeHtml(sub.preapprovalId)}</code></dd>` : ''}
        ${typeof sub.recaptchaScore === 'number' ? `<dt>reCAPTCHA</dt><dd>${sub.recaptchaScore.toFixed(2)}</dd>` : ''}
      </dl>

      ${canEditPrice ? `
      <div class="admin-detail__edit admin-detail__price">
        <label class="admin-field">
          <span class="admin-field__label">Cuota mensual (ARS)</span>
          <input class="admin-input" id="promo-amount" type="number" inputmode="numeric"
                 min="${PRICE_MIN}" max="${PRICE_MAX}" step="1" value="${escapeHtml(String(amount))}" />
        </label>
        <label class="admin-field">
          <span class="admin-field__label">Motivo del ajuste (opcional)</span>
          <input class="admin-input" id="promo-amount-note" type="text" maxlength="300"
                 placeholder="Ej: tráfico alto en mayo" />
        </label>
        <div class="admin-detail__actions">
          <button class="admin-button admin-button--primary" id="promo-amount-save" type="button">Actualizar precio</button>
        </div>
        ${priceHistoryHtml(sub)}
      </div>` : ''}

      <div class="admin-detail__edit">
        <label class="admin-field">
          <span class="admin-field__label">Estado del trabajo</span>
          <select class="admin-input" id="promo-work-status">
            ${WORK_STATUSES.map(s => `<option value="${s.value}"${s.value === work ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
        <label class="admin-field">
          <span class="admin-field__label">Notas internas</span>
          <textarea class="admin-input" id="promo-notes" rows="3" maxlength="2000" placeholder="Notas visibles solo para admins">${escapeHtml(sub.adminNotes || '')}</textarea>
        </label>
        <div class="admin-detail__actions">
          <button class="admin-button admin-button--primary" id="promo-save" type="button">Guardar cambios</button>
          ${canCancel ? `<button class="admin-button admin-button--danger" id="promo-cancel" type="button">Cancelar suscripción</button>` : ''}
          ${canDelete ? `<button class="admin-button admin-button--danger" id="promo-delete" type="button">Eliminar registro</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.getElementById('promo-save')?.addEventListener('click', () => saveSubscription(sub));
  document.getElementById('promo-cancel')?.addEventListener('click', () => cancelSubscription(sub));
  document.getElementById('promo-amount-save')?.addEventListener('click', () => updateAmount(sub));
  document.getElementById('promo-delete')?.addEventListener('click', () => deleteSubscription(sub));
}

async function saveSubscription(sub) {
  const workStatus = document.getElementById('promo-work-status')?.value;
  const adminNotes = document.getElementById('promo-notes')?.value?.trim();
  const btn = document.getElementById('promo-save');
  if (btn) btn.disabled = true;

  try {
    await updatePromotionalSubscription(sub.id, { workStatus, adminNotes });
    Object.assign(sub, { workStatus, adminNotes });
    renderList();
    showToast('Suscripción actualizada', 'success');
  } catch (err) {
    console.error('PromotionalTab: save failed', err);
    showToast(`No pudimos guardar: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteSubscription(sub) {
  const ok = window.confirm(
    `¿Eliminar definitivamente el registro de "${sub.businessName || 'este cliente'}"?\n\nSolo se borra del panel (es un registro con error o cancelado). Esta acción no se puede deshacer.`
  );
  if (!ok) return;

  const btn = document.getElementById('promo-delete');
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }

  try {
    await deletePromotionalSubscription(sub.id);
    subscriptions = subscriptions.filter(s => s.id !== sub.id);
    if (selectedId === sub.id) selectedId = null;
    renderList();
    renderDetail();
    showToast('Registro eliminado', 'success');
  } catch (err) {
    console.error('PromotionalTab: delete failed', err);
    showToast(`No pudimos eliminar: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Eliminar registro'; }
  }
}

async function cancelSubscription(sub) {
  const ok = window.confirm(
    `¿Cancelar la suscripción de "${sub.businessName || 'este cliente'}"?\n\nSe cancela el cobro automático en Mercado Pago. Esta acción no se puede deshacer.`
  );
  if (!ok) return;

  const btn = document.getElementById('promo-cancel');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelando…'; }

  try {
    await cancelPromotionalSubscription(sub.id);
    sub.paymentStatus = 'cancelled';
    renderList();
    renderDetail();
    showToast('Suscripción cancelada en Mercado Pago', 'success');
  } catch (err) {
    console.error('PromotionalTab: cancel failed', err);
    showToast(`No pudimos cancelar: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Cancelar suscripción'; }
  }
}

async function updateAmount(sub) {
  const input = document.getElementById('promo-amount');
  const noteInput = document.getElementById('promo-amount-note');
  const amount = Number(input?.value);
  const note = noteInput?.value?.trim() || '';
  const current = Number(sub.amount ?? 6499);

  if (!Number.isInteger(amount) || amount < PRICE_MIN || amount > PRICE_MAX) {
    showToast(`El monto debe ser un número entero entre $${PRICE_MIN} y $${PRICE_MAX}.`, 'error');
    return;
  }
  if (amount === current) {
    showToast(`La cuota ya es $${current}: no hay cambios.`, 'success');
    return;
  }

  const ok = window.confirm(
    `¿Cambiar la cuota de "${sub.businessName || 'este cliente'}" de $${current} a $${amount} ARS/mes?\n\n` +
    'Se actualiza el cobro automático en Mercado Pago a partir del próximo período.'
  );
  if (!ok) return;

  const btn = document.getElementById('promo-amount-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }

  try {
    await updatePromotionalAmount(sub.id, amount, note);
    showToast('Precio actualizado en Mercado Pago', 'success');
    // Recargamos para traer el monto y el historial autoritativos del server.
    await loadSubscriptions();
  } catch (err) {
    console.error('PromotionalTab: amount update failed', err);
    showToast(`No pudimos actualizar el precio: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Actualizar precio'; }
  }
}

// ---- Mapeo de estados a clases de pill existentes (admin.css) ----
function paymentPill(status) {
  return {
    pending: 'pending',
    authorized: 'active',
    paused: 'off',
    cancelled: 'rejected',
    error: 'spam',
  }[status] || 'plain';
}

function workPill(status) {
  return {
    no_iniciado: 'off',
    en_progreso: 'new',
    entregado: 'active',
  }[status] || 'plain';
}

function workLabel(status) {
  return WORK_STATUSES.find(s => s.value === status)?.label || status;
}

/** Historial de ajustes de precio (últimos 5, más reciente primero). */
function priceHistoryHtml(sub) {
  const hist = Array.isArray(sub.priceHistory) ? sub.priceHistory : [];
  if (hist.length === 0) return '';
  const rows = hist.slice(-5).reverse().map((h) => {
    const when = h.at ? escapeHtml(formatTimestamp(h.at)) : '';
    const prev = h.previousAmount != null ? `$${escapeHtml(String(h.previousAmount))}` : '—';
    const note = h.note ? ` · ${escapeHtml(h.note)}` : '';
    return `<li>${prev} → $${escapeHtml(String(h.amount))}${when ? ` · ${when}` : ''}${note}</li>`;
  }).join('');
  return `
    <div class="promo-price-history">
      <span class="admin-field__label">Historial de ajustes</span>
      <ul class="promo-price-history__list">${rows}</ul>
    </div>
  `;
}
