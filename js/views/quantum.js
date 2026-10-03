/* Экран «Квант» — пульт управления реальностью.

   Содержание задаёт администратор, человек его не меняет. Здесь только
   проживание момента: мудра утром, удержание кнопки днём, выдох вечером.

   Про батарею: ни одного вечного таймера. Один setTimeout до ближайшего
   момента, и во время удержания — отсчёт раз в секунду, ровно восемь раз. */

import { state, t, $, h, fill, changed } from '../store.js';
import { API_BASE } from '../config.js';
import { getMeta } from '../db.js';
import {
  HOLD_SECONDS, colorOfDay, arcanaRoman, arcanaKey, groupBySlot,
  livedCount, activeMoment, nextMoment, timeNow, msUntil
} from '../core/quantum.js';
import { todayKey } from '../core/dates.js';
import { localMedia, warmUp } from '../core/media.js';

let wakeTimer = null;
let holdTimer = null;
let holdCount = 0;

/* ---------- Связь с сервером ---------- */

async function api(path, options = {}) {
  const token = await getMeta('token');
  const res = await fetch(API_BASE + path, {
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

export async function loadQuantum() {
  if (!API_BASE) { state.quantum = null; return; }
  try {
    state.quantum = await api('/api/quantum/today');
    /* Картинки и звуки дня качаем сразу, пока сеть есть: момент наступит в
       зале или в метро, и тянуть файл в ту секунду будет поздно. Ждать этого
       экран не должен — поэтому без await. */
    warmUpToday(state.quantum);
  } catch {
    // Нет сети — экран покажет, что день ещё не получен; данные не теряются
    state.quantum = null;
  }
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
  if (redraw) renderQuantum();
  changed();
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
  const day = state.quantum;

  if (!day) {
    fill(card,
      h('p', { class: 'q-title', text: t('quantum.title') }),
      h('p', { class: 'muted m0', text: API_BASE ? t('quantum.notReady') : t('settings.serverOff') }));
    scheduleWake(null);
    return;
  }

  const lived = livedCount(day.moments);
  const now = timeNow();
  const active = activeMoment(day.moments, now);
  const next = nextMoment(day.moments, now);

  fill(card,
    h('div', { class: 'q-head' },
      h('div', { class: 'q-arcana' }, h('span', { text: arcanaRoman(day.arcana) })),
      h('div', {},
        h('p', { class: 'muted m0 q-label', text: t('quantum.arcana') }),
        h('p', { class: 'q-arcana-name', text: t(arcanaKey(day.arcana)) })),
      h('div', { class: 'q-lived' },
        h('b', { text: `${lived} / 9` }),
        h('span', { text: t('quantum.livedShort') }))),

    h('div', { class: 'q-bar' }, ...day.moments.map(m =>
      h('i', { class: m.doneAt ? 'done' : '' }))),

    ...groupBySlot(day.moments).map(group => h('div', { class: 'q-group' },
      h('p', { class: 'q-slot', text: t(SLOT_TITLE[group.slot]) }),
      h('div', { class: 'q-times' }, ...group.moments.map(m => h('span', {
        class: `q-time${m.doneAt ? ' done' : ''}${m === active ? ' active' : ''}`,
        text: m.at
      }))))),

    next && !active
      ? h('p', { class: 'muted q-next', text: t('quantum.next-at', { time: next.at }) })
      : null,
    h('p', { class: 'muted q-hint', text: t('quantum.hint') })
  );

  renderLive(active, day);
  scheduleWake(next);
}

/* Живая часть: то, ради чего всё. Утром и вечером — короткий экран с якорем,
   днём — блуждающая кнопка, которую надо удержать восемь секунд. */
function renderLive(active, day) {
  const live = $('quantumLive');
  stopPracticeTimers();           // старые таймеры не должны тикать за кадром
  if (!active) { live.hidden = true; live.replaceChildren(); return; }
  live.hidden = false;

  if (active.slot === 'day') {
    renderWanderButton(live, active, day);
  } else {
    const anchor = active.slot === 'morning' ? 'quantum.doneMudra' : 'quantum.doneBreath';
    live.replaceChildren(practiceScreen(active, anchor));
  }
}

/* Практика целиком задана сервером: заголовок, картинка, запись голоса,
   таймер. Пришло пусто — остаётся короткий момент с якорем, как раньше.
   Ничего из этого здесь не зашито: что прислали, то и показываем. */
function practiceScreen(moment, anchorKey) {
  const parts = [];

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

  parts.push(h('p', { class: 'q-said', text: moment.text || t(anchorKey) }));
  parts.push(h('p', { class: 'q-anchor', text: t(anchorKey) }));

  if (moment.audioUrl) {
    // Звук не играет сам: это решение человека, а не приложения
    const audio = h('audio', { class: 'q-audio', controls: true, preload: 'none', hidden: true });
    parts.push(audio);
    localMedia(moment.audioUrl).then(src => {
      if (!src) return;
      audio.src = src;
      audio.hidden = false;
    });
  }
  if (moment.durationSec > 0) parts.push(practiceTimer(moment.durationSec));

  parts.push(h('button', {
    type: 'button', class: 'btn primary', text: t('quantum.lived-it'),
    onclick: () => markDone(moment)
  }));

  return h('div', { class: 'q-overlay q-practice' }, ...parts);
}

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

const formatLeft = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

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
  live.replaceChildren(h('div', { class: 'q-field' }, button));
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

/* ОЗВУЧКА МОМЕНТА.

   Звук задаёт специалист: либо у самой фразы, либо персонально этому человеку
   на эту фазу дня. Персональный главнее — он назначен лично.

   Играем ТОЛЬКО ЗДЕСЬ, сразу после восьми секунд удержания, и это не
   случайность: браузеры глушат звук, который заводится сам, без жеста
   человека. Удержание кнопки — и есть тот жест. Попытка проиграть запись
   заранее, «к наступлению момента», кончилась бы тишиной на телефоне и
   ошибкой в консоли.

   Ничего не загружаем, пока не понадобилось: Audio создаётся в этот миг, а не
   держится в памяти весь день — телефон должен дожить до вечера. */
async function playMoment(moment) {
  const personal = state.quantum?.settings?.slots?.[moment.slot]?.audioUrl;
  const url = personal || moment.audioUrl;
  if (!url) return;
  // Берём скачанную копию: в метро по ссылке звук не достать, да и политика
  // страницы чужой адрес не пропустит
  const src = await localMedia(url);
  if (!src) return;
  try {
    const sound = new Audio(src);
    sound.play().catch(() => { /* телефон в беззвучном режиме — это нормально */ });
  } catch { /* запись не открылась — момент важнее звука */ }
}

async function finishHold(moment, day) {
  // Вибрация только после явного жеста человека и не везде есть мотор
  try { navigator.vibrate?.(200); } catch { /* нет мотора — не беда */ }
  playMoment(moment);

  const mine = state.quantum?.settings?.slots?.[moment.slot] || {};
  const live = $('quantumLive');
  live.replaceChildren(h('div', { class: 'q-overlay' },
    h('span', { class: 'q-infinity', text: '∞' }),
    h('p', { class: 'q-said', text: mine.text || moment.text || t('quantum.closed') })));

  await markDone(moment, { redraw: false });
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
  const screen = h('div', { class: 'q-chromo' },
    h('p', { class: 'q-chromo-day', text: `${t(colour.nameKey)} · ${colour.chakra}` }),
    h('p', { class: 'q-chromo-text', text: mine.text || t('quantum.warrior') }),
    h('button', {
      type: 'button', class: 'btn q-chromo-close', text: t('quantum.found'),
      onclick: () => { live.hidden = true; renderQuantum(); }
    }));
  screen.style.setProperty('background', mine.color || colour.color);
  live.replaceChildren(screen);

  setTimeout(() => {
    if (live.firstChild === screen) { live.hidden = true; renderQuantum(); }
  }, 5000);
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
  // Вернулись на вкладку — перечитываем день: момент мог наступить
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || state.view !== 'quantum') return;
    if (state.quantum?.date !== todayKey()) await loadQuantum();
    renderQuantum();
  });
}
