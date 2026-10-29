/* Экран «Квант» — пульт управления реальностью.

   Содержание задаёт администратор, человек его не меняет. Здесь только
   проживание момента: мудра утром, удержание кнопки днём, выдох вечером.

   Про батарею: ни одного вечного таймера. Один setTimeout до ближайшего
   момента, и во время удержания — отсчёт раз в секунду, ровно восемь раз. */

import { state, t, $, h, fill, changed } from '../store.js';
import { API_BASE } from '../config.js';
import { getMeta, setMeta } from '../db.js';
import {
  HOLD_SECONDS, CHROMO_SECONDS, colorOfDay, arcanaRoman, arcanaKey, groupBySlot, isOff, liveMoments,
  livedCount, plannedCount, activeMoment, nextMoment, timeNow, msUntil, localDay, retime, momentToLive
} from '../core/quantum.js';
import { mudraSvg, shouldersSvg } from './quantum-figures.js';
import {
  playMoment, playerControls, stopSound, devicePhotos, releasePhotos
} from './quantum-sound.js';
import { todayKey } from '../core/dates.js';
import { localMedia, warmUp } from '../core/media.js';
import { request } from '../core/net.js';
/* Системный будильник телефона: расписание моментов меняется отсюда,
   отсюда же его и переставляем. */
import { planReminders, loadQuiet, loadAlarm } from '../reminder-plan.js';
import { anchorHours } from '../core/reminder-rules.js';
import { DAY_RULE } from '../core/quantum.js';

let wakeTimer = null;
let holdTimer = null;
let holdCount = 0;

/* Момент, который открыли звонком (выкладка 163): показывается живым, даже если его окно вышло или
   время ещё не пришло. Держим номер, а не сам момент: день перезагружают, объекты меняются. */
let forcedId = null;

/* Идёт конец удержания: знак бесконечности и цветной экран ведёт finishHold, и перерисовка раздела
   (а она случается от любой правки) не вправе стереть их посреди показа. */
let finishing = false;

/* «АРКАН ДНЯ» — КНОПКА, И ЧИТАЕТСЯ ПО ОЧЕРЕДИ СО СВИТКОМ (выкладка 194).

   Владелец 27.10.2026: плашка выглядит как кнопка, а не нажимается — нелогично. Теперь нажатие
   прячет и показывает смысл аркана, и открыта только одна из двух кнопок: аркан или свиток
   «Мудрость дня». Кто открылся, сообщает событием страницы «kvant:reading» ({ who }), и
   открытый сосед, услышав чужое имя, закрывается сам. Модули друг друга не знают: свиток
   (views/scroll/) слушает то же событие.

   Состояние живёт здесь, а не в разметке: аркан перерисовывается целиком при каждой
   отрисовке раздела, и открытость не должна сбрасываться. */
const ЧТЕНИЕ = 'kvant:reading';
let arcanaOpen = true;

function applyArcana() {
  const plate = document.querySelector('#quantumArcana .q-plate');
  const say = document.querySelector('#quantumArcana .q-arcana-say');
  if (plate) plate.setAttribute('aria-expanded', String(arcanaOpen));
  if (say) say.classList.toggle('q-arcana-closed', !arcanaOpen);
}

function toggleArcana() {
  arcanaOpen = !arcanaOpen;
  applyArcana();
  if (arcanaOpen) document.dispatchEvent(new CustomEvent(ЧТЕНИЕ, { detail: { who: 'arcana' } }));
}

/** Открыть живой экран момента по звонку. wantedId пуст — идущий сейчас или ближайший (momentToLive). */
export function openMomentLive(wantedId = '') {
  const day = state.quantum;
  if (!day) return false;
  const moment = momentToLive(day.moments, wantedId, timeNow());
  forcedId = moment ? moment.id : null;
  renderQuantum();
  return Boolean(moment);
}

/* ---------- Связь с сервером ---------- */

