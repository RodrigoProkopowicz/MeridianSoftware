/**
 * afip/voucher.js — Armado puro del comprobante WSFE (sin red, sin Firestore).
 *
 * Toda la traducción factura-de-Stock-Manager → request FECAESolicitar vive
 * acá para poder testearla sin emular AFIP: mapeo de tipos, identificación
 * del receptor, CondicionIVAReceptorId (RG 5616), agregación de IVA por
 * alícuota y fechas.
 *
 * `index.js` (callables) y los scripts de smoke test usan exactamente estas
 * funciones — lo que pasa los tests es lo que se emite.
 */

const { CBTE_TIPO, DOC_TIPO, CONCEPTO, IVA_ID } = require('./config');

// CondicionIVAReceptorId (RG 5616 — sept 2024). Códigos AFIP/ARCA.
const COND_IVA_RECEPTOR = {
  RI:                    1,   // Responsable Inscripto
  EXENTO:                4,   // IVA Sujeto Exento
  CONSUMIDOR_FINAL:      5,
  MONOTRIBUTO:           6,   // Responsable Monotributo
  NO_CATEGORIZADO:       7,   // Sujeto No Categorizado / No Responsable
  PROVEEDOR_EXTERIOR:    8,
  CLIENTE_EXTERIOR:      9,
  IVA_LIBERADO:          10,
  MONOTRIBUTO_SOCIAL:    13,
  IVA_NO_ALCANZADO:      15,
  MT_PROMOVIDO:          16,
};

/** Tipo de comprobante AFIP para cada tipo de factura de la app. */
function resolveCbteTipo(type) {
  if (type === 'A') return CBTE_TIPO.FACTURA_A;
  if (type === 'B') return CBTE_TIPO.FACTURA_B;
  if (type === 'C') return CBTE_TIPO.FACTURA_C;
  return null;
}

/**
 * DocTipo + DocNro del receptor a partir del snapshot del cliente.
 * Sin taxId → Consumidor Final (99 / 0).
 */
function resolveReceptorDoc(clientSnapshot) {
  const cli = clientSnapshot || {};
  let docTipo = DOC_TIPO.CONSUMIDOR_FINAL;
  let docNro = 0;
  if (cli.taxId) {
    const cleanDoc = String(cli.taxId).replace(/[^0-9]/g, '');
    const typeStr = String(cli.taxIdType || '').toUpperCase();
    if (typeStr === 'CUIL')      docTipo = DOC_TIPO.CUIL;
    else if (typeStr === 'DNI')  docTipo = DOC_TIPO.DNI;
    else if (cleanDoc.length === 11) docTipo = DOC_TIPO.CUIT;
    else if (cleanDoc.length === 8 || cleanDoc.length === 7) docTipo = DOC_TIPO.DNI;
    else docTipo = DOC_TIPO.CUIT;
    docNro = Number(cleanDoc) || 0;
  }
  return { docTipo, docNro };
}

/**
 * Mapea la condición fiscal del receptor (string libre) al código AFIP
 * para CondicionIVAReceptorId (RG 5616). Default = Consumidor Final.
 */
function mapReceptorCondition(taxCondition, docNro) {
  const c = String(taxCondition || '').toLowerCase();
  if (c.includes('responsable inscripto')) return COND_IVA_RECEPTOR.RI;
  if (c.includes('monotrib'))              return COND_IVA_RECEPTOR.MONOTRIBUTO;
  if (c.includes('exento'))                return COND_IVA_RECEPTOR.EXENTO;
  if (c.includes('no responsable') ||
      c.includes('no categorizado'))       return COND_IVA_RECEPTOR.NO_CATEGORIZADO;
  if (c.includes('consumidor final'))      return COND_IVA_RECEPTOR.CONSUMIDOR_FINAL;
  // Sin condición declarada: si no hay doc, asumimos CF
  return docNro ? COND_IVA_RECEPTOR.NO_CATEGORIZADO : COND_IVA_RECEPTOR.CONSUMIDOR_FINAL;
}

/**
 * Importes del comprobante.
 *
 * - Tipo C (monotributo): no discrimina IVA — todo el total va en ImpNeto.
 * - Tipos A/B: ImpNeto = subtotal, ImpIVA = taxTotal, más el array de IVA
 *   agregado por alícuota. WSFE exige que sum(Iva.Importe) == ImpIVA, por eso
 *   una alícuota que AFIP no reconoce es error (antes se filtraba en silencio
 *   y ARCA rechazaba con un mensaje críptico).
 *
 * @returns {{ impNeto: number, impIVA: number, ivaArray: Array }}
 */
