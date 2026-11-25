/* УСЛОВИЯ ДОСТУПА — тексты на трёх языках (владелец 16.11.2026). Пока ознакомительно, как реклама: человек сам
   видит пакеты, выбирает и говорит администратору, на каких условиях хочет доступ; открывает доступ
   администратор вручную (галочки и срок в карточке человека). Временный файл: с клиентами пока личные
   договорённости.

   Пакеты — со слайдов владельца, украинский дословно; русский и английский — перевод. Поменять цену или текст —
   правка строки здесь, во всех трёх языках (проверка test/usloviya-dostupa.test.js сверяет, что пакетов и
   пунктов в языках поровну). */

const uk = {
  menu: 'Умови доступу',
  title: 'Умови доступу',
  intro: 'Доступ до «Кванта», тренінгів GSL і GoldenFit відкриває адміністратор. Оберіть пакет і повідомте йому, на яких умовах хочете отримати доступ.',
  full: 'Повна вартість:',
  today: 'Ціна сьогодні:',
  availability: 'Доступність:',
  includes: 'Що входить:',
  back: 'Назад',
  packages: [
    {
      name: 'Пакет «Лайт» — Базовий старт',
      lead: 'Формат для самостійної роботи з мінімальною підтримкою.',
      old: '330 USDT',
      price: '33 USDT',
      priceNote: '(вартість за 4 тижні занять, передпродаж, знижка 90%)',
      seats: 'Суворо 3 місця',
      items: [
        'Повний доступ до платформи і завдань тренінгу.',
        '1 дзвінок на тиждень у кінці тижня (30 хвилин) — оперативний зв\'язок для розбору поточних питань і корекції курсу.'
      ],
      total: 'Разом за 4 тижні: 4 дзвінки = 2 години прямого особистого контакту з експертом.'
    },
    {
      name: 'Пакет «Оптима» — Базова динаміка',
      lead: 'Початковий формат зі збільшеною підтримкою та зворотним зв\'язком.',
      old: '660 USDT',
      price: '66 USDT',
      priceNote: '(вартість за 4 тижні занять, передпродаж, знижка 90%)',
      seats: 'Суворо 3 місця',
      items: [
        'Повний доступ до платформи і завдань тренінгу.',
        'Підсумковий дзвінок (Неділя, 1 година) — розбір тижня, аналітика станів, підведення підсумків.',
        'Дзвінок посеред тижня (30 хвилин) — оперативний розбір питань і «затиків» у процесі.'
      ],
      total: 'Разом за 4 тижні: 8 дзвінків = 6 годин особистої взаємодії.'
    },
    {
      name: 'Пакет «Стандарт» — Головний вибір / Золота середина',
      star: true,
      lead: 'Основний, найпопулярніший пакет для глибокого опрацювання. Максимально збалансований формат особистісного зростання.',
      old: '990 USDT',
      price: '99 USDT',
      priceNote: '(вартість за 4 тижні занять, передпродаж, знижка 90%)',
      seats: 'Суворо 3 місця',
      items: [
        'Повний доступ до платформи і завдань тренінгу.',
        'Стратегічний дзвінок (Неділя, від 1,5 до 2 годин) — детальний розбір тижня, опрацювання станів та ментальних установок.',
        'Повноцінний дзвінок посеред тижня (1 година) — персональна консультація, поради та розбір складних ситуацій у реальному часі.'
      ],
      total: 'Разом за 4 тижні: 8 дзвінків = від 10 до 12 годин інтенсивного особистого супроводу.'
    },
    {
      name: 'Пакет «Pro» — Стандарт + Глибинна регресія',
      lead: 'Максимальний комплекс супроводу з підключенням індивідуального сеансу регресійної терапії.',
      old: '1140 USDT',
      price: '159 USDT',
      priceNote: '(пакет «Стандарт» за 99 USDT + сеанс регресії зі знижкою 60% за 60 USDT за 4 тижні занять, передпродаж)',
      seats: 'Суворо 3 місця',
      items: [
        'Все, що входить до пакета «Стандарт» (платформа, завдання, недільний дзвінок 1,5–2 години + годинний дзвінок посеред тижня — до 12 годин роботи).',
        '1 особистий сеанс регресії на місяць (онлайн). Для учасників проєкту діє персональна знижка 60% на сеанс (60 USDT замість 150 USDT).'
      ],
      total: 'Разом за 4 тижні: до 14 годин глибокої індивідуальної терапії та розборів.'
    }
  ]
};