async function api(path, options = {}) {
  const token = await getMeta('token');
  const res = await request(API_BASE + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/* День, сохранённый с прошлого удачного выхода на сервер.

   Моменты задаёт администратор, и день приходит только с сервера — нигде
   не оседая. В приложении без сети вкладка из-за этого всегда была пуста.
   Теперь удачно полученный день остаётся в хранилище устройства и
   показывается, пока связи нет.

   Кэш берём только за сегодня: вчерашние моменты сбили бы и отметки
   «прожито», и время ближайшего окна. */
const QUANTUM_CACHE = 'quantum_day';

async function cachedQuantum() {
  try {
    const saved = await getMeta(QUANTUM_CACHE);
    /* Кэш другого правила считается отсутствующим: день посчитан по
       алгоритму, которого больше нет (DAY_RULE в core/quantum.js). Без
       этой проверки правка времён не доезжала бы до человека до полуночи. */
    if (saved && saved.savedOn === todayKey() && saved.rule === DAY_RULE && saved.day) {
      return saved.day;
    }
  } catch {
    // Хранилище недоступно — ведём себя так, будто кэша нет
  }
  return null;
}

async function saveQuantumCache() {
  if (!state.quantum) return;
  try {
    await setMeta(QUANTUM_CACHE, { savedOn: todayKey(), rule: DAY_RULE, day: state.quantum });
  } catch {
    // Не сохранилось — не беда, в следующий раз получим день с сервера
  }
}

/* День, посчитанный на телефоне, с учётом тихого часа.

   Тихий час входит в расчёт нарочно: он не глушит назначенные моменты, а
   вырезает своё время из окон — значит и времена должны быть другими.
   Поэтому он же входит в зерно: поменял тишину — день пересобрался. */
/* ЧАС, НАЗНАЧЕННЫЙ ЧЕЛОВЕКОМ ВРУЧНУЮ.

   Он есть в окне «Режим будильника»: своё время у окна возможностей,
   своё у моментов дня. В день уходят оба: каждый выстраивает после себя
   свою фазу — утренний утро, обеденный день, вечерний вечер, — и
   следующее напоминание ждёт не через пять минут, а через положенный
   промежуток.

   Не назвал ни одного — пусто, и день расходится сам, как прежде. */
async function ruchnoyChas() {
  try {
    /* Считает чистая anchorHours (core/reminder-rules.js). Здесь стояло
       `alarm.moments ? alarm.momentsAt : ''` — чтение поля, которого с
       выкладки 116 нет: время «Архитектора» никогда не попадало в расчёт
       дня. Разбор — у anchorHours. */
    return anchorHours(await loadAlarm());
  } catch {
    return [];
  }
}

async function svoyDen() {
  return localDay(
    todayKey(), await whoAmI(),
    await loadQuiet().catch(() => null),
    await ruchnoyChas()
  );
}

/* Человек поменял тихий час — пересобираем день и переставляем будильник.

   Только свой, посчитанный на телефоне: серверный день меняет сервер, и
   трогать его здесь нельзя — он один на все устройства человека. */
export async function quietChanged() {
  if (!state.quantum) return;

  const quiet = await loadQuiet().catch(() => null);
  /* Серверному дню меняем только времена, свой пересобираем целиком:
     содержимое серверного дня принадлежит серверу, а не нам. */
  state.quantum = state.quantum.offline
    ? await svoyDen()
    : retime(state.quantum, todayKey(), await whoAmI(), quiet, await ruchnoyChas());
  renderQuantum();
  saveQuantumCache();
  planReminders().catch(err => console.warn('[напоминания]', err));
}

/* Кто сейчас в приложении. Нужен только затем, чтобы у двух человек на
   одном телефоне не совпал день, посчитанный без сервера. */
async function whoAmI() {
  try { return String((await getMeta('userId')) || ''); } catch { return ''; }
}

export async function loadQuantum() {
  /* СНАЧАЛА ПОКАЗЫВАЕМ ДЕНЬ, ПОТОМ СПРАШИВАЕМ СЕРВЕР.

     Порядок здесь важнее, чем кажется. Раньше первым шёл запрос к
     серверу, и пока он шёл — а когда сервер недоступен, это секунды
     ожидания, — на экране не было ни аркана, ни моментов. Человек видел
     пустую карточку, а через время в ней что-то появлялось само: «как
     это код может появляться не сразу?».

     Теперь день есть с первой же отрисовки: берём сохранённый, а нет —
     считаем на месте. Сервер спрашиваем следом, и если он ответил, его
     день заменяет показанный и экран перерисовывается. Ждать нечего:
     то, что видно, верно с самого начала. */
  state.quantum = (await cachedQuantum()) || await svoyDen();
  renderQuantum();

  try {
    if (!API_BASE) throw new Error('сервер не задан');
    // Сервер не ответил при запуске — не ждём его снова: остаётся показанный день
    if (state.serverDown) throw new Error('сервер недоступен');
    /* Времена серверного дня пересчитываем под тихий час этого человека.
       Сервер про его распорядок не знает: он раздаёт одно расписание на
       все устройства и считает его по своим часам. Содержимое — аркан,
       фразы, картинки, отметки «прожито» — остаётся серверным, меняется
       только час (см. retime). */
    const sday = await api('/api/quantum/today');
    state.quantum = retime(sday, todayKey(), await whoAmI(),
      await loadQuiet().catch(() => null), await ruchnoyChas());

    /* Картинки и звуки дня качаем сразу, пока сеть есть: момент наступит в
       зале или в метро, и тянуть файл в ту секунду будет поздно. Ждать этого
       экран не должен — поэтому без await. */
    warmUpToday(state.quantum);
    renderQuantum();
  } catch {
    // Сервера нет — остаёмся на том дне, который уже показан
  }
  saveQuantumCache();
  /* Пришёл новый день — пришли и новые времена моментов. Расписание в
     системном будильнике должно идти следом за данными, иначе телефон
     звонил бы по вчерашним временам. Ставится здесь, в одной точке, а не
     у каждого, кто зовёт loadQuantum. */
  planReminders().catch(err => console.warn('[напоминания]', err));
}

function warmUpToday(day) {
  if (!day) return;
  const urls = [];
  for (const m of day.moments || []) urls.push(m.imageUrl, m.audioUrl);
  for (const s of Object.values(day.settings?.slots || {})) urls.push(s.imageUrl, s.audioUrl);
  const weekday = day.settings?.weekday;
  if (weekday) urls.push(weekday.imageUrl, weekday.audioUrl);
  warmUp(urls).catch(() => {});
}

/* Отметка «прожито».

   redraw=false нужен, когда отметка ставится в конце удержания: там на экране
   уже показан знак бесконечности, и перерисовка стирала бы его в тот же миг.
   Экран в этом случае ведёт finishHold — он сам решает, что показать дальше. */
async function markDone(moment, { redraw = true } = {}) {
  moment.doneAt = new Date().toISOString();
  if (moment.id === forcedId) forcedId = null;
  // Прожитый момент больше не звонит: снимаем его будильник (выкладка 163 — прожили раньше срока)
  planReminders().catch(err => console.warn('[напоминания]', err));
  if (redraw) renderQuantum();
  changed();
  saveQuantumCache();   // отметка переживёт закрытие приложения без сети
  try {
    await api(`/api/quantum/moments/${moment.id}/done`, { method: 'POST', body: '{}' });
  } catch {
    // Отметка переживёт сбой сети: сервер узнает о ней при следующем открытии дня
  }
}

/* ---------- Экран ---------- */

const SLOT_TITLE = { morning: 'quantum.morning', day: 'quantum.day', evening: 'quantum.evening' };

export function renderQuantum() {
  const card = $('quantumCard');
  // Экран могли ещё не построить: загрузка дня идёт раньше отрисовки
  if (!card) return;
  const day = state.quantum;

  if (!day) {
    fill(card,
      h('p', { class: 'q-title', text: t('quantum.title') }),
      h('p', { class: 'muted m0', text: API_BASE ? t('quantum.notReady') : t('settings.serverOff') }));
    scheduleWake(null);
    return;
  }

  const lived = livedCount(day.moments);
  const planned = plannedCount(day.moments);
  const now = timeNow();
  const active = activeMoment(day.moments, now);
  const next = nextMoment(day.moments, now);

  /* АРКАН ДНЯ ЖИВЁТ НА ГЛАВНОЙ, А НЕ ВНУТРИ ЧАСТИ.

     Прежде он открывал карточку «Архитектора», и увидеть знак дня можно
     было только зайдя в раздел. Но это не содержимое раздела — это то,
     чем сегодняшний день начинается, и место ему там, где пульт ещё
     ничей: под двумя погашенными кнопками, рядом с опытом.

     Заодно это занимает пустоту, которая оставалась там на телефоне.

     Рисуется в своё поле на главной; если поля в разметке нет, аркан
     просто не показывается, а карточка собирается как прежде. */
  const arcanaBox = $('quantumArcana');
  if (arcanaBox) {
    fill(arcanaBox,
      h('div', { class: 'q-head' },
        // Аркан — медальон на своей пластине, а не полоса во всю ширину. Пластина — кнопка:
        // прячет и показывает смысл аркана (выкладка 194)
        h('button', {
          type: 'button', class: 'q-plate', onclick: toggleArcana,
          'aria-expanded': String(arcanaOpen), 'aria-controls': 'quantumArcanaSay'
        },
          h('div', { class: 'q-arcana' }, h('span', { text: arcanaRoman(day.arcana) })),
          h('div', { class: 'q-plate-text' },
            h('p', { class: 'muted m0 q-label', text: t('quantum.arcana') }),
            h('p', { class: 'q-arcana-name', text: t(arcanaKey(day.arcana)) }))),

        /* Справа от плашки — о чём этот аркан и пожелание к нему. Обе
           строки берутся по номеру аркана, как и его название. */
        h('div', { class: `q-arcana-say${arcanaOpen ? '' : ' q-arcana-closed'}`, id: 'quantumArcanaSay' },
          h('p', { class: 'q-arcana-day', text: t(`${arcanaKey(day.arcana)}.day`) }),
          h('p', { class: 'q-arcana-wish', text: t(`${arcanaKey(day.arcana)}.wish`) }))));
  }

  fill(card,
    /* Счёт прожитого встал в один ряд с точками: на телефоне он занимал
       правый край шапки и поджимал название аркана до многоточия. */
    h('div', { class: 'q-bar-row' },
      h('div', { class: 'q-bar' }, ...liveMoments(day.moments).map(m =>
        h('i', { class: m.doneAt ? 'done' : '' }))),
      h('div', { class: 'q-lived' },
        h('b', { text: `${lived} / ${planned}` }),
        h('span', { text: t('quantum.livedShort') }))),

    ...groupBySlot(day.moments).map(group => h('div', { class: 'q-group' },
      h('p', { class: 'q-slot', text: t(SLOT_TITLE[group.slot]) }),
      h('div', { class: 'q-times' }, ...group.moments.map(m => momentChip(m, active))))),

    next && !active
      ? h('p', { class: 'muted q-next', text: t('quantum.next-at', { time: next.at }) })
      : null,
    h('p', { class: 'muted q-hint', text: t('quantum.hint') }),
    h('p', { class: 'muted q-hint', text: t('quantum.offHint') })
  );

  renderLive(active, day);
  scheduleWake(next);
}

/* Квадратик времени с крестиком.

   Крестик гасит момент: сегодня сигнал не придёт, а завтра в этой фазе времён
   будет на одно меньше. Нажатие на погашенное время возвращает его обратно.
   У прожитого момента крестика нет — выключать то, что уже случилось, нечего. */
function momentChip(moment, active) {
  const mark = ['q-time'];
  if (isOff(moment)) mark.push('off');
  else if (moment.doneAt) mark.push('done');
  else if (moment === active) mark.push('active');

  const chip = h('div', { class: mark.join(' ') },
    h('span', { class: 'q-time-at gold-cut', text: moment.at }));

  if (!moment.doneAt) {
    const key = isOff(moment) ? 'quantum.turnOn' : 'quantum.turnOff';
    chip.append(h('button', {
      type: 'button', class: 'q-time-off', text: isOff(moment) ? '+' : '×',
      title: t(key), 'aria-label': `${t(key)} — ${moment.at}`,
      onclick: () => toggleOff(moment)
    }));
  }
  return chip;
}

/* Выключение живёт на сервере: расписание приходит оттуда, и завтрашний день
   строит он же. Экран показывает новое состояние сразу, не дожидаясь ответа, —
   а если сервер не ответил, возвращает как было: обещать выключение, которого
   на самом деле нет, хуже, чем показать отказ. */
async function toggleOff(moment) {
  const off = !isOff(moment);
  const before = moment.offAt;
  moment.offAt = off ? new Date().toISOString() : null;
  renderQuantum();
  changed();
  try {
    await api(`/api/quantum/moments/${moment.id}/off`, {
      method: 'POST', body: JSON.stringify({ off })
    });
  } catch {
    moment.offAt = before;
    renderQuantum();
    changed();
  }
  /* Крестик гасит момент ЗАРАНЕЕ, до его времени, — значит, в системном
     будильнике он ещё стоит и позвонит, если его оттуда не убрать.
     Переставляем расписание в обе стороны: и когда момент погасили, и
     когда вернули плюсиком обратно. */
  planReminders().catch(err => console.warn('[напоминания]', err));
}

/* Живая часть: то, ради чего всё. Утром и вечером — короткий экран с якорем,
   днём — блуждающая кнопка, которую надо удержать восемь секунд. */
function renderLive(active, day) {
  if (finishing) return;          // конец удержания ведёт finishHold
  const live = $('quantumLive');
  stopPracticeTimers();           // старые таймеры не должны тикать за кадром
  releasePhotos(screenOwner);     // снимки прежнего экрана; новому — свой владелец
  screenOwner = { urls: [], dead: false };

  // Открытый звонком момент главнее идущего по времени; прожитый или погашенный — забывается
  const forced = forcedId
    ? day.moments.find(m => m.id === forcedId && !m.doneAt && !isOff(m))
    : null;
  if (forcedId && !forced) forcedId = null;

  const moment = forced || active;
  if (!moment) { live.hidden = true; live.replaceChildren(); return; }
  live.hidden = false;

  if (moment.slot === 'day') {
    renderWanderButton(live, moment, day);
  } else {
    const anchor = moment.slot === 'morning' ? 'quantum.doneMudra' : 'quantum.doneBreath';
    live.replaceChildren(practiceScreen(moment, anchor));
  }

  // Звонком открыли — из практики можно выйти, не отмечая момент прожитым
  if (forced) {
    live.append(h('button', {
      type: 'button', class: 'q-live-close', text: '×', 'aria-label': t('quantum.liveClose'),
      onclick: () => { forcedId = null; stopSound(); renderQuantum(); }
    }));
  }
}

/* Рисунок практики из готовой строки SVG (web/js/views/quantum-figures.js). */
function figure(svg) {
  const box = h('div', { class: 'q-fig-box' });
  box.innerHTML = svg;
  return box;
}

/* Практика целиком задана сервером: заголовок, картинка, запись голоса,
   таймер. Пришло пусто — остаётся короткий момент с якорем, как раньше.
   Ничего из этого здесь не зашито: что прислали, то и показываем. */
function practiceScreen(moment, anchorKey) {
  const parts = [];
  /* Своё у человека главнее общего: специалист настраивает текст и запись на каждую фазу дня
     (кабинет администратора → Квантовый кабинет). Так же выбирает их finishHold. */
  const mine = state.quantum?.settings?.slots?.[moment.slot] || {};

  /* УТРОМ — МУДРА, ВЕЧЕРОМ — ВЫДОХ С ОПУЩЕННЫМИ ПЛЕЧАМИ (выкладка 163, просьба владельца
     19.10.2026): на экране рисунок, как сложить пальцы и что сделать телом, а под ним то, что
     человек хочет услышать или прочитать. */
  if (moment.slot === 'morning') {
    parts.push(figure(mudraSvg()));
    parts.push(h('p', { class: 'q-cue', text: t('quantum.mudraName') }));
    parts.push(h('p', { class: 'q-howto', text: t('quantum.mudraHow') }));
  } else if (moment.slot === 'evening') {
    parts.push(figure(shouldersSvg()));
    parts.push(h('p', { class: 'q-cue', text: t('quantum.breathCue') }));
    parts.push(h('p', { class: 'q-howto', text: t('quantum.breathThink') }));
  }

  /* Картинка и звук берутся с устройства: политика страницы не пропускает
     чужой адрес в src, да и в метро его было бы не скачать. Пока файл ищется
     в хранилище, место под него не занимаем — он появится сам. */
  if (moment.imageUrl) {
    const img = h('img', {
      class: 'q-image', alt: moment.title || '',
      loading: 'lazy', hidden: true, onerror: e => { e.target.hidden = true; }
    });
    parts.push(img);
    localMedia(moment.imageUrl).then(src => {
      if (!src) return;
      img.src = src;
      img.hidden = false;
    });
  }
  if (moment.title) parts.push(h('p', { class: 'q-practice-title', text: moment.title }));

  parts.push(h('p', { class: 'q-said', text: mine.text || moment.text || t(anchorKey) }));
  // Подсказка про мудру или выдох уже есть над текстом — повторять её здесь незачем
  if (!figureShown(moment)) parts.push(h('p', { class: 'q-anchor', text: t(anchorKey) }));

  // Снимки с этого устройства (раздел «Администратор») — поверх ссылок
  const photos = h('div', { class: 'q-photos' });
  parts.push(photos);
  const own = screenOwner;
  devicePhotos(moment.slot, own).then(urls => {
    for (const src of urls) photos.append(h('img', { class: 'q-image', alt: '', src }));
  });

  // «Воспроизвести» и «Стоп» — на каждом экране практики, всегда (views/quantum-sound.js)
  parts.push(playerControls(moment));
  if (moment.durationSec > 0) parts.push(practiceTimer(moment.durationSec));

  parts.push(h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => markDone(moment)
  }, h('span', { class: 'gold-cut', text: t('quantum.lived-it') })));

  return h('div', { class: 'q-overlay q-practice' }, ...parts);
}

