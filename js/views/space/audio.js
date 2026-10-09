/* Локальное аудио «Дверей».

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».

   Файлы лежат только на устройстве, в IndexedDB этого приложения. На сервер
   не уходит ничего, лимита по размеру нет — упирается только в свободное
   место на телефоне. Каждая дверь хранит свою запись отдельно, привязка идёт
   по неизменному id двери, поэтому переименование или перестановка дверей
   аудио не теряет.

   Наружу этот файл отдаёт только функции ниже; базу данных никто больше
   не открывает. */

const DB_NAME = 'quantum-space-audio';
const DB_VERSION = 1;
const STORE = 'doorAudio';

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

/**
 * Длительность записи. Браузер умеет её сказать, только проиграв метаданные,
 * поэтому поднимаем временный <audio> и ждём их.
 * @param {Blob} blob
 * @returns {Promise<number>} длительность в миллисекундах, 0 если неизвестна
 */
export function readDurationMs(blob) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(blob);
        const probe = document.createElement('audio');
        let done = false;

        const finish = ms => {
            if (done) return;
            done = true;
            URL.revokeObjectURL(url);
            resolve(ms);
        };

        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
            const d = probe.duration;
            finish(Number.isFinite(d) ? Math.round(d * 1000) : 0);
        };
        probe.onerror = () => finish(0);

        // Некоторые записи с микрофона не отдают длительность вовсе —
        // не ждём их вечно, через три секунды считаем, что её нет.
        setTimeout(() => finish(0), 3000);

        probe.src = url;
    });
}

/** Длительность в вид «1:05». */
export function formatDuration(ms) {
    if (!ms || ms < 0) return '';
    const total = Math.round(ms / 1000);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return min + ':' + String(sec).padStart(2, '0');
}

/**
 * Сохранить запись за дверью. Прежняя запись этой двери заменяется.
 * @param {string} doorId
 * @param {Blob} blob
 * @param {string} fileName
 * @returns {Promise<object>} сохранённые метаданные
 */
export async function saveDoorAudio(doorId, blob, fileName) {
    const durationMs = await readDurationMs(blob);
    const record = {
        doorId,
        blob,
        fileName: fileName || 'audio',
        durationMs,
        mimeType: blob.type || 'audio/webm',
        createdAt: Date.now()
    };

    await runTransaction('readwrite', store => store.put(record));
    return describe(record);
}

/** Метаданные без самого файла — для списка дверей. */
function describe(record) {
    if (!record) return null;
    return {
        fileName: record.fileName,
        durationMs: record.durationMs,
        mimeType: record.mimeType,
        createdAt: record.createdAt
    };
}

/**
 * Запись двери целиком, вместе с файлом.
 * @returns {Promise<{blob: Blob, fileName: string, durationMs: number,
 *                    mimeType: string, createdAt: number} | null>}
 */
export async function getDoorAudio(doorId) {
    if (!doorId) return null;
    try {
        const record = await runTransaction('readonly', store => store.get(doorId));
        if (!record || !record.blob) return null;
        return record;
    } catch (err) {
        console.error('[space/audio] чтение не удалось:', err);
        return null;
    }
}

/** Только метаданные: есть ли запись, как называется, сколько длится. */
export async function getDoorAudioMeta(doorId) {
    const record = await getDoorAudio(doorId);
    return describe(record);
}

/** Метаданные сразу для списка дверей: { doorId: meta | null }. */
export async function getAllAudioMeta(doorIds) {
    const result = {};
    for (const id of doorIds) {
        result[id] = await getDoorAudioMeta(id);
    }
    return result;
}

/** Удалить запись двери. */
export async function deleteDoorAudio(doorId) {
    if (!doorId) return;
    try {
        await runTransaction('readwrite', store => store.delete(doorId));
    } catch (err) {
        console.error('[space/audio] удаление не удалось:', err);
    }
}

/** Поддерживает ли устройство запись с микрофона. */
export function canRecord() {
    return Boolean(
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        typeof MediaRecorder !== 'undefined'
    );
}

/**
 * Диктофон. Возвращает объект с одним методом stop(), который отдаёт Blob.
 * Дорожка микрофона закрывается сразу после остановки, иначе индикатор
 * записи остаётся висеть в статус-баре телефона.
 * @returns {Promise<{stop: () => Promise<Blob>}>}
 */
export async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];

    // Тип выбирает браузер: Chrome отдаёт webm, Safari — mp4.
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();

    return {
        stop() {
            return new Promise(resolve => {
                recorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                    resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
                };
                if (recorder.state !== 'inactive') recorder.stop();
                else resolve(new Blob(chunks, { type: 'audio/webm' }));
            });
        }
    };
}
