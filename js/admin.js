/* Кабинет администратора: заявки, пароли, блокировки и содержание
   квантового модуля.

   ВХОД — СВОЕЙ УЧЁТНОЙ ЗАПИСЬЮ, служебный ключ остался запасным путём.
   Сервер пускает сюда по роли: requireAdmin принимает либо ADMIN_TOKEN, либо
   сессию человека с ролью admin (server/src/auth.js). Страница же продолжала
   требовать ключ — и администратор, уже вошедший в приложение, упирался в
   запертую дверь и шёл искать ключ, который лежит в журнале контейнера на
   сервере, куда доступа нет. Теперь сначала пробуем сессию.

   Служебный ключ нужен ровно в одном случае: администраторов нет вовсе или
   все заблокированы. Он хранится в sessionStorage, а не в localStorage:
   закрыли вкладку — пропал. Это ключ от чужих заявок и паролей, ему не место
   в долгой памяти браузера. */

import { API_BASE } from './config.js';
import { h, setStyle, svgIcon, ICONS } from './store.js';
import { getMeta, setMeta } from './db.js';
import { LANGUAGES, DEFAULT_LANGUAGE, isLanguage, pickLanguage, translate } from './core/i18n.js';
import { initPasswordEyes } from './password-eye.js';
import { initUpdate } from './update.js';

const $ = id => document.getElementById(id);
const KEY = 'planner.adminToken';
const SLOTS = { morning: 'Утро', day: 'День', evening: 'Вечер', frame: 'Кадр' };
const LANGS = { ru: 'RU', uk: 'UK', en: 'EN' };

/* ---------- Язык кабинета ----------

   Тот же словарь, что и у приложения, и та же память: человек выбрал язык в
   ежедневнике — кабинет открывается на нём же, отдельно переключать не нужно.
   Выбранный здесь язык заодно становится языком НОВЫХ ФРАЗ: раньше на экране
   было два разных выбора языка, и они путались. */
let language = DEFAULT_LANGUAGE;
const t = (key, values) => translate(language, key, values);

function applyLanguage() {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  const select = $('adminLang');
  if (select.options.length !== LANGUAGES.length) {
    /* Флаг и короткий код. Полное название в шапке рядом с двумя кнопками
       не помещается и обрезается многоточием, а флаг узнаётся без чтения. */
    select.replaceChildren(...LANGUAGES.map(l =>
      h('option', { value: l.code, text: `${l.flag} ${l.label}` })));
  }
  select.value = language;
}

function setLanguage(code) {
  if (!isLanguage(code) || code === language) return;
  language = code;
  applyLanguage();
  // В фоне: экран не должен ждать записи в базу
  setMeta('language', code).catch(() => {});
}

let token = null;
let status = 'pending';
let phrases = [];

const base = API_BASE || '';

async function api(path, options = {}) {
  // Content-Type ставим только когда есть тело: с ним и пустым телом
  // сервер отвечает «пустое тело JSON», а не выполняет запрос
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { ...options, headers });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/* ---------- Вход ---------- */

function showGate(message) {
  $('adminRoot').hidden = true;
  $('tokenGate').hidden = false;
  $('tokenMsg').textContent = message || '';
  $('tokenMsg').className = message ? 'gate-msg is-error' : 'gate-msg';
}

function showAdmin() {
  $('tokenGate').hidden = true;
  $('adminRoot').hidden = false;
}

let errorTimer = null;
function showError(message) {
  const box = $('adminError');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { box.hidden = true; }, 6000);
}

// В заголовок запроса можно положить только печатные латинские знаки.
// Кириллица уронила бы сам запрос, и человек увидел бы «сервер не отвечает»
// вместо честного «токен не подошёл»
const looksLikeToken = value => /^[\x21-\x7E]+$/.test(value);

