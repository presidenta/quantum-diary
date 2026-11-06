/* КОПИЯ ФОТОГРАФИЙ НА СЕРВЕРЕ (сервер 16).

   Владелец 06.11.2026: «фотографии, которые человек загружает, должны сохраняться на телефоне и
   архивироваться на сервере, чтобы потом можно было восстановить то, что было у человека на телефоне».
   До этого снимки дверей и практик жили только на телефоне (views/space/photos.js), и сброс или
   переустановка уносили их насовсем.

   Телефон — главный: снимок в полном качестве лежит у него. На сервере — копия, пережатая под предел
   nginx хоста. Сверка — по спискам, без самих снимков:
     есть здесь, нет там          → отправить копию;
     есть там, нет здесь          → вернуть на место (новый телефон, переустановка);
     человек удалил здесь         → удалить и там.
   Удаление — только по событию из photos.js, то есть по действию человека. Снимка «нет на телефоне» после
   сброса сверка за удаление не принимает: иначе копия стёрла бы сама себя ровно тогда, когда нужна.

   Чьи снимки. Хранилище снимков при выходе из аккаунта не стирается, поэтому копия помнит, чьи они: вошёл
   на этом телефоне другой человек — его аккаунту чужие снимки не уходят и чужие не возвращаются.

   Подключается одной строкой в app.js — startPhotoBackup() (README.md рядом). */

import { API_BASE } from '../config.js';
import { request } from '../core/net.js';
import { getMeta } from '../db.js';
import { allPhotos, restorePhoto, PHOTOS_ADDED, PHOTOS_REMOVED } from '../views/space/photos.js';

const ПАМЯТЬ = 'kvant.photoBackup';
// Тот же предел, что у сервера (server/src/photo-backup/store.js), с запасом
const ПРЕДЕЛ_БАЙТ = 680 * 1024;
const ДЛИННАЯ_СТОРОНА = 1600;
// Не мешать запуску: сверка — после того, как человек увидел экран
const ПОСЛЕ_ЗАПУСКА_МС = 5000;
const ПОСЛЕ_ПРАВКИ_МС = 3000;
const НЕ_ЧАЩЕ_МС = 5 * 60 * 1000;

/* Память копии — в localStorage, а не в базе приложения: ту выход из аккаунта стирает, а снимки остаются.
   owner — чьи снимки на этом телефоне; удалённые — id, которые человек удалил, а сервер ещё не знает;
   неУходят — снимки, которые телефон не смог разобрать (не каждый формат читается), чтобы не пробовать их
   на каждой сверке. */
function прочитать() {
    try {
        const п = JSON.parse(localStorage.getItem(ПАМЯТЬ) || 'null');
        return { owner: п?.owner || '', удалённые: п?.удалённые || [], неУходят: п?.неУходят || [] };
    } catch {
        return { owner: '', удалённые: [], неУходят: [] };
    }
}

function записать(память) {
    try { localStorage.setItem(ПАМЯТЬ, JSON.stringify(память)); } catch { /* приватный режим — следующая сверка повторит */ }
}

/* Каждая правка памяти читает её заново: сверка идёт с ожиданием сети, и за это время человек мог удалить
   ещё снимок. Правка поверх прочитанного раньше затёрла бы это удаление — и снимок вернулся бы на телефон. */
function поправить(правка) {
    const память = прочитать();
    правка(память);
    записать(память);
}

/* Удаление запоминаем сразу, в момент события, — сверка может пройти через неделю. */
function запомнитьУдалённые(ids) {
    поправить(п => { п.удалённые = [...new Set([...п.удалённые, ...ids])]; });
}

async function api(путь, параметры = {}) {
    const token = await getMeta('token');
    const res = await request(API_BASE + путь, {
        ...параметры,
        timeoutMs: 30000,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(параметры.body ? { 'Content-Type': 'application/json' } : {})
        }
    });
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

/* Копия для сервера: JPEG, длинная сторона до 1600 точек, под предел. Оригинал на телефоне не трогаем.
   Не разобрался снимок (формат, который этот телефон не рисует) — null. */
async function ужать(blob) {
    let картинка;
    try {
        картинка = await createImageBitmap(blob);
    } catch {
        return null;
    }
    let сторона = ДЛИННАЯ_СТОРОНА;
    let качество = 0.82;
    for (let попытка = 0; попытка < 6; попытка++) {
        const k = Math.min(1, сторона / Math.max(картинка.width, картинка.height));
        const холст = document.createElement('canvas');
        холст.width = Math.max(1, Math.round(картинка.width * k));
        холст.height = Math.max(1, Math.round(картинка.height * k));
        холст.getContext('2d').drawImage(картинка, 0, 0, холст.width, холст.height);
        const jpeg = await new Promise(готово => холст.toBlob(готово, 'image/jpeg', качество));
        if (jpeg && jpeg.size <= ПРЕДЕЛ_БАЙТ) {
            картинка.close?.();
            return jpeg;
        }
        сторона = Math.round(сторона * 0.8);
        качество = Math.max(0.6, качество - 0.06);
    }
    картинка.close?.();
    return null;
}