const figureShown = moment => moment.slot === 'morning' || moment.slot === 'evening';

/* Таймер практики. Тикает раз в секунду и только пока практика открыта:
   закрыли экран — таймер снимается вместе с ним. */
function practiceTimer(seconds) {
  const left = h('span', { class: 'q-timer-left', text: formatLeft(seconds) });
  let rest = seconds;
  let timer = null;

  const stop = () => { clearInterval(timer); timer = null; };
  const button = h('button', { type: 'button', class: 'btn', text: t('quantum.startTimer') });
  button.addEventListener('click', () => {
    if (timer) { stop(); button.textContent = t('quantum.startTimer'); return; }
    button.textContent = t('quantum.stopTimer');
    timer = setInterval(() => {
      rest -= 1;
      left.textContent = formatLeft(rest);
      if (rest <= 0) {
        stop();
        button.textContent = t('quantum.startTimer');
        try { navigator.vibrate?.(200); } catch { /* нет мотора — не беда */ }
      }
    }, 1000);
  });

  practiceTimers.push(stop);
  return h('div', { class: 'q-timer' }, left, button);
}

const practiceTimers = [];
const stopPracticeTimers = () => { while (practiceTimers.length) practiceTimers.pop()(); };

/* Снимки, добавленные в разделе «Администратор» на этом устройстве (выкладка 165, js/support.js), и запись к
   ним (views/quantum-sound.js). Адреса снимков принадлежат ЭКРАНУ, который их показывает: убрали экран —
   освободили (releasePhotos). Прежде они освобождались одним общим списком, и поздно пришедший ответ
   старого экрана стирал адреса нового: на экране не было ни снимка, ни звука. */