const ru = {
  menu: 'Условия доступа',
  title: 'Условия доступа',
  intro: 'Доступ к «Кванту», тренингам GSL и GoldenFit открывает администратор. Выберите пакет и сообщите ему, на каких условиях хотите получить доступ.',
  full: 'Полная стоимость:',
  today: 'Цена сегодня:',
  availability: 'Доступность:',
  includes: 'Что входит:',
  back: 'Назад',
  packages: [
    {
      name: 'Пакет «Лайт» — Базовый старт',
      lead: 'Формат для самостоятельной работы с минимальной поддержкой.',
      old: '330 USDT',
      price: '33 USDT',
      priceNote: '(стоимость за 4 недели занятий, предпродажа, скидка 90%)',
      seats: 'Строго 3 места',
      items: [
        'Полный доступ к платформе и заданиям тренинга.',
        '1 созвон в неделю, в конце недели (30 минут) — оперативная связь для разбора текущих вопросов и коррекции курса.'
      ],
      total: 'Итого за 4 недели: 4 созвона = 2 часа прямого личного контакта с экспертом.'
    },
    {
      name: 'Пакет «Оптима» — Базовая динамика',
      lead: 'Начальный формат с увеличенной поддержкой и обратной связью.',
      old: '660 USDT',
      price: '66 USDT',
      priceNote: '(стоимость за 4 недели занятий, предпродажа, скидка 90%)',
      seats: 'Строго 3 места',
      items: [
        'Полный доступ к платформе и заданиям тренинга.',
        'Итоговый созвон (воскресенье, 1 час) — разбор недели, аналитика состояний, подведение итогов.',
        'Созвон в середине недели (30 минут) — оперативный разбор вопросов и «затыков» в процессе.'
      ],
      total: 'Итого за 4 недели: 8 созвонов = 6 часов личного взаимодействия.'
    },
    {
      name: 'Пакет «Стандарт» — Главный выбор / Золотая середина',
      star: true,
      lead: 'Основной, самый популярный пакет для глубокой проработки. Максимально сбалансированный формат личностного роста.',
      old: '990 USDT',
      price: '99 USDT',
      priceNote: '(стоимость за 4 недели занятий, предпродажа, скидка 90%)',
      seats: 'Строго 3 места',
      items: [
        'Полный доступ к платформе и заданиям тренинга.',
        'Стратегический созвон (воскресенье, от 1,5 до 2 часов) — детальный разбор недели, проработка состояний и ментальных установок.',
        'Полноценный созвон в середине недели (1 час) — персональная консультация, советы и разбор сложных ситуаций в реальном времени.'
      ],
      total: 'Итого за 4 недели: 8 созвонов = от 10 до 12 часов интенсивного личного сопровождения.'
    },
    {
      name: 'Пакет «Pro» — Стандарт + Глубинная регрессия',
      lead: 'Максимальный комплекс сопровождения с подключением индивидуального сеанса регрессионной терапии.',
      old: '1140 USDT',
      price: '159 USDT',
      priceNote: '(пакет «Стандарт» за 99 USDT + сеанс регрессии со скидкой 60% за 60 USDT, за 4 недели занятий, предпродажа)',
      seats: 'Строго 3 места',
      items: [
        'Всё, что входит в пакет «Стандарт» (платформа, задания, воскресный созвон 1,5–2 часа + часовой созвон в середине недели — до 12 часов работы).',
        '1 личный сеанс регрессии в месяц (онлайн). Для участников проекта действует персональная скидка 60% на сеанс (60 USDT вместо 150 USDT).'
      ],
      total: 'Итого за 4 недели: до 14 часов глубокой индивидуальной терапии и разборов.'
    }
  ]
};

const en = {
  menu: 'Access terms',
  title: 'Access terms',
  intro: 'Access to Kvant, the GSL trainings and GoldenFit is opened by the administrator. Choose a package and tell the administrator on which terms you would like access.',
  full: 'Full price:',
  today: 'Today’s price:',
  availability: 'Availability:',
  includes: 'What’s included:',
  back: 'Back',
  packages: [
    {
      name: '“Lite” package — Basic start',
      lead: 'A format for working on your own with minimal support.',
      old: '330 USDT',
      price: '33 USDT',
      priceNote: '(price for 4 weeks of classes, pre-sale, 90% off)',
      seats: 'Strictly 3 places',
      items: [
        'Full access to the platform and the training tasks.',
        '1 call a week, at the end of the week (30 minutes) — quick contact to go over current questions and adjust the course.'
      ],
      total: 'In total over 4 weeks: 4 calls = 2 hours of direct personal contact with an expert.'
    },
    {
      name: '“Optima” package — Basic momentum',
      lead: 'A starter format with more support and feedback.',
      old: '660 USDT',
      price: '66 USDT',
      priceNote: '(price for 4 weeks of classes, pre-sale, 90% off)',
      seats: 'Strictly 3 places',
      items: [
        'Full access to the platform and the training tasks.',
        'Summary call (Sunday, 1 hour) — review of the week, analysis of states, summing up.',
        'Mid-week call (30 minutes) — quick review of questions and of the places where you are stuck.'
      ],
      total: 'In total over 4 weeks: 8 calls = 6 hours of personal interaction.'
    },
    {
      name: '“Standard” package — Top choice / The golden mean',
      star: true,
      lead: 'The main and most popular package for deep work. The most balanced format for personal growth.',
      old: '990 USDT',
      price: '99 USDT',
      priceNote: '(price for 4 weeks of classes, pre-sale, 90% off)',
      seats: 'Strictly 3 places',
      items: [
        'Full access to the platform and the training tasks.',
        'Strategy call (Sunday, 1.5 to 2 hours) — detailed review of the week, work on states and mental attitudes.',
        'Full mid-week call (1 hour) — personal consultation, advice and working through difficult situations in real time.'
      ],
      total: 'In total over 4 weeks: 8 calls = 10 to 12 hours of intensive personal support.'
    },
    {
      name: '“Pro” package — Standard + Deep regression',
      lead: 'The most complete support package, with an individual regression therapy session.',
      old: '1140 USDT',
      price: '159 USDT',
      priceNote: '(the “Standard” package for 99 USDT + a regression session at 60% off for 60 USDT, for 4 weeks of classes, pre-sale)',
      seats: 'Strictly 3 places',
      items: [
        'Everything in the “Standard” package (platform, tasks, Sunday call of 1.5–2 hours + a one-hour mid-week call — up to 12 hours of work).',
        '1 personal regression session per month (online). Project participants get a personal 60% discount on the session (60 USDT instead of 150 USDT).'
      ],
      total: 'In total over 4 weeks: up to 14 hours of deep individual therapy and reviews.'
    }
  ]
};

export const TEXTS = { ru, uk, en };

export const textsFor = lang => TEXTS[lang] || TEXTS.ru;
