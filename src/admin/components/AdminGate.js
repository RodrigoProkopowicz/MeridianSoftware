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
  const buttonsHtml = showButtons
    ? `
      <div class="admin-auth__actions">
        <button class="admin-button admin-button--google" id="admin-google-button" type="button">
          Continuar con Google
        </button>
        <button class="admin-button admin-button--apple" id="admin-apple-button" type="button">
          Continuar con Apple
        </button>
      </div>
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
        ${buttonsHtml}
      </div>
    `,
  });

  if (showButtons) {
    const googleBtn = document.getElementById('admin-google-button');
    const appleBtn = document.getElementById('admin-apple-button');
    if (googleBtn) googleBtn.addEventListener('click', () => runSignIn(googleBtn, signInWithGoogle));
    if (appleBtn) appleBtn.addEventListener('click', () => runSignIn(appleBtn, signInWithApple));
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

/** Exposed for shell to trigger a re-render after granting/revoking admin on self. */
export function refreshGate() {
  const user = getCurrentUser();
  if (user) {
    user.getIdToken(true).then(() => {
      const root = document.getElementById('admin-gate');
      if (root) {
        verifyAdmin(user)
          .then(() => renderAdmin(root, user))
          .catch(() => renderForbidden(root, user));
      }
    });
  }
}