let screenOwner = { urls: [], dead: false };

/* Кнопка появляется в случайном месте — её нельзя ждать в одной точке.

   МЕСТО ЗАПОМИНАЕТСЯ ЗА МОМЕНТОМ и больше не меняется. Раньше координаты
   бросались заново при каждой перерисовке экрана, а перерисовка случается и
   во время удержания — кнопка уезжала из-под пальца, и попасть по ней
   второй раз было делом удачи. Новое место — только у нового момента. */
const spotOf = new Map();

function spotFor(momentId) {
  if (!spotOf.has(momentId)) {
    spotOf.set(momentId, {
      x: 6 + Math.random() * 52,             // проценты, чтобы не вылезти за край
      y: 10 + Math.random() * 60
    });
  }
  return spotOf.get(momentId);
}

function renderWanderButton(live, moment, day) {
  const { x, y } = spotFor(moment.id);
  /* На кнопке висит только нажатие. Отпускание слушается на окне (startHold).

     Раньше здесь были ещё pointerup, pointercancel и pointerleave — и
     удержание отменялось само, не дожив до второй секунды: startHold
     перерисовывал экран целиком, кнопка исчезала из-под пальца, браузер
     считал, что указатель покинул элемент, и слал leave прямо в отмену.
     Снаружи это выглядело так, будто кнопка не работает вовсе. */
  const button = h('button', {
    type: 'button', class: 'q-teleport',
    onpointerdown: e => startHold(e, moment, day)
  },
    h('span', { class: 'q-teleport-text', text: t('quantum.teleport') }),
    h('span', { class: 'q-teleport-hold', text: t('quantum.hold') }));
  button.style.setProperty('left', `${x}%`);
  button.style.setProperty('top', `${y}%`);
  live.replaceChildren(h('div', { class: 'q-field' }, button), h('div', { class: 'q-live-player' }, playerControls(moment)));
}

