/* ЧАСЫ НАБЛЮДАТЕЛЯ — ЕДИНЫЙ РАСЧЁТ ОКНА ВОЗМОЖНОСТЕЙ (выкладка 148).

   ТЗ владельца 18.10.2026: таймер в «Режиме будильника», виджеты, плашка в шторке и
   таймер «До возможного следующего прыжка» в «Пространстве» показывают одно и то же
   время, посчитанное в одном месте. До этой выкладки каждый считал сам: таймер — от
   последнего прыжка, кадры плашки — от прыжка и назначенного часа, звонок «окно
   открыто» — от прыжка. Ни один не знал, что назначенный звонок перезапускает цикл.

   ПРАВИЛО ЦИКЛА.
   Опора цикла — последнее из двух событий: прыжок (переход в суперпозицию, а также
   сброс пропущенного окна в «Пространстве») или прозвучавший назначенный звонок
   Наблюдателя («Окно возможностей — Наблюдатель» в «Режиме будильника», например
   16:00). От опоры через cooldownMs (3 ч 33 мин) открывается окно возможностей и
   держится windowMs.
   «Явный будильник» (ТЗ п. 2.3): назначенный час, пока он впереди, — ближайший срок,
   если он раньше открытия окна: в 15:30 при 16:00 таймер показывает 00:30:00. Наступил
   — звонок звенит, опора переезжает на 16:00, и таймер сразу считает до 19:33.

   Назначенный час ежедневный (так его и ставит расписание: alarm-next-window и копии
   на следующие дни), поэтому «прозвучавший» — последний его приход, не позже «сейчас»:
   сегодняшний, а если он ещё впереди — вчерашний.

   Чистые функции: время приходит параметром, ничего не читается из хранилища — так
   правило одно и то же в браузере, в тестах и для каждого кадра плашки. */

const МИНУТА_МС = 60 * 1000;

/* «ЧЧ:ММ» в минуты от полуночи; негодное — null. */
function минутыЧаса(hhmm) {
    const м = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!м) return null;
    const ч = Number(м[1]);
    const мин = Number(м[2]);
    return ч > 23 || мин > 59 ? null : ч * 60 + мин;
}

/* Приход часа «ЧЧ:ММ» в тот же день, что миг, в миллисекундах. */
function вТотЖеДень(минуты, миг) {
    const день = new Date(миг);
    день.setHours(0, 0, 0, 0);
    return день.getTime() + минуты * МИНУТА_МС;
}

/** Последний приход ежедневного часа не позже мига; часа нет — 0. */
export function lastNamedAt(hhmm, миг) {
    const минуты = минутыЧаса(hhmm);
    if (минуты === null) return 0;
    const сегодня = вТотЖеДень(минуты, миг);
    if (сегодня <= миг) return сегодня;
    const вчера = new Date(сегодня);
    вчера.setDate(вчера.getDate() - 1);
    return вчера.getTime();
}

/** Следующий приход ежедневного часа строго после мига; часа нет — 0. */
export function nextNamedAt(hhmm, миг) {
    const минуты = минутыЧаса(hhmm);
    if (минуты === null) return 0;
    const сегодня = вТотЖеДень(минуты, миг);
    if (сегодня > миг) return сегодня;
    const завтра = new Date(сегодня);
    завтра.setDate(завтра.getDate() + 1);
    return завтра.getTime();
}

/**
 * Состояние окна возможностей на миг.
 *
 * @param {object} p
 * @param {number} p.lastJump   время последнего прыжка, мс (0 — прыжка не было)
 * @param {string} p.named      назначенный час Наблюдателя «ЧЧ:ММ» или '' (выключен)
 * @param {number} p.now        миг, мс
 * @param {number} p.cooldownMs через сколько после опоры открывается окно
 * @param {number} p.windowMs   сколько окно держится
 * @returns {{phase: 'never'|'cooldown'|'open'|'missed', anchor: number, opens: number,
 *            closes: number, nextNamed: number, next: number}}
 *   phase  — never: опоры нет (не было ни прыжка, ни звонка) — окно открыто с начала;
 *            cooldown: ждём открытия; open: окно открыто; missed: окно прошло;
 *   next   — ближайший срок Наблюдателя после мига (открытие окна или назначенный звонок),
 *            0 — неизвестен (окно открыто или прошло, а часа не назначено).
 */
export function observerClock({ lastJump = 0, named = '', now, cooldownMs, windowMs }) {
    const прыжок = Number(lastJump) > 0 ? Number(lastJump) : 0;
    const опора = Math.max(прыжок, lastNamedAt(named, now));
    const nextNamed = nextNamedAt(named, now);

    if (!опора) {
        return { phase: 'never', anchor: 0, opens: 0, closes: 0, nextNamed, next: 0 };
    }
    const opens = опора + cooldownMs;
    const closes = opens + windowMs;

    if (now < opens) {
        const next = nextNamed && nextNamed < opens ? nextNamed : opens;
        return { phase: 'cooldown', anchor: опора, opens, closes, nextNamed, next };
    }
    return { phase: now < closes ? 'open' : 'missed', anchor: опора, opens, closes, nextNamed, next: nextNamed };
}

/** «ЧЧ:ММ:СС» до мига или от мига (по модулю): для таймеров обратного отсчёта. */
export function countdownText(ms) {
    const всего = Math.max(0, Math.floor(Math.abs(ms) / 1000));
    const ч = String(Math.floor(всего / 3600)).padStart(2, '0');
    const м = String(Math.floor((всего % 3600) / 60)).padStart(2, '0');
    const с = String(всего % 60).padStart(2, '0');
    return `${ч}:${м}:${с}`;
}
