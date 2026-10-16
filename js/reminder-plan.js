/* СВЯЗКА НАПОМИНАНИЙ С ПРИЛОЖЕНИЕМ.

   Три слоя, и у каждого своё дело:

     core/reminders.js      — фасад над плагином: разрешения, канал,
                              постановка и снятие. Про моменты и окна не
                              знает ничего.
     core/reminder-rules.js — чистые правила: что звонит и когда. Без
                              браузера, под тестами.
     этот файл              — связка: берёт состояние приложения, спрашивает
                              правила и отдаёт решение фасаду.

   ДВА ИСТОЧНИКА НАПОМИНАНИЙ.
   1. Моменты дня («Архитектор метавселенной») — приходят с сервера со
      своим временем, по девять на день.
   2. Окно возможностей («Наблюдатель метавселенной») — считается само:
      последний прыжок плюс 3 часа 33 минуты.

   В браузере весь модуль молчит и возвращает false. Системных напоминаний
   в браузере не бывает в принципе: страница закрыта — таймеры мертвы, а
   разбудить себя по часам вкладка не может. Это не чинится кодом, только
   установкой приложения. */

import {
    ensureReady, scheduleReminders, cancelKeys, onReminderAction, isNative,
    hasAlarmMode, alarmFullScreen, alarmOverlay, setGuard
} from './core/reminders.js';
import {
    momentPlan, windowPlan, normalizeQuiet as normalize, KEY_WINDOW, KEY_MOMENT,
    normalizeAlarm, ringsAsAlarm, nextRingPlan, isWindowKey, modeOf,
    guardFrames, guardText
} from './core/reminder-rules.js';
import { state, t } from './store.js';
import { getMeta, setMeta } from './db.js';
import { CONFIG } from './views/space/config.js';

/* ТИХИЙ ЧАС.

   Промежуток, когда приложение не беспокоит: не звонит, не вибрирует,
   не зажигает экран. Границы задаёт человек в профиле — кнопка «Тихий
   час». Раньше они были зашиты в код, и это было неправильно: время сна
   у каждого своё, и менять его правкой исходников нельзя.

   Начальные границы берутся из dailyWindow раздела — с 21 до 6. Эти
   цифры лежали в config.js с самого начала как рабочее время раздела, и
   до недавнего они ни разу не применялись. Пусть они и будут тем, что
   человек увидит в настройке до первой своей правки.

   Хранится настройка на устройстве, рядом с языком: это свойство
   телефона, а не учётной записи. На планшете человек вправе спать в
   другое время. */
const QUIET_KEY = 'quietHours';
const двеЦифры = n => String(n).padStart(2, '0') + ':00';

export const QUIET_DEFAULT = Object.freeze({
    on: true,
    from: двеЦифры(CONFIG.dailyWindow.endHour),     // 21:00
    until: двеЦифры(CONFIG.dailyWindow.startHour)   // 06:00
});

/* Проверка настройки живёт в чистых правилах и там же под тестами —
   здесь только подставляются начальные значения этого приложения. */
export const normalizeQuiet = raw => normalize(raw, QUIET_DEFAULT);

/* РЕЖИМ АКТИВНОСТИ.

   Напоминание звонит как будильник: окно поверх всех окон, экран
   включается сам, звук по громкости будильника, звонит, пока не нажмёшь.
   Разбор — раздел 9.3 методологии, нативная часть — android-alarm-plugin.

   Хранится рядом с тихим часом и по той же причине: это свойство
   телефона, а не учётной записи. Будильник уместен на телефоне у кровати
   и неуместен на планшете, который лежит на столе.

   НАЧАЛЬНОЕ ЗНАЧЕНИЕ — ВКЛЮЧЕНО, и это перемена от 16.10.2026. Прежде
   режим был выключен по умолчанию, а о девяти моментах дня звонила ещё и
   отдельная вторая галочка. Владелец включил режим, назвал час — и
   получил беззвучную плашку, потому что звонила та галочка, которую он не
   нашёл.

   От ночного звонка защищает тихий час, он тоже включён по умолчанию (с
   21 до 6) и в эти часы приходит беззвучная плашка. Защита от звонка —
   его дело, а не выключенный режим: выключенный режим защищает и днём,
   когда защищать не от чего. */
const ALARM_KEY = 'alarmMode';

export const ALARM_DEFAULT = Object.freeze({ on: true });

/** Режим будильника, как его задал человек. */
export async function loadAlarm() {
    try {
        return normalizeAlarm(await getMeta(ALARM_KEY));
    } catch {
        return { ...ALARM_DEFAULT };
    }
}

/** Сохранить режим будильника и сразу переставить расписание под него. */
export async function saveAlarm(value) {
    const alarm = normalizeAlarm(value);
    await setMeta(ALARM_KEY, alarm);
    await planReminders();
    return alarm;
}

