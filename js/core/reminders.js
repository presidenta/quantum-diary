/* Системные напоминания: «Окно возможностей» и девять напоминаний дня.

   Один фасад на оба источника. В собранном приложении расписание уходит в
   системный планировщик Android и срабатывает по часам устройства, без сети
   и даже когда приложение закрыто. В обычном браузере фасад молчит и
   возвращает false — приложение продолжает работать как раньше.

   ПОЧЕМУ БЕЗ import.
   В проекте нет сборщика: браузер грузит web/js/*.js как есть. Строка
   import { LocalNotifications } from '@capacitor/local-notifications'
   не разрешилась бы ни в браузере, ни внутри приложения. Capacitor сам
   кладёт плагины в window.Capacitor.Plugins, оттуда их и берём — это
   штатный путь для проектов без сборки.

   ДВА РЕЖИМА, И ВЫБИРАЕТ ИХ НЕ ЭТОТ ФАЙЛ.

   1. ОБЫЧНОЕ УВЕДОМЛЕНИЕ — канал importance: 5. Всплывающая плашка со
      звуком и вибрацией поверх текущего экрана, по громкости уведомлений.
      Проверено на телефоне, разобрано в разделе 9.1 методологии. Путь
      этот работает и остаётся основным.

   2. БУДИЛЬНИК — свой нативный плагин QuantumAlarm
      (android-alarm-plugin/). Окно во весь экран поверх блокировки,
      экран включается сам, звук по громкости будильника и звонит, пока
      не нажмут. Стандартный плагин так не умеет: ни setFullScreenIntent,
      ни канала USAGE_ALARM у него нет. Раздел 9.2.

   Режим задаёт САМО НАПОМИНАНИЕ — полем alarm в элементе расписания.
   Решает это слой выше (js/reminder-plan.js), он один знает и настройку
   человека, и что за напоминание ставится. Фасад только разводит поток
   по двум плагинам.

   ЕСЛИ БУДИЛЬНИК НЕ ВЫШЕЛ — напоминание уходит обычной плашкой, а не
   пропадает. Приложение без нативного плагина (старая сборка), отобранное
   разрешение на точные будильники, неизвестная беда внутри плагина —
   причин хватает, и ни одна из них не повод оставить человека без
   напоминания вовсе. */

const CHANNEL_ID = 'quantum-alarms';
const ACTION_WITH_SNOOZE = 'qm-reminder';
const ACTION_FINAL = 'qm-reminder-final';

const SNOOZE_MINUTES = 10;

/* Проверочный звонок: столько ждать до него. Десять секунд — чтобы
   человек успел убрать палец с экрана и, если хочет, заблокировать
   телефон: ровно это и надо проверить — поднимется ли окно поверх
   блокировки. */
const KEY_TEST = 'alarm-test';
const TEST_DELAY_MS = 10 * 1000;
const SNOOZE_LIMIT = 3;
const KEY_SNOOZE = 'reminder_snooze_';

/** Плагин уведомлений или null, если приложение открыто в браузере. */
function plugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.Plugins) return null;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
    return cap.Plugins.LocalNotifications || null;
}

/** Собрано ли приложение нативно. */
export function isNative() {
    return plugin() !== null;
}

/* Свой плагин будильника — или null.

   Берётся ровно так же, как штатный: из window.Capacitor.Plugins. Своего
   JS плагин в приложение не везёт и не может — сборщика в проекте нет, а
   веб-часть и вовсе приезжает с сайта. Объект туда кладёт нативный мост
   Capacitor по имени из аннотации @CapacitorPlugin(name = "QuantumAlarm").

   null здесь — не поломка, а обычное дело: в браузере и в сборке, где
   плагина ещё не было, его просто нет. */
function alarmPlugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.Plugins) return null;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
    return cap.Plugins.QuantumAlarm || null;
}

/** Умеет ли это приложение звонить будильником. */
export function hasAlarmMode() {
    return alarmPlugin() !== null;
}

