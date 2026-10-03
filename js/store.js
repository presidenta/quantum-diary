/* Общее состояние приложения и запись данных.

   Один источник правды для всех экранов: экраны читают state и зовут save(),
   а не лезут в базу сами. Так правка в одном разделе перерисовывает остальные. */

import { loadAll, putRecords } from './db.js';
import { scheduleSync } from './sync.js';
import { buildIndex } from './core/calc.js';
import { todayKey } from './core/dates.js';
import { translate, DEFAULT_LANGUAGE } from './core/i18n.js';

export const state = {
  data: null,
  index: null,
  view: 'wheel',          // раздел: wheel | quantum | day | money
  period: 'week',         // период колеса
  anchor: todayKey(),     // какой день/неделя/месяц показываем
  day: todayKey(),        // какой день открыт в ежедневнике
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
   телефона, обновляет состояние и будит синхронизацию. */
export async function save(kind, records) {
  const stamped = records.map(r => ({ deletedAt: null, ...r, updatedAt: nowIso(), dirty: 1 }));
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

// Названия по умолчанию — ключи словаря: при смене языка меняются и они,
// пока человек не переименовал сферу сам
export const DEFAULT_SECTOR_KEYS = [
  'sector.health', 'sector.career', 'sector.money', 'sector.family',
  'sector.people', 'sector.growth', 'sector.joy', 'sector.spirit', 'sector.home'
];
export const DEFAULT_COUNT = 8;

export const activeSectors = () => state.index.sectors.filter(s => s.active);
export const sectorById = id => state.index.sectors.find(s => s.id === id) || null;
export const sectorName = s => s && (s.name.trim() || t('common.sectorN', { n: s.slot }));

export function seedSectors() {
  return save('sectors', DEFAULT_SECTOR_KEYS.map((key, i) => ({
    id: uuid(), slot: i + 1, name: t(key), position: i + 1,
    active: i < DEFAULT_COUNT, paused: false
  })));
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
  admin: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z'
};
