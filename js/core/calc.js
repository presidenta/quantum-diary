// Расчёты колеса: чистые функции без DOM и хранилища.
// Одни и те же на телефоне и на сервере; формулы — ТЗ, раздел 2.2.

import { addDays, weekdayIndex, weeksOfMonth, monthsOfYear } from './dates.js';

export const MAX_PCT = 120;

const alive = r => !r.deletedAt;
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/* Процент цели за неделю.
   «не меньше»: сделано / норма, не выше 120%.
   «не больше»: в норме — 100%, превышение в 1,5 раза — 50%, вдвое — 0%. */
export function goalPercent(done, target, kind = 'atLeast') {
  if (!(target > 0)) return null;
  const ratio = done / target;
  if (kind === 'atMost') return Math.min(1, Math.max(0, 2 - ratio)) * 100;
  return Math.min(ratio, MAX_PCT / 100) * 100;
}

// Раскладывает записи по целям один раз, чтобы срезы не перебирали всё заново
export function buildIndex(data) {
  const sectors = data.sectors.filter(alive).sort((a, b) => a.position - b.position);
  const goals = data.goals.filter(alive);

  const versions = new Map();
  for (const v of data.goalVersions.filter(alive)) {
    if (!versions.has(v.goalId)) versions.set(v.goalId, []);
    versions.get(v.goalId).push(v);
  }
  for (const list of versions.values()) list.sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));

  const entries = new Map();
  for (const e of data.entries.filter(alive)) {
    if (!entries.has(e.goalId)) entries.set(e.goalId, []);
    entries.get(e.goalId).push(e);
  }
  for (const list of entries.values()) list.sort(byDate);

  const assessments = data.assessments.filter(alive).sort(byDate);
  return { sectors, goals, versions, entries, assessments };
}

// Версия нормы, действующая в неделе: последняя с validFrom не позже понедельника
export function versionAt(index, goalId, monday) {
  let found = null;
  for (const v of index.versions.get(goalId) || []) {
    if (v.validFrom <= monday) found = v;
    else break;
  }
  return found;
}

export function isGoalActive(goal, version, monday) {
  return Boolean(version) && (!goal.archivedFrom || monday < goal.archivedFrom);
}

/* Темп незавершённой недели: сколько сделано к этому дню против плана к этому дню.
   План по дням задан — берём его, нет — норма делится на семь дней поровну. */
export function planToDate(version, dayIdx) {
  if (Array.isArray(version.dayPlan)) {
    return version.dayPlan.slice(0, dayIdx + 1).reduce((s, x) => s + x, 0);
  }
  return version.target * (dayIdx + 1) / 7;
}

export function paceStatus(done, plan, kind = 'atLeast') {
  if (kind === 'atMost') return done <= plan ? 'onTrack' : 'over';
  if (plan <= 0) return 'onTrack';
  const r = done / plan;
  if (r >= 1) return 'onTrack';
  if (r >= 0.7) return 'behindLittle';
  return 'behind';
}

/* Цель за неделю. upto — день внутри недели для среза дня: тогда считаем
   сделанное по этот день включительно и добавляем темп. */
export function goalWeek(index, goal, monday, upto = null) {
  const version = versionAt(index, goal.id, monday);
  if (!isGoalActive(goal, version, monday)) return null;

  const sunday = addDays(monday, 6);
  const inProgress = upto !== null && upto >= monday && upto < sunday;
  const last = inProgress ? upto : sunday;

  let done = 0;
  for (const e of index.entries.get(goal.id) || []) {
    if (e.date > last) break;
    if (e.date >= monday) done += e.amount;
  }

  const result = {
    goal, version, done,
    target: version.target,
    pct: goalPercent(done, version.target, version.kind),
    plan: null,
    pace: null
  };
  if (inProgress) {
    result.plan = planToDate(version, weekdayIndex(last));
    result.pace = paceStatus(done, result.plan, version.kind);
  }
  return result;
}