$('tokenForm').addEventListener('submit', async e => {
  e.preventDefault();
  token = e.target.elements.token.value.trim();
  if (!looksLikeToken(token)) {
    token = null;
    showGate('Токен не подошёл.');
    return;
  }
  try {
    await api('/api/admin/registrations?status=pending');
    sessionStorage.setItem(KEY, token);
    showAdmin();
    await refresh();
  } catch (err) {
    token = null;
    showGate(err.status === 401 ? 'Токен не подошёл.' : 'Сервер не отвечает. Он запущен?');
  }
});

$('adminLogout').addEventListener('click', () => {
  sessionStorage.removeItem(KEY);
  token = null;
  location.reload();
});

/* ---------- Люди ---------- */

const fmtWhen = iso => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  .format(new Date(iso));
const fmtDate = iso => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: '2-digit' })
  .format(new Date(iso));

/* Срок доступа к кабинету. Пусто — бессрочно; дата в прошлом закрывает вход
   сразу, в том числе на уже открытом устройстве. */
async function askAccess(person) {
  const current = person.accessUntil ? String(person.accessUntil).slice(0, 10) : '';
  const answer = prompt(
    `До какой даты открыт кабинет ${person.displayName}?\nФормат 2026-12-31, пусто — бессрочно`,
    current
  );
  if (answer === null) return;
  const until = answer.trim() || null;
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) { showError('Дата в виде 2026-12-31'); return; }
  await withBusy(async () => {
    await api(`/api/admin/users/${person.id}/access`, { method: 'POST', body: JSON.stringify({ until }) });
    await loadPeople();
  });
}

async function loadPeople() {
  const people = await api(`/api/admin/registrations?status=${status}`);
  $('adminCount').textContent = `${people.length}`;
  if (!people.length) {
    $('peopleList').replaceChildren(h('li', { class: 'empty', text: 'Пусто' }));
    return;
  }
  $('peopleList').replaceChildren(...people.map(person => renderPerson(person)));
}

function renderPerson(person) {
  const contacts = [person.email, person.phone, person.telegramId].filter(Boolean).join(' · ');
  const actions = [];

  if (person.status === 'pending') {
    actions.push(h('button', {
      type: 'button', class: 'btn primary grow', text: 'Одобрить и выдать пароль',
      onclick: () => withBusy(async () => {
        const result = await api(`/api/admin/registrations/${person.id}/approve`, { method: 'POST' });
        showPassword(result.password, `${result.displayName} · ${result.email}`);
        await loadPeople();
      })
    }));
  } else {
    /* На виду — то, ради чего сюда заходят каждый день. Всё остальное под
       шестерёнкой: пять кнопок в ряд, среди них «Заблокировать» красным,
       превращали список людей в пульт. */
    actions.push(h('button', {
      type: 'button', class: 'btn grow', text: t('adm.quantumCabinet'),
      onclick: () => openQuantum(person)
    }));
    actions.push(h('button', {
      type: 'button', class: 'icon-btn head-btn', 'aria-label': t('adm.personSettings'),
      title: t('adm.personSettings'),
      onclick: () => openPerson(person)
    }, svgIcon(ICONS.gear, 19)));
  }

  /* Лицо в списке: специалист ведёт людей, а не строки с почтой. Фотографию
     присылает само устройство человека уже сжатой — отдельного запроса за
     ней нет, она приходит вместе со списком. */
  const face = h('span', { class: `person-photo${person.avatar ? ' has-photo' : ''}` });
  if (person.avatar) face.appendChild(h('img', { src: person.avatar, alt: '' }));
  else face.textContent = (person.displayName || '·').trim().charAt(0).toUpperCase();

  return h('li', { class: `person ${person.status}` },
    h('div', { class: 'person-head' },
      face,
      h('div', { class: 'person-who' },
        h('b', { text: person.displayName }),
        h('span', { class: 'contacts', text: contacts })),
      h('time', { text: fmtWhen(person.approvedAt || person.createdAt) })),
    h('div', { class: 'person-actions' }, ...actions));
}

