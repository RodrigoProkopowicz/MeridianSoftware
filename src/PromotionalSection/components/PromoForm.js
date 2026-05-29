/**
 * PromoForm.js
 *
 * Formulario de suscripción. Recoge los datos de contacto y los detalles de
 * la web, valida en el cliente y dispara el checkout de Mercado Pago.
 * El cobro recién ocurre en Mercado Pago: este formulario solo prepara la
 * suscripción y redirige al pago.
 */

import { escapeHtml, showToast } from '../../utils/DomHelper.js';
import { validateForm, normalizePhone, cleanText } from '../utils/validators.js';
import { startSubscription } from '../services/checkoutService.js';
import { onAuthStateChange, signOut } from '../../services/AuthenticationService.js';
import { openAuthModal } from '../../components/AuthModal.js';
import { PLAN } from '../config.js';

const BUSINESS_TYPES = [
  'Comercio / Local',
  'Gastronomía (bar, resto, panadería)',
  'Servicios profesionales',
  'Salud y bienestar',
  'Belleza y estética',
  'Oficios (plomería, electricidad, etc.)',
  'Educación / clases',
  'Inmobiliaria',
  'Otro',
];

const FIELDS = ['businessName', 'businessType', 'email', 'phone', 'description', 'consent'];

export function renderPromoForm() {
  return `
    <section class="promo-form-section" id="promo-form">
      <div class="promo-container promo-form-section__inner">
        <header class="promo-section-head">
          <h2 class="promo-section-title">Empecemos con tu web</h2>
          <p class="promo-section-subtitle">
            Contanos lo básico de tu negocio. Después confirmás el pago en
            Mercado Pago. No se cobra nada hasta ese momento.
          </p>
        </header>

        <div class="promo-form-body" id="promo-form-body">
          <div class="promo-gate"><span class="promo-gate__loading">Cargando…</span></div>
        </div>
      </div>
    </section>
  `;
}

let unsubscribeAuth = null;

export function initPromoForm() {
  // El formulario está detrás del login: reaccionamos al estado de sesión
  // (la cuenta es la misma que en el sitio principal) y mostramos el gate de
  // login o el formulario según corresponda.
  if (unsubscribeAuth) { unsubscribeAuth(); unsubscribeAuth = null; }
  unsubscribeAuth = onAuthStateChange((user) => renderFormBody(user));
}

/** Pinta el gate (sin sesión) o el formulario (con sesión) en el contenedor. */
function renderFormBody(user) {
  const body = document.getElementById('promo-form-body');
  if (!body) return;

  if (!user) {
    body.innerHTML = gateMarkup();
    document.getElementById('promo-login-btn')
      ?.addEventListener('click', () => openAuthModal('promo-form'));
    return;
  }

  body.innerHTML = formMarkup(user);
  document.getElementById('promo-subscribe-form')
    ?.addEventListener('submit', onSubmit);
  document.getElementById('promo-switch-account')
    ?.addEventListener('click', (e) => { e.preventDefault(); signOut(); });
}

function gateMarkup() {
  return `
    <div class="promo-gate">
      <svg class="promo-gate__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <h3 class="promo-gate__title">Iniciá sesión para pedir tu web</h3>
      <p class="promo-gate__text">
        Usás la misma cuenta del sitio de Meridian. Si ya iniciaste sesión ahí,
        seguís directo, sin volver a entrar. Es rápido y seguro.
      </p>
      <button class="promo-btn promo-btn--primary promo-btn--lg" id="promo-login-btn" type="button">
        Iniciar sesión para continuar
      </button>
    </div>
  `;
}

function formMarkup(user) {
  const email = user.email || '';
  const who = escapeHtml(user.displayName || user.email || 'tu cuenta');
  return `
    <div class="promo-form-who">
      <span class="promo-form-who__label">Estás como <strong>${who}</strong></span>
      <button type="button" class="promo-form-who__switch" id="promo-switch-account">Cambiar cuenta</button>
    </div>

    <form class="promo-form" id="promo-subscribe-form" novalidate>
      <div class="promo-form__grid">
        ${textField('businessName', 'Nombre de tu negocio o el tuyo', 'Ej: Panadería La Espiga', { required: true, maxlength: 200 })}
        ${selectField('businessType', 'Rubro', BUSINESS_TYPES, { required: true })}
        ${textField('email', 'Email', 'tunombre@email.com', { required: true, type: 'email', maxlength: 200, value: email })}
        ${textField('phone', 'WhatsApp / Teléfono', 'Ej: 11 1234-5678', { required: true, type: 'tel', maxlength: 30 })}
      </div>

      ${textareaField('description', '¿Qué necesitás en tu web?', 'Contanos qué hacés, qué productos o servicios ofrecés, qué te gustaría mostrar...', { required: true, maxlength: 2000, rows: 4 })}

      <div class="promo-form__grid">
        ${textField('references', 'Webs que te gustan (opcional)', 'Pegá uno o más links de referencia', { maxlength: 500 })}
        ${textField('stylePreferences', 'Colores o estilo (opcional)', 'Ej: tonos cálidos, moderno, elegante...', { maxlength: 300 })}
      </div>

      <label class="promo-check">
        <input type="checkbox" id="promo-f-wantsDomain" />
        <span>Me interesa tener un <strong>dominio propio</strong> (ej: tunegocio.com). Sé que es un pago aparte y opcional.</span>
      </label>

      <label class="promo-check promo-check--required">
        <input type="checkbox" id="promo-f-consent" />
        <span>Autorizo a Meridian Software a contactarme por WhatsApp y email para coordinar mi web.</span>
      </label>
      <p class="promo-field__error" id="promo-err-consent" hidden></p>

      <div class="promo-form__footer">
        <button type="submit" class="promo-btn promo-btn--primary promo-btn--lg promo-form__submit" id="promo-submit">
          <span class="promo-form__submit-label">Continuar al pago seguro · ${PLAN.priceLabel}/mes</span>
          <span class="promo-form__submit-spinner" hidden aria-hidden="true"></span>
        </button>
        <p class="promo-form__legal">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Pago protegido por Mercado Pago. Te redirigimos para confirmar la suscripción.
        </p>
      </div>
    </form>
  `;
}

