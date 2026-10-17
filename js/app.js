/* Оболочка приложения: разделы, меню, язык, вход.
   Сами экраны живут в js/views/, общее состояние — в js/store.js. */

import { clearAll, getMeta, setMeta } from './db.js';
import { initSync, syncNow, deleteAccount } from './sync.js';
import { requestAccess, createFirstAdmin, login as doLogin, hasSession, logout, logoutAndClear, fetchMe, changeOwnPassword, saveAvatar } from './auth.js';
import { shrinkPhoto, paintAvatar, watchInstall, installed } from './profile.js';
import { API_BASE, serverAlive } from './config.js';
import {
  state, t, save, reload, onChange, changed, $, h, svgIcon, ICONS,
  activeSectors, sectorName, seedSectors, round
} from './store.js';
import { LANGUAGES, pickLanguage, isLanguage } from './core/i18n.js';
import { watchErrors } from './errors.js';
import { initUpdate } from './update.js';
import { initPasswordEyes } from './password-eye.js';
import { initWheel, renderWheelView, openAssess } from './views/wheel.js';
import { initDay, renderDay } from './views/day.js';
import { initQuantum, renderQuantum, loadQuantum, quietChanged } from './views/quantum.js';
import { initSpace, syncSpace, openPart as openQuantumPart } from './views/space/index.js';
import { initSlit } from './views/quantum-slit.js';
import { ACCESS_ENABLED, AccessController } from './core/access-controller.js';
import {
  cancelAll as cancelAllReminders, isNative, openAlarmSettings, testAlarm,
  takeAlarmTarget, pendingAlarms, askBatteryFreedom, openOverlaySettings,
  forgetAlarmTrace, openAppSettings, openAutostart, onOpenTarget
} from './core/reminders.js';
import {
  initReminders, planReminders, loadQuiet, saveQuiet, normalizeQuiet,
  loadAlarm, saveAlarm, alarmState
} from './reminder-plan.js';
import { minutesOfDay, normalizeAlarm, isWindowKey, atNext } from './core/reminder-rules.js';
import { formatJournal, formatPending, standbyName } from './core/alarm-journal.js';
import { shouldSeed, dedupeSectors } from './core/sectors.js';
import { markStartedOk, checkForUpdate } from './core/live-update.js';
import { renderMoney, openEntry, saveEntry, fillCategorySelect } from './views/money.js';
import { weekWheel } from './core/calc.js';
import { mondayOf, todayKey } from './core/dates.js';

/* Порядок разделов — порядок дня, а не порядок разработки.

   Квант стоит первым и открывается при запуске: это то, ради чего человек
   берёт телефон девять раз в день, и ждать отклика он должен сразу. Колесо
   ушло в конец: это итог недели, его смотрят раз, а не между делом. */
const SECTIONS = [
  { id: 'quantum', icon: ICONS.quantum, title: 'quantum.title', label: 'nav.quantum' },
  { id: 'day', icon: ICONS.day, title: 'day.title', label: 'nav.day' },
  { id: 'money', icon: ICONS.money, title: 'money.title', label: 'nav.money' },
  { id: 'wheel', icon: ICONS.wheel, title: 'wheel.title', label: 'nav.wheel' }
];

const STATUS_KEY = {
  local: 'sync.local', syncing: 'sync.syncing', synced: 'sync.synced',
  offline: 'sync.offline', error: 'sync.error', idle: null
};

/* ---------- Язык ---------- */

// Подписи, вшитые в разметку: меняются целиком при смене языка
//
// РАЗДЕЛ «ПРОСТРАНСТВО ВАРИАНТОВ» ОБХОДИМ СТОРОНОЙ.
//
// У него свой словарь (js/views/space/config.js) и свои ключи. Этот обход
// шёл по всему документу, включая поддерево раздела, а здешний t() таких
// ключей не знает и по правилу возвращает сам ключ. Поэтому после любой
// смены языка — и после каждого входа, где applyLanguage() зовётся по
// умолчанию, — на экранах раздела вместо текста проступали METAVERSETITLE,
// title1, btnStart, btnSettings, setupTitle, doorsCount, btnSave,
// screen2Instruction. Подписи дверей оставались целыми только потому, что
// они живут в placeholder, а не в textContent.
//
// Поддерево раздела переводит его собственный applyLang(); syncSpace()
// зовёт его следом за сменой языка, так что ни одна подпись не теряется.
function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.closest('.qm-root')) return;
    el.textContent = t(el.dataset.i18n);
  });

  /* Подсказка на кнопке — тоже подпись, и переводиться обязана. Кнопка
     крестика у разделов будильника несёт на себе один знак «×», и всё
     объяснение к ней живёт в title: без перевода человек на другом языке
     увидел бы русскую строку. */
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    if (el.closest('.qm-root')) return;
    el.title = t(el.dataset.i18nTitle);
  });
  const current = LANGUAGES.find(l => l.code === state.language);
  $('langLabel').textContent = `${current.flag} ${current.label}`;
  renderLangMenu();
  renderNav();
  render();
}

