import { loadAll, putRecords, clearAll } from './db.js';
import { initSync, scheduleSync, syncNow, deleteAccount } from './sync.js';
import { requestAccess, login as doLogin, hasSession, logoutAndClear, fetchMe } from './auth.js';
import { API_BASE } from './config.js';
import { renderWheel } from './wheel.js';
import {
  todayKey, mondayOf, addDays, addMonths, fromKey, isDateKey, weekDays
} from './core/dates.js';
import {
  buildIndex, weekWheel, monthWheel, yearWheel, wheelStats, assessmentAt,
  versionAt, versionChange, goalWeek
} from './core/calc.js';

const DEFAULT_SECTORS = [
  'Здоровье и спорт', 'Карьера и бизнес', 'Финансы', 'Семья и любовь',
  'Окружение и друзья', 'Личностный рост', 'Отдых и яркость жизни',
  'Духовность и смыслы', 'Уют и пространство'
];
const DEFAULT_COUNT = 8;
const PACE_TEXT = {
  onTrack: 'по плану', behindLittle: 'немного отстаёшь', behind: 'отстаёшь', over: 'сверх лимита'
};
const STATUS_TEXT = {
  local: 'только на этом устройстве', syncing: 'сохраняю…', synced: 'сохранено',
  offline: 'нет сети — сохраню позже', error: 'сервер недоступен — сохраню позже', idle: ''
};

const state = { data: null, index: null, view: 'week', anchor: todayKey(), selected: null, me: null };

const $ = id => document.getElementById(id);
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const round = x => Math.round(x);
const num = x => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));
const sectorName = s => s.name.trim() || `Сектор ${s.slot}`;