/* РАЗРЕШЕНО ЛИ ПОЛНОЭКРАННОЕ ОКНО.
 *
 * До Android 14 разрешение выдавали всем, кто попросил его в манифесте.
 * С Android 14 сходу его имеют только звонилки и будильники по
 * назначению, остальным человек выдаёт его сам. Не выдано — звук будет,
 * а экран не загорится: напоминание придёт обычной плашкой.
 *
 * Спрашивать это обязательно. Промолчать значило бы обещать человеку
 * будильник и дать ему уведомление — ровно та поломка, которую он не
 * сможет ни заметить, ни объяснить.
 *
 * granted — выдано ли. askable — есть ли куда вести: на Android 13 и
 * старше такой настройки не существует, и кнопка «Разрешить» была бы
 * кнопкой в никуда.
 *
 * @returns {Promise<{granted: boolean, askable: boolean}>}
 */
export async function alarmFullScreen() {
    const QA = alarmPlugin();
    if (!QA) return { granted: false, askable: false };

    try {
        const ответ = await QA.canUseFullScreen();
        return {
            granted: !!(ответ && ответ.granted),
            askable: !!(ответ && ответ.askable)
        };
    } catch (err) {
        console.error('[reminders] не удалось спросить про полный экран:', err);
        return { granted: false, askable: false };
    }
}

/* ПРОВЕРОЧНЫЙ ЗВОНОК — через десять секунд.
 *
 * Нужен потому, что проверить будильник иначе нельзя: ближайший
 * настоящий момент может быть через час, а в облачной сессии телефона
 * нет вовсе. Без этой кнопки владелец не может убедиться ни в чём —
 * загорается ли экран, слышно ли звук, выключает ли кнопка.
 *
 * Ключ свой, не из расписания: проверочный звонок не должен ни снимать
 * настоящее напоминание, ни сниматься вместе с ним при перестановке.
 * Откладывать его нельзя — snoozeLeft: 0, и кнопки «Отложить» не будет:
 * это проверка, а не напоминание.
 *
 * @returns {Promise<boolean>} поставлен ли звонок
 */
export async function testAlarm({ title, body, stopLabel }) {
    const QA = alarmPlugin();
    if (!QA) return false;

    try {
        const ответ = await QA.schedule({
            alarms: [{
                key: KEY_TEST,
                at: Date.now() + TEST_DELAY_MS,
                title,
                body,
                stopLabel: stopLabel || '',
                snoozeLabel: '',
                snoozeLeft: 0
            }]
        });
        return Number(ответ && ответ.scheduled) > 0;
    } catch (err) {
        console.error('[reminders] проверочный звонок не встал:', err);
        return false;
    }
}

/* КУДА ВЕСТИ, ЕСЛИ ПРИШЛИ ПО ЗВОНКУ.
 *
 * Экран будильника запускает приложение и оставляет плагину признак,
 * куда человека вести. Спрашивать надо при запуске И при возвращении на
 * экран: приложение могло быть уже открыто, и тогда страница не
 * перезагружается.
 *
 * Плагин отвечает один раз и сразу забывает цель. Иначе один звонок
 * уводил бы человека на тот же экран при каждом следующем открытии
 * приложения.
 *
 * @returns {Promise<string>} «space», «moments» или пустая строка
 */
export async function takeAlarmTarget() {
    const QA = alarmPlugin();
    if (!QA) return '';

    try {
        const ответ = await QA.takeOpenTarget();
        return (ответ && ответ.target) || '';
    } catch (err) {
        console.error('[reminders] не удалось спросить цель звонка:', err);
        return '';
    }
}

/**
 * Отвести человека в системные настройки за этим разрешением.
 * @returns {Promise<boolean>} открылись ли настройки
 */
export async function openAlarmSettings() {
    const QA = alarmPlugin();
    if (!QA) return false;

    try {
        await QA.openFullScreenSettings();
        return true;
    } catch (err) {
        console.error('[reminders] не удалось открыть настройки:', err);
        return false;
    }
}

/* Capacitor требует числовые идентификаторы уведомлений, а нам удобнее
   строковые ключи вида "quantum-1" или "daily-7". Переводим одно в другое
   устойчиво: один и тот же ключ всегда даёт одно и то же число. */
