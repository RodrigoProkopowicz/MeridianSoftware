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
} from '../../services/AuthenticationService.js';
import { verifyAdmin } from '../services/AdminService.js';
import { renderAdminShell, initAdminShell, destroyAdminShell } from './AdminShell.js';
import { escapeHtml, showToast } from '../../utils/DomHelper.js';

export function renderAdminGate() {
  return `<div class="admin-gate" id="admin-gate"></div>`;
}

let lastState = null;

export function initAdminGate() {
  onAuthStateChange(async (user) => {
    const root = document.getElementById('admin-gate');
    if (!root) return;

    if (!user) {
      renderSignedOut(root);
      lastState = 'signed-out';
      destroyAdminShell();
      return;
    }

    // Loading state while we check the claim.
    if (lastState !== 'admin') {
      renderLoading(root);
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
      <h1 class="admin-card__title">Meridian Admin</h1>
      <p class="admin-card__subtitle">Sign in with an admin-enabled account.</p>
      <div class="admin-card__buttons">
        <button class="admin-button admin-button--google" id="admin-google-button" type="button">
          Continue with Google
        </button>
        <button class="admin-button admin-button--apple" id="admin-apple-button" type="button">
          Continue with Apple
        </button>
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
  button.textContent = 'Signing in…';
  try {
    await signInFn();
  } catch (err) {
    console.error('AdminGate: sign-in failed', err);
    if (err && err.code !== 'auth/popup-closed-by-user') {
      showToast('Sign-in failed. Try again.', 'error');
    }
    button.disabled = false;
    button.textContent = original;
  }
}

function renderLoading(root) {
  root.innerHTML = `
    <div class="admin-card admin-card--center">
      <div class="admin-spinner"></div>
      <p class="admin-card__subtitle">Verifying access…</p>
    </div>
  `;
}

function renderForbidden(root, user) {
  const email = escapeHtml(user.email || 'this account');
  root.innerHTML = `
    <div class="admin-card admin-card--center">
      <h1 class="admin-card__title">Access denied</h1>
      <p class="admin-card__subtitle">
        ${email} doesn't have admin privileges. Ask an existing admin to grant
        access from the panel, or run the bootstrap script.
      </p>
      <div class="admin-card__buttons">
        <button class="admin-button" id="admin-signout-forbidden" type="button">Sign out</button>
        <a class="admin-button admin-button--ghost" href="/">Back to site</a>
      </div>
    </div>
  `;
  const out = document.getElementById('admin-signout-forbidden');
  if (out) out.addEventListener('click', () => signOut());
}

function renderError(root, err) {
  root.innerHTML = `
    <div class="admin-card admin-card--center">
      <h1 class="admin-card__title">Something went wrong</h1>
      <p class="admin-card__subtitle">${escapeHtml(err.message || 'Unknown error')}</p>
      <div class="admin-card__buttons">
        <button class="admin-button" id="admin-signout-error" type="button">Sign out</button>
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
