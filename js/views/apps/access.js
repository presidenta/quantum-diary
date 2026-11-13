/* ДОСТУП К ОТДЕЛЬНЫМ ПРИЛОЖЕНИЯМ «Кванта» — GoldenFit и GSL Woman+ (выкладка 238).

   Владелец 12.11.2026: «у каждого приложения — замочек: открытый или закрытый; доступ к каждому
   потом будет открываться отдельно — хотите женский тренинг, пожалуйста, замочек открылся». Пока
   доступ открыт всем, у кого есть кабинет «Кванта», и замочки нарисованы открытыми. Сам «Квант» без
   замочка — о нём владелец ещё думает.

   Как включить отдельный доступ потом (METHODOLOGY.md §3.3): сервер отдаёт в /api/me список открытых
   приложений человека (выдаёт администратор), hasAccess() читает его отсюда — и замочки, и запрет
   открытия заработают сами: плитки и пункты меню уже спрашивают только hasAccess(). Тот же список
   проверяет сервер в /api/sport/* и /api/woman/* — без этого закрытый замочек был бы только картинкой. */

import { KEY_APPS } from '../../core/access-controller.js';

/** Отдельные приложения: ключ → название для подсказки. */
export const APPS = {
  goldenfit: 'GoldenFit',
  'gsl-woman': 'GSL Woman+',
  'gsl-man': 'GSL Man+'
};

/* GSL (W+M)⁺ — одно приложение на две части (владелец 13.11.2026): плитка открыта, если открыта любая из двух —
   какая часть откроется внутри, решает пол человека на сервере. */
const GSL_PARTS = ['gsl-woman', 'gsl-man'];

/* Открыто ли приложение этому человеку — как сам «Квант» (core/access-controller.js): администратор ставит
   галочку и срок (сервер, access/apps.js), телефон хранит их у себя (ключ access_apps) и решает по дате и
   без интернета: галочки нет — закрыто, срок пустой — бессрочно, дата наступила — закрыто, пока при
   следующей связи сервер не пришлёт новую. Сервер ни разу не ответил (старый сервер, первый запуск) —
   открыто: закрывать по догадке нельзя, а сервер всё равно сам не пустит в закрытое. */
export function hasAccess(app) {
  if (app === 'gsl') return GSL_PARTS.some(hasAccess);
  if (!(app in APPS)) return false;
  let apps = null;
  try {
    apps = JSON.parse(localStorage.getItem(KEY_APPS) || 'null');
  } catch {
    apps = null;
  }
  const entry = apps?.[app];
  if (!apps || !entry) return true;
  if (!entry.on) return false;
  if (!entry.until) return true;
  const until = Date.parse(entry.until);
  return Number.isNaN(until) || Date.now() < until;
}

const SVG = 'http://www.w3.org/2000/svg';
let seq = 0;

/* Замок — классический навесной, из металлического золота (владелец 12.11.2026: «уродливые, непонятно, что
   замок; нужен красивый, понятный, лакшери, крупнее»). Корпус с отблеском и замочной скважиной, литая дужка.
   Открыт — корпус золотой, дужка поднята и откинута; закрыт — корпус тёмный в золотой окантовке, дужка
   опущена. Градиенты у каждого значка свои (номер), иначе на странице с несколькими замками они спутаются. */
function lockSvg(open) {
  const n = ++seq;
  const gold = `alk-gold-${n}`;
  const dark = `alk-dark-${n}`;
  const ring = `alk-ring-${n}`;
  const body = open ? `url(#${gold})` : `url(#${dark})`;
  const hole = open ? '#5a3a10' : `url(#${gold})`;
  const shackle = open
    ? 'M7.6 11V7.2a4.4 4.4 0 0 1 8.8 0V8.2'
    : 'M7.6 11V8a4.4 4.4 0 0 1 8.8 0V11';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `app-lock${open ? ' is-open' : ''}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gold}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFF1BF"/><stop offset=".35" stop-color="#F2C658"/>
        <stop offset=".62" stop-color="#B8832A"/><stop offset="1" stop-color="#F7D774"/>
      </linearGradient>
      <linearGradient id="${ring}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#C8922F"/><stop offset=".5" stop-color="#FFE9A6"/><stop offset="1" stop-color="#B07A22"/>
      </linearGradient>
      <linearGradient id="${dark}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3A3530"/><stop offset="1" stop-color="#17140F"/>
      </linearGradient>
    </defs>
    <path d="${shackle}" fill="none" stroke="url(#${ring})" stroke-width="2.4" stroke-linecap="round"${open ? ' transform="rotate(-14 16.4 8.2)"' : ''}/>
    <rect x="4.4" y="10.6" width="15.2" height="11" rx="2.8" fill="${body}" stroke="url(#${gold})" stroke-width="${open ? '0.6' : '1.2'}"/>
    <path d="M6.4 12.4h11.2" stroke="#FFFBEA" stroke-opacity="${open ? '.55' : '.18'}" stroke-width=".9" stroke-linecap="round"/>
    <circle cx="12" cy="15.4" r="1.55" fill="${hole}"/>
    <path d="M11.35 16.2h1.3l.35 2.6h-2z" fill="${hole}"/>`;
  return svg;
}

export function lockIcon(app) {
  const open = hasAccess(app);
  const wrap = document.createElement('span');
  wrap.className = 'app-lock-wrap';
  wrap.title = open ? 'Доступ открыт' : 'Доступ откроет администратор';
  wrap.append(lockSvg(open));
  return wrap;
}
