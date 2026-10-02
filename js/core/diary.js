/* Ежедневник: задачи дня, заметка дня, памятные даты.
   Чистые функции без браузера и хранилища — как dates.js и calc.js. */

import { todayKey, addDays, fromKey, toKey } from './dates.js';

const alive = r => !r.deletedAt;

/* ---------- Задачи ---------- */

export function tasksOfDay(tasks, date) {
  return tasks
    .filter(t => alive(t) && t.date === date)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

// Новая задача становится в конец списка дня
export function nextPosition(tasks, date) {
  const list = tasksOfDay(tasks, date);
  return list.length ? list[list.length - 1].position + 1 : 0;
}

export const taskProgress = list => ({
  done: list.filter(t => t.done).length,
  total: list.length
});

/* Невыполненное с прошлых дней. Переносим не молча: показываем списком,
   человек сам решает, что ещё актуально. Берём не глубже недели назад —
   иначе через месяц список превращается в кладбище. */
export function overdueTasks(tasks, date, maxDaysBack = 7) {
  const from = addDays(date, -maxDaysBack);
  return tasks
    .filter(t => alive(t) && !t.done && t.date < date && t.date >= from)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export const noteOfDay = (notes, date) => notes.find(n => alive(n) && n.date === date) || null;

/* ---------- Памятные даты ---------- */

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/* Когда дата случится в этом году (или уже случилась).
   29 февраля в невисокосный год показываем 28-го: дата существует у человека,
   даже если её нет в календаре. */
export function occurrenceIn(date, year) {
  const day = date.month === 2 && date.day === 29 && !isLeap(year) ? 28 : date.day;
  return `${year}-${String(date.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* Ближайшее наступление начиная с указанного дня.
   Разовое событие в прошлом не повторяется — для него возвращаем null. */
export function nextOccurrence(date, from = todayKey()) {
  const year = Number(from.slice(0, 4));
  if (date.kind === 'once') {
    const once = occurrenceIn(date, date.year);
    return once >= from ? once : null;
  }
  const thisYear = occurrenceIn(date, year);
  return thisYear >= from ? thisYear : occurrenceIn(date, year + 1);
}

export const daysUntil = (from, target) =>
  Math.round((fromKey(target) - fromKey(from)) / 86400000);

// Сколько лет исполнится — только если известен год
export function ageAt(date, occurrence) {
  if (!date.year) return null;
  return Number(occurrence.slice(0, 4)) - date.year;
}

/* Список ближайших дат с числом дней до каждой.
   Разовые прошедшие отсеиваются: напоминать о них больше не нужно. */
export function upcomingDates(dates, from = todayKey(), withinDays = 365) {
  return dates
    .filter(alive)
    .map(d => {
      const occurrence = nextOccurrence(d, from);
      return occurrence && { date: d, occurrence, in: daysUntil(from, occurrence), age: ageAt(d, occurrence) };
    })
    .filter(x => x && x.in <= withinDays)
    .sort((a, b) => a.in - b.in);
}

// О чём напомнить сегодня: сама дата и всё, что просило предупредить заранее
export const remindersFor = (dates, date = todayKey()) =>
  upcomingDates(dates, date, 60).filter(x => x.in <= x.date.remindDaysBefore || x.in === 0);

/* ---------- Сводка дня ---------- */

export function daySummary({ tasks, notes, memorableDates }, date) {
  const list = tasksOfDay(tasks, date);
  return {
    date,
    tasks: list,
    progress: taskProgress(list),
    overdue: overdueTasks(tasks, date),
    note: noteOfDay(notes, date),
    reminders: remindersFor(memorableDates, date)
  };
}

export { toKey };
