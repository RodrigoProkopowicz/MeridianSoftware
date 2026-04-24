/**
 * HeroAnimation.js
 * 
 * GSAP animations specific to the hero section:
 * logo entrance, title reveal, subtitle, and CTA buttons.
 */

import { gsap } from 'gsap';

/**
 * Initializes hero section entrance animations.
 */
export function initHeroAnimations() {
  const heroContent = document.querySelector('.hero-section__content');
  if (!heroContent) return;

  const timeline = gsap.timeline({
    defaults: { ease: 'power3.out' },
  });

  timeline
    .from('.hero-section__logo', {
      duration: 1.2,
      opacity: 0,
      scale: 0.8,
      y: 30,
    })
    .from('.hero-section__title', {
      duration: 0.9,
      opacity: 0,
      y: 40,
    }, '-=0.5')
    .from('.hero-section__subtitle', {
      duration: 0.8,
      opacity: 0,
      y: 30,
    }, '-=0.4')
    .from('.hero-section__actions > *', {
      duration: 0.6,
      opacity: 0,
      y: 20,
      stagger: 0.15,
    }, '-=0.3')
    .from('.hero-section__scroll-indicator', {
      duration: 0.6,
      opacity: 0,
      y: -10,
    }, '-=0.1');

  // Floating shapes subtle animation
  const shapes = document.querySelectorAll('.hero-section__shape');
  shapes.forEach((shape, index) => {
    gsap.from(shape, {
      duration: 1.5,
      opacity: 0,
      scale: 0,
      delay: 0.8 + index * 0.2,
      ease: 'back.out(1.5)',
    });
  });
}
