#!/usr/bin/env node
/**
 * scripts/preflight-deploy.mjs
 *
 * Guard que corre ANTES de `firebase deploy --only hosting` (wired como
 * predeploy hook en firebase.json, y disponible como `npm run check:deploy`).
 *
 * Atrapa dos clases de error que ya nos costaron caro:
 *
 *  1. BUNDLE ROTO (hard-fail) — buildear sin `.env` deja `%VITE_*%` sin sustituir
 *     o valores `your-...` en el bundle; el sitio sirve 200 pero crashea en el
 *     navegador (pantalla en blanco). Estos checks fallan el deploy.
 *
 *  2. APPS HERMANAS AUSENTES (warn, o fail con --require-subapps) — Hosting
 *     reemplaza el sitio entero en cada deploy. Si `dist/` no tiene
 *     `stock-manager/` ni `medicus/`, deployar deja esas apps en 404. Un build
 *     de Meridian solo (`npm run build`) nunca las incluye — vienen del deploy
 *     combinado desde el repo StockManager. Avisamos fuerte para que sea una
 *     decisión consciente, no un borrado silencioso.
 *
 * Uso:
 *   node scripts/preflight-deploy.mjs                 # warn si faltan subapps
 *   node scripts/preflight-deploy.mjs --require-subapps   # fail si faltan
 *   DIST_DIR=otro node scripts/preflight-deploy.mjs   # apuntar a otro dist (tests)
 *
 * Exit 0 = OK para deployar. Exit 1 = abortar.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.DIST_DIR || 'dist';
const REQUIRE_SUBAPPS =
  process.argv.includes('--require-subapps') || process.env.REQUIRE_SUBAPPS === '1';

const errors = [];
const warnings = [];

/** Lee todos los archivos de un dir (recursivo) que matcheen una extensión. */
function filesByExt(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesByExt(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// ---- 1. dist/ existe ----
if (!existsSync(DIST)) {
  errors.push(`No existe \`${DIST}/\`. Corré \`npm run build\` antes de deployar.`);
}

// ---- 2. Sustituciones de Vite fallidas en los HTML ----
if (existsSync(DIST)) {
  const htmls = filesByExt(DIST, ['.html']).filter((f) => !f.includes('/stock-manager/') && !f.includes('/medicus/'));
  for (const f of htmls) {
    const txt = readFileSync(f, 'utf8');
    const m = txt.match(/%VITE_[A-Z_]+%/g);
    if (m) errors.push(`${f}: placeholders \`%VITE_*%\` sin sustituir (${[...new Set(m)].join(', ')}) — buildeaste sin .env.`);
  }
}

// ---- 3. Bundle JS: key real presente y sin placeholders `your-` ----
const assetsDir = join(DIST, 'assets');
if (existsSync(assetsDir)) {
  const js = filesByExt(assetsDir, ['.js']).map((f) => readFileSync(f, 'utf8'));
  const blob = js.join('\n');
  if (!/AIzaSy[A-Za-z0-9_-]{20,}/.test(blob)) {
    errors.push('No se encontró una Firebase API key real (AIzaSy…) en dist/assets — el bundle no tiene config válida.');
  }
  const placeholder = blob.match(/(apiKey|authDomain|projectId|appId|storageBucket|messagingSenderId)["'`]?:["'`]your-[\w-]+/);
  if (placeholder) {
    errors.push(`Valor placeholder shippeado en el bundle: \`${placeholder[0]}\` — buildeaste sin .env real.`);
  }
} else if (existsSync(DIST)) {
  errors.push(`No existe \`${assetsDir}/\` — el build no produjo assets.`);
}

// ---- 4. Apps hermanas presentes (solo si dist existe) ----
const subapps = ['stock-manager', 'medicus'];
const missing = existsSync(DIST) ? subapps.filter((s) => !existsSync(join(DIST, s, 'index.html'))) : [];
if (missing.length) {
  const msg =
    `Faltan en \`${DIST}/\`: ${missing.join(', ')}. ` +
    `Deployar ahora va a dejar ${missing.map((m) => `/${m}`).join(' y ')} en 404 en el sitio en vivo ` +
    `(el deploy combinado de las 3 apps se hace desde el repo StockManager con \`npm run deploy\`).`;
  if (REQUIRE_SUBAPPS) errors.push(msg);
  else warnings.push(msg);
}

// ---- Reporte ----
const tag = { ok: '\x1b[32m✓\x1b[0m', warn: '\x1b[33m⚠\x1b[0m', err: '\x1b[31m✗\x1b[0m' };
for (const w of warnings) console.log(`${tag.warn}  ${w}`);
for (const e of errors) console.log(`${tag.err}  ${e}`);

if (errors.length) {
  console.log(`\n${tag.err}  preflight-deploy: ${errors.length} error(es) — deploy abortado.`);
  process.exit(1);
}
console.log(`${tag.ok}  preflight-deploy: bundle OK para deployar${warnings.length ? ` (${warnings.length} aviso/s arriba)` : ''}.`);
process.exit(0);
