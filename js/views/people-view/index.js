/* ВИД СПИСКА ЛЮДЕЙ в кабинете администратора: «Списком» или «Плитками» (владелец 16.11.2026: «чтобы больше
   участников помещалось… пополам этот аккаунт делится, и такая плиточка получается»).

   Карточка человека одна и та же (admin.js → renderPerson); здесь только переключатель над списком и класс
   people--tiles у #peopleList — раскладку плиток задаёт ./people-view.css. Выбор помнит браузер этого
   компьютера (localStorage): удобство одного администратора, не общие данные.

   Из admin.js: initPeopleView(lang) при старте, syncPeopleView(lang) при смене языка — подписи кнопок. */

const KEY = 'admin.peopleView';
const TILES = 'tiles';
const LIST = 'list';

const TEXTS = {
  ru: { group: 'Вид списка', list: 'Списком', tiles: 'Плитками' },
  uk: { group: 'Вигляд списку', list: 'Списком', tiles: 'Плитками' },
  en: { group: 'List view', list: 'List', tiles: 'Tiles' }
};

// Значки: три полосы — список; четыре квадрата — плитки
const ICONS = {
  [LIST]: 'M4 6h16M4 12h16M4 18h16',
  [TILES]: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
};

function readMode() {
  try { return localStorage.getItem(KEY) === TILES ? TILES : LIST; } catch { return LIST; }
}

function saveMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* в закрытом окне не запомнится — не беда */ }
}

function icon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

function apply(mode) {
  document.getElementById('peopleList')?.classList.toggle('people--tiles', mode === TILES);
  document.querySelectorAll('#peopleView button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
}

/** Нарисовать переключатель над списком и включить запомненный вид. */
export function initPeopleView(lang) {
  const host = document.getElementById('peopleView');
  if (!host) return;
  host.replaceChildren(...[LIST, TILES].map(mode => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.view = mode;
    const label = document.createElement('span');
    b.append(icon(ICONS[mode]), label);
    b.addEventListener('click', () => { saveMode(mode); apply(mode); });
    return b;
  }));
  syncPeopleView(lang);
  apply(readMode());
}

/** Подписи на языке кабинета. */
export function syncPeopleView(lang) {
  const t = TEXTS[lang] || TEXTS.ru;
  const host = document.getElementById('peopleView');
  if (!host) return;
  host.setAttribute('aria-label', t.group);
  host.querySelectorAll('button').forEach(b => { b.querySelector('span').textContent = t[b.dataset.view]; });
}
