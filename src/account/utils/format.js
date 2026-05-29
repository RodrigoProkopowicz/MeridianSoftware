/**
 * format.js — formateadores para el área de cuenta (es-AR).
 */

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const numberFmt = new Intl.NumberFormat('es-AR');

/** ms (epoch) → "5 de junio de 2026" | null. */
export function formatDate(ms) {
  if (!ms) return null;
  try {
    return dateFmt.format(new Date(ms));
  } catch (_) {
    return null;
  }
}

/** amount → "$6.499" | null (separador de miles es-AR). */
export function formatMoney(amount) {
  if (amount == null) return null;
  return `$${numberFmt.format(amount)}`;
}

/** ms de vencimiento → días restantes (>= 0) | null. */
export function daysUntil(ms) {
  if (!ms) return null;
  const d = Math.ceil((ms - Date.now()) / 86400000);
  return d > 0 ? d : 0;
}
