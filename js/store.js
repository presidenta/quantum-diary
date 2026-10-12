/* Общее состояние приложения и запись данных.

   Один источник правды для всех экранов: экраны читают state и зовут save(),
   а не лезут в базу сами. Так правка в одном разделе перерисовывает остальные. */

import { loadAll, putRecords } from './db.js';
import { scheduleSync } from './sync.js';
import { buildIndex } from './core/calc.js';
import { todayKey } from './core/dates.js';
import { translate, DEFAULT_LANGUAGE } from './core/i18n.js';
import { defaultSectors, DEFAULT_SECTOR_KEYS, DEFAULT_COUNT } from './core/sectors.js';

export const state = {
  data: null,
  index: null,
  view: 'quantum',        // раздел: quantum | day | money | wheel; квант открывается первым
  period: 'week',         // период колеса
  anchor: todayKey(),     // какой день/неделя/месяц показываем
  day: todayKey(),        // какой день открыт в ежедневнике
  dayView: 'day',         // как показан ежедневник: day | week | month
  selected: null,
  me: null,
  language: DEFAULT_LANGUAGE,
  quantum: null,          // день квантового модуля: приходит с сервера
  serverDown: false       // сервер не отвечает: работаем на устройстве
};

export const t = (key, values) => translate(state.language, key, values);

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const changed = () => { for (const fn of listeners) fn(); };

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

export function reindex() {
  state.index = buildIndex(state.data);
}

export async function reload() {
  state.data = await loadAll();
  reindex();
}

/* Запись: ставит время правки и метку «ещё не ушло на сервер», кладёт в базу
   телефона, обновляет состояние и будит синхронизацию.

   keepStamp оставляет записи её собственное время правки вместо текущего.
   Нужно это ровно в одном месте — для заготовок сфер по умолчанию (см.
   seedSectors и SEED_STAMP в core/sectors.js): спор решается по более
   позднему времени правки, и заготовка с сегодняшним временем перебила бы
   настоящую сферу человека, затерев её название. Для всего остального
   время ставится здесь: правка сделана сейчас, и врать об этом нельзя. */
export async function save(kind, records, { keepStamp = false } = {}) {
  const stamped = records.map(r => ({
    deletedAt: null,
    ...r,
    updatedAt: keepStamp && r.updatedAt ? r.updatedAt : nowIso(),
    dirty: 1
  }));
  await putRecords(kind, stamped);
  const byId = new Map(state.data[kind].map(r => [r.id, r]));
  for (const r of stamped) byId.set(r.id, r);
  state.data[kind] = [...byId.values()];
  reindex();
  changed();
  scheduleSync();
}

export const remove = (kind, record) => save(kind, [{ ...record, deletedAt: nowIso() }]);

/* ---------- Сферы жизни ---------- */

/* Какие сферы бывают по умолчанию и когда их создавать — в чистых
   правилах core/sectors.js, там же под тестами. Здесь они только
   перевыставлены наружу, чтобы остальным экранам не пришлось помнить про
   второй файл. */
export { DEFAULT_SECTOR_KEYS, DEFAULT_COUNT };

export const activeSectors = () => state.index.sectors.filter(s => s.active);
export const sectorById = id => state.index.sectors.find(s => s.id === id) || null;
export const sectorName = s => s && (s.name.trim() || t('common.sectorN', { n: s.slot }));

/* Создать девять сфер по умолчанию.
 *
 * Звать можно только когда известно, что у учётной записи сфер нет, —
 * решает это shouldSeed в core/sectors.js, а проверяет app.js. Прежде
 * здесь стоял uuid() на каждую сферу, и именно он задваивал сферы: два
 * устройства, засеявшие их независимо, создавали два разных набора, и
 * синхронизация складывала их вместо слияния.
 *
 * keepStamp обязателен: заготовка помечена началом эпохи и не должна
 * перебить настоящую сферу человека. */
export function seedSectors() {
  return save('sectors', defaultSectors(t), { keepStamp: true });
}

/* ---------- Мелкие помощники для экранов ---------- */

export const $ = id => document.getElementById(id);

export const round = x => Math.round(x);
export const num = x => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

// Элемент DOM. Текст — только через textContent, поэтому любое название
// вроде <b>Деньги</b> показывается как текст, а не исполняется
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    // Политика безопасности страницы запрещает атрибут style, поэтому каждое
    // свойство ставится отдельно через CSSOM — так CSP не нужно ослаблять
    else if (k === 'style') setStyle(node, v);
    else if (k.includes('-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

/* Замена содержимого, которая не боится пропусков.

   replaceChildren(null) НЕ отбрасывает пустое значение, как делает h(), а
   вставляет текстовый узел со словом «null» — и оно появляется на экране.
   Именно так на «Пульте управления реальностью» под списком моментов
   вылезало слово null: там стоит `условие ? элемент : null`.

   Здесь пустые значения отбрасываются, как и в h(). Вызывать нужно её, а не
   replaceChildren напрямую, везде, где среди детей бывает условие. */
export function fill(node, ...children) {
  node.replaceChildren(...children.filter(c => c != null));
  return node;
}

export function setStyle(node, declarations) {
  for (const rule of declarations.split(';')) {
    const colon = rule.indexOf(':');
    if (colon < 0) continue;
    node.style.setProperty(rule.slice(0, colon).trim(), rule.slice(colon + 1).trim());
  }
}

export function svgIcon(path, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.7');
  p.setAttribute('stroke-linecap', 'round');
  svg.appendChild(p);
  return svg;
}

export const ICONS = {
  wheel: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 3v9l6 4',
  quantum: 'M13 2 4 14h7l-1 8 9-12h-7z',
  day: 'M5 4h14v16H5zM9 9h6M9 13h6',
  money: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  logs: 'M4 5h16v14H4zM7 9l3 3-3 3M13 15h4',
  settings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3M12 19v3M2 12h3M19 12h3',
  admin: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  // Человек: кабинет, настройки, выход — всё, что было под гамбургером
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  // Шестерёнка: настройки клиента в кабинете администратора
  gear: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'
};
