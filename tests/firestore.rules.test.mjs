/**
 * tests/firestore.rules.test.mjs
 *
 * Tests de las reglas de Firestore (firestore.rules) con el emulador.
 * Cubren las invariantes de seguridad críticas: aislamiento entre owners,
 * gating de admin, cap del demo self-service, pagos server-only, secretos
 * cerrados, inmutabilidad de historia clínica y default-deny.
 *
 * Correr:  npm run test:rules   (arranca el emulador de Firestore vía
 *          `firebase emulators:exec` — requiere Java en el PATH).
 *
 * Modelo de admin: usamos el custom claim `admin: true` (la fuente de verdad
 * unificada). El claim es la vía que honran tanto las rules como los callables.
 */

import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach, describe } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, Timestamp, setLogLevel,
} from 'firebase/firestore';

setLogLevel('error'); // silenciar el ruido de "permission denied" esperado

const DAY = 24 * 60 * 60 * 1000;
let testEnv;

// Helpers de contexto
const owner = (uid = 'alice') => testEnv.authenticatedContext(uid).firestore();
const other = (uid = 'mallory') => testEnv.authenticatedContext(uid).firestore();
const admin = (uid = 'root') => testEnv.authenticatedContext(uid, { admin: true }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

/** Siembra datos saltándose las reglas. */
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

const validUserDoc = {
  email: 'alice@example.com',
  displayName: 'Alice',
  photoURL: 'https://x/a.png',
  provider: 'google.com',
  createdAt: Timestamp.now(),
  lastLoginAt: Timestamp.now(),
};

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-meridian',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ============================================================
describe('users/{uid}', () => {
  test('owner lee su propio perfil; otro y anónimo no', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice'), validUserDoc));
    await assertSucceeds(getDoc(doc(owner('alice'), 'users/alice')));
    await assertFails(getDoc(doc(other('mallory'), 'users/alice')));
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });

  test('admin lee cualquier perfil', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice'), validUserDoc));
    await assertSucceeds(getDoc(doc(admin(), 'users/alice')));
  });

  test('owner crea su perfil con campos válidos', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'users/alice'), validUserDoc));
  });

  test('owner NO puede crear con un campo fuera del whitelist', async () => {
    await assertFails(
      setDoc(doc(owner('alice'), 'users/alice'), { ...validUserDoc, role: 'admin' }),
    );
  });

  test('owner NO puede crear el perfil de otro uid', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'users/bob'), validUserDoc));
  });

  test('owner actualiza su perfil pero NO puede setear role=admin', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice'), validUserDoc));
    await assertSucceeds(
      updateDoc(doc(owner('alice'), 'users/alice'), { displayName: 'Alice 2' }),
    );
    await assertFails(
      updateDoc(doc(owner('alice'), 'users/alice'), { role: 'admin' }),
    );
  });

  test('nadie puede borrar un perfil (ni el owner)', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice'), validUserDoc));
    await assertFails(deleteDoc(doc(owner('alice'), 'users/alice')));
    await assertFails(deleteDoc(doc(admin(), 'users/alice')));
  });
});

// ============================================================
describe('users/{uid}/demoAccess/{productId}', () => {
  const demoDoc = (expiresInMs) => ({
    productId: 'stock-manager',
    grantedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + expiresInMs),
    status: 'active',
  });

  test('owner NO puede crear un demo (ya no hay auto-servicio: admin-only)', async () => {
    await assertFails(
      setDoc(doc(owner('alice'), 'users/alice/demoAccess/stock-manager'), demoDoc(6 * DAY)),
    );
  });

  test('admin crea un demo (sin cap de días)', async () => {
    await assertSucceeds(
      setDoc(doc(admin(), 'users/alice/demoAccess/stock-manager'), demoDoc(30 * DAY)),
    );
  });

  test('owner NO puede modificar su propio demo (inmutable client-side)', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice/demoAccess/stock-manager'), demoDoc(6 * DAY)));
    await assertFails(
      updateDoc(doc(owner('alice'), 'users/alice/demoAccess/stock-manager'), {
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY),
      }),
    );
  });

  test('admin extiende/borra un demo sin cap', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice/demoAccess/stock-manager'), demoDoc(6 * DAY)));
    await assertSucceeds(
      updateDoc(doc(admin(), 'users/alice/demoAccess/stock-manager'), {
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY),
      }),
    );
    await assertSucceeds(deleteDoc(doc(admin(), 'users/alice/demoAccess/stock-manager')));
  });

  test('owner lee su propio demo; otro usuario no', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice/demoAccess/stock-manager'), demoDoc(6 * DAY)));
    await assertSucceeds(getDoc(doc(owner('alice'), 'users/alice/demoAccess/stock-manager')));
    await assertFails(getDoc(doc(other('mallory'), 'users/alice/demoAccess/stock-manager')));
  });
});

