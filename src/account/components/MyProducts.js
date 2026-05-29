/**
 * MyProducts.js
 *
 * Dashboard "Mis Productos": agrega los sitios web (suscripciones /promo) y las
 * demos del usuario, muestra estado/fechas/plan y permite dar de baja las
 * suscripciones pagas (con confirmación + advertencias).
 */

import {
  escapeHtml,
  showToast,
  lockBodyScroll,
  unlockBodyScroll,
} from '../../utils/DomHelper.js';
import { listMyProducts, cancelMySubscription } from '../services/AccountService.js';
import { formatDate, formatMoney, daysUntil } from '../utils/format.js';

const PAYMENT_LABEL = {
  pending: 'Pendiente de pago',
  authorized: 'Activa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  error: 'Con error',
};
const PAYMENT_PILL = {
  pending: 'pending',
  authorized: 'active',
  paused: 'paused',
  cancelled: 'cancelled',
  error: 'error',
};
const WORK_LABEL = {
  no_iniciado: 'Por iniciar',
  en_progreso: 'En desarrollo',
  entregado: 'Entregada',
};

const ICON_WEB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>`;
const ICON_APP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>`;

let data = null;

/** Shell del dashboard (la carga de datos es async en init). */
export function renderMyProducts() {
  return `
    <div class="container account-container">
      <div class="account-intro">
        <span class="section-label">Mi cuenta</span>
        <h1 class="account-title">Mis Productos</h1>
        <p class="account-subtitle">Acá ves y gestionás todo lo que tenés con Meridian, desde un solo lugar.</p>
      </div>
      <div id="account-products">
        <div class="account-loading"><span class="spinner"></span> Cargando tus productos…</div>
      </div>
    </div>
  `;
}

export function initMyProducts() {
  loadProducts();
}

async function loadProducts() {
  const container = document.getElementById('account-products');
  if (!container) return;
  try {
    data = await listMyProducts();
    renderProducts();
  } catch (err) {
    console.error('MyProducts: load failed', err);
    container.innerHTML = `<div class="account-empty account-empty--error">No pudimos cargar tus productos: ${escapeHtml(err.message || 'error')}</div>`;
  }
}

function renderProducts() {
  const container = document.getElementById('account-products');
  if (!container || !data) return;

  const websites = data.websites || [];
  const demos = data.demos || [];

  if (websites.length === 0 && demos.length === 0) {
    container.innerHTML = emptyState();
    return;
  }

  container.innerHTML = `
    <div class="account-grid">
      ${websites.map(websiteCard).join('')}
      ${demos.map(demoCard).join('')}
    </div>
  `;

  container.querySelectorAll('[data-cancel-id]').forEach((btn) => {
    btn.addEventListener('click', () => openCancelModal(btn.dataset.cancelId));
  });
}

function websiteCard(w) {
  const payLabel = PAYMENT_LABEL[w.paymentStatus] || w.paymentStatus;
  const payPill = PAYMENT_PILL[w.paymentStatus] || 'pending';
  const workLabel = WORK_LABEL[w.workStatus] || w.workStatus;
  const price = formatMoney(w.amount);
  return `
    <article class="glass-card account-card">
      <div class="account-card__head">
        <span class="account-card__icon account-card__icon--web">${ICON_WEB}</span>
        <div class="account-card__heading">
          <h3 class="account-card__title">${escapeHtml(w.businessName || 'Tu sitio web')}</h3>
          <span class="account-card__type">Sitio web</span>
        </div>
        <span class="account-pill account-pill--${payPill}">${escapeHtml(payLabel)}</span>
      </div>
      <dl class="account-card__list">
        ${w.businessType ? `<dt>Rubro</dt><dd>${escapeHtml(w.businessType)}</dd>` : ''}
        <dt>Desarrollo</dt><dd>${escapeHtml(workLabel)}</dd>
        ${price ? `<dt>Plan</dt><dd>${price} / mes</dd>` : ''}
        ${w.createdAt ? `<dt>Inicio</dt><dd>${escapeHtml(formatDate(w.createdAt))}</dd>` : ''}
        ${w.lastPaymentAt ? `<dt>Último pago</dt><dd>${escapeHtml(formatDate(w.lastPaymentAt))}</dd>` : ''}
        <dt>Dominio propio</dt><dd>${w.wantsDomain ? 'Sí' : 'No'}</dd>
      </dl>
      <div class="account-card__actions">
        ${w.canCancel
          ? `<button class="button-secondary account-card__danger" data-cancel-id="${escapeHtml(w.id)}" type="button">Dar de baja</button>`
          : `<span class="account-card__note">${w.paymentStatus === 'cancelled' ? 'Suscripción dada de baja.' : ''}</span>`}
      </div>
    </article>
  `;
}

