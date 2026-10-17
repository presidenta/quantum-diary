/* ОКНО «УСТАНОВИТЬ ВИДЖЕТ» (раздел 9.21 методологии).

   Одно окно на всё: что настраиваем (новые виджеты или один из стоящих на столе),
   цвет, прозрачность, надписи — и шесть видов с живым предпросмотром и кнопкой
   «Установить». Кнопка стоит в меню профиля, а шестерёнка на самом виджете
   открывает это же окно сразу на настройках ЭТОГО виджета (цель «widget:<номер>»).

   ГДЕ ЧТО. Цвета, золото и правила цвета дня — core/widgets.js; рисует виджет на
   телефоне Java (WidgetRender), а здесь — его копия в HTML, чтобы человек видел
   результат до установки. Золото в копии берётся классами сайта (--pult-face-gold,
   --pult-rim, .gold-cut), а не рисуется заново: см. css/widgets.css.

   СОХРАНЕНИЕ. Любая правка уходит на телефон сразу (с короткой паузой, пока человек
   двигает ползунок или печатает) и перерисовывает стоящие виджеты. «Для новых» —
   стиль, который получит виджет, положенный на стол следом; уже стоящие он не
   трогает. В браузере телефона нет: окно работает как просмотр. */

import { t } from './store.js';
import { isNative, widgetList, widgetSave, offerWidget } from './core/reminders.js';
import { widgetTerms } from './reminder-plan.js';
import {
    FORMATS, CHAKRAS, DEFAULT_ALPHA, GOLD, GRAPHITE, normalizeStyle, resolveLook
} from './core/widgets.js';
import { WIDGET_ICONS } from './core/widget-icons.js';

const $ = id => document.getElementById(id);

const ПАУЗА_СОХРАНЕНИЯ_МС = 300;

let цель = 0;                   // 0 — новые виджеты, иначе номер стоящего
let стоящие = [];               // [{id, format, style}]
let стили = new Map();          // номер → нормализованный стиль (0 — для новых)
let сроки = null;               // что сейчас написано на плашке: {architect, observer}
let таймер = 0;

