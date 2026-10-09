/* Вторая вкладка раздела «Квант» — «Пространство вариантов».

   Единственная точка стыковки с Ежедневником. Весь остальной код раздела
   лежит рядом в этой же папке и наружу ничего не экспортирует.

   Из app.js вызываются ровно две функции: initSpace() один раз при старте
   и syncSpace() на каждый render(). Первая часть «Кванта» не затрагивается.

   Про батарею: пока открыта вкладка «Моменты», здесь не работает ничего —
   ни таймеров, ни анимаций. Раздел поднимается по первому клику и
   полностью гасится при уходе. */

import { state } from '../../store.js';
import { CONFIG } from './config.js';
import { TEMPLATE } from './template.js';
import { QuantumApp } from './app.js';

/* three.js лежит в самом проекте, а не на CDN: иначе на телефоне без сети
   3D-коридор не открывался бы, и service worker не смог бы его закэшировать.
   Путь считается от этого файла, поэтому не зависит от адреса, по которому
   раздаётся приложение. */
const THREE_URL = new URL('../../vendor/three.min.js', import.meta.url).href;

let app = null;
let rootEl = null;
let wired = false;
let threeLoading = null;

/* ---------- Язык ---------- */

/* Раздел говорит на языке Ежедневника, своего переключателя не показывает. */
function currentLang() {
  const raw = String(state.language || 'ru').slice(0, 2).toLowerCase();
  if (raw === 'ua') return 'uk';                      // в игре украинский иногда 'ua'
  return ['ru', 'en', 'uk'].includes(raw) ? raw : 'ru';
}

/* ---------- three.js ---------- */

/* Грузим один раз и только когда вкладку действительно открыли:
   на вкладке «Моменты» лишние 600 КБ пользователю не нужны. */
function ensureThree() {
  if (window.THREE) return Promise.resolve();
  if (threeLoading) return threeLoading;

  threeLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = THREE_URL;
    script.onload = resolve;
    script.onerror = () => reject(new Error('three.js не загрузился'));
    document.head.appendChild(script);
  });
  return threeLoading;
}

/* ---------- Монтирование ---------- */

async function mount(host) {
  if (app) return;

  rootEl = document.createElement('div');
  rootEl.className = 'qm-root qm-embedded';
  rootEl.innerHTML = TEMPLATE;

  // Крестик внутри раздела просит его закрыть — возвращаемся к моментам
  rootEl.addEventListener('qm-close', () => showPart('moments'));

  host.appendChild(rootEl);

  try {
    await ensureThree();
  } catch (err) {
    console.error('[space]', err);
  }

  // Пока грузился three.js, пользователь мог уйти с вкладки
  if (!rootEl || !rootEl.isConnected) return;

  localStorage.setItem('quantum_lang', currentLang());
  app = new QuantumApp(rootEl);
}

export function unmountSpace() {
  if (app) {
    app.destroy();
    app = null;
  }
  if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
  rootEl = null;
}

/* ---------- Вкладки ---------- */

/* Подписи вкладок берутся из словаря раздела, чтобы не трогать общий i18n */
function applyTabLabels() {
  const dict = CONFIG.translations[currentLang()];
  document.querySelectorAll('#quantumTabs .qm-tab').forEach(tab => {
    const key = tab.dataset.part === 'space' ? 'tabSpace' : 'tabMoments';
    tab.textContent = dict[key];
  });
}

function showPart(part) {
  const moments = document.getElementById('quantumMoments');
  const space = document.getElementById('quantumSpace');
  if (!moments || !space) return;

  const isSpace = part === 'space';
  moments.hidden = isSpace;
  space.hidden = !isSpace;

  document.querySelectorAll('#quantumTabs .qm-tab').forEach(tab => {
    const on = tab.dataset.part === part;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  if (isSpace) mount(space).catch(err => console.error('[space]', err));
  else unmountSpace();
}

export function initSpace() {
  if (wired) return;
  const tabs = document.getElementById('quantumTabs');
  if (!tabs) return;

  tabs.addEventListener('click', event => {
    const tab = event.target.closest('.qm-tab');
    if (tab) showPart(tab.dataset.part);
  });

  applyTabLabels();
  wired = true;
}

/* Зовётся из render(). Держит раздел в согласии с остальным приложением:
   ушли с «Кванта» — гасим, сменили язык — перерисовываем тексты. */
export function syncSpace() {
  if (state.view !== 'quantum') {
    unmountSpace();
    return;
  }

  applyTabLabels();
  if (!app) return;

  const lang = currentLang();
  if (app.lang !== lang) {
    app.lang = lang;
    localStorage.setItem('quantum_lang', lang);
    app.applyLang();
  }
}
