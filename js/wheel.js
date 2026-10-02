import { MAX_PCT } from './core/calc.js';

/* Колесо на SVG. Площадь сектора равна проценту: радиус = R·√(p/100).
   Рисуется заново только по событию — когда ничего не меняется, ничего не работает. */

const NS = 'http://www.w3.org/2000/svg';
export const R = 150;
const LIMIT = R * Math.sqrt(MAX_PCT / 100);

export const radiusFor = pct => R * Math.sqrt(Math.max(0, pct) / 100);

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const fmt = n => n.toFixed(2);

function wedge(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  // При 7–9 секторах дуга меньше половины круга — флаг большой дуги всегда 0
  return `M0 0L${fmt(x0)} ${fmt(y0)}A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x1)} ${fmt(y1)}Z`;
}

function arc(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${fmt(x0)} ${fmt(y0)}A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x1)} ${fmt(y1)}`;
}

/* rows: [{ sector, pct }]; scores: { sectorId: 1..10 } — самооценка контуром;
   selected — id выделенного сектора. */
export function renderWheel(svg, rows, { scores = {}, selected = null } = {}) {
  svg.replaceChildren();
  const n = rows.length;
  if (!n) return;
  const step = 2 * Math.PI / n;

  for (const pct of [25, 50, 75]) el('circle', { class: 'grid-ring', r: radiusFor(pct) }, svg);
  el('circle', { class: 'grid-ring limit', r: LIMIT }, svg);

  rows.forEach((row, i) => {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step;
    const [sx, sy] = polar(LIMIT, a0);
    el('line', { class: 'spoke', x1: 0, y1: 0, x2: fmt(sx), y2: fmt(sy) }, svg);

    const g = el('g', { 'data-id': row.sector.id, class: row.sector.id === selected ? 'is-selected' : '' }, svg);
    el('title', {}, g).textContent = row.pct === null
      ? `${row.sector.name}: целей нет`
      : `${row.sector.name}: ${Math.round(row.pct)}%`;

    if (row.pct === null) {
      el('path', { class: 'sector-empty', d: wedge(R, a0, a1) }, g);
    } else if (row.pct > 0) {
      el('path', { class: `sector s${row.sector.slot}`, d: wedge(radiusFor(Math.min(row.pct, MAX_PCT)), a0, a1) }, g);
    }
    const score = scores[row.sector.id];
    if (score) el('path', { class: 'score-arc', d: arc(radiusFor(score * 10), a0, a1) }, g);
    el('path', { class: 'hit', d: wedge(LIMIT, a0, a1) }, g);

    const [lx, ly] = polar(LIMIT + 20, a0 + step / 2);
    el('text', {
      class: 'value-label', x: fmt(lx), y: fmt(ly),
      'text-anchor': 'middle', 'dominant-baseline': 'central'
    }, svg).textContent = row.pct === null ? '—' : `${Math.round(row.pct)}%`;
  });

  // Норма поверх заливки — её видно и сквозь закрашенные сектора
  el('circle', { class: 'norm-ring', r: R }, svg);
}
