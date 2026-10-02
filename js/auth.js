import { API_BASE } from './config.js';
import { getMeta, setMeta, clearAll } from './db.js';

async function api(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

// Курсор синхронизации не трогаем: если это та же учётная запись на том же
// устройстве, прежние данные и курсор остаются в силе, второй раз всё не грузим
export async function login(email, password) {
  const { token } = await api('/api/session/login', { email, password });
  await setMeta('token', token);
  return token;
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

// Явный выход — например, чтобы на этом устройстве войти другим человеком.
// Стираем и локальные данные: иначе на экране остались бы чужие сферы и цели
export async function logoutAndClear() {
  await clearAll();
}
