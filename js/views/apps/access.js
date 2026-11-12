/* ДОСТУП К ОТДЕЛЬНЫМ ПРИЛОЖЕНИЯМ «Кванта» — GoldenFit и GSL Woman+ (выкладка 238).

   Владелец 12.11.2026: «у каждого приложения — замочек: открытый или закрытый; доступ к каждому
   потом будет открываться отдельно — хотите женский тренинг, пожалуйста, замочек открылся». Пока
   доступ открыт всем, у кого есть кабинет «Кванта», и замочки нарисованы открытыми. Сам «Квант» без
   замочка — о нём владелец ещё думает.

   Как включить отдельный доступ потом (METHODOLOGY.md §3.3): сервер отдаёт в /api/me список открытых
   приложений человека (выдаёт администратор), hasAccess() читает его отсюда — и замочки, и запрет
   открытия заработают сами: плитки и пункты меню уже спрашивают только hasAccess(). Тот же список
   проверяет сервер в /api/sport/* и /api/woman/* — без этого закрытый замочек был бы только картинкой. */

/** Отдельные приложения: ключ → название для подсказки. */
export const APPS = {
  goldenfit: 'GoldenFit',
  'gsl-woman': 'GSL Woman+'
};

/** Открыто ли приложение этому человеку. Пока — всем. */
export function hasAccess(app) {
  return app in APPS;
}

const SVG = 'http://www.w3.org/2000/svg';

/* Замочек: дужка поднята — открыт, опущена — закрыт. Тонкая линия, цвет — как у подписей меню;
   открытый — золотой: «можно». */
export function lockIcon(app) {
  const open = hasAccess(app);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `app-lock${open ? ' is-open' : ''}`);
  const body = document.createElementNS(SVG, 'rect');
  for (const [k, v] of Object.entries({ x: '5', y: '10.5', width: '14', height: '10', rx: '2.2' })) body.setAttribute(k, v);
  const shackle = document.createElementNS(SVG, 'path');
  shackle.setAttribute('d', open ? 'M8 10.5V7.5a4 4 0 0 1 7.6-1.7' : 'M8 10.5V8a4 4 0 0 1 8 0v2.5');
  svg.append(body, shackle);
  const wrap = document.createElement('span');
  wrap.className = 'app-lock-wrap';
  wrap.title = open ? 'Доступ открыт' : 'Доступ откроет администратор';
  wrap.append(svg);
  return wrap;
}
