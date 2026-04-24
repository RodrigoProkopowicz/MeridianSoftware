/**
 * NavigationBar.js
 * 
 * Fixed top navigation with logo, section links, and user auth badge.
 * Supports mobile hamburger menu.
 */

import { smoothScrollTo, lockBodyScroll, unlockBodyScroll } from '../utils/DomHelper.js';
import { renderUserProfileBadge } from './UserProfileBadge.js';

/**
 * Renders the navigation bar HTML.
 * @returns {string}
 */
export function renderNavigationBar() {
  return `
    <nav class="navigation-bar" id="navigation-bar">
      <div class="container navigation-bar__inner">
        <a href="#hero" class="navigation-bar__logo" aria-label="Meridian Software Home">
          <img src="/logo.png" alt="Meridian Software" decoding="async" fetchpriority="high" />
        </a>

        <div class="navigation-bar__links hide-mobile">
          <a href="#hero" class="navigation-bar__link active" data-section="hero">Home</a>
          <a href="#solutions" class="navigation-bar__link" data-section="solutions">Solutions</a>
          <a href="#demo" class="navigation-bar__link" data-section="demo">Demo</a>
          <a href="#contact" class="navigation-bar__link" data-section="contact">Contact</a>
        </div>

        <div class="navigation-bar__actions">
          ${renderUserProfileBadge()}
          <button class="navigation-bar__hamburger" id="hamburger-button" aria-label="Toggle menu" aria-expanded="false" aria-controls="mobile-menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      <div class="navigation-bar__mobile-menu" id="mobile-menu">
        <a href="#hero" class="navigation-bar__link" data-section="hero" data-mobile-link>Home</a>
        <a href="#solutions" class="navigation-bar__link" data-section="solutions" data-mobile-link>Solutions</a>
        <a href="#demo" class="navigation-bar__link" data-section="demo" data-mobile-link>Demo</a>
        <a href="#contact" class="navigation-bar__link" data-section="contact" data-mobile-link>Contact</a>
      </div>
    </nav>
  `;
}

/**
 * Initializes navigation bar event listeners.
 */
export function initNavigationBar() {
  // Smooth scroll for nav links
  document.querySelectorAll('.navigation-bar__link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      smoothScrollTo(`#${section}`, 80);
      
      // Update active state
      document.querySelectorAll('.navigation-bar__link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll(`[data-section="${section}"]`).forEach(l => l.classList.add('active'));

      // Close mobile menu if open
      closeMobileMenu();
    });
  });

  // Hamburger toggle
  const hamburger = document.getElementById('hamburger-button');
  if (hamburger) {
    hamburger.addEventListener('click', toggleMobileMenu);
  }

  // Active link on scroll
  initScrollSpy();
}

function toggleMobileMenu() {
  const hamburger = document.getElementById('hamburger-button');
  const mobileMenu = document.getElementById('mobile-menu');

  const isOpen = hamburger.classList.toggle('active');
  mobileMenu.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) lockBodyScroll(); else unlockBodyScroll();
}

function closeMobileMenu() {
  const hamburger = document.getElementById('hamburger-button');
  const mobileMenu = document.getElementById('mobile-menu');

  const wasOpen = hamburger && hamburger.classList.contains('active');
  if (hamburger) {
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
  }
  if (mobileMenu) mobileMenu.classList.remove('open');
  if (wasOpen) unlockBodyScroll();
}

function initScrollSpy() {
  const sectionIds = ['hero', 'solutions', 'demo', 'contact'];
  const sections = sectionIds
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (sections.length === 0) return;

  const setActive = (sectionId) => {
    document.querySelectorAll('.navigation-bar__link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`[data-section="${sectionId}"]`).forEach(l => l.classList.add('active'));
  };

  // Track which sections are currently intersecting; pick the topmost one.
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visible.add(entry.target.id);
      else visible.delete(entry.target.id);
    });
    if (visible.size === 0) return;
    const active = sectionIds.find(id => visible.has(id));
    if (active) setActive(active);
  }, {
    // Section counts as "active" once its top passes ~30% from the viewport top.
    rootMargin: '-30% 0px -60% 0px',
    threshold: 0,
  });

  sections.forEach(s => observer.observe(s));
}
