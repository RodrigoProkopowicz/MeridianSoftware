/**
 * RevealAnimation.js
 *
 * Reusable scroll-triggered reveal animations.
 * Sets initial state inline via GSAP and reveals on scroll.
 *
 * Mobile tunings: shorter durations + smaller transforms + tighter stagger.
 * Reveal animations on mobile should feel snappy, not cinematic —
 * otherwise users waiting for content to settle feel like the page is lagging.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const isMobile = typeof window !== 'undefined'
  && window.matchMedia('(max-width: 768px)').matches;

const DURATION = isMobile ? 0.5 : 0.8;
const STAGGER  = isMobile ? 0.08 : 0.15;
const OFFSET_Y = isMobile ? 24 : 40;
const OFFSET_X = isMobile ? 24 : 40;

/**
 * Initializes reveal-on-scroll animations for all tagged elements.
 */
export function initRevealAnimations() {
  revealElements('.reveal-up', { y: OFFSET_Y, opacity: 0 });
  revealElements('.reveal-left', { x: -OFFSET_X, opacity: 0 });
  revealElements('.reveal-right', { x: OFFSET_X, opacity: 0 });
  revealElements('.reveal-scale', { scale: 0.9, opacity: 0 });
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
      duration: options.duration || DURATION,
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
  gsap.set(cards, { y: isMobile ? 24 : 50, opacity: 0 });

  ScrollTrigger.create({
    trigger: '.solutions-section__grid',
    start: 'top 85%',
    onEnter: () => {
      gsap.to(cards, {
        y: 0,
        opacity: 1,
        duration: isMobile ? 0.5 : 0.7,
        stagger: STAGGER,
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
      y: isMobile ? 18 : 30,
      opacity: 0,
      duration: isMobile ? 0.5 : 0.7,
      stagger: isMobile ? 0.06 : 0.12,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: header,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });
}
