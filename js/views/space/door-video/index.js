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

const clock = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const r = Math.floor(sec % 60);
    return m + ':' + String(r).padStart(2, '0');
};

/* ПРОСМОТР ВИДЕО (владелец 26.11.2026: «добавил видео — не могу посмотреть, должен работать значок play»; «перемотка —
   ползунок перемещать»). Нажатие на кадр в ленте — видео на весь экран, со звуком: большой ползунок перемотки,
   «пауза / дальше», время, «Закрыть». Окно — поверх всего, в body: внутри экрана «Пространства» есть слои с
   transform, и fixed там встал бы не по экрану. */
export function openVideoViewer(blob, t) {
    const url = URL.createObjectURL(blob);
    const box = document.createElement('div');
    box.className = 'qm-vv';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const video = document.createElement('video');
    video.className = 'qm-vv-video';
    video.src = url;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'qm-vv-toggle';
    const now = document.createElement('span');
    now.className = 'qm-vv-time';
    now.textContent = '0:00';
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'qm-vv-seek';
    seek.min = '0';
    seek.max = '1000';
    seek.step = '1';
    seek.value = '0';
    seek.setAttribute('aria-label', t('videoSeek'));
    const total = document.createElement('span');
    total.className = 'qm-vv-time';
    total.textContent = '0:00';
    const bar = document.createElement('div');
    bar.className = 'qm-vv-bar';
    bar.append(toggle, now, seek, total);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'qm-vv-close';
    close.textContent = '✕ ' + t('videoClose');

    box.append(close, video, bar);
    document.body.appendChild(box);

    let dragging = false;
    const length = () => (Number.isFinite(video.duration) ? video.duration : 0);
    const paint = () => {
        toggle.textContent = video.paused ? '▶' : '❚❚';
        toggle.setAttribute('aria-label', t(video.paused ? 'videoPlay' : 'videoPause'));
        now.textContent = clock(video.currentTime);
        total.textContent = clock(length());
        if (!dragging && length()) seek.value = String(Math.round((video.currentTime / length()) * 1000));
        seek.style.setProperty('--qm-vv-fill', (Number(seek.value) / 10) + '%');
    };

    /* Запись с телефона без длины в заголовке (бывает у WebM) — браузер говорит «длина бесконечна», и ползунку не за
       что держаться. Прыжок в самый конец заставляет его досчитать длину, потом — снова в начало. */
    video.addEventListener('loadedmetadata', () => {
        if (video.duration === Infinity) {
            const back = () => { video.removeEventListener('timeupdate', back); video.currentTime = 0; paint(); };
            video.addEventListener('timeupdate', back);
            video.currentTime = 1e101;
        }
        paint();
    });
    ['timeupdate', 'play', 'pause', 'durationchange', 'ended'].forEach((e) => video.addEventListener(e, paint));

    const flip = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
    toggle.addEventListener('click', flip);
    video.addEventListener('click', flip);

    seek.addEventListener('input', () => {
        dragging = true;
        if (length()) video.currentTime = (Number(seek.value) / 1000) * length();
        now.textContent = clock(video.currentTime);
        seek.style.setProperty('--qm-vv-fill', (Number(seek.value) / 10) + '%');
    });
    seek.addEventListener('change', () => { dragging = false; paint(); });

    video.addEventListener('error', () => {
        const note = document.createElement('p');
        note.className = 'qm-vv-bad';
        note.textContent = t('videoCantPlay');
        video.replaceWith(note);
        bar.hidden = true;
    }, { once: true });

    const shut = () => {
        video.pause();
        box.remove();
        URL.revokeObjectURL(url);
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') shut(); };
    close.addEventListener('click', shut);
    document.addEventListener('keydown', onKey);

    paint();
    // Нажатие на кадр — уже касание человека: звук телефон пустит
    video.play().catch(() => paint());
    close.focus();
}

/** Лента видео в настройке двери: кадр каждого и «убрать». Нажатие «убрать» ловит app.js (data-act). */
export function fillVideoStrip(strip, videos, t) {
    releaseVideoUrls(strip);
    strip.innerHTML = '';
    for (const v of videos) {
        const cell = document.createElement('div');
        cell.className = 'qm-video-cell';
        cell.appendChild(videoNode(v.blob, t, { controls: false }));
        // ▶ — кнопка: нажатие на кадр открывает просмотр с перемоткой
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'qm-video-play';
        play.title = t('videoPlay');
        play.setAttribute('aria-label', t('videoPlay'));
        play.addEventListener('click', () => openVideoViewer(v.blob, t));
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
