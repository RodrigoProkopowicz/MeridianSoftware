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
  collection, getDocs, query, where, writeBatch, runTransaction,
  Timestamp, serverTimestamp, setLogLevel,
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
describe('businesses/{id}/creditNotes y priceLists — Stock Manager', () => {
  const nota = (over = {}) => ({
    number: '0001-00000001',
    numberInt: 1,
    status: 'issued',
    issuedAt: Timestamp.now(),
    sourceKind: 'invoice',
    sourceId: 'inv-1',
    sourceNumber: '0001-00000009',
    clientId: 'cli-1',
    lineItems: [{ sourceIndex: 0, description: 'Café', quantity: 1, unitPrice: 1000, total: 1000 }],
    total: 1000,
    userId: 'alice',
    ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
    });
  });

  test('el owner emite la devolución; otro usuario no', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'businesses/b1/creditNotes/n1'), nota()));
    await assertFails(setDoc(doc(other('mallory'), 'businesses/b1/creditNotes/n2'), nota({ userId: 'mallory' })));
    await assertFails(setDoc(doc(anon(), 'businesses/b1/creditNotes/n3'), nota()));
  });

  test('la nota queda firmada por quien la emite', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/creditNotes/n1'), nota({ userId: 'mallory' })));
  });

  test('anular sí, reescribir importe u origen no', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/creditNotes/n1'), nota()));

    await assertSucceeds(updateDoc(doc(owner('alice'), 'businesses/b1/creditNotes/n1'), {
      status: 'cancelled', cancelReason: 'Error de carga',
    }));
    await assertFails(updateDoc(doc(owner('alice'), 'businesses/b1/creditNotes/n1'), { total: 99999 }));
    await assertFails(updateDoc(doc(owner('alice'), 'businesses/b1/creditNotes/n1'), { sourceId: 'otro' }));
  });

  test('el owner no borra devoluciones; el admin sí', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/creditNotes/n1'), nota()));
    await assertFails(deleteDoc(doc(owner('alice'), 'businesses/b1/creditNotes/n1')));
    await assertSucceeds(deleteDoc(doc(admin(), 'businesses/b1/creditNotes/n1')));
  });

  test('las listas de precios las administra el dueño y las lee su equipo', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'businesses/b1/priceLists/l1'), {
      name: 'Mayorista', adjustPercent: -15, active: true,
    }));
    await assertFails(setDoc(doc(other('mallory'), 'businesses/b1/priceLists/l2'), {
      name: 'Trucha', adjustPercent: -90, active: true,
    }));
    await assertSucceeds(getDoc(doc(owner('alice'), 'businesses/b1/priceLists/l1')));
    await assertFails(getDoc(doc(other('mallory'), 'businesses/b1/priceLists/l1')));
  });

  test('una lista sin nombre no se crea', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/priceLists/l1'), {
      name: '', adjustPercent: -15, active: true,
    }));
  });
});