// ============================================================
describe('demoRequests/{id}', () => {
  const reqDoc = (overrides = {}) => ({
    name: 'Alice Cliente',
    email: 'alice@example.com',
    companyName: 'ACME',
    solutionType: 'stock-manager',
    message: 'hola',
    status: 'pending',
    recaptchaToken: 'tok',
    createdAt: Timestamp.now(),
    ...overrides,
  });

  test('un visitante anónimo crea un pedido válido (formulario público)', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'demoRequests/r1'), reqDoc()));
  });

  test('un usuario logueado también puede crear', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'demoRequests/r2'), reqDoc()));
  });

  test('NO puede crear sin name o email', async () => {
    await assertFails(setDoc(doc(anon(), 'demoRequests/r1'), reqDoc({ name: '' })));
    await assertFails(setDoc(doc(anon(), 'demoRequests/r2'), reqDoc({ email: '' })));
  });

  test('NO puede crear con status != pending', async () => {
    await assertFails(setDoc(doc(anon(), 'demoRequests/r1'), reqDoc({ status: 'approved' })));
  });

  test('NO puede crear con un campo fuera del whitelist (ej. userId)', async () => {
    await assertFails(setDoc(doc(anon(), 'demoRequests/r1'), reqDoc({ userId: 'alice' })));
  });

  test('solo admin lista/lee; admin puede cambiar status', async () => {
    await seed((db) => setDoc(doc(db, 'demoRequests/r1'), reqDoc()));
    await assertFails(getDocs(collection(owner('alice'), 'demoRequests')));
    await assertSucceeds(getDocs(collection(admin(), 'demoRequests')));
    await assertSucceeds(updateDoc(doc(admin(), 'demoRequests/r1'), { status: 'contacted' }));
  });
});

// ============================================================
describe('promotionalSubscriptions/{id}', () => {
  const subDoc = (paymentStatus = 'pending') => ({
    userId: 'alice',
    businessName: 'ACME',
    paymentStatus,
    workStatus: 'no_iniciado',
    amount: 6499,
    currency: 'ARS',
    adminNotes: '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  test('el cliente NO puede crear (server-only)', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'promotionalSubscriptions/s1'), subDoc()));
  });

  test('no-admin no lee; admin sí', async () => {
    await seed((db) => setDoc(doc(db, 'promotionalSubscriptions/s1'), subDoc()));
    await assertFails(getDoc(doc(owner('alice'), 'promotionalSubscriptions/s1')));
    await assertSucceeds(getDoc(doc(admin(), 'promotionalSubscriptions/s1')));
  });

  test('admin edita solo workStatus/adminNotes/updatedAt; NO paymentStatus', async () => {
    await seed((db) => setDoc(doc(db, 'promotionalSubscriptions/s1'), subDoc()));
    await assertSucceeds(
      updateDoc(doc(admin(), 'promotionalSubscriptions/s1'), {
        workStatus: 'en_progreso',
        adminNotes: 'arrancamos',
        updatedAt: Timestamp.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(admin(), 'promotionalSubscriptions/s1'), { paymentStatus: 'authorized' }),
    );
  });

  test('admin borra solo error/cancelled; NO activas', async () => {
    await seed((db) => setDoc(doc(db, 'promotionalSubscriptions/cancel'), subDoc('cancelled')));
    await seed((db) => setDoc(doc(db, 'promotionalSubscriptions/live'), subDoc('authorized')));
    await assertSucceeds(deleteDoc(doc(admin(), 'promotionalSubscriptions/cancel')));
    await assertFails(deleteDoc(doc(admin(), 'promotionalSubscriptions/live')));
  });
});

// ============================================================
describe('businesses/{id}/secrets — cerrado a todos', () => {
  test('ni el owner ni el admin pueden leer/escribir secrets', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      await setDoc(doc(db, 'businesses/b1/secrets/afip'), { cert: 'x' });
    });
    await assertFails(getDoc(doc(owner('alice'), 'businesses/b1/secrets/afip')));
    await assertFails(getDoc(doc(admin(), 'businesses/b1/secrets/afip')));
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/secrets/afip'), { cert: 'y' }));
  });
});

