/* Подписи плитки GoldenFit на трёх языках. Свой словарь, а не общий i18n.js:
   модуль меняется целиком в этой папке. */

export const TEXTS = {
  ru: {
    name: 'GoldenFit',
    about: 'Тренировки дома: счёт, дыхание, голос. Вход — ваш аккаунт Кванта, история сохраняется.',
    open: 'Открыть',
    install: 'Значок на экран',
    menu: 'GoldenFit — спорт',
    opening: 'Открываем GoldenFit…',
    updateApp: 'Чтобы открывать GoldenFit, обновите приложение «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  uk: {
    name: 'GoldenFit',
    about: 'Тренування вдома: лік, дихання, голос. Вхід — ваш акаунт Кванта, історія зберігається.',
    open: 'Відкрити',
    install: 'Значок на екран',
    menu: 'GoldenFit — спорт',
    opening: 'Відкриваємо GoldenFit…',
    updateApp: 'Щоб відкривати GoldenFit, оновіть застосунок «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  en: {
    name: 'GoldenFit',
    about: 'Home workouts: counting, breathing, voice. Sign-in is your Kvant account; history is saved.',
    open: 'Open',
    install: 'Icon on home screen',
    menu: 'GoldenFit — sport',
    opening: 'Opening GoldenFit…',
    updateApp: 'To open GoldenFit, update the Kvant app: presidenta.github.io/quantum-diary/app/'
  }
};

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
