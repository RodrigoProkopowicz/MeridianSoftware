/**
 * DomHelper.js
 * 
 * Utility functions for DOM manipulation, element creation,
 * and common DOM operations used throughout the application.
 */

/**
 * Creates an HTML element with optional attributes and children.
 * @param {string} tag - HTML tag name
 * @param {Object} [attributes={}] - Key-value pairs for attributes
 * @param {Array<Element|string>} [children=[]] - Child elements or text
 * @returns {Element}
 */
function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);

  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'innerHTML') {
      element.innerHTML = value;
    } else if (key === 'textContent') {
      element.textContent = value;
    } else if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      element.addEventListener(event, value);
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataVal]) => {
        element.dataset[dataKey] = dataVal;
      });
    } else {
      element.setAttribute(key, value);
    }
  });

  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Element) {
      element.appendChild(child);
    }
  });

  return element;
}

/**
 * Body-scroll lock with refcount + scroll-position preservation.
 *
 * Plain `overflow: hidden` on body is unreliable on iOS Safari — touch
 * scroll leaks through to the html element. Using `position: fixed`
 * removes the body from scroll flow entirely, but then you lose the user's
 * scroll position, so we save and restore it.
 *
 * Refcount lets multiple overlays (auth modal + mobile menu + future
 * overlays) nest or overlap without one undoing the other.
 */
let __savedScrollY = 0;
let __lockCount = 0;

export function lockBodyScroll() {
  if (__lockCount === 0) {
    __savedScrollY = window.scrollY;
    document.body.style.top = `-${__savedScrollY}px`;
    document.body.classList.add('scroll-locked');
  }
  __lockCount += 1;
}

export function unlockBodyScroll() {
  __lockCount = Math.max(0, __lockCount - 1);
  if (__lockCount === 0) {
    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    window.scrollTo(0, __savedScrollY);
  }
}

/**
 * Escapes a string for safe insertion into HTML.
 * Use whenever user-provided strings are interpolated into template literals.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Smooth-scrolls to a target element.
 * @param {string} selector - CSS selector of target
 * @param {number} [offset=0] - Pixel offset from top
 */
export function smoothScrollTo(selector, offset = 0) {
  const target = document.querySelector(selector);
  if (!target) return;

  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

/**
 * Shows a toast notification.
 * @param {string} message - Toast message
 * @param {'success'|'error'} [type='success'] - Toast type
 * @param {number} [duration=3500] - Duration in ms
 */
export function showToast(message, type = 'success', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = createElement('div', {
      className: 'toast-container',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      role: 'status',
    });
    document.body.appendChild(container);
  }

  // Errors are assertive so they interrupt the screen reader immediately.
  const toast = createElement('div', {
    className: `toast ${type}`,
    role: type === 'error' ? 'alert' : 'status',
    textContent: message,
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
