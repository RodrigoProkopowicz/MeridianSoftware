/**
 * afip/index.js — Callable Cloud Functions para Stock Manager AFIP.
 *
 * Usa el SDK oficial @afipsdk/afip.js como proxy hacia AFIP. Tu cuenta dev
 * tiene un access_token (Firebase Secret AFIPSDK_ACCESS_TOKEN); cada usuario
 * delega el WSFE de su CUIT al CUIT de AfipSDK en el portal AFIP.
 *
 * Exports:
 *   - saveAfipConfig:    guarda CUIT, PV, env, condición fiscal del comercio
 *   - clearAfipConfig:   borra la config
 *   - getAfipStatus:     estado sin exponer datos sensibles
 *   - testAfipConnection: getServerStatus + getLastVoucher (fuerza auth)
 *   - getAfipLastNumber: último número AFIP autorizado para PV+tipo
 *   - requestAfipCAE:    solicita CAE para un comprobante DRAFT
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const { dummy, getLastAuthorized, requestCAE } = require('./wsfe');
const { readSecret, writeSecret, assertBusinessOwner } = require('./store');
const { CBTE_TIPO } = require('./config');
const { buildVoucherRequest, formatVoucherNumber, parseAfipDate } = require('./voucher');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const AFIPSDK_SECRET = defineSecret('AFIPSDK_ACCESS_TOKEN');

// ============================================================
// saveAfipConfig (modo manual)
// ============================================================
exports.saveAfipConfig = onCall(async (req) => {
  requireAuth(req);
  const { businessId, cuit, pointOfSale, taxCondition } = req.data || {};

  if (!businessId)   throw new HttpsError('invalid-argument', 'businessId requerido');
  const cuitClean = String(cuit || '').replace(/[^0-9]/g, '');
  if (cuitClean.length !== 11) {
    throw new HttpsError('invalid-argument', 'CUIT inválido (debe tener 11 dígitos)');
  }
  if (!Number.isFinite(Number(pointOfSale)) || Number(pointOfSale) <= 0) {
    throw new HttpsError('invalid-argument', 'Punto de venta inválido');
  }
  if (!['RI', 'MT'].includes(taxCondition)) {
    throw new HttpsError('invalid-argument', 'taxCondition debe ser RI|MT');
  }

  await assertOwnerOrThrow(businessId, req.auth.uid);

  await writeSecret(businessId, {
    env: 'production',
    cuit: cuitClean,
    pointOfSale: Number(pointOfSale),
    taxCondition,
    setupMode: 'manual',
    configuredAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ============================================================
// setupAfipExpress (modo wizard con clave fiscal)
// Body: { businessId, cuit, username, password, pointOfSaleNumber,
//         fantasyName, taxCondition }
//
// 1. Lista puntos de venta del CUIT en ARCA
// 2. Si no existe el PV solicitado, lo crea (FEEWS)
// 3. Genera certificado de producción y obtiene cert+key
// 4. Guarda cert+key + config en businesses/{id}/secrets/afip
// 5. Smoke test con getServerStatus
//
// La clave fiscal NO se persiste — vive solo en RAM durante la function.
// ============================================================
exports.setupAfipExpress = onCall({ secrets: [AFIPSDK_SECRET], timeoutSeconds: 540 }, async (req) => {
  requireAuth(req);
  const {
    businessId, cuit, username, password,
    pointOfSaleNumber, fantasyName, taxCondition,
  } = req.data || {};

  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  const cuitClean = String(cuit || '').replace(/[^0-9]/g, '');
  if (cuitClean.length !== 11) throw new HttpsError('invalid-argument', 'CUIT debe tener 11 dígitos');
  const usernameClean = String(username || cuitClean).replace(/[^0-9]/g, '');
  if (!password) throw new HttpsError('invalid-argument', 'Clave fiscal requerida');
  const pvNumber = Number(pointOfSaleNumber);
  if (!Number.isFinite(pvNumber) || pvNumber <= 0 || pvNumber > 99999) {
    throw new HttpsError('invalid-argument', 'Número de punto de venta inválido');
  }
  if (!fantasyName || String(fantasyName).trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Nombre de fantasía del punto de venta requerido');
  }
  if (!['RI', 'MT'].includes(taxCondition)) {
    throw new HttpsError('invalid-argument', 'taxCondition debe ser RI|MT');
  }

  await assertOwnerOrThrow(businessId, req.auth.uid);

  const Afip = require('@afipsdk/afip.js');
  const afip = new Afip({ access_token: process.env.AFIPSDK_ACCESS_TOKEN });

  const creds = { cuit: cuitClean, username: usernameClean, password };

  // 1) Listar PVs
  let existingPVs = [];
  try {
    const list = await afip.CreateAutomation('list-sales-points', creds, true);
    const items = list?.data?.points || list?.data || [];
    existingPVs = Array.isArray(items) ? items : [];
  } catch (err) {
    throw new HttpsError('failed-precondition', `No se pudo listar puntos de venta: ${err.message}`);
  }

  const alreadyHasPV = existingPVs.some(p => Number(p.numero || p.number) === pvNumber);

  // 2) Crear PV si no existe
  let pvCreated = false;
  if (!alreadyHasPV) {
    try {
      await afip.CreateAutomation('create-sales-point', {
        ...creds,
        numero: pvNumber,
        sistema: 'FEEWS',
        nombreFantasia: String(fantasyName).trim().slice(0, 100),
      }, true);
      pvCreated = true;
    } catch (err) {
      throw new HttpsError('failed-precondition', `No se pudo crear el punto de venta ${pvNumber}: ${err.message}`);
    }
  }

  // 3) Crear cert de producción
  let cert, key;
  try {
    const certResult = await afip.CreateAutomation('create-cert-prod', {
      ...creds,
      alias: `stockmanager-${Date.now()}`,
    }, true);
    cert = certResult?.data?.cert;
    key  = certResult?.data?.key;
    if (!cert || !key) throw new Error('Respuesta sin cert/key');
  } catch (err) {
    throw new HttpsError('failed-precondition', `No se pudo crear el certificado: ${err.message}`);
  }

  // 4) Guardar config + cert. La clave fiscal NO se persiste.
  await writeSecret(businessId, {
    env: 'production',
    cuit: cuitClean,
    pointOfSale: pvNumber,
    taxCondition,
    cert,
    key,
    setupMode: 'express',
    configuredAt: FieldValue.serverTimestamp(),
  });

  // 5) Smoke test rápido
  let testOk = false;
  let testError = null;
  try {
    const afipTest = new Afip({
      CUIT: Number(cuitClean),
      access_token: process.env.AFIPSDK_ACCESS_TOKEN,
      cert, key,
      production: true,
    });
    await afipTest.ElectronicBilling.getServerStatus();
    testOk = true;
  } catch (err) {
    testError = err.message;
  }

  return {
    ok: true,
    pvCreated,
    alreadyHadPV: alreadyHasPV,
    certCreated: true,
    testOk,
    testError,
  };
});

// ============================================================
// clearAfipConfig
// ============================================================
exports.clearAfipConfig = onCall(async (req) => {
  requireAuth(req);
  const { businessId } = req.data || {};
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  await assertOwnerOrThrow(businessId, req.auth.uid);

  await getFirestore().doc(`businesses/${businessId}/secrets/afip`).delete();
  return { ok: true };
});

// ============================================================
// getAfipStatus
// ============================================================
exports.getAfipStatus = onCall(async (req) => {
  requireAuth(req);
  const { businessId } = req.data || {};
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  await assertOwnerOrThrow(businessId, req.auth.uid);

  const secret = await readSecret(businessId);
  if (!secret) return { configured: false };

  return {
    configured: !!(secret.cuit && secret.pointOfSale && secret.env),
    env: secret.env || null,
    cuit: secret.cuit || null,
    pointOfSale: secret.pointOfSale || null,
    taxCondition: secret.taxCondition || null,
    configuredAt: secret.configuredAt?.toDate?.().toISOString() || null,
  };
});

// ============================================================
// testAfipConnection — getServerStatus + getLastVoucher (fuerza auth)
// ============================================================
exports.testAfipConnection = onCall({ secrets: [AFIPSDK_SECRET] }, async (req) => {
  requireAuth(req);
  const { businessId } = req.data || {};
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  await assertOwnerOrThrow(businessId, req.auth.uid);

  const secret = await readSecret(businessId);
  if (!secret) throw new HttpsError('failed-precondition', 'AFIP no configurado');

  // 1) Ping
  const dummyResult = await dummy(secret);

  // 2) Forzamos auth con un getLastVoucher (factura C, PV configurado).
  //    Para RI usamos factura B (cbteTipo 6) que también está habilitada.
  const probeCbteTipo = secret.taxCondition === 'MT' ? CBTE_TIPO.FACTURA_C : CBTE_TIPO.FACTURA_B;
  let tokenResult;
  try {
    const last = await getLastAuthorized(businessId, {
      ptoVta: secret.pointOfSale,
      cbteTipo: probeCbteTipo,
    });
    tokenResult = { ok: true, lastNumber: last, message: 'Autenticación OK' };
  } catch (err) {
    tokenResult = { ok: false, error: err.message };
  }

  return { dummy: dummyResult, token: tokenResult };
});

// ============================================================
// getAfipLastNumber
// ============================================================
exports.getAfipLastNumber = onCall({ secrets: [AFIPSDK_SECRET] }, async (req) => {
  requireAuth(req);
  const { businessId, cbteTipo } = req.data || {};
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  if (!cbteTipo)   throw new HttpsError('invalid-argument', 'cbteTipo requerido');
  await assertOwnerOrThrow(businessId, req.auth.uid);

  const secret = await readSecret(businessId);
  if (!secret) throw new HttpsError('failed-precondition', 'AFIP no configurado');

  const last = await getLastAuthorized(businessId, {
    ptoVta: secret.pointOfSale,
    cbteTipo: Number(cbteTipo),
  });
  return { lastNumber: last, nextNumber: last + 1 };
});

// ============================================================
// lookupCuitPadron — consulta el padrón AFIP y normaliza la respuesta.
// Body: { businessId, cuit }
// Returns: { found, name, taxCondition, taxIdType, address, city, province, raw }
// ============================================================
exports.lookupCuitPadron = onCall({ secrets: [AFIPSDK_SECRET] }, async (req) => {
  requireAuth(req);
  const { businessId, cuit } = req.data || {};
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  await assertOwnerOrThrow(businessId, req.auth.uid);

  const cuitClean = String(cuit || '').replace(/[^0-9]/g, '');
  if (cuitClean.length !== 11) {
    throw new HttpsError('invalid-argument', 'CUIT debe tener 11 dígitos');
  }

  const secret = await readSecret(businessId);
  if (!secret) throw new HttpsError('failed-precondition', 'AFIP no configurado');

  const Afip = require('@afipsdk/afip.js');
  const afip = new Afip({
    CUIT: Number(secret.cuit),
    access_token: process.env.AFIPSDK_ACCESS_TOKEN,
    production: secret.env === 'production',
  });

  let raw = null;
  try {
    raw = await afip.RegisterInscriptionProof.getTaxpayerDetails(Number(cuitClean));
  } catch (err) {
    // Padrón puede fallar transient; devolvemos found=false en lugar de error
    console.warn('Padrón lookup failed', err.message);
    return { found: false, error: err.message };
  }

  if (!raw) return { found: false };
  return { found: true, ...normalizePadron(raw, cuitClean) };
});

/**
 * El payload de RegisterInscriptionProof varía bastante. Extraemos los campos
 * con resilencia: probamos varios paths.
 */
