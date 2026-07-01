#!/usr/bin/env node
/**
 * create-admin-user.mjs
 *
 * Bootstrap script — creates the FIRST email/password admin account. Since the
 * panel's "Crear usuario" requires you to already be an admin, the very first
 * admin has to be created out-of-band with the Admin SDK (which bypasses the
 * "only an admin can create users" check).
 *
 * Creates the Authentication account, sets the `admin` custom claim, and writes
 * the `users/{uid}` profile doc so the account shows up in the panel.
 *
 * Auth: relies on Application Default Credentials:
 *
 *   gcloud auth application-default login
 *   gcloud config set project meridiansoftware-6ae75
 *
 * Then from `functions/`:
 *
 *   npm run create-admin -- --email you@example.com --password 'SomeStrongPass' --name 'Tu Nombre'
 *
 * After this, sign in at /admin with that email + password and use the panel to
 * create every other account.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const args = parseArgs(process.argv.slice(2));

if (!args.email || !args.password) {
  console.error('Usage: create-admin-user.mjs --email <addr> --password <pass> [--name <display name>]');
  process.exit(1);
}
if (args.password.length < 6) {
  console.error('La contraseña debe tener al menos 6 caracteres.');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'meridiansoftware-6ae75',
});

const auth = getAuth();
const db = getFirestore();

// 1. Crear (o reutilizar) la cuenta de Authentication.
let user;
try {
  user = await auth.createUser({
    email: args.email,
    password: args.password,
    displayName: args.name || undefined,
    emailVerified: true,
  });
  console.log(`Created auth account for ${user.email} (uid=${user.uid}).`);
} catch (err) {
  if (err.code === 'auth/email-already-exists') {
    user = await auth.getUserByEmail(args.email);
    await auth.updateUser(user.uid, { password: args.password });
    console.log(`Account already existed — reset password for ${user.email} (uid=${user.uid}).`);
  } else {
    throw err;
  }
}

// 2. Claim admin.
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });

// 3. Perfil en Firestore.
await db.collection('users').doc(user.uid).set(
  {
    email: args.email,
    displayName: args.name || user.displayName || '',
    photoURL: '',
    provider: 'password',
    admin: true,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);

console.log(`Granted admin + wrote profile for ${args.email}.`);
console.log('Iniciá sesión en /admin con ese email y contraseña.');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--email') out.email = argv[++i];
    else if (flag === '--password') out.password = argv[++i];
    else if (flag === '--name') out.name = argv[++i];
  }
  return out;
}
