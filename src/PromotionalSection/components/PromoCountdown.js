/**
 * PromoCountdown.js
 *
 * Cuenta regresiva hasta el fin de la promoción (PROMO_DEADLINE). Refuerza la
 * urgencia ("por tiempo limitado"). Al llegar a cero muestra que la promo
 * terminó. Es un elemento visual/marketing — no bloquea el formulario.
 */

import { PROMO_DEADLINE } from '../config.js';

const UNITS = [
  { key: 'days', label: 'días' },
  { key: 'hours', label: 'hs' },
  { key: 'mins', label: 'min' },
  { key: 'secs', label: 'seg' },
];

export function renderPromoCountdown() {
  return `
    <section class="promo-countdown" id="promo-countdown" aria-label="La promoción termina pronto">
      <div class="promo-container promo-countdown__inner">
        <p class="promo-countdown__label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <span>Promo por tiempo limitado — termina en</span>
        </p>
        <div class="promo-countdown__timer" id="promo-countdown-timer" role="timer" aria-live="off">
          ${UNITS.map((u, i) => `
            ${i > 0 ? '<span class="promo-countdown__sep">:</span>' : ''}
            <span class="promo-countdown__unit">
              <span class="promo-countdown__num" data-cd="${u.key}">--</span>
              <span class="promo-countdown__cap">${u.label}</span>
            </span>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

let intervalId = null;

export function initPromoCountdown() {
  const root = document.getElementById('promo-countdown');
  const timerEl = document.getElementById('promo-countdown-timer');
  if (!root || !timerEl) return;

  const deadline = new Date(PROMO_DEADLINE).getTime();
  const nums = {
    days: root.querySelector('[data-cd="days"]'),
    hours: root.querySelector('[data-cd="hours"]'),
    mins: root.querySelector('[data-cd="mins"]'),
    secs: root.querySelector('[data-cd="secs"]'),
  };

  if (intervalId) { clearInterval(intervalId); intervalId = null; }

  const tick = () => {
    const diff = deadline - Date.now();

    if (diff <= 0) {
      root.classList.add('is-ended');
      timerEl.innerHTML = '<span class="promo-countdown__ended">¡La promoción terminó!</span>';
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    if (nums.days) nums.days.textContent = String(d);
    if (nums.hours) nums.hours.textContent = String(h).padStart(2, '0');
    if (nums.mins) nums.mins.textContent = String(m).padStart(2, '0');
    if (nums.secs) nums.secs.textContent = String(s).padStart(2, '0');
  };

  tick();
  intervalId = setInterval(tick, 1000);
}
