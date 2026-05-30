/**
 * FirestoreService.js
 *
 * Thin helper sobre el SDK de Firestore. Hoy solo se usa addDocument
 * (desde ContactFormService); el resto de las superficies usa el SDK directo.
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/FirebaseConfig.js';

/**
 * Adds a document to a Firestore collection with auto-generated ID.
 * Automatically adds a createdAt timestamp.
 * @param {string} collectionName
 * @param {Object} data
 * @returns {Promise<string>} The new document ID
 */
export async function addDocument(collectionName, data) {
  const docRef = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
