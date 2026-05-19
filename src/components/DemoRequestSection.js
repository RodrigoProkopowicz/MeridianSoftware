/**
 * DemoRequestSection.js
 * 
 * Auth-gated demo request form. Shows sign-in prompt if user is
 * not authenticated, otherwise shows the demo request form.
 */

import { getCurrentUser, onAuthStateChange } from '../services/AuthenticationService.js';
import { submitDemoRequest } from '../services/ContactFormService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { executeRecaptcha } from '../services/RecaptchaService.js';
import { RecaptchaAction } from '../services/RecaptchaActions.js';
import { validateForm, isNotEmpty } from '../utils/ValidationHelper.js';
import { showToast } from '../utils/DomHelper.js';

/**
 * Renders the demo request section HTML.
 * @returns {string}
 */
export function renderDemoRequestSection() {
  return `
    <section class="demo-section section" id="demo">
      <div class="container">
        <div class="section-header">
          <span class="section-label">Probalo en vivo</span>
          <h2 class="section-title">Agendá una demo personalizada</h2>
          <p class="section-subtitle">
            Para proyectos a medida, coordiná una llamada con el equipo.
            Para Stock Manager o Medicus, activá la demo de 7 días desde
            la sección de Productos.
          </p>
        </div>

        <div class="demo-section__content">
          <!-- Auth required prompt -->
          <div class="demo-section__auth-prompt glass-card" id="demo-auth-prompt">
            <div class="demo-section__auth-prompt-icon">🔐</div>
            <h3 class="demo-section__auth-prompt-title">Iniciá sesión para continuar</h3>
            <p class="demo-section__auth-prompt-text">
              Creá una cuenta o iniciá sesión para solicitar una demo
              personalizada. Solo te lleva un momento.
            </p>
            <button class="button-primary" id="demo-sign-in-button">
              Iniciar sesión para solicitar demo
            </button>
          </div>

          <!-- Demo form (shown when authenticated) -->
          <div class="demo-section__form glass-card" id="demo-form-container" style="display: none;">
            <form id="demo-request-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="demo-solution-select">Tipo de solución</label>
                <select class="input-field" id="demo-solution-select" name="solutionType">
                  <option value="">Seleccioná una solución...</option>
                  <option value="stock-manager">Stock Manager (producto)</option>
                  <option value="medicus">Medicus (producto)</option>
                  <option value="mobile-apps">Aplicaciones móviles</option>
                  <option value="web-platforms">Plataformas web</option>
                  <option value="cloud-devops">Cloud y DevOps</option>
                  <option value="custom-software">Software a medida</option>
                </select>
                <span class="input-error-message">Seleccioná una solución</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-company-input">Nombre de la empresa</label>
                <input type="text" class="input-field" id="demo-company-input"
                       name="companyName" placeholder="Nombre de tu empresa" maxlength="200" autocomplete="organization" />
                <span class="input-error-message">El nombre de la empresa es obligatorio</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-date-input">Fecha preferida</label>
                <input type="date" class="input-field" id="demo-date-input"
                       name="preferredDate" />
                <span class="input-error-message">Seleccioná una fecha</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-message-input">Detalles adicionales</label>
                <textarea class="input-field" id="demo-message-input"
                          name="message" placeholder="Contanos sobre tu proyecto..." rows="3" maxlength="5000"></textarea>
              </div>

              <button type="submit" class="button-primary demo-section__form-submit" id="demo-submit-button">
                Enviar solicitud
              </button>
            </form>

            <div class="demo-section__form-success" id="demo-form-success">
              <div class="demo-section__form-success-icon">🎉</div>
              <h3 class="demo-section__form-success-title">¡Solicitud enviada!</h3>
              <p class="demo-section__form-success-text">
                Nos vamos a contactar pronto para coordinar la demo. Revisá tu email para la confirmación.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Initializes demo section event listeners and auth gating.
 * @param {Function} openAuthModal
 */
export function initDemoRequestSection(openAuthModal) {
  const authPrompt = document.getElementById('demo-auth-prompt');
  const formContainer = document.getElementById('demo-form-container');
  const signInBtn = document.getElementById('demo-sign-in-button');
  const form = document.getElementById('demo-request-form');

  // Toggle visibility based on auth state
  onAuthStateChange(user => {
    if (user) {
      if (authPrompt) authPrompt.style.display = 'none';
      if (formContainer) formContainer.style.display = 'block';
    } else {
      if (authPrompt) authPrompt.style.display = 'block';
      if (formContainer) formContainer.style.display = 'none';
    }
  });

  if (signInBtn) {
    signInBtn.addEventListener('click', () => openAuthModal('demo_section'));
  }

  if (form) {
    form.addEventListener('submit', handleDemoSubmit);
  }

  // Set min date to today
  const dateInput = document.getElementById('demo-date-input');
  if (dateInput) {
    dateInput.min = new Date().toISOString().split('T')[0];
  }
}

/**
 * Handles demo form submission.
 * @param {Event} event
 */
async function handleDemoSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = document.getElementById('demo-submit-button');
  const solutionSelect = document.getElementById('demo-solution-select');
  const companyInput = document.getElementById('demo-company-input');
  const dateInput = document.getElementById('demo-date-input');
  const messageInput = document.getElementById('demo-message-input');

  const isValid = validateForm([
    { element: solutionSelect, validator: isNotEmpty, message: 'Seleccioná una solución' },
    { element: companyInput, validator: isNotEmpty, message: 'El nombre de la empresa es obligatorio' },
  ]);

  if (!isValid) return;

  const user = getCurrentUser();
  if (!user) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner"></div> Enviando...';

  try {
    const recaptchaToken = await executeRecaptcha(RecaptchaAction.DEMO_REQUEST);
    await submitDemoRequest({
      userId: user.uid,
      solutionType: solutionSelect.value,
      companyName: companyInput.value.trim(),
      preferredDate: dateInput.value,
      message: messageInput.value.trim(),
      recaptchaToken,
    });

    trackEvent(AnalyticsEvent.GENERATE_LEAD, {
      form: 'demo',
      solution_type: solutionSelect.value,
    });
    form.style.display = 'none';
    document.getElementById('demo-form-success').classList.add('visible');
    showToast('Solicitud enviada con éxito.', 'success');
  } catch (error) {
    console.error('DemoRequestSection: Submission failed', error);
    showToast('No pudimos enviar la solicitud. Probá de nuevo.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar solicitud';
  }
}
