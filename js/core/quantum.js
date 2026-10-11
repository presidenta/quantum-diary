/* Квантовый модуль: чистые правила без браузера и сети.

   Расписание приходит с сервера — одно и то же на всех устройствах. Здесь
   только то, что нужно посчитать на экране: какой момент сейчас, сколько
   прожито, какого цвета день. */

/* Сколько держать кнопку. Было восемь секунд — владелец попросил три:
   восемь на вытянутой руке с телефоном это долго, и люди отпускали раньше. */
export const HOLD_SECONDS = 3;

/* СКОЛЬКО ЖИВЁТ МОМЕНТ.

   Сигнал приходит в случайную минуту и ждёт человека сорок минут. Не застал —
   момент упущен, и это нормально: смысл практики в том, чтобы откликнуться
   сейчас, а не отработать список к ночи.

   Без этого окна просроченные моменты копились очередью: открыв приложение
   вечером, человек проживал один — и тут же вставал следующий, потом ещё, и
   так шесть раз подряд. Снаружи это выглядит как заевшая кнопка. */
export const MOMENT_WINDOW_MINUTES = 40;

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

/* ВЫКЛЮЧЕННЫЕ МОМЕНТЫ.

   Человек сам решает, сколько раз в день его окликнуть: крестик на времени
   гасит момент. Выключенный момент не наступает, не считается прожитым и не
   попадает в счётчик раздела. На экране расписания он остаётся — перечёркнутым,
   чтобы его можно было вернуть. */
export const isOff = moment => Boolean(moment.offAt);

// Моменты, которые сегодня ещё работают
export const liveMoments = moments => moments.filter(m => !isOff(m));

// Сколько моментов человек оставил себе на сегодня: знаменатель счётчика
export const plannedCount = moments => liveMoments(moments).length;

export const livedCount = moments => moments.filter(m => m.doneAt && !isOff(m)).length;

/* Текущий момент: самый поздний непрожитый, время которого уже наступило.
   Раньше времени момент не появляется — в этом вся суть: его нельзя
   подготовить заранее. */
const toMinutes = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/* Момент, который сейчас ждёт человека: наступил и ещё не просрочен.
   Их не может быть двое — окно короче промежутка между моментами. */
export function activeMoment(moments, nowHHMM, windowMinutes = MOMENT_WINDOW_MINUTES) {
  const now = toMinutes(nowHHMM);
  const live = moments.filter(m => {
    if (m.doneAt || isOff(m)) return false;
    const at = toMinutes(m.at);
    return at <= now && now - at < windowMinutes;
  });
  return live.length ? live[live.length - 1] : null;
}

// Упущенные: время вышло, а человек не откликнулся. Нужны, чтобы честно
// показать, сколько моментов прошло мимо, а не делать вид, что их не было
export function missedMoments(moments, nowHHMM, windowMinutes = MOMENT_WINDOW_MINUTES) {
  const now = toMinutes(nowHHMM);
  return moments.filter(m => !m.doneAt && !isOff(m) && now - toMinutes(m.at) >= windowMinutes);
}

export const nextMoment = (moments, nowHHMM) =>
  moments.find(m => !m.doneAt && !isOff(m) && m.at > nowHHMM) || null;

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

/* ---------------------------------------------------------------------------
   ДЕНЬ БЕЗ СЕРВЕРА

   Расписание девяти моментов и аркан дня создаёт сервер. Это правильно:
   сервер — источник правды, и на телефоне, и на планшете человек видит
   один и тот же день. Но если сервера не дозваться — связи нет, он занят,
   не пускает чужой адрес, — то до этой правки не было НИЧЕГО: пустая
   карточка, нет аркана, нет моментов, нет напоминаний. Приложение,
   которое умеет работать без сети, молчало из-за сети.

   Теперь телефон строит день сам, по тем же правилам: три окна, по три
   момента, разрыв не меньше двадцати минут, аркан из двадцати двух.

   ПОЧЕМУ СЧЁТ ДЕТЕРМИНИРОВАННЫЙ, А НЕ СЛУЧАЙНЫЙ.
   День собирается из самой даты: одна и та же дата всегда даёт один и тот
   же аркан и те же девять времён. Иначе день менялся бы при каждом
   открытии приложения — отметки «прожито» повисали бы в воздухе, а
   напоминания переезжали. Заодно это значит, что телефон и планшет без
   связи покажут одинаковый день: им не надо договариваться.

   Серверный день главнее: как только сервер ответил, его день заменяет
   этот. Здешний — на случай, когда ответа нет. */

export const WINDOWS = {
  morning: { from: 8 * 60, to: 13 * 60 },   // 08:00–13:00 — замыкание контура
  day: { from: 13 * 60, to: 18 * 60 },      // 13:00–18:00 — хромотерапия
  evening: { from: 18 * 60, to: 22 * 60 }   // 18:00–22:00 — сброс потенциала
};
export const PER_WINDOW = 3;
export const MIN_GAP_MINUTES = 20;
export const ARCANA_COUNT = 22;

