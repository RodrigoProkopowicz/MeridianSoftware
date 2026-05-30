#!/usr/bin/env node
/**
 * migrate-admin-to-claim.mjs
 *
 * Unifica el modelo de admin en el custom claim `admin`. firestore.rules pasó
 * a aceptar SOLO el claim (antes también `users/{uid}.role == 'admin'`). Antes
 * de deployar esas rules hay que asegurar que todo admin que hoy sea "role-only"
 * tenga también el claim — si no, pierde el acceso a Firestore.
 *
 * Dry-run por defecto (solo reporta). Con --apply otorga el claim a los
 * role-only admins encontrados (y espeja `users/{uid}.admin = true`, igual que
 * la callable setAdminClaim).
 *
 * Uso:
 *   node functions/scripts/migrate-admin-to-claim.mjs           # reporte (dry-run)
 *   node functions/scripts/migrate-admin-to-claim.mjs --apply   # migra
 *
 * Requiere functions/scripts/service-account.json (gitignored).
 * Exit 0 = seguro deployar las rules claim-only. Exit 1 = hay pendientes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const serviceAccount = JSON.parse(readFileSync(join(here, 'service-account.json'), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const auth = getAuth();

const snap = await db.collection('users').where('role', '==', 'admin').get();
console.log(`Usuarios con role=='admin': ${snap.size}\n`);

const pending = [];
for (const docSnap of snap.docs) {
  const uid = docSnap.id;
  const email = docSnap.data().email || '(sin email)';
  let hasClaim;
  try {
    const user = await auth.getUser(uid);
    hasClaim = user.customClaims?.admin === true;
  } catch (err) {
    console.warn(`  ? ${email} (${uid}) — no se pudo leer la cuenta Auth (${err.code || err.message})`);
    continue;
  }
  if (hasClaim) {
    console.log(`  ✓ ${email} (${uid}) — ya tiene el claim`);
  } else {
    console.log(`  ⚠ ${email} (${uid}) — role-only: PERDERÍA acceso si se deploya sin migrar`);
    pending.push(uid);
  }
}

if (pending.length === 0) {
  console.log('\n✓ Todos los admins por role ya tienen el claim. Es seguro deployar las rules claim-only.');
  process.exit(0);
}

if (!APPLY) {
  console.log(`\n⚠ ${pending.length} usuario(s) necesitan migración. Volvé a correr con --apply para otorgarles el claim.`);
  process.exit(1);
}

for (const uid of pending) {
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
  await db.collection('users').doc(uid).set({ admin: true }, { merge: true });
  console.log(`  → migrado: ${uid}`);
}
console.log('\n✓ Migración completa. Ahora es seguro deployar las rules claim-only.');
process.exit(0);
