/* Подписи плитки GSL на трёх языках. Название — «GSL Я⁺ • Любовь» (владелец 23.11.2026: «старое название Man плюс Woman… Я плюс любовь, как в женском тренинге»; слово «тренинг» убрано везде с 19.11 — «квест», как в самом GSL). Свой словарь, как у спорта: модуль меняется целиком в этой папке.
   Подписи короче спортивных не нужны — плитки стоят в один ряд, и длинное переносится внутри своей. */

export const TEXTS = {
  ru: {
    name: 'GSL Я⁺ • Любовь',
    about: 'Квест для мужчин и женщин, а также их родителей',
    open: 'Открыть',
    install: 'Значок на экран',
    menu: 'GSL Я⁺ • Любовь — квест',
    opening: 'Открываем GSL Я⁺ • Любовь…',
    locked: 'Доступ к GSL Я⁺ • Любовь откроет администратор.',
    updateApp: 'Чтобы открывать GSL Я⁺ • Любовь, обновите приложение «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  uk: {
    name: 'GSL Я⁺ • Любов',
    about: 'Квест для чоловіків і жінок, а також їхніх батьків',
    open: 'Відкрити',
    install: 'Значок на екран',
    menu: 'GSL Я⁺ • Любов — квест',
    opening: 'Відкриваємо GSL Я⁺ • Любов…',
    locked: 'Доступ до GSL Я⁺ • Любов відкриє адміністратор.',
    updateApp: 'Щоб відкривати GSL Я⁺ • Любов, оновіть застосунок «Квант»: presidenta.github.io/quantum-diary/app/'
  },
  en: {
    name: 'GSL I⁺ • Love',
    about: 'A quest for men and women — and their parents',
    open: 'Open',
    install: 'Icon on home screen',
    menu: 'GSL I⁺ • Love — quest',
    opening: 'Opening GSL I⁺ • Love…',
    locked: 'Access to GSL I⁺ • Love is opened by the administrator.',
    updateApp: 'To open GSL I⁺ • Love, update the Kvant app: presidenta.github.io/quantum-diary/app/'
  }
};

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
