/* ПРАВИЛА НАПОМИНАНИЙ: что должно позвонить и когда.

   Чистые правила без браузера, сети и плагинов — их можно проверить
   тестами, и они проверены (test/reminders.test.js). Всё, что требует
   телефона, живёт этажом выше, в js/reminder-plan.js: там читается
   состояние приложения и зовётся системный будильник.

   Решение здесь принимается в двух видах сразу: что ПОСТАВИТЬ и что
   СНЯТЬ. Второе не менее важно первого. Напоминание, поставленное вчера,
   живёт в системе само по себе и позвонит, даже если момент давно прожит
   или погашен крестиком, — снять его может только приложение, и только
   если знает, что именно снимать. */

import { isOff } from './quantum.js';

export const KEY_WINDOW = 'quantum-window';
export const KEY_MOMENT = 'moment-';

/* Время «ЧЧ:ММ» сегодняшнего дня как момент времени.

   Моменты приходят с сервера строкой без даты: день всегда сегодняшний.
   Непонятную строку возвращаем как null, а не как «полночь» — молчание
   лучше звонка в три часа ночи из-за испорченного поля. */
export function atToday(hhmm, now = new Date()) {
    const parts = String(hhmm).split(':');
    if (parts.length !== 2) return null;

    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;

    const at = new Date(now);
    at.setHours(h, m, 0, 0);
    return at;
}

/* Тихие часы: с вечера до утра телефон молчит.

   Границы приходят снаружи, из настроек раздела (dailyWindow), а не
   задаются здесь: правило не должно знать конкретных цифр.

   Промежуток переходит через полночь, поэтому проверка на ИЛИ, а не на
   «больше и меньше»: 23 часа больше 21, а 3 часа меньше 6 — оба тихие. */
export function isQuietHour(date, fromHour, untilHour) {
    const hour = date.getHours();
    return hour >= fromHour || hour < untilHour;
}

/* Моменты дня: что поставить, а что снять.

   Звонить стоит только о том моменте, который ещё впереди, ещё не прожит
   и не погашен крестиком. Обо всех остальных — снимать, и именно поэтому
   список снятия перечисляет их поимённо, а не молчит о них. */
export function momentPlan(moments, now = new Date()) {
    const ring = [];
    const silence = [];

    for (const moment of Array.isArray(moments) ? moments : []) {
        const key = KEY_MOMENT + moment.id;
        const at = atToday(moment.at, now);

        if (isOff(moment) || moment.doneAt || !at || at.getTime() <= now.getTime()) {
            silence.push(key);
            continue;
        }
        ring.push({ key, at });
    }

    return { ring, silence };
}

/* Окно возможностей: открывается через заданный срок после прыжка.

   Возвращаем null, когда ставить нечего, и у каждого «нечего» своя
   причина: прыжка ещё не было, окно уже открылось (звонить поздно) или
   срок придётся на тихие часы. */
export function windowPlan(lastJump, now = new Date(), options = {}) {
    const {
        cooldownMs = 0,
        quietFrom = null,
        quietUntil = null
    } = options;

    const last = Number(lastJump);
    if (!Number.isFinite(last) || last <= 0) return null;

    const at = new Date(last + cooldownMs);
    if (at.getTime() <= now.getTime()) return null;

    if (quietFrom !== null && quietUntil !== null && isQuietHour(at, quietFrom, quietUntil)) {
        return null;
    }

    return { key: KEY_WINDOW, at };
}
