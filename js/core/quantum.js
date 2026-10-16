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

/* Прежние окна, прибитые к часам. Оставлены как начальное время
   бодрствования — с восьми утра до десяти вечера, когда тихий час
   выключен. Сами окна теперь считает dayWindows. */
export const PER_WINDOW = 3;
export const MIN_GAP_MINUTES = 20;

/* НОМЕР ПРАВИЛА, ПО КОТОРОМУ СЧИТАЮТСЯ ВРЕМЕНА МОМЕНТОВ.

   Менять при каждой правке алгоритма времён (окна фаз, ручной звонок,
   расстановка моментов). День, посчитанный на телефоне, сохраняется в
   кэше на сутки (views/quantum.js), и без номера новое правило не
   доезжало бы до человека: приложение показывало бы вчерашней правкой
   посчитанный день до самой полуночи, а будильники звонили бы по его
   временам.

   1 — до 16.10.2026: ручной звонок выстраивал весь день после себя.
   2 — ручной звонок двигает только моменты после него, в окне фазы. */
export const DAY_RULE = 2;
export const ARCANA_COUNT = 22;

/* Минуты в «ЧЧ:ММ». Сутки замыкаются: окно вечера у совы может
   перевалить за полночь, и 25:10 там быть не должно. */
const hhmm = minutes => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

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

/* ОКНА СЧИТАЮТСЯ ОТ ПРОБУЖДЕНИЯ, А НЕ ОТ ЧАСОВ В КОДЕ.

   Сначала три окна были прибиты к часам: утро 08–13, день 13–18, вечер
   18–22. Для человека, который встаёт в шесть, это неверно: он на ногах
   два часа, а приложение молчит, — и наоборот, кто ложится за полночь,
   остаётся без вечера. Владелец сказал прямо: начал день в шесть —
   первый сигнал в шесть-семь.

   Поэтому день отмеряется тихим часом: тишина кончилась — день начался,
   тишина началась — день кончился. Всё, что между, делится на три равные
   части. Тихий час выключен — остаётся прежнее время бодрствования, с
   восьми утра до десяти вечера.

   Отсюда само собой выходит и то, ради чего всё затевалось: в тишину
   ничего не назначается, потому что её нет в сутках, которые мы делим.
   Вырезать её отдельно больше не нужно.

   Время у каждого своё: тихий час хранится у человека, и в расчёт
   входит он же. Чужой распорядок на мой день не влияет. */

const DEFAULT_AWAKE = { start: 8 * 60, end: 22 * 60 };

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Сколько человек на ногах: от конца тишины до её начала. */
export function awakeSpan(quiet) {
  if (!quiet || quiet.on === false) return { ...DEFAULT_AWAKE };

  const start = minutesOf(quiet.until);   // проснулся
  const end = minutesOf(quiet.from);      // лёг
  // Равные границы — «тихо никогда», то же правило, что в напоминаниях
  if (start === null || end === null || start === end) return { ...DEFAULT_AWAKE };

  let span = end - start;
  if (span < 0) span += 1440;             // тишина через полночь — обычный случай
  return { start, end: start + span };
}

/* Три окна внутри времени бодрствования. Имена прежние — утро, день,
   вечер: по ним их знают и экран, и напоминания. */
export function dayWindows(quiet) {
  const { start, end } = awakeSpan(quiet);
  const part = Math.floor((end - start) / 3);

  return {
    morning: { from: start, to: start + part },
    day: { from: start + part, to: start + part * 2 },
    evening: { from: start + part * 2, to: end }
  };
}

/* Три времени внутри окна: по одному в каждой трети.

   Сначала все три бросались куда угодно внутри окна. Выходило, что у
   человека, встающего в шесть, первый сигнал мог прийти к полудню — а
   он ждёт его утром, как и сказал владелец: начал день в шесть —
   первый звонок в шесть-семь.

   Поэтому окно делится на столько частей, сколько моментов, и в каждой
   части бросается своё время. Случайность остаётся — угадать час
   по-прежнему нельзя, — но моменты не слипаются в одном краю и не
   оставляют половину дня пустой.

   Разрыв между соседними всё равно проверяется: при коротком окне части
   малы, и два броска могли бы оказаться рядом. */