function numericId(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2000000000;
}

function snoozeCount(key) {
    try {
        return Number(localStorage.getItem(KEY_SNOOZE + key)) || 0;
    } catch {
        return 0;
    }
}

function setSnoozeCount(key, value) {
    try {
        localStorage.setItem(KEY_SNOOZE + key, String(value));
    } catch {
        /* приватный режим браузера */
    }
}

/** Сбросить счётчик откладываний — когда напоминание прожито. */
export function resetSnooze(key) {
    setSnoozeCount(key, 0);
}

/** Сколько откладываний осталось. */
export function snoozeLeft(key) {
    return Math.max(0, SNOOZE_LIMIT - snoozeCount(key));
}

/**
 * Разрешение, канал и кнопки. Вызывать один раз при старте.
 * @returns {Promise<boolean>} готов ли планировщик
 */
export async function ensureReady() {
    const LN = plugin();
    if (!LN) return false;

    try {
        let granted = await LN.checkPermissions();
        if (granted.display !== 'granted') granted = await LN.requestPermissions();
        if (granted.display !== 'granted') return false;

        // Канал с наивысшей важностью: уведомление всплывает поверх экрана,
        // со звуком и вибрацией, если они разрешены в настройках телефона.
        // Звук специально не задаём: ссылка на отсутствующий файл в res/raw
        // сделала бы канал беззвучным. Свой звук — отдельной задачей.
        await LN.createChannel({
            id: CHANNEL_ID,
            name: 'Напоминания',
            description: 'Окно возможностей и напоминания дня',
            importance: 5,
            visibility: 1,
            vibration: true
        });

        await LN.registerActionTypes({
            types: [
                {
                    id: ACTION_WITH_SNOOZE,
                    actions: [
                        { id: 'open', title: 'Открыть' },
                        { id: 'snooze', title: 'Отложить на 10 минут' }
                    ]
                },
                {
                    // После третьего откладывания остаётся только «Открыть»
                    id: ACTION_FINAL,
                    actions: [{ id: 'open', title: 'Открыть' }]
                }
            ]
        });

        return true;
    } catch (err) {
        console.error('[reminders] подготовка не удалась:', err);
        return false;
    }
}

/**
 * Поставить расписание. Прежние напоминания с теми же ключами снимаются,
 * поэтому функцию можно звать сколько угодно раз.
 *
 * @param {Array<{key: string, at: Date|number, title: string, body?: string}>} items
 * @returns {Promise<boolean>} удалось ли поставить
 */
export async function scheduleReminders(items) {
    const LN = plugin();
    if (!LN || !Array.isArray(items) || items.length === 0) return false;

    const now = Date.now();
    const будущие = [];

    for (const item of items) {
        const at = item.at instanceof Date ? item.at.getTime() : Number(item.at);
        if (!Number.isFinite(at) || at <= now) continue;   // прошедшее не ставим
        будущие.push({ ...item, at });
    }

    if (будущие.length === 0) return false;

    /* Снимаем ВСЕ переданные ключи, а не только те, что сейчас поставим.
       Прошедшее отсеялось выше, но в системе оно ещё лежит с прошлого
       раза, и снять его больше некому. */
    await cancelKeys(items.map(item => item.key));

    /* РАЗВОДКА ПО ДВУМ РЕЖИМАМ.
       Сначала будильники: что не вышло — то уходит обычной плашкой, и
       эти напоминания надо дописать ко второму списку, а не потерять. */
    const просилиБудильник = будущие.filter(item => item.alarm === true);
    const неВышло = await поставитьБудильники(просилиБудильник);

    const плашкой = будущие.filter(item => item.alarm !== true).concat(неВышло);

    const звонит = просилиБудильник.length - неВышло.length;
    const всплывает = await поставитьУведомления(LN, плашкой);

    return звонит > 0 || всплывает;
}

/* БУДИЛЬНИКОМ.
 *
 * @returns {Promise<Array>} те напоминания, которые поставить не удалось.
 *          Их зовущий отправит обычной плашкой: напоминание без звонка
 *          лучше, чем молчание.
 */
