/* Подписи плитки GSL Woman на трёх языках. Свой словарь, как у спорта: модуль меняется целиком в этой папке.
   Подписи короче спортивных не нужны — плитки стоят в один ряд, и длинное переносится внутри своей. */

export const TEXTS = {
  ru: {
    name: 'GSL Woman+',
    about: 'Тренинги для женщин',
    open: 'Открыть',
    install: 'Значок на экран',
    menu: 'GSL Woman+ — тренинги',
    opening: 'Открываем GSL Woman+…',
    updateApp: 'Чтобы открывать GSL Woman, обновите приложение «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  uk: {
    name: 'GSL Woman+',
    about: 'Тренінги для жінок',
    open: 'Відкрити',
    install: 'Значок на екран',
    menu: 'GSL Woman+ — тренінги',
    opening: 'Відкриваємо GSL Woman+…',
    updateApp: 'Щоб відкривати GSL Woman, оновіть застосунок «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  en: {
    name: 'GSL Woman+',
    about: 'Trainings for women',
    open: 'Open',
    install: 'Icon on home screen',
    menu: 'GSL Woman+ — trainings',
    opening: 'Opening GSL Woman+…',
    updateApp: 'To open GSL Woman, update the Kvant app: presidenta.github.io/quantum-diary/app/'
  }
};

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
