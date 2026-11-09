/* ПЕРЕНОС ДВЕРЕЙ ФАЙЛОМ: выгрузить двери этого устройства и загрузить их на другом.

   Владелец 09.11.2026: «полностью скопировать все файлы, фотографии, аудио из кабинета администратора на
   компьютере в кабинет Ладомира на его телефоне». Двери, записи и фото живут только на устройстве (IndexedDB):
   звук на сервер не уходит (предел nginx 1 МБ), фото — уменьшенной копией. Поэтому переносятся одним файлом,
   в полном качестве. Подробно — README рядом. */

import { getDoorAudio, saveDoorAudio } from '../audio.js';
import { getDoorPhotos, restorePhoto } from '../photos.js';
import { FEAR } from '../door-kinds/index.js';

export const FORMAT = 'kvant-doors';
export const VERSION = 1;
/** Прежние двери телефона перед загрузкой — чтобы их можно было вернуть. */
export const BEFORE_IMPORT_KEY = 'quantum_doors_before_import';

const вBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
});

// Не через fetch по data:-адресу: политика страницы (connect-src) такие адреса не пускает
const изBase64 = async (data, type) => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/octet-stream' });
};

/**
 * Все сохранённые двери с записями и фото — в один файл.
 * @param {{texts: string[], ids: string[], kinds: object}} saved
 * @returns {Promise<Blob>}
 */
export async function exportDoors({ texts, ids, kinds }) {
    const doors = [];
    for (let i = 0; i < texts.length; i++) {
        const id = ids[i];
        const audio = await getDoorAudio(id);
        const photos = await getDoorPhotos(id);
        doors.push({
            id,
            text: texts[i],
            kind: kinds[id] === FEAR ? FEAR : 'light',
            audio: audio ? {
                fileName: audio.fileName, mimeType: audio.mimeType || audio.blob.type, data: await вBase64(audio.blob)
            } : null,
            photos: await Promise.all(photos.map(async photo => ({
                id: photo.id, fileName: photo.fileName, mimeType: photo.blob.type, data: await вBase64(photo.blob)
            })))
        });
    }
    const file = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), doors };
    return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Прочитать файл переноса; не наш или битый — ошибка с понятным текстом. */
export function parseDoorsFile(text) {
    let file;
    try {
        file = JSON.parse(text);
    } catch {
        throw new Error('not-json');
    }
    if (!file || file.format !== FORMAT || !Array.isArray(file.doors)) throw new Error('not-doors');
    return file;
}

/**
 * Поставить двери из файла вместо нынешних. Записи и фото ложатся в хранилище под номерами дверей из файла;
 * прежние двери (тексты, номера, отметки) запоминаются в BEFORE_IMPORT_KEY, их записи и фото не стираются.
 * @returns {Promise<{texts: string[], ids: string[], kinds: object}>} новые сохранённые двери
 */
export async function importDoors(file) {
    localStorage.setItem(BEFORE_IMPORT_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        texts: localStorage.getItem('quantum_doors_texts'),
        ids: localStorage.getItem('quantum_doors_ids'),
        kinds: localStorage.getItem('quantum_doors_kinds')
    }));

    const texts = [];
    const ids = [];
    const kinds = {};
    for (const door of file.doors) {
        if (!door || typeof door.id !== 'string') continue;
        if (door.audio && door.audio.data) {
            await saveDoorAudio(door.id, await изBase64(door.audio.data, door.audio.mimeType), door.audio.fileName);
        }
        for (const [position, photo] of (door.photos || []).entries()) {
            if (!photo || !photo.data) continue;
            await restorePhoto(door.id, { id: photo.id, blob: await изBase64(photo.data, photo.mimeType), fileName: photo.fileName, position });
        }
        texts.push(String(door.text || ''));
        ids.push(door.id);
        if (door.kind === FEAR) kinds[door.id] = FEAR;
    }

    localStorage.setItem('quantum_doors_texts', JSON.stringify(texts));
    localStorage.setItem('quantum_doors_ids', JSON.stringify(ids));
    localStorage.setItem('quantum_doors_kinds', JSON.stringify(kinds));
    return { texts, ids, kinds };
}
