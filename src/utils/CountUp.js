/**
 * CountUp.js
 *
 * Animates a number from 0 to a target value when the element first enters
 * the viewport. Uses IntersectionObserver so the animation only fires once
 * and doesn't run off-screen.
 *
 * Usage in markup:
 *   <span data-countup="2450" data-countup-suffix="+">0</span>
 *   <span data-countup="98" data-countup-suffix="%">0</span>
 *   <span data-countup="24" data-countup-suffix="h">0</span>
 */

const DEFAULT_DURATION_MS = 1600;
const EASING = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic

/**
 * Initializes all elements with `data-countup` on the page.
 */
export function initCountUp() {
  const elements = document.querySelectorAll('[data-countup]');
  if (elements.length === 0) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.dataset.countupDone === 'true') return;
      el.dataset.countupDone = 'true';
      observer.unobserve(el);

      const target = parseFloat(el.dataset.countup);
      const suffix = el.dataset.countupSuffix || '';
      const prefix = el.dataset.countupPrefix || '';
      const decimals = parseInt(el.dataset.countupDecimals || '0', 10);
      const duration = parseInt(el.dataset.countupDuration || DEFAULT_DURATION_MS, 10);

      if (reduceMotion || isNaN(target)) {
        el.textContent = prefix + target.toFixed(decimals) + suffix;
        return;
      }

      animate(el, target, duration, decimals, prefix, suffix);
    });
  }, { threshold: 0.4 });

  elements.forEach(el => observer.observe(el));
}

function animate(el, target, duration, decimals, prefix, suffix) {
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = EASING(progress);
    const current = target * eased;
    el.textContent = prefix + current.toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
