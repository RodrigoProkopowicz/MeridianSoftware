/**
 * afip/config.js — Endpoints y constantes de AFIP por ambiente.
 *
 * Ambientes:
 *   - homologation: testing, sin valor fiscal. Cert distinto al de prod.
 *   - production: emisión real con valor fiscal.
 */

const ENV = {
  homologation: {
    wsaaUrl:   'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfeUrl:   'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    padronUrl: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  },
  production: {
    wsaaUrl:   'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfeUrl:   'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    padronUrl: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  },
};

function endpoints(env) {
  const e = ENV[env];
  if (!e) throw new Error(`Ambiente AFIP inválido: ${env}`);
  return e;
}

// Tipos de comprobante AFIP (cbteTipo) más usados.
const CBTE_TIPO = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
};

// Tipos de documento (DocTipo) AFIP.
const DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,  // No requiere número
  PASAPORTE: 94,
};

// Conceptos: 1 = productos, 2 = servicios, 3 = ambos.
const CONCEPTO = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  AMBOS: 3,
};

// Alícuotas de IVA (IdImp 5) — códigos AFIP.
const IVA_ID = {
  '0':    3,    // 0%
  '10.5': 4,    // 10.5%
  '21':   5,    // 21%
  '27':   6,    // 27%
  '5':    8,    // 5%
  '2.5':  9,    // 2.5%
};

module.exports = {
  endpoints,
  CBTE_TIPO,
  DOC_TIPO,
  CONCEPTO,
  IVA_ID,
};
