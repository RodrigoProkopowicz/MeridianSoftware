/**
 * afip/wsfe.js — Operaciones WSFEv1 vía SDK oficial @afipsdk/afip.js.
 *
 * El SDK maneja:
 *  - WSAA: solicita TA y lo cachea internamente.
 *  - WSFE: build de SOAP, parsing, mapeo de errores.
 *  - Reintentos en errores transient.
 *
 * Para producción AfipSDK puede requerir cert+key propios; con la cuenta dev
 * y delegación de WSFE a la CUIT de AfipSDK alcanza para homologación.
 *
 * RG 5616 (sept 2024): los comprobantes ahora requieren
 * `CondicionIVAReceptorId` con el código de condición frente al IVA del
 * receptor (1 = RI, 5 = CF, 6 = Monotributo, etc.).
 */

const Afip = require('@afipsdk/afip.js');
const { readSecret } = require('./store');

function getAccessToken() {
  const t = process.env.AFIPSDK_ACCESS_TOKEN;
  if (!t) throw new Error('AFIPSDK_ACCESS_TOKEN no configurado en Functions');
  return t;
}

/**
 * Instancia el SDK con la config del comercio.
 * Siempre producción. Si el secret tiene cert+key (modo express con cert
 * propio), los pasamos al SDK para que firme directamente. Si no, el SDK
 * intenta vía AfipSDK proxy (modo delegación legacy).
 */
function getAfipInstance(secret) {
  if (!secret) throw new Error('AFIP no configurado para este comercio');
  if (!secret.cuit) throw new Error('Falta CUIT del emisor');

  const opts = {
    CUIT: Number(secret.cuit),
    access_token: getAccessToken(),
    production: true,
  };
  if (secret.cert && secret.key) {
    opts.cert = secret.cert;
    opts.key  = secret.key;
  }
  return new Afip(opts);
}

/**
 * FEDummy — ping al servicio. No requiere auth.
 */
async function dummy(secret) {
  const afip = getAfipInstance(secret);
  const status = await afip.ElectronicBilling.getServerStatus();
  return {
    appServer:  status.AppServer  || 'unknown',
    dbServer:   status.DbServer   || 'unknown',
    authServer: status.AuthServer || 'unknown',
  };
}

/**
 * Último número autorizado por AFIP para un PV + tipo de comprobante.
 */
async function getLastAuthorized(businessId, { ptoVta, cbteTipo }) {
  const secret = await readSecret(businessId);
  const afip = getAfipInstance(secret);
  const last = await afip.ElectronicBilling.getLastVoucher(
    Number(ptoVta),
    Number(cbteTipo),
  );
  return Number(last || 0);
}

/**
 * Solicita CAE para un comprobante. Maneja la numeración automática:
 * consulta el último número autorizado y emite el siguiente.
 *
 * @returns {Promise<{ cae, caeFchVto, cbteNro, resultado, obs }>}
 */
async function requestCAE(businessId, cbte, condicionIVAReceptorId) {
  const secret = await readSecret(businessId);
  const afip = getAfipInstance(secret);

  // Number management: AFIP asigna el siguiente al último
  const last = await afip.ElectronicBilling.getLastVoucher(
    Number(cbte.ptoVta),
    Number(cbte.cbteTipo),
  );
  const cbteNro = Number(last || 0) + 1;

  const data = {
    CantReg: 1,
    PtoVta: Number(cbte.ptoVta),
    CbteTipo: Number(cbte.cbteTipo),
    Concepto: Number(cbte.concepto || 1),
    DocTipo: Number(cbte.docTipo),
    DocNro: Number(cbte.docNro || 0),
    CbteDesde: cbteNro,
    CbteHasta: cbteNro,
    CbteFch: Number(cbte.cbteFch),  // yyyymmdd as integer
    ImpTotal:   round2(cbte.impTotal),
    ImpTotConc: round2(cbte.impTotConc || 0),
    ImpNeto:    round2(cbte.impNeto || 0),
    ImpOpEx:    round2(cbte.impOpEx || 0),
    ImpTrib:    round2(cbte.impTrib || 0),
    ImpIVA:     round2(cbte.impIVA || 0),
    MonId:      String(cbte.moneda || 'PES'),
    MonCotiz:   round2(cbte.monCotiz || 1),
    CondicionIVAReceptorId: Number(condicionIVAReceptorId || 5), // 5 = Consumidor Final default
  };

  if (Array.isArray(cbte.iva) && cbte.iva.length > 0) {
    data.Iva = cbte.iva.map(it => ({
      Id: Number(it.id),
      BaseImp: round2(it.baseImp),
      Importe: round2(it.importe),
    }));
  }

  // SDK lanza con detalle si AFIP rechaza; si retorna, fue aprobado.
  const result = await afip.ElectronicBilling.createVoucher(data);

  return {
    cae: String(result.CAE || ''),
    caeFchVto: normalizeCaeDate(result.CAEFchVto),
    cbteNro,
    resultado: 'A',
    obs: [],
  };
}

/**
 * AFIP devuelve la fecha de vto del CAE como `yyyy-mm-dd` o `yyyymmdd` según
 * versión. Normalizamos a yyyymmdd (numérico) para parsearlo del lado del
 * caller con la misma función parseAfipDate de siempre.
 */
function normalizeCaeDate(v) {
  const s = String(v || '').replace(/-/g, '');
  return s.length === 8 ? s : '';
}

function round2(n) {
  return Number((Number(n) || 0).toFixed(2));
}

module.exports = {
  dummy,
  getLastAuthorized,
  requestCAE,
  getAfipInstance,
};