// ============================================================
describe('businesses/{id}/stockCounts — Stock Manager', () => {
  const employee = (uid) => testEnv.authenticatedContext(uid).firestore();

  const count = (over = {}) => ({
    title: 'Control del depósito',
    status: 'pending',
    assignedTo: 'maria',
    assignedToName: 'María',
    blind: true,
    scope: 'general',
    items: [{ productId: 'p1', name: 'Coca', expected: 10, counted: null }],
    createdBy: 'alice',
    ...over,
  });

  const member = (permissions) => ({
    uid: 'maria', businessId: 'b1', email: 'maria@x.com', displayName: 'María',
    role: 'custom', active: true, permissions,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      // María cuenta pero no asigna; Pedro no tiene nada de controles.
      await setDoc(doc(db, 'businesses/b1/members/maria'), member({
        'stock.view': true, 'stockcount.perform': true,
      }));
      await setDoc(doc(db, 'businesses/b1/members/pedro'), {
        ...member({ 'stock.view': true }), uid: 'pedro', displayName: 'Pedro',
      });
    });
  });

  test('el dueño asigna un control; quien solo cuenta, no', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'businesses/b1/stockCounts/c1'), count()));
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/stockCounts/c2'), count()));
    await assertFails(setDoc(doc(anon(), 'businesses/b1/stockCounts/c3'), count()));
  });

  test('un control necesita título y responsable', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/stockCounts/c1'), count({ title: '' })));
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/stockCounts/c1'), count({ assignedTo: '' })));
  });

  test('lo lee quien puede contar; quien no tiene el permiso, no', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/stockCounts/c1'), count()));
    await assertSucceeds(getDoc(doc(employee('maria'), 'businesses/b1/stockCounts/c1')));
    await assertSucceeds(getDoc(doc(owner('alice'), 'businesses/b1/stockCounts/c1')));
    await assertFails(getDoc(doc(employee('pedro'), 'businesses/b1/stockCounts/c1')));
    await assertFails(getDoc(doc(other('mallory'), 'businesses/b1/stockCounts/c1')));
  });

  test('la planilla la completa quien la tiene asignada', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/stockCounts/c1'), count()));
    await assertSucceeds(updateDoc(doc(employee('maria'), 'businesses/b1/stockCounts/c1'), {
      items: [{ productId: 'p1', name: 'Coca', expected: 10, counted: 8 }],
      status: 'in_progress',
    }));
    await assertFails(updateDoc(doc(employee('pedro'), 'businesses/b1/stockCounts/c1'), { status: 'completed' }));
  });

  test('quien cuenta no se puede pasar la planilla a otro', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/stockCounts/c1'), count()));
    await assertFails(updateDoc(doc(employee('maria'), 'businesses/b1/stockCounts/c1'), {
      assignedTo: 'pedro',
    }));
  });

  test('el control de otro no se toca', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1/stockCounts/c1'), count({ assignedTo: 'pedro' }));
    });
    await assertFails(updateDoc(doc(employee('maria'), 'businesses/b1/stockCounts/c1'), { status: 'completed' }));
    await assertSucceeds(updateDoc(doc(owner('alice'), 'businesses/b1/stockCounts/c1'), { status: 'completed' }));
  });

  test('borrar el control es de quien lo asigna', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/stockCounts/c1'), count()));
    await assertFails(deleteDoc(doc(employee('maria'), 'businesses/b1/stockCounts/c1')));
    await assertSucceeds(deleteDoc(doc(owner('alice'), 'businesses/b1/stockCounts/c1')));
  });
});

