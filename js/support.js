/* РАЗДЕЛ АДМИНИСТРАТОРА В КАБИНЕТЕ УЧАСТНИКА (выкладка 165).

   Владелец 19.10.2026: «в каждом кабинете участника должен быть раздел администратора, но вход в него
   только под паролем администратора — на устройстве любого участника, чтобы настроить ему кабинет и
   помочь пользоваться приложением».

   Кнопка «Администратор» стоит в профиле у всех — и у участника, и у самого администратора. Нажатие
   спрашивает логин и пароль АДМИНИСТРАТОРА (не участника). Сервер (server/src/support.js) проверяет их
   и выдаёт короткий токен «сессии поддержки», годный только для этого участника и только для
   /api/support/…. Участник при этом остаётся собой: его обычная сессия не меняется, прав у него не
   прибавляется.

   Чего здесь НЕТ нарочно:
     • пароль администратора и токен поддержки живут только в памяти страницы: ни в базе устройства, ни в
       localStorage, ни в журнале. Закрыл раздел или обновил страницу — всё забыто, нужен новый ввод;
     • полей для сохранения пароля браузером (autocomplete=new-password): чужое устройство не должно
       запомнить пароль администратора;
     • опасных действий над самой учётной записью (новый пароль, блокировка): они остались на странице
       администратора — выдать участнику новый пароль, пока он держит телефон в руках, значило бы
       выбросить его из кабинета посреди помощи.

   Что есть: настройка квантового кабинета этого участника (фазы дня, дни недели, персональные фразы —
   общий редактор views/cabinet-editor.js) и журнал сбоев на его устройствах. */

import { API_BASE } from './config.js';
import { request } from './core/net.js';
import { getMeta } from './db.js';
import { state, t, $, h } from './store.js';
import { createCabinetEditor } from './views/cabinet-editor.js';
/* Блок «Записать / Файл / Фото» — тот же, что на странице администратора (core/media-box.js). */
import { mediaBox } from './core/media-box.js';

// Токен и сведения об участнике — только пока открыт раздел
let session = null;

