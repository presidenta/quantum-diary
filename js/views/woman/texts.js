/* Подписи плитки GSL на трёх языках. Название — «GSL Man+Woman» (владелец 16.11.2026: «Man плюс Woman… вообще везде»). Свой словарь, как у спорта: модуль меняется целиком в этой папке.
   Подписи короче спортивных не нужны — плитки стоят в один ряд, и длинное переносится внутри своей. */

export const TEXTS = {
  ru: {
    name: 'GSL Man+Woman',
    about: 'Тренинги для мужчин и женщин',
    open: 'Открыть',
    install: 'Значок на экран',
    menu: 'GSL Man+Woman — тренинги',
    opening: 'Открываем GSL Man+Woman…',
    locked: 'Доступ к GSL Man+Woman откроет администратор.',
    updateApp: 'Чтобы открывать GSL Man+Woman, обновите приложение «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  uk: {
    name: 'GSL Man+Woman',
    about: 'Тренінги для чоловіків і жінок',
    open: 'Відкрити',
    install: 'Значок на екран',
    menu: 'GSL Man+Woman — тренінги',
    opening: 'Відкриваємо GSL Man+Woman…',
    locked: 'Доступ до GSL Man+Woman відкриє адміністратор.',
    updateApp: 'Щоб відкривати GSL Man+Woman, оновіть застосунок «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  en: {
    name: 'GSL Man+Woman',
    about: 'Trainings for men and women',
    open: 'Open',
    install: 'Icon on home screen',
    menu: 'GSL Man+Woman — trainings',
    opening: 'Opening GSL Man+Woman…',
    locked: 'Access to GSL Man+Woman is opened by the administrator.',
    updateApp: 'To open GSL Man+Woman, update the Kvant app: presidenta.github.io/quantum-diary/app/'
  }
};

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