const вBase64 = blob => new Promise((готово, отказ) => {
    const чтец = new FileReader();
    чтец.onload = () => готово(String(чтец.result).split(',')[1] || '');
    чтец.onerror = () => отказ(чтец.error);
    чтец.readAsDataURL(blob);
});

function изBase64(строка) {
    const сырые = atob(строка);
    const байты = new Uint8Array(сырые.length);
    for (let i = 0; i < сырые.length; i++) байты[i] = сырые.charCodeAt(i);
    return new Blob([байты], { type: 'image/jpeg' });
}

/**
 * Одна сверка. Ошибка сети или сервера останавливает её до следующего раза — сделанное не теряется:
 * каждый снимок уходит и возвращается сам по себе.
 * @returns {Promise<{отправлено: number, возвращено: number, удалено: number}|null>} null — сверки не было
 */
export async function syncPhotos() {
    if (!API_BASE || !(await getMeta('token').catch(() => null))) return null;
    const userId = String((await getMeta('userId').catch(() => '')) || '');
    if (!userId) return null;

    const владелец = прочитать().owner;
    if (владелец && владелец !== userId) {
        console.warn('[копия фото] снимки на этом телефоне — другого аккаунта, копия молчит');
        return null;
    }
    if (!владелец) поправить(п => { п.owner = userId; });

    const итог = { отправлено: 0, возвращено: 0, удалено: 0 };
    const наСервере = new Map((await api('/api/photos')).map(строка => [строка.id, строка]));
    const здесь = new Map((await allPhotos()).map(снимок => [снимок.id, снимок]));

    // Удалённые человеком — и там
    for (const id of прочитать().удалённые) {
        if (наСервере.has(id)) {
            await api(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
            наСервере.delete(id);
            итог.удалено++;
        }
        поправить(п => { п.удалённые = п.удалённые.filter(x => x !== id); });
    }

    // Есть там, нет здесь — вернуть на место. Удалённый за время сверки — не возвращаем: удалим следующей
    for (const [id, строка] of наСервере) {
        if (здесь.has(id) || прочитать().удалённые.includes(id)) continue;
        const снимок = await api(`/api/photos/${encodeURIComponent(id)}`);
        if (await restorePhoto(снимок.key, {
            id, blob: изBase64(снимок.data), fileName: снимок.fileName, position: строка.position
        })) итог.возвращено++;
    }

    // Есть здесь, нет там — отправить копию
    for (const [id, снимок] of здесь) {
        const память = прочитать();
        if (наСервере.has(id) || память.неУходят.includes(id) || память.удалённые.includes(id)) continue;
        const копия = await ужать(снимок.blob);
        if (!копия) {
            поправить(п => { п.неУходят = [...new Set([...п.неУходят, id])]; });
            console.warn('[копия фото] снимок не разобрался, остаётся только на телефоне:', id);
            continue;
        }
        try {
            await api(`/api/photos/${encodeURIComponent(id)}`, {
                method: 'POST',
                body: JSON.stringify({
                    key: снимок.key, position: снимок.position,
                    fileName: String(снимок.fileName || 'photo').slice(0, 200), data: await вBase64(копия)
                })
            });
            итог.отправлено++;
        } catch (err) {
            // Предел на человека — остальное остаётся на телефоне, сверку дальше не гоним
            if (err.status === 409) { console.warn('[копия фото] на сервере предел снимков'); break; }
            throw err;
        }
    }
    return итог;
}

let идёт = null;
let ещёРаз = false;
let последняя = 0;
let таймер = null;

/* Сверки не накладываются: пришёл повод посреди сверки — ещё одна сразу после неё. */
function сверить() {
    if (идёт) { ещёРаз = true; return идёт; }
    последняя = Date.now();
    идёт = syncPhotos()
        .then(итог => {
            if (итог && (итог.отправлено || итог.возвращено || итог.удалено)) console.info('[копия фото]', итог);
        })
        .catch(err => console.warn('[копия фото] сверка не прошла:', err.message))
        .finally(() => {
            идёт = null;
            if (ещёРаз) { ещёРаз = false; сверить(); }
        });
    return идёт;
}

function чуть(мс) {
    clearTimeout(таймер);
    таймер = setTimeout(сверить, мс);
}

let заведена = false;

/** Завести копию: сверка после запуска, после правок снимков, при появлении сети и возвращении на экран. */
export function startPhotoBackup() {
    if (заведена || !API_BASE) return;
    заведена = true;
    чуть(ПОСЛЕ_ЗАПУСКА_МС);
    window.addEventListener(PHOTOS_ADDED, () => чуть(ПОСЛЕ_ПРАВКИ_МС));
    window.addEventListener('online', () => чуть(ПОСЛЕ_ПРАВКИ_МС));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - последняя > НЕ_ЧАЩЕ_МС) чуть(ПОСЛЕ_ПРАВКИ_МС);
    });
}

/* Удаления слушаем с первой секунды, ещё до startPhotoBackup: человек мог удалить снимок раньше, чем завелась
   копия, и это удаление не должно потеряться. */
if (typeof window !== 'undefined') {
    window.addEventListener(PHOTOS_REMOVED, событие => {
        запомнитьУдалённые(событие.detail?.ids || []);
        чуть(ПОСЛЕ_ПРАВКИ_МС);
    });
}