function showPassword(password, who) {
  $('passwordValue').textContent = password;
  $('passwordFor').textContent = who;
  $('passwordDialog').showModal();
}
$('closePassword').addEventListener('click', () => $('passwordDialog').close());
$('copyPassword').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('passwordValue').textContent);
    $('copyPassword').textContent = 'Скопировано';
  } catch {
    $('copyPassword').textContent = 'Не вышло — перепишите';
  }
});

/* ---------- Содержание квантового модуля ---------- */

async function loadPhrases() {
  phrases = await api('/api/admin/quantum/phrases');
  $('phraseCount').textContent = `${phrases.length}`;
  if (!phrases.length) {
    $('phraseList').replaceChildren(h('li', { class: 'empty', text: 'Фраз пока нет' }));
    return;
  }
  $('phraseList').replaceChildren(...phrases.map(p => h('li', { class: `phrase${p.active ? '' : ' off'}` },
    h('span', { class: 'slot', text: `${SLOTS[p.slot]} ${LANGS[p.language]}` }),
    h('div', {},
      h('span', { class: 'text', text: p.text }),
      h('span', { class: 'meta', text: p.isCommon ? 'общая' : 'только по назначению' })),
    h('button', {
      type: 'button', class: 'remove', text: '×', 'aria-label': 'Убрать',
      onclick: () => withBusy(async () => {
        await api(`/api/admin/quantum/phrases/${p.id}`, {
          method: 'POST', body: JSON.stringify({ active: !p.active })
        });
        await loadPhrases();
      })
    }))));
}

$('phraseForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  const text = f.text.value.trim();
  if (!text) return;
  await withBusy(async () => {
    await api('/api/admin/quantum/phrases', {
      method: 'POST',
      body: JSON.stringify({
        slot: f.slot.value, language, text, isCommon: f.isCommon.checked
      })
    });
    f.text.value = '';
    await loadPhrases();
  });
});

/* Персональный набор фраз переехал вкладкой в квантовый кабинет —
   см. renderAssignBlock выше. Отдельный диалог убран вместе с кнопкой. */

/* ---------- Сбои с устройств ---------- */

const fmtLogTime = iso => new Intl.DateTimeFormat('ru', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
}).format(new Date(iso));

async function loadLogs() {
  const logs = await api('/api/admin/logs?limit=100');
  if (!logs.length) {
    $('logList').replaceChildren(h('li', { class: 'empty', text: 'Сбоев нет — и хорошо' }));
    return;
  }
  $('logList').replaceChildren(...logs.map(l => {
    const meta = [fmtLogTime(l.happenedAt)];
    if (l.accountNo) meta.push('кабинет ' + String(l.accountNo).padStart(9, '0'));
    if (l.displayName) meta.push(l.displayName);
    if (l.release) meta.push('выкладка ' + l.release);
    if (l.page) meta.push(l.page);
    return h('li', { class: 'log-row' },
      h('div', { class: 'msg', text: l.message }),
      h('div', { class: 'meta' }, ...meta.map(x => h('span', { text: x }))),
      l.stack ? h('pre', { text: l.stack }) : null,
      l.userAgent ? h('div', { class: 'meta' }, h('span', { text: l.userAgent })) : null);
  }));
}

$('reloadLogs').addEventListener('click', () => withBusy(loadLogs));

/* ---------- Общее ---------- */

async function withBusy(fn) {
  document.body.setAttribute('aria-busy', 'true');
  try {
    await fn();
  } catch (err) {
    if (err.status === 401) { showGate('Токен больше не подходит.'); return; }
    // Сообщение на странице, а не alert(): модальное окно браузера вешает
    // и проверку, и работу — человек не видит, что произошло
    showError(`Не получилось: ${err.message}`);
  } finally {
    document.body.removeAttribute('aria-busy');
  }
}

async function refresh() {
  await withBusy(async () => {
    await loadPhrases();
    await loadPeople();
  });
}

$('adminTabs').addEventListener('click', e => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  $('adminTabs').querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  $('tabPeople').hidden = tab !== 'people';
  $('tabContent').hidden = tab !== 'content';
  $('tabLogs').hidden = tab !== 'logs';
  if (tab === 'logs') withBusy(loadLogs);
});

