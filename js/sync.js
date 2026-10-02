import { API_BASE } from './config.js';
import { KINDS, dirtyRecords, putRecords, getMeta, setMeta, loadAll } from './db.js';

/* Синхронизация без опроса по таймеру: при запуске, после правки (с паузой
   в полторы секунды, чтобы пачка правок ушла одним запросом), при возвращении
   на вкладку и при появлении сети. Требует вошедшего человека — без токена
   не пытается ничего отправить, а сообщает о потере сессии наружу. */

const DEBOUNCE_MS = 1500;
let timer = null;
let running = null;
let onStatus = () => {};
let onData = () => {};
let onAuthLost = () => {};

export function initSync({ status, data, authLost }) {
  onStatus = status;
  onData = data;
  onAuthLost = authLost || (() => {});
  if (!API_BASE) { onStatus('local'); return; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', () => syncNow());
  syncNow();
}

export function scheduleSync() {
  if (!API_BASE) return;
  // «Сохранено» не должно гореть, пока правка ещё на телефоне
  onStatus(navigator.onLine ? 'syncing' : 'offline');
  clearTimeout(timer);
  timer = setTimeout(syncNow, DEBOUNCE_MS);
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const strip = ({ dirty, ...rest }) => rest;

export function syncNow() {
  if (!API_BASE) return Promise.resolve();
  clearTimeout(timer);
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run() {
  const token = await getMeta('token');
  if (!token) { onStatus('idle'); onAuthLost(); return; }
  if (!navigator.onLine) { onStatus('offline'); return; }
  onStatus('syncing');
  try {
    const sent = await dirtyRecords();
    const changes = Object.fromEntries(KINDS.map(k => [k, sent[k].map(strip)]));
    const cursor = (await getMeta('cursor')) || 0;

    let result;
    try {
      result = await api('/api/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cursor, changes })
      });
    } catch (err) {
      if (err.status !== 401) throw err;
      // Сессия больше не действует (администратор заблокировал, или вышел срок) —
      // правки остаются помеченными dirty и дождутся следующего входа этой же записью
      await setMeta('token', null);
      onStatus('idle');
      onAuthLost();
      return;
    }

    const fresh = await merge(sent, result);
    await setMeta('cursor', result.cursor);
    if (result.rejected.length) console.warn('[sync] сервер отклонил записи:', result.rejected);
    onStatus('synced');
    // Перерисовываем, только если с сервера пришло новое, а не эхо своих правок:
    // лишняя перерисовка может съесть нажатие, пришедшееся на этот момент
    if (fresh) onData();

    // Пока шёл запрос, могли появиться новые правки
    const pending = await dirtyRecords();
    if (KINDS.some(k => pending[k].length)) scheduleSync();
  } catch (err) {
    console.warn('[sync] не удалось:', err.message);
    onStatus(navigator.onLine ? 'error' : 'offline');
  }
}

/* Слияние: побеждает более поздняя правка. Отправленная запись становится «чистой»,
   только если её не успели снова изменить на телефоне, пока шёл запрос. */
async function merge(sent, result) {
  const local = await loadAll();
  let fresh = 0;
  for (const kind of KINDS) {
    const byId = new Map(local[kind].map(r => [r.id, r]));
    const sentAt = new Map(sent[kind].map(r => [r.id, r.updatedAt]));
    const updates = [];

    for (const r of result.changes[kind]) {
      const mine = byId.get(r.id);
      if (mine && mine.dirty && mine.updatedAt > r.updatedAt) continue;
      if (mine?.updatedAt !== r.updatedAt) fresh++;
      updates.push({ ...r, dirty: 0 });
      byId.set(r.id, { ...r, dirty: 0 });
    }
    for (const [id, at] of sentAt) {
      const mine = byId.get(id);
      if (mine && mine.dirty && mine.updatedAt === at) updates.push({ ...mine, dirty: 0 });
    }
    if (updates.length) await putRecords(kind, updates);
  }
  return fresh;
}

export async function deleteAccount() {
  const token = await getMeta('token');
  if (API_BASE && token) {
    await api('/api/me', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
}