async function поставитьБудильники(items) {
    if (items.length === 0) return [];

    const QA = alarmPlugin();
    if (!QA) return items;      // старая сборка без плагина — не беда, но и не будильник

    const alarms = items.map(item => ({
        key: item.key,
        at: item.at,
        title: item.title,
        body: item.body || '',
        /* Надписи на кнопках приходят сверху уже на языке человека:
           нативный экран своего перевода не имеет и иметь не должен —
           словарь один, в web/js/core/i18n.js. */
        stopLabel: item.stopLabel || '',
        snoozeLabel: item.snoozeLabel || '',
        /* Надпись главной кнопки и куда она ведёт. Человек, разбуженный
           звонком, одним нажатием попадает в действие, а не на
           заблокированный экран. Цель — та же строка, которой приложение
           открывает вкладку: «space» или «moments». */
        openLabel: item.openLabel || '',
        openTarget: item.openTarget || '',
        snoozeLeft: snoozeLeft(item.key)
    }));

    try {
        const ответ = await QA.schedule({ alarms });

        /* Плагин называет не вышедшие по именам. Это важнее, чем кажется:
           по одному числу «не встало две» нельзя понять, какие именно, и
           пришлось бы отправлять плашкой весь список — человек получил бы
           и звонок, и плашку об одном и том же. */
        const ключи = ответ && ответ.failedKeys;
        if (Array.isArray(ключи)) {
            if (ключи.length === 0) return [];
            return items.filter(item => ключи.includes(item.key));
        }

        // Плагин старее этого кода: списка нет, есть только число.
        // Тогда плашкой уходит всё — лишняя плашка лучше тишины.
        return Number(ответ && ответ.failed) > 0 ? items : [];
    } catch (err) {
        console.error('[reminders] будильник не встал, уходим плашкой:', err);
        return items;
    }
}

/* ОБЫЧНОЙ ПЛАШКОЙ.
 *
 * Путь, который работает с 11.10.2026 и проверен на телефоне. Тело
 * функции — ровно то, что раньше лежало прямо в scheduleReminders:
 * вынесено, чтобы появился второй режим, и не тронуто ни в одной строке.
 */
async function поставитьУведомления(LN, items) {
    if (items.length === 0) return false;

    const notifications = items.map(item => {
        const used = snoozeCount(item.key);

        return {
            id: numericId(item.key),
            title: item.title,
            body: item.body || '',
            channelId: CHANNEL_ID,
            actionTypeId: used < SNOOZE_LIMIT ? ACTION_WITH_SNOOZE : ACTION_FINAL,
            extra: { key: item.key },
            schedule: {
                at: new Date(item.at),
                // Будит устройство даже в режиме энергосбережения:
                // плагин разворачивает это в setExactAndAllowWhileIdle
                allowWhileIdle: true
            }
        };
    });

    try {
        await LN.schedule({ notifications });
        return true;
    } catch (err) {
        console.error('[reminders] не удалось поставить расписание:', err);
        return false;
    }
}

/* Снять напоминания по ключам.
 *
 * Снимаем В ОБОИХ РЕЖИМАХ, не разбираясь, каким именно это напоминание
 * ставилось. Разбираться и не на чем: режим мог поменяться с прошлого
 * раза — человек выключил будильник в профиле, и прежний звонок остался
 * висеть в системе. Снятие лишнего ничего не стоит, пропущенное снятие
 * стоит звонка о том, чего уже нет. */
export async function cancelKeys(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;

    const LN = plugin();
    if (LN) {
        try {
            await LN.cancel({ notifications: keys.map(key => ({ id: numericId(key) })) });
        } catch (err) {
            console.error('[reminders] не удалось снять напоминания:', err);
        }
    }

    const QA = alarmPlugin();
    if (QA) {
        try {
            await QA.cancel({ keys });
        } catch (err) {
            console.error('[reminders] не удалось снять будильники:', err);
        }
    }
}

