/**
 * Admin panel entry point.
 *
 * Mounts under #admin-app from admin.html. Reuses the landing's Firebase
 * config + AuthenticationService so we share a single auth session across
 * the marketing site and the admin.
 */

import '../styles/variables.css';
import '../styles/reset.css';
import './styles/admin.css';

import { initializeAuthListener } from '../services/AuthenticationService.js';
import { renderAdminGate, initAdminGate } from './components/AdminGate.js';

function boot() {
  const root = document.getElementById('admin-app');
  if (!root) {
    console.error('admin/main.js: #admin-app container not found');
    return;
  }

  root.innerHTML = renderAdminGate();
  initializeAuthListener();
  initAdminGate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
