/**
 * Tests de afip/voucher.js — armado puro del comprobante WSFE.
 *
 * Correr con: npm test (node --test, sin dependencias).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  COND_IVA_RECEPTOR,
  resolveCbteTipo,
  resolveReceptorDoc,
  mapReceptorCondition,
  buildImportes,
  buildVoucherRequest,
  formatCbteFch,
  formatVoucherNumber,
  parseAfipDate,
} = require('./voucher');

// ============================================================
// resolveCbteTipo
// ============================================================
describe('resolveCbteTipo', () => {
  test('mapea A/B/C a los códigos AFIP', () => {
    assert.equal(resolveCbteTipo('A'), 1);
    assert.equal(resolveCbteTipo('B'), 6);
    assert.equal(resolveCbteTipo('C'), 11);
  });

  test('X y desconocidos devuelven null', () => {
    assert.equal(resolveCbteTipo('X'), null);
    assert.equal(resolveCbteTipo('Z'), null);
    assert.equal(resolveCbteTipo(undefined), null);
  });
});

// ============================================================
// resolveReceptorDoc
// ============================================================
describe('resolveReceptorDoc', () => {
  test('sin cliente → Consumidor Final (99/0)', () => {
    assert.deepEqual(resolveReceptorDoc(null), { docTipo: 99, docNro: 0 });
    assert.deepEqual(resolveReceptorDoc({}), { docTipo: 99, docNro: 0 });
    assert.deepEqual(resolveReceptorDoc({ taxId: '' }), { docTipo: 99, docNro: 0 });
  });

  test('CUIT de 11 dígitos → DocTipo 80', () => {
    assert.deepEqual(
      resolveReceptorDoc({ taxId: '30712345678' }),
      { docTipo: 80, docNro: 30712345678 },
    );
  });

  test('CUIT con guiones se limpia', () => {
    assert.deepEqual(
      resolveReceptorDoc({ taxId: '30-71234567-8' }),
      { docTipo: 80, docNro: 30712345678 },
    );
  });

  test('taxIdType explícito manda: DNI y CUIL', () => {
    assert.deepEqual(
      resolveReceptorDoc({ taxId: '30123456', taxIdType: 'DNI' }),
      { docTipo: 96, docNro: 30123456 },
    );
    assert.deepEqual(
      resolveReceptorDoc({ taxId: '20301234563', taxIdType: 'CUIL' }),
      { docTipo: 86, docNro: 20301234563 },
    );
  });

  test('7 u 8 dígitos sin tipo → DNI', () => {
    assert.equal(resolveReceptorDoc({ taxId: '30123456' }).docTipo, 96);
    assert.equal(resolveReceptorDoc({ taxId: '3012345' }).docTipo, 96);
  });
});

// ============================================================
// mapReceptorCondition (RG 5616)
// ============================================================
describe('mapReceptorCondition', () => {
  test('strings típicos del padrón', () => {
    assert.equal(mapReceptorCondition('Responsable Inscripto', 1), COND_IVA_RECEPTOR.RI);
    assert.equal(mapReceptorCondition('Monotributista', 1), COND_IVA_RECEPTOR.MONOTRIBUTO);
    assert.equal(mapReceptorCondition('Responsable Monotributo', 1), COND_IVA_RECEPTOR.MONOTRIBUTO);
    assert.equal(mapReceptorCondition('Exento', 1), COND_IVA_RECEPTOR.EXENTO);
    assert.equal(mapReceptorCondition('IVA Sujeto Exento', 1), COND_IVA_RECEPTOR.EXENTO);
    assert.equal(mapReceptorCondition('No Responsable', 1), COND_IVA_RECEPTOR.NO_CATEGORIZADO);
    assert.equal(mapReceptorCondition('Sujeto No Categorizado', 1), COND_IVA_RECEPTOR.NO_CATEGORIZADO);
    assert.equal(mapReceptorCondition('Consumidor Final', 0), COND_IVA_RECEPTOR.CONSUMIDOR_FINAL);
  });

  test('case-insensitive', () => {
    assert.equal(mapReceptorCondition('RESPONSABLE INSCRIPTO', 1), COND_IVA_RECEPTOR.RI);
  });

  test('sin condición: con doc → No Categorizado, sin doc → CF', () => {
    assert.equal(mapReceptorCondition('', 20301234563), COND_IVA_RECEPTOR.NO_CATEGORIZADO);
    assert.equal(mapReceptorCondition(null, 0), COND_IVA_RECEPTOR.CONSUMIDOR_FINAL);
  });
});

// ============================================================
// buildImportes
// ============================================================
describe('buildImportes', () => {
  test('tipo C: todo el total va en ImpNeto, sin array de IVA', () => {
    const r = buildImportes({
      type: 'C', subtotal: 1000, taxTotal: 0, total: 1210,
      lineItems: [{ subtotal: 1210, taxAmount: 0, taxRate: 0 }],
    });
    assert.deepEqual(r, { impNeto: 1210, impIVA: 0, ivaArray: [] });
  });

  test('tipo B con IVA 21%: agrega por alícuota con código AFIP 5', () => {
    const r = buildImportes({
      type: 'B', subtotal: 1000, taxTotal: 210, total: 1210,
      lineItems: [
        { subtotal: 600, taxAmount: 126, taxRate: 21 },
        { subtotal: 400, taxAmount: 84,  taxRate: 21 },
      ],
    });
    assert.equal(r.impNeto, 1000);
    assert.equal(r.impIVA, 210);
    assert.deepEqual(r.ivaArray, [{ id: 5, baseImp: 1000, importe: 210 }]);
  });

  test('alícuotas mixtas 21% + 10.5% generan dos entradas', () => {
    const r = buildImportes({
      type: 'A', subtotal: 2000, taxTotal: 315, total: 2315,
      lineItems: [
        { subtotal: 1000, taxAmount: 210, taxRate: 21 },
        { subtotal: 1000, taxAmount: 105, taxRate: 10.5 },
      ],
    });
    assert.equal(r.ivaArray.length, 2);
    const ids = r.ivaArray.map(x => x.id).sort();
    assert.deepEqual(ids, [4, 5]);
  });

  test('IVA 0% usa el código AFIP 3', () => {
    const r = buildImportes({
      type: 'B', subtotal: 500, taxTotal: 0, total: 500,
      lineItems: [{ subtotal: 500, taxAmount: 0, taxRate: 0 }],
    });
    assert.deepEqual(r.ivaArray, [{ id: 3, baseImp: 500, importe: 0 }]);
  });

  test('alícuota desconocida lanza error claro (antes se filtraba y ARCA rechazaba)', () => {
    assert.throws(
      () => buildImportes({
        type: 'B', subtotal: 100, taxTotal: 15, total: 115,
        lineItems: [{ subtotal: 100, taxAmount: 15, taxRate: 15 }],
      }),
      /Alícuota de IVA no soportada/,
    );
  });

  test('redondea a 2 decimales las sumas por alícuota', () => {
    const r = buildImportes({
      type: 'B', subtotal: 0.3, taxTotal: 0.06, total: 0.36,
      lineItems: [
        { subtotal: 0.1, taxAmount: 0.02, taxRate: 21 },
        { subtotal: 0.2, taxAmount: 0.04, taxRate: 21 },
      ],
    });
    assert.equal(r.ivaArray[0].baseImp, 0.3);
    assert.equal(r.ivaArray[0].importe, 0.06);
  });
});

// ============================================================
// buildVoucherRequest
// ============================================================
describe('buildVoucherRequest', () => {
  const secret = { pointOfSale: 3 };
  const fixedDate = new Date(2026, 7, 18); // 18-ago-2026 local

  test('factura C de consumidor final: request completo', () => {
    const { cbte, condicionIVAReceptorId, cbteTipo } = buildVoucherRequest({
      type: 'C', total: 1500, subtotal: 1500, taxTotal: 0,
      currency: 'ARS',
      clientSnapshot: null,
      lineItems: [{ subtotal: 1500, taxAmount: 0, taxRate: 0 }],
    }, secret, fixedDate);

    assert.equal(cbteTipo, 11);
    assert.equal(condicionIVAReceptorId, COND_IVA_RECEPTOR.CONSUMIDOR_FINAL);
    assert.equal(cbte.ptoVta, 3);
    assert.equal(cbte.cbteFch, '20260818');
    assert.equal(cbte.docTipo, 99);
    assert.equal(cbte.docNro, 0);
    assert.equal(cbte.impTotal, 1500);
    assert.equal(cbte.impNeto, 1500);
    assert.equal(cbte.impIVA, 0);
    assert.equal(cbte.moneda, 'PES');
    assert.equal(cbte.monCotiz, 1);
    assert.equal(cbte.concepto, 1);
  });

  test('factura A a RI con CUIT: DocTipo 80 + condición 1', () => {
    const { cbte, condicionIVAReceptorId } = buildVoucherRequest({
      type: 'A', subtotal: 1000, taxTotal: 210, total: 1210,
      clientSnapshot: { taxId: '30-71234567-8', taxCondition: 'Responsable Inscripto' },
      lineItems: [{ subtotal: 1000, taxAmount: 210, taxRate: 21 }],
    }, secret, fixedDate);

    assert.equal(condicionIVAReceptorId, COND_IVA_RECEPTOR.RI);
    assert.equal(cbte.docTipo, 80);
    assert.equal(cbte.docNro, 30712345678);
    assert.equal(cbte.impTotal, cbte.impNeto + cbte.impIVA);
  });

  test('factura A sin CUIT del receptor lanza', () => {
    assert.throws(
      () => buildVoucherRequest({ type: 'A', total: 100, clientSnapshot: null, lineItems: [] }, secret),
      /Factura A requiere CUIT/,
    );
    assert.throws(
      () => buildVoucherRequest({
        type: 'A', total: 100,
        clientSnapshot: { taxId: '30123456', taxIdType: 'DNI' },
        lineItems: [],
      }, secret),
      /Factura A requiere CUIT/,
    );
  });

  test('tipo X e inválidos lanzan', () => {
    assert.throws(() => buildVoucherRequest({ type: 'X' }, secret), /Tipo X es interno/);
    assert.throws(() => buildVoucherRequest({ type: 'Z' }, secret), /Tipo no soportado/);
  });

  test('moneda distinta de ARS se pasa tal cual', () => {
    const { cbte } = buildVoucherRequest({
      type: 'C', total: 100, currency: 'USD', clientSnapshot: null, lineItems: [],
    }, secret, fixedDate);
    assert.equal(cbte.moneda, 'USD');
  });
});

// ============================================================
// Helpers de formato
// ============================================================
describe('helpers de formato', () => {
  test('formatCbteFch: yyyymmdd', () => {
    assert.equal(formatCbteFch(new Date(2026, 0, 5)), '20260105');
    assert.equal(formatCbteFch(new Date(2026, 11, 31)), '20261231');
  });

  test('formatVoucherNumber: PPPP-NNNNNNNN', () => {
    assert.equal(formatVoucherNumber(1, 123), '0001-00000123');
    assert.equal(formatVoucherNumber(315, 98765432), '0315-98765432');
  });

  test('parseAfipDate: yyyymmdd → Date UTC', () => {
    const d = parseAfipDate('20261231');
    assert.equal(d.toISOString(), '2026-12-31T00:00:00.000Z');
  });

  test('parseAfipDate: formato inválido no explota', () => {
    assert.ok(parseAfipDate('') instanceof Date);
    assert.ok(parseAfipDate(null) instanceof Date);
    assert.ok(!isNaN(parseAfipDate('junk').getTime()));
  });
});

// ============================================================
// toWsfeData (wsfe.js) — cbte → payload FECAESolicitar
// ============================================================
describe('toWsfeData', () => {
  const { toWsfeData } = require('./wsfe');

  test('mapea el cbte completo a los campos WSFE', () => {
    const { cbte, condicionIVAReceptorId } = buildVoucherRequest({
      type: 'B', subtotal: 1000, taxTotal: 210, total: 1210,
      clientSnapshot: { taxCondition: 'Consumidor Final' },
      lineItems: [{ subtotal: 1000, taxAmount: 210, taxRate: 21 }],
    }, { pointOfSale: 2 }, new Date(2026, 7, 18));

    const data = toWsfeData(cbte, 45, condicionIVAReceptorId);

    assert.equal(data.CantReg, 1);
    assert.equal(data.PtoVta, 2);
    assert.equal(data.CbteTipo, 6);
    assert.equal(data.CbteDesde, 45);
    assert.equal(data.CbteHasta, 45);
    assert.equal(data.CbteFch, 20260818);
    assert.equal(data.ImpTotal, 1210);
    assert.equal(data.ImpNeto, 1000);
    assert.equal(data.ImpIVA, 210);
    assert.equal(data.MonId, 'PES');
    assert.equal(data.MonCotiz, 1);
    assert.equal(data.CondicionIVAReceptorId, 5);
    assert.deepEqual(data.Iva, [{ Id: 5, BaseImp: 1000, Importe: 210 }]);
    // WSFE exige ImpTotal = ImpTotConc + ImpNeto + ImpOpEx + ImpIVA + ImpTrib
    assert.equal(
      data.ImpTotal,
      data.ImpTotConc + data.ImpNeto + data.ImpOpEx + data.ImpIVA + data.ImpTrib,
    );
  });

  test('sin IVA no incluye el array Iva (tipo C)', () => {
    const { cbte, condicionIVAReceptorId } = buildVoucherRequest({
      type: 'C', total: 500, clientSnapshot: null, lineItems: [],
    }, { pointOfSale: 1 }, new Date(2026, 7, 18));
    const data = toWsfeData(cbte, 1, condicionIVAReceptorId);
    assert.equal(data.Iva, undefined);
    assert.equal(data.CbteTipo, 11);
    assert.equal(data.ImpNeto, 500);
  });
});
