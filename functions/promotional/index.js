/**
 * functions/promotional/index.js
 *
 * Backend del módulo promocional (suscripciones Mercado Pago). Tres funciones:
 *
 *   createPromotionalPreapproval  (callable, público) — valida reCAPTCHA, guarda
 *       el lead en `promotionalSubscriptions` y crea la suscripción en MP.
 *   mercadoPagoWebhook            (https) — recibe notificaciones de MP y
 *       sincroniza el estado de la suscripción. Nunca confía en el body crudo:
 *       siempre re-consulta el recurso contra la API de MP con nuestro token.
 *   cancelPromotionalSubscription (callable, admin) — cancela la suscripción
 *       en MP y marca el doc como cancelado.
 *
 * El access token de MP vive solo acá (secret). El cliente nunca lo ve ni
 * escribe en Firestore directamente.
 */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const crypto = require('node:crypto');

const {
  mpAccessToken,
  mpWebhookSecret,
  PROMO_BASE_URL,
  PLAN,
  MIN_AMOUNT,
  MAX_AMOUNT,
  RECAPTCHA_THRESHOLD,
} = require('./config');
const { assessToken } = require('./recaptcha');
const {
  createPreapproval,
  getPreapproval,
  cancelPreapproval,
  getAuthorizedPayment,
  updatePreapprovalAmount,
} = require('./mercadopago');

const COLLECTION = 'promotionalSubscriptions';