/** Снять вообще все напоминания. Нужно «рубильнику» при блокировке. */
export async function cancelAll() {
    const LN = plugin();
    if (LN) {
        try {
            const pending = await LN.getPending();
            if (pending && pending.notifications && pending.notifications.length) {
                await LN.cancel({ notifications: pending.notifications });
            }
        } catch (err) {
            console.error('[reminders] не удалось снять все напоминания:', err);
        }
    }

    /* Будильники перечислять не нужно: их список плагин ведёт сам
       (AlarmStore) — AlarmManager рассказывать о поставленном не умеет. */
    const QA = alarmPlugin();
    if (QA) {
        try {
            await QA.cancelAll();
        } catch (err) {
            console.error('[reminders] не удалось снять все будильники:', err);
        }
    }
}

/**
 * Отложить напоминание на 10 минут. Больше трёх раз не даём.
 * @returns {Promise<boolean>} отложено ли
 */
export async function snooze(key, title, body) {
    const LN = plugin();
    if (!LN) return false;

    const used = snoozeCount(key);
    if (used >= SNOOZE_LIMIT) return false;

    const next = used + 1;
    setSnoozeCount(key, next);

    const at = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);

    try {
        await LN.schedule({
            notifications: [{
                id: numericId(key),
                title,
                body: body || '',
                channelId: CHANNEL_ID,
                // На третьем откладывании кнопки «Отложить» уже не будет
                actionTypeId: next < SNOOZE_LIMIT ? ACTION_WITH_SNOOZE : ACTION_FINAL,
                extra: { key },
                schedule: { at, allowWhileIdle: true }
            }]
        });
        return true;
    } catch (err) {
        console.error('[reminders] не удалось отложить:', err);
        setSnoozeCount(key, used);   // откатываем счётчик, раз не вышло
        return false;
    }
}

/**
 * Подписка на нажатия по уведомлению.
 * «Открыть» и само тело уведомления отдаются наружу, «Отложить»
 * обрабатывается здесь же.
 *
 * @param {(key: string) => void} onOpen что делать при открытии
 */
/* Что сейчас стоит в системе: ключи со сроками.

   Нужно человеку, а не коду. Будильник, который промолчал, следов не
   оставляет, и отличить «не поставился» от «телефон снял» нельзя ничем
   другим. */
export async function pendingAlarms() {
    const пусто = { alarms: [], systemNext: 0, batteryUnrestricted: true };

    const QA = alarmPlugin();
    if (!QA || typeof QA.pending !== 'function') return пусто;

    try {
        const ответ = await QA.pending();
        return {
            alarms: Array.isArray(ответ && ответ.alarms) ? ответ.alarms : [],
            // Что помнит САМА система, а не мы: ноль при непустом списке
            // означает, что будильники сняли со стороны
            systemNext: Number(ответ && ответ.systemNext) || 0,
            batteryUnrestricted: (ответ && ответ.batteryUnrestricted) !== false
        };
    } catch (err) {
        console.error('[reminders] не удалось прочитать поставленные:', err);
        return пусто;
    }
}

/* Попросить телефон не усыплять приложение.

   Окно показывает система, ответ даёт человек. Обойти это нельзя и не
   нужно: разрешение серьёзное, и спрашивать о нём должен сам человек. */
export async function askBatteryFreedom() {
    const QA = alarmPlugin();
    if (!QA || typeof QA.requestBattery !== 'function') return false;

    try {
        await QA.requestBattery();
        return true;
    } catch (err) {
        console.error('[reminders] окно про батарею не открылось:', err);
        return false;
    }
}

export async function onReminderAction(onOpen) {
    const LN = plugin();
    if (!LN) return;

    try {
        await LN.addListener('localNotificationActionPerformed', async event => {
            const notification = event.notification || {};
            const key = (notification.extra && notification.extra.key) || '';

            if (event.actionId === 'snooze') {
                await snooze(key, notification.title, notification.body);
                return;
            }

            // «Открыть» или нажатие по самому уведомлению
            resetSnooze(key);
            if (typeof onOpen === 'function') onOpen(key);
        });
    } catch (err) {
        console.error('[reminders] не удалось подписаться на нажатия:', err);
    }
}
