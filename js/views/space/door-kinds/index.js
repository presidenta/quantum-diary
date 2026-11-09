/* ОТМЕТКА ДВЕРИ: СВЕТЛАЯ ИЛИ СТРАХ (выкладка 219).

   Владелец 08.11.2026: «человек пишет и хорошие моменты, и свои страхи — шесть и шесть; дверь со страхом
   он прорабатывает аффирмациями, пока не начнут открываться только светлые; отмечать — просто разным
   цветом». Выбор двери в коридоре остаётся слепым: цвет виден в настройке дверей, на экране открытой двери
   и в сводке, но не на самих дверях коридора — иначе человек выбирал бы глазами, а не случаем.

   Хранение — localStorage 'quantum_doors_kinds' = { id двери: 'fear' }, как и остальное о дверях
   (тексты и id — в 'quantum_doors_texts' / 'quantum_doors_ids'). Светлая — по умолчанию и не пишется.
   В записи Хроник отметка сохраняется на момент открытия (kind): переписал страх в светлую дверь —
   прошлые открытия остаются страхом. Подробнее — README.md рядом. */

const KEY = 'quantum_doors_kinds';
export const LIGHT = 'light';
export const FEAR = 'fear';

/** Сохранённые отметки: { id: 'fear' }. Битая запись — пусто, все двери светлые. */
export function loadKinds() {
    try {
        const kinds = JSON.parse(localStorage.getItem(KEY) || '{}');
        return kinds && typeof kinds === 'object' && !Array.isArray(kinds) ? kinds : {};
    } catch {
        return {};
    }
}

/** Записать отметки нынешних дверей; удалённые двери уходят вместе со своими отметками. */
export function saveKinds(kinds, doorIds) {
    const kept = {};
    for (const id of doorIds) {
        if (id && kinds[id] === FEAR) kept[id] = FEAR;
    }
    localStorage.setItem(KEY, JSON.stringify(kept));
    return kept;
}

export function kindOf(kinds, doorId) {
    return doorId && kinds[doorId] === FEAR ? FEAR : LIGHT;
}

/**
 * Сводка по отметкам: сколько светлых и страхов среди нынешних дверей и какую долю открытий периода дали те
 * и другие. Запись без отметки (до выкладки 219) берёт нынешнюю отметку своей двери; запись удалённой двери
 * без отметки не считается — чем она была, не известно.
 *
 * @param {object} p
 * @param {object[]} p.history  записи Хроник ({ts, slot, doorId, kind})
 * @param {string[]} p.doorIds  id нынешних дверей по местам
 * @param {object}   p.kinds    отметки { id: 'fear' }
 * @param {number}   p.since    с какого мига считать (0 — все записи)
 * @returns {{doors:{light:number, fear:number}, opened:{light:number, fear:number, total:number}}}
 */
export function kindsSummary({ history, doorIds, kinds, since = 0 }) {
    const doors = { light: 0, fear: 0 };
    for (const id of doorIds) doors[kindOf(kinds, id)] += 1;

    const opened = { light: 0, fear: 0, total: 0 };
    for (const item of history) {
        if (since && !(Number(item.ts) >= since)) continue;
        let kind = item.kind === FEAR || item.kind === LIGHT ? item.kind : null;
        if (!kind) {
            const id = item.doorId || (Number.isInteger(item.slot) ? doorIds[item.slot] : null);
            if (!id || !doorIds.includes(id)) continue;
            kind = kindOf(kinds, id);
        }
        opened[kind] += 1;
        opened.total += 1;
    }
    return { doors, opened };
}

/** Доли открытий в процентах; вместе ровно 100. */
export function openedShares(opened) {
    if (!opened.total) return { light: 0, fear: 0 };
    const fear = Math.round((opened.fear / opened.total) * 100);
    return { light: 100 - fear, fear };
}

/**
 * Переключатель в строке двери на экране настройки: точка цвета и слово. Нажатие меняет отметку, перекрашивает
 * строку двери (класс qm-door-fear) и сообщает отметку наружу.
 *
 * @param {string} kind   нынешняя отметка
 * @param {(key:string)=>string} t  перевод
 * @param {(kind:string)=>void} onChange
 */
export function buildKindToggle(kind, t, onChange) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qm-kind';
    button.title = t('kindToggle');
    button.setAttribute('aria-label', t('kindToggle'));

    const dot = document.createElement('span');
    dot.className = 'qm-kind-dot';
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);

    const word = document.createElement('span');
    word.className = 'qm-kind-word';
    button.appendChild(word);

    const show = value => {
        button.dataset.kind = value;
        button.setAttribute('aria-pressed', String(value === FEAR));
        word.textContent = t(value === FEAR ? 'kindFear' : 'kindLight');
        const row = button.closest('.qm-door-row');
        if (row) row.classList.toggle('qm-door-fear', value === FEAR);
    };
    button.addEventListener('click', () => {
        const next = button.dataset.kind === FEAR ? LIGHT : FEAR;
        show(next);
        onChange(next);
    });
    // Строки у кнопки ещё нет: первую окраску строки ставит тот, кто её собирает (renderSetupInputs)
    show(kind);
    return button;
}

/** Точка цвета для строки сводки и экрана открытой двери. */
export function kindDotHtml(kind) {
    return `<span class="qm-kind-dot${kind === FEAR ? ' qm-kind-dot-fear' : ''}" aria-hidden="true"></span>`;
}
