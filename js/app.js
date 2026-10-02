/* Оболочка приложения: разделы, меню, язык, вход.
   Сами экраны живут в js/views/, общее состояние — в js/store.js. */

import { clearAll, getMeta, setMeta } from './db.js';
import { initSync, syncNow, deleteAccount } from './sync.js';
import { requestAccess, login as doLogin, hasSession, logoutAndClear, fetchMe } from './auth.js';
import { API_BASE } from './config.js';
import {
  state, t, save, reload, onChange, changed, $, h, svgIcon, ICONS,
  activeSectors, sectorName, seedSectors, round
} from './store.js';
import { LANGUAGES, pickLanguage, isLanguage } from './core/i18n.js';
import { initWheel, renderWheelView, openAssess } from './views/wheel.js';
import { initDay, renderDay } from './views/day.js';
import { initQuantum, renderQuantum, loadQuantum } from './views/quantum.js';
import { weekWheel } from './core/calc.js';
import { mondayOf, todayKey } from './core/dates.js';

const SECTIONS = [
  { id: 'wheel', icon: ICONS.wheel, title: 'wheel.title', label: 'nav.wheel' },
  { id: 'quantum', icon: ICONS.quantum, title: 'quantum.title', label: 'nav.quantum' },
  { id: 'day', icon: ICONS.day, title: 'day.title', label: 'nav.day' },
  { id: 'money', icon: ICONS.money, title: 'money.title', label: 'nav.money' }
];

const STATUS_KEY = {
  local: 'sync.local', syncing: 'sync.syncing', synced: 'sync.synced',
  offline: 'sync.offline', error: 'sync.error', idle: null
};

/* ---------- Язык ---------- */

// Подписи, вшитые в разметку: меняются целиком при смене языка
function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  const current = LANGUAGES.find(l => l.code === state.language);
  $('langLabel').textContent = current.label;
  renderLangMenu();
  renderNav();
  render();
}

function renderLangMenu() {
  $('langMenu').replaceChildren(...LANGUAGES.map(l => h('button', {
    type: 'button',
    'aria-pressed': String(l.code === state.language),
    onclick: () => setLanguage(l.code)
  }, h('span', { text: l.name }), h('span', { class: 'code', text: l.label }))));
}

function setLanguage(code) {
  if (!isLanguage(code)) return;
  state.language = code;
  closeLangMenu();
  applyLanguage();
  // Запоминаем в фоне: экран не должен ждать записи в базу — она может
  // задержаться за идущей синхронизацией, и язык переключался бы с паузой
  setMeta('language', code).catch(() => {});
}

const closeLangMenu = () => {
  $('langMenu').hidden = true;
  $('langBtn').setAttribute('aria-expanded', 'false');
};

/* ---------- Разделы и меню ---------- */

async function go(section) {
  state.view = section;
  closeDrawer();
  render();
  // День квантового модуля тянем, только когда в него зашли и его ещё нет
  if (section === 'quantum' && !state.quantum) {
    await loadQuantum();
    render();
    renderNav();            // счётчик непрожитых моментов
  }
}

