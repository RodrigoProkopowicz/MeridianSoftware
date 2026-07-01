/**
 * AdminGate.js
 *
 * Three-state gate that controls what the admin entry shows:
 *   1. Not signed in    → split-screen sign-in (Google / Apple)
 *   2. Signed in, no admin claim → access-denied
 *   3. Signed in, admin → mounts the AdminShell
 *
 * On sign-in the gate forces a fresh ID token so a just-granted claim is
 * detected without requiring the user to log out first.
 */

import {
  onAuthStateChange,
  signInWithEmailPassword,
  sendPasswordReset,
  signOut,
  isAuthResolved,
} from '../../services/AuthenticationService.js';
import { verifyAdmin } from '../services/AdminService.js';
import { renderAdminShell, initAdminShell, destroyAdminShell } from './AdminShell.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';

export function renderAdminGate() {
  return `<div id="admin-gate"></div>`;
}

let lastState = null;

export function initAdminGate() {
  const root = document.getElementById('admin-gate');
  if (!root) return;

  // Render the auth split synchronously with a loading status so the user
  // never sees the sign-in buttons while Firebase Auth is still restoring
  // the persisted session.
  renderAuth(root, {
    status: { kind: 'loading', label: 'Restaurando sesión…' },
    showButtons: false,
  });
  lastState = 'loading';

  onAuthStateChange(async (user) => {
    if (!user) {
      if (!isAuthResolved()) return;
      renderAuth(root, { showButtons: true });
      lastState = 'signed-out';
      destroyAdminShell();
      return;
    }

    if (lastState !== 'admin') {
      renderAuth(root, {
        status: { kind: 'loading', label: 'Verificando acceso…' },
        showButtons: false,
      });
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
        renderAuthError(root, err);
        lastState = 'error';
      }
    }
  });
}

function authShell({ rightHtml }) {
  return `
    <div class="admin-auth">
      <aside class="admin-auth__brand">
        <a class="admin-auth__brand-head" href="/" aria-label="Volver al sitio">
          <img src="/icon-192.png" alt="" class="admin-auth__brand-mark" />
          <span class="admin-auth__brand-name">Meridian</span>
        </a>
        <div class="admin-auth__brand-body">
          <span class="admin-auth__brand-eyebrow">Panel interno</span>
          <h1 class="admin-auth__brand-title">Operá Meridian desde un solo lugar.</h1>
          <p class="admin-auth__brand-copy">
            Gestioná leads, accesos demo y permisos del equipo. Accesso restringido
            a cuentas con rol de administrador.
          </p>
        </div>
        <div class="admin-auth__brand-foot">
          ¿No sos del equipo? <a href="/">Volver a meridian-software</a>
        </div>
      </aside>
      <section class="admin-auth__panel">
        ${rightHtml}
      </section>
    </div>
  `;
}

function renderAuth(root, opts = {}) {
  const { showButtons = true, status = null } = opts;
  const statusHtml = status ? statusLine(status) : '';
  const formHtml = showButtons
    ? `
      <form class="admin-auth__actions" id="admin-signin-form" novalidate>
        <label class="admin-field">
          <span class="admin-field__label">Email</span>
          <input class="admin-input" id="admin-email" type="email" name="email"
                 placeholder="tu@email.com" autocomplete="email" required />
        </label>
        <label class="admin-field">
          <span class="admin-field__label">Contraseña</span>
          <input class="admin-input" id="admin-password" type="password" name="password"
                 placeholder="Tu contraseña" autocomplete="current-password" required />
        </label>
        <button class="admin-button admin-button--primary" id="admin-signin-button" type="submit">
          Iniciar sesión
        </button>
        <button class="admin-auth__link" id="admin-forgot-button" type="button">
          ¿Olvidaste tu contraseña?
        </button>
      </form>
      <a class="admin-auth__back" href="/">Volver al sitio</a>
    `
    : '';
  const subtitle = showButtons
    ? 'Iniciá sesión con una cuenta autorizada para entrar al panel.'
    : 'Esperá un momento mientras verificamos tu acceso.';

  root.innerHTML = authShell({
    rightHtml: `
      <div class="admin-auth__form">
        <div>
          <h2 class="admin-auth__title">Acceso al panel</h2>
          <p class="admin-auth__subtitle">${subtitle}</p>
        </div>
        ${statusHtml}
        ${formHtml}
      </div>
    `,
  });

  if (showButtons) {
    const form = document.getElementById('admin-signin-form');
    const forgotBtn = document.getElementById('admin-forgot-button');
    if (form) form.addEventListener('submit', handleSignIn);
    if (forgotBtn) forgotBtn.addEventListener('click', handleForgot);
  }
}

