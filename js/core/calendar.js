/* Календарь: раскладка недели и месяца.

   Только расчёты, без DOM — поэтому проверяется обычными тестами.

   Устройство экрана взято у Super Productivity (MIT): неделя — колонки дней
   слева направо, месяц — сетка по семь дней в ряд, начиная с понедельника.
   Их код на Angular и к нам не переносится, но раскладка там сделана так, как
   люди привыкли, и выдумывать свою незачем. */

import { mondayOf, addDays, fromKey, todayKey } from './dates.js';

/* Неделя как семь дней подряд. Начало — понедельник: так считают неделю в
   Европе, и так же устроены все расчёты в проекте. */
export function weekDays(anchorKey) {
  const start = mondayOf(anchorKey);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/* Месяц сеткой: полные недели, включая хвосты соседних месяцев.

   Чужие дни остаются видимыми, а не прячутся: сетка с дырами по краям
   читается хуже ровной, и человек всё равно смотрит «что было в конце
   прошлой недели». Помечаем их отдельно, чтобы экран мог приглушить. */
export function monthGrid(anchorKey) {
  const month = anchorKey.slice(0, 7);
  const first = `${month}-01`;
  const start = mondayOf(first);

  // Шесть недель покрывают любой месяц; лишнюю неделю отбрасываем, если она
  // целиком чужая — иначе снизу висит пустая полоса
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
    if (w >= 4 && days.every(d => d.slice(0, 7) !== month)) break;
    weeks.push(days);
  }
  return weeks;
}

export const isSameMonth = (dateKey, anchorKey) => dateKey.slice(0, 7) === anchorKey.slice(0, 7);

/* Сколько задач в каждом дне и сколько из них сделано. Считается один раз на
   всю раскладку: иначе для каждого дня месяца пришлось бы заново проходить
   весь список задач — тридцать проходов вместо одного. */
export function taskCounts(tasks) {
  const counts = new Map();
  for (const task of tasks) {
    if (task.deletedAt) continue;
    const day = counts.get(task.date) || { total: 0, done: 0 };
    day.total += 1;
    if (task.done) day.done += 1;
    counts.set(task.date, day);
  }
  return counts;
}

/* Подпись периода: «6–12 окт.» для недели, «октябрь 2026» для месяца.
   Через Intl, а не руками: названия месяцев и падежи у трёх языков разные. */
export function periodLabel(view, anchorKey, language) {
  if (view === 'month') {
    const label = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(fromKey(anchorKey));
    return label[0].toUpperCase() + label.slice(1);
  }
  const days = weekDays(anchorKey);
  const short = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${short.format(fromKey(days[0]))} – ${short.format(fromKey(days[6]))}`;
}

// Шаг назад и вперёд: неделя семью днями, месяц — по числу дней в нём
export function shift(view, anchorKey, direction) {
  if (view !== 'month') return addDays(anchorKey, 7 * direction);
  const d = fromKey(anchorKey);
  const moved = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1));
  return moved.toISOString().slice(0, 10);
}

export const isToday = dateKey => dateKey === todayKey();