/* Что рассказать человеку о режиме прямо сейчас.
 *
 * Три разных «нет», и их нельзя сваливать в одно:
 *
 *   plugin: false   — приложение собрано до появления плагина. Чинится
 *                     установкой нового файла приложения, не настройкой.
 *   fullScreen      — разрешение на полноэкранные напоминания не выдано
 *                     (Android 14 и новее). Звук будет, экран не
 *                     загорится. Чинится настройкой телефона.
 *   askable         — есть ли куда вести за этим разрешением: на
 *                     Android 13 и старше такой настройки нет вовсе.
 *
 * Говорить об этом обязательно. Промолчать — значит обещать человеку
 * будильник и дать ему уведомление. */
export async function alarmState() {
    const plugin = hasAlarmMode();
    if (!plugin) {
        return {
            plugin: false, fullScreen: false, askable: false,
            overlay: true, overlayAskable: false
        };
    }

    const экран = await alarmFullScreen();
    const поверх = await alarmOverlay();

    return {
        plugin: true,
        fullScreen: экран.granted,
        askable: экран.askable,
        /* Окно поверх того, чем человек занят, — отдельное разрешение и
           отдельная строка. Валить его в одну с полноэкранным нельзя: они
           про разное и выдаются в разных местах настроек. */
        overlay: поверх.granted,
        overlayAskable: поверх.askable
    };
}

/** Тихий час, как его задал человек. */
export async function loadQuiet() {
    try {
        return normalizeQuiet(await getMeta(QUIET_KEY));
    } catch {
        return { ...QUIET_DEFAULT };
    }
}

/** Сохранить тихий час и сразу переставить расписание под него. */
export async function saveQuiet(value) {
    const quiet = normalizeQuiet(value);
    await setMeta(QUIET_KEY, quiet);
    await planReminders();
    return quiet;
}

/* Разрешение и канал спрашиваем один раз за запуск, а не на каждую
   перестановку расписания: ensureReady обращается к системе, и звать её
   по десять раз на дню незачем. */
let ready = null;

async function readyOnce() {
    if (ready === null) ready = await ensureReady();
    return ready;
}

function lastJumpTime() {
    try {
        return Number(localStorage.getItem('last_quantum_jump_time')) || 0;
    } catch {
        return 0;   // приватный режим браузера — не беда
    }
}

/**
 * Переставить всё расписание заново.
 *
 * Звать можно сколько угодно раз и откуда угодно: прежние напоминания с
 * теми же ключами снимаются сами. Это важнее, чем кажется, — расписание
 * меняется от каждого прожитого момента и каждого прыжка.
 *
 * @returns {Promise<boolean>} поставлено ли хоть одно напоминание
 */
export async function planReminders() {
    if (!isNative()) return false;        // в браузере ставить нечего
    if (!await readyOnce()) return false; // человек не дал разрешения

    const now = new Date();
    const quiet = await loadQuiet();
    const alarm = await loadAlarm();

    /* СТРАЖ СТОИТ, ПОКА ВКЛЮЧЁН РЕЖИМ АКТИВНОСТИ И ЕСТЬ ЧТО ЗВОНИТЬ.
       Нативная часть сама решает, есть ли что звонить, и сама уходит, когда
       звонить нечем: здесь передаётся только настройка человека и подписи
       на его языке. Ставится ДО расписания — постановка звонков следом
       запускает стража сама.

       Вместе с настройкой едет и содержимое плашки: кадры текста на весь
       остаток дня (см. guardFrames) и подписи двух кнопок. Текст
       собирается здесь, на языке человека, а страж лишь выбирает кадр по
       часам — так времена на плашке не могут разойтись с главным экраном,
       и обновляется она, даже когда приложение закрыто. */
    const кадры = guardFrames(state.quantum?.moments, lastJumpTime(), now, {
        cooldownMs: CONFIG.timing.jumpCooldownMs,
        windowMs: CONFIG.timing.opportunityWindowMs,
        // Выключенное направление времени не имеет — на плашке прочерк
        architectOn: alarm.momentsMode !== 'off',
        observerOn: alarm.windowMode !== 'off'
    }).map(кадр => ({ from: кадр.from, text: guardText(кадр, t) }));

    await setGuard({
        on: alarm.on && alarm.guardOn,
        title: t('guard.title'),
        text: t('guard.text'),
        frames: кадры,
        settingsLabel: t('guard.settings'),
        homeLabel: t('guard.home')
    });

    /* Направление выключено совсем — в план оно не попадает, а его ключи
       уходят в снятие (momentPlan и windowPlan это делают сами). Режим
       активности сюда не смотрит: он решает только, звонить ли. */
    const moments = momentPlan(state.quantum?.moments, now, quiet, alarm);
    const window = windowPlan(lastJumpTime(), now, {
        cooldownMs: CONFIG.timing.jumpCooldownMs,
        quiet,
        off: modeOf(KEY_WINDOW, alarm) === 'off'
    });

    /* ВРЕМЯ, НАЗНАЧЕННОЕ ЧЕЛОВЕКОМ.
       Своё у окна возможностей, своё у девяти моментов дня — поля в окне
       «Режим будильника». Пусто — список постановки пуст, а ключ попадает
       в снятие: стёртое время должно уйти и из системы. */
    const следующие = nextRingPlan(alarm, now);

    /* Сначала снимаем лишнее: прожитые и погашенные моменты, а если окна
       больше нет — и его. Фасад снимает только те ключи, которые ему
       передали на постановку, и про остальные знать не может. */
    const silence = (window ? moments.silence : moments.silence.concat(KEY_WINDOW))
        .concat(следующие.silence);
    if (silence.length) await cancelKeys(silence);

    const totalSec = Math.floor(CONFIG.timing.opportunityWindowMs / 1000);

    /* Название действия этого момента — оно и станет надписью на главной
       кнопке экрана будильника. Берём у самого момента: это то, ради чего
       человека позвали, и слово «Открыть» вместо него ничего не говорит. */
    const поКлючу = new Map(
        (state.quantum?.moments || []).map(m => [KEY_MOMENT + m.id, m]));

    const ring = moments.ring.map(item => ({
        ...item,
        title: t('reminder.moment.title'),
        body: t('reminder.moment.body'),
        openLabel: поКлючу.get(item.key)?.title || t('alarm.openMoment'),
        openTarget: 'moments'
    }));

    if (window) {
        ring.push({
            ...window,
            title: t('reminder.window.title'),
            body: t('reminder.window.body', {
                min: Math.floor(totalSec / 60),
                sec: totalSec % 60
            }),
            openLabel: t('alarm.openWindow'),
            openTarget: 'space'
        });
    }

    /* Назначенное время — отдельные напоминания со своими ключами. Про
       окно оно или про момент дня, видно по ключу: по нажатию откроется
       та вкладка, куда человека позвали. */
    for (const item of следующие.ring) {
        ring.push(isWindowKey(item.key)
            ? {
                ...item,
                title: t('reminder.window.title'),
                body: t('reminder.window.body', {
                    min: Math.floor(totalSec / 60),
                    sec: totalSec % 60
                }),
                openLabel: t('alarm.openWindow'),
                openTarget: 'space'
            }
            : {
                ...item,
                title: t('reminder.moment.title'),
                body: t('reminder.moment.body'),
                openLabel: t('alarm.openMoment'),
                openTarget: 'moments'
            });
    }

    if (!ring.length) return false;
    return scheduleReminders(ring.map(item => разметитьРежим(item, alarm)));
}