export function pickMoments(window, count = PER_WINDOW, gap = MIN_GAP_MINUTES, dice) {
  if (count <= 0) return [];

  const span = window.to - window.from;
  if (span <= 0) return [];

  const part = span / count;
  const times = [];

  for (let i = 0; i < count; i++) {
    const from = window.from + part * i;
    let at = Math.floor(from + dice(Math.max(1, Math.floor(part))));

    // Не ближе gap к предыдущему и не дальше конца окна
    if (times.length > 0) at = Math.max(at, times[times.length - 1] + gap);
    at = Math.min(at, window.to);

    times.push(at);
  }

  return times;
}

/* РУЧНОЙ ЗВОНОК ДВИГАЕТ ТОЛЬКО ТО, ЧТО ПОСЛЕ НЕГО, И НЕ ВЫПУСКАЕТ МОМЕНТЫ ИЗ ОКНА ФАЗЫ.

   У дня есть три окна — утро, день, вечер, — и в каждом по три момента.
   Окно задано чётко: утренние моменты работают с одного часа по другой и
   не могут оказаться днём. Это строение дня, и звонок его не отменяет.

   Человек называет час, когда хочет, чтобы его окликнули. Правило такое:

     — что было ДО звонка, стоит как стояло: то уже прошло или не его дело;
     — фаза, в которой звонок попал, пересчитывается ТОЛЬКО ПОСЛЕ него:
       оставшиеся в ней моменты раскладываются заново между звонком (плюс
       положенный промежуток) и концом этого же окна;
     — фазы, что целиком позже, не трогаются: у них своё окно, и оно
       само даёт нужный промежуток от звонка.

   ЭТО ОТМЕНЯЕТ ПРАВИЛО ВЫКЛАДКИ 115, и вот почему. Тогда звонок задавал
   «начало дня»: ВСЕ девять моментов выстраивались после него, в обход
   окон. Звонок в 15:49 превращал утренние 07:23, 09:36 и 11:00 в 16:52,
   17:12 и 17:48 — «утро» вечером. Владелец увидел это на телефоне и
   сказал: должны меняться только те, что идут после названного времени, а
   у каждой фазы должен быть чётко заданный промежуток. До 115-й так и было,
   и владелец тогда просил обратного; последнее слово за ним, а замок
   (test/budilnik-ne-lomat.test.js, поломка 9) переписан вместе с этим.

   Места нет — моменты остаются как были: окно кончилось раньше, чем
   нужная пауза после звонка. Выпустить их за окно хуже, чем оставить
   близко к звонку.

   Промежуток между моментами сжимается, но не ниже минуты: узкий остаток
   окна не должен слепить моменты в одно время.

   Ручного часа нет — всё остаётся как было: моменты расходятся по дню
   сами, от пробуждения до отбоя. */