// ============================================================
describe('businesses/{id}/activity — registro de Stock Manager', () => {
  const employee = (uid) => testEnv.authenticatedContext(uid).firestore();

  const entry = (over = {}) => ({
    action: 'invoice.create',
    actorId: 'maria',
    actorName: 'María',
    actorRole: 'vendedor',
    targetId: 'inv-1',
    targetLabel: 'Factura 0001-00000001',
    detail: '',
    createdAt: serverTimestamp(),
    ...over,
  });

  const member = (uid, over = {}) => ({
    uid, businessId: 'b1', email: `${uid}@x.com`, displayName: uid,
    role: 'custom', active: true, permissions: {}, ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      // María no tiene ningún permiso: registrar no depende de eso.
      await setDoc(doc(db, 'businesses/b1/members/maria'), member('maria'));
      await setDoc(doc(db, 'businesses/b1/members/encargado'), member('encargado', {
        permissions: { 'team.manage': true, 'business.manage': true, 'sales.view': true },
      }));
      await setDoc(doc(db, 'businesses/b1/members/gerente'), member('gerente', { role: 'admin' }));
      await setDoc(doc(db, 'businesses/b1/members/exadmin'), member('exadmin', { role: 'admin', active: false }));
      await setDoc(doc(db, 'businesses/b1/members/baja'), member('baja', { active: false }));
    });
  });

  test('el empleado registra con su uid, aunque no tenga permisos', async () => {
    await assertSucceeds(setDoc(doc(employee('maria'), 'businesses/b1/activity/a1'), entry()));
  });

  test('la entrada va en el mismo commit que la acción', async () => {
    const db = employee('encargado');

    const firmada = writeBatch(db);
    firmada.update(doc(db, 'businesses/b1'), { name: 'Tienda nueva' });
    firmada.set(doc(db, 'businesses/b1/activity/a1'), entry({ actorId: 'encargado' }));
    await assertSucceeds(firmada.commit());

    // Una entrada denegada tumba la acción: no hay una sin la otra.
    const falsa = writeBatch(db);
    falsa.update(doc(db, 'businesses/b1'), { name: 'Tienda trucha' });
    falsa.set(doc(db, 'businesses/b1/activity/a2'), entry({ actorId: 'maria' }));
    await assertFails(falsa.commit());
  });

  test('nadie firma por otro', async () => {
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/activity/a1'), entry({ actorId: 'pedro' })));
  });

  test('createdAt es la hora del servidor, no una que mande el cliente', async () => {
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/activity/a1'), entry({
      createdAt: Timestamp.fromMillis(Date.now() - DAY),
    })));
  });

  test('no entran campos fuera de la lista', async () => {
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/activity/a1'), entry({ reviewed: true })));
  });

  test('la acción es un texto no vacío de hasta 40 caracteres', async () => {
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/activity/a1'), entry({ action: '' })));
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/activity/a2'), entry({ action: 7 })));
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/activity/a3'), entry({ action: 'x'.repeat(41) })));
    await assertSucceeds(setDoc(doc(employee('maria'), 'businesses/b1/activity/a4'), entry({ action: 'x'.repeat(40) })));
  });

  test('quien no trabaja en el comercio no escribe', async () => {
    await assertFails(setDoc(doc(employee('baja'), 'businesses/b1/activity/a1'), entry({ actorId: 'baja' })));
    await assertFails(setDoc(doc(other('mallory'), 'businesses/b1/activity/a2'), entry({ actorId: 'mallory' })));
    await assertFails(setDoc(doc(anon(), 'businesses/b1/activity/a3'), entry()));
  });

  test('un empleado no lee el registro, ni con todos los permisos tildados', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/activity/a1'), entry({ createdAt: Timestamp.now() })));
    await assertFails(getDoc(doc(employee('maria'), 'businesses/b1/activity/a1')));
    await assertFails(getDocs(collection(employee('maria'), 'businesses/b1/activity')));
    await assertFails(getDoc(doc(employee('encargado'), 'businesses/b1/activity/a1')));
    await assertFails(getDocs(collection(employee('encargado'), 'businesses/b1/activity')));
    await assertFails(getDoc(doc(other('mallory'), 'businesses/b1/activity/a1')));
  });

  test('lo leen el dueño, el rol admin activo y el super-admin', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/activity/a1'), entry({ createdAt: Timestamp.now() })));
    await assertSucceeds(getDocs(collection(owner('alice'), 'businesses/b1/activity')));
    await assertSucceeds(getDocs(collection(employee('gerente'), 'businesses/b1/activity')));
    await assertSucceeds(getDocs(collection(admin(), 'businesses/b1/activity')));
    await assertFails(getDocs(collection(employee('exadmin'), 'businesses/b1/activity')));
  });

  test('nadie edita ni borra una entrada', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/activity/a1'), entry({ createdAt: Timestamp.now() })));
    for (const db of [employee('maria'), owner('alice'), employee('gerente'), admin()]) {
      await assertFails(updateDoc(doc(db, 'businesses/b1/activity/a1'), { detail: 'corregido' }));
      await assertFails(deleteDoc(doc(db, 'businesses/b1/activity/a1')));
    }
  });
});

