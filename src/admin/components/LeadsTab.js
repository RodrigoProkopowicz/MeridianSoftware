/**
 * LeadsTab.js
 *
 * Unified table of contactSubmissions + demoRequests, newest first.
 * Selecting a row reveals a detail card with full text + status/notes editor.
 */

import { listLeads, updateLead } from '../services/AdminService.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';
import { formatTimestamp } from '../utils/Format.js';

const CONTACT_STATUSES = ['new', 'contacted', 'closed', 'spam'];
const DEMO_STATUSES = ['pending', 'scheduled', 'done', 'rejected'];

let leads = [];
let selectedId = null;

export function renderLeadsTab() {
  return `
    <div class="admin-tab admin-tab--leads">
      <div class="admin-tab__header">
        <h2 class="admin-tab__title">Leads</h2>
        <button class="admin-button admin-button--sm" id="leads-refresh">Refresh</button>
      </div>
      <div class="admin-tab__body" id="leads-body">
        <div class="admin-empty">Loading…</div>
      </div>
    </div>
  `;
}

export function initLeadsTab() {
  document.getElementById('leads-refresh')?.addEventListener('click', loadLeads);
  loadLeads();
}

export function destroyLeadsTab() {
  leads = [];
  selectedId = null;
}

async function loadLeads() {
  const body = document.getElementById('leads-body');
  if (!body) return;
  body.innerHTML = '<div class="admin-empty">Loading…</div>';
  try {
    leads = await listLeads();
    renderBody();
  } catch (err) {
    console.error('LeadsTab: load failed', err);
    body.innerHTML = `<div class="admin-empty admin-empty--error">Failed to load leads: ${escapeHtml(err.message)}</div>`;
  }
}

function renderBody() {
  const body = document.getElementById('leads-body');
  if (!body) return;

  if (leads.length === 0) {
    body.innerHTML = '<div class="admin-empty">No leads yet.</div>';
    return;
  }

  body.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Date</th>
            <th>Name / Company</th>
            <th>Contact</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>
    <div class="admin-detail" id="lead-detail"></div>
  `;

  body.querySelectorAll('[data-lead-id]').forEach(row => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.leadId;
      row.parentElement.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');
      renderDetail();
    });
  });

  if (selectedId) renderDetail();
}

function rowHtml(lead) {
  const type = lead._type === 'contact' ? 'Contact' : 'Demo';
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
      <td><span class="admin-pill admin-pill--${lead._type}">${type}</span></td>
      <td>${escapeHtml(date)}</td>
      <td>${name}</td>
      <td>${contact}</td>
      <td><span class="admin-pill admin-pill--status admin-pill--${status}">${status}</span></td>
    </tr>
  `;
}

function renderDetail() {
  const detail = document.getElementById('lead-detail');
  if (!detail) return;

  const lead = leads.find(l => l.id === selectedId);
  if (!lead) {
    detail.innerHTML = '';
    return;
  }

  const statuses = lead._type === 'contact' ? CONTACT_STATUSES : DEMO_STATUSES;
  const isContact = lead._type === 'contact';

  detail.innerHTML = `
    <div class="admin-detail__card">
      <div class="admin-detail__head">
        <span class="admin-pill admin-pill--${lead._type}">${isContact ? 'Contact' : 'Demo'}</span>
        <span class="admin-detail__date">${escapeHtml(formatTimestamp(lead.createdAt))}</span>
      </div>

      <dl class="admin-detail__list">
        ${isContact ? `
          <dt>Name</dt><dd>${escapeHtml(lead.name || '—')}</dd>
          <dt>Email</dt><dd>${escapeHtml(lead.email || '—')}</dd>
          <dt>Company</dt><dd>${escapeHtml(lead.company || '—')}</dd>
          <dt>Message</dt><dd class="admin-detail__message">${escapeHtml(lead.message || '')}</dd>
        ` : `
          <dt>Company</dt><dd>${escapeHtml(lead.companyName || '—')}</dd>
          <dt>Solution</dt><dd>${escapeHtml(lead.solutionType || '—')}</dd>
          <dt>Preferred date</dt><dd>${escapeHtml(lead.preferredDate || '—')}</dd>
          <dt>User ID</dt><dd><code>${escapeHtml(lead.userId || '—')}</code></dd>
          <dt>Message</dt><dd class="admin-detail__message">${escapeHtml(lead.message || '')}</dd>
        `}
        ${typeof lead.recaptchaScore === 'number'
          ? `<dt>reCAPTCHA</dt><dd>${lead.recaptchaScore.toFixed(2)}</dd>`
          : ''}
      </dl>

      <div class="admin-detail__edit">
        <label class="admin-field">
          <span class="admin-field__label">Status</span>
          <select class="admin-input" id="lead-status">
            ${statuses.map(s => `<option value="${s}"${s === lead.status ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label class="admin-field">
          <span class="admin-field__label">Notes (admin only)</span>
          <textarea class="admin-input" id="lead-notes" rows="3" maxlength="2000">${escapeHtml(lead.adminNotes || '')}</textarea>
        </label>
        <div class="admin-detail__actions">
          <button class="admin-button admin-button--primary" id="lead-save">Save changes</button>
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
    renderBody();
    showToast('Lead updated', 'success');
  } catch (err) {
    console.error('LeadsTab: save failed', err);
    showToast(`Save failed: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}
