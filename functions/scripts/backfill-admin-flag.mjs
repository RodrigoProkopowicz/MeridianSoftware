#!/usr/bin/env node
/**
 * backfill-admin-flag.mjs
 *
 * Recorre los docs existentes de `users/{uid}` y escribe el campo `admin`
 * (booleano) según el custom claim real de Authentication. Es un mirror
 * one-time: a partir de ahora `setAdminClaim` mantiene el campo sincronizado.
 *
 * El panel admin usa este campo para saber quién es admin (los custom claims
 * no se pueden consultar desde el cliente). `admin` es independiente de `role`
 * (que es el super-admin de Stock Manager).
 *
 * Solo TOCA docs que ya existen — no crea docs nuevos.
 *
 * Uso:  node functions/scripts/backfill-admin-flag.mjs
 * Auth: service-account.json en este mismo folder.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const saPath = resolve(__dirname, 'service-account.json');
if (!existsSync(saPath)) {
  console.error(`Falta el service account: ${saPath}`);
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });

const auth = getAuth();
const db = getFirestore();

const snap = await db.collection('users').get();
let total = 0;
let admins = 0;
for (const docSnap of snap.docs) {
  let isAdmin = false;
  try {
    const u = await auth.getUser(docSnap.id);
    isAdmin = u.customClaims?.admin === true;
  } catch (_) {
    // El usuario de Auth puede no existir (doc huérfano): lo dejamos en false.
  }
  await docSnap.ref.set({ admin: isAdmin }, { merge: true });
  total++;
  if (isAdmin) admins++;
}

console.log(`Backfill OK: ${total} docs procesados, ${admins} admin(s).`);
process.exit(0);