$('statusTabs').addEventListener('click', e => {
  const next = e.target.dataset.status;
  if (!next) return;
  status = next;
  $('statusTabs').querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.status === status)));
  withBusy(loadPeople);
});

/* Пробует ключ и говорит, подошёл ли. Ошибку связи от отказа отличаем:
   «сервер не отвечает» и «не пускают» лечатся по-разному. */
async function keyWorks(candidate) {
  const previous = token;
  token = candidate;
  try {
    await api('/api/admin/registrations?status=pending');
    return true;
  } catch (err) {
    token = previous;
    if (err.status !== 401) throw err;      // связь, а не отказ
    return false;
  }
}

async function boot() {
  // setStyle подключён, чтобы стили шли мимо запрета inline-style в CSP
  setStyle(document.body, 'min-height: 100vh');
  initPasswordEyes();

  // Язык берём тот же, что в ежедневнике; нет выбора — по браузеру
  language = pickLanguage(await getMeta('language').catch(() => null), navigator.languages);
  applyLanguage();
  $('adminLang').addEventListener('change', e => setLanguage(e.target.value));
  initUpdate('adminUpdate');

  // По порядку: служебный ключ этой вкладки, затем своя учётная запись
  const candidates = [sessionStorage.getItem(KEY), await getMeta('token').catch(() => null)];
  try {
    for (const candidate of candidates) {
      if (!candidate || !looksLikeToken(candidate)) continue;
      if (await keyWorks(candidate)) {
        showAdmin();
        await refresh();
        return;
      }
    }
    // Своя сессия есть, но роль не администраторская — это не повод молчать
    showGate(candidates[1] ? 'Этот кабинет не администраторский.' : '');
  } catch {
    showGate('Сервер не отвечает. Он запущен?');
  }
}

boot();


/* ---------- Квантовый кабинет одного человека ----------

   Фазы дня и дни недели настраиваются раздельно, и в каждом блоке — текст,
   звук и картинка; у дня недели ещё и цвет. Блоки независимы: правка одного
   уходит на сервер сама по себе и не трогает остальные. Так специалист может
   настроить только утро и уйти, ничего не «сохраняя целиком».

   Человек со своего телефона сюда не попадает: сервер пускает только роль
   администратора (ТЗ, раздел про доступ). */

const SLOT_KEYS = [
  ['morning', 'adm.slotMorning'],
  ['day', 'adm.slotDay'],
  ['evening', 'adm.slotEvening'],
  ['frame', 'adm.slotFrame']
];
// 1 — понедельник, как в ISO и в базе (to_char(date, 'ID'))
const WEEKDAY_KEYS = [
  ['1', 'adm.mon'], ['2', 'adm.tue'], ['3', 'adm.wed'], ['4', 'adm.thu'],
  ['5', 'adm.fri'], ['6', 'adm.sat'], ['7', 'adm.sun']
];

let quantumPerson = null;
let quantumKind = 'slot';
let quantumSettings = [];

async function openQuantum(person) {
  quantumPerson = person;
  quantumKind = 'slot';
  $('quantumFor').textContent = `${person.displayName} · ${person.email}`;
  await withBusy(async () => {
    quantumSettings = await api(`/api/admin/users/${person.id}/quantum/settings`);
  });
  renderQuantumTabs();
  renderQuantumBlocks();
  $('quantumDialog').showModal();
}

function renderQuantumTabs() {
  $('quantumTabs').querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.qkind === quantumKind)));
}

const settingOf = (kind, key) =>
  quantumSettings.find(x => x.kind === kind && x.key === key) || {};

/* Третья вкладка — персональный набор фраз. Раньше он жил отдельной кнопкой
   в карточке и путал: снаружи было непонятно, чем «Фразы» отличаются от
   «Содержания». Это одно и то же про одного человека, поэтому и место одно. */
