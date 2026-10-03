/* Кабинет администратора: заявки, пароли, блокировки и содержание
   квантового модуля. Вход — по токену из .env сервера (ADMIN_TOKEN).

   Токен хранится в sessionStorage, а не в localStorage: закрыли вкладку —
   он пропал. Это ключ от чужих заявок, ему не место в долгой памяти браузера. */

import { API_BASE } from './config.js';
import { h, setStyle } from './store.js';
import { initPasswordEyes } from './password-eye.js';

const $ = id => document.getElementById(id);
const KEY = 'planner.adminToken';
const SLOTS = { morning: 'Утро', day: 'День', evening: 'Вечер', frame: 'Кадр' };
const LANGS = { ru: 'RU', uk: 'UK', en: 'EN' };

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
    actions.push(h('button', {
      type: 'button', class: 'btn grow', text: 'Новый пароль',
      onclick: () => withBusy(async () => {
        const result = await api(`/api/admin/users/${person.id}/reset-password`, { method: 'POST' });
        showPassword(result.password, `${result.displayName} · ${result.email}`);
      })
    }));
    actions.push(h('button', {
      type: 'button', class: 'btn', text: 'Содержание',
      onclick: () => openAssign(person)
    }));
    actions.push(h('button', {
      type: 'button', class: 'btn',
      text: person.accessUntil ? `Срок: ${fmtDate(person.accessUntil)}` : 'Срок доступа',
      onclick: () => askAccess(person)
    }));
    actions.push(person.status === 'blocked'
      ? h('button', {
          type: 'button', class: 'btn', text: 'Разблокировать',
          onclick: () => withBusy(async () => {
            await api(`/api/admin/users/${person.id}/unblock`, { method: 'POST' });
            await loadPeople();
          })
        })
      : h('button', {
          type: 'button', class: 'btn danger', text: 'Заблокировать',
          onclick: () => withBusy(async () => {
            if (!confirm(`Закрыть доступ для ${person.displayName}? Все его входы оборвутся сразу.`)) return;
            await api(`/api/admin/users/${person.id}/block`, { method: 'POST' });
            await loadPeople();
          })
        }));
  }

  return h('li', { class: `person ${person.status}` },
    h('div', { class: 'person-head' },
      h('div', {},
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
        slot: f.slot.value, language: f.language.value, text, isCommon: f.isCommon.checked
      })
    });
    f.text.value = '';
    await loadPhrases();
  });
});

let assignUser = null;

async function openAssign(person) {
  assignUser = person;
  $('assignFor').textContent = `${person.displayName} · ${person.email}`;
  const assigned = new Set(await api(`/api/admin/users/${person.id}/quantum/phrases`));
  $('assignList').replaceChildren(...phrases.map(p => h('li', { class: 'phrase' },
    h('input', { type: 'checkbox', value: p.id, checked: assigned.has(p.id), 'aria-label': p.text }),
    h('div', {},
      h('span', { class: 'text', text: p.text }),
      h('span', { class: 'meta', text: `${SLOTS[p.slot]} · ${LANGS[p.language]}` })),
    h('span', {}))));
  $('assignDialog').returnValue = '';
  $('assignDialog').showModal();
}

$('assignDialog').addEventListener('close', async () => {
  if ($('assignDialog').returnValue !== 'save' || !assignUser) return;
  const ids = [...$('assignList').querySelectorAll('input:checked')].map(i => i.value);
  await withBusy(() => api(`/api/admin/users/${assignUser.id}/quantum/phrases`, {
    method: 'POST', body: JSON.stringify({ phraseIds: ids })
  }));
});

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

async function boot() {
  // setStyle подключён, чтобы стили шли мимо запрета inline-style в CSP
  setStyle(document.body, 'min-height: 100vh');
  initPasswordEyes();
  token = sessionStorage.getItem(KEY);
  if (!token) { showGate(); return; }
  try {
    await api('/api/admin/registrations?status=pending');
    showAdmin();
    await refresh();
  } catch (err) {
    token = null;
    showGate(err.status === 401 ? 'Токен не подошёл.' : 'Сервер не отвечает. Он запущен?');
  }
}

boot();
