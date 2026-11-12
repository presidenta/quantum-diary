/* GSL Woman — женский тренинг в «Кванте» (выкладка 236). Устроено как GoldenFit (views/sport/).

   GSL Woman — отдельный проект: свой сайт (presidenta/gsl-woman), свой значок, свои обновления.
   «Квант» связан с ним только входом: человек, вошедший здесь, попадает в GSL Woman без пароля —
   «Квант» берёт у сервера одноразовый пропуск (/api/woman/pass, две минуты, один раз) и открывает
   сайт с ним в адресе.

   Открывается в браузере телефона, а не в окне «Кванта»: там у GSL Woman работают её напоминания и её
   значок на экране. В приложении — родным openSport (он пускает только адреса спорта и GSL Woman,
   SportLinkActivity.java); приложение старше выкладки 236 GSL Woman не знает — плитка просит обновить.
   На сайте «Кванта» в браузере — новой вкладкой.

   Рисует в два места страницы: #womanTile — плитка рядом с плиткой спорта (ряд .apps-row), и
   #drawerWoman — пункт меню под спортом. Из app.js: initWoman() при старте, syncWoman() на render(). */

import { state } from '../../store.js';
import { getMeta } from '../../db.js';
import { API_BASE } from '../../config.js';
import { request } from '../../core/net.js';
import { textsFor } from './texts.js';
import { hasAccess, lockIcon } from '../apps/access.js';

export const WOMAN_URL = 'https://presidenta.github.io/gsl-woman/';
const ICON = new URL('./gslwoman.png', import.meta.url).href;

let drawn = '';
let noteTimer = null;

function nativeBridge() {
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins) return null;
  if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
  return cap.Plugins.QuantumAlarm || null;
}

/* Пропуск. Нет входа, нет сети, старый сервер — пустая строка: GSL Woman откроется и так и попросит
   войти логином и паролем «Кванта». */
async function passCode() {
  const token = await getMeta('token').catch(() => null);
  if (!token || !API_BASE) return '';
  try {
    const res = await request(`${API_BASE}/api/woman/pass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
      timeoutMs: 8000
    });
    if (!res.ok) return '';
    return (await res.json())?.code || '';
  } catch {
    return '';
  }
}

/**
 * Открыть GSL Woman уже вошедшим.
 * @param {{install?: boolean}} [options] install — GSL Woman сразу покажет «Значок на экран»
 */
export async function openWoman({ install = false } = {}) {
  const t = textsFor(state.language);
  // Замочек закрыт — приложение не открываем (доступ выдаёт администратор, ../apps/access.js)
  if (!hasAccess('gsl-woman')) {
    showNote(t.locked, 8000);
    return;
  }
  const native = nativeBridge();
  // В браузере вкладку открываем сразу, пока нажатие свежее (как у спорта)
  const tab = native ? null : window.open('', '_blank');
  if (native) showNote(t.opening);

  const code = await passCode();
  const params = new URLSearchParams();
  if (code) params.set('kvant', code);
  if (install) params.set('install', '1');
  const url = WOMAN_URL + (params.toString() ? `#${params}` : '');

  if (native) {
    try {
      await native.openSport({ url });
    } catch {
      // Приложение собрано до выкладки 236: родной метод GSL Woman не пускает — нужен новый файл
      showNote(t.updateApp, 12000);
    }
    return;
  }
  if (tab) {
    tab.opener = null;
    tab.location.href = url;
  } else {
    location.href = url;
  }
}

/* ---------- Разметка: те же классы плитки, что у спорта (sport.css), — две плитки одного ряда ---------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') node.onclick = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function showNote(text, ms = 4000) {
  const note = document.querySelector('#womanTile .sp-note');
  if (!note) return;
  note.textContent = text;
  note.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.hidden = true; }, ms);
}

function drawTile(t) {
  const host = document.getElementById('womanTile');
  if (!host) return;
  host.replaceChildren(el('div', { class: 'sp-tile' },
    el('button', { type: 'button', class: 'sp-main', 'aria-label': `${t.open} ${t.name}`, onclick: () => openWoman() },
      el('img', { class: 'sp-icon', src: ICON, alt: '', width: '48', height: '48' }),
      el('span', { class: 'sp-body' },
        el('span', { class: 'sp-name-row' }, el('b', { class: 'sp-name', text: t.name }), lockIcon('gsl-woman')),
        el('span', { class: 'sp-about', text: t.about }))),
    el('div', { class: 'sp-actions' },
      el('button', { type: 'button', class: 'btn primary', onclick: () => openWoman() },
        el('span', { class: 'gold-cut', text: t.open })),
      el('button', { type: 'button', class: 'btn', onclick: () => openWoman({ install: true }), text: t.install })),
    el('p', { class: 'sp-note', role: 'status', hidden: '' })));
}

function drawMenu(t) {
  const host = document.getElementById('drawerWoman');
  if (!host) return;
  host.replaceChildren(el('button', {
    type: 'button',
    onclick: () => {
      document.getElementById('drawerBack')?.click();
      openWoman();
    }
  },
    el('img', { class: 'sp-menu-icon', src: ICON, alt: '', width: '19', height: '19' }),
    el('span', { text: t.menu }),
    lockIcon('gsl-woman')));
}

export function initWoman() {
  syncWoman();
}

// Перерисовка — только когда сменился язык: плитка не зависит от данных дня
export function syncWoman() {
  const key = state.language || 'ru';
  if (key === drawn && document.querySelector('#womanTile .sp-tile')) return;
  drawn = key;
  const t = textsFor(key);
  drawTile(t);
  drawMenu(t);
}
