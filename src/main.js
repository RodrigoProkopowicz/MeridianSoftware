/**
 * main.js
 *
 * Application entry point. Assembles all sections, initializes
 * Firebase auth, event listeners, and scroll animations.
 */

/* ---- Styles ---- */
import './styles/variables.css';
import './styles/reset.css';
import './styles/global.css';
import './styles/animations.css';
import './styles/navigation.css';
import './styles/hero.css';
import './styles/device-scene.css';
import './styles/trust-bar.css';
import './styles/solutions.css';
import './styles/products.css';
import './styles/case-studies.css';
import './styles/stats-bar.css';
import './styles/testimonials.css';
import './styles/demo.css';
import './styles/contact.css';
import './styles/auth.css';
import './styles/footer.css';

/* ---- Components ---- */
import { renderNavigationBar, initNavigationBar } from './components/NavigationBar.js';
import { renderHeroSection, initHeroSection } from './components/HeroSection.js';
import { renderTrustBarSection } from './components/TrustBarSection.js';
import { renderSolutionsSection, initSolutionsSection } from './components/SolutionsSection.js';
import { renderProductsSection, initProductsSection } from './components/ProductsSection.js';
import { renderCaseStudiesSection, initCaseStudiesSection } from './components/CaseStudiesSection.js';
import { renderStatsBar } from './components/StatsBar.js';
import { renderTestimonialsSection, initTestimonialsSection } from './components/TestimonialsSection.js';
import { renderDemoRequestSection, initDemoRequestSection } from './components/DemoRequestSection.js';
import { renderContactSection, initContactSection } from './components/ContactSection.js';
import { renderFooterSection } from './components/FooterSection.js';
import { renderAuthModal, initAuthModal, openAuthModal } from './components/AuthModal.js';
import { initUserProfileBadge } from './components/UserProfileBadge.js';

/* ---- Services ---- */
import { initializeAuthListener } from './services/AuthenticationService.js';

/* ---- Animations + utils ---- */
import { initializeAllAnimations } from './animations/ScrollAnimationController.js';
import { initCountUp } from './utils/CountUp.js';
import { initMagneticEffect } from './utils/MagneticEffect.js';

/**
 * Boots the entire application.
 */
function initializeApplication() {
  const appContainer = document.getElementById('app');

  if (!appContainer) {
    console.error('main.js: #app container not found');
    return;
  }

  // 1. Render all sections into the DOM
  appContainer.innerHTML = `
    ${renderNavigationBar()}
    <main>
      ${renderHeroSection()}
      ${renderTrustBarSection()}
      ${renderProductsSection()}
      ${renderSolutionsSection()}
      ${renderCaseStudiesSection()}
      ${renderStatsBar()}
      ${renderTestimonialsSection()}
      ${renderDemoRequestSection()}
      ${renderContactSection()}
    </main>
    ${renderFooterSection()}
    ${renderAuthModal()}
  `;

  // 2. Initialize Firebase auth listener
  initializeAuthListener();

  // 3. Initialize all component event listeners
  initNavigationBar();
  initHeroSection();
  initProductsSection(openAuthModal);
  initSolutionsSection(openAuthModal);
  initCaseStudiesSection();
  initTestimonialsSection();
  initDemoRequestSection(openAuthModal);
  initContactSection();
  initAuthModal();
  initUserProfileBadge(openAuthModal);

  // 4. Initialize scroll animations and interactive behaviors
  initializeAllAnimations();
  initCountUp();
  initMagneticEffect();
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
  initializeApplication();
}