// ============================================================
describe('businesses/{id}/remitos — Stock Manager', () => {
  const remito = (over = {}) => ({
    number: '0001-00000001',
    numberInt: 1,
    pointOfSale: '0001',
    status: 'issued',
    issuedAt: Timestamp.now(),
    lineItems: [{ description: 'Cajas', quantity: 3, unit: 'un', unitPrice: 0, total: 0 }],
    totalQuantity: 3,
    subtotal: 0,
    userId: 'alice',
    ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
    });
  });

  test('el owner emite un remito; otro usuario y anónimo no', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'businesses/b1/remitos/r1'), remito()));
    await assertFails(setDoc(doc(other('mallory'), 'businesses/b1/remitos/r2'), remito({ userId: 'mallory' })));
    await assertFails(setDoc(doc(anon(), 'businesses/b1/remitos/r3'), remito()));
  });

  test('el userId del remito tiene que ser el del emisor', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/remitos/r1'), remito({ userId: 'mallory' })));
  });

  test('solo el owner (y el admin) leen los remitos del comercio', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/remitos/r1'), remito()));
    await assertSucceeds(getDoc(doc(owner('alice'), 'businesses/b1/remitos/r1')));
    await assertSucceeds(getDoc(doc(admin(), 'businesses/b1/remitos/r1')));
    await assertFails(getDoc(doc(other('mallory'), 'businesses/b1/remitos/r1')));
    await assertFails(getDoc(doc(anon(), 'businesses/b1/remitos/r1')));
  });

  test('anular sí, reescribir número o cantidades no', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/remitos/r1'), remito()));

    await assertSucceeds(updateDoc(doc(owner('alice'), 'businesses/b1/remitos/r1'), {
      status: 'cancelled',
      cancelReason: 'Error de carga',
      stockReversed: true,
    }));
    await assertFails(updateDoc(doc(owner('alice'), 'businesses/b1/remitos/r1'), { number: '0001-00009999' }));
    await assertFails(updateDoc(doc(owner('alice'), 'businesses/b1/remitos/r1'), { totalQuantity: 999 }));
    await assertFails(updateDoc(doc(owner('alice'), 'businesses/b1/remitos/r1'), { subtotal: 999 }));
  });

  test('el owner no puede borrar remitos; el admin sí', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/remitos/r1'), remito()));
    await assertFails(deleteDoc(doc(owner('alice'), 'businesses/b1/remitos/r1')));
    await assertSucceeds(deleteDoc(doc(admin(), 'businesses/b1/remitos/r1')));
  });

  test('el counter de remitos es del owner, cerrado para terceros', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'businesses/b1/counters/remitos'), {
      next: 2, updatedAt: Timestamp.now(),
    }));
    await assertFails(setDoc(doc(other('mallory'), 'businesses/b1/counters/remitos'), { next: 99 }));
  });
});

// ============================================================
describe('clinics/{id}/patients — Medicus (HC)', () => {
  test('owner lee su paciente; otro no', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'clinics/c1'), { ownerId: 'alice', name: 'Clínica' });
      await setDoc(doc(db, 'clinics/c1/patients/p1'), {
        firstName: 'Juan', lastName: 'Perez', createdBy: 'alice', createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(getDoc(doc(owner('alice'), 'clinics/c1/patients/p1')));
    await assertFails(getDoc(doc(other('mallory'), 'clinics/c1/patients/p1')));
  });

  test('hard-delete de paciente prohibido (solo soft-delete)', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'clinics/c1'), { ownerId: 'alice', name: 'Clínica' });
      await setDoc(doc(db, 'clinics/c1/patients/p1'), {
        firstName: 'Juan', lastName: 'Perez', createdBy: 'alice', createdAt: Timestamp.now(),
      });
    });
    await assertFails(deleteDoc(doc(owner('alice'), 'clinics/c1/patients/p1')));
  });
});

// ============================================================
describe('isAdmin — unificado en el custom claim', () => {
  test('role==admin SIN el claim NO otorga acceso de admin', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/roleonly'), { ...validUserDoc, role: 'admin' });
      await setDoc(doc(db, 'users/victima'), validUserDoc);
    });
    // Autenticado, con role=='admin' en su doc, pero SIN el custom claim:
    const roleOnly = testEnv.authenticatedContext('roleonly').firestore();
    await assertFails(getDoc(doc(roleOnly, 'users/victima')));
  });

  test('el custom claim admin SÍ otorga acceso', async () => {
    await seed((db) => setDoc(doc(db, 'users/victima'), validUserDoc));
    await assertSucceeds(getDoc(doc(admin(), 'users/victima')));
  });
});

// ============================================================
describe('default deny', () => {
  test('una colección no contemplada está cerrada para todos', async () => {
    await assertFails(getDoc(doc(owner('alice'), 'randomCollection/x')));
    await assertFails(setDoc(doc(admin(), 'randomCollection/x'), { a: 1 }));
    await assertFails(getDoc(doc(anon(), 'randomCollection/x')));
  });
});
