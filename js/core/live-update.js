/* Самообновление приложения по воздуху.

   Установленное приложение обновляется само, без переустановки. Всё, что
   видно на экране, — это веб-часть внутри приложения, и именно её можно
   заменить на ходу: приложение скачивает свежий пакет с сайта и подменяет
   им себя. Скачивать новый файл приложения и ставить его заново больше не
   нужно.

   Новый файл приложения понадобится только при смене нативной части —
   списка плагинов, разрешений, имени или значка. Это бывает редко.

   КАК ПОНИМАЕМ, ЧТО ВЫШЛО НОВОЕ.
   Сравниваем номер выкладки: свой берём из version.json рядом с собой,
   чужой — из native/latest.json на сайте. Номер едет вместе с файлами,
   поэтому сравнение всегда честное и не зависит от того, как плагин
   назвал установленный пакет.

   СТРАХОВКА ОТ БИТОЙ ВЫКЛАДКИ.
   Плагин ждёт от приложения отчёта, что оно поднялось. Не дождавшись за
   десять секунд, он возвращает прежний пакет. Поэтому notifyAppReady
   вызывается первым делом при запуске: пока она вызывается, откат не
   случится, а если новая выкладка не запустится вовсе — телефон сам
   вернётся на работавшую версию.

   В браузере весь этот файл молчит и ничего не делает: там обновление и
   так приходит обычным обновлением страницы. */

const SITE = 'https://presidenta.github.io/quantum-diary';
const MANIFEST_URL = `${SITE}/native/latest.json`;

/* Сколько времени после запуска считается «человек ещё не начал работать».
   Успели скачать за это время — подменяем сразу, человек увидит свежую
   версию уже сейчас. Не успели — оставляем до следующего запуска, чтобы
   не выдёргивать экран из-под рук. */
const QUIET_START_MS = 20000;

const startedAt = Date.now();

/** Плагин обновления или null, если приложение открыто в браузере. */
function plugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.Plugins) return null;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
    return cap.Plugins.CapacitorUpdater || null;
}

/** Собрано ли приложение нативно. */
export function isNative() {
    return plugin() !== null;
}

/**
 * Отчитаться, что приложение поднялось. Вызывать первым делом при запуске.
 * Без этого плагин через десять секунд откатит выкладку назад.
 */
export async function markStartedOk() {
    const updater = plugin();
    if (!updater) return;

    try {
        await updater.notifyAppReady();
    } catch (err) {
        console.warn('[обновление] не удалось отчитаться о запуске:', err);
    }
}

/** Номер выкладки, который сейчас работает на телефоне. */
async function runningRelease() {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`version.json: HTTP ${res.status}`);
    return Number((await res.json()).release);
}

/** Что сейчас выложено на сайте. */
async function publishedUpdate() {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`latest.json: HTTP ${res.status}`);
    return res.json();
}

/**
 * Проверить сайт и, если вышло новое, забрать и применить.
 * Молча переживает отсутствие сети: не вышло — попробуем в другой раз.
 *
 * @returns {Promise<boolean>} досталась ли новая версия
 */
export async function checkForUpdate() {
    const updater = plugin();
    if (!updater) return false;

    try {
        const [mine, latest] = await Promise.all([runningRelease(), publishedUpdate()]);

        if (!latest || !latest.url || !Number.isFinite(Number(latest.release))) return false;
        if (Number(latest.release) <= mine) return false;

        const bundle = await updater.download({
            version: String(latest.version || `${latest.release}.0.0`),
            url: latest.url
        });

        if (Date.now() - startedAt < QUIET_START_MS) {
            await updater.set(bundle);     // подменяем сейчас же
        } else {
            await updater.next(bundle);    // применится при следующем запуске
        }
        return true;
    } catch (err) {
        // Нет сети, сайт недоступен, пакет не скачался — не беда
        console.warn('[обновление] пропускаем:', err && err.message ? err.message : err);
        return false;
    }
}