// ============================================================
describe('businesses/{id}/tasks — Stock Manager', () => {
  const employee = (uid) => testEnv.authenticatedContext(uid).firestore();

  const task = (over = {}) => ({
    title: 'Ordenar el depósito',
    assignedTo: 'maria',
    assignedToName: 'María',
    status: 'pending',
    createdBy: 'alice',
    ...over,
  });

  const member = (uid, over = {}) => ({
    uid, businessId: 'b1', email: `${uid}@x.com`, displayName: uid,
    role: 'custom', active: true, permissions: {}, ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      await setDoc(doc(db, 'businesses/b2'), { ownerId: 'alice', name: 'Sucursal', currency: 'ARS' });
      // María y Pedro no tienen ningún permiso: ver lo suyo no depende de eso.
      await setDoc(doc(db, 'businesses/b1/members/maria'), member('maria'));
      await setDoc(doc(db, 'businesses/b1/members/pedro'), member('pedro'));
      await setDoc(doc(db, 'businesses/b1/members/encargado'), member('encargado', {
        permissions: { 'team.manage': true },
      }));
      await setDoc(doc(db, 'businesses/b1/members/baja'), member('baja', { active: false }));
    });
  });

  test('asigna quien administra el equipo; un empleado común, no', async () => {
    await assertSucceeds(setDoc(doc(owner('alice'), 'businesses/b1/tasks/t1'), task()));
    await assertSucceeds(setDoc(doc(employee('encargado'), 'businesses/b1/tasks/t2'), task()));
    await assertFails(setDoc(doc(employee('maria'), 'businesses/b1/tasks/t3'), task()));
    await assertFails(setDoc(doc(anon(), 'businesses/b1/tasks/t4'), task()));
  });

  test('una tarea necesita título y responsable', async () => {
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/tasks/t1'), task({ title: '' })));
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/tasks/t2'), task({ assignedTo: '' })));
  });

  test('una tarea no puede tener 20 campos o más', async () => {
    const relleno = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`campo${i}`, i]));
    await assertFails(setDoc(doc(owner('alice'), 'businesses/b1/tasks/t1'), task(relleno)));
  });

  test('la lee el asignado y quien administra el equipo; otro empleado, no', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/tasks/t1'), task()));
    await assertSucceeds(getDoc(doc(employee('maria'), 'businesses/b1/tasks/t1')));
    await assertSucceeds(getDoc(doc(owner('alice'), 'businesses/b1/tasks/t1')));
    await assertSucceeds(getDoc(doc(employee('encargado'), 'businesses/b1/tasks/t1')));
    await assertFails(getDoc(doc(employee('pedro'), 'businesses/b1/tasks/t1')));
    await assertFails(getDoc(doc(other('mallory'), 'businesses/b1/tasks/t1')));
  });

  test('el empleado lista solo con su propio uid', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1/tasks/t1'), task());
      await setDoc(doc(db, 'businesses/b1/tasks/t2'), task({ assignedTo: 'pedro' }));
    });
    const db = employee('maria');
    const tasks = collection(db, 'businesses/b1/tasks');
    await assertSucceeds(getDocs(query(tasks, where('assignedTo', '==', 'maria'))));
    await assertFails(getDocs(query(tasks, where('assignedTo', '==', 'pedro'))));
    await assertFails(getDocs(tasks));
    await assertSucceeds(getDocs(collection(owner('alice'), 'businesses/b1/tasks')));
  });

  test('las tareas de un comercio no se ven desde otro donde no trabaja', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b2/tasks/t1'), task()));
    await assertFails(getDoc(doc(employee('maria'), 'businesses/b2/tasks/t1')));
  });

  test('el desactivado pierde sus tareas', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/tasks/t1'), task({ assignedTo: 'baja' })));
    await assertFails(getDoc(doc(employee('baja'), 'businesses/b1/tasks/t1')));
    await assertFails(updateDoc(doc(employee('baja'), 'businesses/b1/tasks/t1'), { status: 'done' }));
  });

  test('el asignado la marca como hecha y la reabre', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/tasks/t1'), task()));
    await assertSucceeds(updateDoc(doc(employee('maria'), 'businesses/b1/tasks/t1'), {
      status: 'done',
      completedAt: serverTimestamp(),
      completedBy: 'maria',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(employee('maria'), 'businesses/b1/tasks/t1'), {
      status: 'pending',
      completedAt: null,
      completedBy: '',
      updatedAt: serverTimestamp(),
    }));
  });

  test('el asignado no la reescribe ni se la pasa a otro', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/tasks/t1'), task()));
    await assertFails(updateDoc(doc(employee('maria'), 'businesses/b1/tasks/t1'), { title: 'Otra cosa' }));
    await assertFails(updateDoc(doc(employee('maria'), 'businesses/b1/tasks/t1'), { assignedTo: 'pedro' }));
    await assertFails(updateDoc(doc(employee('maria'), 'businesses/b1/tasks/t1'), {
      status: 'done', title: 'Otra cosa',
    }));
  });

  test('la tarea de otro no se toca', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/tasks/t1'), task()));
    await assertFails(updateDoc(doc(employee('pedro'), 'businesses/b1/tasks/t1'), { status: 'done' }));
  });

  test('quien administra el equipo la edita y la borra; el asignado no la borra', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/tasks/t1'), task()));
    await assertSucceeds(updateDoc(doc(employee('encargado'), 'businesses/b1/tasks/t1'), {
      title: 'Ordenar el depósito grande', assignedTo: 'pedro',
    }));
    await assertFails(deleteDoc(doc(employee('maria'), 'businesses/b1/tasks/t1')));
    await assertSucceeds(deleteDoc(doc(employee('encargado'), 'businesses/b1/tasks/t1')));
  });
});

