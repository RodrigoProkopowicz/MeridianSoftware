/**
 * FirestoreService.js
 * 
 * Generic Firestore CRUD operations used across the application.
 * Provides a clean abstraction over the Firebase Firestore SDK.
 */

import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
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

/**
 * Retrieves a single document by ID.
 * @param {string} collectionName
 * @param {string} documentId
 * @returns {Promise<Object|null>}
 */
export async function getDocument(collectionName, documentId) {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

/**
 * Retrieves all documents from a collection.
 * @param {string} collectionName
 * @param {Object} [options={}]
 * @param {string} [options.orderByField]
 * @param {string} [options.orderDirection='desc']
 * @param {number} [options.limitCount]
 * @returns {Promise<Array<Object>>}
 */
export async function getDocuments(collectionName, options = {}) {
  const constraints = [];

  if (options.orderByField) {
    constraints.push(orderBy(options.orderByField, options.orderDirection || 'desc'));
  }
  if (options.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  const q = query(collection(db, collectionName), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Updates a document by ID.
 * @param {string} collectionName
 * @param {string} documentId
 * @param {Object} data
 * @returns {Promise<void>}
 */
export async function updateDocument(collectionName, documentId, data) {
  const docRef = doc(db, collectionName, documentId);
  await updateDoc(docRef, data);
}

/**
 * Deletes a document by ID.
 * @param {string} collectionName
 * @param {string} documentId
 * @returns {Promise<void>}
 */
export async function deleteDocument(collectionName, documentId) {
  const docRef = doc(db, collectionName, documentId);
  await deleteDoc(docRef);
}
