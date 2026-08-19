/**
 * arca-e2e-homologacion.js — Smoke test E2E contra ARCA homologación.
 *
 * Emite comprobantes reales en el ambiente de HOMOLOGACIÓN de ARCA (sandbox
 * oficial, sin valor fiscal) usando exactamente el mismo código que las
 * Cloud Functions de producción:
 *
 *   buildVoucherRequest (afip/voucher.js) → toWsfeData (afip/wsfe.js) → WSFE
 *
 * El SDK @afipsdk/afip.js en modo dev (production: false) no necesita
 * certificado: usa el CUIT de testing documentado por AfipSDK. Sí requiere
 * el access_token de la cuenta AfipSDK (el mismo Firebase Secret que usan
 * las Functions):
 *
 *   AFIPSDK_ACCESS_TOKEN=$(firebase functions:secrets:access AFIPSDK_ACCESS_TOKEN) \
 *     npm run test:arca-e2e
 */

const Afip = require('@afipsdk/afip.js');
const { buildVoucherRequest } = require('../afip/voucher');
const { toWsfeData } = require('../afip/wsfe');

// CUIT de testing de AfipSDK para homologación (documentado en docs.afipsdk.com)
const TEST_CUIT = 20409378472;
const PTO_VTA = 1;

const accessToken = process.env.AFIPSDK_ACCESS_TOKEN;
if (!accessToken) {
  console.error('Falta AFIPSDK_ACCESS_TOKEN en el entorno. Ver header de este script.');
  process.exit(1);
}

const afip = new Afip({ CUIT: TEST_CUIT, access_token: accessToken }); // production: false → homologación

// Los mismos docs de factura que arma Stock Manager (InvoiceService) antes
// de llamar a requestAfipCAE.
const CASES = [
  {
    label: 'Factura C — Monotributo a Consumidor Final',
    invoice: {
      type: 'C',
      subtotal: 1500, taxTotal: 0, total: 1500,
      currency: 'ARS',
      clientSnapshot: null,
      lineItems: [
        { description: 'Producto de prueba', quantity: 1, unitPrice: 1500, taxRate: 0, subtotal: 1500, taxAmount: 0 },
      ],
    },
  },
  {
    label: 'Factura B — RI a Consumidor Final, IVA 21%',
    invoice: {
      type: 'B',
      subtotal: 1000, taxTotal: 210, total: 1210,
      currency: 'ARS',
      clientSnapshot: { name: 'Cliente Mostrador', taxCondition: 'Consumidor Final' },
      lineItems: [
        { description: 'Item 21%', quantity: 2, unitPrice: 300, taxRate: 21, subtotal: 600, taxAmount: 126 },
        { description: 'Item 21% (2)', quantity: 1, unitPrice: 400, taxRate: 21, subtotal: 400, taxAmount: 84 },
      ],
    },
  },
  {
    label: 'Factura A — RI a RI con CUIT, IVA 21% + 10.5%',
    invoice: {
      type: 'A',
      subtotal: 2000, taxTotal: 315, total: 2315,
      currency: 'ARS',
      clientSnapshot: {
        name: 'AFIP', taxId: '33-69345023-9', taxIdType: 'CUIT',
        taxCondition: 'Responsable Inscripto',
      },
      lineItems: [
        { description: 'Item 21%', quantity: 1, unitPrice: 1000, taxRate: 21, subtotal: 1000, taxAmount: 210 },
        { description: 'Item 10.5%', quantity: 1, unitPrice: 1000, taxRate: 10.5, subtotal: 1000, taxAmount: 105 },
      ],
    },
  },
];

async function main() {
  console.log('ARCA homologación — smoke test E2E');
  console.log(`CUIT emisor (testing): ${TEST_CUIT} · PV ${PTO_VTA}\n`);

  // 1) Ping al servicio
  const status = await afip.ElectronicBilling.getServerStatus();
  console.log(`FEDummy → App: ${status.AppServer} · Db: ${status.DbServer} · Auth: ${status.AuthServer}`);
  if (status.AppServer !== 'OK' || status.DbServer !== 'OK' || status.AuthServer !== 'OK') {
    throw new Error('El servicio WSFE de homologación no está OK');
  }

  // 2) Emitir cada caso con el pipeline real
  let failures = 0;
  for (const { label, invoice } of CASES) {
    process.stdout.write(`\n▶ ${label}\n`);
    try {
      const { cbte, condicionIVAReceptorId } = buildVoucherRequest(invoice, { pointOfSale: PTO_VTA });

      // El CUIT de testing es compartido y homologación tira 501 transitorios,
      // así que reintentamos renumerando (getLastVoucher fresco en cada intento).
      const MAX_ATTEMPTS = 4;
      let result = null;
      let cbteNro = 0;
      let data = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const last = await afip.ElectronicBilling.getLastVoucher(cbte.ptoVta, cbte.cbteTipo);
        cbteNro = Number(last || 0) + 1;
        data = toWsfeData(cbte, cbteNro, condicionIVAReceptorId);
        try {
          result = await afip.ElectronicBilling.createVoucher(data);
          break;
        } catch (err) {
          const transient = /50[123]|interno de base de datos|timeout|ECONNRESET/i.test(err.message);
          if (!transient || attempt === MAX_ATTEMPTS) throw err;
          console.log(`  … intento ${attempt} falló (${err.message.trim()}), reintentando`);
          await new Promise(r => setTimeout(r, 3000 * attempt));
        }
      }
      const cae = String(result.CAE || '');

      if (!/^[0-9]{14}$/.test(cae)) {
        throw new Error(`CAE inválido en la respuesta: "${cae}"`);
      }
      console.log(`  ✔ CAE ${cae} · vto ${result.CAEFchVto} · comprobante ${String(cbte.ptoVta).padStart(4, '0')}-${String(cbteNro).padStart(8, '0')} · total $${data.ImpTotal}`);
    } catch (err) {
      failures += 1;
      console.error(`  ✘ FALLÓ: ${err.message}`);
    }
  }

  console.log(`\n${failures === 0 ? '✔ Todos los casos emitieron CAE en homologación' : `✘ ${failures} caso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(`\n✘ Error fatal: ${err.message}`);
  process.exit(1);
});
