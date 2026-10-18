/* НАСТРОЙКИ, ОБЩИЕ ДЛЯ ВСЕХ УСТРОЙСТВ (выкладка 158).

   Владелец 18.10.2026: виджеты на компьютере писали «окно открыто» вместо времени. Окно
   «Кванта» на компьютере не знало ни последнего прыжка, ни часа Наблюдателя из «Режима
   будильника»: они жили только в памяти телефона (прыжок — в localStorage, режим и тихий
   час — в meta базы устройства) и на сервер не уходили. Для такого окна прыжков не было —
   «окно открыто с самого начала». Просьба: «изменил в одном месте — меняется во всех местах,
   нажал сохранить — сразу во всех источниках».

   Теперь три настройки — режим будильника (alarm), тихий час (quiet) и последний прыжок
   (observer) — едут обычной синхронизацией как записи вида prefs, по одной на ключ. У каждой
   постоянный id (один и тот же на всех устройствах), поэтому у человека их всегда три, а спор
   двух устройств решает сервер, как для любой записи: побеждает более поздняя правка.

   Модуль только хранит и отдаёт значения. Что они значат и куда их класть на устройстве —
   знает reminder-plan.js (adoptPrefs). */

import { putRecords, getMeta, setMeta } from './db.js';
import { scheduleSync } from './sync.js';
import { state, nowIso } from './store.js';

/* Постоянные id настроек: формат uuid версии 4, как требует сервер. */
export const PREF_IDS = {
    alarm: '6b0e5a1c-7d3f-4c58-9a21-000000000a01',
    quiet: '6b0e5a1c-7d3f-4c58-9a21-000000000a02',
    observer: '6b0e5a1c-7d3f-4c58-9a21-000000000a03'
};

/* Какую правку с сервера устройство уже приняло: ключ → updatedAt. Без этой отметки одна и та
   же запись перезаписывала бы местную настройку при каждой синхронизации. */
const ПРИНЯТО = 'prefsApplied';

const запись = key => (state.data?.prefs || []).find(r => r.id === PREF_IDS[key] && !r.deletedAt) || null;

function значение(r) {
    try {
        return JSON.parse(r.value);
    } catch {
        return undefined;
    }
}

/** Значение настройки, как оно лежит в записи; записи нет — undefined. */
export function prefValue(key) {
    const r = запись(key);
    return r ? значение(r) : undefined;
}

/**
 * Отдать настройку на остальные устройства: человек нажал «Сохранить» или прыгнул.
 * Пишет в базу устройства и будит синхронизацию; перерисовки экранов не зовёт — настройка
 * не данные дня, а перерисовка посреди прыжка съела бы анимацию.
 */
export async function publishPref(key, value) {
    if (!PREF_IDS[key] || !state.data) return;
    const текст = JSON.stringify(value);
    if (запись(key)?.value === текст) return;
    const r = { id: PREF_IDS[key], key, value: текст, updatedAt: nowIso(), deletedAt: null, dirty: 1 };
    await putRecords('prefs', [r]);
    state.data.prefs = [...(state.data.prefs || []).filter(x => x.id !== r.id), r];
    // Эта правка своя: принимать её обратно с сервера незачем
    await отметить(key, r.updatedAt);
    scheduleSync();
}

async function отметить(key, at) {
    const принято = (await getMeta(ПРИНЯТО)) || {};
    принято[key] = at;
    await setMeta(ПРИНЯТО, принято);
}

/**
 * Настройки, пришедшие с других устройств и ещё не принятые здесь: ключ → значение.
 * Отметка ставится сразу — вызывающий обязан их применить (adoptPrefs).
 */
export async function takeRemotePrefs() {
    const принято = (await getMeta(ПРИНЯТО)) || {};
    const новые = {};
    for (const key of Object.keys(PREF_IDS)) {
        const r = запись(key);
        if (!r || r.dirty || r.updatedAt === принято[key]) continue;
        const v = значение(r);
        if (v !== undefined) новые[key] = v;
        принято[key] = r.updatedAt;
    }
    if (Object.keys(новые).length) await setMeta(ПРИНЯТО, принято);
    return новые;
}

/** Записи настройки ещё нет ни здесь, ни на сервере (после удачной синхронизации). */
export const prefMissing = key => !запись(key);