function textField(name, label, placeholder, opts = {}) {
  const { required = false, type = 'text', maxlength = 200, value = '' } = opts;
  return `
    <label class="promo-field">
      <span class="promo-field__label">${label}${required ? ' <span class="promo-field__req">*</span>' : ''}</span>
      <input
        class="promo-input"
        id="promo-f-${name}"
        name="${name}"
        type="${type}"
        placeholder="${escapeHtml(placeholder)}"
        maxlength="${maxlength}"
        value="${escapeHtml(value)}"
        autocomplete="${autocompleteFor(name, type)}"
        ${required ? 'aria-required="true"' : ''}
      />
      <span class="promo-field__error" id="promo-err-${name}" hidden></span>
    </label>
  `;
}

function selectField(name, label, options, opts = {}) {
  const { required = false } = opts;
  return `
    <label class="promo-field">
      <span class="promo-field__label">${label}${required ? ' <span class="promo-field__req">*</span>' : ''}</span>
      <select class="promo-input promo-select" id="promo-f-${name}" name="${name}" ${required ? 'aria-required="true"' : ''}>
        <option value="" selected disabled>Elegí una opción…</option>
        ${options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
      </select>
      <span class="promo-field__error" id="promo-err-${name}" hidden></span>
    </label>
  `;
}

function textareaField(name, label, placeholder, opts = {}) {
  const { required = false, maxlength = 2000, rows = 4 } = opts;
  return `
    <label class="promo-field promo-field--full">
      <span class="promo-field__label">${label}${required ? ' <span class="promo-field__req">*</span>' : ''}</span>
      <textarea
        class="promo-input promo-textarea"
        id="promo-f-${name}"
        name="${name}"
        rows="${rows}"
        maxlength="${maxlength}"
        placeholder="${escapeHtml(placeholder)}"
        ${required ? 'aria-required="true"' : ''}
      ></textarea>
      <span class="promo-field__error" id="promo-err-${name}" hidden></span>
    </label>
  `;
}

function autocompleteFor(name, type) {
  if (type === 'email') return 'email';
  if (type === 'tel') return 'tel';
  if (name === 'businessName') return 'organization';
  return 'off';
}

function collectData() {
  const get = (id) => document.getElementById(`promo-f-${id}`);
  const phoneRaw = cleanText(get('phone')?.value, 30);
  return {
    businessName: cleanText(get('businessName')?.value, 200),
    businessType: cleanText(get('businessType')?.value, 100),
    email: cleanText(get('email')?.value, 200),
    phoneRaw,
    phone: normalizePhone(phoneRaw),
    description: cleanText(get('description')?.value, 2000),
    references: cleanText(get('references')?.value, 500),
    stylePreferences: cleanText(get('stylePreferences')?.value, 300),
    wantsDomain: !!get('wantsDomain')?.checked,
    consent: !!get('consent')?.checked,
  };
}

function clearErrors() {
  FIELDS.forEach(name => {
    const el = document.getElementById(`promo-err-${name}`);
    if (el) { el.textContent = ''; el.hidden = true; }
    const input = document.getElementById(`promo-f-${name}`);
    if (input) input.classList.remove('is-invalid');
  });
}

function showErrors(errors) {
  let firstInvalid = null;
  Object.entries(errors).forEach(([name, msg]) => {
    const el = document.getElementById(`promo-err-${name}`);
    if (el) { el.textContent = msg; el.hidden = false; }
    const input = document.getElementById(`promo-f-${name}`);
    if (input) {
      input.classList.add('is-invalid');
      if (!firstInvalid) firstInvalid = input;
    }
  });
  firstInvalid?.focus();
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setSubmitting(isSubmitting) {
  const btn = document.getElementById('promo-submit');
  if (!btn) return;
  btn.disabled = isSubmitting;
  btn.classList.toggle('is-loading', isSubmitting);
  const label = btn.querySelector('.promo-form__submit-label');
  const spinner = btn.querySelector('.promo-form__submit-spinner');
  if (label) label.textContent = isSubmitting ? 'Generando tu link de pago…' : `Continuar al pago seguro · ${PLAN.priceLabel}/mes`;
  if (spinner) spinner.hidden = !isSubmitting;
}

async function onSubmit(event) {
  event.preventDefault();
  clearErrors();

  const data = collectData();
  const errors = validateForm(data);
  if (Object.keys(errors).length > 0) {
    showErrors(errors);
    return;
  }

  setSubmitting(true);
  try {
    const { initPoint } = await startSubscription({
      businessName: data.businessName,
      businessType: data.businessType,
      email: data.email,
      phone: data.phone,
      phoneRaw: data.phoneRaw,
      description: data.description,
      references: data.references,
      stylePreferences: data.stylePreferences,
      wantsDomain: data.wantsDomain,
    });
    // Redirige al checkout de Mercado Pago.
    window.location.assign(initPoint);
  } catch (err) {
    console.error('PromoForm: subscription failed', err);
    showToast(err.message || 'No pudimos iniciar el pago. Probá de nuevo.', 'error', 6000);
    setSubmitting(false);
  }
}