function normalizePadron(raw, cuit) {
  // El SDK suele devolver { datosGenerales: {...}, impuestos: [...], datosMonotributo: {...}, datosRegimenGeneral: {...} }
  const d = raw.datosGenerales || raw;
  const tipoPersona = d.tipoPersona || d.tipo;

  let name = '';
  if (tipoPersona === 'JURIDICA') {
    name = d.razonSocial || d.RazonSocial || '';
  } else {
    const apellido = d.apellido || d.Apellido || '';
    const nombre   = d.nombre   || d.Nombre   || '';
    name = [apellido, nombre].filter(Boolean).join(', ');
  }

  // Domicilio fiscal
  const dom = d.domicilioFiscal || d.DomicilioFiscal || {};
  const address  = dom.direccion || dom.Direccion || '';
  const city     = dom.localidad || dom.Localidad || '';
  const province = dom.descripcionProvincia || dom.DescripcionProvincia || '';

  // Condición fiscal — derivada de impuestos / datosMonotributo / datosRegimenGeneral
  let taxCondition = '';
  if (raw.datosMonotributo)    taxCondition = 'Monotributista';
  else if (raw.datosRegimenGeneral) {
    const impuestos = raw.datosRegimenGeneral.impuestos || raw.impuestos || [];
    const hasIVA = Array.isArray(impuestos) && impuestos.some(i => Number(i.idImpuesto || i.IdImpuesto) === 30);
    if (hasIVA) taxCondition = 'Responsable Inscripto';
    else taxCondition = 'Exento';
  } else if (Array.isArray(raw.impuestos)) {
    const hasIVA = raw.impuestos.some(i => Number(i.idImpuesto || i.IdImpuesto) === 30);
    if (hasIVA) taxCondition = 'Responsable Inscripto';
  }
  if (!taxCondition) taxCondition = 'Consumidor Final';

  // Tipo de doc: si es 11 dígitos es CUIT; el padrón devuelve sólo personas con CUIT
  return {
    name,
    taxId: cuit,
    taxIdType: 'CUIT',
    taxCondition,
    address,
    city,
    province,
    estado: d.estadoClaveCUIT || d.EstadoClaveCUIT || '',
  };
}

