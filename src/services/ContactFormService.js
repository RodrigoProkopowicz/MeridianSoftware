/**
 * ContactFormService.js
 * 
 * Handles contact form and demo request submissions to Firestore.
 */

import { addDocument } from './FirestoreService.js';

const CONTACT_COLLECTION = 'contactSubmissions';
const DEMO_COLLECTION = 'demoRequests';

/**
 * Submits a contact form entry to Firestore.
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.email
 * @param {string} data.company
 * @param {string} data.message
 * @param {string|null} [data.recaptchaToken] - reCAPTCHA Enterprise token for
 *   future server-side validation (null when grecaptcha was unavailable).
 * @returns {Promise<string>} Document ID
 */
export async function submitContactForm(data) {
  return addDocument(CONTACT_COLLECTION, {
    name: data.name,
    email: data.email,
    company: data.company || '',
    message: data.message,
    status: 'new',
    recaptchaToken: data.recaptchaToken || null,
  });
}

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
