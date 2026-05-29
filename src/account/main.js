/**
 * Account — entry point de la página "Mis Productos" (/cuenta).
 *
 * Página privada, separada del sitio principal (entrada propia del MPA). Usa la
 * misma sesión de Firebase y los mismos tokens de diseño. Sin sesión muestra un
 * gate de login (mismo modal del sitio); con sesión muestra el dashboard.
 */

import '../styles/variables.css';
import '../styles/reset.css';
import '../styles/global.css';
import '../styles/auth.css';
import './styles/account.css';

import { initializeAuthListener, onAuthStateChange } from '../services/AuthenticationService.js';
import { renderAuthModal, initAuthModal, openAuthModal } from '../components/AuthModal.js';
import { renderAccountHeader, initAccountHeader } from './components/AccountHeader.js';
import { renderMyProducts, initMyProducts, renderGate } from './components/MyProducts.js';

function boot() {
  const root = document.getElementById('account-app');
  if (!root) {
    console.error('account/main.js: #account-app no encontrado');
    return;
  }

  root.innerHTML = `
    <div id="account-header-slot"></div>
    <main class="account-main" id="account-main"></main>
    ${renderAuthModal()}
  `;

  initializeAuthListener();
  initAuthModal();

  // Reaccionamos al estado de sesión: header + contenido.
  onAuthStateChange((user) => {
    const headerSlot = document.getElementById('account-header-slot');
    if (headerSlot) {
      headerSlot.innerHTML = renderAccountHeader(user);
      initAccountHeader();
    }

    const main = document.getElementById('account-main');
    if (!main) return;

    if (!user) {
      main.innerHTML = renderGate();
      document.getElementById('account-login-btn')
        ?.addEventListener('click', () => openAuthModal('account'));
      return;
    }

    main.innerHTML = renderMyProducts();
    initMyProducts();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
