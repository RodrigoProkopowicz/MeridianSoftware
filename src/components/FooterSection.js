/**
 * FooterSection.js
 * 
 * Site footer with brand info, quick links, and copyright.
 */

/**
 * Renders the footer section HTML.
 * @returns {string}
 */
export function renderFooterSection() {
  const currentYear = new Date().getFullYear();

  return `
    <footer class="footer-section" id="footer">
      <div class="container">
        <div class="footer-section__grid">
          <div class="footer-section__brand">
            <img src="/logo.png" alt="Meridian Software" class="footer-section__brand-logo" decoding="async" loading="lazy" />
            <p class="footer-section__brand-text">
              Construimos excelencia digital con soluciones de software premium.
              Acompañamos empresas en crear experiencias web y móviles de impacto.
            </p>
          </div>

          <div class="footer-section__col">
            <h4 class="footer-section__heading">Productos</h4>
            <nav class="footer-section__links">
              <a href="#products" class="footer-section__link">Stock Manager</a>
              <a href="#products" class="footer-section__link">Medicus</a>
              <a href="#solutions" class="footer-section__link">Aplicaciones móviles</a>
              <a href="#solutions" class="footer-section__link">Software a medida</a>
            </nav>
          </div>

          <div class="footer-section__col">
            <h4 class="footer-section__heading">Empresa</h4>
            <nav class="footer-section__links">
              <a href="#hero" class="footer-section__link">Sobre nosotros</a>
              <a href="#contact" class="footer-section__link">Contacto</a>
              <a href="#demo" class="footer-section__link">Solicitar demo</a>
              <a href="/terms" class="footer-section__link">Términos y Condiciones</a>
              <a href="/privacy" class="footer-section__link">Política de Privacidad</a>
            </nav>
          </div>
        </div>

        <div class="footer-section__bottom">
          <p class="footer-section__copyright">
            &copy; ${currentYear} Meridian Software. Todos los derechos reservados.
          </p>
          <div class="footer-section__social">
            <a class="button-icon" aria-label="LinkedIn" href="https://www.linkedin.com/company/meridian-software-group" target="_blank" rel="noopener noreferrer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a class="button-icon" aria-label="Instagram" href="https://www.instagram.com/meridian.software?igsh=d2p6ZGRpMXRscHB5&utm_source=qr" target="_blank" rel="noopener noreferrer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.069 1.646.069 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.069-4.85.069s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608-.058-1.266-.069-1.646-.069-4.85s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311 1.266-.058 1.646-.069 4.85-.069zM12 0C8.741 0 8.332.014 7.052.072 5.775.13 4.602.402 3.635 1.369 2.668 2.336 2.396 3.509 2.338 4.786 2.28 6.066 2.266 6.475 2.266 9.734v4.532c0 3.259.014 3.668.072 4.948.058 1.277.33 2.45 1.297 3.417.967.967 2.14 1.239 3.417 1.297 1.28.058 1.689.072 4.948.072s3.668-.014 4.948-.072c1.277-.058 2.45-.33 3.417-1.297.967-.967 1.239-2.14 1.297-3.417.058-1.28.072-1.689.072-4.948V9.734c0-3.259-.014-3.668-.072-4.948-.058-1.277-.33-2.45-1.297-3.417C19.398.402 18.225.13 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  `;
}