function renderLangMenu() {
  $('langMenu').replaceChildren(...LANGUAGES.map(l => h('button', {
    type: 'button',
    'aria-pressed': String(l.code === state.language),
    onclick: () => setLanguage(l.code)
  }, h('span', { text: `${l.flag} ${l.name}` }), h('span', { class: 'code', text: l.label }))));
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
  syncSpace();                 // вторая вкладка «Кванта»: гаснет вне раздела
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
  // Выключенные моменты не ждут человека — их нет и в счётчике
  if (id === 'quantum') return state.quantum ? state.quantum.moments.filter(m => !m.doneAt && !m.offAt).length || null : null;
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

/* Кнопка «Профиль» в нижнем меню — вместо гамбургера в шапке.

   Гамбургер стоял в левом верхнем углу и открывал меню, в котором
   половина пунктов и так лежит в нижнем ряду: разделы. Остальное —
   кабинет человека, настройки, выход — и есть профиль, поэтому кнопка
   названа по тому, что за ней на самом деле.

   Пятой в ряду, а не первой: четыре раздела идут в своём порядке дня,
   и профиль к ним не относится. На широком экране нижнее меню скрыто
   целиком, а меню и так стоит слева постоянно — кнопка там не нужна и
   не появляется. */
function drawerButton() {
  return h('button', {
    type: 'button', dataset: { section: 'profile' }, onclick: openDrawer
  }, svgIcon(ICONS.profile, 22), h('span', { text: t('nav.profile') }));
}

function renderNav() {
  $('bottomNav').replaceChildren(...SECTIONS.map(s => navButton(s, 22)), drawerButton());
  $('drawerMain').replaceChildren(...SECTIONS.map(s => navButton(s, 19)));

  // Служебное прижато вниз за разделителем — приём из того же меню.
  // Кабинет администратора виден только тому, у кого есть на это право:
  // это не отдельное приложение, а лишние вкладки в том же кабинете
  const service = [
    h('button', {
      type: 'button',
      onclick: () => { closeDrawer(); openSettings(); $('settingsDialog').showModal(); }
    }, svgIcon(ICONS.settings, 19), h('span', { text: t('nav.settings') }))
  ];
  if (state.me?.role === 'admin') {
    service.push(h('a', { href: 'admin.html' }, svgIcon(ICONS.admin, 19), h('span', { text: t('nav.admin') })));
  }
  $('drawerService').replaceChildren(...service);
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

/* Порог «широкого экрана» один на весь проект и совпадает с медиазапросом
   в app.css. Когда он жил в двух местах, они разошлись: вёрстка считала
   экран широким, а код — узким, и панель оставалась спрятанной. */
const WIDE = '(min-width: 768px)';
const isWide = () => window.matchMedia(WIDE).matches;

const openDrawer = () => { $('drawer').hidden = false; $('drawerBack').hidden = false; };
const closeDrawer = () => {
  if (isWide()) return;              // на широком экране панель всегда видна
  $('drawer').hidden = true;
  $('drawerBack').hidden = true;
};

/* Раздел «Деньги» живёт в views/money.js — там же правила счёта и голос */

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

  // Свой пароль можно сменить только когда есть сервер и вход выполнен
  if (!API_BASE) {
    $('accountInfo').textContent = t('settings.serverOff');
    $('changePassword').hidden = true;
  } else if (state.me) {
    $('accountInfo').textContent = t('settings.loggedIn', { name: state.me.displayName, email: state.me.email });
    $('changePassword').hidden = false;
  } else {
    $('accountInfo').textContent = t('settings.noLink');
    $('changePassword').hidden = true;
  }
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
  // Не ждём ответа: экран входа должен появиться сразу, а настройка —
  // переключить его, когда сервер скажет, что администраторов ещё нет
  setupMode();
}
function hideGate() {
  $('authGate').hidden = true;
  $('appRoot').hidden = false;
  if (isWide()) { $('drawer').hidden = false; $('drawerBack').hidden = true; }
}

function gateTab(which) {
  const loginActive = which === 'login';
  $('gateTabLogin').setAttribute('aria-selected', String(loginActive));
  $('gateTabRequest').setAttribute('aria-selected', String(!loginActive));
  $('loginForm').hidden = !loginActive;
  $('requestForm').hidden = loginActive;
}

/* Система ещё не настроена — показываем не вход, а заведение первого кабинета.
   Вход и заявка в этот момент бессмысленны: входить некому, а заявку
   рассматривать некому. Как только администратор появился, сервер отвечает
   «не нужно», и экран навсегда становится обычным. */
async function setupMode() {
  if (!API_BASE) return false;
  let needed = false;
  try {
    const res = await fetch(`${API_BASE}/api/setup`, { cache: 'no-store' });
    if (res.ok) needed = (await res.json()).needed === true;
  } catch {
    // Сервер промолчал — показываем обычный вход, а не экран настройки:
    // предлагать завести администратора там, где некому ответить, незачем
    return false;
  }
  $('gateTabs').hidden = needed;
  $('setupForm').hidden = !needed;
  if (needed) { $('loginForm').hidden = true; $('requestForm').hidden = true; }
  return needed;
}

/* ---------- Запуск ---------- */

/* Кто вошёл — в шапке панели. Заполняется после start() на обоих путях:
   и когда сессия уже была, и когда человек только что ввёл пароль. */
function renderUser() {
  if (!state.me) return;
  const account = String(state.me.accountNo ?? 0).padStart(9, '0');
  paintAvatar($('userInitial'), state.me.avatar, state.me.displayName);
  $('userName').textContent = state.me.displayName;
  // Номер кабинета девятью цифрами — его можно продиктовать администратору
  $('userAccount').textContent = account;

  paintAvatar($('profilePhoto'), state.me.avatar, state.me.displayName);
  $('profileName').textContent = state.me.displayName;
  $('profileAccount').textContent = account;
  $('changePassword').hidden = false;
  $('photoClear').hidden = !state.me.avatar;
}

function showPasswordError(text) {
  const msg = $('passwordMsg');
  msg.textContent = text;
  msg.className = 'gate-msg is-error';
  $('passwordDialog').returnValue = '';
  $('passwordDialog').showModal();
}

/* ---------- Тихий час ---------- */

/** Что сейчас стоит в полях окна. */
function quietFromForm() {
  return {
    on: $('quietOn').checked,
    from: $('quietFrom').value,
    until: $('quietUntil').value
  };
}

/* Итог человеческими словами, под полями.

   Нужен не для красоты. Промежуток через полночь читается неочевидно: «с
   21:00 до 6:00» — это девять часов тишины, и в них попадает завтрашнее
   утро, а не сегодняшнее. Строка сразу показывает, сколько именно часов
   человек себе выключил, и ошибку видно до сохранения, а не через сутки
   по пропущенному напоминанию. */
function showQuietSummary(quiet) {
  const box = $('quietSummary');
  const value = normalizeQuiet(quiet);

  if (!value.on) { box.textContent = t('quiet.offNote'); return; }

  const from = minutesOfDay(value.from);
  const until = minutesOfDay(value.until);

  if (from === until) { box.textContent = t('quiet.sameNote'); return; }

  const длина = from > until ? (24 * 60 - from + until) : (until - from);
  box.textContent = t('quiet.lasts', {
    hours: Math.floor(длина / 60),
    minutes: длина % 60
  });
}

/* ---------- Режим будильника ---------- */

/** Что сейчас стоит в галочках окна. */
function alarmFromForm() {
  return {
    on: $('alarmOn').checked,
    guardOn: $('alarmGuard').checked,
    windowMode: $('alarmWindowMode').value,
    momentsMode: $('alarmMomentsMode').value,
    windowAt: $('alarmWindowAt').value,
    momentsAt: $('alarmMomentsAt').value
  };
}

/* СОСТОЯНИЕ КАЖДОГО НАЗНАЧЕННОГО ЧАСА — ЦВЕТОМ И СЛОВОМ.

   По одному полю времени нельзя понять главного: ждать звонка сегодня
   или он уже прошёл. Человек спрашивал об этом каждый раз, а строка
   внизу говорила обо всех сразу и терялась.

   Зелёная точка — звонок впереди, красная — час прошёл и звонок уедет на
   завтра. Точка стоит ПЕРЕД словом, а не вместо него: цвет не прочитать
   вслух и не разглядеть дальтонику. */
function showAlarmStates(alarm) {
  const value = normalizeAlarm(alarm);

  const показать = (полеId, hhmm, включено) => {
    const поле = $(полеId);
    поле.className = 'alarm-state';

    if (!включено || !value.on) { поле.textContent = ''; return; }
    if (!hhmm) { поле.textContent = t('alarm.notSet'); return; }

    const at = atNext(hhmm);
    const сегодня = at && at.getDate() === new Date().getDate();

    поле.classList.add(сегодня ? 'is-ahead' : 'is-passed');
    поле.textContent = сегодня
      ? t('alarm.setFor', { at: hhmm })
      : t('alarm.passed', { at: hhmm });
  };

  показать('alarmWindowState', value.windowAt, value.windowMode !== 'off');
  показать('alarmMomentsState', value.momentsAt, value.momentsMode !== 'off');

  /* Что стоит у направления, видно глазом: выключенное приглушается, а
     «только напоминание» и «выключено» подписываются словами — чтобы
     человек не гадал, придёт ли что-нибудь. */
  for (const [раздел, режим] of [
    ['alarmWindowSection', value.windowMode],
    ['alarmMomentsSection', value.momentsMode]
  ]) {
    $(раздел).classList.toggle('is-off', режим === 'off');

    const заметка = $(раздел).querySelector('.alarm-mode-note');
    заметка.hidden = режим === 'alarm';
    заметка.textContent = t(режим === 'off' ? 'alarm.modeOffNote' : 'alarm.modeRemindNote');
  }
}

/* ЧТО СЕЙЧАС СТОИТ В СИСТЕМЕ.

   Будильник, который промолчал, следов не оставляет: встал он вообще,
   был снят телефоном или прозвонил в тишину — со стороны неотличимо.
   Из-за этого правки шли вслепую: чинили код там, где виновата могла
   быть экономия батареи.

   Поэтому спрашиваем у телефона напрямую и говорим словами. Это не
   отладка для разработчика: это единственный способ человеку увидеть
   разницу между «приложение не поставило» и «телефон снял», а она
   решает, куда идти — в код или в настройки телефона. */
async function showAlarmPending() {
  const поле = $('alarmPending');
  const батарея = $('alarmBattery');
  const кнопка = $('alarmBatteryFix');

  поле.textContent = '';
  батарея.hidden = true;
  кнопка.hidden = true;
  $('alarmTrace').hidden = true;
  $('alarmTraceFix').hidden = true;
  $('alarmStep').hidden = true;
  $('alarmDevice').hidden = true;
  $('alarmJournalBox').hidden = true;
  $('alarmListBox').hidden = true;
  $('alarmAutostart').hidden = true;
  $('alarmAutostartNote').hidden = true;
  if (!isNative()) return;

  const { alarms, systemNext, batteryUnrestricted, missed, missedAt, fired, firedAt,
    step, stepAt, maker, model, sdk, guardOn, guardAt, autostartKnown, bucket, bgRestricted,
    journal } = await pendingAlarms();

  const час = at => new Intl.DateTimeFormat('ru', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(at));

  /* ЧТО ПОМНИТ СИСТЕМА, А НЕ МЫ.

     Своя запись говорит, что мы поставили; система говорит, что она
     держит. Разошлись — значит будильники сняли со стороны, и это
     единственный способ такое увидеть. */
  if (!alarms.length) {
    поле.textContent = t('alarm.pendingNone');
  } else if (!systemNext) {
    поле.textContent = t('alarm.pendingDropped', { n: alarms.length });
  } else {
    поле.textContent = t('alarm.pendingNext', { at: час(systemNext), n: alarms.length });
  }

  /* ГЛАВНАЯ ПРИЧИНА НОЧНОГО МОЛЧАНИЯ.

     Телефон усыпляет приложение ради батареи, и поставленный будильник
     не срабатывает — звонит, только пока телефон бодрствует. Ровно это
     и наблюдалось. Снять ограничение может только человек, и попросить
     его должно само приложение, иначе он никогда не узнает, где искать:
     путей по чужим настройкам мы не называем, у каждого телефона они
     свои, а это окно системное и одинаковое у всех. */
  if (!batteryUnrestricted) {
    батарея.hidden = false;
    батарея.className = 'gate-msg is-error';
    батарея.textContent = t('alarm.batteryNote');
    кнопка.hidden = false;
  }

  /* СЛЕДЫ: СРАБОТАЛ ХОТЬ ОДИН ЗВОНОК ИЛИ ВСЕ ПРОМОЛЧАЛИ.

     Строка выше говорит, что поставлено СЕЙЧАС, и выглядит здоровой
     всегда — приложение переставляет расписание при каждом открытии.
     Поэтому по ней нельзя было понять главного: сработало ли что-нибудь,
     пока человек в приложение не смотрел. Ровно этот вопрос и оставался
     без ответа всю неделю, и из-за него правили код там, где виноват был
     телефон.

     Теперь ответ есть, и он точный: сработавший будильник удаляет себя из
     списка, несработавший остаётся (разбор в AlarmStore.java). */
  const след = $('alarmTrace');
  const кнопкаСледа = $('alarmTraceFix');

  /* ОБА СЧЁТЧИКА СРАЗУ. Прежде при пропуске показывался только он, и
     сработавшие звонки оставались невидимы: нельзя было понять, молчит
     всё или только часть. Красной строка остаётся, пока есть пропуски. */
  const части = [];
  if (fired > 0) части.push(t('alarm.traceFired', { n: fired, at: час(firedAt) }));
  if (missed > 0) части.push(t('alarm.traceMissed', { n: missed, at: час(missedAt) }));

  if (части.length) {
    след.textContent = части.join(' ');
    след.className = missed > 0 ? 'gate-msg is-error' : 'gate-msg is-ok';
    след.hidden = false;
    кнопкаСледа.hidden = missed === 0;
  } else if (alarms.length) {
    след.textContent = t('alarm.traceNone');
    след.className = 'gate-msg';
    след.hidden = false;
  }

  /* «АВТОЗАПУСК» — только когда звонок промолчал и производитель
     известен: у чужих телефонов такого раздела нет, и кнопка вела бы в
     пустоту. Говорится прямо, что именно нажать и что включить. */
  if (missed > 0 && autostartKnown) {
    $('alarmAutostartNote').textContent = t('alarm.autostartNote', { maker });
    $('alarmAutostartNote').className = 'gate-msg';
    $('alarmAutostartNote').hidden = false;
    $('alarmAutostart').hidden = false;
  } else if (missed > 0) {
    /* ПРОИЗВОДИТЕЛЬ НЕ ИЗВЕСТЕН — А СОВЕТ ВСЁ РАВНО НУЖЕН.
       17.10.2026 на телефоне, которого нет в списке «Автозапуска»
       (OBLUE TANK 3), после «закрыть всё» плашка стража пропала, а
       закреплённая рядом осталась. Это признак того, что телефон останавливает
       смахнутое приложение вместе с его звонками. Названия раздела у такого
       телефона мы не знаем, поэтому ведём в общие настройки приложения (их
       открывает кнопка «считать заново» выше) и говорим словами, что искать:
       замок на карточке в недавних, «Автозапуск», батарея без ограничений. */
    $('alarmAutostartNote').textContent = t('alarm.lockNote');
    $('alarmAutostartNote').className = 'gate-msg';
    $('alarmAutostartNote').hidden = false;
  }

  /* ДОКУДА ДОШЛО СРАБАТЫВАНИЕ.

     Строка выше говорит «сработало или нет». Эта — где именно оборвалось,
     если не сработало: разбудили приёмник или нет, дошло ли до плашки, до
     службы, до звука, до окна. Две разные беды чинятся в разных местах, и
     без этой строки их не различить. */
  /* Страж пишет в то же поле своё («страж на посту», «приложение
     смахнули, страж ставит звонки заново»), и это не про срабатывание
     звонка: под строкой «Последнее срабатывание» оно вводило бы в
     заблуждение. О страже говорят строка о телефоне и журнал. */
  if (step && !/страж/.test(step)) {
    $('alarmStep').textContent = t('alarm.step', { step, at: час(stepAt) });
    $('alarmStep').hidden = false;
  }

  /* КАКОЙ ЭТО ТЕЛЕФОН И ЖИВ ЛИ СТРАЖ.

     Отметка стража, а не флаг «запущен»: убитый процесс флага не снимет, а
     отметка протухнет сама, и строка честно скажет «не запущен». Проверка
     раз в десять минут, поэтому свежей считается отметка не старше
     двадцати пяти. */
  if (maker || model) {
    const свежа = guardAt && Date.now() - guardAt < 25 * 60 * 1000;
    const охрана = !guardOn ? t('alarm.guardOff')
      : !alarms.length ? t('alarm.guardIdle')
        : свежа ? t('alarm.guardUp', { at: час(guardAt) })
          : t('alarm.guardDown');

    /* Что о приложении думает сама система: группа ожидания и запрет на
       фон. «Батарея без ограничений» — лишь половина ответа; ограниченное
       приложение остаётся без звонков и при ней (выкладка 131). Группа
       неизвестна (старый Android) — строки о ней нет. */
    const группа = standbyName(bucket);
    const состояние = группа
      ? ' ' + t('alarm.deviceState', {
        bucket: группа, bg: t(bgRestricted ? 'alarm.bgOn' : 'alarm.bgOff')
      })
      : '';

    $('alarmDevice').textContent =
      t('alarm.device', { maker, model, sdk, guard: охрана }) + состояние;
    $('alarmDevice').hidden = false;
  }

  /* ЖУРНАЛ: ЧТО БЫЛО, ПО СЕКУНДАМ.

     Счётчики выше говорят «сколько», а когда звонок промолчал, нужно «что
     было до этого»: был ли он поставлен вообще и на какой час, не заменили
     ли его, не смахнули ли приложение, встал ли страж. Без этого оставалось
     гадать. Строки нейтральные, без перевода: это журнал для разбора, и
     пересылают его скриншотом. */
  if (journal.length) {
    // Само форматирование — в core/alarm-journal.js: там оно под тестами
    $('alarmJournal').textContent = formatJournal(journal);
    $('alarmJournalBox').hidden = false;
  }

  // Что стоит в системе прямо сейчас — по ключам и часам, а не одним числом
  if (alarms.length) {
    $('alarmList').textContent = formatPending(alarms);
    $('alarmListBox').hidden = false;
  }
}

/* Почему будильник может не зазвонить.

   Две разные беды, и чинятся они по-разному, поэтому и говорятся
   по-разному:

     нет плагина — приложение собрано раньше, чем он появился. Настройкой
     не чинится, нужен новый файл приложения;
     нет разрешения на полноэкранные напоминания — чинится настройкой
     телефона, и туда можно отвести прямо отсюда (Android 14 и новее;
     на Android 13 и старше такой настройки нет, и кнопки не будет).

   Молчать нельзя ни о той, ни о другой: человек включил бы настройку и
   ждал звонка, которого не будет. */
async function showAlarmTrouble() {
  const поле = $('alarmTrouble');
  const кнопка = $('alarmAllow');
  поле.hidden = true;
  поле.className = 'gate-msg';
  кнопка.hidden = true;
  $('alarmOverlayMsg').hidden = true;
  $('alarmOverlayFix').hidden = true;
  $('alarmTest').hidden = !isNative();
  $('alarmTestReal').hidden = !isNative();
  $('alarmTestMsg').textContent = '';
  $('alarmTestMsg').className = 'gate-msg';

  // В браузере напоминаний не бывает вовсе — об этом говорит своя строка
  if (!isNative()) return;

  const состояние = await alarmState();

  /* Красным, а не серым: это не примечание, а причина, по которой
     будильник не зазвонит так, как человек ждёт. Серую строку рядом с
     включённой галочкой он прочтёт как подсказку и пройдёт мимо. */
  if (!состояние.plugin) {
    поле.textContent = t('alarm.noPlugin');
    поле.className = 'gate-msg is-error';
    поле.hidden = false;
    return;
  }

  if (!состояние.fullScreen) {
    поле.textContent = t('alarm.noFullScreen');
    поле.className = 'gate-msg is-error';
    поле.hidden = false;
    кнопка.hidden = !состояние.askable;
  }

  /* ОКНО ПОВЕРХ ТОГО, ЧЕМ ЧЕЛОВЕК ЗАНЯТ.

     Про это молчать нельзя, и это главное, что приложение должно было
     сказать и не сказало. Пока человек смотрит в телефон, Android
     показывает плашку ВМЕСТО окна будильника — таково правило системы, и
     снимает его только разрешение «Поверх других приложений». Человек же
     видел всплывшую плашку и делал единственный возможный вывод:
     приложение сломано.

     Строка стоит отдельно от полноэкранного разрешения: они про разное и
     выдаются в разных местах настроек телефона. */
  const окно = $('alarmOverlayMsg');
  if (!состояние.overlay) {
    окно.textContent = t('alarm.overlayNote');
    окно.className = 'gate-msg is-error';
    окно.hidden = false;
    $('alarmOverlayFix').hidden = !состояние.overlayAskable;
  }
}

/* ОКНО «РЕЖИМ БУДИЛЬНИКА».

   Открываем его, заполнив поля сохранённым, а сохраняем только по кнопке
   «Сохранить» — тот же порядок, что у тихого часа.

   Вынесено из обработчика кнопки в профиле, потому что открывать его
   теперь умеют двое: сама кнопка и плашка стража в шторке («Настроить
   время»). Второму нажимать чужую кнопку было бы обходом: её обработчик
   может измениться, а окно должно открываться одинаково с обеих сторон. */
async function openAlarmDialog() {
  // Окно уже открыто (плашку нажали дважды) — повторный showModal бросил бы
  // InvalidStateError и оборвал бы остальной вызов
  if ($('alarmDialog').open) return;

  const alarm = await loadAlarm();
  $('alarmOn').checked = alarm.on;
  $('alarmGuard').checked = alarm.guardOn;
  $('alarmWindowMode').value = alarm.windowMode;
  $('alarmMomentsMode').value = alarm.momentsMode;
  $('alarmWindowAt').value = alarm.windowAt;
  $('alarmMomentsAt').value = alarm.momentsAt;

  /* Тихий час называется здесь же, хотя настраивается рядом. Это одна
     модель на два окна: тихий час глушит, режим активности звонит. */
  const тихо = await loadQuiet();
  $('alarmQuietNote').textContent = тихо.on
    ? t('alarm.quietNote', { from: тихо.from, until: тихо.until })
    : t('alarm.quietOff');

  showAlarmStates(alarm);
  $('alarmBrowserNote').hidden = isNative();
  await showAlarmTrouble();
  await showAlarmPending();
  $('alarmDialog').returnValue = '';
  // За время ожиданий выше окно могли открыть вторым нажатием
  if (!$('alarmDialog').open) $('alarmDialog').showModal();
}

/* Куда вести, если человека позвали снаружи: звонок будильника или кнопка
 * на плашке стража в шторке.
 *
 * Плагин отвечает один раз и сразу забывает цель — иначе один звонок
 * уводил бы человека на тот же экран при каждом следующем открытии
 * приложения. Пустой ответ — обычное дело: значит пришли сами.
 *
 *   alarm — «Настроить время» на плашке: окно «Режим будильника», где
 *           задаются часы обоих направлений. Раздел под окном не трогаем:
 *           закрыв его, человек вернётся туда, где был.
 *   home  — «Главный кабинет» и нажатие на саму плашку: раздел «Квант» с
 *           вкладкой «Моменты». Там расписание, из которого плашка берёт
 *           время Архитектора, — цифры на плашке и на экране сверяются
 *           глазом.
 *   space — окно возможностей (звонок Наблюдателя).
 *   всё остальное — вкладка «Моменты», как и раньше. */
async function открытьПоЗвонку() {
  const цель = await takeAlarmTarget();
  if (!цель) return;

  if (цель === 'alarm') {
    await openAlarmDialog();
    return;
  }

  go('quantum');
  openQuantumPart(цель === 'space' ? 'space' : 'moments');
}

let syncStarted = false;
let targetListening = false;

async function start() {
  await reload();
  /* Сервер не отвечает — синхронизацию не заводим вовсе. Иначе она сама
     обнаружит отсутствие входа и покажет экран входа, который в этом
     случае бесполезен: войти всё равно некуда. */
  if (!syncStarted && !state.serverDown) {
    syncStarted = true;
    initSync({
      status: s => { $('syncStatus').textContent = STATUS_KEY[s] ? t(STATUS_KEY[s]) : ''; },
      data: async () => { await reload(); changed(); },
      authLost: showGate
    });
  } else if (syncStarted) {
    // После повторного входа start() зовётся снова, а обработчики событий
    // синхронизации вешать второй раз нельзя
    syncNow();
  }

  if (API_BASE && !state.serverDown) {
    state.me = await fetchMe();
    renderUser();
    await loadQuantum();     // счётчик моментов нужен сразу, на любом экране
    renderNav();
  }

  /* СИСТЕМНЫЕ НАПОМИНАНИЯ.

     Ставим расписание здесь, а не раньше: моменты дня приходят с сервера,
     и до loadQuantum ставить было бы нечего. Окну возможностей сервер не
     нужен, но и торопиться с ним некуда — всё расписание ставится одним
     заходом.

     В браузере эта строка молчит: системных напоминаний там не бывает, и
     кодом это не чинится. Работает только в собранном приложении.

     По нажатию на уведомление открываем ту вкладку, о которой оно: окно
     возможностей живёт в «Пространстве вариантов», моменты — в соседней.
     Иначе человек попадал бы туда, где был в прошлый раз. */
  initReminders(key => {
    go('quantum');
    // Про окно это напоминание или про момент — решает ключ: назначенное
    // человеком время приходит со своим, и сравнение со строкой его не ловило
    openQuantumPart(isWindowKey(key) ? 'space' : 'moments');
  });

  /* ПРИШЛИ ПО ЗВОНКУ — ОТКРЫВАЕМ ТО, РАДИ ЧЕГО ПОЗВАЛИ.

     Экран будильника запускает приложение и оставляет плагину признак,
     куда вести. Это не то же самое, что нажатие на обычную плашку выше:
     там приложение уже работало и сработал обработчик уведомления, а
     здесь оно могло быть закрыто вовсе — и узнать о звонке больше
     неоткуда.

     Спрашиваем и при запуске, и при возвращении на экран: если
     приложение было уже открыто, страница не перезагружается, и запуск
     второй раз не случится. */
  await открытьПоЗвонку();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    открытьПоЗвонку().catch(err => console.warn('[будильник]', err.message));
  });

  /* КНОПКА НА ПЛАШКЕ ПРИ ОТКРЫТОМ ПРИЛОЖЕНИИ.
     visibilitychange молчит, когда шторку открыли поверх приложения: страница
     не скрывалась. Тогда о цели сообщает сам плагин (см. onOpenTarget).
     Подписка одна на всю жизнь страницы: start() зовётся заново после
     повторного входа, а второй обработчик открыл бы окно дважды. */
  if (!targetListening) {
    targetListening = true;
    onOpenTarget(() => {
      открытьПоЗвонку().catch(err => console.warn('[будильник]', err.message));
    });
  }

  /* СФЕРЫ ПО УМОЛЧАНИЮ — ТОЛЬКО КОГДА ИЗВЕСТНО, ЧТО У ЗАПИСИ ИХ НЕТ.

     Прежде здесь стояла проверка «нет сфер — создать», и она и задваивала
     сферы. Устройство, на котором сфер нет, — это не то же самое, что
     учётная запись, у которой их нет: так выглядит и свежая установка, и
     очищенный телефон, и приложение, впервые открытое при недоступном
     сервере. В каждом из этих случаев девять сфер создавались заново, со
     своими случайными id, и при следующей синхронизации складывались с
     теми, что уже лежали на сервере. На экране получалось восемнадцать
     сфер вместо девяти.

     Теперь решение принимает shouldSeed (core/sectors.js), и ему нужен
     ответ на вопрос «а что на сервере». Этот ответ даёт только удачная
     синхронизация: syncNow возвращает true лишь на том единственном пути,
     где обмен с сервером состоялся.

     Сервер недоступен — не засеваем вовсе. Пустое колесо объясняет себя
     само (renderNotice в views/wheel.js), и это честнее, чем девять
     заготовок, которые завтра придётся сводить с настоящими. Потерять мы
     этим ничего не можем: регистрация закрытая, учётную запись выдаёт
     сервер, и пользоваться приложением, ни разу до него не добравшись,
     всё равно нельзя. */
  if (!state.index.sectors.length) {
    const синхронизировано = state.serverDown ? false : Boolean(await syncNow());
    if (синхронизировано) await reload();

    if (shouldSeed({
      signedIn: await hasSession(),
      accountKnown: синхронизировано,
      sectorCount: state.index.sectors.length
    })) {
      await seedSectors();
    }
  }

  /* СХЛОПНУТЬ ДУБЛИ, НАДЕЛАННЫЕ ПРЕЖДЕ.

     Заготовки починены, но сферы, задвоенные старым засевом, так и лежат
     на устройстве: на экране «Колесо» они идут парами, по восемнадцать
     вместо девяти, и руками их не убрать. Само это не рассосётся —
     чинить надо здесь, один раз при запуске.

     Лишние не стираются, а помечаются удалёнными: их уносит обычная
     синхронизация, и то же решение доезжает до других устройств.
     Из пары остаётся та, на которую ссылаются цели, — иначе человек
     потерял бы их молча (правило целиком в core/sectors.js). */
  const занятые = new Set(state.index.goals.map(g => g.sectorId).filter(Boolean));
  const лишние = dedupeSectors(state.index.sectors, занятые);
  if (лишние.length) {
    await save('sectors', лишние);
    await reload();
    console.info('[сферы] схлопнуто дублей:', лишние.length);
  }

  render();

  /* В собранном приложении service worker не нужен и даже вреден: файлы и
     так лежат на телефоне, а его запас мог бы заслонить свежий пакет,
     пришедший по воздуху. В браузере он по-прежнему главный работник
     офлайна. */
  const inApp = Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());

  if (!inApp && 'serviceWorker' in navigator
      && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('[sw]', err.message));
  }
}

