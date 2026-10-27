/* Свиток «Мудрость дня» на главной, под «Арканом дня».

   Единственная точка стыковки с Ежедневником. Всё остальное — логика
   (engine.js), подписи (texts.js), база посланий (predictions.json) и вид
   (scroll.css) — лежит рядом в этой папке и наружу не выходит.

   Из app.js вызываются ровно две функции: initScroll() один раз при старте
   и syncScroll() на каждый render().

   Про батарею: никаких вечных таймеров. Один setTimeout до полуночи, чтобы
   свиток сменился ровно в 00:00, и короткая цепочка таймеров во время
   самой анимации развязывания. */

import { state } from '../../store.js';
import { getMeta, setMeta } from '../../db.js';
import { dayKey, msToMidnight, pickIndex, normalize, textOf, isOpenToday } from './engine.js';
import { textsFor } from './texts.js';

const HOST_ID = 'dailyScroll';
const META_KEY = 'dailyScroll';
const DATA_URL = new URL('./predictions.json', import.meta.url).href;

/* Шаги развязывания: сколько длится каждый, в миллисекундах. Те же числа
   стоят в scroll.css у переходов — меняются парой. */
const STEPS = [
  ['ds-untie', 450],   // ленточка с бантиком развязывается и исчезает
  ['ds-turn', 650],    // свиток поворачивается в горизонталь
  ['ds-wide', 500],    // вытягивается во всю ширину
  ['ds-unroll', 850]   // разворачивается, открывая послание
];

let base = null;          // послания, уже приведённые к { ru, uk, en }
let loading = null;
let drawn = '';           // что нарисовано: дата|язык|человек|размер базы
let busy = false;         // идёт анимация — перерисовка её не обрывает
let midnightTimer = null;

/* ---------- Язык ---------- */

/* Свиток говорит на языке Ежедневника, своего переключателя не показывает. */
function currentLang() {
  const raw = String(state.language || 'ru').slice(0, 2).toLowerCase();
  if (raw === 'ua') return 'uk';
  return ['ru', 'uk', 'en'].includes(raw) ? raw : 'ru';
}

/* ---------- База посланий ---------- */

/* Грузится один раз. Не загрузилась (нет сети и нет в запасе) — пробуем
   снова при следующей отрисовке, а свиток пока не показываем. */
function loadBase() {
  if (base) return Promise.resolve(base);
  if (!loading) {
    loading = fetch(DATA_URL)
      .then(res => { if (!res.ok) throw new Error(`база посланий: ${res.status}`); return res.json(); })
      .then(raw => (base = normalize(raw)))
      .catch(() => { loading = null; return []; });
  }
  return loading;
}

/* ---------- Разметка ---------- */

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function build(prediction, lang, open) {
  const tx = textsFor(lang);

  const root = el('section', 'ds');
  root.lang = lang === 'uk' ? 'uk' : lang;

  // Сцена: сам свиток и плашка под ним. Пока свиток завязан, сцена — кнопка.
  const stage = el('div', 'ds-stage');
  const scroll = el('div', 'ds-scroll');
  const paper = el('div', 'ds-paper');
  const inner = el('div', 'ds-paper-in');
  inner.append(
    el('p', 'ds-heading', tx.title),
    el('p', 'ds-text', textOf(prediction, lang)),
    el('p', 'ds-note', tx.note));
  paper.append(inner);

  const ribbon = el('span', 'ds-ribbon');
  const bow = el('span', 'ds-bow');
  bow.append(el('span', 'ds-knot'));
  ribbon.append(bow);
  ribbon.setAttribute('aria-hidden', 'true');

  scroll.append(el('span', 'ds-rod ds-rod-top'), paper, el('span', 'ds-rod ds-rod-bottom'), ribbon);
  stage.append(scroll, el('p', 'ds-plaque', tx.title));

  const fold = el('button', 'ds-fold', tx.fold);
  fold.type = 'button';

  root.append(stage, fold);

  const setClosedA11y = closed => {
    if (closed) {
      stage.setAttribute('role', 'button');
      stage.tabIndex = 0;
      stage.setAttribute('aria-label', tx.open);
      stage.setAttribute('aria-expanded', 'false');
    } else {
      stage.removeAttribute('role');
      stage.removeAttribute('tabindex');
      stage.removeAttribute('aria-label');
      stage.removeAttribute('aria-expanded');
    }
  };

  const unroll = () => {
    if (busy || root.classList.contains('ds-open')) return;
    setClosedA11y(false);
    run(root, paper, inner, true).then(() => saveOpen(true));
  };
  const rollUp = () => {
    if (busy || !root.classList.contains('ds-open')) return;
    run(root, paper, inner, false).then(() => { setClosedA11y(true); saveOpen(false); stage.focus(); });
  };

  stage.addEventListener('click', unroll);
  stage.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unroll(); }
  });
  fold.addEventListener('click', rollUp);

  if (open) {
    // Уже открывали сегодня — свиток встречает развёрнутым, без анимации
    root.classList.add(...STEPS.map(([cls]) => cls), 'ds-open');
    setClosedA11y(false);
  } else {
    setClosedA11y(true);
  }
  return root;
}