function startHold(event, moment, day) {
  event.preventDefault();
  if (holdTimer) return;
  holdCount = 0;

  /* Счёт показываем ПОВЕРХ поля, не стирая кнопку: палец всё это время лежит
     на ней, и убирать из-под него элемент нельзя. */
  const live = $('quantumLive');
  const overlay = holdScreen(1);
  live.appendChild(overlay);
  const counter = overlay.querySelector('.q-count');

  // Отпустить могут где угодно — палец за восемь секунд успевает съехать с
  // кнопки, а на телефоне ещё и прокрутить экран
  window.addEventListener('pointerup', cancelHold);
  window.addEventListener('pointercancel', cancelHold);

  holdTimer = setInterval(() => {
    holdCount += 1;
    if (holdCount >= HOLD_SECONDS) {
      stopHold();
      finishHold(moment, day);
    } else {
      counter.textContent = String(holdCount + 1);
    }
  }, 1000);
}

/* Кольцо заполняется ровно за время удержания. Цифры остались внутри —
   по ним видно, сколько осталось, — но главное теперь само кольцо: оно
   растёт плавно, а не скачет раз в секунду. */
function holdScreen(count) {
  const ring = h('div', { class: 'q-ring q-ring-live' }, h('span', { class: 'q-count', text: String(count) }));
  ring.style.setProperty('--hold', `${HOLD_SECONDS}s`);
  return h('div', { class: 'q-overlay' },
    ring,
    h('p', { class: 'q-said', text: t('quantum.holding') }),
    h('button', { type: 'button', class: 'btn', text: t('quantum.release'), onclick: cancelHold }));
}