// ============================================================
// createPromotionalPreapproval — requiere sesión (cuenta compartida con el sitio)
// ============================================================
exports.createPromotionalPreapproval = onCall(
  { secrets: [mpAccessToken], enforceAppCheck: true },
  async (request) => {
    // El formulario está gateado tras el login: exigimos sesión para crear la
    // suscripción y la atamos a la cuenta del usuario (la misma del sitio principal).
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Iniciá sesión para continuar.');
    }

    const clean = validateAndClean(request.data || {});

    // 1. reCAPTCHA — si hay token y el score es bajo, rechazamos. Si no hay
    //    token (script no cargó), dejamos pasar pero registramos score null.
    const assessment = await assessToken(request.data?.recaptchaToken, 'PROMO_SUBSCRIBE');
    if (assessment.score !== null && assessment.score < RECAPTCHA_THRESHOLD) {
      logger.warn('createPromotionalPreapproval: low reCAPTCHA score', assessment);
      throw new HttpsError('permission-denied', 'No pudimos validar tu solicitud. Probá de nuevo.');
    }

    const token = mpAccessToken.value();
    if (!token) {
      throw new HttpsError('failed-precondition', 'El sistema de pagos no está configurado todavía.');
    }

    // 2. Persistimos el lead primero (status pending), así queda registrado en
    //    el panel aunque el pago no se complete.
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc();
    await docRef.set({
      ...clean,
      userId: request.auth.uid,
      userEmail: request.auth.token.email || null,
      paymentStatus: 'pending',
      workStatus: 'no_iniciado',
      amount: PLAN.amount,
      currency: PLAN.currency,
      priceHistory: [],
      recaptchaScore: assessment.score,
      preapprovalId: null,
      initPoint: null,
      adminNotes: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastPaymentAt: null,
    });

    // 3. Creamos la suscripción en Mercado Pago.
    const backUrl = `${PROMO_BASE_URL}/promo?status=success`;
    let pre;
    try {
      pre = await createPreapproval(token, {
        payerEmail: clean.email,
        externalReference: docRef.id,
        backUrl,
      });
    } catch (err) {
      logger.error('createPromotionalPreapproval: MP error', err.mpBody || err.message);
      await docRef.update({
        paymentStatus: 'error',
        adminNotes: `Error al crear suscripción en MP: ${err.message}`.slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError('unavailable', 'No pudimos generar el pago. Probá más tarde o escribinos por WhatsApp.');
    }

    if (!pre?.init_point) {
      throw new HttpsError('unavailable', 'Mercado Pago no devolvió un link de pago. Probá de nuevo.');
    }

    await docRef.update({
      preapprovalId: pre.id || null,
      initPoint: pre.init_point,
      paymentStatus: pre.status || 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { subscriptionId: docRef.id, initPoint: pre.init_point };
  }
);

// ============================================================
// mercadoPagoWebhook — notificaciones de MP
// ============================================================
exports.mercadoPagoWebhook = onRequest(
  { secrets: [mpAccessToken, mpWebhookSecret] },
  async (req, res) => {
    try {
      if (!verifySignature(req)) {
        logger.warn('mercadoPagoWebhook: invalid signature');
        res.status(401).send('invalid signature');
        return;
      }

      const note = extractNotification(req);
      if (!note.kind || !note.id) {
        res.status(200).send('ignored');
        return;
      }

      // Idempotencia: no reprocesamos la misma entrega. MP manda un x-request-id
      // único por entrega (los reintentos reusan el mismo). Si falta, usamos
      // kind:id:ts — incluimos el ts para NO descartar cambios de estado
      // posteriores de la misma preapproval (pending → authorized).
      const db = getFirestore();
      const requestId = req.get('x-request-id') || '';
      const ts = parseSignatureTs(req.get('x-signature') || '');
      const eventKey = requestId ? `req:${requestId}` : `${note.kind}:${note.id}:${ts || 'no-ts'}`;
      const eventRef = db.collection('promoWebhookEvents').doc(eventKey);
      if ((await eventRef.get()).exists) {
        res.status(200).send('duplicate');
        return;
      }
      await eventRef.set({
        kind: note.kind,
        dataId: note.id,
        requestId: requestId || null,
        ts: ts || null,
        receivedAt: FieldValue.serverTimestamp(),
      });

      try {
        const token = mpAccessToken.value();
        if (note.kind === 'preapproval') {
          const pre = await getPreapproval(token, note.id);
          await applyPreapprovalUpdate(pre);
        } else if (note.kind === 'authorized_payment') {
          const pay = await getAuthorizedPayment(token, note.id);
          await applyAuthorizedPayment(pay);
        }
        res.status(200).send('ok');
      } catch (err) {
        // Liberamos el registro para que MP pueda reintentar la entrega.
        await eventRef.delete().catch(() => {});
        throw err;
      }
    } catch (err) {
      logger.error('mercadoPagoWebhook: error', err.mpBody || err.message);
      // 5xx hace que MP reintente — adecuado para errores transitorios.
      res.status(500).send('error');
    }
  }
);

// ============================================================
// cancelPromotionalSubscription — callable admin
// ============================================================
exports.cancelPromotionalSubscription = onCall(
  { secrets: [mpAccessToken], enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { subscriptionId } = request.data || {};
    if (typeof subscriptionId !== 'string' || !subscriptionId) {
      throw new HttpsError('invalid-argument', '`subscriptionId` must be a non-empty string.');
    }

    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc(subscriptionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Subscription not found.');
    }

    const { preapprovalId } = snap.data() || {};
    if (preapprovalId) {
      try {
        await cancelPreapproval(mpAccessToken.value(), preapprovalId);
      } catch (err) {
        logger.error('cancelPromotionalSubscription: MP cancel failed', err.mpBody || err.message);
        throw new HttpsError('unavailable', `No pudimos cancelar en Mercado Pago: ${err.message}`);
      }
    }

    await ref.update({
      paymentStatus: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { subscriptionId, paymentStatus: 'cancelled' };
  }
);

/**
 * updatePromotionalAmount — cambia el monto mensual de una suscripción (admin).
 *
 * Sincroniza Mercado Pago y Firestore en un solo paso: primero actualiza el
 * preapproval en MP y, sólo si eso sale bien, persiste el nuevo monto + una
 * entrada en `priceHistory`. Si MP rechaza el cambio no se toca el doc (evita
 * desincronizar). El nuevo valor aplica a los cobros futuros, sin que el
 * cliente tenga que re-autorizar.
 */
exports.updatePromotionalAmount = onCall(
  { secrets: [mpAccessToken], enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin privileges required.');
    }

    const { subscriptionId, amount, note } = request.data || {};
    if (typeof subscriptionId !== 'string' || !subscriptionId) {
      throw new HttpsError('invalid-argument', '`subscriptionId` must be a non-empty string.');
    }

    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum < MIN_AMOUNT || amountNum > MAX_AMOUNT) {
      throw new HttpsError(
        'invalid-argument',
        `El monto debe ser un número entero entre ${MIN_AMOUNT} y ${MAX_AMOUNT}.`,
      );
    }
    const cleanNote = String(note ?? '').trim().slice(0, 300);

    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc(subscriptionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Subscription not found.');
    }

    const data = snap.data() || {};
    const { preapprovalId, paymentStatus } = data;
    const previousAmount = typeof data.amount === 'number' ? data.amount : PLAN.amount;
    const currency = data.currency || PLAN.currency;

    if (paymentStatus === 'cancelled' || !preapprovalId) {
      throw new HttpsError(
        'failed-precondition',
        'No se puede cambiar el precio: la suscripción está cancelada o no tiene una suscripción activa en Mercado Pago.',
      );
    }

    // Sin cambios: evitamos un PUT innecesario a MP.
    if (amountNum === previousAmount) {
      return { subscriptionId, amount: amountNum, unchanged: true };
    }

    // 1. Actualizamos primero en MP. Si falla, no tocamos el doc.
    try {
      await updatePreapprovalAmount(mpAccessToken.value(), preapprovalId, {
        amount: amountNum,
        currency,
      });
    } catch (err) {
      logger.error('updatePromotionalAmount: MP update failed', err.mpBody || err.message);
      throw new HttpsError('unavailable', `No pudimos actualizar el monto en Mercado Pago: ${err.message}`);
    }

    // 2. Persistimos el nuevo monto + entrada de auditoría.
    const entry = {
      amount: amountNum,
      previousAmount,
      at: Timestamp.now(),
      byUid: request.auth.uid,
      byEmail: request.auth.token.email || null,
      note: cleanNote,
    };
    await ref.update({
      amount: amountNum,
      amountUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      priceHistory: FieldValue.arrayUnion(entry),
    });

    return { subscriptionId, amount: amountNum };
  }
);

// ============================================================
// Helpers
// ============================================================

/**
 * Valida y normaliza el payload del formulario. Lanza HttpsError
 * 'invalid-argument' si falta algo obligatorio.
 */
function validateAndClean(data) {
  const str = (v, max) => String(v ?? '').trim().slice(0, max);

  const businessName = str(data.businessName, 200);
  const businessType = str(data.businessType, 100);
  const email = str(data.email, 200);
  const phone = String(data.phone ?? '').replace(/\D/g, '').slice(0, 15);
  const phoneRaw = str(data.phoneRaw, 30);
  const description = str(data.description, 2000);
  const references = str(data.references, 500);
  const stylePreferences = str(data.stylePreferences, 300);
  const wantsDomain = data.wantsDomain === true;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!businessName) throw new HttpsError('invalid-argument', 'Falta el nombre del negocio.');
  if (!businessType) throw new HttpsError('invalid-argument', 'Falta el rubro.');
  if (!emailOk) throw new HttpsError('invalid-argument', 'Email inválido.');
  if (phone.length < 8) throw new HttpsError('invalid-argument', 'Teléfono inválido.');
  if (description.length < 10) throw new HttpsError('invalid-argument', 'La descripción es muy corta.');

  return {
    businessName, businessType, email, phone, phoneRaw,
    description, references, stylePreferences, wantsDomain,
  };
}

/**
 * Mapea el formato de notificación de MP (webhook v2 JSON o IPN por query)
 * a `{ kind, id }`.
 */
function extractNotification(req) {
  const body = req.body || {};
  const query = req.query || {};

  const type = body.type || query.type || query.topic || '';
  const id = body?.data?.id || query['data.id'] || query.id || body.id || '';

  let kind = null;
  if (type === 'subscription_preapproval' || type === 'preapproval') kind = 'preapproval';
  else if (type === 'subscription_authorized_payment' || type === 'authorized_payment') kind = 'authorized_payment';

  return { kind, id: id ? String(id) : '' };
}

/**
 * Verifica la firma x-signature de MP. Defensa en profundidad: solo se aplica
 * si MP_WEBHOOK_SECRET está configurado. Aunque falle/falte, igual re-consultamos
 * el recurso contra la API de MP, así que nunca confiamos en el body crudo.
 *
 * @returns {boolean} true si es válida o si no hay secreto configurado.
 */
function verifySignature(req) {
  let secret = '';
  try { secret = mpWebhookSecret.value(); } catch (_) { secret = ''; }
  if (!secret) return true; // sin secreto configurado: no bloqueamos

  const signatureHeader = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  if (!signatureHeader) return true; // algunas notificaciones (test) no firman

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(kv => kv.split('=').map(s => s.trim()))
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataId = String(req.query['data.id'] || req.query.id || req.body?.data?.id || '').toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(v1));
  } catch (_) {
    return false;
  }
}