/* ---------- Анимация ---------- */

const wait = ms => new Promise(r => setTimeout(r, ms));

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Развернуть (forward) или свернуть обратно. Шаги идут классами по очереди,
   сами движения — переходы в scroll.css. Высоту бумаги CSS сам из нуля в
   «по содержимому» не проводит, поэтому на время движения она числом. */
async function run(root, paper, inner, forward) {
  busy = true;
  const quick = reducedMotion();
  try {
    if (forward) {
      for (const [cls, ms] of STEPS) {
        if (cls === 'ds-unroll') paper.style.height = `${inner.scrollHeight}px`;
        root.classList.add(cls);
        if (!quick) await wait(ms);
      }
      paper.style.height = '';
      root.classList.add('ds-open');
    } else {
      paper.style.height = `${inner.scrollHeight}px`;
      root.classList.remove('ds-open');
      void paper.offsetHeight;                       // зафиксировать высоту перед сжатием
      for (const [cls, ms] of [...STEPS].reverse()) {
        if (cls === 'ds-unroll') paper.style.height = '';
        root.classList.remove(cls);
        if (!quick) await wait(ms);
      }
    }
  } finally {
    busy = false;
  }
}

/* ---------- Состояние дня ---------- */

async function saveOpen(open) {
  try { await setMeta(META_KEY, { date: dayKey(), open }); } catch { /* не запомнили — не беда */ }
}

async function whoAmI() {
  try { return String((await getMeta('userId')) || ''); } catch { return ''; }
}

/* ---------- Отрисовка ---------- */

async function draw(host) {
  const [list, userId, saved] = await Promise.all([
    loadBase(), whoAmI(), getMeta(META_KEY).catch(() => null)
  ]);
  const date = dayKey();
  const lang = currentLang();
  const sign = `${date}|${lang}|${userId}|${list.length}`;
  if (sign === drawn || busy) return;
  drawn = sign;

  if (!list.length) { host.replaceChildren(); return; }
  const prediction = list[pickIndex(userId, date, list.length)];
  host.replaceChildren(build(prediction, lang, isOpenToday(saved, date)));
}

/* На каждый render() приложения. Рисует заново, только если сменился день,
   язык или человек: иначе открытый свиток мигал бы от каждой правки. */
export function syncScroll() {
  const host = document.getElementById(HOST_ID);
  if (!host || state.view !== 'quantum') return;
  draw(host);
}

/* Полночь: новый день — новое послание и завязанная ленточка. */
function armMidnight() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => { syncScroll(); armMidnight(); }, msToMidnight());
}

export function initScroll() {
  armMidnight();
  /* Телефон мог проспать полночь со свёрнутым приложением: таймеры в фоне
     замирают. Вернулись — сверяем день. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    armMidnight();
    syncScroll();
  });
}