function demoCard(d) {
  const active = d.status === 'active';
  const remaining = active ? daysUntil(d.expiresAt) : null;
  return `
    <article class="glass-card account-card">
      <div class="account-card__head">
        <span class="account-card__icon account-card__icon--app">${ICON_APP}</span>
        <div class="account-card__heading">
          <h3 class="account-card__title">${escapeHtml(d.label)}</h3>
          <span class="account-card__type">Prueba gratuita</span>
        </div>
        <span class="account-pill account-pill--${active ? 'active' : 'expired'}">${active ? 'Activa' : 'Vencida'}</span>
      </div>
      <dl class="account-card__list">
        <dt>Plan</dt><dd>Prueba gratuita (7 días)</dd>
        ${d.grantedAt ? `<dt>Inicio</dt><dd>${escapeHtml(formatDate(d.grantedAt))}</dd>` : ''}
        ${d.expiresAt ? `<dt>Vence</dt><dd>${escapeHtml(formatDate(d.expiresAt))}${remaining !== null ? ` · ${remaining} día${remaining === 1 ? '' : 's'}` : ''}</dd>` : ''}
      </dl>
      <div class="account-card__actions">
        ${active
          ? `<a class="button-primary account-card__open" href="${escapeHtml(d.url)}">Abrir ${escapeHtml(d.label)}</a>`
          : `<span class="account-card__note">La prueba venció.</span>`}
      </div>
    </article>
  `;
}

function emptyState() {
  return `
    <div class="account-empty">
      <p class="account-empty__title">Todavía no tenés productos contratados.</p>
      <p class="account-empty__text">Cuando contrates una web o actives una prueba, vas a verla acá.</p>
      <a class="button-primary" href="/promo">Conocé nuestra promo de webs</a>
    </div>
  `;
}

/* ---- Modal de baja ---- */
function openCancelModal(subscriptionId) {
  const w = (data?.websites || []).find((x) => x.id === subscriptionId);
  if (!w) return;

  const overlay = document.createElement('div');
  overlay.className = 'account-modal open';
  overlay.innerHTML = `
    <div class="account-modal__backdrop" data-close></div>
    <div class="account-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title">
      <h2 class="account-modal__title" id="cancel-modal-title">¿Dar de baja tu suscripción?</h2>
      <p class="account-modal__text">
        Estás por cancelar <strong>${escapeHtml(w.businessName || 'tu sitio web')}</strong>. Tené en cuenta que:
      </p>
      <ul class="account-modal__warnings">
        <li>Se da de baja el cobro mensual en Mercado Pago.</li>
        <li>Tu web deja de mantenerse y actualizarse.</li>
        <li>Esta acción no se puede deshacer.</li>
      </ul>
      <div class="account-modal__actions">
        <button class="button-secondary" data-close type="button">Volver</button>
        <button class="button-primary account-modal__confirm" id="cancel-confirm" type="button">Sí, dar de baja</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  lockBodyScroll();

  const close = () => { overlay.remove(); unlockBodyScroll(); };
  overlay.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));

  overlay.querySelector('#cancel-confirm')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#cancel-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Dando de baja…'; }
    try {
      await cancelMySubscription(subscriptionId);
      w.paymentStatus = 'cancelled';
      w.canCancel = false;
      close();
      renderProducts();
      showToast('Suscripción dada de baja', 'success');
    } catch (err) {
      console.error('MyProducts: cancel failed', err);
      showToast(`No pudimos dar de baja: ${err.message || 'error'}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Sí, dar de baja'; }
    }
  });
}

/** Estado sin sesión: invita a iniciar sesión (mismo modal del sitio). */
export function renderGate() {
  return `
    <div class="container account-container">
      <div class="account-gate">
        <svg class="account-gate__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <h1 class="account-gate__title">Iniciá sesión para ver tus productos</h1>
        <p class="account-gate__text">Usás la misma cuenta del sitio de Meridian. Si ya iniciaste sesión ahí, seguís directo.</p>
        <button class="button-primary" id="account-login-btn" type="button">Iniciar sesión</button>
      </div>
    </div>
  `;
}
