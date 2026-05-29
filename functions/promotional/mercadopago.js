/**
 * functions/promotional/mercadopago.js
 *
 * Cliente mínimo de la API de Mercado Pago (Suscripciones / Preapproval) vía
 * fetch nativo (Node 22). Sin dependencias extra para mantener el módulo liviano.
 *
 * Docs: https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
 */

const { MP_API_BASE, PLAN } = require('./config');

/**
 * @param {string} accessToken
 * @param {string} path
 * @param {{ method?: string, body?: any }} [opts]
 */
async function mpRequest(accessToken, path, opts = {}) {
  const { method = 'GET', body } = opts;
  const res = await fetch(`${MP_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }

  if (!res.ok) {
    const message = data?.message || data?.error || `MP ${method} ${path} → HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.mpBody = data;
    throw err;
  }
  return data;
}

/**
 * Crea una suscripción (preapproval) con monto fijo mensual.
 *
 * @param {string} accessToken
 * @param {{ payerEmail: string, externalReference: string, backUrl: string, reason?: string }} args
 * @returns {Promise<{ id: string, init_point: string, status: string }>}
 */
async function createPreapproval(accessToken, { payerEmail, externalReference, backUrl, reason }) {
  return mpRequest(accessToken, '/preapproval', {
    method: 'POST',
    body: {
      reason: reason || PLAN.reason,
      external_reference: externalReference,
      payer_email: payerEmail,
      back_url: backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: PLAN.frequency,
        frequency_type: PLAN.frequencyType,
        transaction_amount: PLAN.amount,
        currency_id: PLAN.currency,
      },
    },
  });
}

/**
 * Lee el estado actual de una preapproval.
 * @param {string} accessToken
 * @param {string} preapprovalId
 */
async function getPreapproval(accessToken, preapprovalId) {
  return mpRequest(accessToken, `/preapproval/${encodeURIComponent(preapprovalId)}`);
}

/**
 * Cancela una preapproval (suscripción).
 * @param {string} accessToken
 * @param {string} preapprovalId
 */
async function cancelPreapproval(accessToken, preapprovalId) {
  return mpRequest(accessToken, `/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    body: { status: 'cancelled' },
  });
}

/**
 * Lee un pago autorizado de una suscripción (para registrar lastPaymentAt).
 * @param {string} accessToken
 * @param {string} authorizedPaymentId
 */
async function getAuthorizedPayment(accessToken, authorizedPaymentId) {
  return mpRequest(accessToken, `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);
}

/**
 * Actualiza el monto mensual de una suscripción existente. MP aplica el nuevo
 * valor a los cobros futuros sin requerir re-autorización del cliente.
 *
 * @param {string} accessToken
 * @param {string} preapprovalId
 * @param {{ amount: number, currency: string }} args
 */
async function updatePreapprovalAmount(accessToken, preapprovalId, { amount, currency }) {
  return mpRequest(accessToken, `/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    body: {
      auto_recurring: {
        transaction_amount: amount,
        currency_id: currency,
      },
    },
  });
}

module.exports = {
  createPreapproval,
  getPreapproval,
  cancelPreapproval,
  getAuthorizedPayment,
  updatePreapprovalAmount,
};
