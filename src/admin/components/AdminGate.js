/**
 * AdminGate.js
 *
 * Three-state gate that controls what the admin entry shows:
 *   1. Not signed in    → sign-in card with Google / Apple buttons
 *   2. Signed in, no admin claim → access-denied card
 *   3. Signed in, admin → mounts the AdminShell
 *
 * On sign-in the gate forces a fresh ID token so a just-granted claim is
 * detected without requiring the user to log out first.
 */

import {
  onAuthStateChange,
  signInWithGoogle,
  signInWithApple,
  signOut,
  getCurrentUser,
  isAuthResolved,
} from '../../services/AuthenticationService.js';
import { verifyAdmin } from '../services/AdminService.js';
import { renderAdminShell, initAdminShell, destroyAdminShell } from './AdminShell.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';

export function renderAdminGate() {
  return `<div class="admin-gate" id="admin-gate"></div>`;
}

let lastState = null;

export function initAdminGate() {
  const root = document.getElementById('admin-gate');
  if (!root) return;

  // Render a loading state synchronously so the user never sees the sign-in
  // card while Firebase Auth is still restoring the persisted session. The
  // sign-in card only appears after Firebase confirms there is no session.
  renderLoading(root, 'Restaurando sesión…');
  lastState = 'loading';

  onAuthStateChange(async (user) => {
    if (!user) {
      // If Firebase has not finished its first resolution yet, ignore the
      // intermediate null — wait for the real result.
      if (!isAuthResolved()) return;
      renderSignedOut(root);
      lastState = 'signed-out';
      destroyAdminShell();
      return;
    }

    if (lastState !== 'admin') {
      renderLoading(root, 'Verificando acceso…');
    }

    try {
      await verifyAdmin(user);
      renderAdmin(root, user);
      lastState = 'admin';
    } catch (err) {
      if (err.message === 'not-admin') {
        renderForbidden(root, user);
        lastState = 'forbidden';
      } else {
        console.error('AdminGate: claim check failed', err);
        renderError(root, err);
        lastState = 'error';
      }
    }
  });
}

function renderSignedOut(root) {
  root.innerHTML = `
    <div class="admin-card admin-card--center">
      <img src="/logo.png" alt="Meridian" class="admin-card__logo" />
      <h1 class="admin-card__title">Panel admin</h1>
      <p class="admin-card__subtitle">
        Iniciá sesión con una cuenta autorizada para entrar al panel.
      </p>
      <div class="admin-card__buttons">
        <button class="admin-button admin-button--google" id="admin-google-button" type="button">
          Continuar con Google
        </button>
        <button class="admin-button admin-button--apple" id="admin-apple-button" type="button">
          Continuar con Apple
        </button>
        <a class="admin-button admin-button--ghost" href="/">Volver al sitio</a>
      </div>
    </div>
  `;
  const googleBtn = document.getElementById('admin-google-button');
  const appleBtn = document.getElementById('admin-apple-button');
  if (googleBtn) googleBtn.addEventListener('click', () => runSignIn(googleBtn, signInWithGoogle));
  if (appleBtn) appleBtn.addEventListener('click', () => runSignIn(appleBtn, signInWithApple));
}

async function runSignIn(button, signInFn) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Iniciando sesión…';
  try {
    await signInFn();
  } catch (err) {
    console.error('AdminGate: sign-in failed', err);
    if (err && err.code !== 'auth/popup-closed-by-user') {
      showToast('No pudimos iniciar sesión. Probá de nuevo.', 'error');
    }
    button.disabled = false;
    button.textContent = original;
  }
}

function renderLoading(root, label = 'Cargando…') {
  root.innerHTML = `
    <div class="admin-card admin-card--center admin-card--loading">
      <img src="/logo.png" alt="" class="admin-card__logo admin-card__logo--pulse" />
      <div class="admin-spinner"></div>
      <p class="admin-card__subtitle">${escapeHtml(label)}</p>
    </div>
  `;
}

function renderForbidden(root, user) {
  const email = escapeHtml(user.email || 'esta cuenta');
  root.innerHTML = `
    <div class="admin-card admin-card--center">
      <div class="admin-card__icon admin-card__icon--warn" aria-hidden="true">⛔</div>
      <h1 class="admin-card__title">Acceso denegado</h1>
      <p class="admin-card__subtitle">
        ${email} no tiene permisos de administrador. Pedile a un admin
        existente que te habilite desde el panel.
      </p>
      <div class="admin-card__buttons">
        <button class="admin-button" id="admin-signout-forbidden" type="button">Cerrar sesión</button>
        <a class="admin-button admin-button--ghost" href="/">Volver al sitio</a>
      </div>
    </div>
  `;
  const out = document.getElementById('admin-signout-forbidden');
  if (out) out.addEventListener('click', () => signOut());
}

function renderError(root, err) {
  root.innerHTML = `
    <div class="admin-card admin-card--center">
      <div class="admin-card__icon admin-card__icon--error" aria-hidden="true">⚠️</div>
      <h1 class="admin-card__title">Algo salió mal</h1>
      <p class="admin-card__subtitle">${escapeHtml(err.message || 'Error desconocido')}</p>
      <div class="admin-card__buttons">
        <button class="admin-button" id="admin-signout-error" type="button">Cerrar sesión</button>
      </div>
    </div>
  `;
  const out = document.getElementById('admin-signout-error');
  if (out) out.addEventListener('click', () => signOut());
}

function renderAdmin(root, user) {
  root.innerHTML = renderAdminShell(user);
  initAdminShell();
}

/** Exposed for shell to trigger a re-render after granting/revoking admin on self. */
export function refreshGate() {
  const user = getCurrentUser();
  if (user) {
    user.getIdToken(true).then(() => {
      // onAuthStateChange isn't fired by token refresh, so we re-run manually.
      const root = document.getElementById('admin-gate');
      if (root) {
        verifyAdmin(user)
          .then(() => renderAdmin(root, user))
          .catch(() => renderForbidden(root, user));
      }
    });
  }
}
