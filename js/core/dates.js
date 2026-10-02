// Даты дня — строки 'YYYY-MM-DD' по местному времени человека.
// Арифметика идёт в UTC: так переход на летнее время не сдвигает дни.

const DAY_MS = 86400000;

export const isDateKey = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && toKey(fromKey(s)) === s;

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toKey(date) {
  return date.toISOString().slice(0, 10);
}

export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const addDays = (key, n) => toKey(new Date(fromKey(key).getTime() + n * DAY_MS));

// Понедельник = 0 … воскресенье = 6
export const weekdayIndex = key => (fromKey(key).getUTCDay() + 6) % 7;

export const mondayOf = key => addDays(key, -weekdayIndex(key));
export const isMonday = key => isDateKey(key) && weekdayIndex(key) === 0;

// Неделя относится к месяцу и году своего четверга (правило ISO 8601):
// каждая неделя попадает ровно в один месяц.
export const thursdayOf = monday => addDays(monday, 3);
export const monthOfWeek = monday => thursdayOf(monday).slice(0, 7);

export function isoWeekKey(monday) {
  const thu = fromKey(thursdayOf(monday));
  const yearStart = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const week = Math.floor((thu.getTime() - yearStart) / DAY_MS / 7) + 1;
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Понедельники недель, отнесённых к месяцу 'YYYY-MM'
export function weeksOfMonth(ym) {
  const first = `${ym}-01`;
  let monday = mondayOf(first);
  if (monthOfWeek(monday) !== ym) monday = addDays(monday, 7);
  const weeks = [];
  while (monthOfWeek(monday) === ym) {
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

export const monthsOfYear = year =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

export const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toKey(d).slice(0, 7);
};

export const weekDays = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