/** Extrae el `ts` del header x-signature de MP (para la clave de idempotencia). */
function parseSignatureTs(signatureHeader) {
  if (!signatureHeader) return null;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.trim().split('=').map(s => s.trim()))
  );
  return parts.ts || null;
}

/** Estados de preapproval de MP que persistimos tal cual. */
function normalizeStatus(status) {
  const allowed = ['pending', 'authorized', 'paused', 'cancelled'];
  return allowed.includes(status) ? status : 'pending';
}

async function findSubscriptionRef(db, pre) {
  if (pre.external_reference) {
    const ref = db.collection(COLLECTION).doc(String(pre.external_reference));
    const snap = await ref.get();
    if (snap.exists) return ref;
  }
  if (pre.id) {
    const q = await db.collection(COLLECTION).where('preapprovalId', '==', String(pre.id)).limit(1).get();
    if (!q.empty) return q.docs[0].ref;
  }
  return null;
}

async function applyPreapprovalUpdate(pre) {
  const db = getFirestore();
  const ref = await findSubscriptionRef(db, pre);
  if (!ref) {
    logger.warn('mercadoPagoWebhook: no subscription doc for preapproval', pre.id);
    return;
  }
  await ref.update({
    paymentStatus: normalizeStatus(pre.status),
    preapprovalId: pre.id ? String(pre.id) : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function applyAuthorizedPayment(pay) {
  const preapprovalId = pay.preapproval_id;
  if (!preapprovalId) return;
  const db = getFirestore();
  const q = await db.collection(COLLECTION).where('preapprovalId', '==', String(preapprovalId)).limit(1).get();
  if (q.empty) {
    logger.warn('mercadoPagoWebhook: no subscription doc for authorized_payment', preapprovalId);
    return;
  }
  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (pay.status === 'processed' || pay.status === 'approved') {
    patch.lastPaymentAt = FieldValue.serverTimestamp();
    patch.paymentStatus = 'authorized';
  }
  await q.docs[0].ref.update(patch);
}