// Элемент DOM; текст — только через textContent, поэтому любые названия безопасны
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    else if (k.includes('-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

/* ---------- Данные ---------- */

function reindex() { state.index = buildIndex(state.data); }

async function save(kind, records) {
  const stamped = records.map(r => ({ deletedAt: null, ...r, updatedAt: nowIso(), dirty: 1 }));
  await putRecords(kind, stamped);
  const byId = new Map(state.data[kind].map(r => [r.id, r]));
  for (const r of stamped) byId.set(r.id, r);
  state.data[kind] = [...byId.values()];
  reindex();
  render();
  scheduleSync();
}

async function seedSectors() {
  await save('sectors', DEFAULT_SECTORS.map((name, i) => ({
    id: uuid(), slot: i + 1, name, position: i + 1, active: i < DEFAULT_COUNT, paused: false
  })));
}

const thisMonday = () => mondayOf(todayKey());

/* ---------- Период ---------- */

const fmtDay = new Intl.DateTimeFormat('ru', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtShort = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function period() {
  const today = todayKey();
  const a = state.anchor;
  switch (state.view) {
    case 'day': return {
      label: fmtDay.format(fromKey(a)), end: a, canNext: a < today,
      week: mondayOf(a), upto: a
    };
    case 'week': {
      const monday = mondayOf(a);
      const sunday = addDays(monday, 6);
      return {
        label: `${fmtShort.format(fromKey(monday))} – ${fmtShort.format(fromKey(sunday))}`,
        end: sunday < today ? sunday : today, canNext: sunday < today,
        week: monday, upto: monday === mondayOf(today) ? today : null
      };
    }
    case 'month': {
      const ym = a.slice(0, 7);
      const label = fmtMonth.format(fromKey(`${ym}-01`));
      const last = addDays(`${addMonths(ym, 1)}-01`, -1);
      return { label: label[0].toUpperCase() + label.slice(1), end: last < today ? last : today, canNext: ym < today.slice(0, 7), month: ym };
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
  }[state.view]();
  state.anchor = next > today ? today : next;
  render();
}

/* ---------- Отрисовка ---------- */

function render() {
  const p = period();
  const today = todayKey();
  let rows, extra = '';
  if (p.week) {
    rows = weekWheel(state.index, p.week, p.upto);
  } else if (p.month) {
    const m = monthWheel(state.index, p.month, today);
    rows = m.rows;
    extra = m.weeks ? `по ${m.weeks} заверш. нед.` : 'завершённых недель в месяце ещё нет';
  } else {
    const y = yearWheel(state.index, p.year, today);
    rows = y.rows;
    extra = y.months ? `по ${y.months} мес.` : 'данных за год пока нет';
  }

  document.querySelectorAll('[data-view]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
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
    el.replaceChildren(extra || 'Пока нет целей — добавь первую в любой сфере.');
    return;
  }
  const names = st.candidates
    .map(id => rows.find(r => r.sector.id === id)).filter(Boolean)
    .map(r => sectorName(r.sector)).join(', ');
  const parts = ['Среднее ', h('b', { text: `${round(st.avg)}%` })];
  if (st.uniformity !== null) parts.push(` · однородность ${round(st.uniformity)}%`);
  // «Ниже всех» имеет смысл, только когда есть с чем сравнить
  const valued = rows.filter(r => r.pct !== null).length;
  if (names && valued > st.candidates.length) parts.push(`. Ниже всех: ${names}`);
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
    box.replaceChildren(h('p', { text: 'Добавь первую цель: нажми «+ цель» у любой сферы. Норма на неделю — это 100% сектора.' }));
  } else {
    box.replaceChildren(
      h('p', { text: 'Начни с оценки: как ты сейчас ощущаешь каждую сферу жизни от 1 до 10.' }),
      h('button', { type: 'button', class: 'btn primary', text: 'Оценить сферы', onclick: openAssess }));
  }
}

function renderList(rows, p) {
  const list = $('sectorList');
  list.replaceChildren(...rows.map(row => {
    const s = row.sector;
    const head = h('div', { class: 'sector-head', onclick: () => select(s.id) },
      h('span', { class: `dot s${s.slot}` }),
      h('span', { class: 'name', text: sectorName(s) }),
      s.paused ? h('span', { class: 'tag', text: 'не сейчас' }) : null,
      h('span', { class: 'pct', text: row.pct === null ? '—' : `${round(row.pct)}%` }));
    const item = h('li', { class: `sector-item${s.id === state.selected ? ' is-selected' : ''}`, dataset: { id: s.id } }, head);

    if (p.week) {
      if (row.goals.length) item.append(h('ul', { class: 'goals' }, ...row.goals.map(g => goalRow(g, s))));
      item.append(h('button', { type: 'button', class: 'add-goal', text: '+ цель', onclick: () => openGoal(null, s.id) }));
    } else if (row.count) {
      item.append(h('p', { class: 'muted', text: `посчитано по ${row.count} ${p.month ? 'нед.' : 'мес.'}` }));
    }
    return item;
  }));
}

function goalRow(g, sector) {
  const unit = g.goal.unit ? ` ${g.goal.unit}` : '';
  const pace = g.pace ? ` · ${g.version.kind === 'atMost' && g.pace === 'onTrack' ? 'в рамках' : PACE_TEXT[g.pace]}` : '';
  const bar = h('i', { class: `s${sector.slot}` });
  bar.style.width = `${Math.min(g.pct, 120) / 1.2}%`;
  return h('li', { class: 'goal' },
    h('button', { type: 'button', class: 'goal-open', text: g.goal.title, onclick: () => openGoal(g.goal.id, sector.id) }),
    h('div', { class: 'goal-meta', text: `${num(g.done)} из ${num(g.target)}${unit} · ${round(g.pct)}%${pace}` }),
    h('div', { class: 'bar' }, bar),
    h('button', { type: 'button', class: 'log-btn', text: '+', 'aria-label': `Записать: ${g.goal.title}`, onclick: () => openLog(g.goal.id) }));
}

function select(id) {
  state.selected = state.selected === id ? null : id;
  render();
  if (state.selected) document.querySelector(`.sector-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderStatus(status) {
  $('syncStatus').textContent = STATUS_TEXT[status] ?? '';
}

/* ---------- Цель ---------- */

let goalCtx = null;
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function openGoal(goalId, sectorId) {
  const goal = goalId ? state.index.goals.find(g => g.id === goalId) : null;
  const version = goal ? versionAt(state.index, goal.id, thisMonday()) : null;
  const sector = state.index.sectors.find(s => s.id === sectorId);
  goalCtx = { goal, sectorId };

  const f = $('goalForm').elements;
  $('goalHeading').textContent = goal ? 'Цель' : 'Новая цель';
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
    title: f.title.value.trim().slice(0, 80) || 'Цель',
    unit: f.unit.value.trim().slice(0, 20)
  };
  const change = versionChange(state.index, goal.id, thisMonday(), { target, kind: f.kind.value, weight, dayPlan });
  const version = change.kind === 'create' ? { ...change.version, id: uuid() } : change.version;
  await save('goals', [goal]);
  await save('goalVersions', [version]);
}

$('goalDialog').addEventListener('close', () => {
  if ($('goalDialog').returnValue === 'save') saveGoal();
});
$('archiveGoal').addEventListener('click', async () => {
  $('goalDialog').close();
  await save('goals', [{ ...goalCtx.goal, archivedFrom: addDays(thisMonday(), 7) }]);
});
$('deleteGoal').addEventListener('click', async () => {
  if (!confirm('Удалить цель вместе со всей её историей?')) return;
  $('goalDialog').close();
  await save('goals', [{ ...goalCtx.goal, deletedAt: nowIso() }]);
});

/* ---------- Запись ---------- */

let logGoalId = null;

function weekForLog() {
  const p = period();
  return p.week || thisMonday();
}

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
  f.date.value = state.view === 'day' ? state.anchor : (sunday < today ? sunday : today);
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
    ? `За неделю: ${num(g.done)} из ${num(g.target)}${unit} · ${round(g.pct)}%`
    : '';
  const days = new Set(weekDays(monday));
  const entries = (state.index.entries.get(goal.id) || []).filter(e => days.has(e.date));
  $('logEntries').replaceChildren(...entries.map(e => h('li', {},
    h('span', { text: `${fmtShort.format(fromKey(e.date))} — ${num(e.amount)}${unit}${e.note ? ` · ${e.note}` : ''}` }),
    h('button', { type: 'button', text: 'удалить', onclick: async () => {
      await save('entries', [{ ...e, deletedAt: nowIso() }]);
      renderLogDetails();
    } }))));
}

$('logDialog').addEventListener('close', async () => {
  if ($('logDialog').returnValue !== 'save') return;
  const f = $('logForm').elements;
  const amount = Number(f.amount.value);
  const date = f.date.value;
  if (!(amount >= 0) || !isDateKey(date) || date > todayKey()) return;
  await save('entries', [{ id: uuid(), goalId: logGoalId, date, amount, note: f.note.value.trim().slice(0, 500) || null }]);
});

/* ---------- Самооценка ---------- */

function openAssess() {
  const latest = assessmentAt(state.index, todayKey());
  const active = state.index.sectors.filter(s => s.active);
  $('assessList').replaceChildren(...active.map(s => {
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

$('assessDialog').addEventListener('close', async () => {
  if ($('assessDialog').returnValue !== 'save') return;
  const scores = {};
  $('assessList').querySelectorAll('input[type="range"]').forEach(r => { scores[r.name] = Number(r.value); });
  const today = todayKey();
  const existing = state.index.assessments.find(a => a.date === today);
  await save('assessments', [{ ...(existing || { id: uuid(), date: today }), scores }]);
});

/* ---------- Настройки ---------- */

function openSettings() {
  const sectors = state.index.sectors;
  const count = sectors.filter(s => s.active).length;
  $('countButtons').querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.count) === count)));
  $('sectorEditList').replaceChildren(...sectors.filter(s => s.active).map(s => h('li', { class: 'edit-row' },
    h('span', { class: `dot s${s.slot}` }),
    h('input', { value: s.name, maxLength: 40, placeholder: `Сектор ${s.slot}`, 'aria-label': `Название сектора ${s.slot}`,
      onchange: e => save('sectors', [{ ...s, name: e.target.value.trim().slice(0, 40) }]) }),
    h('label', {}, h('input', { type: 'checkbox', checked: s.paused,
      onchange: e => save('sectors', [{ ...s, paused: e.target.checked }]) }), 'не сейчас'))));
  if (API_BASE && state.me) {
    $('accountInfo').textContent = `Вход выполнен: ${state.me.displayName} (${state.me.email}).`;
    $('logoutBtn').hidden = false;
  } else {
    $('accountInfo').textContent = 'Сервер пока не подключён: данные хранятся только на этом устройстве.';
    $('logoutBtn').hidden = true;
  }
  $('settingsDialog').showModal();
}

$('logoutBtn').addEventListener('click', async () => {
  if (!confirm('Выйти и стереть данные этого человека с устройства? Чтобы продолжить, нужно будет снова войти.')) return;
  await logoutAndClear();
  location.reload();
});

$('countButtons').addEventListener('click', async e => {
  const n = Number(e.target.dataset.count);
  if (!n) return;
  const changed = state.index.sectors
    .filter(s => s.active !== (s.position <= n))
    .map(s => ({ ...s, active: s.position <= n }));
  if (changed.length) await save('sectors', changed);
  openSettings();
});

$('deleteData').addEventListener('click', async () => {
  if (!confirm('Удалить все цели, записи и оценки — на этом устройстве и на сервере? Вернуть их будет нельзя.')) return;
  try {
    await deleteAccount();
  } catch {
    alert('Не получилось связаться с сервером. Попробуй, когда появится сеть.');
    return;
  }
  await clearAll();
  location.reload();
});

/* ---------- Запуск ---------- */

$('openSettings').addEventListener('click', openSettings);
$('openAssess').addEventListener('click', openAssess);
$('prev').addEventListener('click', () => shift(-1));
$('next').addEventListener('click', () => shift(1));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  render();
}));
$('wheel').addEventListener('click', e => {
  const g = e.target.closest('g[data-id]');
  if (g) select(g.dataset.id);
});

async function start() {
  state.data = await loadAll();
  reindex();
  initSync({
    status: renderStatus,
    data: async () => { state.data = await loadAll(); reindex(); render(); },
    authLost: showGate
  });
  if (API_BASE) state.me = await fetchMe();
  // Сферы по умолчанию — только если их нет и на сервере: иначе после очистки
  // телефона рядом с вернувшимися сферами появились бы ещё девять
  if (!state.index.sectors.length) {
    await syncNow();
    state.data = await loadAll();
    reindex();
    if (!state.index.sectors.length) await seedSectors();
  }
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('[sw]', err.message));
  }
}

/* ---------- Вход и заявка на доступ ---------- */

const LOGIN_ERRORS = {
  invalid_credentials: 'Неверная почта или пароль.',
  pending_approval: 'Заявка ещё на рассмотрении у администратора.',
  blocked: 'Доступ закрыт. Обратись к администратору.'
};
const REQUEST_ERRORS = { already_requested: 'С этой почтой заявка уже подавалась.' };

function showGate() {
  $('appRoot').hidden = true;
  $('authGate').hidden = false;
}
function hideGate() {
  $('authGate').hidden = true;
  $('appRoot').hidden = false;
}

function gateTab(which) {
  const loginActive = which === 'login';
  $('gateTabLogin').setAttribute('aria-selected', String(loginActive));
  $('gateTabRequest').setAttribute('aria-selected', String(!loginActive));
  $('loginForm').hidden = !loginActive;
  $('requestForm').hidden = loginActive;
}
$('gateTabLogin').addEventListener('click', () => gateTab('login'));
$('gateTabRequest').addEventListener('click', () => gateTab('request'));

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('loginMsg');
  msg.className = 'gate-msg';
  msg.textContent = '';
  const f = e.target.elements;
  try {
    await doLogin(f.email.value, f.password.value);
    hideGate();
    start();
  } catch (err) {
    msg.className = 'gate-msg is-error';
    msg.textContent = LOGIN_ERRORS[err.code] || 'Не получилось войти. Проверь подключение к сети.';
  }
});

$('requestForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('requestMsg');
  msg.className = 'gate-msg';
  const f = e.target.elements;
  try {
    await requestAccess({
      displayName: f.displayName.value, email: f.email.value,
      phone: f.phone.value, telegramId: f.telegramId.value
    });
    msg.className = 'gate-msg is-ok';
    msg.textContent = 'Заявка отправлена. Администратор свяжется и передаст доступ.';
    e.target.reset();
  } catch (err) {
    msg.className = 'gate-msg is-error';
    msg.textContent = REQUEST_ERRORS[err.code] || 'Не получилось отправить заявку. Проверь подключение к сети.';
  }
});

async function boot() {
  if (API_BASE && !(await hasSession())) { showGate(); return; }
  await start();
}

boot();