/* Запрос к серверу своим токеном (участника при входе, поддержки — дальше). Ответ 204 — null. */
async function call(path, { token, ...options } = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await request(API_BASE + path, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data;
}

/* Запрос от имени сессии поддержки. 401 — сессия закончилась (простой, срок, разжалование): раздел
   закрывается с понятной причиной, а не показывает «не сохранилось» на каждой кнопке. */
async function supportApi(path, options = {}) {
  if (!session) throw Object.assign(new Error('closed'), { status: 401 });
  try {
    return await call(path, { ...options, token: session.token });
  } catch (err) {
    if (err.status === 401 && session) {
      closePanel();
      openGate(t('support.expired'));
    }
    throw err;
  }
}

const when = iso => (iso ? new Intl.DateTimeFormat(state.language, {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(iso)) : '—');

/* ---------- Вход ---------- */

function openGate(message = '') {
  const form = $('supportGateForm');
  form.reset();
  const msg = $('supportGateMsg');
  msg.textContent = message;
  msg.className = message ? 'gate-msg is-error' : 'gate-msg';
  $('supportGateDialog').showModal();
}

// Что сказать человеку по ответу сервера: перебор паролей и потеря входа участника — разные беды
function gateMessage(err) {
  if (err.status === 429) return t('support.tooMany');
  if (err.code === 'invalid_credentials') return t('support.wrong');
  if (err.status === 401) return t('support.participantLost');
  return t('support.offline');
}

async function enter(form) {
  const f = form.elements;
  const button = f.enter;
  button.disabled = true;
  try {
    const result = await call('/api/support/login', {
      method: 'POST',
      token: await getMeta('token'),
      body: JSON.stringify({ login: f.login.value.trim(), password: f.password.value })
    });
    session = { token: result.token, cabinet: result.cabinet };
    $('supportGateDialog').close();
    openPanel();
  } catch (err) {
    $('supportGateMsg').textContent = gateMessage(err);
    $('supportGateMsg').className = 'gate-msg is-error';
  } finally {
    // Пароль не остаётся в поле ни при успехе, ни при отказе
    f.password.value = '';
    button.disabled = false;
  }
}

/* ---------- Раздел ---------- */

function accessText(cabinet) {
  return cabinet.accessUntil
    ? t('support.accessUntil', { date: new Intl.DateTimeFormat(state.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(cabinet.accessUntil)) })
    : t('support.accessForever');
}

function openPanel() {
  const c = session.cabinet;
  $('supportFor').textContent = t('support.for', { name: c.displayName, no: String(c.accountNo).padStart(9, '0') });
  $('supportState').textContent = t('support.state', { access: accessText(c), seen: when(c.lastSeenAt) });

  const editor = createCabinetEditor({
    t, api: supportApi,
    endpoints: { settings: '/api/support/cabinet/settings', phrases: '/api/support/cabinet/phrases' },
    loadLibrary: () => supportApi('/api/support/phrases'),
    /* Аудио и фото к каждой фазе и дню недели — как обычно. Файлы кладутся на ЭТО устройство под
       ключом «qs:<участник>:<вид>:<имя>», и экраны практик участника берут их оттуда
       (views/quantum.js, deviceMedia): администратор сидит с участником и добавляет файлы прямо на его
       телефоне — там они и будут звучать и показываться. */
    extras: (kind, key) => mediaBox(`qs:${c.id}:${kind}:${key}`, { note: t('support.mediaNote') }),
    onError: message => { $('supportMsg').textContent = message; }
  });
  $('supportEditor').replaceChildren(editor.element);
  $('supportErrors').replaceChildren();
  $('supportErrorsBox').open = false;
  $('supportMsg').textContent = '';
  editor.load().catch(() => {});             // 401 уже обработан в supportApi, остальное покажет сам редактор
  $('supportDialog').showModal();
}

async function loadErrors() {
  const list = $('supportErrors');
  list.replaceChildren(h('li', { class: 'muted', text: t('adm.loading') }));
  try {
    const errors = await supportApi('/api/support/cabinet/errors');
    list.replaceChildren(...(errors.length
      ? errors.map(e => h('li', { class: 'support-error' },
        h('time', { text: when(e.happenedAt) }),
        h('span', { text: e.message }),
        h('small', { class: 'muted', text: [e.page, e.release && `v${e.release}`].filter(Boolean).join(' · ') })))
      : [h('li', { class: 'muted', text: t('support.noErrors') })]));
  } catch {
    list.replaceChildren(h('li', { class: 'muted', text: t('adm.saveFailed') }));
  }
}

/* Закрыть раздел: сессия закрывается и на сервере, а не только забывается здесь (иначе токен жил бы
   до конца простоя). Нет сети — забываем хотя бы здесь: токен жил только в памяти. */
function closePanel() {
  const ended = session;
  session = null;
  $('supportEditor').replaceChildren();
  $('supportErrors').replaceChildren();
  if ($('supportDialog').open) $('supportDialog').close();
  if (ended) call('/api/support/logout', { method: 'POST', token: ended.token }).catch(() => {});
}

export function initSupport() {
  // Без сервера (работа только на устройстве) входить некуда
  $('supportOpen').hidden = !API_BASE;
  $('supportOpen').addEventListener('click', () => openGate());

  $('supportGateForm').addEventListener('submit', event => {
    event.preventDefault();
    enter(event.target);
  });
  $('supportGateCancel').addEventListener('click', () => $('supportGateDialog').close());

  $('supportErrorsBox').addEventListener('toggle', () => {
    if ($('supportErrorsBox').open) loadErrors();
  });
  // Закрыли любым способом — «Готово», Esc, жест «назад» — раздел закрывается целиком
  $('supportDialog').addEventListener('close', closePanel);
  $('supportExit').addEventListener('click', closePanel);
}
