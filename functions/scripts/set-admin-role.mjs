#!/usr/bin/env node
/**
 * set-admin-role.mjs
 *
 * Setea o quita el campo `role` en `users/{uid}` de Firestore. Es la única
 * forma soportada de promover un super-admin de Stock Manager — no hay UI
 * para esto (por diseño: reducir superficie de privilege escalation).
 *
 * Auth:
 *   El script intenta cargar credenciales en este orden:
 *     1. Argumento `--service-account=/path/to/sa.json`
 *     2. Env var GOOGLE_APPLICATION_CREDENTIALS
 *     3. `service-account.json` en el mismo folder que este script
 *     4. Application Default Credentials (si tenés `gcloud auth`)
 *
 *   Para descargar un service account JSON:
 *     Firebase Console → Project Settings → Service Accounts →
 *     "Generate new private key" → guardalo en
 *     `MeridianSoftware/functions/scripts/service-account.json`
 *     (ese path está ya en .gitignore).
 *
 * Uso:
 *   node set-admin-role.mjs <uid>                     # promueve a admin
 *   node set-admin-role.mjs <uid> admin               # idem (explícito)
 *   node set-admin-role.mjs <uid> --remove            # quita el role
 *   node set-admin-role.mjs <uid> --service-account=/path/to/sa.json
 *
 * Ejemplos:
 *   node set-admin-role.mjs UQ5NPqBZ23SmSSDfdyuFVVxkitH2
 *   node set-admin-role.mjs UQ5NPqBZ23SmSSDfdyuFVVxkitH2 --remove
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Parse args ----
const args = process.argv.slice(2);
const positional = [];
const flags = {};
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [k, v] = arg.slice(2).split('=');
    flags[k] = v === undefined ? true : v;
  } else {
    positional.push(arg);
  }
}

const uid = positional[0];
const remove = !!flags.remove;
const role = remove ? null : (positional[1] || 'admin');

if (!uid || flags.help) {
  console.error('Uso:');
  console.error('  node set-admin-role.mjs <uid>           # promueve a admin');
  console.error('  node set-admin-role.mjs <uid> <role>    # setea role custom');
  console.error('  node set-admin-role.mjs <uid> --remove  # quita el role');
  console.error('');
  console.error('Service account: --service-account=/path/to/sa.json');
  console.error('                 o GOOGLE_APPLICATION_CREDENTIALS env');
  console.error('                 o service-account.json en este folder');
  process.exit(1);
}

// ---- Resolve credentials ----
function resolveCredential() {
  // 1. Explicit flag
  if (flags['service-account']) {
    const p = resolve(flags['service-account']);
    if (!existsSync(p)) throw new Error(`Service account no existe: ${p}`);
    const json = JSON.parse(readFileSync(p, 'utf-8'));
    return { credential: cert(json), source: `flag (${p})`, projectId: json.project_id };
  }
  // 2. GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (existsSync(p)) {
      const json = JSON.parse(readFileSync(p, 'utf-8'));
      return { credential: cert(json), source: 'GOOGLE_APPLICATION_CREDENTIALS', projectId: json.project_id };
    }
  }
  // 3. Local service-account.json
  const localPath = resolve(__dirname, 'service-account.json');
  if (existsSync(localPath)) {
    const json = JSON.parse(readFileSync(localPath, 'utf-8'));
    return { credential: cert(json), source: `local (${localPath})`, projectId: json.project_id };
  }
  // 4. Application Default Credentials
  return { credential: applicationDefault(), source: 'ADC', projectId: undefined };
}

let creds;
try {
  creds = resolveCredential();
} catch (err) {
  console.error('No pudimos resolver credenciales:', err.message);
  console.error('');
  console.error('Descargá un service account JSON:');
  console.error('  Firebase Console → Project Settings → Service Accounts');
  console.error('  → "Generate new private key" → guardalo como');
  console.error(`  ${resolve(__dirname, 'service-account.json')}`);
  process.exit(2);
}

console.log(`Auth: ${creds.source}${creds.projectId ? ` (project: ${creds.projectId})` : ''}`);

// ---- Initialize admin SDK ----
initializeApp({
  credential: creds.credential,
  projectId: creds.projectId,
});

const db = getFirestore();

// ---- Apply ----
const userRef = db.collection('users').doc(uid);
const snap = await userRef.get();
if (!snap.exists) {
  console.error(`Usuario no encontrado en users/${uid}.`);
  console.error('El doc lo crea meridian-software.com al primer login. Asegurate de haber logueado al menos una vez con esa cuenta antes de promoverla.');
  process.exit(3);
}

const before = snap.data().role || null;

if (remove) {
  await userRef.update({ role: FieldValue.delete() });
  console.log(`✓ users/${uid}: role removido (antes: ${before || '(ninguno)'})`);
} else {
  await userRef.set({ role }, { merge: true });
  console.log(`✓ users/${uid}: role = "${role}" (antes: ${before || '(ninguno)'})`);
}

// Mostrar info del user para confirmar visualmente
const user = snap.data();
console.log(`  displayName: ${user.displayName || '(sin nombre)'}`);
console.log(`  email:       ${user.email || '(sin email)'}`);

process.exit(0);
