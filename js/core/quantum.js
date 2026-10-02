/* Квантовый модуль: чистые правила без браузера и сети.

   Расписание приходит с сервера — одно и то же на всех устройствах. Здесь
   только то, что нужно посчитать на экране: какой момент сейчас, сколько
   прожито, какого цвета день. */

export const HOLD_SECONDS = 8;

/* Цвет дня недели. Чистый спектр на весь экран слепит и не даёт прочесть
   текст, поэтому цвета приглушены: белые буквы на них читаются. */
export const DAY_COLORS = [
  { day: 1, color: '#B3322C', chakra: 'Муладхара', nameKey: 'color.red' },
  { day: 2, color: '#C2611F', chakra: 'Свадхистана', nameKey: 'color.orange' },
  { day: 3, color: '#B88A14', chakra: 'Манипура', nameKey: 'color.yellow' },
  { day: 4, color: '#2E7D45', chakra: 'Анахата', nameKey: 'color.green' },
  { day: 5, color: '#1F6F96', chakra: 'Вишудха', nameKey: 'color.lightblue' },
  { day: 6, color: '#2B3C86', chakra: 'Аджна', nameKey: 'color.blue' },
  { day: 7, color: '#6B3C8C', chakra: 'Сахасрара', nameKey: 'color.violet' }
];

// Понедельник = 1 … воскресенье = 7 (ISO), как и во всех расчётах проекта
export function colorOfDay(dateKey) {
  const utc = new Date(`${dateKey}T00:00:00Z`);
  const iso = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay();
  return DAY_COLORS[iso - 1];
}

/* Двадцать два Аркана. Имя — ключ словаря, чтобы оно переводилось вместе
   с остальным интерфейсом, а римская цифра одинакова на всех языках. */
export const ARCANA_ROMAN = [
  '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'
];
export const arcanaRoman = n => ARCANA_ROMAN[(n - 1) % ARCANA_ROMAN.length];
export const arcanaKey = n => `arcana.${n}`;

export const SLOT_ORDER = ['morning', 'day', 'evening'];

export function groupBySlot(moments) {
  return SLOT_ORDER.map(slot => ({
    slot,
    moments: moments.filter(m => m.slot === slot)
  }));
}

export const livedCount = moments => moments.filter(m => m.doneAt).length;

/* Текущий момент: самый поздний непрожитый, время которого уже наступило.
   Раньше времени момент не появляется — в этом вся суть: его нельзя
   подготовить заранее. */
export function activeMoment(moments, nowHHMM) {
  const due = moments.filter(m => !m.doneAt && m.at <= nowHHMM);
  return due.length ? due[due.length - 1] : null;
}

export const nextMoment = (moments, nowHHMM) =>
  moments.find(m => !m.doneAt && m.at > nowHHMM) || null;

export const timeNow = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/* Сколько миллисекунд до ближайшего момента. Нужно, чтобы поставить ОДИН
   таймер вместо опроса раз в секунду: телефон не должен греться впустую. */
export function msUntil(timeHHMM, now = new Date()) {
  const [h, m] = timeHHMM.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return target - now;
}