async function boot() {
  watchErrors();

  /* Раздел «Пространство вариантов» занимает весь экран и перекрывает
     кнопку языка, поэтому у него своя. Переключить язык везде может только
     Ежедневник — раздел лишь просит об этом событием. */
  document.addEventListener('qm-lang-change', e => setLanguage(e.detail));

  /* Приложение поднялось — отчитываемся сразу, пока не истекли десять
     секунд, после которых плагин откатил бы выкладку назад. И тут же
     смотрим, не вышло ли новое: в браузере обе строчки ничего не делают. */
  markStartedOk();
  checkForUpdate();

  // Повернули телефон или растянули окно — панель должна стать той, какой надо
  window.matchMedia(WIDE).addEventListener('change', e => {
    $('drawer').hidden = !e.matches;
    $('drawerBack').hidden = true;
  });
  state.language = pickLanguage(await getMeta('language').catch(() => null), navigator.languages || []);

  initWheel();
  initDay();
  initQuantum();
  initSpace();
  initSlit();

  // Ежедневная проверка прав и «рубильник». Пока ACCESS_ENABLED = false,
  // этот блок не делает ничего: ни запросов, ни блокировок.
  // Включать только после проверки, что сервер отвечает всем устройствам —
  // иначе через сутки без связи заблокируются сразу все.
  if (ACCESS_ENABLED) {
    new AccessController({
      apiBase: API_BASE,
      getToken: () => getMeta('token'),
      // Закрытое приложение не должно будить человека
      cancelAlarms: cancelAllReminders
    }).start();
  }
  onChange(render);

  // Меню, язык, настройки
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

  /* ТИХИЙ ЧАС.

     Открываем окно, заполнив поля тем, что сохранено. Сохраняем только по
     кнопке «Сохранить»: «Отмена» и крестик должны оставлять прежнее
     время, иначе человек, заглянувший посмотреть, молча поменял бы себе
     настройку. */
  $('quietHours').addEventListener('click', async () => {
    const quiet = await loadQuiet();
    $('quietOn').checked = quiet.on;
    $('quietFrom').value = quiet.from;
    $('quietUntil').value = quiet.until;
    showQuietSummary(quiet);
    // В браузере напоминаний не бывает — говорим об этом прямо в окне
    $('quietBrowserNote').hidden = isNative();
    $('quietDialog').returnValue = '';
    $('quietDialog').showModal();
  });

  // Подсказка живая: человек видит итог, ещё не нажав «Сохранить»
  for (const id of ['quietOn', 'quietFrom', 'quietUntil']) {
    $(id).addEventListener('change', () => showQuietSummary(quietFromForm()));
  }

  $('quietDialog').addEventListener('close', async () => {
    if ($('quietDialog').returnValue !== 'save') return;
    await saveQuiet(quietFromForm());
    /* Тихий час вырезает своё время из окон, поэтому девять моментов
       после его правки другие. Пересобираем день сразу: человек закрыл
       окно и должен увидеть новые времена, а не прежние. */
    await quietChanged();
  });

  /* РЕЖИМ БУДИЛЬНИКА.

     Тот же порядок, что у тихого часа: открываем окно, заполнив
     галочки сохранённым, и сохраняем только по кнопке «Сохранить». */
  $('alarmMode').addEventListener('click', openAlarmDialog);

  /* ВРЕМЕННО: окно «Логи». Убрать вместе с кнопкой #alarmLogs и самим
     окном в index.html, когда звонки подтвердятся (METHODOLOGY, 9.7). */
  $('alarmLogs').addEventListener('click', async () => {
    await showAlarmPending();
    $('alarmLogDialog').showModal();
  });

  for (const id of ['alarmOn', 'alarmGuard', 'alarmWindowMode', 'alarmMomentsMode',
    'alarmWindowAt', 'alarmMomentsAt']) {
    $(id).addEventListener('change', () => {
      const текущее = alarmFromForm();
      showAlarmStates(текущее);
    });
  }

  /* Отвести за разрешением. Окно не закрываем: человек вернётся из
     настроек телефона и должен увидеть ту же настройку, а не пустой
     профиль. */
  $('alarmAllow').addEventListener('click', async () => {
    await openAlarmSettings();
  });

  // Снять усыпление приложения: окно показывает система, отвечает человек
  $('alarmBatteryFix').addEventListener('click', async () => {
    await askBatteryFreedom();
  });

  /* Разрешить окно поверх других приложений. Окно выдачи системное,
     отвечает в нём человек, и обойти его нельзя. Наше окно не закрываем:
     он вернётся из настроек и должен увидеть ту же настройку. */
  $('alarmOverlayFix').addEventListener('click', async () => {
    await openOverlaySettings();
  });

  /* Человек идёт править настройки телефона — отсчёт начинаем заново.

     Забыть следы здесь обязательно. Иначе строка о прошлых пропусках
     висела бы над уже починенным будильником, и человек не смог бы
     понять, помогла его правка или нет, — а это единственное, ради чего
     эта строка и заведена. */
  $('alarmTraceFix').addEventListener('click', async () => {
    await forgetAlarmTrace();
    await showAlarmPending();
    await openAppSettings();
  });

  // «Автозапуск»: отсчёт заново, как и у настроек приложения выше
  $('alarmAutostart').addEventListener('click', async () => {
    await forgetAlarmTrace();
    await showAlarmPending();
    await openAutostart();
  });

  /* Человек вернулся из настроек телефона — перечитываем состояние.
     Иначе красная строка осталась бы висеть над уже выданным
     разрешением, и выглядело бы это как «не помогло». */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!$('alarmDialog').open && !$('alarmLogDialog').open) return;
    showAlarmTrouble().catch(err => console.warn('[будильник]', err.message));
    // И про усыпление тоже: человек мог вернуться именно оттуда
    showAlarmPending().catch(err => console.warn('[будильник]', err.message));
  });

  /* ПРОВЕРОЧНЫЙ ЗВОНОК.

     Единственный способ проверить будильник, не дожидаясь настоящего
     момента: ближайший может быть через час. Ставится через десять
     секунд — успеть заблокировать экран и увидеть, поднимется ли окно
     поверх блокировки.

     Окно профиля не закрываем: человек смотрит на телефон и ждёт
     звонка, а не ищет, куда делась настройка. */
  $('alarmTest').addEventListener('click', async () => {
    const строка = $('alarmTestMsg');
    const поставлен = await testAlarm({
      title: t('alarm.title'),
      body: t('alarm.testGoing'),
      stopLabel: t('alarm.stop')
    });

    строка.textContent = поставлен ? t('alarm.testGoing') : t('alarm.testFailed');
    строка.className = поставлен ? 'gate-msg is-ok' : 'gate-msg is-error';
  });

  /* ПРОВЕРКА КАК НАСТОЯЩАЯ. Обычная срабатывает через десять секунд, пока
     приложение ещё живо, — и потому не повторяет условий, в которых звонки
     молчали. Эта ставится на две минуты вперёд: человек успевает закрыть
     приложение и положить телефон так, как делает это всегда. Потом строка
     следов скажет, дошёл ли звонок и докуда. */
  $('alarmTestReal').addEventListener('click', async () => {
    const строка = $('alarmTestMsg');
    const поставлен = await testAlarm({
      title: t('alarm.title'),
      body: t('alarm.testRealGoing'),
      stopLabel: t('alarm.stop'),
      delayMs: 2 * 60 * 1000,
      key: 'alarm-test-real'
    });

    строка.textContent = поставлен ? t('alarm.testRealGoing') : t('alarm.testFailed');
    строка.className = поставлен ? 'gate-msg is-ok' : 'gate-msg is-error';
  });

  $('alarmDialog').addEventListener('close', async () => {
    if ($('alarmDialog').returnValue !== 'save') return;
    await saveAlarm(alarmFromForm());
    /* Названный вручную час сдвигает все последующие моменты дня: человек
       только что получил напоминание, и следующее ждёт не через пять
       минут. Пересобираем день сразу, чтобы новые времена были видны на
       экране, а не только в будильнике. */
    await quietChanged();
  });

  // Свой пароль человек меняет сам; администратор выдаёт только первый
  $('changePassword').addEventListener('click', () => {
    $('passwordForm').reset();
    $('passwordMsg').textContent = '';
    $('passwordMsg').className = 'gate-msg';
    $('settingsDialog').close();
    $('passwordDialog').returnValue = '';
    $('passwordDialog').showModal();
  });

  $('passwordDialog').addEventListener('close', async () => {
    if ($('passwordDialog').returnValue !== 'save') return;
    const f = $('passwordForm').elements;
    const next = f.newPassword.value;
    const msg = $('passwordMsg');
    if (next !== f.repeatPassword.value) { showPasswordError(t('password.mismatch')); return; }
    if (next.length < 8) { showPasswordError(t('password.tooShort')); return; }
    try {
      await changeOwnPassword(f.currentPassword.value, next);
      alert(t('password.saved'));
    } catch (err) {
      showPasswordError(t(err.code === 'wrong_current_password' ? 'password.wrongCurrent' : 'password.failed'));
    }
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
  /* ---------- Деньги ---------- */

  // Список категорий заполняется один раз и обновляется при смене языка
  fillCategorySelect($('moneyForm').elements.category);
  $('moneyBack').addEventListener('click', () => $('moneyDialog').close());
  $('moneyDialog').addEventListener('close', async () => {
    if ($('moneyDialog').returnValue === 'save') await saveEntry();
  });

  /* ---------- Профиль ---------- */

  $('drawerUser').addEventListener('click', () => { closeDrawer(); $('profileDialog').showModal(); });
  $('profileBack').addEventListener('click', () => $('profileDialog').close());

  /* Выход без вопросов: он ничего не теряет. Записи остаются на устройстве,
     закрывается только вход. Спрашивать подтверждение у действия, которое
     легко отменить обратным входом, — значит пугать на ровном месте. */
  $('profileLogout').addEventListener('click', async () => {
    await logout();
    location.reload();
  });

  // Фотография: выбрали файл — сжали на устройстве — отправили строкой
  $('photoPick').addEventListener('click', () => $('photoFile').click());
  $('photoFile').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';                       // чтобы тот же файл можно было выбрать снова
    if (!file) return;
    const msg = $('photoMsg');
    msg.className = 'gate-msg';
    msg.textContent = t('profile.photoWorking');
    try {
      const small = await shrinkPhoto(file);
      state.me.avatar = await saveAvatar(small);
      renderUser();
      msg.className = 'gate-msg is-ok';
      msg.textContent = t('profile.photoSaved');
    } catch (err) {
      msg.className = 'gate-msg is-error';
      msg.textContent = t(err.status === 413 || err.status === 400 ? 'profile.photoTooBig' : 'profile.photoFailed');
    }
    setTimeout(() => { msg.textContent = ''; }, 4000);
  });
  $('photoClear').addEventListener('click', async () => {
    try {
      state.me.avatar = await saveAvatar('');
      renderUser();
    } catch { /* не убралась — остаётся как была */ }
  });

  // Кнопка установки появляется, только когда браузер готов её предложить
  watchInstall($('installApp'));

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
      await doLogin(f.login.value, f.password.value);
      hideGate();
      await start();
    } catch (err) {
      msg.className = 'gate-msg is-error';
      msg.textContent = t(LOGIN_ERRORS[err.code] || 'auth.noNetwork');
    }
  });
  /* Пароль придумывает устройство, а не человек. Показываем его открытым:
     записать можно только то, что видно, а восстановить этот пароль потом
     будет некому — самостоятельного сброса в системе нет. */
  $('setupGenerate').addEventListener('click', () => {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const made = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    const f = $('setupForm').elements;
    f.password.value = made;
    f.password2.value = made;
    f.password.type = 'text';
    f.password2.type = 'text';
    const msg = $('setupMsg');
    msg.className = 'gate-msg is-ok';
    msg.textContent = t('auth.passwordMade');
  });

  $('setupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('setupMsg');
    msg.className = 'gate-msg';
    msg.textContent = '';
    const f = e.target.elements;
    // Опечатку в пароле, который нигде больше не записан и который некому
    // восстановить, человек обнаружил бы уже запертым снаружи
    if (f.password.value !== f.password2.value) {
      msg.className = 'gate-msg is-error';
      msg.textContent = t('auth.passwordsDiffer');
      return;
    }
    try {
      await createFirstAdmin({
        displayName: f.displayName.value, email: f.email.value, password: f.password.value
      });
      // Кабинет заведён — сразу входим им же, чтобы не набирать пароль дважды
      await doLogin(f.email.value, f.password.value);
      hideGate();
      await start();
    } catch (err) {
      msg.className = 'gate-msg is-error';
      msg.textContent = t(err.status === 409 ? 'auth.setupDone'
        : err.status === 400 ? 'auth.checkFields' : 'auth.requestFailed');
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
  initUpdate();
  initPasswordEyes();

  /* Сервер ещё не поднят — не встречаем человека экраном входа, который
     всё равно не работает. Приложение живёт на устройстве и говорит об
     этом строкой состояния. Как только сервер ответит, вход и синхронизация
     включатся сами, без новой выкладки. */
  if (API_BASE && !(await serverAlive())) {
    state.serverDown = true;
    hideGate();
    await start();
    $('syncStatus').textContent = t('sync.local');
    return;
  }

  if (API_BASE && !(await hasSession())) { showGate(); return; }
  hideGate();
  await start();
}

boot();