// ============================================================
describe('businesses/{id}/remitos — marcar como facturado', () => {
  const employee = (uid) => testEnv.authenticatedContext(uid).firestore();

  const remito = () => ({
    number: '0001-00000001',
    numberInt: 1,
    status: 'issued',
    totalQuantity: 3,
    subtotal: 0,
    userId: 'alice',
    invoiceId: null,
  });

  const member = (uid, permissions) => ({
    uid, businessId: 'b1', email: `${uid}@x.com`, displayName: uid,
    role: 'custom', active: true, permissions,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      await setDoc(doc(db, 'businesses/b1/remitos/r1'), remito());
      await setDoc(doc(db, 'businesses/b1/members/vendedor'), member('vendedor', {
        'sales.view': true, 'clients.view': true, 'invoices.create': true,
      }));
      await setDoc(doc(db, 'businesses/b1/members/mirador'), member('mirador', { 'sales.view': true }));
    });
  });

  test('un vendedor sin invoices.cancel lo marca con la factura', async () => {
    await assertSucceeds(updateDoc(doc(employee('vendedor'), 'businesses/b1/remitos/r1'), {
      invoiceId: 'inv-1', updatedAt: serverTimestamp(),
    }));
  });

  test('ese vendedor no puede tocar nada más del remito', async () => {
    await assertFails(updateDoc(doc(employee('vendedor'), 'businesses/b1/remitos/r1'), {
      status: 'cancelled', cancelReason: 'Error',
    }));
    await assertFails(updateDoc(doc(employee('vendedor'), 'businesses/b1/remitos/r1'), {
      invoiceId: 'inv-1', status: 'cancelled',
    }));
  });

  test('sin invoices.create no se marca', async () => {
    await assertFails(updateDoc(doc(employee('mirador'), 'businesses/b1/remitos/r1'), {
      invoiceId: 'inv-1', updatedAt: serverTimestamp(),
    }));
  });

  test('un remito ya facturado no se vuelve a marcar ni se desmarca', async () => {
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/remitos/r2'), { ...remito(), invoiceId: 'inv-1' }));
    await assertFails(updateDoc(doc(employee('vendedor'), 'businesses/b1/remitos/r2'), {
      invoiceId: 'inv-2', updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(employee('vendedor'), 'businesses/b1/remitos/r2'), {
      invoiceId: null, updatedAt: serverTimestamp(),
    }));
  });

  test('un remito viejo, sin el campo, se marca igual', async () => {
    const viejo = remito();
    delete viejo.invoiceId;
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/remitos/r3'), viejo));
    await assertSucceeds(updateDoc(doc(employee('vendedor'), 'businesses/b1/remitos/r3'), {
      invoiceId: 'inv-1', updatedAt: serverTimestamp(),
    }));
  });
});

