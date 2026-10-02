/* Экран «Колесо»: срезы день/неделя/месяц/год, цели, записи, самооценка. */

import {
  state, t, save, uuid, $, h, round, num, activeSectors, sectorName
} from '../store.js';
import { renderWheel } from '../wheel.js';
import {
  todayKey, mondayOf, addDays, addMonths, fromKey, isDateKey, weekDays
} from '../core/dates.js';
import {
  weekWheel, monthWheel, yearWheel, wheelStats, assessmentAt,
  versionAt, versionChange, goalWeek
} from '../core/calc.js';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const PACE_KEY = {
  onTrack: 'goal.onTrack', behindLittle: 'goal.behindLittle',
  behind: 'goal.behind', over: 'goal.over'
};

const fmtDay = () => new Intl.DateTimeFormat(state.language, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtShort = () => new Intl.DateTimeFormat(state.language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = () => new Intl.DateTimeFormat(state.language, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ---------- Период ---------- */

function period() {
  const today = todayKey();
  const a = state.anchor;
  switch (state.period) {
    case 'day': return {
      label: fmtDay().format(fromKey(a)), end: a, canNext: a < today,
      week: mondayOf(a), upto: a
    };
    case 'week': {
      const monday = mondayOf(a);
      const sunday = addDays(monday, 6);
      return {
        label: `${fmtShort().format(fromKey(monday))} – ${fmtShort().format(fromKey(sunday))}`,
        end: sunday < today ? sunday : today, canNext: sunday < today,
        week: monday, upto: monday === mondayOf(today) ? today : null
      };
    }
    case 'month': {
      const ym = a.slice(0, 7);
      const label = fmtMonth().format(fromKey(`${ym}-01`));
      const last = addDays(`${addMonths(ym, 1)}-01`, -1);
      return {
        label: label[0].toUpperCase() + label.slice(1),
        end: last < today ? last : today, canNext: ym < today.slice(0, 7), month: ym
      };
    }
    default: {
      const y = a.slice(0, 4);
      return { label: y, end: `${y}-12-31` < today ? `${y}-12-31` : today, canNext: y < today.slice(0, 4), year: Number(y) };
    }
  }
}

function shift(dir) {
  const a = state.anchor;
  const today = todayKey();
  const next = {
    day: () => addDays(a, dir),
    week: () => addDays(a, 7 * dir),
    month: () => `${addMonths(a.slice(0, 7), dir)}-01`,
    year: () => `${Number(a.slice(0, 4)) + dir}-01-01`
  }[state.period]();
  state.anchor = next > today ? today : next;
  renderWheelView();
}

/* ---------- Отрисовка ---------- */

export function renderWheelView() {
  const p = period();
  const today = todayKey();
  let rows, extra = '';
  if (p.week) {
    rows = weekWheel(state.index, p.week, p.upto);
  } else if (p.month) {
    const m = monthWheel(state.index, p.month, today);
    rows = m.rows;
    extra = m.weeks ? `${t('wheel.byWeeks')} ${m.weeks}` : t('wheel.noWeeks');
  } else {
    const y = yearWheel(state.index, p.year, today);
    rows = y.rows;
    extra = y.months ? `${t('wheel.byMonths')} ${y.months}` : t('wheel.noYear');
  }

  document.querySelectorAll('[data-view]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === state.period)));
  $('rangeLabel').textContent = p.label;
  $('next').disabled = !p.canNext;

  const assessment = assessmentAt(state.index, p.end);
  renderWheel($('wheel'), rows, { scores: assessment?.scores || {}, selected: state.selected });
  renderSummary(rows, extra);
  renderNotice();
  renderList(rows, p);
}

function renderSummary(rows, extra) {
  const st = wheelStats(rows);
  const el = $('summary');
  if (st.avg === null) {
    el.replaceChildren(extra || t('wheel.noGoals'));
    $('densityValue').textContent = '—';
    $('densityBar').style.width = '0';
    return;
  }

  // Плотность новой реальности — среднее по колесу, выраженное полосой
  $('densityValue').textContent = `${round(st.avg)}%`;
  $('densityBar').style.width = `${Math.min(100, round(st.avg))}%`;

  const names = st.candidates
    .map(id => rows.find(r => r.sector.id === id)).filter(Boolean)
    .map(r => sectorName(r.sector)).join(', ');
  const parts = [`${t('wheel.average')} `, h('b', { text: `${round(st.avg)}%` })];
  if (st.uniformity !== null) parts.push(` · ${t('wheel.uniformity')} ${round(st.uniformity)}%`);
  const valued = rows.filter(r => r.pct !== null).length;
  if (names && valued > st.candidates.length) parts.push(`. ${t('wheel.lowest')}: ${names}`);
  if (extra) parts.push(` (${extra})`);
  el.replaceChildren(...parts);
}

function renderNotice() {
  const box = $('notice');
  const hasAssessment = state.index.assessments.length > 0;
  const hasGoals = state.index.goals.length > 0;
  if (hasAssessment && hasGoals) { box.hidden = true; return; }
  box.hidden = false;
  if (hasAssessment) {
    box.replaceChildren(h('p', { text: t('wheel.firstGoal') }));
  } else {
    box.replaceChildren(
      h('p', { text: t('wheel.startAssess') }),
      h('button', { type: 'button', class: 'btn primary', text: t('wheel.assessButton'), onclick: openAssess }));
  }
}

function renderList(rows, p) {
  $('sectorList').replaceChildren(...rows.map(row => {
    const s = row.sector;
    const head = h('div', { class: 'sector-head', onclick: () => select(s.id) },
      h('span', { class: `dot s${s.slot}` }),
      h('span', { class: 'name', text: sectorName(s) }),
      s.paused ? h('span', { class: 'tag', text: t('settings.notNow') }) : null,
      h('span', { class: 'pct', text: row.pct === null ? '—' : `${round(row.pct)}%` }));
    const item = h('li', { class: `sector-item${s.id === state.selected ? ' is-selected' : ''}`, dataset: { id: s.id } }, head);

    if (p.week) {
      if (row.goals.length) item.append(h('ul', { class: 'goals' }, ...row.goals.map(g => goalRow(g, s))));
      item.append(h('button', { type: 'button', class: 'add-goal', text: t('wheel.addGoal'), onclick: () => openGoal(null, s.id) }));
    } else if (row.count) {
      item.append(h('p', { class: 'muted', text: `${row.count} ${p.month ? t('wheel.byWeeks') : t('wheel.byMonths')}` }));
    }
    return item;
  }));
}

function goalRow(g, sector) {
  const unit = g.goal.unit ? ` ${g.goal.unit}` : '';
  const paceKey = g.pace && (g.version.kind === 'atMost' && g.pace === 'onTrack' ? 'goal.within' : PACE_KEY[g.pace]);
  const pace = paceKey ? ` · ${t(paceKey)}` : '';
  const fill = h('i', { class: `s${sector.slot}` });
  fill.style.width = `${Math.min(g.pct, 120) / 1.2}%`;
  return h('li', { class: 'goal' },
    h('button', { type: 'button', class: 'goal-open', text: g.goal.title, onclick: () => openGoal(g.goal.id, sector.id) }),
    h('div', { class: 'goal-meta', text: `${num(g.done)} ${t('goal.of')} ${num(g.target)}${unit} · ${round(g.pct)}%${pace}` }),
    h('div', { class: 'bar' }, fill),
    h('button', { type: 'button', class: 'log-btn', text: '+', 'aria-label': `${t('log.heading')}: ${g.goal.title}`, onclick: () => openLog(g.goal.id) }));
}

function select(id) {
  state.selected = state.selected === id ? null : id;
  renderWheelView();
}

/* ---------- Цель ---------- */

let goalCtx = null;
const thisMonday = () => mondayOf(todayKey());

function openGoal(goalId, sectorId) {
  const goal = goalId ? state.index.goals.find(g => g.id === goalId) : null;
  const version = goal ? versionAt(state.index, goal.id, thisMonday()) : null;
  const sector = state.index.sectors.find(s => s.id === sectorId);
  goalCtx = { goal, sectorId };

  const f = $('goalForm').elements;
  $('goalHeading').textContent = goal ? t('goal.title') : t('goal.new');
  $('goalSector').textContent = sectorName(sector);
  f.title.value = goal?.title || '';
  f.unit.value = goal?.unit || '';
  f.target.value = version ? num(version.target) : '';
  f.kind.value = version?.kind || 'atLeast';
  f.weight.value = version ? num(version.weight) : '1';
  $('dayPlan').replaceChildren(...DAYS.map((d, i) => h('label', {}, d,
    h('input', { type: 'number', min: 0, step: 'any', inputMode: 'decimal', name: `day${i}`,
      value: version?.dayPlan ? num(version.dayPlan[i]) : '' }))));
  $('archiveGoal').hidden = !goal;
  $('deleteGoal').hidden = !goal;
  $('goalDialog').returnValue = '';
  $('goalDialog').showModal();
}

async function saveGoal() {
  const f = $('goalForm').elements;
  const target = Number(f.target.value);
  const weight = Number(f.weight.value) || 1;
  const plan = DAYS.map((_, i) => f[`day${i}`].value);
  const dayPlan = plan.every(v => v === '') ? null : plan.map(v => Number(v) || 0);
  if (!(target > 0)) return;

  const goal = {
    ...(goalCtx.goal || { id: uuid(), sectorId: goalCtx.sectorId, source: 'manual', sourceMetric: null, archivedFrom: null }),
    title: f.title.value.trim().slice(0, 80) || t('goal.title'),
    unit: f.unit.value.trim().slice(0, 20)
  };
  const change = versionChange(state.index, goal.id, thisMonday(), { target, kind: f.kind.value, weight, dayPlan });
  const version = change.kind === 'create' ? { ...change.version, id: uuid() } : change.version;
  await save('goals', [goal]);
  await save('goalVersions', [version]);
}

/* ---------- Запись ---------- */

let logGoalId = null;
const weekForLog = () => period().week || thisMonday();

function openLog(goalId) {
  logGoalId = goalId;
  const goal = state.index.goals.find(g => g.id === goalId);
  const monday = weekForLog();
  const today = todayKey();
  const f = $('logForm').elements;
  $('logHeading').textContent = goal.title;
  f.amount.value = '';
  f.note.value = '';
  const sunday = addDays(monday, 6);
  f.date.value = state.period === 'day' ? state.anchor : (sunday < today ? sunday : today);
  f.date.max = today;
  renderLogDetails();
  $('logDialog').returnValue = '';
  $('logDialog').showModal();
  f.amount.focus();
}

function renderLogDetails() {
  const goal = state.index.goals.find(g => g.id === logGoalId);
  const monday = weekForLog();
  const g = goalWeek(state.index, goal, monday);
  const unit = goal.unit ? ` ${goal.unit}` : '';
  $('logProgress').textContent = g
    ? `${t('log.week')}: ${num(g.done)} ${t('goal.of')} ${num(g.target)}${unit} · ${round(g.pct)}%`
    : '';
  const days = new Set(weekDays(monday));
  const entries = (state.index.entries.get(goal.id) || []).filter(e => days.has(e.date));
  $('logEntries').replaceChildren(...entries.map(e => h('li', {},
    h('span', { text: `${fmtShort().format(fromKey(e.date))} — ${num(e.amount)}${unit}${e.note ? ` · ${e.note}` : ''}` }),
    h('button', { type: 'button', text: t('log.remove'), onclick: async () => {
      await save('entries', [{ ...e, deletedAt: new Date().toISOString() }]);
      renderLogDetails();
    } }))));
}

/* ---------- Самооценка ---------- */

export function openAssess() {
  const latest = assessmentAt(state.index, todayKey());
  $('assessList').replaceChildren(...activeSectors().map(s => {
    const value = latest?.scores[s.id] || 5;
    const out = h('output', { text: String(value) });
    const range = h('input', { type: 'range', min: 1, max: 10, step: 1, value, name: s.id,
      'aria-label': sectorName(s), oninput: e => { out.textContent = e.target.value; } });
    return h('li', { class: 'assess-row' },
      h('span', { class: `dot s${s.slot}` }), h('span', { class: 'name', text: sectorName(s) }), out, range);
  }));
  $('assessDialog').returnValue = '';
  if ($('settingsDialog').open) $('settingsDialog').close();
  $('assessDialog').showModal();
}

/* ---------- Запуск ---------- */

export function initWheel() {
  $('prev').addEventListener('click', () => shift(-1));
  $('next').addEventListener('click', () => shift(1));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.period = b.dataset.view;
    renderWheelView();
  }));
  $('wheel').addEventListener('click', e => {
    const g = e.target.closest('g[data-id]');
    if (g) select(g.dataset.id);
  });

  $('goalDialog').addEventListener('close', () => {
    if ($('goalDialog').returnValue === 'save') saveGoal();
  });
  $('archiveGoal').addEventListener('click', async () => {
    $('goalDialog').close();
    await save('goals', [{ ...goalCtx.goal, archivedFrom: addDays(thisMonday(), 7) }]);
  });
  $('deleteGoal').addEventListener('click', async () => {
    if (!confirm(t('goal.deleteConfirm'))) return;
    $('goalDialog').close();
    await save('goals', [{ ...goalCtx.goal, deletedAt: new Date().toISOString() }]);
  });

  $('logDialog').addEventListener('close', async () => {
    if ($('logDialog').returnValue !== 'save') return;
    const f = $('logForm').elements;
    const amount = Number(f.amount.value);
    const date = f.date.value;
    if (!(amount >= 0) || !isDateKey(date) || date > todayKey()) return;
    await save('entries', [{ id: uuid(), goalId: logGoalId, date, amount, note: f.note.value.trim().slice(0, 500) || null }]);
  });

  $('assessDialog').addEventListener('close', async () => {
    if ($('assessDialog').returnValue !== 'save') return;
    const scores = {};
    $('assessList').querySelectorAll('input[type="range"]').forEach(r => { scores[r.name] = Number(r.value); });
    const today = todayKey();
    const existing = state.index.assessments.find(a => a.date === today);
    await save('assessments', [{ ...(existing || { id: uuid(), date: today }), scores }]);
  });
}