async function renderQuantumBlocks() {
  if (quantumKind === 'phrases') return renderAssignBlock();
  const keys = quantumKind === 'slot' ? SLOT_KEYS : WEEKDAY_KEYS;
  $('quantumBlocks').replaceChildren(...keys.map(([key, labelKey]) =>
    quantumBlock(quantumKind, key, t(labelKey))));
}

async function renderAssignBlock() {
  const box = $('quantumBlocks');
  box.replaceChildren(h('p', { class: 'muted m0', text: t('adm.loading') }));
  let assigned;
  try {
    assigned = new Set(await api(`/api/admin/users/${quantumPerson.id}/quantum/phrases`));
  } catch {
    box.replaceChildren(h('p', { class: 'muted m0', text: t('adm.saveFailed') }));
    return;
  }
  if (!phrases.length) {
    box.replaceChildren(h('p', { class: 'muted m0', text: t('adm.noPhrasesYet') }));
    return;
  }
  box.replaceChildren(
    h('p', { class: 'muted m0', text: t('adm.assignNote') }),
    h('ul', { class: 'phrases mt10' }, ...phrases.map(p => h('li', { class: 'phrase' },
      h('input', {
        type: 'checkbox', value: p.id, checked: assigned.has(p.id), 'aria-label': p.text,
        onchange: saveAssigned
      }),
      h('div', {},
        h('span', { class: 'text', text: p.text }),
        h('span', { class: 'meta', text: `${SLOTS[p.slot]} · ${LANGS[p.language]}` })),
      h('span', {})))));
}

// Отметку сохраняем сразу: отдельная кнопка «Сохранить» на списке галочек —
// лишний шаг, о котором забывают, и набор молча остаётся прежним
async function saveAssigned() {
  const ids = [...$('quantumBlocks').querySelectorAll('input:checked')].map(i => i.value);
  try {
    await api(`/api/admin/users/${quantumPerson.id}/quantum/phrases`, {
      method: 'POST', body: JSON.stringify({ phraseIds: ids })
    });
  } catch {
    showError(t('adm.saveFailed'));
  }
}

function quantumBlock(kind, key, label) {
  const value = settingOf(kind, key);
  const filled = Boolean(value.text || value.color || value.imageUrl || value.audioUrl);

  const field = (name, placeholderKey, type = 'text') => h('label', {},
    h('span', { text: t(placeholderKey) }),
    h('input', { type, name, value: value[name] || '' }));

  const body = h('div', { class: 'q-block-body' },
    h('label', {},
      h('span', { text: t('adm.text') }),
      h('textarea', { name: 'text', maxlength: 600, value: value.text || '' })),
    /* Цвет — только у дня недели: у фазы он берётся из чакры дня.

       Галочка нужна потому, что поле выбора цвета НИКОГДА не бывает пустым:
       очистить его нельзя, браузер вернёт чёрный. Без галочки «вернуть общий
       цвет» было бы невозможно — настройка навсегда перекрывала бы чакру. */
    kind === 'weekday'
      ? h('div', { class: 'q-color' },
          h('label', { class: 'q-color-use' },
            h('input', { type: 'checkbox', name: 'useColor', checked: Boolean(value.color) }),
            h('span', { text: t('adm.ownColor') })),
          h('input', { type: 'color', name: 'color', value: value.color || '#2b3a8c' }))
      : null,
    field('imageUrl', 'adm.imageUrl', 'url'),
    field('audioUrl', 'adm.audioUrl', 'url'),
    h('div', { class: 'q-block-foot' },
      h('button', {
        type: 'button', class: 'btn primary', text: t('adm.save'),
        onclick: e => saveBlock(e.target.closest('.q-block'), kind, key)
      }),
      h('span', { class: 'q-block-said', role: 'status' })));

  return h('details', { class: `q-block ${filled ? 'filled' : ''}`, 'data-key': key },
    h('summary', {},
      h('b', { text: label }),
      h('span', { class: 'q-block-mark', text: filled ? t('adm.configured') : t('adm.notSet') })),
    body);
}