const экран = текст => String(текст ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const значок = имя => `<span class="wg-ico">${WIDGET_ICONS[имя]}</span>`;

function видЦели() {
    // Для новых видом считаем средний: от него зависят слова-подсказки и прозрачность
    return FORMATS.find(ф => ф.key === (стоящие.find(в => в.id === цель)?.format || 'hud'));
}

function стильЦели() {
    return стили.get(цель) || normalizeStyle({});
}

/* Стиль в том виде, в каком его принимает телефон: без пустой прозрачности. */
function дляТелефона(стиль) {
    const { alpha, ...остальное } = normalizeStyle(стиль);
    return alpha === null ? остальное : { ...остальное, alpha };
}

/* ==========================================================================
   ПРЕДПРОСМОТР
   ========================================================================== */

/* Слова вида: свои надписи человека, а где их нет — стандартные из словаря. */
function слова(стиль, ключ, look) {
    const слово = к => t(`widgets.w.${к}`);
    const своё = (поле, обычное) => стиль[поле] || обычное;
    const дни = t('widgets.days').split(',').map(д => д.trim());

    const заголовок = ключ === 'fillWide' ? слово('titleWide')
        : ключ === 'tall' || ключ === 'fillTall' ? слово('titleTall') : слово('titleHud');

    // Метка в шапке: у залитого горизонтального — сегодняшний день, как на макете
    const метка = ключ === 'fillWide' ? (стиль.subtitle || дни[look.day])
        : ключ === 'tall' ? своё('subtitle', слово('subLong'))
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
    if (!найдено) return экран(текст);

    const до = текст.slice(0, найдено.index).trim();
    return (до ? `<small>${экран(до)}</small> ` : '') + `<b>${найдено[1]}</b>`;
}

function предпросмотр(формат, стиль, дата) {
    const look = resolveLook(стиль, дата);
    const слово = слова(стиль, формат.key, look);
    const золото = look.gold;
    // Золотые буквы — класс сайта; у остальных обычный текст
    const буквы = html => золото ? `<span class="gold-cut">${html}</span>` : html;

    const alpha = (стиль.alpha ?? (формат.fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon)) / 100;
    const заливка = look.graphite ? GRAPHITE.base : look.accent;
    const классы = ['wg', `wg-${формат.key.toLowerCase()}`,
        формат.fill ? 'wg-fill' : '', золото ? 'wg-gold' : '', look.graphite ? 'wg-graphite' : '',
        формат.fill && look.ink && !золото && !look.graphite ? 'wg-ink' : ''].filter(Boolean).join(' ');

    const срок = (с) => срокHtml(с === 'a' ? сроки.architect : сроки.observer);
    const метка = (с) => буквы(экран(с === 'a' ? слово.architect : слово.observer));
    const иконка = с => значок(с === 'a' ? 'book' : 'flower');

    const карточка = (с, класс = 'wg-card') => `
        <div class="${класс} wg-${с}">
          <div class="wg-label">${иконка(с)}${метка(с)}</div>
          <div class="wg-value">${буквы(срок(с))}</div>
        </div>`;

    const кнопка = (текст, класс = '') =>
        `<span class="wg-btn ${класс}">${буквы(экран(текст))}</span>`;
    const шестерня = `<span class="wg-gear">${значок('gear')}</span>`;
    const заголовок = `<span class="wg-title">${буквы(экран(слово.title))}</span>`;

    let тело;
    if (формат.key === 'slim') {
        тело = `
          ${иконка('a')}<div class="wg-pair wg-a"><div class="wg-label">${метка('a')}</div><div class="wg-value">${буквы(срок('a'))}</div></div>
          <span class="wg-sep"></span>
          ${иконка('b')}<div class="wg-pair wg-b"><div class="wg-label">${метка('b')}</div><div class="wg-value">${буквы(срок('b'))}</div></div>
          <span class="wg-btn small">${значок('gear')}</span><span class="wg-btn small mark">${значок('mark')}</span>`;
    } else if (формат.tall) {
        const шапка = формат.fill
            ? `<div class="wg-head">${заголовок}${шестерня}</div>`
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
                return `<span class="${i === look.day ? 'today' : ''}" style="color:${цвет}">${экран(д)}</span>`;
            }).join('')}</div>` : '';
        const шапка = `<div class="wg-head">${заголовок}<span class="wg-head-end">
            <span class="wg-chip">${экран(слово.sub)}</span>${формат.fill ? шестерня : ''}</span></div>`;
        const низ = формат.fill
            ? кнопка(слово.cabinet)
            : кнопка(слово.settings, 'alt') + кнопка(слово.cabinet);
        тело = `${шапка}<div class="wg-cards">${карточка('a')}${карточка('b')}</div>${неделя}
                <div class="wg-btns">${низ}</div>`;
    }

    return `<div class="${классы}" style="--wg-accent:${look.accent};--wg-soft:${look.soft};--wg-fill:${заливка};--wg-alpha:${alpha}">
        <span class="wg-plate"></span><span class="wg-rim"></span>
        <div class="wg-body">${тело}</div></div>`;
}

/* ==========================================================================
   ОКНО
   ========================================================================== */

function нарисоватьГалерею() {
    const стиль = стильЦели();
    const дата = new Date();
    const можноСтавить = isNative();

    $('widgetsGallery').innerHTML = FORMATS.map(формат => `
        <div class="wg-item">
          <span class="wg-item-name">${экран(t(`widgets.format.${формат.key}`))}</span>
          ${предпросмотр(формат, стиль, дата)}
          ${можноСтавить ? `<button type="button" class="btn" data-install="${формат.key}">${экран(t('widgets.install'))}</button>` : ''}
        </div>`).join('');
}

function нарисоватьФорму() {
    const стиль = стильЦели();
    const look = resolveLook(стиль);
    const вид = видЦели();

    for (const кнопка of $('widgetsModes').querySelectorAll('button')) {
        кнопка.setAttribute('aria-pressed', String(кнопка.dataset.mode === стиль.mode));
    }

    // Цвета чакр — только когда выбран «цвет чакры»
    const круги = $('widgetsSwatches');
    круги.hidden = стиль.mode !== 'chakra';
    круги.innerHTML = CHAKRAS.map((ч, i) =>
        `<button type="button" class="wg-swatch" data-chakra="${i}" style="--sw:${ч.hex}"
            aria-label="${экран(t(`widgets.chakra.${i}`))}" aria-pressed="${i === стиль.chakra}"></button>`).join('');

    const название = t(`widgets.chakra.${look.chakra}`);
    $('widgetsModeNote').textContent = t(`widgets.modeNote.${стиль.mode}`, {
        day: t('widgets.days').split(',')[look.day].trim(),
        chakra: название
    });

    const процент = стиль.alpha ?? (вид.fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon);
    $('widgetsAlpha').value = String(процент);
    $('widgetsAlphaLabel').textContent = t('widgets.alpha', { n: процент });

    // Пустое поле — стандартная надпись; она же видна подсказкой
    const слово = слова(normalizeStyle({}), вид.key, look);
    for (const [поле, значение, подсказка] of [
        ['widgetsTitle', стиль.title, слово.title],
        ['widgetsSubtitle', стиль.subtitle, слово.sub],
        ['widgetsArchitect', стиль.architect, слово.architect],
        ['widgetsObserver', стиль.observer, слово.observer]
    ]) {
        const элемент = $(поле);
        // Поле, в котором человек печатает прямо сейчас, не трогаем: курсор прыгнул бы
        if (document.activeElement !== элемент) элемент.value = значение;
        элемент.placeholder = подсказка;
    }
}

function нарисоватьЦели() {
    const выбор = $('widgetsTarget');

    выбор.innerHTML = [`<option value="0">${экран(t('widgets.targetNew'))}</option>`]
        .concat(стоящие.map(в => `<option value="${в.id}">${экран(t('widgets.targetOne', {
            format: t(`widgets.format.${в.format}`), n: в.id
        }))}</option>`)).join('');
    выбор.value = String(цель);
    // Выбранного виджета в списке нет (его сняли со стола) — остаются «новые»
    if (!выбор.value) выбор.value = '0';
}

function нарисоватьВсё() {
    нарисоватьЦели();
    нарисоватьФорму();
    нарисоватьГалерею();
}

/* Правка стиля: сразу в окне, на телефон — с паузой. */
function изменить(правка) {
    стили.set(цель, normalizeStyle({ ...стильЦели(), ...правка }));
    нарисоватьФорму();
    нарисоватьГалерею();

    clearTimeout(таймер);
    таймер = setTimeout(() => {
        widgetSave(цель, дляТелефона(стильЦели()));
    }, ПАУЗА_СОХРАНЕНИЯ_МС);
}

function сказать(ключ) {
    const поле = $('widgetsMsg');
    поле.textContent = t(ключ);
    поле.hidden = false;
}

async function установить(ключВида) {
    $('widgetsMsg').hidden = true;

    // Новый виджет получит то, что человек сейчас видит: вносим это в «для новых»
    стили.set(0, normalizeStyle(стильЦели()));
    clearTimeout(таймер);
    await widgetSave(0, дляТелефона(стили.get(0)));

    const показано = await offerWidget(ключВида);
    сказать(показано ? 'widgets.asked' : 'widgets.manual');
}

/**
 * Открыть окно. Номер — на каком стоящем виджете: шестерёнка на виджете ведёт
 * сюда с его номером. Нет такого — окно открывается на «новых».
 */
export async function openWidgets(номер = 0) {
    const окно = $('widgetsDialog');
    if (окно.open) return;

    const список = await widgetList();
    стоящие = список.widgets;
    стили = new Map([[0, normalizeStyle(список.defaults)]]);
    for (const в of стоящие) стили.set(в.id, normalizeStyle(в.style));
    цель = стоящие.some(в => в.id === номер) ? номер : 0;

    /* Что сейчас написано на плашке — то и в предпросмотре. Кадров нет (приложение
       в браузере или день не загружен) — образец, чтобы окно не было пустым. */
    сроки = await widgetTerms().catch(() => null) || {
        architect: t('widgets.sample.architect'),
        observer: t('widgets.sample.observer')
    };

    $('widgetsBrowserNote').hidden = isNative();
    $('widgetsMsg').hidden = true;
    нарисоватьВсё();
    if (!окно.open) окно.showModal();
}

export function initWidgets() {
    $('widgetsOpen').addEventListener('click', () => openWidgets(0));
    for (const id of ['widgetsBack', 'widgetsDone']) {
        $(id).addEventListener('click', () => $('widgetsDialog').close());
    }

    $('widgetsTarget').addEventListener('change', () => {
        цель = Number($('widgetsTarget').value) || 0;
        нарисоватьВсё();
    });

    $('widgetsModes').addEventListener('click', событие => {
        const кнопка = событие.target.closest('button[data-mode]');
        if (кнопка) изменить({ mode: кнопка.dataset.mode });
    });

    $('widgetsSwatches').addEventListener('click', событие => {
        const круг = событие.target.closest('button[data-chakra]');
        if (круг) изменить({ chakra: Number(круг.dataset.chakra) });
    });

    $('widgetsAlpha').addEventListener('input', () => {
        изменить({ alpha: Number($('widgetsAlpha').value) });
    });

    for (const [id, поле] of [
        ['widgetsTitle', 'title'], ['widgetsSubtitle', 'subtitle'],
        ['widgetsArchitect', 'architect'], ['widgetsObserver', 'observer']
    ]) {
        $(id).addEventListener('input', () => изменить({ [поле]: $(id).value }));
    }

    $('widgetsReset').addEventListener('click', () => {
        for (const id of ['widgetsTitle', 'widgetsSubtitle', 'widgetsArchitect', 'widgetsObserver']) $(id).value = '';
        изменить({ title: '', subtitle: '', architect: '', observer: '' });
    });

    $('widgetsGallery').addEventListener('click', событие => {
        const кнопка = событие.target.closest('button[data-install]');
        if (кнопка) установить(кнопка.dataset.install);
    });
}
