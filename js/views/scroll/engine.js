/* Свиток «Мудрость дня» — чистая логика. Ни страницы, ни хранилища, ни сети:
   только числа и строки, поэтому всё здесь проверяется тестами в node.

   Правило выбора из ТЗ: номер = Hash(userId + дата) % число_посланий.
   - Одно и то же послание держится весь день, с 00:00 до 23:59 по местному
     времени человека, и меняется ровно в полночь.
   - Повторы НЕ исключаются: каждый день выбор делается заново из всей базы.
     Выпало то же, что вчера, — так и задумано, это знак, а не ошибка.

   Число посланий берётся из самой базы, а не зашито здесь: базу можно
   заменить на любую другую, и логика менять не придётся. */

/* Дата дня — 'YYYY-MM-DD' по местному времени. Своя, а не из core/dates.js:
   модуль не зависит от остального приложения. */
export function dayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* Сколько миллисекунд до ближайшей местной полуночи. Секунда сверху —
   чтобы проснуться уже в новом дне, а не за мгновение до него. */
export function msToMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return next.getTime() - now.getTime();
}

/* Хеш строки: FNV-1a и перемешивание хвоста (как в MurmurHash3). Одного
   FNV мало: у соседних дат («…-27» и «…-28») младшие биты расходятся слабо,
   и остаток от деления выпадал бы кучно. Перемешивание это снимает. */
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/* Номер послания на этот день для этого человека. Без входа в аккаунт
   userId пустой — тогда послание у всех таких людей одно на день. */
export function pickIndex(userId, date, count) {
  if (!(count > 0)) return -1;
  return hash(`${userId || ''}|${date}`) % count;
}

/* База может прийти с украинским под ключом 'ua' (так он назван в ТЗ),
   а приложение зовёт его 'uk'. Приводим к одному виду и выкидываем пустое. */
export function normalize(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.predictions) ? raw.predictions : [];
  return list
    .map(p => ({ ru: p?.ru || '', uk: p?.uk || p?.ua || '', en: p?.en || '' }))
    .filter(p => p.ru || p.uk || p.en);
}

/* Текст послания на языке человека. Нет перевода — берём русский, затем
   английский: пустой свиток хуже, чем свиток на соседнем языке. */
export function textOf(prediction, lang) {
  if (!prediction) return '';
  return prediction[lang] || prediction.ru || prediction.en || prediction.uk || '';
}

/* Открыт ли свиток при входе. Запись хранит дату и состояние: вчерашнее
   «открыт» на сегодняшний свиток не распространяется — новый день
   начинается с завязанной ленточки. */
export function isOpenToday(saved, date) {
  return Boolean(saved && saved.date === date && saved.open);
}
