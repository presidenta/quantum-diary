import { API_BASE } from './config.js';
import { getMeta, setMeta, clearAll } from './db.js';
import { sessionChange } from './core/session.js';

async function api(path, body, token = null) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data;
}

/* Первый администратор. Работает, только пока их нет ни одного: дальше сервер
   отвечает 409, и этот адрес закрыт навсегда. Пароль задаёт сам человек. */
export function createFirstAdmin({ displayName, email, password }) {
  return api('/api/setup', { displayName, email, password });
}

// Заявка: статус pending, пока администратор не одобрит
export function requestAccess({ displayName, email, phone, telegramId }) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return api('/api/registration', {
    displayName, email,
    phone: phone || undefined,
    telegramId: telegramId || undefined,
    timezone
  });
}

// Входят почтой или номером кабинета — что из этого, разбирает сервер
export async function login(login, password) {
  const { token, userId } = await api('/api/session/login', { login, password });
  const previous = await getMeta('userId');
  if (sessionChange(previous, userId) === 'clear') {
    await clearAll();            // стирает и token, и cursor, и все данные
  }
  await setMeta('token', token);
  await setMeta('userId', userId);
  return token;
}

/* Смена своего пароля. Старый спрашиваем обязательно, а после смены
   остальные устройства выходят — это делает сервер. */
export async function changeOwnPassword(currentPassword, newPassword) {
  const token = await getMeta('token');
  return api('/api/me/password', { currentPassword, newPassword }, token);
}

export async function hasSession() {
  return Boolean(await getMeta('token'));
}

export async function fetchMe() {
  const token = await getMeta('token');
  if (!token) return null;
  const res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? res.json() : null;
}

/* Явный выход — например, чтобы на этом устройстве работал другой человек.
   Закрываем сессию и на сервере: иначе её токен действовал бы и дальше.
   Локальную копию стираем здесь же, не дожидаясь чужого входа. */
/* МЯГКИЙ ВЫХОД: закрывается сессия, записи остаются на устройстве.

   Раньше выход стирал всё, и спросить об этом приходилось страшным окном
   «выйти и стереть данные этого человека». Человек выходит, чтобы закрыть
   вход, а не чтобы потерять дневник.

   Чужого человека это не пустит в чужие записи: userId намеренно остаётся, и
   при следующем входе login() сравнивает его с вошедшим — другой человек
   получает чистое устройство (см. sessionChange). Стереть всё по своей воле
   можно отдельной кнопкой в профиле. */
export async function logout() {
  const token = await getMeta('token');
  if (API_BASE && token) {
    await api('/api/session/logout', {}, token).catch(() => {});   // нет сети — выходим хотя бы здесь
  }
  await setMeta('token', null);
}

// Выход со стиранием: только по явной просьбе человека
export async function logoutAndClear() {
  await logout();
  await clearAll();
}