async function saveBlock(block, kind, key) {
  const said = block.querySelector('.q-block-said');
  const read = name => (block.querySelector(`[name=${name}]`) || {}).value || '';
  const useColor = block.querySelector('[name=useColor]')?.checked;
  const payload = {
    kind, key,
    text: read('text'),
    // Галочка снята — цвет не отправляем вовсе: вернётся общий цвет чакры
    color: kind === 'weekday' && useColor ? read('color') : '',
    imageUrl: read('imageUrl'),
    audioUrl: read('audioUrl')
  };
  try {
    const saved = await api(`/api/admin/users/${quantumPerson.id}/quantum/settings`, {
      method: 'POST', body: JSON.stringify(payload)
    });
    // Сервер вернул 204 — настройка стёрта, потому что в ней ничего не осталось
    quantumSettings = quantumSettings.filter(x => !(x.kind === kind && x.key === key));
    if (saved) quantumSettings.push(saved);
    said.textContent = saved ? t('adm.saved') : t('adm.cleared');
    block.classList.toggle('filled', Boolean(saved));
    block.querySelector('.q-block-mark').textContent = saved ? t('adm.configured') : t('adm.notSet');
  } catch (err) {
    said.textContent = err.status === 400 ? t('adm.checkFields') : t('adm.saveFailed');
  }
  setTimeout(() => { said.textContent = ''; }, 4000);
}

$('quantumTabs').addEventListener('click', e => {
  const kind = e.target.dataset.qkind;
  if (!kind) return;
  quantumKind = kind;
  renderQuantumTabs();
  renderQuantumBlocks();
});
$('closeQuantum').addEventListener('click', () => $('quantumDialog').close());

/* ---------- Настройки клиента: всё, что было в карточке ----------

   ПАРОЛЬ ПОКАЗАТЬ НЕЛЬЗЯ, И ЭТО НЕ НЕДОРАБОТКА. В базе лежит только его хэш —
   строка, из которой пароль не восстанавливается. Так сделано намеренно:
   утечка базы не даёт войти ни в один кабинет. Поэтому здесь видно не сам
   пароль, а его состояние — выданный администратором или уже сменённый
   человеком, — и кнопку выдать новый. Новый показывается один раз. */

let personOpen = null;

function openPerson(person) {
  personOpen = person;
  $('personFor').textContent = `${person.displayName} · ${person.email}`;

  $('personPasswordState').textContent = person.passwordChangedAt
    ? t('adm.passwordOwn')
    : t('adm.passwordIssuedStill');

  $('personAccessState').textContent = person.accessUntil
    ? t('adm.accessUntilDate', { date: fmtDate(person.accessUntil) })
    : t('adm.accessForever');

  const blocked = person.status === 'blocked';
  $('personStatusState').textContent = blocked ? t('adm.isBlocked') : t('adm.isActive');
  $('personBlock').textContent = blocked ? t('adm.unblock') : t('adm.block');
  $('personBlock').classList.toggle('danger', !blocked);

  $('personDialog').showModal();
}

$('personNewPassword').addEventListener('click', () => withBusy(async () => {
  const result = await api(`/api/admin/users/${personOpen.id}/reset-password`, { method: 'POST' });
  showPassword(result.password, `${result.displayName} · ${result.email}`);
  $('personPasswordState').textContent = t('adm.passwordIssuedStill');
}));

$('personAccess').addEventListener('click', () => {
  $('personDialog').close();
  askAccess(personOpen);
});

$('personBlock').addEventListener('click', () => withBusy(async () => {
  const blocked = personOpen.status === 'blocked';
  await api(`/api/admin/users/${personOpen.id}/${blocked ? 'unblock' : 'block'}`, { method: 'POST' });
  $('personDialog').close();
  await loadPeople();
}));

$('personBack').addEventListener('click', () => $('personDialog').close());
$('personClose').addEventListener('click', () => $('personDialog').close());
