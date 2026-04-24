/**
 * RevealAnimation.js
 * 
 * Reusable scroll-triggered reveal animations.
 * Sets initial state inline via GSAP and reveals on scroll.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Initializes reveal-on-scroll animations for all tagged elements.
 */
export function initRevealAnimations() {
  revealElements('.reveal-up', { y: 40, opacity: 0 });
  revealElements('.reveal-left', { x: -40, opacity: 0 });
  revealElements('.reveal-right', { x: 40, opacity: 0 });
  revealElements('.reveal-scale', { scale: 0.85, opacity: 0 });
  revealStaggeredCards();
  revealSectionHeaders();
}

/**
 * Animates elements with a given class using ScrollTrigger.
 * Uses gsap.from() which sets the initial state inline.
 */
function revealElements(selector, fromVars, options = {}) {
  const elements = document.querySelectorAll(selector);
  if (elements.length === 0) return;

  elements.forEach(element => {
    gsap.from(element, {
      ...fromVars,
      duration: options.duration || 0.8,
      ease: options.ease || 'power2.out',
      scrollTrigger: {
        trigger: element,
        start: options.start || 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });
}

/**
 * Staggered reveal for solution cards.
 */
function revealStaggeredCards() {
  const cards = document.querySelectorAll('.solution-card');
  if (cards.length === 0) return;

  // Set initial state
  gsap.set(cards, { y: 50, opacity: 0 });

  ScrollTrigger.create({
    trigger: '.solutions-section__grid',
    start: 'top 85%',
    onEnter: () => {
      gsap.to(cards, {
        y: 0,
        opacity: 1,
        duration: 0.7,
        stagger: 0.15,
        ease: 'power2.out',
      });
    },
    once: true,
  });
}

/**
 * Reveal for section headers.
 */
function revealSectionHeaders() {
  const headers = document.querySelectorAll('.section-header');
  
  headers.forEach(header => {
    const children = header.children;

    gsap.from(children, {
      y: 30,
      opacity: 0,
      duration: 0.7,
      stagger: 0.12,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: header,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });
}
