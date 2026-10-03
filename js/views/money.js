/* Деньги: лента трат и приходов, итоги месяца, запись голосом.

   Правила счёта и разбора живут в core/money.js и проверяются тестами без
   браузера. Здесь только экран. */

import { state, t, $, h, fill, save, remove, uuid, changed } from '../store.js';
import { CATEGORIES, categoryOf, byCategory, sumOf, money, parseSpoken } from '../core/money.js';
import { todayKey, fromKey } from '../core/dates.js';

const monthOf = key => key.slice(0, 7);

const fmtDay = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });

/* Записи текущего месяца, свежие сверху. Месяц — потому что деньги считают
   месяцами: аренда, зарплата и подписки ходят этим шагом. */
function monthRecords() {
  const month = monthOf(state.day || todayKey());
  return (state.data?.money || [])
    .filter(r => !r.deletedAt && monthOf(r.date) === month)
    .sort((a, b) => (a.date === b.date ? b.updatedAt.localeCompare(a.updatedAt) : b.date.localeCompare(a.date)));
}

export function renderMoney() {
  const rows = monthRecords();
  const spent = sumOf(rows, 'expense');
  const earned = sumOf(rows, 'income');

  fill($('moneyCard'),
    h('div', { class: 'money-totals' },
      totalBox('money.spent', spent, 'spent'),
      totalBox('money.earned', earned, 'earned'),
      totalBox('money.left', earned - spent, earned - spent < 0 ? 'minus' : 'left')),

    h('div', { class: 'money-actions' },
      h('button', { type: 'button', class: 'btn primary grow', text: t('money.add'), onclick: () => openEntry() }),
      micButton()),

    rows.length ? categoriesBar(rows) : null,
    rows.length
      ? h('ul', { class: 'money-list' }, ...rows.map(entryRow))
      : h('p', { class: 'muted m0', text: t('money.empty') })
  );
}

function totalBox(key, cents, kind) {
  return h('div', { class: `money-total ${kind}` },
    h('b', { text: money(cents) }),
    h('span', { text: t(key) }));
}

/* Полоса расходов по категориям: видно, куда уходит больше всего, без
   отдельного экрана отчётов. Доля меньше процента не рисуется — она всё
   равно не видна, а разметку засоряет. */
function categoriesBar(rows) {
  const totals = byCategory(rows, 'expense');
  const all = totals.reduce((sum, x) => sum + x.amount, 0);
  if (!all) return null;

  const bar = h('div', { class: 'money-bar' });
  const legend = h('div', { class: 'money-legend' });
  for (const { key, amount } of totals) {
    const share = Math.round((amount / all) * 100);
    if (share < 1) continue;
    const cat = categoryOf(key);
    const piece = h('i');
    piece.style.setProperty('width', `${share}%`);
    piece.style.setProperty('background', `var(${cat.colorVar})`);
    bar.appendChild(piece);

    const dot = h('span', { class: 'dot' });
    dot.style.setProperty('--c', `var(${cat.colorVar})`);
    legend.appendChild(h('span', { class: 'money-legend-item' },
      dot, h('span', { text: `${t(cat.nameKey)} · ${share}%` })));
  }
  return h('div', {}, bar, legend);
}

function entryRow(record) {
  const cat = categoryOf(record.category);
  const dot = h('span', { class: 'dot' });
  dot.style.setProperty('--c', `var(${cat.colorVar})`);

  return h('li', { class: `money-row ${record.kind}` },
    dot,
    h('div', { class: 'money-what' },
      h('b', { text: record.note || t(cat.nameKey) }),
      h('span', { class: 'muted', text: `${fmtDay.format(fromKey(record.date))} · ${t(cat.nameKey)}` })),
    h('b', { class: 'money-sum', text: `${record.kind === 'income' ? '+' : '−'}${money(record.amount)}` }),
    h('button', {
      type: 'button', class: 'icon-btn plain', 'aria-label': t('money.remove'),
      text: '×', onclick: () => remove('money', record)
    }));
}

/* ---------- Запись ---------- */

let editing = null;

export function openEntry(prefill = null) {
  editing = prefill?.id ? prefill : null;
  const form = $('moneyForm').elements;
  form.kind.value = prefill?.kind || 'expense';
  form.amount.value = prefill ? (prefill.amount / 100).toFixed(2) : '';
  form.category.value = prefill?.category || 'other';
  form.note.value = prefill?.note || '';
  form.date.value = prefill?.date || state.day || todayKey();
  $('moneyDialog').returnValue = '';
  $('moneyDialog').showModal();
}

export async function saveEntry() {
  const form = $('moneyForm').elements;
  const amount = Math.round(Number(String(form.amount.value).replace(',', '.')) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return;

  await save('money', [{
    id: editing?.id || uuid(),
    date: form.date.value || todayKey(),
    kind: form.kind.value,
    amount,
    currency: editing?.currency || 'UAH',
    category: form.category.value,
    note: form.note.value.trim() || null
  }]);
  editing = null;
  changed();
}

export function fillCategorySelect(select) {
  select.replaceChildren(...CATEGORIES.map(c => h('option', { value: c.key, text: t(c.nameKey) })));
}

/* ---------- Голос ----------

   ЗАПИСЬ ГОЛОСОМ ЕСТЬ НЕ ВЕЗДЕ. Распознавание речи в браузере — отдельная
   возможность: в Chrome она есть, в Firefox нет вовсе, в приватном режиме
   может молчать. Поэтому кнопка микрофона появляется, только если браузер
   умеет слушать: кнопка, которая ничего не делает, хуже её отсутствия.

   Распознанное НЕ ЗАПИСЫВАЕТСЯ МОЛЧА. Речь понимается с ошибками, и тихо
   занесённая не та сумма — хуже, чем лишнее нажатие: человек заметит её
   через месяц, когда уже не вспомнит. Поэтому сказанное открывает обычную
   форму с заполненными полями, и человек подтверждает. */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = () => Boolean(Recognition);

let listener = null;

function micButton() {
  if (!canListen()) return null;
  return h('button', {
    type: 'button', class: 'btn money-mic', 'aria-label': t('money.speak'), title: t('money.speak'),
    onclick: listen
  }, h('span', { class: 'money-mic-dot' }), h('span', { text: t('money.speak') }));
}

export function listen() {
  if (!canListen()) return;
  if (listener) { listener.stop(); return; }           // второе нажатие — отмена

  const button = document.querySelector('.money-mic');
  listener = new Recognition();
  listener.lang = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' }[state.language] || 'ru-RU';
  listener.interimResults = false;
  listener.maxAlternatives = 1;

  button?.classList.add('listening');
  const stop = () => { button?.classList.remove('listening'); listener = null; };

  listener.onresult = event => {
    const said = event.results[0]?.[0]?.transcript || '';
    stop();
    const parsed = parseSpoken(said, { defaultCurrency: 'UAH' });
    // Не разобрали сумму — открываем форму с услышанным в заметке, чтобы
    // человек дописал сам, а не гадал, почему ничего не произошло
    openEntry(parsed || { note: said, kind: 'expense', category: 'other' });
  };
  listener.onerror = stop;
  listener.onend = stop;

  try { listener.start(); } catch { stop(); }
}
