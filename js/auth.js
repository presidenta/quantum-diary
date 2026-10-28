import { API_BASE } from './config.js';
/* Запрос мимо браузерных ограничений: без него вход и регистрация
   в установленном приложении не работают (см. core/net.js). */
import { request } from './core/net.js';
import { getMeta, setMeta, clearAll } from './db.js';
import { sessionChange } from './core/session.js';
import { forgetMedia } from './core/media.js';

async function api(path, body, token = null) {
  const res = await request(API_BASE + path, {
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
    // Скачанные практики предыдущего человека тоже убираем: они лежат в
    // отдельном хранилище, и clearAll() до них не достаёт
    await forgetMedia();
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

/* ПРОФИЛЬ ЖИВЁТ И НА УСТРОЙСТВЕ (выкладка 202). Владелец 28.10.2026: «куда-то исчезла фотография с
   аватарки… она должна там постоянно находиться, пока человек её сам не заберёт». Фото хранилось только
   на сервере и бралось оттуда при каждом запуске: не ответил сервер в первые секунды (телефон проснулся
   без связи, сервер перезапускался) — до конца сессии вместо фото стояла точка. Теперь каждый ответ
   сервера кладётся на устройство (meta «me»), и приложение показывает его сразу; сервер лишь обновляет.
   Сбой связи профиль не трогает: null значит «не узнали», а не «фото нет». */
export async function fetchMe() {
  const token = await getMeta('token');
  if (!token) return null;
  try {
    const res = await request(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const me = await res.json();
    if (me && typeof me === 'object') await setMeta('me', me);
    return me;
  } catch {
    return null;
  }
}

/** Профиль с устройства — последний ответ сервера, только того же человека, что вошёл. */
export async function cachedMe() {
  const [me, userId] = await Promise.all([getMeta('me'), getMeta('userId')]);
  return me && userId != null && String(me.id) === String(userId) ? me : null;
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
/* Фотография: пустая строка её убирает. Сжатие делает устройство (profile.js),
   сюда приходит уже готовая строка — сервер больших снимков не принимает. */
export async function saveAvatar(avatar) {
  const token = await getMeta('token');
  const res = await fetch(`${API_BASE}/api/me/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ avatar })
  });
  if (!res.ok) {
    const err = new Error('avatar_failed');
    err.status = res.status;
    throw err;
  }
  const сохранено = (await res.json()).avatar;
  // Профиль на устройстве — тот же, что на сервере (выкладка 202)
  const me = await getMeta('me');
  if (me) await setMeta('me', { ...me, avatar: сохранено });
  return сохранено;
}

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
