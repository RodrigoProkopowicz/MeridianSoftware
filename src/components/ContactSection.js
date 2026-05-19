/**
 * ContactSection.js
 * 
 * Contact form section with name, email, company, and message fields.
 * Submits to Firestore. No authentication required.
 */

import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { validateForm, isNotEmpty, isValidEmail, hasMinLength } from '../utils/ValidationHelper.js';

/**
 * Inbox que recibe los mensajes del formulario de contacto. Si lo cambiás,
 * acordate de actualizar también `functions/index.js` (donde se usa el
 * mismo destinatario para futuros envíos server-side, si los reactivamos).
 */
const CONTACT_INBOX = '5w5t48t5n9@privaterelay.appleid.com';

/**
 * Renders the contact section HTML.
 * @returns {string}
 */
export function renderContactSection() {
  return `
    <section class="contact-section section" id="contact">
      <div class="container">
        <div class="contact-section__layout">
          <div class="contact-section__info reveal-left">
            <h2 class="contact-section__info-title">
              Construyamos algo<br/>
              <span style="color: var(--color-accent-light)">extraordinario juntos</span>
            </h2>
            <p class="contact-section__info-text">
              ¿Listo para arrancar tu proyecto? ¿Tenés preguntas sobre nuestros servicios?
              Contanos qué necesitás y nuestro equipo te responde
              en menos de 24 horas.
            </p>
            <div class="contact-section__info-items">
              <div class="contact-section__info-item">
                <div class="contact-section__info-item-icon">📍</div>
                <div class="contact-section__info-item-content">
                  <span class="contact-section__info-item-label">Ubicación</span>
                  <span class="contact-section__info-item-value">Buenos Aires, Argentina</span>
                </div>
              </div>
              <div class="contact-section__info-item">
                <div class="contact-section__info-item-icon">⏰</div>
                <div class="contact-section__info-item-content">
                  <span class="contact-section__info-item-label">Tiempo de respuesta</span>
                  <span class="contact-section__info-item-value">Menos de 24 horas</span>
                </div>
              </div>
            </div>
          </div>

          <div class="contact-section__form glass-card reveal-right" id="contact-form-card">
            <form id="contact-form" novalidate>
              <div class="contact-section__form-row">
                <div class="form-group">
                  <label class="form-label" for="contact-name-input">Nombre completo</label>
                  <input type="text" class="input-field" id="contact-name-input"
                         name="name" placeholder="Juan Pérez" maxlength="200" autocomplete="name" />
                  <span class="input-error-message">El nombre es obligatorio</span>
                </div>
                <div class="form-group">
                  <label class="form-label" for="contact-email-input">Email</label>
                  <input type="email" class="input-field" id="contact-email-input"
                         name="email" placeholder="juan@empresa.com" maxlength="200" autocomplete="email" />
                  <span class="input-error-message">Necesitamos un email válido</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-company-input">Empresa <span class="form-label__hint">(opcional)</span></label>
                <input type="text" class="input-field" id="contact-company-input"
                       name="company" placeholder="Tu empresa" maxlength="200" autocomplete="organization" />
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-message-input">Mensaje</label>
                <textarea class="input-field" id="contact-message-input"
                          name="message" placeholder="Contanos sobre tu proyecto..." rows="4" maxlength="5000"></textarea>
                <span class="input-error-message">El mensaje debe tener al menos 10 caracteres</span>
              </div>

              <button type="submit" class="button-primary contact-section__form-submit" id="contact-submit-button">
                Enviar mensaje
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/>
                </svg>
              </button>
            </form>

            <div class="contact-section__form-success" id="contact-form-success">
              <div class="contact-section__form-success-icon">✉️</div>
              <h3 class="contact-section__form-success-title">Abrí tu app de email</h3>
              <p class="contact-section__form-success-text">
                Te abrimos un mensaje con todo pre-cargado. Solo apretá <strong>Enviar</strong> en tu cliente de email para que nos llegue.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Initializes contact form event listeners.
 */
export function initContactSection() {
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', handleContactSubmit);
  }
}

/**
 * Handles contact form submission.
 *
 * No usamos backend: armamos un `mailto:` con asunto + cuerpo y lo abrimos
 * en el cliente de email del usuario (Mail, Gmail, Outlook, etc.). El usuario
 * solo aprieta "Enviar" en su app y el mensaje sale desde su propia cuenta —
 * así nos llega con el remitente real, sin SMTP de por medio.
 * @param {Event} event
 */
function handleContactSubmit(event) {
  event.preventDefault();

  const nameInput    = document.getElementById('contact-name-input');
  const emailInput   = document.getElementById('contact-email-input');
  const companyInput = document.getElementById('contact-company-input');
  const messageInput = document.getElementById('contact-message-input');

  const isValid = validateForm([
    { element: nameInput,    validator: isNotEmpty,                        message: 'El nombre es obligatorio' },
    { element: emailInput,   validator: isValidEmail,                      message: 'Necesitamos un email válido' },
    { element: messageInput, validator: (v) => hasMinLength(v, 10),        message: 'El mensaje debe tener al menos 10 caracteres' },
  ]);

  if (!isValid) return;

  const name    = nameInput.value.trim();
  const email   = emailInput.value.trim();
  const company = companyInput.value.trim();
  const message = messageInput.value.trim();

  const subject = `Consulta desde meridian-software.com — ${name}`;
  const body =
    `${message}\n\n` +
    `—\n` +
    `Nombre: ${name}\n` +
    `Email: ${email}\n` +
    (company ? `Empresa: ${company}\n` : '');

  // RFC 6068: el subject y body van URL-encoded en un mailto:.
  const mailtoUrl =
    `mailto:${CONTACT_INBOX}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  trackEvent(AnalyticsEvent.GENERATE_LEAD, { form: 'contact' });

  // Abrir el cliente de email. Algunos browsers bloquean window.open en
  // contextos sin gesto; como esto sale de un click submit, location.href
  // es la opción más confiable.
  window.location.href = mailtoUrl;

  // Mostrar el estado de éxito; el formulario queda oculto para indicar
  // que el siguiente paso pasa por la app de email del usuario.
  document.getElementById('contact-form').style.display = 'none';
  document.getElementById('contact-form-success').classList.add('visible');
}