// ============================================================
describe('businesses/{id}/products — por id y como catálogo', () => {
  const employee = (uid) => testEnv.authenticatedContext(uid).firestore();

  const member = (uid, permissions, over = {}) => ({
    uid, businessId: 'b1', email: `${uid}@x.com`, displayName: uid,
    role: 'custom', active: true, permissions, ...over,
  });

  const producto = 'businesses/b1/products/p1';
  const catalogo = 'businesses/b1/products';

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      await setDoc(doc(db, producto), { name: 'Coca', quantity: 10, salePrice: 200 });
      // Perfiles personalizados sin `stock.view`: el catálogo de permisos no lo
      // exige para vender ni para anular.
      await setDoc(doc(db, 'businesses/b1/members/anulador'), member('anulador', {
        'sales.view': true, 'invoices.cancel': true,
      }));
      await setDoc(doc(db, 'businesses/b1/members/vendedor'), member('vendedor', {
        'sales.view': true, 'clients.view': true, 'invoices.create': true,
      }));
      await setDoc(doc(db, 'businesses/b1/members/remitero'), member('remitero', {
        'sales.view': true, 'clients.view': true, 'remitos.create': true,
      }));
      await setDoc(doc(db, 'businesses/b1/members/mirador'), member('mirador', { 'sales.view': true }));
      await setDoc(doc(db, 'businesses/b1/members/deposito'), member('deposito', { 'stock.view': true }));
      await setDoc(doc(db, 'businesses/b1/members/baja'), member('baja', {
        'sales.view': true, 'invoices.cancel': true,
      }, { active: false }));
    });
  });

  test('quien anula sin stock.view lee el producto por id, pero no lista el catálogo', async () => {
    await assertSucceeds(getDoc(doc(employee('anulador'), producto)));
    await assertFails(getDocs(collection(employee('anulador'), catalogo)));
  });

  test('quien factura o hace remitos sin stock.view, igual', async () => {
    for (const uid of ['vendedor', 'remitero']) {
      await assertSucceeds(getDoc(doc(employee(uid), producto)));
      await assertFails(getDocs(collection(employee(uid), catalogo)));
    }
  });

  test('anular devuelve el stock en una transacción que lee el producto', async () => {
    const db = employee('anulador');
    const ref = doc(db, producto);
    await assertSucceeds(runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      tx.update(ref, { quantity: snap.data().quantity + 1, updatedAt: serverTimestamp() });
    }));
  });

  test('quien no mueve stock no lee ni por id', async () => {
    await assertFails(getDoc(doc(employee('mirador'), producto)));
    await assertFails(getDoc(doc(employee('baja'), producto)));
    await assertFails(getDoc(doc(other('mallory'), producto)));
  });

  test('con stock.view se lee y se lista', async () => {
    await assertSucceeds(getDoc(doc(employee('deposito'), producto)));
    await assertSucceeds(getDocs(collection(employee('deposito'), catalogo)));
    await assertSucceeds(getDocs(collection(owner('alice'), catalogo)));
  });
});

