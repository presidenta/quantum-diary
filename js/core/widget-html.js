/* ВИДЖЕТ В HTML — ОДНА ОТРИСОВКА НА ДВА МЕСТА (выкладка 150).

   Предпросмотр в окне «Установить виджет» и окно виджета на компьютере (widget.html) рисуют
   виджет одной и той же функцией, поэтому на компьютере те же шесть видов, цвета и золото,
   что в предпросмотре и на телефоне. Модуль чистый: ни хранилища, ни словаря приложения —
   слова приходят функцией перевод, сроки — параметром.

   ЦВЕТА — ЧЕРЕЗ CSSOM, А НЕ АТРИБУТОМ style. У страниц строгая политика безопасности
   (style-src 'self' без unsafe-inline): атрибут style, вставленный разметкой, браузер молча
   отбрасывает, и предпросмотр терял цвет дня. Поэтому цвета едут в data-атрибутах, а
   applyWidgetVars ставит их свойствами уже после вставки — это политика пропускает (так же
   сделаны шкалы аналитики в «Пространстве»). */

import { CHAKRAS, DEFAULT_ALPHA, GOLD, GRAPHITE, resolveLook } from './widgets.js';
import { WIDGET_ICONS } from './widget-icons.js';

const экран = текст => String(текст ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const значок = имя => `<span class="wg-ico">${WIDGET_ICONS[имя]}</span>`;

/* Слова вида: свои надписи человека, а где их нет — стандартные из словаря. */
/** Слова вида (заголовок, подписи, кнопки, дни) — и для подсказок в окне «Установить виджет». */
export function widgetWords(стиль, ключ, look, перевод) {
    const слово = к => перевод(`widgets.w.${к}`);
    const своё = (поле, обычное) => стиль[поле] || обычное;
    const дни = перевод('widgets.days').split(',').map(д => д.trim());

    const заголовок = ключ === 'fillWide' ? слово('titleWide')
        : ключ === 'tall' || ключ === 'fillTall' ? слово('titleTall') : слово('titleHud');

    // Метка в шапке: у залитого горизонтального — сегодняшний день, как на макете; у остальных
    // одно слово «Активно» (владелец 18.10.2026: «Связь активна» — лишнее, «просто Активно»)
    const метка = ключ === 'fillWide' ? (стиль.subtitle || дни[look.day])
        : своё('subtitle', слово('subShort'));

    return {
        title: своё('title', заголовок),
        sub: метка,
        architect: своё('architect', слово('architect')),
        observer: своё('observer', слово('observer')),
        settings: слово('settings'),
        cabinet: ключ === 'fillWide' ? слово('cabinetPersonal')
            : ключ === 'fillTall' ? слово('cabinetMain')
            : ключ === 'tall' ? слово('cabinet') : слово('cabinetTo'),
        days: дни
    };
}

/* Срок: слово перед временем мельче, само время крупнее, как на плашке. */
function срокHtml(текст) {
    const найдено = /(\d{1,2}:\d{2})/.exec(текст);
    // Без времени («окно открыто», «—») — мельче: слова длиннее цифр и иначе обрезались бы
    if (!найдено) return `<span class="wg-value-word">${экран(текст)}</span>`;

    const до = текст.slice(0, найдено.index).trim();
    return (до ? `<small>${экран(до)}</small> ` : '') + `<b>${найдено[1]}</b>`;
}

/**
 * Виджет в HTML: тот же вид, что рисует телефон (WidgetRender), — для предпросмотра в окне
 * «Установить виджет» и для окна виджета на компьютере (widget.html).
 *
 * @param формат  вид из FORMATS
 * @param стиль   нормализованный стиль виджета
 * @param дата    для цвета дня (режим «авто»)
 * @param сроки   {architect, observer} — сроки словами, как на плашке
 * @param перевод (ключ, значения) → строка на языке человека
 * @returns разметка; цвета вида ставит applyWidgetVars после вставки
 */
export function widgetHtml(формат, стиль, дата, сроки, перевод) {
    const look = resolveLook(стиль, дата);
    const слово = widgetWords(стиль, формат.key, look, перевод);
    const золото = look.gold;

    const alpha = (стиль.alpha ?? (формат.fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon)) / 100;
    const заливка = look.graphite ? GRAPHITE.base : look.accent;
    const классы = ['wg', `wg-${формат.key.toLowerCase()}`,
        формат.fill ? 'wg-fill' : '', золото ? 'wg-gold' : '', look.graphite ? 'wg-graphite' : '',
        формат.fill && look.ink && !золото && !look.graphite ? 'wg-ink' : ''].filter(Boolean).join(' ');

    /* Блестящие буквы — класс сайта .gold-cut везде в золоте: на тёмной пластине, на слитке и
       на золотых кнопках, как на телефоне и в таблице девяти моментов (выкладка 146). */
    const блеск = золото;
    const буквы = html => блеск ? `<span class="gold-cut">${html}</span>` : html;
    const срок = (с) => буквы(срокHtml(с === 'a' ? сроки.architect : сроки.observer));
    const метка = (с) => буквы(экран(с === 'a' ? слово.architect : слово.observer));
    const иконка = с => значок(с === 'a' ? 'book' : 'flower');

    const карточка = (с, класс = 'wg-card') => `
        <div class="${класс} wg-${с}">
          <div class="wg-label">${иконка(с)}${метка(с)}</div>
          <div class="wg-value">${срок(с)}</div>
        </div>`;

    const кнопка = (текст, класс = '') =>
        `<span class="wg-btn ${класс}">${буквы(экран(текст))}</span>`;
    const шестерня = `<span class="wg-gear">${значок('gear')}</span>`;
    const заголовок = `<span class="wg-title">${буквы(экран(слово.title))}</span>`;

    let тело;
    if (формат.key === 'slim') {
        // Как на телефоне (выкладка 141): справа столбиком шестерёнка и вход в кабинет
        тело = `
          <div class="wg-pair wg-a"><div class="wg-label">${иконка('a')}${метка('a')}</div><div class="wg-value">${срок('a')}</div></div>
          <span class="wg-sep"></span>
          <div class="wg-pair wg-b"><div class="wg-label">${иконка('b')}${метка('b')}</div><div class="wg-value">${срок('b')}</div></div>
          <span class="wg-stack"><span class="wg-btn small">${значок('gear')}</span><span class="wg-btn small mark">${значок('mark')}</span></span>`;
    } else if (формат.tall) {
        const шапка = формат.fill
            // «Активно» сразу за заголовком, мельче и другим цветом — как на телефоне
            ? `<div class="wg-head"><span class="wg-title wg-title-wrap">${буквы(экран(слово.title))} <small class="wg-tail">${экран(слово.sub)}</small></span>${шестерня}</div>`
            : `<span class="wg-emblem">${значок('mark')}</span>
               <div class="wg-title">${буквы(экран(слово.title))}</div>
               <div class="wg-sub">${экран(слово.sub)}</div>`;
        const низ = формат.fill
            ? `<div class="wg-btns">${кнопка(слово.cabinet)}</div>`
            : `<div class="wg-btns">${кнопка(слово.cabinet)}<span class="wg-btn small">${значок('gear')}</span></div>`;
        тело = `${шапка}${карточка('a', 'wg-row')}${карточка('b', 'wg-row')}${низ}`;
    } else {
        const неделя = формат.key === 'week'
            ? `<div class="wg-week-strip">${слово.days.map((д, i) => {
                const цвет = золото ? GOLD.text : CHAKRAS[i].hex;
                return `<span class="${i === look.day ? 'today' : ''}" data-color="${цвет}">${экран(д)}</span>`;
            }).join('')}</div>` : '';
        const шапка = `<div class="wg-head">${заголовок}<span class="wg-head-end">
            <span class="wg-chip">${экран(слово.sub)}</span>${формат.fill ? шестерня : ''}</span></div>`;
        const низ = формат.fill
            ? кнопка(слово.cabinet)
            : кнопка(слово.settings, 'alt') + кнопка(слово.cabinet);
        тело = `${шапка}<div class="wg-cards">${карточка('a')}${карточка('b')}</div>${неделя}
                <div class="wg-btns">${низ}</div>`;
    }

    return `<div class="${классы}" data-accent="${look.accent}" data-soft="${look.soft}" data-fill="${заливка}" data-alpha="${alpha}">
        <span class="wg-plate"></span><span class="wg-rim"></span>
        <div class="wg-body">${тело}</div></div>`;
}

/** Поставить цвета вида виджетам внутри узла (после вставки разметки widgetHtml). */
export function applyWidgetVars(узел) {
    for (const виджет of узел.querySelectorAll('.wg[data-accent]')) {
        виджет.style.setProperty('--wg-accent', виджет.dataset.accent);
        виджет.style.setProperty('--wg-soft', виджет.dataset.soft);
        виджет.style.setProperty('--wg-fill', виджет.dataset.fill);
        виджет.style.setProperty('--wg-alpha', виджет.dataset.alpha);
    }
    for (const день of узел.querySelectorAll('[data-color]')) день.style.color = день.dataset.color;
}
