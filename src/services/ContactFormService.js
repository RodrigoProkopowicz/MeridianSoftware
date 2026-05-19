/**
 * ContactFormService.js
 *
 * Handles demo request submissions to Firestore. El formulario de contacto
 * pasó a un flujo mailto: en el cliente (ver ContactSection.js).
 */

import { addDocument } from './FirestoreService.js';

const DEMO_COLLECTION = 'demoRequests';

/**
 * Submits a demo request to Firestore. Requires authenticated user.
 * @param {Object} data
 * @param {string} data.userId
 * @param {string} data.solutionType
 * @param {string} data.companyName
 * @param {string} data.message
 * @param {string} data.preferredDate
 * @param {string|null} [data.recaptchaToken]
 * @returns {Promise<string>} Document ID
 */
export async function submitDemoRequest(data) {
  return addDocument(DEMO_COLLECTION, {
    userId: data.userId,
    solutionType: data.solutionType,
    companyName: data.companyName || '',
    message: data.message || '',
    preferredDate: data.preferredDate || '',
    status: 'pending',
    recaptchaToken: data.recaptchaToken || null,
  });
}