// Процент сектора — взвешенное среднее его целей; целей нет — сектор не задан (null)
export function weightedPct(goalRows) {
  let sum = 0, weights = 0;
  for (const g of goalRows) {
    if (g.pct === null) continue;
    const w = g.version.weight > 0 ? g.version.weight : 1;
    sum += g.pct * w;
    weights += w;
  }
  return weights ? sum / weights : null;
}

const activeSectors = index => index.sectors.filter(s => s.active);
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

// Колесо недели: [{ sector, pct, goals }]
export function weekWheel(index, monday, upto = null) {
  return activeSectors(index).map(sector => {
    const goals = index.goals
      .filter(g => g.sectorId === sector.id)
      .map(g => goalWeek(index, g, monday, upto))
      .filter(Boolean);
    return { sector, pct: weightedPct(goals), goals };
  });
}

/* Колесо месяца: среднее по завершённым неделям месяца.
   Идущая неделя не входит — иначе каждый понедельник тянул бы месяц вниз. */
export function monthWheel(index, ym, today) {
  const weeks = weeksOfMonth(ym).filter(monday => addDays(monday, 6) < today);
  const perWeek = weeks.map(monday => weekWheel(index, monday));
  const rows = activeSectors(index).map((sector, i) => {
    const values = perWeek.map(w => w[i].pct).filter(p => p !== null);
    return { sector, pct: values.length ? mean(values) : null, count: values.length };
  });
  return { rows, weeks: weeks.length };
}

// Колесо года: по каждому сектору — среднее по месяцам, где у него есть данные
export function yearWheel(index, year, today) {
  const perMonth = monthsOfYear(year).map(ym => monthWheel(index, ym, today));
  const rows = activeSectors(index).map((sector, i) => {
    const values = perMonth.map(m => m.rows[i].pct).filter(p => p !== null);
    return { sector, pct: values.length ? mean(values) : null, count: values.length };
  });
  const months = perMonth.filter(m => m.rows.some(r => r.pct !== null)).length;
  return { rows, months };
}

// Последняя самооценка 1–10 не позже дня
export function assessmentAt(index, day) {
  let found = null;
  for (const a of index.assessments) {
    if (a.date <= day) found = a;
    else break;
  }
  return found;
}

/* Среднее, однородность и кандидаты в «точку рычага».
   Однородность U = max(0, 1 − σ/μ). Кандидаты — сектора не выше μ − σ/2,
   а если таких меньше двух — два самых низких; сектора «не сейчас» не берём. */
export function wheelStats(rows) {
  const valued = rows.filter(r => r.pct !== null);
  if (!valued.length) return { avg: null, uniformity: null, candidates: [] };

  const mu = mean(valued.map(r => r.pct));
  const sigma = Math.sqrt(mean(valued.map(r => (r.pct - mu) ** 2)));
  const uniformity = valued.length < 2 ? null : mu > 0 ? Math.max(0, 1 - sigma / mu) * 100 : 0;

  const pool = valued.filter(r => !r.sector.paused).sort((a, b) => a.pct - b.pct);
  let candidates = pool.filter(r => r.pct <= mu - sigma / 2);
  if (candidates.length < 2) candidates = pool.slice(0, 2);

  return { avg: mu, uniformity, candidates: candidates.map(r => r.sector.id) };
}

/* Правка нормы цели. Прошлые недели должны считаться по старой норме,
   поэтому правка с этой недели — новая версия; если версия этой недели уже есть — правим её. */
export function versionChange(index, goalId, monday, fields) {
  const current = versionAt(index, goalId, monday);
  if (current && current.validFrom === monday) {
    return { kind: 'update', version: { ...current, ...fields } };
  }
  const base = current
    ? { target: current.target, kind: current.kind, weight: current.weight, dayPlan: current.dayPlan }
    : {};
  return { kind: 'create', version: { goalId, validFrom: monday, ...base, ...fields } };
}