function statusLine({ kind, label }) {
  const className = kind === 'warn'
    ? 'admin-auth__status admin-auth__status--warn'
    : kind === 'error'
      ? 'admin-auth__status admin-auth__status--error'
      : 'admin-auth__status';
  const left = kind === 'loading'
    ? '<span class="admin-spinner"></span>'
    : '<span class="admin-auth__status-dot" aria-hidden="true"></span>';
  return `<div class="${className}">${left}<span>${escapeHtml(label)}</span></div>`;
}

function signInErrorMessage(err) {
  switch (err && err.code) {
    case 'auth/invalid-email':
      return 'El email no es válido.';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.';
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

async function handleSignIn(event) {
  event.preventDefault();
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const button = document.getElementById('admin-signin-button');
  const email = (emailInput?.value || '').trim();
  const password = passwordInput?.value || '';
  if (!email || !password) {
    showToast('Completá email y contraseña.', 'error');
    return;
  }
  if (button) { button.disabled = true; button.textContent = 'Iniciando sesión…'; }
  try {
    await signInWithEmailPassword(email, password);
  } catch (err) {
    console.error('AdminGate: sign-in failed', err);
    showToast(signInErrorMessage(err), 'error');
    if (button) { button.disabled = false; button.textContent = 'Iniciar sesión'; }
  }
}

async function handleForgot() {
  const emailInput = document.getElementById('admin-email');
  let email = (emailInput?.value || '').trim();
  if (!email) {
    email = (window.prompt('Ingresá tu email para restablecer la contraseña:') || '').trim();
  }
  if (!email) return;
  try {
    await sendPasswordReset(email);
    showToast('Te enviamos un email para restablecer la contraseña.', 'success', 5000);
  } catch (err) {
    console.error('AdminGate: password reset failed', err);
    showToast('Si el email está registrado, vas a recibir un enlace.', 'success', 5000);
  }
}

function renderForbidden(root, user) {
  const email = escapeHtml(user.email || 'esta cuenta');
  root.innerHTML = authShell({
    rightHtml: `
      <div class="admin-auth__form">
        <div>
          <h2 class="admin-auth__title">Acceso denegado</h2>
          <p class="admin-auth__subtitle">
            ${email} no tiene permisos de administrador. Pedile a un admin
            existente que te habilite desde el panel.
          </p>
        </div>
        <div class="admin-auth__status admin-auth__status--warn">
          <span class="admin-auth__status-dot" aria-hidden="true"></span>
          <span>Sin rol de admin</span>
        </div>
        <div class="admin-auth__actions">
          <button class="admin-button admin-button--md" id="admin-signout-forbidden" type="button">
            Cerrar sesión
          </button>
        </div>
        <a class="admin-auth__back" href="/">Volver al sitio</a>
      </div>
    `,
  });
  const out = document.getElementById('admin-signout-forbidden');
  if (out) out.addEventListener('click', () => signOut());
}

function renderAuthError(root, err) {
  root.innerHTML = authShell({
    rightHtml: `
      <div class="admin-auth__form">
        <div>
          <h2 class="admin-auth__title">Algo salió mal</h2>
          <p class="admin-auth__subtitle">
            No pudimos verificar tus permisos. Probá cerrar sesión y volver a entrar.
          </p>
        </div>
        <div class="admin-auth__status admin-auth__status--error">
          <span class="admin-auth__status-dot" aria-hidden="true"></span>
          <span>${escapeHtml(err.message || 'Error desconocido')}</span>
        </div>
        <div class="admin-auth__actions">
          <button class="admin-button admin-button--md" id="admin-signout-error" type="button">
            Cerrar sesión
          </button>
        </div>
      </div>
    `,
  });
  const out = document.getElementById('admin-signout-error');
  if (out) out.addEventListener('click', () => signOut());
}

function renderAdmin(root, user) {
  root.innerHTML = renderAdminShell(user);
  initAdminShell();
}
