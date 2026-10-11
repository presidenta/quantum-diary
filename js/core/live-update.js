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

const why = err => (err && err.message ? err.message : String(err || 'неизвестно'));

/**
 * Проверить сайт и, если вышло новое, забрать и применить.
 *
 * ПОЧЕМУ ВОЗВРАЩАЕТ РАЗБОР, А НЕ «ДА/НЕТ».
 * Раньше любая беда — нет сети, сайт молчит, пакет не скачался — давала
 * одно и то же «нет». На телефоне это выглядело как «обновлений не было»
 * при вышедшем обновлении, и найти причину было нельзя: она пряталась в
 * консоли, до которой с телефона не добраться. Теперь причина
 * возвращается наружу и её видно человеку в плашке.
 *
 * @param {object} [options]
 * @param {boolean} [options.applyNow] подменить пакет немедленно. Так
 *        зовёт кнопка «Обновить»: человек нажал её сам и ждёт результата
 *        сейчас, а не при следующем запуске.
 * @returns {Promise<{status: string, mine?: number, latest?: number, where?: string, error?: string}>}
 *          browser — не приложение, обновлять нечего;
 *          none — новее ничего нет;
 *          updated — пакет подменён, приложение перезапускается;
 *          scheduled — скачан, встанет при следующем запуске;
 *          error — не вышло, где и почему.
 */
export async function checkForUpdate({ applyNow = false } = {}) {
    const updater = plugin();
    if (!updater) return { status: 'browser' };

    let mine;
    try {
        mine = await runningRelease();
    } catch (err) {
        return { status: 'error', where: 'своя версия', error: why(err) };
    }

    let latest;
    try {
        latest = await publishedUpdate();
    } catch (err) {
        return { status: 'error', where: 'сайт', error: why(err), mine };
    }

    const number = Number(latest && latest.release);
    if (!latest || !latest.url || !Number.isFinite(number)) {
        return { status: 'error', where: 'сайт', error: 'непонятный ответ', mine };
    }
    if (number <= mine) return { status: 'none', mine, latest: number };

    let bundle;
    try {
        bundle = await updater.download({
            version: String(latest.version || `${number}.0.0`),
            url: latest.url
        });
    } catch (err) {
        return { status: 'error', where: 'загрузка пакета', error: why(err), mine, latest: number };
    }

    try {
        /* Человек нажал кнопку — подменяем сейчас же. Откладывать можно
           только самому себе, при запуске: тогда выдёргивать экран из-под
           рук было бы грубо. Раньше откладывалось всегда, и человек,
           который не закрывает приложение, не видел нового никогда. */
        if (applyNow || Date.now() - startedAt < QUIET_START_MS) {
            await updater.set(bundle);     // плагин сам перезапустит экран
            return { status: 'updated', mine, latest: number };
        }
        await updater.next(bundle);        // применится при следующем запуске
        return { status: 'scheduled', mine, latest: number };
    } catch (err) {
        return { status: 'error', where: 'подмена пакета', error: why(err), mine, latest: number };
    }
}