const hhmm = minutes =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/* Число из строки — чтобы у каждой даты было своё, но всегда одно и то же.
   Обычный FNV-1a: короткий, без библиотек, и его легко проверить. */
function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

/* Счётчик случайных чисел с памятью: от одного зерна всегда одна и та же
   последовательность. Нужен именно такой, а не Math.random: день обязан
   повторяться при каждом открытии. */
function diceFrom(seed) {
  let s = seed >>> 0;
  return limit => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296 * limit) | 0;
  };
}

/* Три времени внутри окна с разрывом не меньше gap.

   Способ «набросать и проверить» не годится: при тесном окне он может
   долго не находить набор. Делим свободные минуты на части — такой набор
   существует всегда. Тот же приём, что на сервере. */
export function pickMoments(window, count = PER_WINDOW, gap = MIN_GAP_MINUTES, dice) {
  if (count <= 0) return [];
  const free = (window.to - window.from) - gap * (count - 1);
  if (free < 0) throw new Error('окно короче, чем нужно для такого числа моментов');

  const cuts = Array.from({ length: count }, () => dice(free + 1)).sort((a, b) => a - b);
  return cuts.map((cut, i) => window.from + cut + gap * i);
}

/* Тихий час вырезает из окна свой кусок.

   Раньше он только глушил уже назначенные моменты: время стояло в
   расписании, но сигнал не приходил. Владелец попросил иначе — чтобы
   тихий час двигал сами окна, и моменты назначались только туда, где
   они могут прозвучать.

   Промежуток тишины обычно переходит через полночь (с 23:00 до 6:00),
   поэтому он раскладывается на один или два отрезка внутри суток. От
   окна отнимаем каждый из них — остаётся свободное время, иногда
   двумя кусками (если тишина пришлась на середину окна). */
function quietParts(quiet) {
  if (!quiet || quiet.on === false) return [];
  const start = minutesOf(quiet.from);
  const end = minutesOf(quiet.until);
  // Равные границы — «тихо никогда», то же правило, что в напоминаниях
  if (start === null || end === null || start === end) return [];
  return start < end ? [[start, end]] : [[start, 1440], [0, end]];
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Что осталось от окна после вычитания тишины. */
export function freeParts(window, quiet) {
  let parts = [[window.from, window.to]];

  for (const [qs, qe] of quietParts(quiet)) {
    const next = [];
    for (const [from, to] of parts) {
      if (qe <= from || qs >= to) { next.push([from, to]); continue; }  // не пересекаются
      if (qs > from) next.push([from, Math.min(qs, to)]);               // кусок до тишины
      if (qe < to) next.push([Math.max(qe, from), to]);                 // кусок после
    }
    parts = next;
  }
  return parts.filter(([from, to]) => to > from);
}

/**
 * День, собранный телефоном: аркан и девять моментов.
 * Форма та же, что у серверного дня, — экран не знает разницы.
 *
 * @param {string} dateKey дата вида 2026-10-12
 * @param {string} [person] чей день: с ним у разных людей на одном
 *                          устройстве получатся разные дни
 * @param {object} [quiet] тихий час {on, from, until}: вырезается из окон,
 *                         и с его изменением день пересчитывается заново
 */
export function localDay(dateKey, person = '', quiet = null) {
  const tishina = quiet && quiet.on !== false ? `${quiet.from}-${quiet.until}` : '';
  const dice = diceFrom(seedOf(`${dateKey}|${person}|${tishina}`));
  const arcana = dice(ARCANA_COUNT) + 1;

  const moments = Object.entries(WINDOWS).flatMap(([slot, window]) =>
    momentsInWindow(window, quiet, dice).map((at, i) => ({
      // Имя момента постоянное: по нему держатся отметки «прожито»
      id: `local-${dateKey}-${slot}-${i + 1}`,
      slot,
      at: hhmm(at),
      doneAt: null,
      offAt: null,
      title: '',
      text: ''
    }))
  );

  // Пометка для экрана и для нас: день посчитан на месте, сервера не было
  return { date: dateKey, arcana, moments, offline: true };
}

/* Сколько моментов и куда их поставить в окне, изрезанном тишиной.

   Берём самый длинный свободный кусок: три момента в одном куске лучше
   трёх, растащенных по огрызкам. Если в нём не помещаются все три с
   положенным разрывом — ставим столько, сколько влезает, вплоть до ни
   одного. Молчать честнее, чем звонить в тишину. */
function momentsInWindow(window, quiet, dice) {
  const parts = freeParts(window, quiet);
  if (parts.length === 0) return [];

  const [from, to] = parts.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const span = to - from;

  let count = PER_WINDOW;
  while (count > 0 && span < MIN_GAP_MINUTES * (count - 1)) count--;
  if (count === 0) return [];

  return pickMoments({ from, to }, count, MIN_GAP_MINUTES, dice);
}
