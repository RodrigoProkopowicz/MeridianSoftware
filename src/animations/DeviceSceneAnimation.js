/**
 * DeviceSceneAnimation.js
 *
 * Pins the hero and scrubs a GSAP timeline that disassembles the laptop +
 * phone, then reveals floating code snippets. The hero stays in place
 * while the user scrolls through the story — a dedicated scroll moment
 * before the rest of the page begins.
 *
 * Timeline progress mapped to scroll 0..1 of the pin:
 *   0.00 → 0.25   idle (subtle float)
 *   0.25 → 0.65   devices explode outward
 *   0.45 → 0.85   code snippets fade in, drift
 *   0.85 → 1.00   scene fades out, next section ready to enter
 */

import { gsap } from 'gsap';

export function initDeviceSceneAnimation() {
  const scene = document.querySelector('.device-scene');
  const hero = document.querySelector('.hero-section');
  if (!scene || !hero) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // Mobile: no pin (would break natural scroll). Fade the scene instead.
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    gsap.to(scene, {
      opacity: 0,
      scale: 0.9,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });
    return;
  }

  // Desktop: pin the hero for 1 extra viewport height while the timeline plays.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: '+=100%',
      pin: true,
      pinSpacing: true,
      scrub: 0.8,
      anticipatePin: 1,
    },
  });

  // ---- Idle float (0.0 → 0.25) ----
  tl.to('[data-device="laptop"]', { y: -6, duration: 0.25 }, 0)
    .to('[data-device="phone"]',  { y: -10, x: 4, duration: 0.25 }, 0);

  // ---- Disassembly phase (0.25 → 0.65) ----
  tl.to('[data-part="laptop-screen"]', {
      y: -180, x: -80, rotation: -18, opacity: 0, duration: 0.4,
    }, 0.25)
    .to('[data-part="laptop-frame"]', {
      y: -120, x: -160, rotation: -12, opacity: 0, duration: 0.4,
    }, 0.27)
    .to('[data-part="laptop-code"]', {
      y: -220, x: -40, scale: 1.4, opacity: 0, duration: 0.4,
    }, 0.23)
    .to('[data-part="laptop-base"]', {
      y: 180, x: -200, rotation: 22, opacity: 0, duration: 0.4,
    }, 0.29)
    .to('[data-part="laptop-hinge"]', {
      y: 220, scale: 0.4, opacity: 0, duration: 0.3,
    }, 0.31)
    .to('[data-part="laptop-trackpad"]', {
      y: 260, scale: 0, opacity: 0, rotation: 45, duration: 0.3,
    }, 0.33)

    .to('[data-part="phone-screen"]', {
      y: -160, x: 140, rotation: 24, opacity: 0, duration: 0.4,
    }, 0.27)
    .to('[data-part="phone-frame"]', {
      y: -60, x: 220, rotation: 18, opacity: 0, duration: 0.4,
    }, 0.29)
    .to('[data-part="phone-code"]', {
      y: -200, x: 80, scale: 1.3, opacity: 0, duration: 0.4,
    }, 0.25)
    .to('[data-part="phone-notch"]', {
      y: -220, x: 180, scale: 0, opacity: 0, duration: 0.3,
    }, 0.31)
    .to('[data-part="phone-home"]', {
      y: 200, x: 240, scale: 0, opacity: 0, duration: 0.3,
    }, 0.33);

  // ---- Code snippets reveal (0.45 → 0.85) ----
  tl.from('.device-scene__code', {
    opacity: 0,
    scale: 0.6,
    y: 30,
    stagger: { each: 0.02, from: 'random' },
    duration: 0.4,
    ease: 'power2.out',
  }, 0.45);

  // ---- Scene fade-out (0.85 → 1.0) ----
  tl.to('.device-scene', {
    opacity: 0,
    duration: 0.15,
  }, 0.85);

  // Gentle drift on snippets — independent clock, not tied to scroll.
  gsap.to('.device-scene__code', {
    y: '-=10',
    duration: 3,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    stagger: { each: 0.15, from: 'random' },
  });
}