// Остановить счёт и снять слушателей окна — одним местом, чтобы они не
// копились от удержания к удержанию
function stopHold() {
  clearInterval(holdTimer);
  holdTimer = null;
  holdCount = 0;
  window.removeEventListener('pointerup', cancelHold);
  window.removeEventListener('pointercancel', cancelHold);
}

// Отпустили раньше восьми секунд — ничего не засчитано, следа не остаётся
function cancelHold() {
  if (!holdTimer) return;
  stopHold();
  renderQuantum();
}

async function finishHold(moment, day) {
  finishing = true;
  // Страховка: что бы ни случилось с показом, через положенное время раздел снова рисуется
  setTimeout(() => {
    finishing = false;
    document.body.classList.remove('q-chromo-on');
  }, 1400 + CHROMO_SECONDS * 1000 + 1000);
  // Вибрация только после явного жеста человека и не везде есть мотор
  try { navigator.vibrate?.(200); } catch { /* нет мотора — не беда */ }
  playMoment(moment);   // результат не нужен: причина сбоя уйдёт в журнал сбоев сама

  const mine = state.quantum?.settings?.slots?.[moment.slot] || {};
  const live = $('quantumLive');
  live.replaceChildren(h('div', { class: 'q-overlay' },
    h('span', { class: 'q-infinity', text: '∞' }),
    h('p', { class: 'q-said', text: mine.text || moment.text || t('quantum.closed') })));

  /* Отметка уходит на сервер сама, а цветной экран не ждёт ответа: на медленной связи знак
     бесконечности висел до ответа сервера и цвет не показывался вовсе (выкладка 163). Локально
     момент уже прожит (doneAt), и сервер узнает о нём при следующем открытии дня. */
  markDone(moment, { redraw: false }).catch(err => console.warn('[момент] отметка не ушла:', err));
  setTimeout(() => showChromo(day), 1400);
}

