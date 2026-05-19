/**
 * Format.js
 *
 * Date/timestamp formatters used across admin views.
 */

const FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const RELATIVE = typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
  ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  : null;

/**
 * @param {import('firebase/firestore').Timestamp|Date|null|undefined} value
 */
export function formatTimestamp(value) {
  const date = toDate(value);
  if (!date) return '—';
  return FORMATTER.format(date);
}

/**
 * "5 minutes ago", "in 2 days", etc. Falls back to absolute formatting if
 * Intl.RelativeTimeFormat is unavailable.
 */
export function formatRelative(value) {
  const date = toDate(value);
  if (!date) return '—';
  if (!RELATIVE) return FORMATTER.format(date);

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return RELATIVE.format(Math.round(diffMs / 1000), 'second');
  if (abs < hour) return RELATIVE.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return RELATIVE.format(Math.round(diffMs / hour), 'hour');
  if (abs < 30 * day) return RELATIVE.format(Math.round(diffMs / day), 'day');
  return FORMATTER.format(date);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}
