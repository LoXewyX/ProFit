const databaseName = 'profit-exercise-assets';
const storeName = 'assets';
let databasePromise;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Almacenamiento de medios no disponible'));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la biblioteca multimedia'));
  });
  return databasePromise;
}

export async function saveExerciseAsset(id, blob) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(blob, id);
    transaction.oncomplete = () => resolve(id);
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el medio del ejercicio'));
  });
}

export async function getExerciseAsset(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el medio del ejercicio'));
  });
}

export async function deleteExerciseAsset(id) {
  if (!id) return;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo borrar el medio del ejercicio'));
  });
}
