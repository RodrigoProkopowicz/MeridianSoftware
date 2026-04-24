/**
 * ContactSection.js
 * 
 * Contact form section with name, email, company, and message fields.
 * Submits to Firestore. No authentication required.
 */

import { submitContactForm } from '../services/ContactFormService.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { executeRecaptcha } from '../services/RecaptchaService.js';
import { RecaptchaAction } from '../services/RecaptchaActions.js';
import { validateForm, isNotEmpty, isValidEmail, hasMinLength } from '../utils/ValidationHelper.js';
import { showToast } from '../utils/DomHelper.js';

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
              Let's Build Something<br/>
              <span style="color: var(--color-accent-light)">Remarkable Together</span>
            </h2>
            <p class="contact-section__info-text">
              Ready to start your project? Have questions about our services? 
              We'd love to hear from you. Reach out and our team will get back 
              to you within 24 hours.
            </p>
            <div class="contact-section__info-items">
              <div class="contact-section__info-item">
                <div class="contact-section__info-item-icon">📧</div>
                <div class="contact-section__info-item-content">
                  <span class="contact-section__info-item-label">Email</span>
                  <span class="contact-section__info-item-value">hello@meridiansoftware.dev</span>
                </div>
              </div>
              <div class="contact-section__info-item">
                <div class="contact-section__info-item-icon">📍</div>
                <div class="contact-section__info-item-content">
                  <span class="contact-section__info-item-label">Location</span>
                  <span class="contact-section__info-item-value">Buenos Aires, Argentina</span>
                </div>
              </div>
              <div class="contact-section__info-item">
                <div class="contact-section__info-item-icon">⏰</div>
                <div class="contact-section__info-item-content">
                  <span class="contact-section__info-item-label">Response Time</span>
                  <span class="contact-section__info-item-value">Within 24 hours</span>
                </div>
              </div>
            </div>
          </div>

          <div class="contact-section__form glass-card reveal-right" id="contact-form-card">
            <form id="contact-form" novalidate>
              <div class="contact-section__form-row">
                <div class="form-group">
                  <label class="form-label" for="contact-name-input">Full Name</label>
                  <input type="text" class="input-field" id="contact-name-input"
                         name="name" placeholder="John Doe" maxlength="200" autocomplete="name" />
                  <span class="input-error-message">Name is required</span>
                </div>
                <div class="form-group">
                  <label class="form-label" for="contact-email-input">Email</label>
                  <input type="email" class="input-field" id="contact-email-input"
                         name="email" placeholder="john@company.com" maxlength="200" autocomplete="email" />
                  <span class="input-error-message">Valid email is required</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-company-input">Company <span class="form-label__hint">(optional)</span></label>
                <input type="text" class="input-field" id="contact-company-input"
                       name="company" placeholder="Your company" maxlength="200" autocomplete="organization" />
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-message-input">Message</label>
                <textarea class="input-field" id="contact-message-input"
                          name="message" placeholder="Tell us about your project..." rows="4" maxlength="5000"></textarea>
                <span class="input-error-message">Message must be at least 10 characters</span>
              </div>

              <div class="honeypot" aria-hidden="true">
                <label>Do not fill this field
                  <input type="text" id="contact-website-input" name="website" tabindex="-1" autocomplete="off" />
                </label>
              </div>

              <button type="submit" class="button-primary contact-section__form-submit" id="contact-submit-button">
                Send Message
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/>
                </svg>
              </button>
            </form>

            <div class="contact-section__form-success" id="contact-form-success">
              <div class="contact-section__form-success-icon">✅</div>
              <h3 class="contact-section__form-success-title">Message Sent!</h3>
              <p class="contact-section__form-success-text">
                Thank you for reaching out. We'll get back to you shortly.
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

/** Minimum milliseconds a human needs to fill out the contact form. */
const MIN_FILL_MS = 2500;
/** Minimum seconds between submissions from the same browser (localStorage). */
const SUBMIT_COOLDOWN_S = 60;
/** localStorage key for last submission timestamp. */
const LAST_SUBMIT_KEY = 'meridian.contact.lastSubmit';
/** Timestamp when the form was first rendered (used for the "too fast" check). */
const formLoadedAt = Date.now();

/**
 * Handles contact form submission.
 * @param {Event} event
 */
async function handleContactSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById('contact-name-input');
  const emailInput = document.getElementById('contact-email-input');
  const companyInput = document.getElementById('contact-company-input');
  const messageInput = document.getElementById('contact-message-input');
  const honeypot = document.getElementById('contact-website-input');
  const submitBtn = document.getElementById('contact-submit-button');

  // Silent rejection — honeypot is hidden from real users; bots fill every field.
  if (honeypot && honeypot.value) {
    document.getElementById('contact-form').style.display = 'none';
    document.getElementById('contact-form-success').classList.add('visible');
    return;
  }

  // Too-fast check — humans take at least a couple of seconds to fill four fields.
  if (Date.now() - formLoadedAt < MIN_FILL_MS) {
    showToast('Please take a moment to review your message.', 'error');
    return;
  }

  // Cooldown between submissions on the same browser.
  const lastSubmit = Number(localStorage.getItem(LAST_SUBMIT_KEY)) || 0;
  const secondsSince = (Date.now() - lastSubmit) / 1000;
  if (secondsSince < SUBMIT_COOLDOWN_S) {
    const wait = Math.ceil(SUBMIT_COOLDOWN_S - secondsSince);
    showToast(`Please wait ${wait}s before sending another message.`, 'error');
    return;
  }

  const isValid = validateForm([
    { element: nameInput, validator: isNotEmpty, message: 'Name is required' },
    { element: emailInput, validator: isValidEmail, message: 'Valid email is required' },
    { element: messageInput, validator: (v) => hasMinLength(v, 10), message: 'Message must be at least 10 characters' },
  ]);

  if (!isValid) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner"></div> Sending...';

  try {
    const recaptchaToken = await executeRecaptcha(RecaptchaAction.CONTACT_SUBMIT);
    await submitContactForm({
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      company: companyInput.value.trim(),
      message: messageInput.value.trim(),
      recaptchaToken,
    });

    localStorage.setItem(LAST_SUBMIT_KEY, String(Date.now()));
    trackEvent(AnalyticsEvent.GENERATE_LEAD, { form: 'contact' });
    document.getElementById('contact-form').style.display = 'none';
    document.getElementById('contact-form-success').classList.add('visible');
    showToast('Message sent successfully!', 'success');
  } catch (error) {
    console.error('ContactSection: Submission failed', error);
    showToast('Failed to send message. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Send Message';
  }
}
