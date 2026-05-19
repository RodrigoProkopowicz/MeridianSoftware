/**
 * AuthModal.js
 *
 * Full-screen auth modal with Google and Apple sign-in buttons.
 * Glassmorphism overlay with entrance animation.
 */

import { signInWithGoogle, signInWithApple } from '../services/AuthenticationService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { executeRecaptcha } from '../services/RecaptchaService.js';
import { RecaptchaAction } from '../services/RecaptchaActions.js';
import { showToast, lockBodyScroll, unlockBodyScroll } from '../utils/DomHelper.js';

const GOOGLE_ICON_SVG = `
  <svg class="auth-button__icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>`;

const APPLE_ICON_SVG = `
  <svg class="auth-button__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>`;

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
        <h2 class="auth-modal__title" id="auth-modal-title">Bienvenido</h2>
        <p class="auth-modal__subtitle">Iniciá sesión para acceder a demos y funciones personalizadas</p>

        <div class="auth-modal__buttons">
          <button class="auth-button auth-button--google" id="auth-google-button" type="button">
            ${GOOGLE_ICON_SVG}
            <span class="auth-button__label">Continuar con Google</span>
          </button>

          <button class="auth-button auth-button--apple" id="auth-apple-button" type="button">
            ${APPLE_ICON_SVG}
            <span class="auth-button__label">Continuar con Apple</span>
          </button>
        </div>

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
  // Focus the close button so keyboard users have a sensible first focus.
  const closeBtn = document.getElementById('auth-modal-close');
  if (closeBtn) closeBtn.focus();
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
 * Toggles loading state on an auth button without destroying its icon/label.
 * @param {HTMLButtonElement} button
 * @param {boolean} loading
 */
function setAuthButtonLoading(button, loading) {
  if (!button) return;
  button.classList.toggle('loading', loading);
  button.disabled = loading;
  button.setAttribute('aria-busy', loading ? 'true' : 'false');
}

/**
 * Wraps a sign-in flow with consistent loading/error handling.
 * @param {HTMLButtonElement} button
 * @param {() => Promise<unknown>} signInFn
 * @param {string} label - Human-readable provider name for error toasts
 */
async function runSignIn(button, signInFn, method) {
  setAuthButtonLoading(button, true);
  try {
    // Fire the reCAPTCHA challenge in parallel with the popup — the token is
    // captured for future server-side validation but does not block auth today.
    const recaptchaPromise = executeRecaptcha(RecaptchaAction.LOGIN);
    await signInFn();
    const recaptchaToken = await recaptchaPromise;
    trackEvent(AnalyticsEvent.LOGIN, { method, recaptcha: recaptchaToken ? 'ok' : 'missing' });
    closeAuthModal();
    showToast('¡Sesión iniciada!', 'success');
  } catch (error) {
    console.error(`AuthModal: ${method} sign-in failed`, error);
    if (error && error.code !== 'auth/popup-closed-by-user') {
      showToast('No pudimos iniciar sesión. Probá de nuevo.', 'error');
    }
  } finally {
    setAuthButtonLoading(button, false);
  }
}

/**
 * Initializes auth modal event listeners.
 */
export function initAuthModal() {
  const modal = document.getElementById('auth-modal');
  const closeBtn = document.getElementById('auth-modal-close');
  const backdrop = document.getElementById('auth-modal-backdrop');
  const googleBtn = document.getElementById('auth-google-button');
  const appleBtn = document.getElementById('auth-apple-button');

  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
  if (backdrop) backdrop.addEventListener('click', closeAuthModal);

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

  if (googleBtn) {
    googleBtn.addEventListener('click', () => runSignIn(googleBtn, signInWithGoogle, 'google'));
  }
  if (appleBtn) {
    appleBtn.addEventListener('click', () => runSignIn(appleBtn, signInWithApple, 'apple'));
  }
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
