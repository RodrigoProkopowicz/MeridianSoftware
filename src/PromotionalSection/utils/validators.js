/**
 * validators.js
 *
 * Validación y normalización de los campos del formulario promocional.
 * Sin dependencias — apto para correr en el cliente.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

/**
 * Normaliza un teléfono argentino a solo dígitos, listo para armar un link
 * de WhatsApp (wa.me/<digits>). No fuerza el código de país: si el usuario
 * escribe un número local (sin 54), guardamos los dígitos tal cual y el admin
 * completa el prefijo si hace falta.
 *
 * @param {string} value
 * @returns {string} solo dígitos
 */
export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Valida un teléfono de forma laxa: entre 8 y 15 dígitos una vez removido
 * todo lo que no sea número. Cubre formatos locales (1112345678),
 * con prefijo (+54 9 11 1234-5678) y variantes con espacios/guiones.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidPhone(value) {
  const digits = normalizePhone(value);
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Recorta y limita un string de texto libre. Devuelve '' para null/undefined.
 * @param {string} value
 * @param {number} [maxLen=2000]
 * @returns {string}
 */
export function cleanText(value, maxLen = 2000) {
  return String(value ?? '').trim().slice(0, maxLen);
}

/**
 * Valida el formulario completo. Devuelve un mapa de errores por campo
 * (vacío si todo está OK).
 *
 * @param {Record<string, any>} data
 * @returns {Record<string, string>}
 */
export function validateForm(data) {
  const errors = {};

  if (!cleanText(data.businessName, 200)) {
    errors.businessName = 'Contanos el nombre de tu negocio o el tuyo.';
  }
  if (!cleanText(data.businessType, 100)) {
    errors.businessType = 'Elegí un rubro.';
  }
  if (!isValidEmail(data.email)) {
    errors.email = 'Ingresá un email válido.';
  }
  if (!isValidPhone(data.phone)) {
    errors.phone = 'Ingresá un teléfono válido para contactarte por WhatsApp.';
  }
  if (cleanText(data.description, 2000).length < 10) {
    errors.description = 'Describí un poco qué necesitás (al menos unas palabras).';
  }
  if (!data.consent) {
    errors.consent = 'Necesitamos tu permiso para contactarte.';
  }

  return errors;
}
