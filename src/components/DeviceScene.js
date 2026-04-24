/**
 * DeviceScene.js
 *
 * Renders a laptop + phone illustration surrounded by floating code
 * snippets, behind the hero content. Composed of separately-targetable
 * parts so GSAP can disassemble them on scroll.
 *
 * Positioning + animation: see styles/device-scene.css and
 * animations/DeviceSceneAnimation.js.
 */

/**
 * Fictional but realistic code snippets. Each lives in its own absolutely
 * positioned element so GSAP can stagger-animate them independently.
 */
const CODE_SNIPPETS = [
  { text: 'const api = await fetch(endpoint);',  top: '18%',  left: '8%'  },
  { text: '<Component onClick={handleClick}>',   top: '28%',  left: '78%' },
  { text: 'SELECT * FROM users WHERE id=$1',     top: '68%',  left: '12%' },
  { text: 'function render() {',                 top: '82%',  left: '74%' },
  { text: 'export default',                      top: '12%',  left: '58%' },
  { text: 'import { useState }',                 top: '48%',  left: '2%'  },
  { text: '.then(data => ...)',                  top: '58%',  left: '85%' },
  { text: 'if (user) return next();',            top: '88%',  left: '32%' },
  { text: 'docker run -d',                       top: '22%',  left: '38%' },
  { text: 'yarn build --prod',                   top: '72%',  left: '52%' },
  { text: '</>',                                 top: '8%',   left: '18%' },
  { text: '{}',                                  top: '38%',  left: '92%' },
];

/**
 * Renders the device scene HTML.
 * @returns {string}
 */
export function renderDeviceScene() {
  const snippetsHTML = CODE_SNIPPETS
    .map((s, i) => `
      <span class="device-scene__code"
            data-code-index="${i}"
            style="top: ${s.top}; left: ${s.left};"
            aria-hidden="true">${s.text}</span>
    `)
    .join('');

  return `
    <div class="device-scene" aria-hidden="true">
      <svg class="device-scene__devices"
           viewBox="0 0 1700 500"
           preserveAspectRatio="xMidYMid meet"
           xmlns="http://www.w3.org/2000/svg">

        <!-- ================== LAPTOP (left) ================== -->
        <g class="device-scene__laptop" data-device="laptop">
          <!-- Keyboard base -->
          <path class="device-scene__part"
                data-part="laptop-base"
                d="M 130 360 L 550 360 L 590 390 L 90 390 Z"
                fill="url(#baseGradient)"
                stroke="rgba(232,220,200,0.12)"
                stroke-width="1"/>

          <!-- Trackpad -->
          <rect class="device-scene__part"
                data-part="laptop-trackpad"
                x="300" y="368" width="80" height="14" rx="2"
                fill="rgba(232,220,200,0.06)"
                stroke="rgba(232,220,200,0.1)"
                stroke-width="0.5"/>

          <!-- Screen frame -->
          <rect class="device-scene__part"
                data-part="laptop-frame"
                x="140" y="100" width="400" height="260" rx="10"
                fill="url(#frameGradient)"
                stroke="rgba(232,220,200,0.15)"
                stroke-width="1.5"/>

          <!-- Screen inset -->
          <rect class="device-scene__part"
                data-part="laptop-screen"
                x="156" y="116" width="368" height="228" rx="4"
                fill="#0a1520"/>

          <!-- Screen content — code lines -->
          <g class="device-scene__part" data-part="laptop-code" opacity="0.85">
            <rect x="172" y="132" width="60"  height="3" rx="1" fill="#4A90D9"/>
            <rect x="240" y="132" width="100" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="172" y="146" width="140" height="3" rx="1" fill="#6BB5FF"/>
            <rect x="172" y="160" width="80"  height="3" rx="1" fill="#4ADE80"/>
            <rect x="260" y="160" width="120" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="188" y="174" width="200" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="188" y="188" width="100" height="3" rx="1" fill="#FBBF24"/>
            <rect x="172" y="202" width="50"  height="3" rx="1" fill="#4A90D9"/>
            <rect x="230" y="202" width="90"  height="3" rx="1" fill="#E8DCC8"/>
            <rect x="188" y="216" width="170" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="172" y="230" width="60"  height="3" rx="1" fill="#6BB5FF"/>
            <rect x="172" y="280" width="40"  height="3" rx="1" fill="#4ADE80"/>
            <rect x="220" y="280" width="80"  height="3" rx="1" fill="#E8DCC8"/>
            <rect x="172" y="294" width="120" height="3" rx="1" fill="#E8DCC8"/>
          </g>

          <!-- Hinge -->
          <rect class="device-scene__part"
                data-part="laptop-hinge"
                x="260" y="358" width="160" height="4" rx="2"
                fill="rgba(232,220,200,0.12)"/>
        </g>

        <!-- ================== PHONE (right) ================== -->
        <g class="device-scene__phone" data-device="phone">
          <!-- Frame -->
          <rect class="device-scene__part"
                data-part="phone-frame"
                x="1480" y="160" width="130" height="240" rx="22"
                fill="url(#frameGradient)"
                stroke="rgba(232,220,200,0.15)"
                stroke-width="1.5"/>

          <!-- Screen -->
          <rect class="device-scene__part"
                data-part="phone-screen"
                x="1488" y="172" width="114" height="216" rx="16"
                fill="#0a1520"/>

          <!-- Notch -->
          <rect class="device-scene__part"
                data-part="phone-notch"
                x="1520" y="172" width="50" height="10" rx="5"
                fill="#0a1520"
                stroke="rgba(232,220,200,0.2)"
                stroke-width="0.5"/>

          <!-- Phone code lines -->
          <g class="device-scene__part" data-part="phone-code" opacity="0.85">
            <rect x="1500" y="200" width="40" height="3" rx="1" fill="#4A90D9"/>
            <rect x="1500" y="212" width="70" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="1500" y="224" width="60" height="3" rx="1" fill="#6BB5FF"/>
            <rect x="1500" y="236" width="80" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="1500" y="248" width="50" height="3" rx="1" fill="#4ADE80"/>
            <rect x="1500" y="260" width="90" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="1500" y="284" width="60" height="3" rx="1" fill="#FBBF24"/>
            <rect x="1500" y="296" width="80" height="3" rx="1" fill="#E8DCC8"/>
            <rect x="1500" y="308" width="50" height="3" rx="1" fill="#6BB5FF"/>
            <rect x="1500" y="320" width="70" height="3" rx="1" fill="#E8DCC8"/>
          </g>

          <!-- Home indicator -->
          <rect class="device-scene__part"
                data-part="phone-home"
                x="1520" y="378" width="50" height="3" rx="1.5"
                fill="rgba(232,220,200,0.3)"/>
        </g>

        <!-- Gradients reused across parts -->
        <defs>
          <linearGradient id="frameGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stop-color="#243447"/>
            <stop offset="100%" stop-color="#1B2838"/>
          </linearGradient>
          <linearGradient id="baseGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stop-color="#1B2838"/>
            <stop offset="100%" stop-color="#0F1923"/>
          </linearGradient>
        </defs>
      </svg>

      <!-- Floating code snippets (emerge on scroll) -->
      <div class="device-scene__snippets">
        ${snippetsHTML}
      </div>
    </div>
  `;
}
