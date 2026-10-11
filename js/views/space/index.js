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
import { resetSlit } from '../quantum-slit.js';

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
    // Подпись живёт в своём span, а не прямо в кнопке. Прежняя строка
    // tab.textContent = ... стирала всё содержимое вместе с этим span, и
    // оформление надписи — прорезанное золото на чёрной вкладке, тёмная
    // буква на золотой — до неё не доезжало: правила висят на span.
    let label = tab.querySelector('span');
    if (!label) {
      label = document.createElement('span');
      tab.replaceChildren(label);
    }
    // Прорезанное золото — одно и то же на чёрной вкладке и на золотой
    label.classList.add('gold-cut');
    label.textContent = dict[key];
  });
}

/* part === null — ничего не выбрано: обе кнопки погашены, обе части
   скрыты. Это состояние, с которого пульт открывается. */
function showPart(part) {
  const moments = document.getElementById('quantumMoments');
  const space = document.getElementById('quantumSpace');
  if (!moments || !space) return;

  const isSpace = part === 'space';
  moments.hidden = part !== 'moments';
  space.hidden = !isSpace;

  /* Опыт с двумя щелями виден, только пока ничего не выбрано: он и
     нужен для того, чтобы показать разницу между двумя кнопками до
     того, как на одну из них нажмут. */
  const idle = document.getElementById('quantumIdle');
  if (idle) idle.hidden = part !== null;

  /* Открыли часть — опыт отпускает кнопки. Он подсвечивает ту, что над
     выбранным полем, и без этого его подсветка осталась бы висеть на
     соседней кнопке рядом с открытой: золотыми стояли бы обе. */
  if (part !== null) resetSlit();

  document.querySelectorAll('#quantumTabs .qm-tab').forEach(tab => {
    const on = tab.dataset.part === part;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  if (isSpace) mount(space).catch(err => console.error('[space]', err));
  else unmountSpace();
}

/* Открыть нужную вкладку «Кванта» снаружи.

   Нужно уведомлениям: человек нажал на напоминание об окне возможностей —
   открыться должно «Пространство вариантов», а не то, что было открыто в
   прошлый раз. До сих пор вкладку мог переключить только палец по самой
   вкладке, и showPart незачем было выпускать наружу. */
export function openPart(part) {
  showPart(part);
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
    return;
  }

  /* Сторож на случай, если подписи кто-то стёр.

     Язык тот же — значит, перерисовывать нечего, и так было раньше. Но
     общий обход Ежедневника успел однажды пройти по этому поддереву и
     заменить все подписи служебными ключами; язык при этом не менялся,
     и починить их здесь было некому.

     Сам обход поправлен, но телефон может держать в кэше прежний app.js.
     Поэтому смотрим на первую подпись раздела: если в ней лежит её
     собственный ключ — тексты вытерты, зовём перевод заново. Проверка
     стоит один querySelector и не делает ничего, пока всё в порядке. */
  const probe = rootEl && rootEl.querySelector('[data-i18n]');
  if (probe && probe.textContent.trim() === probe.getAttribute('data-i18n')) {
    app.applyLang();
  }
}
