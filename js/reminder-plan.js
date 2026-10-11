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

import { ensureReady, scheduleReminders, cancelKeys, onReminderAction, isNative } from './core/reminders.js';
import { momentPlan, windowPlan, KEY_WINDOW } from './core/reminder-rules.js';
import { state, t } from './store.js';
import { CONFIG } from './views/space/config.js';

/* ТИХИЕ ЧАСЫ.

   Окно возможностей открывается само, через 3 часа 33 минуты после
   прыжка, и упасть может куда угодно — в том числе на три часа ночи.
   Звонок с вибрацией в это время человеку не помощь, а вред.

   Границы взяты не с потолка: dailyWindow с 6 до 21 лежит в config.js
   раздела с самого начала. Там он описан как рабочее время раздела, но до
   сих пор ни разу не применялся — ни одна строка кода его не читала.
   Здесь он наконец работает, и ровно там, где нужнее всего: на звуке.

   Моментов дня это НЕ касается. Их время назначает администратор вручную,
   и если момент поставлен на пять утра, значит так и задумано. */
const QUIET_FROM = CONFIG.dailyWindow.endHour;      // 21:00 — после этого молчим
const QUIET_UNTIL = CONFIG.dailyWindow.startHour;   // 06:00 — до этого молчим

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
    const moments = momentPlan(state.quantum && state.quantum.moments, now);
    const window = windowPlan(lastJumpTime(), now, {
        cooldownMs: CONFIG.timing.jumpCooldownMs,
        quietFrom: QUIET_FROM,
        quietUntil: QUIET_UNTIL
    });

    /* Сначала снимаем лишнее: прожитые и погашенные моменты, а если окна
       больше нет — и его. Фасад снимает только те ключи, которые ему
       передали на постановку, и про остальные знать не может. */
    const silence = window ? moments.silence : moments.silence.concat(KEY_WINDOW);
    if (silence.length) await cancelKeys(silence);

    const totalSec = Math.floor(CONFIG.timing.opportunityWindowMs / 1000);

    const ring = moments.ring.map(item => ({
        ...item,
        title: t('reminder.moment.title'),
        body: t('reminder.moment.body')
    }));

    if (window) {
        ring.push({
            ...window,
            title: t('reminder.window.title'),
            body: t('reminder.window.body', {
                min: Math.floor(totalSec / 60),
                sec: totalSec % 60
            })
        });
    }

    if (!ring.length) return false;
    return scheduleReminders(ring);
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