/* Хромотерапия: экран заливается цветом дня на несколько секунд.
   Сам закрывается — держать его дольше незачем.

   Цвет и текст могут быть ПЕРСОНАЛЬНЫМИ: специалист настраивает их человеку
   на каждый день недели (кабинет администратора → Квантовый кабинет). Нет
   настройки — остаётся общий цвет чакры дня, и это обычный случай. */
function showChromo(day) {
  const colour = colorOfDay(day.date);
  const mine = state.quantum?.settings?.weekday || {};
  const live = $('quantumLive');
  live.hidden = false;

  /* ТОЛЬКО ЦВЕТ (выкладка 163). Владелец 19.10.2026: «на экране не должно быть никаких надписей,
     только цвет на весь экран, и вдвое дольше». Ни названия цвета, ни текста, ни кнопки: касанием
     экран закрывается раньше срока. Цвет — персональный от специалиста, иначе цвет чакры дня
     (по дню недели; с понедельника красный). Фраза «найди этот цвет вокруг» осталась в словаре. */
  const закрыть = () => {
    // Класс снимается при любом исходе, даже если экран уже заменён: иначе панель «Стоп» осталась бы спрятанной
    document.body.classList.remove('q-chromo-on');
    if (live.firstChild !== screen) return;
    finishing = false;
    live.hidden = true;
    renderQuantum();
  };
  const screen = h('div', { class: 'q-chromo', onclick: закрыть, 'aria-label': t(colour.nameKey) });
  screen.style.setProperty('background', mine.color || colour.color);
  live.replaceChildren(screen);
  /* Запись, начатая после удержания, идёт дальше, а панель «Звучит запись — Стоп» на цветном экране прячется:
     на нём не должно быть ни надписей, ни кнопок. Панель вернётся, когда экран закроется. */
  document.body.classList.add('q-chromo-on');

  setTimeout(закрыть, CHROMO_SECONDS * 1000);
}

