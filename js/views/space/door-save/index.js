/* СОХРАНИТЬ ОДНУ ДВЕРЬ: дискета в строке двери на экране настройки.

   Владелец 09.11.2026: «кнопку „Сохранить“ — к каждой двери отдельно: нажал, и сохранилось, и человек
   понимает, что у него уже сохранено; как дискетка». По дискете видно, сохранена ли дверь такой, какая она
   на экране. Подробно — README рядом. */

import { FEAR } from '../door-kinds/index.js';

export const EMPTY = 'empty';   // в строке пусто, и сохранять нечего
export const SAVED = 'saved';   // сохранено ровно то, что на экране
export const DIRTY = 'dirty';   // на экране не то, что сохранено

/**
 * Состояние двери: сравнивает строку на экране с сохранённым.
 * Сохранённые двери — первые texts.length номеров в ids; дальше — номера незанятых строк.
 */
export function doorState({ texts, ids, kinds }, doorId, text, kind, hasContent) {
    const место = ids.indexOf(doorId);
    const сохранена = место >= 0 && место < texts.length;
    if (!сохранена) return hasContent ? DIRTY : EMPTY;
    const былСтрах = kinds[doorId] === FEAR;
    return hasContent && texts[место] === text && былСтрах === (kind === FEAR) ? SAVED : DIRTY;
}

/**
 * Сохранить одну дверь, не трогая остальные. Новая дверь встаёт после сохранённых; дверь, в которой
 * ничего не осталось, уходит из сохранённых, а её номер — к незанятым строкам.
 * @returns {{texts: string[], ids: string[], kinds: object}}
 */
export function saveOneDoor({ texts, ids, kinds }, doorId, text, kind, hasContent) {
    const новые = { texts: [...texts], ids: [...ids], kinds: { ...kinds } };
    const место = новые.ids.indexOf(doorId);
    const сохранена = место >= 0 && место < новые.texts.length;

    if (сохранена && hasContent) {
        новые.texts[место] = text;
    } else if (сохранена) {
        новые.texts.splice(место, 1);
        новые.ids.splice(место, 1);
        новые.ids.push(doorId);
    } else if (hasContent) {
        if (место >= 0) новые.ids.splice(место, 1);
        новые.ids.splice(новые.texts.length, 0, doorId);
        новые.texts.push(text);
    }

    if (hasContent && kind === FEAR) новые.kinds[doorId] = FEAR;
    else delete новые.kinds[doorId];
    return новые;
}

/** Кнопка-дискета; вид задаёт showSaveState. */
export function buildSaveButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qm-door-save';
    button.dataset.act = 'save-door';

    const icon = document.createElement('span');
    icon.className = 'qm-door-save-ico';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    return button;
}

/** Вид дискеты: пусто — не видна; не сохранено — золотая; сохранено — зелёная с галочкой. */
export function showSaveState(button, state, t) {
    if (!button) return;
    button.hidden = state === EMPTY;
    button.dataset.state = state;
    const подпись = t(state === SAVED ? 'doorSaved' : 'doorSave');
    button.title = подпись;
    button.setAttribute('aria-label', подпись);
}
