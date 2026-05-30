/**
 * UserProfileBadge.js
 *
 * Renders the authenticated user's account zone in the navbar — directly,
 * without a dropdown. The identity (avatar + name) is display-only and is
 * never clickable; the account actions (Mis Productos, Panel, Cerrar sesión)
 * sit beside it on desktop and inside the hamburger menu on mobile.
 *
 * One auth subscription drives BOTH surfaces so desktop and mobile never drift:
 *   - desktop slot:  #nav-account   (in the navbar actions area)
 *   - mobile slot:   #nav-mobile-account  (inside the hamburger menu)
 */

import { onAuthStateChange, signOut } from '../services/AuthenticationService.js';
import { closeMobileMenu } from './NavigationBar.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { showToast, escapeHtml } from '../utils/DomHelper.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import firebaseApp from '../config/FirebaseConfig.js';

const listMyProductsCallable = httpsCallable(getFunctions(firebaseApp), 'listMyProducts');

/**
 * Renders the desktop account slot with a skeleton loader. Actual content is
 * populated by initUserProfileBadge once auth resolves.
 * @returns {string}
 */
export function renderUserProfileBadge() {
  return `
    <div class="nav-account" id="nav-account">
      <div class="nav-account__skeleton" aria-hidden="true"></div>
    </div>
  `;
}

/**
 * Subscribes to auth changes and (re)renders both the desktop and mobile
 * account surfaces on every change.
 * @param {Function} openAuthModal
 */
export function initUserProfileBadge(openAuthModal) {
  const desktop = document.getElementById('nav-account');
  const mobile = document.getElementById('nav-mobile-account');
  if (!desktop) return;

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
      desktop.innerHTML = desktopLoggedIn(user, { isAdmin });
      if (mobile) mobile.innerHTML = mobileLoggedIn(user, { isAdmin });
      wireHandlers(openAuthModal);
      // "Mis Productos" is revealed only once we know the user has products.
      maybeShowProductsLink();
    } else {
      desktop.innerHTML = desktopLoggedOut();
      if (mobile) mobile.innerHTML = mobileLoggedOut();
      wireHandlers(openAuthModal);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Identity (display-only — never interactive)                        */
/* ------------------------------------------------------------------ */

/**
 * @param {import('firebase/auth').User} user
 * @param {string} [modifier] extra avatar class (e.g. size variant)
 */
function avatarHtml(user, modifier = '') {
  const initial = escapeHtml((user.displayName || user.email || 'U')[0].toUpperCase());
  if (user.photoURL) {
    // alt="" — the name is shown as adjacent text, so the avatar is decorative.
    // referrerpolicy avoids Google/Apple CDNs 403-ing the photo request.
    return `<img class="nav-account__avatar ${modifier}" src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer" />`;
  }
  return `<div class="nav-account__avatar nav-account__avatar--initial ${modifier}">${initial}</div>`;
}

/* ------------------------------------------------------------------ */
/* Desktop surface                                                    */
/* ------------------------------------------------------------------ */

function desktopLoggedIn(user, { isAdmin }) {
  const fullName = user.displayName || user.email || 'Usuario';
  const firstName = escapeHtml(fullName.split(' ')[0]);

  return `
    <div class="nav-account__identity" title="${escapeHtml(fullName)}">
      ${avatarHtml(user)}
      <span class="nav-account__name">${firstName}</span>
    </div>
    <span class="nav-account__sep" aria-hidden="true"></span>
    <div class="nav-account__links">
      <a class="nav-account__link" id="nav-products-desktop" href="/cuenta" hidden>Mis Productos</a>
      ${isAdmin ? `<a class="nav-account__link nav-account__link--admin" href="/admin">Panel</a>` : ''}
      <button type="button" class="nav-account__link nav-account__link--signout js-signout">Cerrar sesión</button>
    </div>
  `;
}

function desktopLoggedOut() {
  return `<button type="button" class="button-secondary nav-account__signin js-signin">Iniciar sesión</button>`;
}

/* ------------------------------------------------------------------ */
/* Mobile surface (inside the hamburger menu)                         */
/* ------------------------------------------------------------------ */

function mobileLoggedIn(user, { isAdmin }) {
  const fullName = escapeHtml(user.displayName || user.email || 'Usuario');

  return `
    <div class="nav-menu-account__profile">
      ${avatarHtml(user, 'nav-account__avatar--lg')}
      <span class="nav-menu-account__name">${fullName}</span>
    </div>
    <a class="nav-menu-account__item" id="nav-products-mobile" href="/cuenta" hidden>Mis Productos</a>
    ${isAdmin ? `<a class="nav-menu-account__item nav-menu-account__item--admin" href="/admin">Panel de administración</a>` : ''}
    <button type="button" class="nav-menu-account__item nav-menu-account__item--signout js-signout">Cerrar sesión</button>
  `;
}

function mobileLoggedOut() {
  return `<button type="button" class="button-secondary nav-menu-account__signin js-signin">Iniciar sesión</button>`;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                           */
/* ------------------------------------------------------------------ */

/**
 * (Re)binds the sign-in / sign-out controls. Safe to call on every render:
 * innerHTML was just replaced, so the elements are fresh and listeners don't
 * accumulate.
 * @param {Function} openAuthModal
 */
function wireHandlers(openAuthModal) {
  document.querySelectorAll('.js-signout').forEach(btn => {
    btn.addEventListener('click', handleSignOut);
  });
  document.querySelectorAll('.js-signin').forEach(btn => {
    btn.addEventListener('click', () => {
      closeMobileMenu();
      openAuthModal('navbar');
    });
  });
}

async function handleSignOut() {
  try {
    await signOut();
    closeMobileMenu();
    trackEvent(AnalyticsEvent.LOGOUT);
    showToast('Sesión cerrada', 'success');
  } catch (error) {
    console.error('UserProfileBadge: Sign out failed', error);
    showToast('No pudimos cerrar la sesión', 'error');
  }
}

/**
 * Reveals "Mis Productos" (desktop + mobile) if the user has at least one
 * product. If the call fails we reveal it anyway — never block access.
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
    document.getElementById('nav-products-desktop')?.removeAttribute('hidden');
    document.getElementById('nav-products-mobile')?.removeAttribute('hidden');
  }
}
