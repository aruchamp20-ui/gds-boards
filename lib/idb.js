// Minimal IndexedDB key-value store. One object store, string keys, any structured-clonable value.
const DB = 'monday_replica', STORE = 'kv';
let dbp;
function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
export async function idbGetAll() {
  const db = await open(); const tx = db.transaction(STORE, 'readonly'); const store = tx.objectStore(STORE);
  const [keys, values] = await Promise.all([wrap(store.getAllKeys()), wrap(store.getAll())]);
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}
export async function idbSetMany(entries, deletes = []) {
  const db = await open(); const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE);
  for (const [k, v] of entries) store.put(v, k);
  for (const k of deletes) store.delete(k);
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
export async function idbClear() { const db = await open(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
export const idbSupported = () => typeof indexedDB !== 'undefined';
