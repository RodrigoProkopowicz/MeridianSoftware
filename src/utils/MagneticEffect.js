/**
 * MagneticEffect.js
 *
 * Subtle cursor-follow effect for primary CTAs. When the pointer is near
 * the button, it drifts slightly toward the cursor (within a damped limit).
 * Snaps back on leave.
 *
 * Disabled on coarse pointers (touch devices) and when reduced-motion is set.
 *
 * Usage: call `initMagneticEffect()` after the DOM is ready. It binds to
 * any element matching `[data-magnetic]`.
 */

const MAX_TRANSLATE_PX = 10;
const DAMPENING = 0.35;

export function initMagneticEffect() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (reduceMotion || coarsePointer) return;

  const elements = document.querySelectorAll('[data-magnetic]');
  elements.forEach(bindMagnetic);
}

function bindMagnetic(el) {
  el.addEventListener('pointermove', (e) => {
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const tx = Math.max(-MAX_TRANSLATE_PX, Math.min(MAX_TRANSLATE_PX, dx * DAMPENING));
    const ty = Math.max(-MAX_TRANSLATE_PX, Math.min(MAX_TRANSLATE_PX, dy * DAMPENING));
    el.style.transform = `translate(${tx}px, ${ty}px)`;
  });

  el.addEventListener('pointerleave', () => {
    el.style.transform = '';
  });
}