function buildImportes(inv) {
  const subtotal = Number(inv.subtotal || 0);
  const taxTotal = Number(inv.taxTotal || 0);
  const total    = Number(inv.total || 0);

  if (inv.type === 'C') {
    return { impNeto: round2(total), impIVA: 0, ivaArray: [] };
  }

  const byRate = new Map();
  (inv.lineItems || []).forEach(it => {
    const rate = Number(it.taxRate || 0);
    const cur = byRate.get(rate) || { baseImp: 0, importe: 0 };
    cur.baseImp += Number(it.subtotal || 0);
    cur.importe += Number(it.taxAmount || 0);
    byRate.set(rate, cur);
  });

  const unsupported = Array.from(byRate.keys()).filter(r => IVA_ID[String(r)] === undefined);
  if (unsupported.length) {
    throw new Error(
      `Alícuota de IVA no soportada por ARCA: ${unsupported.join('%, ')}%. ` +
      `Válidas: ${Object.keys(IVA_ID).join('%, ')}%.`
    );
  }

  const ivaArray = Array.from(byRate.entries()).map(([rate, v]) => ({
    id: IVA_ID[String(rate)],
    baseImp: round2(v.baseImp),
    importe: round2(v.importe),
  }));

  return { impNeto: round2(subtotal), impIVA: round2(taxTotal), ivaArray };
}

/**
 * Request completo listo para `wsfe.requestCAE` a partir de la factura y la
 * config del comercio. Valida reglas duras (tipo soportado, Factura A exige
 * CUIT del receptor).
 *
 * @param {object} inv    doc de la factura (type, clientSnapshot, importes, lineItems)
 * @param {object} secret config AFIP del comercio ({ pointOfSale })
 * @param {Date}   [today] fecha del comprobante (default: hoy)
 * @returns {{ cbte: object, condicionIVAReceptorId: number, cbteTipo: number }}
 */
function buildVoucherRequest(inv, secret, today = new Date()) {
  if (inv.type === 'X') throw new Error('Tipo X es interno (no AFIP)');
  const cbteTipo = resolveCbteTipo(inv.type);
  if (!cbteTipo) throw new Error(`Tipo no soportado: ${inv.type}`);

  const { docTipo, docNro } = resolveReceptorDoc(inv.clientSnapshot);
  if (inv.type === 'A' && (docTipo !== DOC_TIPO.CUIT || !docNro)) {
    throw new Error('Factura A requiere CUIT del receptor');
  }

  const condicionIVAReceptorId = mapReceptorCondition(inv.clientSnapshot?.taxCondition, docNro);
  const { impNeto, impIVA, ivaArray } = buildImportes(inv);

  const cbte = {
    ptoVta: Number(secret.pointOfSale),
    cbteTipo,
    concepto: CONCEPTO.PRODUCTOS,
    docTipo,
    docNro,
    cbteFch: formatCbteFch(today),
    impTotal: round2(Number(inv.total || 0)),
    impNeto,
    impIVA,
    impTotConc: 0,
    impOpEx: 0,
    impTrib: 0,
    moneda: inv.currency === 'ARS' ? 'PES' : (inv.currency || 'PES'),
    monCotiz: 1,
    iva: ivaArray,
  };

  return { cbte, condicionIVAReceptorId, cbteTipo };
}

/** Fecha del comprobante en formato yyyymmdd (string). */
function formatCbteFch(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

/** Número visible "PPPP-NNNNNNNN" a partir del PV y el número que asignó AFIP. */
function formatVoucherNumber(pointOfSale, cbteNro) {
  return `${String(pointOfSale).padStart(4, '0')}-${String(cbteNro).padStart(8, '0')}`;
}

/** "yyyymmdd" → Date (UTC). Formato inválido → hoy (no bloquea la emisión). */
function parseAfipDate(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (s.length !== 8) return new Date();
  return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function round2(n) { return Math.round(Number(n) * 100) / 100; }

module.exports = {
  COND_IVA_RECEPTOR,
  resolveCbteTipo,
  resolveReceptorDoc,
  mapReceptorCondition,
  buildImportes,
  buildVoucherRequest,
  formatCbteFch,
  formatVoucherNumber,
  parseAfipDate,
};
