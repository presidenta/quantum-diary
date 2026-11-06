/* Фотографии «Дверей».

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».

   Файлы лежат на устройстве, в IndexedDB этого приложения, в полном
   качестве. Привязка идёт по неизменному id двери, поэтому переименование и
   перестановка дверей фотографии не теряют.

   КОПИЯ НА СЕРВЕРЕ (сервер 16). Прежде на сервер не уходило ничего, и сброс
   телефона уносил снимки насовсем. Копию ведёт отдельный модуль
   (web/js/photo-backup/): он читает всё отсюда (allPhotos), возвращает снимки
   на новом телефоне (restorePhoto) и узнаёт о новых и удалённых снимках по
   событиям ниже — этот файл о сервере не знает. Аудио в копию пока не идёт.

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

/* События для копии на сервере: снимки добавили — отправить; человек удалил — удалить и там. Удаление
   называется поимённо и только здесь, по действию человека: снимка «нет на телефоне» после сброса копия
   не должна принять за удаление и стереть себя. */
export const PHOTOS_ADDED = 'kvant-photos-added';
export const PHOTOS_REMOVED = 'kvant-photos-removed';

function сообщить(событие, ids) {
    if (ids.length === 0 || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(событие, { detail: { ids } }));
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
        сообщить(PHOTOS_ADDED, photos.slice(-taken.length).map(photo => photo.id));
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
    сообщить(PHOTOS_REMOVED, [photoId]);

    return photos;
}

/** Убрать все снимки двери. */
export async function deleteDoorPhotos(doorId) {
    try {
        const ids = (await getDoorPhotos(doorId)).map(photo => photo.id);
        await runTransaction('readwrite', store => store.delete(doorId));
        сообщить(PHOTOS_REMOVED, ids);
    } catch (err) {
        console.error('[space] не удалось удалить фотографии:', err);
    }
}

/**
 * Все снимки устройства — для копии на сервере.
 * @returns {Promise<Array<{key: string, id: string, blob: Blob, fileName: string, position: number}>>}
 */
export async function allPhotos() {
    const records = await runTransaction('readonly', store => store.getAll());
    const all = [];
    for (const record of records || []) {
        (record.photos || []).forEach((photo, position) => {
            all.push({ key: record.doorId, id: photo.id, blob: photo.blob, fileName: photo.fileName, position });
        });
    }
    return all;
}

/**
 * Вернуть снимок из копии на его место. Уже есть — ничего; место занято тремя снимками — тоже ничего:
 * человек успел добавить свои, и вытеснять их копией нельзя. О возвращённом событий не шлём — он и так на
 * сервере.
 * @returns {Promise<boolean>} вернулся ли
 */
export async function restorePhoto(key, { id, blob, fileName, position = 0 }) {
    // Не getDoorPhotos: та на сбое чтения отдаёт пустой список, и запись ниже стёрла бы снимки двери
    const record = await runTransaction('readonly', store => store.get(key));
    const photos = Array.isArray(record?.photos) ? record.photos : [];
    if (photos.some(photo => photo.id === id) || photos.length >= PHOTO_LIMIT) return false;
    photos.splice(Math.min(position, photos.length), 0, { id, blob, fileName: fileName || 'photo' });
    await runTransaction('readwrite', store => store.put({ doorId: key, photos }));
    return true;
}
