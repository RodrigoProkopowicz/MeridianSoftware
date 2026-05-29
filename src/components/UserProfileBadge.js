/**
 * UserProfileBadge.js
 * 
 * Displays the authenticated user's avatar and name in the navbar.
 * Shows a dropdown with sign-out option.
 * Shows a "Sign In" button when not authenticated.
 */

import { onAuthStateChange, signOut, getCurrentUser } from '../services/AuthenticationService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { showToast, escapeHtml } from '../utils/DomHelper.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import firebaseApp from '../config/FirebaseConfig.js';

const listMyProductsCallable = httpsCallable(getFunctions(firebaseApp), 'listMyProducts');

/**
 * Renders the user profile badge placeholder HTML with a skeleton loader.
 * Actual content is populated by initUserProfileBadge once auth resolves.
 * @returns {string}
 */
export function renderUserProfileBadge() {
  return `
    <div class="user-profile-badge" id="user-profile-badge">
      <div class="user-profile-badge__skeleton" aria-hidden="true"></div>
    </div>
  `;
}

/**
 * Initializes the user profile badge and subscribes to auth changes.
 * @param {Function} openAuthModal
 */
export function initUserProfileBadge(openAuthModal) {
  const badge = document.getElementById('user-profile-badge');
  if (!badge) return;

  onAuthStateChange(async user => {
    if (user) {
      let isAdmin = false;
      try {
        const tokenResult = await user.getIdTokenResult();
        isAdmin = tokenResult.claims.admin === true;
      } catch (err) {
        // Token fetch failures shouldn't break the badge — fall back to non-admin.
        console.warn('UserProfileBadge: failed to read admin claim', err);
      }
      renderLoggedInState(badge, user, { isAdmin });
    } else {
      renderLoggedOutState(badge, openAuthModal);
    }
  });
}

/**
 * Renders the logged-in badge with avatar and dropdown.
 * @param {HTMLElement} container
 * @param {import('firebase/auth').User} user
 * @param {{ isAdmin?: boolean }} [opts]
 */
function renderLoggedInState(container, user, opts = {}) {
  const { isAdmin = false } = opts;
  const initial = escapeHtml((user.displayName || user.email || 'U')[0].toUpperCase());
  const avatarSrc = user.photoURL ? escapeHtml(user.photoURL) : '';
  const displayNameRaw = user.displayName || user.email || 'User';
  const displayName = escapeHtml(displayNameRaw);
  const firstName = escapeHtml(displayNameRaw.split(' ')[0]);
  const email = escapeHtml(user.email || '');

  container.innerHTML = `
    ${avatarSrc
      ? `<img class="user-profile-badge__avatar" src="${avatarSrc}" alt="${displayName}" />`
      : `<div class="user-profile-badge__avatar user-profile-badge__avatar--initial">${initial}</div>`
    }
    ${isAdmin ? `<span class="user-profile-badge__admin-pill">Admin</span>` : ''}
    <span class="user-profile-badge__name hide-mobile">${firstName}</span>
    <div class="user-profile-badge__dropdown" id="profile-dropdown">
      <div class="user-profile-badge__dropdown-header">
        <div class="user-profile-badge__dropdown-name">${displayName}</div>
        <div class="user-profile-badge__dropdown-email">${email}</div>
      </div>
      <a class="user-profile-badge__dropdown-item" id="profile-products-link" href="/cuenta" hidden>Mis Productos</a>
      ${isAdmin
        ? `<a class="user-profile-badge__dropdown-item user-profile-badge__dropdown-item--admin" href="/admin">Panel admin</a>`
        : ''}
      <button class="user-profile-badge__dropdown-item" id="sign-out-button">Cerrar sesión</button>
    </div>
  `;

  // Toggle dropdown
  container.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.remove('open');
  });

  // Sign out
  const signOutBtn = document.getElementById('sign-out-button');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await signOut();
        trackEvent(AnalyticsEvent.LOGOUT);
        showToast('Sesión cerrada', 'success');
      } catch (error) {
        console.error('UserProfileBadge: Sign out failed', error);
        showToast('No pudimos cerrar la sesión', 'error');
      }
    });
  }

  // Mostrar "Mis Productos" en el dropdown solo si el usuario tiene productos.
  maybeShowProductsLink();
}

/**
 * Revela el link "Mis Productos" del dropdown si el usuario tiene al menos un
 * producto. Si la llamada falla, lo mostramos igual (no bloqueamos el acceso).
 */
async function maybeShowProductsLink() {
  let show = true;
  try {
    const { data } = await listMyProductsCallable();
    const count = (data?.websites?.length || 0) + (data?.demos?.length || 0);
    show = count > 0;
  } catch (err) {
    console.warn('UserProfileBadge: listMyProducts failed', err);
  }
  if (show) {
    document.getElementById('profile-products-link')?.removeAttribute('hidden');
  }
}

/**
 * Renders the logged-out state with a sign-in button.
 * @param {HTMLElement} container
 * @param {Function} openAuthModal
 */
function renderLoggedOutState(container, openAuthModal) {
  container.innerHTML = `
    <button class="button-secondary" id="navbar-sign-in-button" style="padding: 0.5rem 1.2rem; font-size: var(--font-size-xs);">
      Iniciar sesión
    </button>
  `;

  const btn = document.getElementById('navbar-sign-in-button');
  if (btn) btn.addEventListener('click', () => openAuthModal('navbar'));
}