function render() {
  // До первой загрузки данных рисовать нечего: applyLanguage() зовёт render()
  // ещё на экране входа, когда index пуст
  if (!state.index) return;
  const current = SECTIONS.find(s => s.id === state.view) || SECTIONS[0];
  $('screenTitle').textContent = t(current.title);
  for (const section of SECTIONS) {
    $(`view${section.id[0].toUpperCase()}${section.id.slice(1)}`).hidden = section.id !== state.view;
  }
  document.querySelectorAll('#bottomNav button').forEach(b => {
    if (b.dataset.section === state.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('drawerMain').querySelectorAll('button').forEach(b => {
    if (b.dataset.section === state.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  if (state.view === 'wheel') renderWheelView();
  if (state.view === 'day') renderDay();
  if (state.view === 'quantum') renderQuantum();
  if (state.view === 'money') renderMoney();
  renderDrawerSpheres();
}

/* Счётчик у раздела — то, что ждёт человека: непрожитые моменты,
   невыполненные задачи. Ноль не показываем: пустая метка только шумит. */
function sectionBadge(id) {
  if (!state.index) return null;
  if (id === 'day') {
    const left = state.data.tasks.filter(x => !x.deletedAt && x.date === state.day && !x.done).length;
    return left || null;
  }
  if (id === 'quantum') return state.quantum ? state.quantum.moments.filter(m => !m.doneAt).length || null : null;
  return null;
}

function navButton(section, iconSize) {
  const badge = sectionBadge(section.id);
  return h('button', {
    type: 'button', dataset: { section: section.id }, onclick: () => go(section.id)
  },
    svgIcon(section.icon, iconSize),
    h('span', { text: t(section.label) }),
    badge ? h('span', { class: 'count', text: String(badge) }) : null);
}

function renderNav() {
  $('bottomNav').replaceChildren(...SECTIONS.map(s => navButton(s, 22)));
  $('drawerMain').replaceChildren(...SECTIONS.map(s => navButton(s, 19)));

  // Служебное прижато вниз за разделителем — приём из того же меню
  $('drawerService').replaceChildren(
    h('button', {
      type: 'button',
      onclick: () => { closeDrawer(); openSettings(); $('settingsDialog').showModal(); }
    }, svgIcon(ICONS.settings, 19), h('span', { text: t('nav.settings') })),
    h('a', { href: 'admin.html' }, svgIcon(ICONS.admin, 19), h('span', { text: t('nav.admin') }))
  );
}

function renderDrawerSpheres() {
  if (!state.index || $('spheresToggle').getAttribute('aria-expanded') === 'false') {
    if (state.index) $('drawerSpheres').replaceChildren();
    return;
  }
  const rows = weekWheel(state.index, mondayOf(todayKey()), todayKey());
  $('drawerSpheres').replaceChildren(...rows.map(row => h('button', {
    type: 'button', onclick: () => go('wheel')
  },
    h('span', { class: `dot s${row.sector.slot}` }),
    h('span', { text: sectorName(row.sector) }),
    h('span', { class: 'trailing', text: row.pct === null ? '—' : `${round(row.pct)}%` }))));
}

const openDrawer = () => { $('drawer').hidden = false; $('drawerBack').hidden = false; };
const closeDrawer = () => {
  if (window.matchMedia('(min-width: 900px)').matches) return;   // на широком экране панель всегда видна
  $('drawer').hidden = true;
  $('drawerBack').hidden = true;
};

/* ---------- Квант и Деньги: пока заглушки с честным текстом ---------- */

function renderMoney() {
  $('moneyCard').replaceChildren(
    h('p', { style: 'margin:0 0 8px;font-weight:600', text: t('money.title') }),
    h('p', { class: 'muted', style: 'margin:0', text: t('money.empty') }));
}

/* ---------- Настройки ---------- */

function openSettings() {
  const count = activeSectors().length;
  $('countButtons').querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.count) === count)));
  $('sectorEditList').replaceChildren(...activeSectors().map(s => h('li', { class: 'edit-row' },
    h('span', { class: `dot s${s.slot}` }),
    h('input', {
      value: s.name, maxLength: 40, placeholder: t('common.sectorN', { n: s.slot }),
      'aria-label': sectorName(s),
      onchange: e => save('sectors', [{ ...s, name: e.target.value.trim().slice(0, 40) }])
    }),
    h('label', {}, h('input', {
      type: 'checkbox', checked: s.paused,
      onchange: e => save('sectors', [{ ...s, paused: e.target.checked }])
    }), t('settings.notNow')))));

  if (!API_BASE) $('accountInfo').textContent = t('settings.serverOff');
  else if (state.me) $('accountInfo').textContent = t('settings.loggedIn', { name: state.me.displayName, email: state.me.email });
  else $('accountInfo').textContent = t('settings.noLink');
}

/* ---------- Вход ---------- */

const LOGIN_ERRORS = {
  invalid_credentials: 'auth.wrongCredentials',
  pending_approval: 'auth.pending',
  blocked: 'auth.blocked'
};

function showGate() {
  $('appRoot').hidden = true;
  $('authGate').hidden = false;
}
function hideGate() {
  $('authGate').hidden = true;
  $('appRoot').hidden = false;
  if (window.matchMedia('(min-width: 900px)').matches) { $('drawer').hidden = false; }
}

function gateTab(which) {
  const loginActive = which === 'login';
  $('gateTabLogin').setAttribute('aria-selected', String(loginActive));
  $('gateTabRequest').setAttribute('aria-selected', String(!loginActive));
  $('loginForm').hidden = !loginActive;
  $('requestForm').hidden = loginActive;
}

/* ---------- Запуск ---------- */

/* Кто вошёл — в шапке панели. Заполняется после start() на обоих путях:
   и когда сессия уже была, и когда человек только что ввёл пароль. */
function renderUser() {
  if (!state.me) return;
  $('userInitial').textContent = (state.me.displayName || '?').trim()[0].toUpperCase();
  $('userName').textContent = state.me.displayName;
  // Номер кабинета девятью цифрами — его можно продиктовать администратору
  $('userAccount').textContent = String(state.me.accountNo ?? 0).padStart(9, '0');
  $('logoutBtn').hidden = false;
}

let syncStarted = false;

async function start() {
  await reload();
  // После повторного входа start() зовётся снова, а обработчики событий
  // синхронизации вешать второй раз нельзя
  if (!syncStarted) {
    syncStarted = true;
    initSync({
      status: s => { $('syncStatus').textContent = STATUS_KEY[s] ? t(STATUS_KEY[s]) : ''; },
      data: async () => { await reload(); changed(); },
      authLost: showGate
    });
  } else {
    syncNow();
  }
  if (API_BASE) {
    state.me = await fetchMe();
    renderUser();
    await loadQuantum();     // счётчик моментов нужен сразу, на любом экране
    renderNav();
  }

  // Сферы по умолчанию — только если их нет и на сервере: иначе после очистки
  // телефона рядом с вернувшимися сферами появились бы ещё девять
  if (!state.index.sectors.length) {
    await syncNow();
    await reload();
    if (!state.index.sectors.length) await seedSectors();
  }
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('[sw]', err.message));
  }
}

