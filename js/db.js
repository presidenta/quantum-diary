// Копия данных на телефоне: работает без сети, сервер — главный источник.
// Запись с dirty = 1 изменена здесь и ещё не дошла до сервера.

export const KINDS = ['sectors', 'goals', 'goalVersions', 'entries', 'assessments'];
const DB_NAME = 'PlannerDB';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const kind of KINDS) {
        if (!db.objectStoreNames.contains(kind)) {
          db.createObjectStore(kind, { keyPath: 'id' }).createIndex('dirty', 'dirty');
        }
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export async function loadAll() {
  const db = await openDb();
  const tx = db.transaction(KINDS, 'readonly');
  const data = {};
  for (const kind of KINDS) data[kind] = await done(tx.objectStore(kind).getAll());
  return data;
}

export async function putRecords(kind, records) {
  const db = await openDb();
  const tx = db.transaction(kind, 'readwrite');
  for (const r of records) tx.objectStore(kind).put(r);
  return finished(tx);
}

export async function dirtyRecords() {
  const db = await openDb();
  const tx = db.transaction(KINDS, 'readonly');
  const out = {};
  for (const kind of KINDS) {
    out[kind] = await done(tx.objectStore(kind).index('dirty').getAll(1));
  }
  return out;
}

export async function getMeta(key) {
  const db = await openDb();
  const row = await done(db.transaction('meta').objectStore('meta').get(key));
  return row ? row.value : undefined;
}

export async function setMeta(key, value) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  return finished(tx);
}

export async function clearAll() {
  const db = await openDb();
  const tx = db.transaction([...KINDS, 'meta'], 'readwrite');
  for (const name of [...KINDS, 'meta']) tx.objectStore(name).clear();
  return finished(tx);
}
