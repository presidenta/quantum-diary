/* ОКНО ВИДЖЕТА НА КОМПЬЮТЕРЕ (выкладка 150).

   Владелец 18.10.2026: «те же самые виджеты адаптируй для компьютера». На компьютере нет
   рабочего стола для виджетов Android, поэтому виджет — маленькое окно (widget.html), которое
   ставят в угол экрана. Новой отрисовки нет: вид рисует та же функция, что предпросмотр в окне
   «Установить виджет» (core/widget-html.js).

   ОТКУДА ДАННЫЕ. Сроки — кадры плашки, которые приложение кладёт на компьютер при каждой
   перестановке расписания (publishDesktopWidget в reminder-plan.js). Кадры расписаны по
   часам вперёд: окно само берёт текущий — последний, чей час наступил (то же правило, что у
   AlarmStore.кадрСейчас на телефоне), поэтому сроки переключаются, даже когда приложение
   закрыто. Стиль — из окна «Установить виджет» (kvant-desktop-widget-style). Правки в
   приложении окно слышит сразу (событие storage) и перерисовывается. */

import { FORMATS, normalizeStyle } from './core/widgets.js';
import { translate } from './core/i18n.js';
import { widgetHtml, applyWidgetVars } from './core/widget-html.js';

const ПЕРЕРИСОВКА_МС = 20 * 1000;

const корень = document.getElementById('wd');
const параметры = new URLSearchParams(location.search);
const ключ = параметры.get('f');

/* В приложении для компьютера (desktop/, Electron, выкладка 152) окно виджета без рамки и с
   прозрачным фоном: виджет лежит прямо на рабочем столе и тянется за любое место, кроме
   кнопок (стили .wd-app в widget-desktop.css). */
if (параметры.get('app') === 'desktop') {
    document.documentElement.classList.add('wd-app');
    document.body.classList.add('wd-app');
}
const формат = FORMATS.find(ф => ф.key === ключ) || FORMATS.find(ф => ф.key === 'hud');

function прочитать(имя) {
    try {
        return JSON.parse(localStorage.getItem(имя) || 'null');
    } catch {
        return null;
    }
}

function нарисовать() {
    const данные = прочитать('kvant-desktop-widget');
    const язык = данные?.lang || 'ru';
    const перевод = (к, значения) => translate(язык, к, значения);

    // Текущий кадр — последний, чей час наступил; кадров нет — образец
    const сейчас = Date.now();
    let кадр = null;
    for (const к of данные?.frames || []) {
        if (!кадр || к.from <= сейчас) кадр = к;
    }
    const сроки = кадр
        ? { architect: кадр.architect, observer: кадр.observer }
        : { architect: перевод('widgets.sample.architect'), observer: перевод('widgets.sample.observer') };

    корень.innerHTML = widgetHtml(формат, normalizeStyle(прочитать('kvant-desktop-widget-style') || {}),
        new Date(), сроки, перевод);
    applyWidgetVars(корень);
    document.documentElement.lang = язык;
    document.title = `${перевод('widgets.format.' + формат.key)} · Квант`;
}

/* Шестерёнка и «Настройки» — окно «Установить виджет» в приложении; кабинет — само приложение.
   Одно окно приложения на всё: имя «kvant-app», повторное нажатие ведёт в него же. */
корень.addEventListener('click', событие => {
    const настройки = событие.target.closest('.wg-gear, .wg-btn.alt, .wg-btn.small:not(.mark)');
    if (настройки) {
        window.open('index.html#widgets', 'kvant-app');
        return;
    }
    if (событие.target.closest('.wg-btn')) window.open('index.html', 'kvant-app');
});

нарисовать();
setInterval(нарисовать, ПЕРЕРИСОВКА_МС);
window.addEventListener('storage', нарисовать);
