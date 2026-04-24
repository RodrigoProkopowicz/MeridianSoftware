/**
 * HeroSection.js
 * 
 * Full-viewport hero with animated background, logo, tagline, and CTAs.
 */

import { smoothScrollTo } from '../utils/DomHelper.js';
import { trackEvent } from '../services/AnalyticsService.js';
import { AnalyticsEvent } from '../services/AnalyticsEvents.js';
import { renderDeviceScene } from './DeviceScene.js';

/**
 * Renders the hero section HTML.
 * @returns {string}
 */
export function renderHeroSection() {
  return `
    <section class="hero-section" id="hero">
      <div class="hero-section__background">
        <div class="hero-section__orb hero-section__orb--primary"></div>
        <div class="hero-section__orb hero-section__orb--secondary"></div>
        <div class="hero-section__orb hero-section__orb--tertiary"></div>
        <div class="hero-section__grid"></div>
      </div>

      ${renderDeviceScene()}

      <div class="hero-section__content">
        <img src="/logo.png" alt="Meridian Software" class="hero-section__logo" decoding="async" fetchpriority="high" />
        
        <h1 class="hero-section__title">
          <span class="hero-section__title-gradient">Building Digital Excellence</span>
        </h1>

        <p class="hero-section__subtitle">
          We craft premium web &amp; mobile solutions that transform ideas into 
          powerful digital experiences. From concept to deployment, we deliver 
          software that drives results.
        </p>

        <div class="hero-section__actions">
          <button class="button-primary" id="hero-explore-button" data-magnetic>
            Explore Solutions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 17L17 7M17 7H7M17 7V17"/>
            </svg>
          </button>
          <button class="button-secondary" id="hero-contact-button" data-magnetic>
            Get in Touch
          </button>
        </div>
      </div>

      <div class="hero-section__scroll-indicator">
        <span>Scroll</span>
        <div class="hero-section__scroll-indicator-line"></div>
      </div>
    </section>
  `;
}

/**
 * Initializes hero section event listeners.
 */
export function initHeroSection() {
  const exploreBtn = document.getElementById('hero-explore-button');
  const contactBtn = document.getElementById('hero-contact-button');

  if (exploreBtn) {
    exploreBtn.addEventListener('click', () => {
      trackEvent(AnalyticsEvent.SELECT_CONTENT, { content_type: 'cta', item_id: 'hero_explore' });
      smoothScrollTo('#solutions', 80);
    });
  }
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      trackEvent(AnalyticsEvent.SELECT_CONTENT, { content_type: 'cta', item_id: 'hero_contact' });
      smoothScrollTo('#contact', 80);
    });
  }
}
