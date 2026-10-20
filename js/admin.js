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
import { request } from './core/net.js';
/* Блок «Записать / Файл / Фото» — тот самый, что в «Настройке
   Реальностей». Один модуль на все экраны, см. core/media-box.js. */
import { mediaBox } from './core/media-box.js';
import { getDoorAudio, saveDoorAudio, deleteDoorAudio } from './views/space/audio.js';
import { getDoorPhotos, addDoorPhotos, deleteDoorPhotos } from './views/space/photos.js';
import { initUpdate } from './update.js';
import { createCabinetEditor, SLOT_NAMES as SLOTS, LANG_CODES as LANGS } from './views/cabinet-editor.js';

const $ = id => document.getElementById(id);
const KEY = 'planner.adminToken';

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
  const res = await request(base + path, { ...options, headers });
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
      type: 'button', class: 'btn primary grow',
      onclick: () => withBusy(async () => {
        const result = await api(`/api/admin/registrations/${person.id}/approve`, { method: 'POST' });
        showPassword(result.password, `${result.displayName} · ${result.email}`);
        await loadPeople();
      })
    }, h('span', { class: 'gold-cut', text: 'Одобрить и выдать пароль' })));
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

/* ЗВУК И СНИМКИ У ФРАЗЫ.

   Пока фраза не отправлена, у неё нет номера, а файлам уже надо где-то
   лежать. Поэтому они складываются под черновым ключом, а после
   сохранения переезжают под номер созданной фразы — тогда их видно,
   если фразу открыть снова.

   Файлы живут на этом устройстве: в базе под картинку и звук отведено
   поле на 500 символов, то есть только ссылка, а хранилища файлов на
   сервере нет. Об этом сказано строкой под самим блоком — обещать
   человеку больше, чем есть, нельзя. */
const PHRASE_DRAFT = 'phrase:draft';

const phraseMedia = mediaBox(PHRASE_DRAFT, {
  note: 'Запись и снимки сохраняются на этом устройстве: места под файлы на сервере пока нет, другим людям они не достанутся.'
});
$('phraseMedia').appendChild(phraseMedia);

$('phraseForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  const text = f.text.value.trim();
  if (!text) return;
  await withBusy(async () => {
    const created = await api('/api/admin/quantum/phrases', {
      method: 'POST',
      body: JSON.stringify({
        slot: f.slot.value, language, text, isCommon: f.isCommon.checked
      })
    });

    // Файлы черновика переводим на созданную фразу и освобождаем черновик
    if (created && created.id) await moveMedia(PHRASE_DRAFT, `phrase:${created.id}`);
    await phraseMedia.setKey(PHRASE_DRAFT);

    f.text.value = '';
    await loadPhrases();
  });
});

/* Переезд файлов с одного ключа на другой. Отдельной функции «переименуй»
   в хранилище нет, да и незачем: перенос бывает ровно один раз, при
   сохранении черновика. */
async function moveMedia(from, to) {
  const zvuk = await getDoorAudio(from);
  if (zvuk) {
    await saveDoorAudio(to, zvuk.blob, zvuk.fileName);
    await deleteDoorAudio(from);
  }

  const foto = await getDoorPhotos(from);
  if (foto.length) {
    await addDoorPhotos(to, foto.map(p => p.blob));
    await deleteDoorPhotos(from);
  }
}

/* Персональный набор фраз переехал вкладкой в квантовый кабинет —
   см. views/cabinet-editor.js (вкладка «Фразы»). Отдельный диалог убран вместе с кнопкой. */

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

   Сам редактор — общий модуль (views/cabinet-editor.js): тот же стоит в разделе администратора на
   устройстве участника (js/support.js). Здесь ему отдают адреса «своего» человека и блок записи
   файлов, который есть только на этой странице. */

async function openQuantum(person) {
  $('quantumFor').textContent = `${person.displayName} · ${person.email}`;
  const editor = createCabinetEditor({
    t, api,
    endpoints: {
      settings: `/api/admin/users/${person.id}/quantum/settings`,
      phrases: `/api/admin/users/${person.id}/quantum/phrases`
    },
    loadLibrary: async () => phrases,
    /* Тот же блок, что в «Содержании» и в «Настройке Реальностей». Ключ собран из человека, вида
       настройки и её имени: у каждой фазы и каждого дня недели свои файлы, и они не путаются между
       собой. Поля со ссылками остаются рядом: ссылка достаётся всем, файл — только этому
       устройству, и это разные возможности, а не замена одной другой. */
    extras: (kind, key) => mediaBox(`qs:${person.id}:${kind}:${key}`, {
      note: 'Запись и снимки сохраняются на этом устройстве. Ссылка выше достаётся всем — места под файлы на сервере пока нет.'
    }),
    onError: showError
  });
  $('quantumEditor').replaceChildren(editor.element);
  await withBusy(() => editor.load());
  $('quantumDialog').showModal();
}

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