function posleZvonka(moments, anchorMinutes, windows, awake, dice) {
  if (moments.length === 0) return moments;

  /* День, переходящий за полночь (встал в 14:00, лёг в 03:00): звонок в
     00:30 — это поздний вечер, а не раннее утро. Без этого он выпал бы
     «до дня» и ничего не сдвинул. */
  const звонок = anchorMinutes < awake.start && anchorMinutes + 1440 <= awake.end
    ? anchorMinutes + 1440
    : anchorMinutes;

  // Время момента на оси окна: после полуночи это уже «следующие» сутки
  const наОси = (at, window) => {
    const минуты = toMinutes(at);
    return минуты < window.from ? минуты + 1440 : минуты;
  };

  const новые = new Map();

  for (const [slot, window] of Object.entries(windows)) {
    // Окно целиком до звонка — оно уже прошло
    if (window.to <= звонок) continue;
    // Окно начинается далеко после звонка — звонок его не касается
    if (window.from >= звонок + MIN_GAP_MINUTES) continue;

    const после = moments
      .filter(m => m.slot === slot)
      .map(m => ({ m, at: наОси(m.at, window) }))
      .filter(x => x.at > звонок)
      .sort((a, b) => a.at - b.at);

    if (после.length === 0) continue;

    const от = Math.max(window.from, звонок + MIN_GAP_MINUTES);
    const место = window.to - от;
    if (место < 0) continue;   // окно кончилось раньше, чем нужная пауза

    const зазор = после.length > 1
      ? Math.max(1, Math.min(MIN_GAP_MINUTES, Math.floor(место / (после.length - 1))))
      : MIN_GAP_MINUTES;

    const времена = pickMoments({ from: от, to: window.to }, после.length, зазор, dice);
    после.forEach((x, i) => новые.set(x.m.id, времена[i]));
  }

  return moments.map(m => (новые.has(m.id)
    ? { ...m, at: hhmm(новые.get(m.id) % 1440) }
    : m));
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
 * @param {string} [anchorAt] час, назначенный человеком вручную: моменты ПОСЛЕ
 *                            него в той же фазе раскладываются заново, а
 *                            всё, что до него, остаётся как было
 */
export function localDay(dateKey, person = '', quiet = null, anchorAt = '') {
  /* В зерно идёт не сама запись о тишине, а то, что из неё вышло:
     границы бодрствования. Иначе «с 9:00 до 9:00» (тихо никогда) дало бы
     другой день, чем выключенная тишина, — хотя день тот же самый. */
  const { start, end } = awakeSpan(quiet);
  const dice = diceFrom(seedOf(`${dateKey}|${person}|${start}-${end}`));
  const arcana = dice(ARCANA_COUNT) + 1;

  const moments = Object.entries(dayWindows(quiet)).flatMap(([slot, window]) =>
    pickMoments(window, PER_WINDOW, MIN_GAP_MINUTES, dice).map((at, i) => ({
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

  /* Проверяем число, а не null: toMinutes на пустой строке отдаёт NaN,
     и сравнение с null пропускало пустой час дальше. */
  const ручной = toMinutes(anchorAt);
  const готовые = Number.isFinite(ручной)
    ? posleZvonka(moments, ручной, dayWindows(quiet), { start, end }, dice)
    : moments;

  // Пометка для экрана и для нас: день посчитан на месте, сервера не было
  return { date: dateKey, arcana, moments: готовые, offline: true };
}

/* Пересчитать времена у готового дня — хоть своего, хоть серверного.

   Серверу про тихий час неизвестно: он раздаёт одно расписание на все
   устройства и считает его по часам из своего кода. Человек же вправе
   спать до десяти или вставать в пять, и времена обязаны следовать за
   ним. Поэтому содержимое дня — аркан, фразы, картинки, отметки
   «прожито» — остаётся серверным, а времена пересчитываются здесь.

   Моменты не создаются и не удаляются: сколько их пришло в каждой фазе,
   столько и остаётся, с теми же именами. Меняется только час. */
export function retime(day, dateKey, person = '', quiet = null, anchorAt = '') {
  if (!day || !Array.isArray(day.moments) || day.moments.length === 0) return day;

  const { start, end } = awakeSpan(quiet);
  const dice = diceFrom(seedOf(`${dateKey}|${person}|${start}-${end}`));
  const windows = dayWindows(quiet);

  const moments = [];
  for (const [slot, window] of Object.entries(windows)) {
    const svoi = day.moments.filter(m => m.slot === slot);
    if (svoi.length === 0) continue;

    const times = pickMoments(window, svoi.length, MIN_GAP_MINUTES, dice);
    svoi.forEach((m, i) => moments.push({ ...m, at: hhmm(times[i] % 1440) }));
  }

  // Моменты без известной фазы (вдруг сервер добавит новую) не теряем
  const known = new Set(Object.keys(windows));
  for (const m of day.moments) if (!known.has(m.slot)) moments.push(m);

  moments.sort((a, b) => a.at.localeCompare(b.at));

  const ручной = toMinutes(anchorAt);
  return {
    ...day,
    moments: Number.isFinite(ручной)
      ? posleZvonka(moments, ручной, windows, { start, end }, dice)
      : moments
  };
}
