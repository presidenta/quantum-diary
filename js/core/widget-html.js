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

import { CHAKRAS, DEFAULT_ALPHA, GOLD, GRAPHITE, MIRROR_DAY_LIGHT, mix, resolveLook, widgetAliases, translateOwn, fillColor } from './widgets.js';
import { WIDGET_ICONS } from './widget-icons.js';

const экран = текст => String(текст ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const значок = имя => `<span class="wg-ico">${WIDGET_ICONS[имя]}</span>`;

/* СВИТОК НА КНОПКЕ (выкладка 193) — тот же рисунок, что у WidgetScroll.java на телефоне: два валика
   рулоном, наконечники, лента с бантиком. Цвет — currentColor (цвет значков вида), рулон светлее.
   Не в WIDGET_ICONS: тот файл создаёт скрипт из рисунков телефона, а свиток там рисует код. */
const СВИТОК = `<svg viewBox="0 0 48 24" aria-hidden="true">
  <g stroke="rgba(0,0,0,.55)" stroke-width=".6">
    <rect x="5" y="7" width="38" height="5" rx="2.5" fill="currentColor" fill-opacity=".55"/>
    <rect x="5" y="12" width="38" height="5" rx="2.5" fill="currentColor" fill-opacity=".45"/>
    <rect x="3" y="6" width="3.2" height="12" rx="1.6" fill="currentColor"/>
    <rect x="41.8" y="6" width="3.2" height="12" rx="1.6" fill="currentColor"/>
    <rect x="22.3" y="5.5" width="3.4" height="13" fill="currentColor"/>
    <path d="M24 12 C25.5 8 30 8.5 30.5 12 C30 15.5 25.5 16 24 12 Z M24 12 C22.5 8 18 8.5 17.5 12 C18 15.5 22.5 16 24 12 Z" fill="currentColor"/>
    <rect x="22.4" y="10" width="3.2" height="4" rx="1" fill="currentColor"/>
  </g>
</svg>`;
const кнопкаСвитка = вертикально =>
    `<span class="wg-btn small wg-scrollbtn${вертикально ? ' wg-scroll-tall' : ''}"><span class="wg-ico">${СВИТОК}</span></span>`;

/* Слова вида: свои надписи человека, а где их нет — стандартные из словаря. */
/** Слова вида (заголовок, подписи, кнопки, дни) — и для подсказок в окне «Установить виджет». */
export function widgetWords(стиль, ключ, look, перевод) {
    const слово = к => перевод(`widgets.w.${к}`);
    // Своя надпись, равная стандартной фразе любого языка, — на языке человека (выкладка 171)
    const таблица = widgetAliases(перевод);
    const своё = (поле, обычное) => translateOwn(стиль[поле], таблица) || обычное;
    const дни = перевод('widgets.days').split(',').map(д => д.trim());

    const заголовок = ключ === 'fillWide' ? слово('titleWide')
        : ключ === 'tall' || ключ === 'fillTall' ? слово('titleTall') : слово('titleHud');

    // Метка в шапке: у залитого горизонтального — сегодняшний день, как на макете; у остальных
    // одно слово «Активно» (владелец 18.10.2026: «Связь активна» — лишнее, «просто Активно»)
    const метка = ключ === 'fillWide' ? своё('subtitle', дни[look.day])
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
    // Без времени («—») — мельче: слова длиннее цифр и иначе обрезались бы
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
    /* Вид со свитком рисуется как свой основной (узкий, чакровый) плюс кнопка свитка (выкладка 193) */
    const основа = формат.base || формат.key;
    const слово = widgetWords(стиль, основа, look, перевод);
    const золото = look.gold;

    const alpha = (стиль.alpha ?? (формат.fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon)) / 100;
    const заливка = формат.fill ? fillColor(look) : look.graphite ? GRAPHITE.base : look.accent;
    // Зеркало (выкладка 179): основа — картинка, цвета — как у неонового вида на любом виде
    const зеркало = look.mirror !== undefined;
    const залит = формат.fill && !зеркало;
    const классы = ['wg', `wg-${основа.toLowerCase()}`, формат.scroll ? 'wg-with-scroll' : '',
        залит ? 'wg-fill' : '', золото ? 'wg-gold' : '', look.graphite ? 'wg-graphite' : '',
        зеркало ? 'wg-mirror' : '',
        залит && look.ink && !золото && !look.graphite ? 'wg-ink' : '',
        // Красный, синий, сиреневый залитые: часы — сам цвет чакры (выкладки 175, 178)
        залит && !look.ink && !золото && !look.graphite ? 'wg-glass' : ''].filter(Boolean).join(' ');
    // Точка обрезки картинки (выкладка 180) — как WidgetPictures.Картинка.фокус на телефоне
    const картинка = зеркало
        ? ` data-photo="${look.photo}" data-focus="${look.focus.map(д => `${Math.round(д * 100)}%`).join(' ')}"` : '';

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
    if (основа === 'slim') {
        // Как на телефоне (выкладка 141): справа столбиком шестерёнка и вход в кабинет
        тело = `
          <div class="wg-pair wg-a"><div class="wg-label">${иконка('a')}${метка('a')}</div><div class="wg-value">${срок('a')}</div></div>
          <span class="wg-sep"></span>
          <div class="wg-pair wg-b"><div class="wg-label">${иконка('b')}${метка('b')}</div><div class="wg-value">${срок('b')}</div></div>
          ${формат.scroll ? кнопкаСвитка(true) : ''}<span class="wg-stack"><span class="wg-btn small">${значок('gear')}</span><span class="wg-btn small mark">${значок('mark')}</span></span>`;
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
        const неделя = основа === 'week'
            ? `<div class="wg-week-strip">${слово.days.map((д, i) => {
                /* На картинке (выкладка 184) — цвет чакры светлее (35% белого): чистый красный или синий
                   тонет в пёстрой картинке; жирность и тёмный ореол — в css/widgets.css (.wg-mirror). */
                const цвет = золото ? GOLD.text : зеркало ? mix(CHAKRAS[i].hex, '#FFFFFF', MIRROR_DAY_LIGHT) : CHAKRAS[i].hex;
                return `<span class="${i === look.day ? 'today' : ''}" data-color="${цвет}">${экран(д)}</span>`;
            }).join('')}</div>` : '';
        const шапка = `<div class="wg-head">${заголовок}<span class="wg-head-end">
            <span class="wg-chip">${экран(слово.sub)}</span>${формат.fill ? шестерня : ''}</span></div>`;
        const низ = формат.fill
            ? кнопка(слово.cabinet)
            : (формат.scroll ? кнопкаСвитка(false) : '') + кнопка(слово.settings, 'alt') + кнопка(слово.cabinet);
        тело = `${шапка}<div class="wg-cards">${карточка('a')}${карточка('b')}</div>${неделя}
                <div class="wg-btns">${низ}</div>`;
    }

    return `<div class="${классы}" data-format="${формат.key}" data-accent="${look.accent}" data-soft="${look.soft}" data-time-a="${look.timeA}" data-time-b="${look.timeB}" data-fill="${заливка}" data-alpha="${alpha}" data-btn-alpha="${стиль.buttonAlpha ?? 100}"${картинка}>
        <span class="wg-plate"></span><span class="wg-rim"></span>
        <div class="wg-body">${тело}</div></div>`;
}

/** Поставить цвета вида виджетам внутри узла (после вставки разметки widgetHtml). */
export function applyWidgetVars(узел) {
    for (const виджет of узел.querySelectorAll('.wg[data-accent]')) {
        виджет.style.setProperty('--wg-accent', виджет.dataset.accent);
        виджет.style.setProperty('--wg-soft', виджет.dataset.soft);
        // Сроки неонового вида (выкладка 171): цвет дня, осветлённый ровно до читаемого
        виджет.style.setProperty('--wg-time-a', виджет.dataset.timeA);
        виджет.style.setProperty('--wg-time-b', виджет.dataset.timeB);
        виджет.style.setProperty('--wg-fill', виджет.dataset.fill);
        виджет.style.setProperty('--wg-alpha', виджет.dataset.alpha);
        // Прозрачность заливки кнопок (выкладка 195); у золота — класс: пластина остаётся одной кромкой
        виджет.style.setProperty('--wg-btn-a', `${виджет.dataset.btnAlpha ?? 100}%`);
        виджет.classList.toggle('wg-btn-glass', Number(виджет.dataset.btnAlpha ?? 100) < 100);
        // Картинка зеркала — свойством, а не атрибутом style (политика безопасности страниц)
        /* Полным адресом (выкладка 182): относительный url() из переменной Chrome ищет от файла стилей
           (css/widgets.css), то есть в css/img/…, — картинки на компьютере и в окне не было видно. */
        if (виджет.dataset.photo) {
            виджет.style.setProperty('--wg-photo', `url("${new URL(виджет.dataset.photo, document.baseURI).href}")`);
        }
        if (виджет.dataset.focus) виджет.style.setProperty('--wg-photo-at', виджет.dataset.focus);
    }
    for (const день of узел.querySelectorAll('[data-color]')) день.style.color = день.dataset.color;
}
