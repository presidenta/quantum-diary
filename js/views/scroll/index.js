/* Свиток «Мудрость дня» на главной, рядом с «Арканом дня».

   Единственная точка стыковки с Ежедневником. Всё остальное — логика
   (engine.js), подписи (texts.js), база посланий (predictions.json) и вид
   (scroll.css) — лежит рядом в этой папке и наружу не выходит.

   Модуль рисует в два места, которые ему отводит страница:
   - #dailyScrollButton — золотая кнопка со свёрнутым свитком (справа от
     плашки аркана);
   - #dailyScrollPanel — развёрнутый свиток и сноска (под текстом аркана).
   Где эти места стоят, решает страница (index.html и сетка в app.css).

   Из app.js вызываются ровно две функции: initScroll() один раз при старте
   и syncScroll() на каждый render().

   Про батарею: никаких вечных таймеров. Один setTimeout до полуночи, чтобы
   свиток сменился ровно в 00:00, и короткая цепочка таймеров во время
   самой анимации развязывания. */

import { state } from '../../store.js';
import { getMeta, setMeta } from '../../db.js';
import { dayKey, msToMidnight, pickIndex, normalize, textOf, isOpenToday } from './engine.js';
import { textsFor } from './texts.js';

const BUTTON_ID = 'dailyScrollButton';
const PANEL_ID = 'dailyScrollPanel';
const META_KEY = 'dailyScroll';
const DATA_URL = new URL('./predictions.json', import.meta.url).href;

/* Шаги развязывания: сколько длится каждый, в миллисекундах. Те же числа
   стоят в scroll.css у переходов — меняются парой. */
const STEPS = [
  ['ds-untie', 450],   // ленточка с бантиком на кнопке развязывается и исчезает
  ['ds-lift', 350],    // свиток уходит с кнопки и ложится под текст аркана
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

/* Свёрнутый свиток: два валика вплотную. На кнопке — с лентой и бантиком. */
function roll(withRibbon) {
  const scroll = el('div', 'ds-scroll');
  scroll.append(el('span', 'ds-rod ds-rod-top'));
  const paper = el('div', 'ds-paper');
  scroll.append(paper, el('span', 'ds-rod ds-rod-bottom'));
  if (withRibbon) {
    const ribbon = el('span', 'ds-ribbon');
    const bow = el('span', 'ds-bow');
    bow.append(el('span', 'ds-knot'));
    ribbon.append(bow);
    ribbon.setAttribute('aria-hidden', 'true');
    scroll.append(ribbon);
  }
  return { scroll, paper };
}

function build(prediction, lang, open) {
  const tx = textsFor(lang);
  const langAttr = lang;

  // Кнопка: золотая плашка, подпись и свёрнутый свиток поперёк
  const button = el('button', 'ds-btn');
  button.type = 'button';
  button.lang = langAttr;
  button.setAttribute('aria-controls', PANEL_ID);
  button.append(el('span', 'ds-btn-label', tx.title), roll(true).scroll);

  // Развёрнутый свиток: на бумаге только пожелание; сноска — под свитком, на тёмном
  const panel = el('div', 'ds-panel');
  panel.lang = langAttr;
  const { scroll, paper } = roll(false);
  const inner = el('div', 'ds-paper-in');
  inner.append(el('p', 'ds-text', textOf(prediction, lang)));
  paper.append(inner);
  const note = el('p', 'ds-note');
  note.append(el('span', 'ds-note-mark', '*'), document.createTextNode(` ${tx.note}`));
  panel.append(scroll, note);

  const parts = [button, panel];
  const isOpen = () => button.classList.contains('ds-open');
  const label = () => {
    button.setAttribute('aria-expanded', String(isOpen()));
    button.setAttribute('aria-label', `${tx.title}: ${isOpen() ? tx.fold : tx.unfold}`);
  };

  button.addEventListener('click', () => {
    if (busy) return;
    const forward = !isOpen();
    run(parts, paper, inner, forward).then(() => { label(); saveOpen(forward); });
  });

  if (open) {
    // Уже открывали сегодня — свиток встречает развёрнутым, без анимации
    for (const p of parts) p.classList.add(...STEPS.map(([cls]) => cls), 'ds-open');
  }
  label();
  return { button, panel };
}

/* ---------- Анимация ---------- */

const wait = ms => new Promise(r => setTimeout(r, ms));

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Развернуть (forward) или свернуть обратно. Шаги идут классами по очереди
   на кнопке и на свитке разом, сами движения — переходы в scroll.css.
   Высоту бумаги CSS из нуля в «по содержимому» не проводит, поэтому на
   время движения она числом. */
async function run(parts, paper, inner, forward) {
  busy = true;
  const quick = reducedMotion();
  const add = cls => parts.forEach(p => p.classList.add(cls));
  const remove = cls => parts.forEach(p => p.classList.remove(cls));
  try {
    if (forward) {
      for (const [cls, ms] of STEPS) {
        if (cls === 'ds-unroll') paper.style.height = `${inner.scrollHeight}px`;
        add(cls);
        if (!quick) await wait(ms);
      }
      paper.style.height = '';
      add('ds-open');
    } else {
      paper.style.height = `${inner.scrollHeight}px`;
      remove('ds-open');
      void paper.offsetHeight;                       // зафиксировать высоту перед сжатием
      for (const [cls, ms] of [...STEPS].reverse()) {
        if (cls === 'ds-unroll') paper.style.height = '';
        remove(cls);
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

async function draw(buttonHost, panelHost) {
  const [list, userId, saved] = await Promise.all([
    loadBase(), whoAmI(), getMeta(META_KEY).catch(() => null)
  ]);
  const date = dayKey();
  const lang = currentLang();
  const sign = `${date}|${lang}|${userId}|${list.length}`;
  if (sign === drawn || busy) return;
  drawn = sign;

  if (!list.length) { buttonHost.replaceChildren(); panelHost.replaceChildren(); return; }
  const prediction = list[pickIndex(userId, date, list.length)];
  const { button, panel } = build(prediction, lang, isOpenToday(saved, date));
  buttonHost.replaceChildren(button);
  panelHost.replaceChildren(panel);
}

/* На каждый render() приложения. Рисует заново, только если сменился день,
   язык или человек: иначе открытый свиток мигал бы от каждой правки. */
export function syncScroll() {
  const buttonHost = document.getElementById(BUTTON_ID);
  const panelHost = document.getElementById(PANEL_ID);
  if (!buttonHost || !panelHost || state.view !== 'quantum') return;
  draw(buttonHost, panelHost);
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
