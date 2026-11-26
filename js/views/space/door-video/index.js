/* ВИДЕО ДВЕРЕЙ (выкладка 258). Владелец 26.11.2026: «видео сохраняем только на телефоне, на сервер не
   копируем и между устройствами не передаём — так проще и реальнее, и можно больше видео»; «и запись экрана
   тоже». Подробно — README.md рядом.

   Хранение — своя база устройства (IndexedDB 'quantum-space-videos'), отдельно от фото: копия фото на сервере
   (web/js/photo-backup/) читает только базу фото и видео не видит. Видео лежит как есть, без пережатия: любой
   файл, который телефон отдаёт как видео (камера, запись экрана, галерея). Предел — память устройства.

   Сохранить видео к себе (на почту, в облако, в галерею) — кнопка «Поделиться» на открытой двери: системное окно
   телефона, вложение уходит его же почтой, мимо нашего сервера. Нет окна (компьютер без него) — файл
   скачивается. В приложении для Android окна «Поделиться» у встроенного браузера нет — кнопки там нет. */

const DB_NAME = 'quantum-space-videos';
const STORE = 'doorVideos';

/** Видео на дверь — как фото, по три. */
export const VIDEO_LIMIT = 3;

/* Выбор файла: video/* — галерея и камера телефона; расширения — проводник компьютера, где у .mov и .mkv
   бывает пустой тип. */
export const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv';

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'doorId' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

function run(mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        let result;
        request.onsuccess = () => { result = request.result; };
        // Запись считается сделанной, когда закончилась вся транзакция: место на устройстве кончается именно тут
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || request.error);
        tx.onabort = () => reject(tx.error || request.error);
    }));
}

const makeId = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Похоже ли на видео: по типу, а без типа (компьютер) — по расширению. */
export function isVideoFile(file) {
    if (!file || !file.size) return false;
    if (file.type) return file.type.startsWith('video/');
    return /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name || '');
}

/** Видео двери: [{ id, blob, fileName }]. Сбой чтения — пусто. */
export async function getDoorVideos(doorId) {
    if (!doorId) return [];
    try {
        const record = await run('readonly', store => store.get(doorId));
        return Array.isArray(record?.videos) ? record.videos : [];
    } catch (err) {
        console.error('[space] не удалось прочитать видео:', err);
        return [];
    }
}

export async function countDoorVideos(doorId) {
    return (await getDoorVideos(doorId)).length;
}

/**
 * Добавить видео. Лишние сверх трёх и не видео — отбрасываются.
 * @returns {Promise<{videos: Array, skipped: number, noSpace: boolean}>}
 */
export async function addDoorVideos(doorId, files) {
    const videos = await getDoorVideos(doorId);
    const incoming = Array.from(files || []).filter(isVideoFile);
    const taken = incoming.slice(0, Math.max(0, VIDEO_LIMIT - videos.length));
    const skipped = Array.from(files || []).length - taken.length;
    if (!taken.length) return { videos, skipped, noSpace: false };
    const next = [...videos, ...taken.map(file => ({ id: makeId(), blob: file, fileName: file.name || 'video' }))];
    try {
        await run('readwrite', store => store.put({ doorId, videos: next }));
        return { videos: next, skipped, noSpace: false };
    } catch (err) {
        // Места на устройстве не хватило — запись откатилась целиком, прежние видео целы
        console.error('[space] видео не записалось:', err);
        return { videos, skipped, noSpace: true };
    }
}

export async function deleteDoorVideo(doorId, videoId) {
    const videos = (await getDoorVideos(doorId)).filter(v => v.id !== videoId);
    await run('readwrite', store => (videos.length ? store.put({ doorId, videos }) : store.delete(doorId)));
    return videos;
}

/** Отпустить ссылки на видео внутри узла: иначе файлы копились бы в памяти при каждой перерисовке. */
export function releaseVideoUrls(node) {
    node.querySelectorAll('video').forEach(video => {
        if (video.src.startsWith('blob:')) URL.revokeObjectURL(video.src.split('#')[0]);
    });
}

function videoNode(blob, t, { controls }) {
    const video = document.createElement('video');
    // #t=0.1 — iPhone без этого не рисует первый кадр, и в ленте был бы пустой квадрат
    video.src = URL.createObjectURL(blob) + '#t=0.1';
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.controls = controls;
    if (!controls) video.muted = true;
    // Формат, который это устройство не играет (например, HEVC с iPhone на компьютере), — понятная надпись
    video.addEventListener('error', () => {
        const note = document.createElement('p');
        note.className = 'qm-video-bad';
        note.textContent = t('videoCantPlay');
        video.replaceWith(note);
    }, { once: true });
    return video;
}

/** Лента видео в настройке двери: кадр каждого и «убрать». Нажатие «убрать» ловит app.js (data-act). */
export function fillVideoStrip(strip, videos, t) {
    releaseVideoUrls(strip);
    strip.innerHTML = '';
    for (const v of videos) {
        const cell = document.createElement('div');
        cell.className = 'qm-video-cell';
        cell.appendChild(videoNode(v.blob, t, { controls: false }));
        const play = document.createElement('span');
        play.className = 'qm-video-play';
        play.setAttribute('aria-hidden', 'true');
        cell.appendChild(play);
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'qm-photo-drop';
        drop.dataset.act = 'video-remove';
        drop.dataset.videoId = v.id;
        drop.title = t('videoRemove');
        drop.setAttribute('aria-label', t('videoRemove'));
        cell.appendChild(drop);
        strip.appendChild(cell);
    }
    if (videos.length) {
        const note = document.createElement('p');
        note.className = 'qm-video-local';
        note.textContent = t('videoLocal');
        strip.appendChild(note);
    }
}

const inAndroidApp = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());

/** Можно ли отдать файл системному окну «Поделиться» (iPhone, Android в браузере, Windows). */
function canShareFile(file) {
    try {
        return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [file] });
    } catch {
        return false;
    }
}

function asFile(v) {
    const type = v.blob.type || 'video/mp4';
    return new File([v.blob], v.fileName || 'video.mp4', { type });
}

/* «Поделиться» — окно телефона (почта, облако, мессенджер, «Сохранить видео»); нет окна — скачать файл. В APK
   нет ни того, ни другого (встроенный браузер Android их не умеет) — кнопки нет. */
function shareButton(v, t) {
    if (inAndroidApp()) return null;
    const file = asFile(v);
    const share = canShareFile(file);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qm-video-share';
    button.textContent = t(share ? 'videoShare' : 'videoDownload');
    button.addEventListener('click', async () => {
        if (share) {
            try {
                await navigator.share({ files: [file], title: file.name });
            } catch { /* человек закрыл окно — ничего */ }
            return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    });
    return button;
}

/** Видео открытой двери: проигрыватель во всю ширину и «Поделиться» под ним. */
export function appendChosenVideos(box, videos, t) {
    for (const v of videos) {
        const wrap = document.createElement('div');
        wrap.className = 'qm-s3-video';
        wrap.appendChild(videoNode(v.blob, t, { controls: true }));
        const share = shareButton(v, t);
        if (share) wrap.appendChild(share);
        box.appendChild(wrap);
    }
}
