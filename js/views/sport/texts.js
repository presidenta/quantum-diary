/* Подписи плитки GoldenFit на трёх языках. Свой словарь, а не общий i18n.js:
   модуль меняется целиком в этой папке. */

export const TEXTS = {
  ru: {
    name: 'GoldenFit',
    about: 'Тренировки дома: счёт, дыхание, голос',
    open: 'Открыть',
    install: 'Значок на экран',
    menu: 'GoldenFit — спорт',
    opening: 'Открываем GoldenFit…',
    locked: 'Доступ к GoldenFit откроет администратор.',
    updateApp: 'Чтобы открывать GoldenFit, обновите приложение «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  uk: {
    name: 'GoldenFit',
    about: 'Тренування вдома: лік, дихання, голос',
    open: 'Відкрити',
    install: 'Значок на екран',
    menu: 'GoldenFit — спорт',
    opening: 'Відкриваємо GoldenFit…',
    locked: 'Доступ до GoldenFit відкриє адміністратор.',
    updateApp: 'Щоб відкривати GoldenFit, оновіть застосунок «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  en: {
    name: 'GoldenFit',
    about: 'Home workouts: counting, breathing, voice',
    open: 'Open',
    install: 'Icon on home screen',
    menu: 'GoldenFit — sport',
    opening: 'Opening GoldenFit…',
    locked: 'Access to GoldenFit is opened by the administrator.',
    updateApp: 'To open GoldenFit, update the Kvant app: presidenta.github.io/quantum-diary/app/'
  }
};

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
