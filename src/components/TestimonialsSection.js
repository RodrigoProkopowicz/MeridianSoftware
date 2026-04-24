/**
 * TestimonialsSection.js
 *
 * Auto-advancing carousel of testimonials with dot navigation, keyboard
 * support (arrow keys), and pause-on-hover.
 *
 * Psychology: social proof + liking bias. Named quotes with roles outperform
 * anonymous quotes. Photos (or initial-based avatars as a fallback) make
 * the voice feel human rather than manufactured.
 *
 * TODO — replace TESTIMONIALS with real customer quotes (with permission).
 */

const TESTIMONIALS = [
  {
    quote: "Meridian shipped our rebuild in ten weeks. The team handled the ambiguous parts without hand-holding — we finally have a partner that thinks about our product, not just the ticket.",
    author: 'Sofía Reyes',
    role: 'VP Engineering',
    company: 'Helix Retail',
  },
  {
    quote: "They replaced our offshore agency mid-project. Within a month our staging environment was faster, our tests actually ran, and the roadmap was realistic for the first time.",
    author: 'Marcus Tanaka',
    role: 'CTO',
    company: 'Kepler Finance',
  },
  {
    quote: "The engineering quality is the headline, but the communication is what made it stick. Weekly demos, honest estimates, clean PRs. I'd hire them again tomorrow.",
    author: 'Priya Nair',
    role: 'Head of Product',
    company: 'Orbit Health',
  },
  {
    quote: "We went from a three-month backlog to shipping weekly. Meridian didn't rewrite our codebase — they made it boring in all the right ways.",
    author: 'James Okafor',
    role: 'Founder',
    company: 'Vantage Studio',
  },
];

const AUTOPLAY_MS = 7000;

/**
 * Renders the testimonials section HTML.
 * @returns {string}
 */
export function renderTestimonialsSection() {
  const slidesHTML = TESTIMONIALS
    .map((t, i) => renderSlide(t, i))
    .join('');

  const dotsHTML = TESTIMONIALS
    .map((_, i) => `
      <button class="testimonials__dot ${i === 0 ? 'active' : ''}"
              data-slide="${i}"
              aria-label="Testimonial ${i + 1} of ${TESTIMONIALS.length}"></button>
    `)
    .join('');

  return `
    <section class="testimonials section" id="testimonials" aria-label="Client testimonials">
      <div class="container">
        <div class="section-header">
          <span class="section-label">What clients say</span>
          <h2 class="section-title">Built on trust, measured in outcomes</h2>
        </div>

        <div class="testimonials__carousel"
             id="testimonials-carousel"
             tabindex="0"
             aria-roledescription="carousel"
             aria-live="polite">
          <div class="testimonials__track" id="testimonials-track">
            ${slidesHTML}
          </div>

          <button class="testimonials__nav testimonials__nav--prev" id="testimonials-prev" aria-label="Previous testimonial">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button class="testimonials__nav testimonials__nav--next" id="testimonials-next" aria-label="Next testimonial">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <div class="testimonials__dots" role="tablist">
          ${dotsHTML}
        </div>
      </div>
    </section>
  `;
}

function renderSlide(t, i) {
  const initial = (t.author[0] || '?').toUpperCase();
  return `
    <article class="testimonial glass-card ${i === 0 ? 'active' : ''}"
             data-slide="${i}"
             aria-hidden="${i === 0 ? 'false' : 'true'}">
      <div class="testimonial__quote-mark" aria-hidden="true">“</div>
      <blockquote class="testimonial__quote">${t.quote}</blockquote>
      <div class="testimonial__author">
        <div class="testimonial__avatar" aria-hidden="true">${initial}</div>
        <div class="testimonial__meta">
          <div class="testimonial__name">${t.author}</div>
          <div class="testimonial__role">${t.role} · ${t.company}</div>
        </div>
      </div>
    </article>
  `;
}

/**
 * Initializes the carousel: autoplay, dot nav, prev/next buttons,
 * keyboard, and pause-on-hover.
 */
export function initTestimonialsSection() {
  const track = document.getElementById('testimonials-track');
  const carousel = document.getElementById('testimonials-carousel');
  if (!track || !carousel) return;

  const slides = track.querySelectorAll('.testimonial');
  const dots = document.querySelectorAll('.testimonials__dot');
  const prevBtn = document.getElementById('testimonials-prev');
  const nextBtn = document.getElementById('testimonials-next');
  const total = slides.length;
  let current = 0;
  let autoplayTimer = null;
  let paused = false;

  const goTo = (index) => {
    current = (index + total) % total;
    slides.forEach((s, i) => {
      const active = i === current;
      s.classList.toggle('active', active);
      s.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  };

  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  const startAutoplay = () => {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = setInterval(() => {
      if (!paused) next();
    }, AUTOPLAY_MS);
  };

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      goTo(parseInt(dot.dataset.slide, 10));
      startAutoplay();
    });
  });

  if (nextBtn) nextBtn.addEventListener('click', () => { next(); startAutoplay(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); startAutoplay(); });

  carousel.addEventListener('mouseenter', () => { paused = true; });
  carousel.addEventListener('mouseleave', () => { paused = false; });
  carousel.addEventListener('focusin', () => { paused = true; });
  carousel.addEventListener('focusout', () => { paused = false; });

  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); startAutoplay(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); startAutoplay(); }
  });

  // ---- Swipe gestures (touch) ----
  // Horizontal swipes call prev/next. Vertical-dominant gestures are ignored
  // so scrolling the page still works when the user drags through the carousel.
  const SWIPE_THRESHOLD = 40;
  let touchStartX = 0;
  let touchStartY = 0;
  carousel.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical dominance — let scroll through
    if (dx < 0) next(); else prev();
    startAutoplay();
  }, { passive: true });

  // Respect reduced motion — skip autoplay
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) startAutoplay();
}
