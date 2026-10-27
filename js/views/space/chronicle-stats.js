/* СВОДКА «АКТИВАЦИЙ В ХРОНИКАХ АКАШИ» — РАСЧЁТ (выкладка 185).

   Чистый модуль: записи Хроник и двери на входе, строки сводки на выходе. Рисует их app.js
   (renderChronicleStats), тесты проверяют расчёт на настоящих записях (test/hroniki-svodka.test.js).

   ДВЕРИ НА СВОИХ МЕСТАХ. Владелец 27.10.2026: «зафиксируй каждую дверь на своём месте, пронумеруй —
   меняются только графики. Раньше любовь была в топе, а теперь на минимуме, но двери меняются местами, и
   это тяжело отследить». До 185 строки сортировались по числу открытий, и каждая смена таба их
   переставляла. Теперь порядок — порядок дверей в описании (номер = место двери, 1, 2, 3…), за ними —
   записи дверей, которых больше нет (по имени, без номера). Порядок от периода не зависит.

   ПОСЛЕДНЯЯ ОТКРЫТАЯ ДВЕРЬ. «Дверь, которая выпала, — другим цветом, и насколько поменялся её процент».
   Это самая свежая запись выборки; у её строки есть прежняя доля (без этого открытия) и прирост.
   Доля последней двери от её открытия не уменьшается: c/t ≥ (c−1)/(t−1) при c ≤ t.

   КЛЮЧ ЗАПИСИ — ID ДВЕРИ, А НЕ МЕСТО (ошибка до 185). Запись хранит и место двери (slot), и её id. Считали
   по месту — и после удаления двери из середины все двери ниже съезжали на место вверх, а их открытия
   доставались соседке. Id у двери постоянный (переименование его не меняет), поэтому сначала id: дверь
   есть — её нынешнее место; двери нет — отдельная строка «бывшей» двери. Место — только у старых записей
   без id, текст — у самых старых. */

/** Ключ записи: 'slot:<нынешнее место>', 'door:<id удалённой двери>' или 'text:<название>'. */
export function statKey(item, doorIds) {
    if (item.doorId) {
        const at = doorIds.indexOf(item.doorId);
        return at !== -1 ? 'slot:' + at : 'door:' + item.doorId;
    }
    if (Number.isInteger(item.slot)) return 'slot:' + item.slot;
    return 'text:' + (item.reality || '');
}

const доля = (сколько, всего) => (всего > 0 ? Math.round((сколько / всего) * 100) : 0);

/**
 * Строки сводки.
 *
 * СРАВНЕНИЕ С ПРОШЛЫМ ПЕРИОДОМ (выкладка 187, владелец 27.10.2026: «меточка, где оно было на прошлой неделе —
 * проекция вперёд-назад, чтобы понимать, какой выбор делает человек»). Если задано окно прошлого периода
 * (before: {since, until}) — у каждой строки есть before: её доля среди открытий того окна (null — сравнения
 * нет), и в ответе beforeTotal — сколько открытий было тогда. Двери прошлого периода стоят в том же порядке:
 * дверь, которую открывали только тогда, тоже получает свою строку.
 *
 * @param {object} p
 * @param {object[]} p.history   записи Хроник ({ts, slot, doorId, reality})
 * @param {string[]} p.doorIds   id нынешних дверей по местам
 * @param {number}   p.since     с какого мига считать (0 — все записи, и без времени тоже)
 * @param {{since:number, until:number}|null} [p.before]  окно прошлого периода [since, until)
 * @returns {{total:number, lastKey:string|null, beforeTotal:number|null, rows:{key:string, slot:number|null,
 *           number:number|null, count:number, share:number, fallback:string, last:boolean, prevShare:number,
 *           gain:number, before:number|null}[]}}
 */
export function chronicleRows({ history, doorIds, since = 0, before = null }) {
    const выборка = since === 0 ? history : history.filter(item => Number(item.ts) >= since);
    const total = выборка.length;
    const прошлая = before ? history.filter(item => Number(item.ts) >= before.since && Number(item.ts) < before.until) : [];

    // Все нынешние двери — по местам и с нулями: дверь видна, даже если за период её не открывали
    const строки = new Map();
    for (let slot = 0; slot < doorIds.length; slot++) {
        строки.set('slot:' + slot, { key: 'slot:' + slot, slot, number: slot + 1, count: 0, beforeCount: 0, fallback: '' });
    }
    const бывшие = [];
    const строкаЗаписи = item => {
        const key = statKey(item, doorIds);
        let строка = строки.get(key);
        if (!строка) {
            // Запись старой нумерации на место, которого уже нет, — тоже «бывшая» дверь
            строка = { key, slot: null, number: null, count: 0, beforeCount: 0, fallback: item.reality || '' };
            строки.set(key, строка);
            бывшие.push(строка);
        }
        if (!строка.fallback) строка.fallback = item.reality || '';
        return строка;
    };
    for (const item of выборка) строкаЗаписи(item).count += 1;
    for (const item of прошлая) строкаЗаписи(item).beforeCount += 1;

    // Последняя открытая — самая свежая запись выборки (по времени, а не по месту в массиве)
    let свежая = null;
    for (const item of выборка) {
        if (Number.isFinite(Number(item.ts)) && (!свежая || Number(item.ts) > Number(свежая.ts))) свежая = item;
    }
    if (!свежая && total) свежая = выборка[0];
    const lastKey = свежая ? statKey(свежая, doorIds) : null;

    // Сравнивать есть с чем, только если в прошлом окне были открытия
    const beforeTotal = before ? прошлая.length : null;
    бывшие.sort((a, b) => a.fallback.localeCompare(b.fallback));
    const rows = [...Array.from({ length: doorIds.length }, (_, slot) => строки.get('slot:' + slot)), ...бывшие]
        .map(({ beforeCount, ...строка }) => {
            const share = доля(строка.count, total);
            const last = строка.key === lastKey;
            const prevShare = last ? доля(строка.count - 1, total - 1) : share;
            return {
                ...строка, share, last, prevShare, gain: Math.max(0, share - prevShare),
                before: beforeTotal ? доля(beforeCount, beforeTotal) : null
            };
        });
    return { total, lastKey, beforeTotal, rows };
}
