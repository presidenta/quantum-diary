import { API_BASE } from './config.js';
import { request } from './core/net.js';
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
let onSynced = () => {};
let onWakeAt = () => 0;
let wakeTimer = null;

/* ВИДЫ, КОТОРЫЕ ЗНАЕТ СЕРВЕР (выкладка 158). Новый вид (настройки prefs) появляется в
   приложении раньше, чем владелец обновит сервер. Сервер отвечает записями всех своих видов —
   по ответу и видно, какие он знает. Неизвестный вид не отправляется: иначе его записи
   навсегда остались бы «не ушедшими», и синхронизация крутилась бы без конца. Пока ответа
   не было, новым видом считается только то, что добавлено после сервера с этим списком. */
const SERVER_KINDS = 'serverKinds';
const NEWER_KINDS = ['prefs'];

async function knownKinds() {
  const known = await getMeta(SERVER_KINDS);
  return Array.isArray(known) ? KINDS.filter(k => known.includes(k)) : KINDS.filter(k => !NEWER_KINDS.includes(k));
}

/**
 * @param {object} p
 * @param {(s: string) => void} p.status
 * @param {() => void} p.data        с сервера пришло новое
 * @param {() => void} [p.authLost]
 * @param {(kinds: string[]) => void} [p.synced]  синхронизация удалась; kinds — виды, что знает сервер
 * @param {() => number} [p.wakeAt]  когда спросить сервер ещё раз без повода (миг, мс; 0 — не
 *        спрашивать). Только приложению для компьютера: его окно спрятано в трей и на вкладку не
 *        возвращается, а виджетам на столе нужны правки с телефона. Не опрос по таймеру: один
 *        будильник до ближайшего события, после каждой синхронизации ставится заново
 */
export function initSync({ status, data, authLost, synced, wakeAt }) {
  onStatus = status;
  onData = data;
  onAuthLost = authLost || (() => {});
  onSynced = synced || (() => {});
  if (!API_BASE) { onStatus('local'); return; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', () => syncNow());
  onWakeAt = wakeAt || (() => 0);
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
  const res = await request(API_BASE + path, {
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

/**
 * Синхронизировать сейчас.
 *
 * @returns {Promise<boolean>} удалось ли. Это не украшение: по ответу
 *          видно, выяснили ли мы, что лежит на сервере. Пока не выяснили,
 *          приложение не вправе создавать сферы по умолчанию — иначе
 *          получится второй набор к тому, что у учётной записи уже есть
 *          (см. shouldSeed в core/sectors.js).
 */
export function syncNow() {
  if (!API_BASE) return Promise.resolve(false);
  clearTimeout(timer);
  running ??= run().finally(() => { running = null; armWake(); });
  return running;
}

/* Один будильник синхронизации до мига, который назвал wakeAt (см. initSync). */
function armWake() {
  clearTimeout(wakeTimer);
  const at = Number(onWakeAt()) || 0;
  if (at > 0) wakeTimer = setTimeout(syncNow, Math.max(1000, at - Date.now()));
}

async function run() {
  const token = await getMeta('token');
  if (!token) { onStatus('idle'); onAuthLost(); return false; }
  if (!navigator.onLine) { onStatus('offline'); return false; }
  onStatus('syncing');
  try {
    const kinds = await knownKinds();
    const sent = await dirtyRecords();
    const changes = Object.fromEntries(kinds.map(k => [k, sent[k].map(strip)]));
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
      return false;
    }

    const known = KINDS.filter(k => Array.isArray(result.changes[k]));
    const fresh = await merge(sent, result, known, kinds);
    /* Сервер только что узнал новый вид — его записи, сделанные раньше (другим устройством),
       могли остаться позади курсора: прежняя версия приложения получала их и выбрасывала.
       Один раз забрать всё заново; слияние повторы пропускает. */
    const learned = known.some(k => !kinds.includes(k));
    await setMeta('cursor', learned ? 0 : result.cursor);
    await setMeta(SERVER_KINDS, known);
    if (result.rejected.length) console.warn('[sync] сервер отклонил записи:', result.rejected);
    onStatus('synced');
    // Перерисовываем, только если с сервера пришло новое, а не эхо своих правок:
    // лишняя перерисовка может съесть нажатие, пришедшееся на этот момент
    if (fresh) await onData();
    try { await onSynced(known); } catch (err) { console.warn('[sync] после синхронизации:', err); }

    // Пока шёл запрос, могли появиться новые правки (и сервер мог узнать новый вид)
    const pending = await dirtyRecords();
    if (learned || known.some(k => pending[k].length)) scheduleSync();

    // Единственный путь, после которого известно, что лежит на сервере
    return true;
  } catch (err) {
    console.warn('[sync] не удалось:', err.message);
    onStatus(navigator.onLine ? 'error' : 'offline');
    return false;
  }
}

/* Слияние: побеждает более поздняя правка. Отправленная запись становится «чистой»,
   только если её не успели снова изменить на телефоне, пока шёл запрос. kinds — виды,
   которые знает сервер, sentKinds — которые в этот раз отправлены. */
async function merge(sent, result, kinds, sentKinds) {
  const local = await loadAll();
  let fresh = 0;
  for (const kind of kinds) {
    const byId = new Map(local[kind].map(r => [r.id, r]));
    // Чистыми становятся только отправленные: вид, который сервер узнал лишь этим ответом,
    // ещё не уходил, и его записи остаются «не ушедшими» до следующего раза
    const sentAt = new Map((sentKinds.includes(kind) ? sent[kind] : []).map(r => [r.id, r.updatedAt]));
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
