/**
 * ValidationHelper.js
 * 
 * Client-side form validation utilities.
 * Provides reusable validators and error display logic.
 */

/**
 * Validates an email address format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Checks if a string is non-empty after trimming.
 * @param {string} value
 * @returns {boolean}
 */
export function isNotEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Checks minimum length.
 * @param {string} value
 * @param {number} min
 * @returns {boolean}
 */
export function hasMinLength(value, min) {
  return typeof value === 'string' && value.trim().length >= min;
}

/**
 * Validates a form field and toggles error display.
 * @param {HTMLInputElement|HTMLTextAreaElement} inputElement
 * @param {Function} validatorFn - Returns true if valid
 * @param {string} errorMessage
 * @returns {boolean} - Whether the field is valid
 */
function validateField(inputElement, validatorFn, errorMessage) {
  const value = inputElement.value;
  const isValid = validatorFn(value);

  const errorElement = inputElement.parentElement.querySelector('.input-error-message');

  if (!isValid) {
    inputElement.classList.add('error');
    if (errorElement) {
      errorElement.textContent = errorMessage;
      errorElement.classList.add('visible');
    }
  } else {
    inputElement.classList.remove('error');
    if (errorElement) {
      errorElement.classList.remove('visible');
    }
  }

  return isValid;
}

/**
 * Validates an entire form by running all field validations.
 * @param {Array<{element: HTMLElement, validator: Function, message: string}>} fields
 * @returns {boolean} - Whether all fields are valid
 */
export function validateForm(fields) {
  let allValid = true;

  fields.forEach(({ element, validator, message }) => {
    const valid = validateField(element, validator, message);
    if (!valid) allValid = false;
  });

  return allValid;
}
