/* УСЛОВИЯ ДОСТУПА — первая строка меню «Кванта» (над «Квантом», под чертой) и окно с четырьмя пакетами (владелец 16.11.2026).

   Ознакомительно, как реклама: человек сам видит пакеты и цены, выбирает и говорит администратору, на каких
   условиях хочет доступ. Выбора и оплаты в приложении нет — доступ открывает администратор вручную (галочки
   и срок в карточке человека, server/src/access/). Тексты на трёх языках — ./texts.js.

   Строка меню выделена: зелёный кружок со знаком $ слева, плюсик в кружке справа (владелец: «важная кнопка, чтобы выделялась»).
   Из app.js: initTerms() при старте, syncTerms() на render() — перерисовка при смене языка. */

import { state } from '../../store.js';
import { textsFor } from './texts.js';

let drawn = '';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') node.onclick = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
  return node;
}

function backIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M15 5l-7 7 7 7');
  svg.append(path);
  return svg;
}

function packageCard(t, p, i) {
  return el('article', { class: `terms-card${p.star ? ' terms-card--star' : ''}` },
    el('h3', { class: 'terms-name' },
      el('span', { class: 'terms-num', text: `${i + 1}.` }),
      el('span', { text: p.name }),
      p.star ? el('span', { class: 'terms-star', 'aria-hidden': 'true', text: '★' }) : null),
    el('p', { class: 'terms-lead', text: p.lead }),
    el('div', { class: 'terms-price' },
      el('p', { class: 'terms-old' }, `${t.full} `, el('s', { text: p.old })),
      el('p', { class: 'terms-now' }, el('b', { text: t.today }), el('span', { class: 'terms-sum', text: p.price })),
      el('p', { class: 'terms-note', text: p.priceNote })),
    el('p', { class: 'terms-seats' }, `${t.availability} `, el('b', { text: `🔒 ${p.seats}` })),
    el('p', { class: 'terms-includes', text: t.includes }),
    el('ul', { class: 'terms-list' }, ...p.items.map(item => el('li', { text: item }))),
    el('p', { class: 'terms-total', text: `📊 ${p.total}` }));
}

function dialog() {
  let d = document.getElementById('termsDialog');
  if (!d) {
    d = el('dialog', { id: 'termsDialog', class: 'terms-dialog' });
    // Нажатие мимо окна (по затемнению) — закрыть
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  return d;
}

/** Открыть окно «Условия доступа» на языке «Кванта». */
export function openTerms() {
  const t = textsFor(state.language);
  const d = dialog();
  const back = el('button', { type: 'button', class: 'icon-btn plain back-btn', 'aria-label': t.back, onclick: () => d.close() }, backIcon());
  d.replaceChildren(el('div', { class: 'sheet terms-sheet' },
    el('div', { class: 'sheet-head' }, back, el('h2', { text: t.title })),
    el('p', { class: 'terms-intro', text: t.intro }),
    ...t.packages.map((p, i) => packageCard(t, p, i))));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

function drawMenu(t) {
  const host = document.getElementById('drawerTerms');
  if (!host) return;
  host.replaceChildren(el('button', {
    type: 'button',
    class: 'terms-menu',
    onclick: () => {
      document.getElementById('drawerBack')?.click();
      openTerms();
    }
  },
    el('span', { class: 'terms-dollar', 'aria-hidden': 'true', text: '$' }),
    el('span', { text: t.menu }),
    plus()));
}

/* Плюсик в тонком золотом кружке справа — «здесь есть ещё, открой» (владелец 16.11.2026: «не замочек…
   может плюсик лучше. Психологически это будет типа, что плюс») */
function plus() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'terms-plus');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '12');
  ring.setAttribute('cy', '12');
  ring.setAttribute('r', '10');
  const cross = document.createElementNS(ns, 'path');
  cross.setAttribute('d', 'M12 7.5v9M7.5 12h9');
  svg.append(ring, cross);
  return svg;
}

export function initTerms() {
  syncTerms();
}

// Перерисовка — только когда сменился язык
export function syncTerms() {
  const key = state.language || 'ru';
  if (key === drawn && document.querySelector('#drawerTerms .terms-menu')) return;
  drawn = key;
  drawMenu(textsFor(key));
}
