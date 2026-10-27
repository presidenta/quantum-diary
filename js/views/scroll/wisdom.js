/* Свиток «Мудрость дня» — база посланий и выбор на даты.

   Без страницы и без хранилища: его берут и интерфейс свитка (index.js),
   и те, кто кормит свиток на виджетах, — reminder-plan.js (виджеты
   телефона и окно виджета на компьютере) и окно «Установить виджет».
   Поэтому модуль не тянет за собой ни store.js, ни db.js: расписание
   звонков не должно зависеть от интерфейса свитка. Кто и на каком языке
   читает, передаёт вызывающий. */

import { dayKey, pickIndex, normalize, textOf } from './engine.js';

const DATA_URL = new URL('./predictions.json', import.meta.url).href;

let base = null;          // послания, уже приведённые к { ru, uk, en }
let loading = null;

/* Грузится один раз. Не загрузилась (нет сети и нет в запасе) — пробуем
   снова при следующем вызове, а пока база пуста. */
export function loadBase() {
  if (base) return Promise.resolve(base);
  if (!loading) {
    loading = fetch(DATA_URL)
      .then(res => { if (!res.ok) throw new Error(`база посланий: ${res.status}`); return res.json(); })
      .then(raw => (base = normalize(raw)))
      .catch(() => { loading = null; return []; });
  }
  return loading;
}

/* Язык приложения → язык посланий. Украинский иногда приходит как 'ua'. */
export function langOf(language) {
  const raw = String(language || 'ru').slice(0, 2).toLowerCase();
  if (raw === 'ua') return 'uk';
  return ['ru', 'uk', 'en'].includes(raw) ? raw : 'ru';
}

/* ПОЖЕЛАНИЯ ВПЕРЁД ПО ДАТАМ (выкладка 194). Свиток на виджете читают без
   приложения, поэтому виджет получает готовые тексты: { "2026-10-28": "…", … }
   на days дней вперёд, на языке человека. Выбор тот же, что на главной
   (pickIndex), — одно место на всё приложение. Базы нет — null. */
export async function wisdomAhead({ userId = '', language = 'ru', days = 14 } = {}) {
  const list = await loadBase();
  if (!list.length) return null;
  const lang = langOf(language);
  const now = new Date();
  const поДатам = {};
  for (let i = 0; i < days; i++) {
    const date = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    поДатам[date] = textOf(list[pickIndex(userId, date, list.length)], lang);
  }
  return поДатам;
}
