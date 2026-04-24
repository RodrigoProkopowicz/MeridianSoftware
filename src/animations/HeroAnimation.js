/**
 * HeroAnimation.js
 *
 * GSAP animations specific to the hero section:
 * logo entrance, title reveal, subtitle, and CTA buttons.
 *
 * Mobile gets shorter durations and simpler stagger so the hero feels
 * responsive to touch sooner.
 */

import { gsap } from 'gsap';

const isMobile = typeof window !== 'undefined'
  && window.matchMedia('(max-width: 768px)').matches;

const D = isMobile
  ? { logo: 0.7, title: 0.55, sub: 0.5, cta: 0.4, scroll: 0.4 }
  : { logo: 1.2, title: 0.9, sub: 0.8, cta: 0.6, scroll: 0.6 };

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
      duration: D.logo,
      opacity: 0,
      scale: 0.85,
      y: 24,
    })
    .from('.hero-section__title', {
      duration: D.title,
      opacity: 0,
      y: 30,
    }, '-=0.45')
    .from('.hero-section__subtitle', {
      duration: D.sub,
      opacity: 0,
      y: 20,
    }, '-=0.35')
    .from('.hero-section__actions > *', {
      duration: D.cta,
      opacity: 0,
      y: 16,
      stagger: isMobile ? 0.08 : 0.15,
    }, '-=0.25')
    .from('.hero-section__scroll-indicator', {
      duration: D.scroll,
      opacity: 0,
      y: -8,
    }, '-=0.1');

  // Floating shapes entrance — desktop only; on mobile the shapes are
  // already hidden via CSS, and on small screens one fewer animation is
  // one less thing fighting the main thread during hero entrance.
  if (!isMobile) {
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
}