/* ЧЕМ ЗВОНИТЬ ЭТОМУ НАПОМИНАНИЮ.
 *
 * Фасад (js/core/reminders.js) про моменты и окна не знает ничего и
 * знать не должен — он смотрит только на поле alarm. Решение
 * принимается здесь, потому что только этот слой видит сразу и
 * настройку человека, и то, что за напоминание ставится.
 *
 * Надписи на кнопках едут вместе с напоминанием. Нативный экран
 * будильника своего перевода не имеет и иметь не должен: словарь в
 * приложении один (web/js/core/i18n.js), и человек, переключивший
 * язык, должен увидеть кнопки на своём — включая те, что рисует Java. */
function разметитьРежим(item, alarm) {
    /* ТИХИЙ ЧАС СИЛЬНЕЕ РЕЖИМА АКТИВНОСТИ, и проверка стоит первой.
       Напоминание, попавшее в тишину, не звонит никогда — ни будильником,
       ни звуком уведомления. Признак quiet несёт его до самого фаcада, а
       тот пошлёт беззвучным каналом. */
    if (item.quiet) return item;

    if (!ringsAsAlarm(item.key, alarm)) return item;

    return {
        ...item,
        alarm: true,
        stopLabel: t('alarm.stop'),
        snoozeLabel: t('alarm.snooze')
    };
}

/**
 * Связать планировщик с приложением. Звать один раз при запуске.
 *
 * @param {(key: string) => void} onOpen что делать по нажатию на уведомление
 */
export async function initReminders(onOpen) {
    if (!isNative()) return;

    await onReminderAction(onOpen);

    /* Расписание переставляем и когда приложение открыли, и когда закрыли.

       Возвращение понятно: пока приложение было закрыто, человек мог
       прожить момент или дождаться нового дня с новым расписанием.

       А вот УХОД важнее, и это не сразу очевидно. Самый обычный порядок
       такой: человек открыл приложение, совершил прыжок — и ушёл. Прыжок
       сдвинул время следующего окна на 3 часа 33 минуты вперёд. Если
       ставить расписание только при возвращении, новый срок попал бы в
       будильник лишь когда человек в следующий раз откроет приложение
       сам, — то есть ровно тогда, когда напоминание уже не нужно.

       Поэтому переставляем на любую смену видимости, без разбора.

       visibilitychange, а не плагин @capacitor/app: событие штатно
       работает и в браузере, и внутри приложения, и не тянет в проект
       ещё одну зависимость ради одной строки. */
    document.addEventListener('visibilitychange', () => {
        planReminders().catch(err => console.warn('[напоминания]', err));
    });

    await planReminders();
}