// ============================================================
// requestAfipCAE
// ============================================================
exports.requestAfipCAE = onCall({ secrets: [AFIPSDK_SECRET], timeoutSeconds: 120 }, async (req) => {
  requireAuth(req);
  const { businessId, invoiceId } = req.data || {};
  if (!businessId) throw new HttpsError('invalid-argument', 'businessId requerido');
  if (!invoiceId)  throw new HttpsError('invalid-argument', 'invoiceId requerido');
  await assertOwnerOrThrow(businessId, req.auth.uid);

  const secret = await readSecret(businessId);
  if (!secret?.cuit || !secret?.pointOfSale) {
    throw new HttpsError('failed-precondition', 'AFIP no configurado');
  }

  const invRef = getFirestore().doc(`businesses/${businessId}/invoices/${invoiceId}`);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new HttpsError('not-found', 'Factura no encontrada');
  const inv = invSnap.data();
  if (inv.cae)      throw new HttpsError('failed-precondition', 'La factura ya tiene CAE');

  // Toda la traducción factura → request WSFE es pura y está testeada en voucher.js
  let voucherReq;
  try {
    voucherReq = buildVoucherRequest(inv, secret);
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
  const { cbte, condicionIVAReceptorId, cbteTipo } = voucherReq;

  const { cae, caeFchVto, cbteNro, obs } = await requestCAE(businessId, cbte, condicionIVAReceptorId);

  const newNumberStr = formatVoucherNumber(secret.pointOfSale, cbteNro);
  await invRef.update({
    cae,
    caeExpiresAt: parseAfipDate(caeFchVto),
    afipStatus: 'authorized',
    cbteTipo,
    number: newNumberStr,
    numberInt: cbteNro,
    afipObservations: obs.length ? obs : null,
    condicionIVAReceptorId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    cae,
    caeExpiresAt: parseAfipDate(caeFchVto).toISOString(),
    cbteNro,
    number: newNumberStr,
    observations: obs,
  };
});

// ============================================================
// Helpers
// ============================================================
function requireAuth(req) {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sesión requerida');
}

async function assertOwnerOrThrow(businessId, uid) {
  try {
    await assertBusinessOwner(businessId, uid);
  } catch (err) {
    const code = err.code === 'permission-denied' ? 'permission-denied' : 'not-found';
    throw new HttpsError(code, err.message);
  }
}

