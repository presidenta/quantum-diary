/* Подписи свитка на трёх языках. Свой словарь, а не общий i18n.js:
   модуль меняется целиком в этой папке и в чужие файлы не лезет.

   Сами послания лежат не здесь, а в predictions.json. */

export const TEXTS = {
  ru: {
    title: 'Мудрость дня',
    open: 'Развернуть свиток «Мудрость дня»',
    fold: 'Свернуть',
    unfold: 'Развернуть',
    note: 'Если вам повторно выпадает одно и то же послание — обратите на него особое внимание. ' +
      'Вероятность повторного выпадения минимальна: это знак, что послание заслуживает вашего внимания.'
  },
  uk: {
    title: 'Мудрість дня',
    open: 'Розгорнути сувій «Мудрість дня»',
    fold: 'Згорнути',
    unfold: 'Розгорнути',
    note: 'Якщо вам повторно випадає те саме послання — зверніть на нього особливу увагу. ' +
      'Імовірність повторного випадіння мінімальна: це знак, що послання заслуговує на вашу увагу.'
  },
  en: {
    title: 'Wisdom of the Day',
    open: 'Unroll the scroll “Wisdom of the Day”',
    fold: 'Roll up',
    unfold: 'Unroll',
    note: 'If the same message comes to you again, give it special attention. ' +
      'The chance of a repeat is minimal: it is a sign that this message deserves your attention.'
  }
};

export const LANGS = Object.keys(TEXTS);

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
