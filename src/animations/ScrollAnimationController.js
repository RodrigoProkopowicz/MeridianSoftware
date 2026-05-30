/**
 * ScrollAnimationController.js
 * 
 * Central controller for all GSAP ScrollTrigger animations.
 * Registers the plugin and coordinates animation setup/teardown.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initHeroAnimations } from './HeroAnimation.js';
import { initRevealAnimations } from './RevealAnimation.js';
import { initDeviceSceneAnimation } from './DeviceSceneAnimation.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * True if the user has requested reduced motion at the OS level.
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Initializes all page scroll animations.
 * Call after DOM content is injected.
 */
export function initializeAllAnimations() {
  if (prefersReducedMotion()) {
    // Still wire the navbar-scrolled class (it's a UI state, not decorative)
    // but skip every entrance/parallax animation.
    requestAnimationFrame(initNavbarScrollEffect);
    return;
  }

  requestAnimationFrame(() => {
    initHeroAnimations();
    initRevealAnimations();
    initNavbarScrollEffect();
    initParallaxEffects();
    initDeviceSceneAnimation();
  });
}

/**
 * Navbar background transition on scroll.
 */
function initNavbarScrollEffect() {
  const navbar = document.querySelector('.navigation-bar');
  if (!navbar) return;

  ScrollTrigger.create({
    start: 'top -80',
    onUpdate: (self) => {
      if (self.scroll() > 80) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    },
  });
}

/**
 * Parallax movement for hero background elements.
 * Skipped on mobile — the subtle motion isn't perceptible on small screens
 * and the scrub-tied scroll handler burns battery without benefit.
 */
function initParallaxEffects() {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) return;

  const orbs = document.querySelectorAll('.hero-section__orb');

  orbs.forEach((orb, index) => {
    gsap.to(orb, {
      y: () => (index + 1) * -80,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero-section',
        start: 'top top',
        end: 'bottom top',
        scrub: 1.5,
      },
    });
  });

  const shapes = document.querySelectorAll('.hero-section__shape');
  shapes.forEach((shape, index) => {
    gsap.to(shape, {
      y: () => (index % 2 === 0 ? -60 : 60),
      rotation: () => (index % 2 === 0 ? 15 : -15),
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero-section',
        start: 'top top',
        end: 'bottom top',
        scrub: 2,
      },
    });
  });
}
