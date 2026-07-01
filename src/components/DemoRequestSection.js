/**
 * DemoRequestSection.js
 *
 * Public "request a free trial" form. Anyone can fill it out — no sign-in
 * required, because accounts are provisioned by an admin. Each submission lands
 * in the `demoRequests` collection and shows up as a "pedido" in the admin
 * panel, where the team creates the account and grants the demo.
 */

import { submitDemoRequest } from '../services/ContactFormService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { executeRecaptcha } from '../services/RecaptchaService.js';
import { RecaptchaAction } from '../services/RecaptchaActions.js';
import { validateForm, isNotEmpty, isValidEmail } from '../utils/ValidationHelper.js';
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
          <span class="section-label">Probalo gratis</span>
          <h2 class="section-title">Solicitá tu prueba gratuita</h2>
          <p class="section-subtitle">
            Completá el formulario y nuestro equipo te crea la cuenta para que
            pruebes Stock Manager, Medicus o la solución que necesites. Sin tarjeta,
            sin compromiso.
          </p>
        </div>

        <div class="demo-section__content">
          <div class="demo-section__form glass-card" id="demo-form-container">
            <form id="demo-request-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="demo-name-input">Nombre y apellido</label>
                <input type="text" class="input-field" id="demo-name-input"
                       name="name" placeholder="Tu nombre" maxlength="120" autocomplete="name" />
                <span class="input-error-message">Ingresá tu nombre</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-email-input">Email</label>
                <input type="email" class="input-field" id="demo-email-input"
                       name="email" placeholder="tu@email.com" maxlength="200" autocomplete="email" />
                <span class="input-error-message">Ingresá un email válido</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-solution-select">¿Qué querés probar?</label>
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
                <label class="form-label" for="demo-company-input">Empresa <span class="form-label__hint">(opcional)</span></label>
                <input type="text" class="input-field" id="demo-company-input"
                       name="companyName" placeholder="Nombre de tu empresa" maxlength="200" autocomplete="organization" />
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-message-input">Detalles adicionales <span class="form-label__hint">(opcional)</span></label>
                <textarea class="input-field" id="demo-message-input"
                          name="message" placeholder="Contanos sobre tu proyecto..." rows="3" maxlength="5000"></textarea>
              </div>

              <button type="submit" class="button-primary demo-section__form-submit" id="demo-submit-button">
                Solicitar prueba gratuita
              </button>
            </form>

            <div class="demo-section__form-success" id="demo-form-success">
              <div class="demo-section__form-success-icon">🎉</div>
              <h3 class="demo-section__form-success-title">¡Pedido enviado!</h3>
              <p class="demo-section__form-success-text">
                Nos vamos a contactar por email para darte de alta y activar tu prueba.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Initializes demo section event listeners. The form is public — no auth gating.
 */
export function initDemoRequestSection() {
  const form = document.getElementById('demo-request-form');
  if (form) {
    form.addEventListener('submit', handleDemoSubmit);
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
  const nameInput = document.getElementById('demo-name-input');
  const emailInput = document.getElementById('demo-email-input');
  const solutionSelect = document.getElementById('demo-solution-select');
  const companyInput = document.getElementById('demo-company-input');
  const messageInput = document.getElementById('demo-message-input');

  const isValid = validateForm([
    { element: nameInput, validator: isNotEmpty, message: 'Ingresá tu nombre' },
    { element: emailInput, validator: isValidEmail, message: 'Ingresá un email válido' },
    { element: solutionSelect, validator: isNotEmpty, message: 'Seleccioná una solución' },
  ]);

  if (!isValid) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner"></div> Enviando...';

  try {
    const recaptchaToken = await executeRecaptcha(RecaptchaAction.DEMO_REQUEST);
    await submitDemoRequest({
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      solutionType: solutionSelect.value,
      companyName: companyInput.value.trim(),
      message: messageInput.value.trim(),
      recaptchaToken,
    });

    trackEvent(AnalyticsEvent.GENERATE_LEAD, {
      form: 'demo',
      solution_type: solutionSelect.value,
    });
    form.style.display = 'none';
    document.getElementById('demo-form-success').classList.add('visible');
    showToast('Pedido enviado con éxito.', 'success');
  } catch (error) {
    console.error('DemoRequestSection: Submission failed', error);
    showToast('No pudimos enviar el pedido. Probá de nuevo.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Solicitar prueba gratuita';
  }
}
