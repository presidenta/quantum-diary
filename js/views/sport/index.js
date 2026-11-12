/* GoldenFit — спортивное приложение в «Кванте» (выкладка 211).

   Спорт — отдельный проект: свой сайт (presidenta/golden-workout), своя иконка, свои
   обновления. «Квант» с ним связан только входом: человек, вошедший здесь, попадает
   в спорт без пароля. Для этого «Квант» берёт у сервера одноразовый пропуск
   (/api/sport/pass, две минуты, один раз) и открывает спорт с ним в адресе.

   ПОЧЕМУ НЕ ВНУТРИ ОКНА «КВАНТА». Встроенное окно Android, в котором живёт приложение,
   не умеет ни говорить, ни слушать, а голос — главное в спорте. Поэтому спорт
   открывается в браузере телефона (родной метод openSport): в Chrome или, если стоит
   значок GoldenFit, в нём самом. На сайте «Кванта» в браузере — новой вкладкой.

   Модуль рисует в два места, которые отводит ему страница:
   - #sportTile — плитка на главной («Квант», под арканом и свитком);
   - #drawerSport — пункт меню под разделами.
   Из app.js: initSport() при старте, syncSport() на каждый render(), openSport() —
   когда спорт попросил «Войти через Квант» (цель «sport-login»). */

import { state } from '../../store.js';
import { getMeta } from '../../db.js';
import { API_BASE } from '../../config.js';
import { request } from '../../core/net.js';
import { textsFor } from './texts.js';
import { hasAccess, lockIcon } from '../apps/access.js';

export const SPORT_URL = 'https://presidenta.github.io/golden-workout/';
const ICON = new URL('./goldenfit.png', import.meta.url).href;

let drawn = '';
let noteTimer = null;

/** Родной мост приложения или null, если «Квант» открыт в браузере. */
function nativeBridge() {
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins) return null;
  if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
  return cap.Plugins.QuantumAlarm || null;
}

/* Пропуск для спорта. Нет входа, нет сети, старый сервер — пустая строка: спорт
   откроется и так, просто попросит войти сам. */
async function passCode() {
  const token = await getMeta('token').catch(() => null);
  if (!token || !API_BASE) return '';
  try {
    const res = await request(`${API_BASE}/api/sport/pass`, {
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
 * Открыть GoldenFit уже вошедшим.
 * @param {{install?: boolean}} [options] install — спорт сразу покажет «Поставить значок на экран»
 */
export async function openSport({ install = false } = {}) {
  const t = textsFor(state.language);
  // Замочек закрыт — приложение не открываем (доступ выдаёт администратор, ../apps/access.js)
  if (!hasAccess('goldenfit')) {
    showNote(t.locked, 8000);
    return;
  }
  const native = nativeBridge();
  /* В браузере вкладку открываем сразу, пока нажатие свежее: после ожидания сервера
     браузер счёл бы её непрошеным окном и не пустил. Адрес дописываем потом. */
  const tab = native ? null : window.open('', '_blank');
  if (native) showNote(t.opening);

  const code = await passCode();
  const params = new URLSearchParams();
  if (code) params.set('kvant', code);
  if (install) params.set('install', '1');
  const url = SPORT_URL + (params.toString() ? `#${params}` : '');

  if (native) {
    try {
      await native.openSport({ url });
    } catch {
      // Приложение собрано до выкладки 211: родного метода нет — нужен новый файл приложения
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

/* ---------- Разметка ---------- */

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
  const note = document.querySelector('#sportTile .sp-note');
  if (!note) return;
  note.textContent = text;
  note.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.hidden = true; }, ms);
}

function drawTile(t) {
  const host = document.getElementById('sportTile');
  if (!host) return;
  host.replaceChildren(el('div', { class: 'sp-tile' },
    el('button', { type: 'button', class: 'sp-main', 'aria-label': `${t.open} ${t.name}`, onclick: () => openSport() },
      el('img', { class: 'sp-icon', src: ICON, alt: '', width: '48', height: '48' }),
      el('span', { class: 'sp-body' },
        el('span', { class: 'sp-name-row' }, el('b', { class: 'sp-name', text: t.name }), lockIcon('goldenfit')),
        el('span', { class: 'sp-about', text: t.about }))),
    el('div', { class: 'sp-actions' },
      el('button', { type: 'button', class: 'btn primary', onclick: () => openSport() },
        el('span', { class: 'gold-cut', text: t.open })),
      el('button', { type: 'button', class: 'btn', onclick: () => openSport({ install: true }), text: t.install })),
    el('p', { class: 'sp-note', role: 'status', hidden: '' })));
}

function drawMenu(t) {
  const host = document.getElementById('drawerSport');
  if (!host) return;
  host.replaceChildren(el('button', {
    type: 'button',
    onclick: () => {
      // Меню закрывает сама страница по своей подложке; на широком экране её нет и меню стоит
      document.getElementById('drawerBack')?.click();
      openSport();
    }
  },
    el('img', { class: 'sp-menu-icon', src: ICON, alt: '', width: '19', height: '19' }),
    el('span', { text: t.menu }),
    lockIcon('goldenfit')));
}

export function initSport() {
  syncSport();
}

// Перерисовка — только когда сменился язык: плитка не зависит от данных дня
export function syncSport() {
  const key = state.language || 'ru';
  if (key === drawn && document.querySelector('#sportTile .sp-tile')) return;
  drawn = key;
  const t = textsFor(key);
  drawTile(t);
  drawMenu(t);
}
