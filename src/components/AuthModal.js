/**
 * AuthModal.js
 *
 * Full-screen sign-in modal (email + password). Accounts are created by an
 * admin from the panel — there is no self-service registration here, only
 * sign-in and password reset. Glassmorphism overlay with entrance animation.
 */

import { signInWithEmailPassword, sendPasswordReset } from '../services/AuthenticationService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { executeRecaptcha } from '../services/RecaptchaService.js';
import { RecaptchaAction } from '../services/RecaptchaActions.js';
import { isValidEmail } from '../utils/ValidationHelper.js';
import { showToast, lockBodyScroll, unlockBodyScroll } from '../utils/DomHelper.js';

/**
 * Renders the auth modal HTML.
 * @returns {string}
 */
export function renderAuthModal() {
  return `
    <div class="auth-modal" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" aria-hidden="true">
      <div class="auth-modal__backdrop" id="auth-modal-backdrop"></div>
      <div class="auth-modal__panel">
        <button class="auth-modal__close" id="auth-modal-close" aria-label="Cerrar">✕</button>

        <img src="/logo.png" alt="Meridian Software" class="auth-modal__logo" decoding="async" loading="lazy" />
        <h2 class="auth-modal__title" id="auth-modal-title">Ingresá a tu cuenta</h2>
        <p class="auth-modal__subtitle">Usá el email y la contraseña que te dimos. Las cuentas las crea el equipo de Meridian.</p>

        <form class="auth-form" id="auth-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="auth-email">Email</label>
            <input type="email" class="input-field" id="auth-email" name="email"
                   placeholder="tu@email.com" autocomplete="email" required />
            <span class="input-error-message">Ingresá un email válido</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="auth-password">Contraseña</label>
            <input type="password" class="input-field" id="auth-password" name="password"
                   placeholder="Tu contraseña" autocomplete="current-password" required />
            <span class="input-error-message">Ingresá tu contraseña</span>
          </div>

          <button type="submit" class="button-primary auth-form__submit" id="auth-submit">
            Iniciar sesión
          </button>

          <button type="button" class="auth-form__forgot" id="auth-forgot">
            ¿Olvidaste tu contraseña?
          </button>
        </form>

        <p class="auth-modal__terms">
          Al continuar, aceptás nuestros
          <a href="/terms" target="_blank" rel="noopener">Términos y Condiciones</a> y
          <a href="/privacy" target="_blank" rel="noopener">Política de Privacidad</a>.
        </p>
      </div>
    </div>
  `;
}

/** Focused element before modal opened — restored on close for accessibility. */
let triggerElement = null;

/**
 * Opens the auth modal.
 */
export function openAuthModal(source = 'unknown') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  if (modal.classList.contains('open')) return;
  triggerElement = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  lockBodyScroll();
  // Focus the email field so keyboard users can start typing right away.
  const emailInput = document.getElementById('auth-email');
  if (emailInput) emailInput.focus();
  trackEvent(AnalyticsEvent.AUTH_MODAL_OPENED, { source });
}

/**
 * Closes the auth modal and restores focus to the element that opened it.
 */
export function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  unlockBodyScroll();
  if (triggerElement && typeof triggerElement.focus === 'function') {
    triggerElement.focus();
  }
  triggerElement = null;
}

/**
 * Toggles loading state on the submit button.
 * @param {HTMLButtonElement} button
 * @param {boolean} loading
 */
function setSubmitLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.setAttribute('aria-busy', loading ? 'true' : 'false');
  button.innerHTML = loading ? '<span class="spinner"></span> Ingresando…' : 'Iniciar sesión';
}

/**
 * Maps a Firebase Auth error code to a friendly Spanish message.
 * @param {{code?: string}} error
 */
function authErrorMessage(error) {
  switch (error && error.code) {
    case 'auth/invalid-email':
      return 'El email no es válido.';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada. Escribinos para reactivarla.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Probá de nuevo en unos minutos.';
    default:
      return 'No pudimos iniciar sesión. Probá de nuevo.';
  }
}

/**
 * Handles the sign-in form submission.
 * @param {Event} event
 */
async function handleSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit');
  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!isValidEmail(email)) {
    showToast('Ingresá un email válido.', 'error');
    emailInput.focus();
    return;
  }
  if (!password) {
    showToast('Ingresá tu contraseña.', 'error');
    passwordInput.focus();
    return;
  }

  setSubmitLoading(submitBtn, true);
  try {
    // Fire the reCAPTCHA challenge in parallel — the token is captured for
    // future server-side validation but does not block auth today.
    const recaptchaPromise = executeRecaptcha(RecaptchaAction.LOGIN);
    await signInWithEmailPassword(email, password);
    const recaptchaToken = await recaptchaPromise;
    trackEvent(AnalyticsEvent.LOGIN, { method: 'password', recaptcha: recaptchaToken ? 'ok' : 'missing' });
    closeAuthModal();
    showToast('¡Sesión iniciada!', 'success');
  } catch (error) {
    console.error('AuthModal: sign-in failed', error);
    showToast(authErrorMessage(error), 'error');
  } finally {
    setSubmitLoading(submitBtn, false);
  }
}

/**
 * Sends a password-reset email to whatever is currently typed in the email
 * field (asking for it if empty).
 */
async function handleForgotPassword() {
  const emailInput = document.getElementById('auth-email');
  let email = (emailInput?.value || '').trim();
  if (!email) {
    email = (window.prompt('Ingresá tu email para restablecer la contraseña:') || '').trim();
  }
  if (!email) return;
  if (!isValidEmail(email)) {
    showToast('Ingresá un email válido.', 'error');
    return;
  }
  try {
    await sendPasswordReset(email);
    showToast('Te enviamos un email para restablecer la contraseña.', 'success', 5000);
  } catch (error) {
    console.error('AuthModal: password reset failed', error);
    // Do not reveal whether the account exists — always confirm.
    showToast('Si el email está registrado, vas a recibir un enlace.', 'success', 5000);
  }
}

/**
 * Initializes auth modal event listeners.
 */
export function initAuthModal() {
  const modal = document.getElementById('auth-modal');
  const closeBtn = document.getElementById('auth-modal-close');
  const backdrop = document.getElementById('auth-modal-backdrop');
  const form = document.getElementById('auth-form');
  const forgotBtn = document.getElementById('auth-forgot');

  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
  if (backdrop) backdrop.addEventListener('click', closeAuthModal);
  if (form) form.addEventListener('submit', handleSubmit);
  if (forgotBtn) forgotBtn.addEventListener('click', handleForgotPassword);

  // Escape closes, Tab is trapped within the modal when open.
  document.addEventListener('keydown', (e) => {
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      closeAuthModal();
      return;
    }
    if (e.key === 'Tab') {
      trapFocus(e, modal);
    }
  });
}

/**
 * Keeps Tab / Shift+Tab focus inside the modal while it is open.
 * @param {KeyboardEvent} event
 * @param {HTMLElement} container
 */
function trapFocus(event, container) {
  const focusables = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
