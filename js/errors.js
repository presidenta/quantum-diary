/* Перехват сбоев на устройстве.

   Поломка часто случается там, где человек её не опишет: он просто увидит
   пустой экран и закроет приложение. Отчёт уходит сам, чтобы администратор
   увидел её раньше, чем о ней напишут.

   Что уходит: текст ошибки, стек, адрес страницы, версия и браузер. Ни
   заметок, ни целей, ни содержимого полей — только то, что нужно для
   починки. */

import { API_BASE } from './config.js';
import { getMeta } from './db.js';

const MAX_REPORTS = 5;          // один зациклившийся экран не должен завалить сервер
const KEY = 'planner.errorsSent';

let sentThisSession = 0;
const seen = new Set();

function recent() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

async function report(message, stack) {
  if (!API_BASE || sentThisSession >= MAX_REPORTS) return;
  const short = String(message || '').slice(0, 500);
  if (!short.trim() || seen.has(short)) return;      // одно и то же — один раз
  seen.add(short);
  sentThisSession += 1;

  const token = await getMeta('token').catch(() => null);
  if (!token) return;                                // до входа отчитываться некому

  let release = null;
  try {
    release = (await (await fetch('version.json')).json()).release;
  } catch { /* версия не обязательна */ }

  const entry = { message: short, at: new Date().toISOString() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...recent(), entry].slice(-20)));
  } catch { /* приватный режим — журнал на устройстве просто не ведётся */ }

  fetch(`${API_BASE}/api/logs/error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message: short,
      stack: String(stack || '').slice(0, 4000) || undefined,
      page: location.hash || location.pathname,
      release: release ? String(release) : undefined
    })
  }).catch(() => { /* нет сети — отчёт теряем, это не повод ломать приложение */ });
}

/* Браузер прячет подробности ошибки из чужого скрипта за словами
   «Script error.» — это его защита, и обойти её нельзя. Но место он всё же
   отдаёт, поэтому дописываем файл и строку: иначе отчёт бесполезен. */
function describe(event) {
  const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : '';
  return `${event.message || 'ошибка без текста'}${where}`;
}

export function watchErrors() {
  window.addEventListener('error', e => {
    // Сбой загрузки картинки или звука — тоже событие error, но не поломка кода
    if (e.target && e.target !== window) {
      report(`не загрузился ресурс: ${e.target.src || e.target.href || e.target.tagName}`);
      return;
    }
    report(describe(e), e.error?.stack);
  });
  window.addEventListener('unhandledrejection', e => {
    const reason = e.reason;
    report(reason?.message || String(reason), reason?.stack);
  });
}

// Что видел этот телефон — для раздела «Логи и сбои» у человека
export const localErrors = () => recent();
