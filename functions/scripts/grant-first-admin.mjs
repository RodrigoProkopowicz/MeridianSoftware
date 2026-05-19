#!/usr/bin/env node
/**
 * grant-first-admin.mjs
 *
 * Bootstrap script — promotes a user to admin by setting the `admin` custom
 * claim with the Admin SDK. The Admin SDK bypasses the "only admin can grant
 * admin" check in the setAdminClaim Cloud Function, so this is the only path
 * for the very first admin. After that, use the panel.
 *
 * Auth: relies on Application Default Credentials. The simplest path is:
 *
 *   gcloud auth application-default login
 *   gcloud config set project meridiansoftware-6ae75
 *
 * Then from `functions/`:
 *
 *   npm run grant-admin -- --email you@example.com
 *   npm run grant-admin -- --uid <firebase-uid>
 *   npm run grant-admin -- --email you@example.com --revoke
 *
 * The target user must already have signed in once on the marketing site
 * (Google or Apple), so their Firebase Auth record exists.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const args = parseArgs(process.argv.slice(2));

if (!args.email && !args.uid) {
  console.error('Usage: grant-first-admin.mjs --email <addr> | --uid <uid> [--revoke]');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'meridiansoftware-6ae75',
});

const auth = getAuth();
const grant = !args.revoke;

const user = args.uid
  ? await auth.getUser(args.uid)
  : await auth.getUserByEmail(args.email);

const nextClaims = { ...(user.customClaims || {}) };
if (grant) {
  nextClaims.admin = true;
} else {
  delete nextClaims.admin;
}

await auth.setCustomUserClaims(user.uid, nextClaims);

console.log(
  `${grant ? 'Granted' : 'Revoked'} admin for ${user.email || user.uid} (uid=${user.uid}).`
);
console.log('The user must sign out and back in (or wait ~1h) for the claim to refresh client-side.');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--email') out.email = argv[++i];
    else if (flag === '--uid') out.uid = argv[++i];
    else if (flag === '--revoke') out.revoke = true;
  }
  return out;
}