/* Пробуждение к следующему моменту: один таймер вместо опроса.
   Когда ничего не происходит — не происходит ничего. */
function scheduleWake(next) {
  clearTimeout(wakeTimer);
  if (!next) return;
  const wait = msUntil(next.at);
  if (wait <= 0 || wait > 6 * 3600 * 1000) return;   // мимо суток не ставим
  wakeTimer = setTimeout(() => {
    if (state.view === 'quantum') renderQuantum();
  }, wait + 500);
}

export function initQuantum() {
  // Открылся свиток (или другая кнопка чтения) — смысл аркана прячется: читается одно (выкладка 194)
  document.addEventListener(ЧТЕНИЕ, событие => {
    if (событие.detail?.who === 'arcana' || !arcanaOpen) return;
    arcanaOpen = false;
    applyArcana();
  });

  // Вернулись на вкладку — перечитываем день: момент мог наступить
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;

    /* ДЕНЬ ПЕРЕЧИТЫВАЕМ НА ЛЮБОЙ ВКЛАДКЕ, а не только на «Кванте».
       Приложение, пережившее полночь, держит вчерашний день, и расписание
       звонков строилось по нему (в ночь на 17.10.2026 это дало девять
       звонков-призраков). Человек мог вернуться и на «День», и на «Деньги».
       Загрузка кончается перестановкой расписания, так что оно тоже
       освежается. День, которого ещё не было вовсе, на чужих вкладках не
       грузим: ему там нечем быть нужным. */
    const устарел = state.quantum?.date && state.quantum.date !== todayKey();
    if (устарел) await loadQuantum();

    if (state.view !== 'quantum') return;
    if (state.quantum?.date !== todayKey()) await loadQuantum();
    renderQuantum();
  });
}
