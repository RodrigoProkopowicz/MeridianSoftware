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
          <span class="section-label">Try It Out</span>
          <h2 class="section-title">Request a Demo</h2>
          <p class="section-subtitle">
            See our solutions in action. Sign in to schedule a personalized 
            demo with our team.
          </p>
        </div>

        <div class="demo-section__content">
          <!-- Auth required prompt -->
          <div class="demo-section__auth-prompt glass-card" id="demo-auth-prompt">
            <div class="demo-section__auth-prompt-icon">🔐</div>
            <h3 class="demo-section__auth-prompt-title">Sign in to Continue</h3>
            <p class="demo-section__auth-prompt-text">
              Create an account or sign in to request a personalized demo 
              of our solutions. It only takes a moment.
            </p>
            <button class="button-primary" id="demo-sign-in-button">
              Sign In to Request Demo
            </button>
          </div>

          <!-- Demo form (shown when authenticated) -->
          <div class="demo-section__form glass-card" id="demo-form-container" style="display: none;">
            <form id="demo-request-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="demo-solution-select">Solution Interest</label>
                <select class="input-field" id="demo-solution-select" name="solutionType">
                  <option value="">Select a solution...</option>
                  <option value="mobile-apps">Mobile Applications</option>
                  <option value="web-platforms">Web Platforms</option>
                  <option value="cloud-devops">Cloud & DevOps</option>
                  <option value="custom-software">Custom Software</option>
                </select>
                <span class="input-error-message">Please select a solution</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-company-input">Company Name</label>
                <input type="text" class="input-field" id="demo-company-input"
                       name="companyName" placeholder="Your company name" maxlength="200" autocomplete="organization" />
                <span class="input-error-message">Company name is required</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-date-input">Preferred Date</label>
                <input type="date" class="input-field" id="demo-date-input"
                       name="preferredDate" />
                <span class="input-error-message">Please select a date</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="demo-message-input">Additional Details</label>
                <textarea class="input-field" id="demo-message-input"
                          name="message" placeholder="Tell us about your project..." rows="3" maxlength="5000"></textarea>
              </div>

              <button type="submit" class="button-primary demo-section__form-submit" id="demo-submit-button">
                Submit Request
              </button>
            </form>

            <div class="demo-section__form-success" id="demo-form-success">
              <div class="demo-section__form-success-icon">🎉</div>
              <h3 class="demo-section__form-success-title">Request Submitted!</h3>
              <p class="demo-section__form-success-text">
                We'll reach out to schedule your demo soon. Check your email for confirmation.
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
    { element: solutionSelect, validator: isNotEmpty, message: 'Please select a solution' },
    { element: companyInput, validator: isNotEmpty, message: 'Company name is required' },
  ]);

  if (!isValid) return;

  const user = getCurrentUser();
  if (!user) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner"></div> Submitting...';

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
    showToast('Demo request submitted successfully!', 'success');
  } catch (error) {
    console.error('DemoRequestSection: Submission failed', error);
    showToast('Failed to submit. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }
}
