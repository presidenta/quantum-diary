/* Фотографии «Дверей».

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».

   Устроено так же, как аудио: файлы лежат только на устройстве, в IndexedDB
   этого приложения, на сервер не уходит ничего. Привязка идёт по неизменному
   id двери, поэтому переименование и перестановка дверей фотографии не
   теряют.

   Одна запись на дверь, внутри — список до трёх снимков. Так проще, чем
   отдельная запись на каждый снимок: весь набор двери читается и
   переписывается за одно обращение, и порядок снимков не разъезжается.

   Наружу этот файл отдаёт только функции ниже. */

const DB_NAME = 'quantum-space-photos';
const DB_VERSION = 1;
const STORE = 'doorPhotos';

/** Больше трёх снимков на дверь не берём — так решено в задании. */
export const PHOTO_LIMIT = 3;

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'doorId' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

function runTransaction(mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function makePhotoId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Снимки двери.
 * @param {string} doorId
 * @returns {Promise<Array<{id: string, blob: Blob, fileName: string}>>} пустой список, если снимков нет
 */
export async function getDoorPhotos(doorId) {
    if (!doorId) return [];
    try {
        const record = await runTransaction('readonly', store => store.get(doorId));
        return (record && Array.isArray(record.photos)) ? record.photos : [];
    } catch (err) {
        console.error('[space] не удалось прочитать фотографии:', err);
        return [];
    }
}

/** Сколько снимков у двери. Нужно для значка заполненности. */
export async function countDoorPhotos(doorId) {
    return (await getDoorPhotos(doorId)).length;
}

/**
 * Добавить снимки. Лишние сверх лимита молча отбрасываются — ругаться на
 * человека за то, что он выбрал в галерее пять файлов, незачем.
 *
 * @param {string} doorId
 * @param {FileList|Array<File>} files
 * @returns {Promise<{photos: Array, skipped: number}>} новый список и сколько не влезло
 */
export async function addDoorPhotos(doorId, files) {
    const photos = await getDoorPhotos(doorId);
    const incoming = Array.from(files || []).filter(file => file && file.size > 0);

    const free = Math.max(0, PHOTO_LIMIT - photos.length);
    const taken = incoming.slice(0, free);

    for (const file of taken) {
        photos.push({ id: makePhotoId(), blob: file, fileName: file.name || 'photo' });
    }

    if (taken.length > 0) {
        await runTransaction('readwrite', store => store.put({ doorId, photos }));
    }

    return { photos, skipped: incoming.length - taken.length };
}

/**
 * Убрать один снимок.
 * @returns {Promise<Array>} что осталось
 */
export async function deleteDoorPhoto(doorId, photoId) {
    const photos = (await getDoorPhotos(doorId)).filter(photo => photo.id !== photoId);

    if (photos.length === 0) {
        await runTransaction('readwrite', store => store.delete(doorId));
    } else {
        await runTransaction('readwrite', store => store.put({ doorId, photos }));
    }

    return photos;
}

/** Убрать все снимки двери. */
export async function deleteDoorPhotos(doorId) {
    try {
        await runTransaction('readwrite', store => store.delete(doorId));
    } catch (err) {
        console.error('[space] не удалось удалить фотографии:', err);
    }
}