async function boot() {
  state.language = pickLanguage(await getMeta('language').catch(() => null), navigator.languages || []);

  initWheel();
  initDay();
  initQuantum();
  onChange(render);

  // Меню, язык, настройки
  $('openDrawer').addEventListener('click', openDrawer);
  $('drawerBack').addEventListener('click', closeDrawer);
  $('langBtn').addEventListener('click', () => {
    const open = $('langMenu').hidden;
    $('langMenu').hidden = !open;
    $('langBtn').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.lang-wrap')) closeLangMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeLangMenu();
    closeDrawer();
  });

  // Группа сфер: сворачивание и быстрый переход к настройке — действия
  // прямо в заголовке группы, как в том меню
  $('spheresToggle').addEventListener('click', () => {
    const open = $('spheresToggle').getAttribute('aria-expanded') === 'true';
    $('spheresToggle').setAttribute('aria-expanded', String(!open));
    renderDrawerSpheres();
  });
  $('spheresSettings').addEventListener('click', () => {
    closeDrawer();
    openSettings();
    $('settingsDialog').showModal();
  });

  $('openAssess').addEventListener('click', openAssess);
  $('countButtons').addEventListener('click', async e => {
    const n = Number(e.target.dataset.count);
    if (!n) return;
    const changedSectors = state.index.sectors
      .filter(s => s.active !== (s.position <= n))
      .map(s => ({ ...s, active: s.position <= n }));
    if (changedSectors.length) await save('sectors', changedSectors);
    openSettings();
  });
  $('deleteData').addEventListener('click', async () => {
    if (!confirm(t('settings.deleteConfirm'))) return;
    try {
      await deleteAccount();
    } catch {
      alert(t('auth.noNetwork'));
      return;
    }
    await clearAll();
    location.reload();
  });
  $('logoutBtn').addEventListener('click', async () => {
    if (!confirm(t('auth.logoutConfirm'))) return;
    await logoutAndClear();
    location.reload();
  });

  // Вход и заявка
  $('gateTabLogin').addEventListener('click', () => gateTab('login'));
  $('gateTabRequest').addEventListener('click', () => gateTab('request'));
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('loginMsg');
    msg.className = 'gate-msg';
    msg.textContent = '';
    const f = e.target.elements;
    try {
      await doLogin(f.email.value, f.password.value);
      hideGate();
      await start();
    } catch (err) {
      msg.className = 'gate-msg is-error';
      msg.textContent = t(LOGIN_ERRORS[err.code] || 'auth.noNetwork');
    }
  });
  $('requestForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('requestMsg');
    msg.className = 'gate-msg';
    const f = e.target.elements;
    try {
      await requestAccess({
        displayName: f.displayName.value, email: f.email.value,
        phone: f.phone.value, telegramId: f.telegramId.value
      });
      msg.className = 'gate-msg is-ok';
      msg.textContent = t('auth.requestSent');
      e.target.reset();
    } catch (err) {
      msg.className = 'gate-msg is-error';
      msg.textContent = t(err.status === 400 ? 'auth.checkFields' : 'auth.requestFailed');
    }
  });

  applyLanguage();

  if (API_BASE && !(await hasSession())) { showGate(); return; }
  hideGate();
  await start();
}

boot();
