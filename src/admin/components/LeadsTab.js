/**
 * LeadsTab.js
 *
 * Master-detail view of contactSubmissions + demoRequests (newest first).
 * Selecting a row opens the detail panel to edit status + admin notes.
 */

import { listLeads, updateLead } from '../services/AdminService.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';
import { formatTimestamp } from '../utils/Format.js';
import { renderTopbarActions, setTopbarMeta } from './AdminShell.js';

const CONTACT_STATUSES = ['new', 'contacted', 'closed', 'spam'];
const DEMO_STATUSES = ['pending', 'scheduled', 'done', 'rejected'];

let leads = [];
let selectedId = null;

export function renderLeadsTab() {
  return `
    <div class="admin-split">
      <div class="admin-panel admin-panel--scroll" id="leads-list">
        <div class="admin-empty">Cargando…</div>
      </div>
      <div id="leads-detail">
        ${detailPlaceholder()}
      </div>
    </div>
  `;
}

export function initLeadsTab() {
  renderTopbarActions((slot) => {
    slot.innerHTML = `
      <button class="admin-button" id="leads-refresh" type="button">Actualizar</button>
    `;
    slot.querySelector('#leads-refresh')?.addEventListener('click', loadLeads);
  });
  loadLeads();
}

export function destroyLeadsTab() {
  leads = [];
  selectedId = null;
  setTopbarMeta('');
}

async function loadLeads() {
  const list = document.getElementById('leads-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty">Cargando…</div>';
  try {
    leads = await listLeads();
    renderList();
    setTopbarMeta(`${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`);
    if (selectedId && !leads.find(l => l.id === selectedId)) {
      selectedId = null;
    }
    renderDetail();
  } catch (err) {
    console.error('LeadsTab: load failed', err);
    list.innerHTML = `<div class="admin-empty admin-empty--error">No pudimos cargar los leads: ${escapeHtml(err.message)}</div>`;
    setTopbarMeta('');
  }
}

function renderList() {
  const list = document.getElementById('leads-list');
  if (!list) return;

  if (leads.length === 0) {
    list.innerHTML = '<div class="admin-empty">Todavía no hay leads.</div>';
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Nombre / Empresa</th>
          <th>Contacto</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${leads.map(rowHtml).join('')}
      </tbody>
    </table>
  `;

  list.querySelectorAll('[data-lead-id]').forEach(row => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.leadId;
      list.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');
      renderDetail();
    });
  });
}

function rowHtml(lead) {
  const type = lead._type === 'contact' ? 'Contacto' : 'Demo';
  const date = formatTimestamp(lead.createdAt);
  const name = lead._type === 'contact'
    ? escapeHtml(lead.name || '—')
    : escapeHtml(lead.companyName || '—');
  const contact = lead._type === 'contact'
    ? escapeHtml(lead.email || '')
    : escapeHtml(lead.solutionType || '');
  const status = escapeHtml(lead.status || '—');
  const selected = selectedId === lead.id ? ' is-selected' : '';
  return `
    <tr data-lead-id="${escapeHtml(lead.id)}" class="${selected}">
      <td>${escapeHtml(date)}</td>
      <td><span class="admin-pill admin-pill--${lead._type}">${type}</span></td>
      <td>${name}</td>
      <td>${contact}</td>
      <td><span class="admin-pill admin-pill--${status}">${status}</span></td>
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
        Seleccioná un lead para ver los detalles
        y editar su estado.
      </div>
    </div>
  `;
}

function renderDetail() {
  const container = document.getElementById('leads-detail');
  if (!container) return;

  const lead = leads.find(l => l.id === selectedId);
  if (!lead) {
    container.innerHTML = detailPlaceholder();
    return;
  }

  const statuses = lead._type === 'contact' ? CONTACT_STATUSES : DEMO_STATUSES;
  const isContact = lead._type === 'contact';

  container.innerHTML = `
    <div class="admin-detail">
      <div class="admin-detail__head">
        <span class="admin-pill admin-pill--${lead._type}">${isContact ? 'Contacto' : 'Demo'}</span>
        <span class="admin-detail__date">${escapeHtml(formatTimestamp(lead.createdAt))}</span>
      </div>

      <dl class="admin-detail__list">
        ${isContact ? `
          <dt>Nombre</dt><dd>${escapeHtml(lead.name || '—')}</dd>
          <dt>Email</dt><dd>${escapeHtml(lead.email || '—')}</dd>
          <dt>Empresa</dt><dd>${escapeHtml(lead.company || '—')}</dd>
          <dt>Mensaje</dt>
          <dd class="admin-detail__message">${escapeHtml(lead.message || '')}</dd>
        ` : `
          <dt>Empresa</dt><dd>${escapeHtml(lead.companyName || '—')}</dd>
          <dt>Solución</dt><dd>${escapeHtml(lead.solutionType || '—')}</dd>
          <dt>Fecha sugerida</dt><dd>${escapeHtml(lead.preferredDate || '—')}</dd>
          <dt>UID</dt><dd><code>${escapeHtml(lead.userId || '—')}</code></dd>
          <dt>Mensaje</dt>
          <dd class="admin-detail__message">${escapeHtml(lead.message || '')}</dd>
        `}
        ${typeof lead.recaptchaScore === 'number'
          ? `<dt>reCAPTCHA</dt><dd>${lead.recaptchaScore.toFixed(2)}</dd>`
          : ''}
      </dl>

      <div class="admin-detail__edit">
        <label class="admin-field">
          <span class="admin-field__label">Estado</span>
          <select class="admin-input" id="lead-status">
            ${statuses.map(s => `<option value="${s}"${s === lead.status ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label class="admin-field">
          <span class="admin-field__label">Notas internas</span>
          <textarea class="admin-input" id="lead-notes" rows="3" maxlength="2000" placeholder="Notas visibles solo para admins">${escapeHtml(lead.adminNotes || '')}</textarea>
        </label>
        <div class="admin-detail__actions">
          <button class="admin-button admin-button--primary" id="lead-save">Guardar cambios</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('lead-save')?.addEventListener('click', () => saveLead(lead));
}

async function saveLead(lead) {
  const status = document.getElementById('lead-status')?.value;
  const adminNotes = document.getElementById('lead-notes')?.value?.trim();
  const btn = document.getElementById('lead-save');
  if (btn) btn.disabled = true;

  try {
    await updateLead(lead._type, lead.id, { status, adminNotes });
    Object.assign(lead, { status, adminNotes });
    renderList();
    showToast('Lead actualizado', 'success');
  } catch (err) {
    console.error('LeadsTab: save failed', err);
    showToast(`No pudimos guardar: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}
