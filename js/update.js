/* Кнопка обновления — рядом с языком, как в игре.

   Зачем она нужна. Телефон держит запас страниц, чтобы приложение открывалось
   без сети. Из-за этого после выкладки человек может сутками видеть старый
   экран и считать, что ничего не починили. Кнопка отвечает на вопрос «обновилось
   или нет» прямо, цифрами, и при необходимости выбрасывает запас.

   Что сравниваем. Две вещи сразу:
   — номер выкладки КЛИЕНТА (web/version.json) — он меняется от правок экранов;
   — отпечаток самого файла приложения (ETag) — ловит правки, при которых номер
     забыли поднять;
   — версию СЕРВЕРА (/api/version) — время сборки, запуск, миграции.
   Одного номера сервера мало: экраны раздаются с диска и меняются без его
   перезапуска. Эту ошибку в игре уже проходили. */

import { API_BASE } from './config.js';
import { t, $, h } from './store.js';

const SEEN = 'planner.updateSeen';   // отпечаток, с которым живёт этот экран
const SAY = 'planner.updateSay';     // вердикт, который надо показать после перезагрузки

const noStore = { cache: 'no-store' };

async function clientVersion() {
  try {
    const res = await fetch(`version.json?probe=${Date.now()}`, noStore);
    const body = await res.json();
    const tag = res.headers.get('etag') || res.headers.get('last-modified') || '';
    return { release: body.release, date: body.date, tag };
  } catch {
    return null;
  }
}

/* Отдельного запроса за отпечатком приложения нет намеренно.

   Сначала он был: HEAD на js/app.js ловил правки, при которых забыли поднять
   номер выкладки. Но это лишний запрос при каждом запуске, и он обрывается,
   если страницу закрыть сразу после открытия. Вместо него берём отпечаток
   version.json — он всё равно читается, — а номер выкладки поднимается при
   каждой правке. Это дисциплина, а не случайность: номер живёт рядом с кодом
   и проверяется глазами в окошке обновления. */

/* Сервер спрашиваем в обход любых запасов и не дольше семи секунд:
   честное «нет связи» полезнее вечного кручения значка. */
async function serverVersion() {
  if (!API_BASE) return null;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 7000);
  try {
    const res = await fetch(`${API_BASE}/api/version`, { ...noStore, signal: control.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const stampOf = (client, server, tag) => [
  client?.release ?? '—',
  tag || '',
  server?.startedAt || '',
  (server?.migrations || []).length
].join('|');

const when = iso => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
};

/* КОМПАКТНАЯ ПЛАШКА, А НЕ ОКНО.

   Сначала здесь была всплывающая подсказка на несколько секунд — прочитать
   не успевали. Потом окно со списком изменений и временем перезапуска
   сервера — оно перекрывало пол-экрана, а время перезапуска человеку не
   говорит ничего. Осталось главное: номер версии и одна строка о том, что
   произошло. Плашка не держит экран и уходит сама.

   Список изменений убран по решению владельца: он нужен разработчику, а
   человеку нужен ответ «обновилось или нет». */
function popup(kind, lines) {
  document.querySelector('.upd-pop')?.remove();
  const box = h('div', { class: `upd-pop ${kind}` },
    h('b', { text: t(`update.${kind}`) }),
    ...lines.map(line => h('i', { text: line })));
  document.body.appendChild(box);
  if (kind !== 'checking') {
    setTimeout(() => {
      box.classList.add('out');
      setTimeout(() => box.remove(), 320);
    }, 5000);
  }
  return box;
}

const read = key => {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; }
};
const write = (key, value) => {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
};

/* Одна строка вместо трёх. Время перезапуска сервера и число миграций
   человеку ничего не говорят — это были цифры для разработчика. */
function techLines(client, server) {
  const lines = [`${t('update.client')} ${client?.release ?? '—'}`];
  if (!server && API_BASE) lines.push(t('update.noServer'));
  return lines;
}

/* Выбрасываем запас страниц и просим служебного работника обновиться.
   Делаем это ВСЕГДА, а не только когда номер сменился: правки экранов
   раздаются с диска, и номер сервера при этом прежний. */
async function wipeCaches() {
  try {
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* запаса может не быть вовсе */ }
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch { /* служебный работник не обязателен */ }
}

export async function initUpdate(buttonId = 'updateBtn') {
  const button = $(buttonId);
  if (!button) return;

  // Вердикт с прошлой перезагрузки: показать один раз и стереть
  const said = read(SAY);
  if (said) {
    sessionStorage.removeItem(SAY);
    if (Date.now() - (said.at || 0) < 30000) {
      setTimeout(() => popup(said.kind, said.lines || []), 400);
    }
  }

  // Запоминаем отпечаток, с которым живёт этот экран — иначе сравнивать не с чем
  const [client, server] = await Promise.all([clientVersion(), serverVersion()]);
  write(SEEN, { stamp: stampOf(client, server, client?.tag) });



  button.addEventListener('click', async () => {
    if (button.dataset.busy) return;
    button.dataset.busy = '1';
    button.classList.add('spin');
    popup('checking', []);

    const [nowClient, nowServer] = await Promise.all([clientVersion(), serverVersion()]);
    const lines = techLines(nowClient, nowServer);

    if (!nowClient && !nowServer) {
      button.classList.remove('spin');
      delete button.dataset.busy;
      popup('offline', lines);
      return;
    }

    const seen = read(SEEN)?.stamp || '';
    const stamp = stampOf(nowClient, nowServer, nowClient?.tag);
    const kind = !seen ? 'done' : (seen === stamp ? 'same' : 'new');

    write(SAY, { kind, lines, at: Date.now() });
    await wipeCaches();
    location.reload();
  });
}