// ============================================================
describe('businesses/{id}/members — Stock Manager', () => {
  const employee = (uid) => testEnv.authenticatedContext(uid).firestore();

  const member = (uid, over = {}) => ({
    uid, businessId: 'b1', email: `${uid}@x.com`, displayName: uid,
    role: 'custom', active: true, permissions: {}, ...over,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'businesses/b1'), { ownerId: 'alice', name: 'Tienda', currency: 'ARS' });
      await setDoc(doc(db, 'businesses/b1/members/maria'), member('maria'));
      await setDoc(doc(db, 'businesses/b1/members/encargado'), member('encargado', {
        permissions: { 'team.manage': true },
      }));
      await setDoc(doc(db, 'businesses/b1/members/gerente'), member('gerente', { role: 'admin' }));
      await setDoc(doc(db, 'businesses/b1/members/subgerente'), member('subgerente', { role: 'admin' }));
      await setDoc(doc(db, 'businesses/b1/members/exadmin'), member('exadmin', { role: 'admin', active: false }));
      await setDoc(doc(db, 'businesses/b1/members/asignador'), member('asignador', {
        permissions: { 'stock.view': true, 'stockcount.perform': true, 'stockcount.manage': true },
      }));
      await setDoc(doc(db, 'businesses/b1/members/contador'), member('contador', {
        permissions: { 'stock.view': true, 'stockcount.perform': true },
      }));
      await setDoc(doc(db, 'businesses/b1/members/exasignador'), member('exasignador', {
        active: false,
        permissions: { 'stock.view': true, 'stockcount.perform': true, 'stockcount.manage': true },
      }));
    });
  });

  test('team.manage no da el rol admin', async () => {
    await assertFails(updateDoc(doc(employee('encargado'), 'businesses/b1/members/maria'), { role: 'admin' }));
  });

  test('team.manage no toca a quien ya es admin: ni lo baja, ni lo edita, ni lo reactiva', async () => {
    const gerente = 'businesses/b1/members/gerente';
    await assertFails(updateDoc(doc(employee('encargado'), gerente), { role: 'vendedor' }));
    await assertFails(updateDoc(doc(employee('encargado'), gerente), { active: false }));
    await assertFails(updateDoc(doc(employee('encargado'), gerente), { displayName: 'Otro' }));
    await assertFails(updateDoc(doc(employee('encargado'), 'businesses/b1/members/exadmin'), { active: true }));
  });

  test('a un admin lo toca otro admin, el dueño o el super-admin', async () => {
    const subgerente = 'businesses/b1/members/subgerente';
    await assertSucceeds(updateDoc(doc(employee('gerente'), subgerente), { active: false }));
    await assertSucceeds(updateDoc(doc(employee('gerente'), 'businesses/b1/members/exadmin'), { active: true }));
    await assertSucceeds(updateDoc(doc(employee('gerente'), 'businesses/b1/members/maria'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(owner('alice'), subgerente), { role: 'vendedor' }));
    await assertSucceeds(updateDoc(doc(owner('alice'), 'businesses/b1/members/encargado'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(admin(), 'businesses/b1/members/contador'), { role: 'admin' }));
  });

  test('un admin desactivado no toca a nadie', async () => {
    await assertFails(updateDoc(doc(employee('exadmin'), 'businesses/b1/members/maria'), { role: 'admin' }));
    await assertFails(updateDoc(doc(employee('exadmin'), 'businesses/b1/members/subgerente'), { active: false }));
  });

  test('nadie se edita a sí mismo, ni siendo admin', async () => {
    await assertFails(updateDoc(doc(employee('gerente'), 'businesses/b1/members/gerente'), { displayName: 'Yo' }));
    await assertFails(updateDoc(doc(employee('encargado'), 'businesses/b1/members/encargado'), { role: 'admin' }));
  });

  test('un doc viejo sin role se sigue pudiendo editar con team.manage', async () => {
    const viejo = member('pedro');
    delete viejo.role;
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/members/pedro'), viejo));
    await assertSucceeds(updateDoc(doc(employee('encargado'), 'businesses/b1/members/pedro'), { role: 'vendedor' }));
  });

  test('quien asigna controles ve el equipo; quien solo cuenta, no', async () => {
    const equipo = 'businesses/b1/members';
    await assertSucceeds(getDocs(collection(employee('asignador'), equipo)));
    await assertSucceeds(getDoc(doc(employee('asignador'), `${equipo}/maria`)));
    await assertFails(getDocs(collection(employee('contador'), equipo)));
    await assertFails(getDoc(doc(employee('contador'), `${equipo}/maria`)));
    await assertSucceeds(getDoc(doc(employee('contador'), `${equipo}/contador`)));
  });

  test('stockcount.manage desactivado no ve el equipo', async () => {
    await assertFails(getDocs(collection(employee('exasignador'), 'businesses/b1/members')));
    await assertFails(getDoc(doc(employee('exasignador'), 'businesses/b1/members/maria')));
  });

  test('ver el equipo para asignar controles no deja editarlo', async () => {
    await assertFails(updateDoc(doc(employee('asignador'), 'businesses/b1/members/maria'), { role: 'vendedor' }));
  });

  test('el rol y los permisos se editan; el comercio del doc, no', async () => {
    const maria = 'businesses/b1/members/maria';
    await assertSucceeds(updateDoc(doc(employee('encargado'), maria), { role: 'vendedor' }));
    await assertFails(updateDoc(doc(employee('encargado'), maria), { businessId: 'b2' }));
    await assertSucceeds(updateDoc(doc(owner('alice'), maria), { role: 'deposito' }));
    await assertFails(updateDoc(doc(owner('alice'), maria), { businessId: 'b2' }));
  });

  test('un doc viejo sin businessId se sigue pudiendo editar', async () => {
    const viejo = member('pedro');
    delete viejo.businessId;
    await seed(async (db) => setDoc(doc(db, 'businesses/b1/members/pedro'), viejo));
    await assertSucceeds(updateDoc(doc(owner('alice'), 'businesses/b1/members/pedro'), { role: 'vendedor' }));
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
