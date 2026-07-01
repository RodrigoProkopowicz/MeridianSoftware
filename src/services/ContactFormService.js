/**
 * ContactFormService.js
 *
 * Handles demo request submissions to Firestore. El formulario de contacto
 * pasó a un flujo mailto: en el cliente (ver ContactSection.js).
 */

import { addDocument } from './FirestoreService.js';

const DEMO_COLLECTION = 'demoRequests';

/**
 * Submits a public demo/trial request to Firestore. No authentication required
 * — the visitor provides their contact info and the admin follows up.
 * @param {Object} data
 * @param {string} data.name          Contact full name
 * @param {string} data.email         Contact email
 * @param {string} data.solutionType  Product / solution requested
 * @param {string} [data.companyName]
 * @param {string} [data.message]
 * @param {string|null} [data.recaptchaToken]
 * @returns {Promise<string>} Document ID
 */
export async function submitDemoRequest(data) {
  return addDocument(DEMO_COLLECTION, {
    name: data.name || '',
    email: data.email || '',
    solutionType: data.solutionType,
    companyName: data.companyName || '',
    message: data.message || '',
    status: 'pending',
    recaptchaToken: data.recaptchaToken || null,
  });
}
