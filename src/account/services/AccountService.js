/**
 * AccountService.js
 *
 * Llamadas del área de cuenta del usuario. Todo va por Cloud Functions
 * (callables) porque el cliente no puede leer `promotionalSubscriptions`
 * directamente — la función devuelve una vista saneada.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import firebaseApp from '../../config/FirebaseConfig.js';

const functions = getFunctions(firebaseApp);
const listMyProductsCallable = httpsCallable(functions, 'listMyProducts');
const cancelCallable = httpsCallable(functions, 'cancelPromotionalSubscription');

/**
 * Devuelve { websites: [...], demos: [...] } del usuario autenticado.
 */
export async function listMyProducts() {
  const result = await listMyProductsCallable();
  return result.data || { websites: [], demos: [] };
}

/**
 * Da de baja una suscripción propia (el backend valida que sea del usuario).
 * @param {string} subscriptionId
 */
export async function cancelMySubscription(subscriptionId) {
  const result = await cancelCallable({ subscriptionId });
  return result.data;
}
