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

   ЧЕСТНО О ГРАНИЦАХ.
   importance: 5 даёт всплывающее уведомление со звуком и вибрацией поверх
   текущего экрана. Это НЕ полноэкранное окно поверх блокировки: стандартный
   плагин не умеет ни setFullScreenIntent, ни системный аудиоканал будильника
   (USAGE_ALARM). Для них нужен отдельный нативный плагин — это следующий
   шаг, если такого поведения окажется мало. */

const CHANNEL_ID = 'quantum-alarms';
const ACTION_WITH_SNOOZE = 'qm-reminder';
const ACTION_FINAL = 'qm-reminder-final';

const SNOOZE_MINUTES = 10;
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
    const notifications = [];

    for (const item of items) {
        const at = item.at instanceof Date ? item.at.getTime() : Number(item.at);
        if (!Number.isFinite(at) || at <= now) continue;   // прошедшее не ставим

        const used = snoozeCount(item.key);

        notifications.push({
            id: numericId(item.key),
            title: item.title,
            body: item.body || '',
            channelId: CHANNEL_ID,
            actionTypeId: used < SNOOZE_LIMIT ? ACTION_WITH_SNOOZE : ACTION_FINAL,
            extra: { key: item.key },
            schedule: {
                at: new Date(at),
                // Будит устройство даже в режиме энергосбережения:
                // плагин разворачивает это в setExactAndAllowWhileIdle
                allowWhileIdle: true
            }
        });
    }

    if (notifications.length === 0) return false;

    try {
        await cancelKeys(items.map(item => item.key));
        await LN.schedule({ notifications });
        return true;
    } catch (err) {
        console.error('[reminders] не удалось поставить расписание:', err);
        return false;
    }
}

/** Снять напоминания по ключам. */
export async function cancelKeys(keys) {
    const LN = plugin();
    if (!LN || !Array.isArray(keys) || keys.length === 0) return;

    try {
        await LN.cancel({ notifications: keys.map(key => ({ id: numericId(key) })) });
    } catch (err) {
        console.error('[reminders] не удалось снять напоминания:', err);
    }
}

/** Снять вообще все напоминания. Нужно «рубильнику» при блокировке. */
export async function cancelAll() {
    const LN = plugin();
    if (!LN) return;

    try {
        const pending = await LN.getPending();
        if (pending && pending.notifications && pending.notifications.length) {
            await LN.cancel({ notifications: pending.notifications });
        }
    } catch (err) {
        console.error('[reminders] не удалось снять все напоминания:', err);
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
