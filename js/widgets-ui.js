/* ОКНО «УСТАНОВИТЬ ВИДЖЕТ» (раздел 9.21 методологии).

   Одно окно на всё: что настраиваем (новые виджеты или один из стоящих на столе),
   цвет, прозрачность, надписи — и шесть видов с живым предпросмотром и кнопкой
   «Установить». Кнопка стоит в меню профиля, а шестерёнка на самом виджете
   открывает это же окно сразу на настройках ЭТОГО виджета (цель «widget:<номер>»).

   ГДЕ ЧТО. Цвета, золото и правила цвета дня — core/widgets.js; рисует виджет на
   телефоне Java (WidgetRender), а здесь — его копия в HTML, чтобы человек видел
   результат до установки. Золотые пластина и кромка в копии — классы сайта
   (--pult-face-dark, --pult-rim), а не рисуются заново: см. css/widgets.css. Буквы на
   золоте — .gold-cut сайта везде; карточки сроков в золоте — чёрные пластины с кантом, как
   таблица девяти моментов; основа залитого золота и золотые кнопки — фотографии владельца
   (img/widget), те же, что в приложении на телефоне (выкладки 145–146).

   СОХРАНЕНИЕ. Любая правка уходит на телефон сразу (с короткой паузой, пока человек
   двигает ползунок или печатает) и перерисовывает стоящие виджеты. «Для новых» —
   стиль, который получит виджет, положенный на стол следом; уже стоящие он не
   трогает. В браузере телефона нет: окно работает как просмотр. */

import { t } from './store.js';
import { isNative, widgetList, widgetSave, offerWidget, offerTile } from './core/reminders.js';
import { widgetTerms, publishDesktopWidget } from './reminder-plan.js';
import {
    FORMATS, CHAKRAS, DEFAULT_ALPHA, normalizeStyle, resolveLook, widgetAliases, translateOwn
} from './core/widgets.js';
import { PICTURE_STEP_KEY, setPictureStep } from './core/widget-pictures.js';
import { widgetHtml, widgetWords, applyWidgetVars } from './core/widget-html.js';
import { readDesktopStyle, writeDesktopStyle } from './core/desktop-widget-store.js';
import { pickerHtml, pickerAction, applySwatches, styleNote } from './widget-picker.js';

const $ = id => document.getElementById(id);

const ПАУЗА_СОХРАНЕНИЯ_МС = 300;

/* Цель — что настраиваем: 0 — новые виджеты; на телефоне — номер стоящего виджета, на компьютере — вид
   окна-виджета (у каждого свой стиль, выкладка 182). */
let цель = 0;
let стоящие = [];               // [{id, format, style}]; на компьютере id — вид
let стили = new Map();          // номер → нормализованный стиль (0 — для новых)
let сроки = null;               // что сейчас написано на плашке: {architect, observer}
let таймер = 0;
let картинкиОткрыты = false;    // окно картинок за стрелкой (выкладка 180), открывается свёрнутым

const экран = текст => String(текст ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


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

/* Сам виджет в HTML рисует core/widget-html.js — та же функция рисует окно виджета на
   компьютере (widget.html, выкладка 150). */

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
          ${widgetHtml(формат, стиль, дата, сроки, t)}
          ${можноСтавить
            ? `<button type="button" class="btn" data-install="${формат.key}">${экран(t('widgets.install'))}</button>`
            : `<button type="button" class="btn" data-desktop="${формат.key}">${экран(t(вПриложенииДляКомпьютера()
                ? 'widgets.placeDesktop' : 'widgets.openDesktop'))}</button>`}
        </div>`).join('');
    applyWidgetVars($('widgetsGallery'));
}

/* ВИДЖЕТ НА КОМПЬЮТЕРЕ (выкладка 150). На телефоне кнопка ставит виджет на рабочий стол, а в
   браузере на компьютере — открывает тот же вид отдельным маленьким окном (widget.html), которое
   ставят в угол экрана. Окно рисует виджет той же функцией, что предпросмотр, по стилю из окна
   «Установить виджет» и по кадрам сроков, которые кладёт приложение (publishDesktopWidget):
   кадры расписаны по часам вперёд, поэтому окно переключает сроки само, даже когда приложение
   закрыто. Стиль кладётся на компьютер при каждой правке — открытое окно перекрашивается сразу. */
/* Окно открыто в приложении для компьютера (desktop/, Electron): оно ставит виджет прямо на
   рабочий стол окном без рамки. Узнаётся по метке в строке браузера, которую ставит оболочка. */
const вПриложенииДляКомпьютера = () => /KvantDesktop\//.test(navigator.userAgent);

const ОКНО_ВИДЖЕТА = {
    slim: [420, 130], hud: [380, 300], week: [380, 330], fillWide: [380, 300], tall: [230, 420], fillTall: [230, 420]
};

/* Стиль цели — на компьютер: свой ключ у вида, общий у «новых» (core/desktop-widget-store.js). */
function стильНаКомпьютер() {
    writeDesktopStyle(typeof цель === 'string' ? цель : '', normalizeStyle(стильЦели()));
}

async function открытьНаКомпьютере(ключВида) {
    // Окно получает то, что человек видит в предпросмотре: этот стиль становится стилем вида
    writeDesktopStyle(ключВида, normalizeStyle(стильЦели()));
    await publishDesktopWidget();
    const [ширина, высота] = ОКНО_ВИДЖЕТА[ключВида] || ОКНО_ВИДЖЕТА.hud;
    window.open(`widget.html?f=${encodeURIComponent(ключВида)}`, `kvant-widget-${ключВида}`,
        `popup,width=${ширина},height=${высота}`);
}

function нарисоватьФорму() {
    const стиль = стильЦели();
    const look = resolveLook(стиль);
    const вид = видЦели();

    for (const кнопка of $('widgetsModes').querySelectorAll('button')) {
        кнопка.setAttribute('aria-pressed', String(кнопка.dataset.mode === стиль.mode));
    }

    // Кружки цветов чакр — при «цвете чакры»
    const круги = $('widgetsSwatches');
    круги.hidden = стиль.mode !== 'chakra';
    круги.innerHTML = CHAKRAS.map((ч, i) =>
        `<button type="button" class="wg-swatch" data-chakra="${i}" data-sw="${ч.hex}"
            aria-label="${экран(t(`widgets.chakra.${i}`))}" aria-pressed="${i === стиль.chakra}"></button>`).join('');
    applySwatches(круги);

    // Картинки — за стрелкой: общее окно с окном настроек виджета на компьютере (widget-picker.js)
    $('widgetsPicker').innerHTML = pickerHtml(стиль, look, t, картинкиОткрыты);
    applySwatches($('widgetsPicker'));
    $('widgetsModeNote').textContent = styleNote(стиль, look, t);

    const процент = стиль.alpha ?? (вид.fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon);
    $('widgetsAlpha').value = String(процент);
    $('widgetsAlphaLabel').textContent = t('widgets.alpha', { n: процент });

    // Пустое поле — стандартная надпись; она же видна подсказкой
    const слово = widgetWords(normalizeStyle({}), вид.key, look, t);
    // Своя надпись, равная стандартной фразе любого языка, видна в поле так же, как на виджете
    const таблица = widgetAliases(t);
    for (const [поле, значение, подсказка] of [
        ['widgetsTitle', стиль.title, слово.title],
        ['widgetsSubtitle', стиль.subtitle, слово.sub],
        ['widgetsArchitect', стиль.architect, слово.architect],
        ['widgetsObserver', стиль.observer, слово.observer]
    ]) {
        const элемент = $(поле);
        // Поле, в котором человек печатает прямо сейчас, не трогаем: курсор прыгнул бы
        if (document.activeElement !== элемент) элемент.value = translateOwn(значение, таблица);
        элемент.placeholder = подсказка;
    }
}

function нарисоватьЦели() {
    const выбор = $('widgetsTarget');

    выбор.innerHTML = [`<option value="0">${экран(t('widgets.targetNew'))}</option>`]
        .concat(стоящие.map(в => `<option value="${в.id}">${экран(typeof в.id === 'string'
            ? t('widgets.targetDesktop', { format: t(`widgets.format.${в.format}`) })
            : t('widgets.targetOne', { format: t(`widgets.format.${в.format}`), n: в.id }))}</option>`)).join('');
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
        if (isNative()) widgetSave(цель, дляТелефона(стильЦели()));
        else стильНаКомпьютер();
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

/* Плитка в шторке: система сама показывает окно с кнопкой «Добавить» (Android 13+).
   Коды ответа — как у StatusBarManager: 0 не добавлена, 1 уже была, 2 добавлена;
   отрицательные — телефон не умеет (ниже Android 13) или не ответил. */
async function поставитьПлитку() {
    const код = await offerTile();
    if (код === 2) сказать('widgets.tileAdded');
    else if (код === 1) сказать('widgets.tileHave');
    else if (код === 0) сказать('widgets.tileNo');
    else сказать('widgets.tileManual');
}

/**
 * Открыть окно. Номер — на каком стоящем виджете: шестерёнка на виджете ведёт
 * сюда с его номером. Нет такого — окно открывается на «новых».
 */
export async function openWidgets(номер = 0) {
    const окно = $('widgetsDialog');
    /* Окно уже открыто (нажали шестерёнку на одном виджете, потом на другом) — не выходим,
       а перечитываем список и встаём на тот виджет, чья шестерёнка нажата последней. */

    const список = await widgetList();
    стоящие = список.widgets;
    /* На компьютере и в браузере (выкладка 182) «стоящие» — шесть видов окон-виджетов, у каждого свой стиль;
       «новые» — общий стиль. Читаются сохранённые: до 182 окно открывалось с умолчаниями и затирало их. */
    if (!isNative()) {
        стоящие = FORMATS.map(ф => ({ id: ф.key, format: ф.key, style: readDesktopStyle(ф.key) }));
        список.defaults = readDesktopStyle('');
    }
    // На телефоне — шаг картинок «при открытии» из приложения: предпросмотр показывает то же, что стол
    if (isNative()) setPictureStep(список.pictureStep);
    стили = new Map([[0, normalizeStyle(список.defaults)]]);
    for (const в of стоящие) стили.set(в.id, normalizeStyle(в.style));
    цель = стоящие.some(в => в.id === номер) ? номер : 0;   // номер на компьютере — вид (#widgets:<вид>)

    /* Что сейчас написано на плашке — то и в предпросмотре. Кадров нет (приложение
       в браузере или день не загружен) — образец, чтобы окно не было пустым. */
    сроки = await widgetTerms().catch(() => null) || {
        architect: t('widgets.sample.architect'),
        observer: t('widgets.sample.observer')
    };

    $('widgetsBrowserNote').hidden = isNative();
    // Ссылка на установщик для компьютера — только в обычном браузере
    $('widgetsDesktopDownload').hidden = isNative() || вПриложенииДляКомпьютера();
    $('widgetsTileBox').hidden = !isNative();
    $('widgetsMsg').hidden = true;
    нарисоватьВсё();
    if (!окно.open) окно.showModal();
}

/* ОТКРЫТИЕ ПРИЛОЖЕНИЯ НА КОМПЬЮТЕРЕ И В БРАУЗЕРЕ (выкладка 181): каждый показ страницы — шаг картинок
   «при открытии». Шаг лежит в браузере; окно виджета на компьютере читает его же и перерисовывается сразу
   (событие storage). На телефоне шаг считает само приложение (WidgetStore), здесь его только читают. */
function шагПриОткрытии() {
    if (isNative()) return;
    try {
        const шаг = (Number(localStorage.getItem(PICTURE_STEP_KEY)) || 0) + 1;
        localStorage.setItem(PICTURE_STEP_KEY, String(шаг));
        setPictureStep(шаг);
    } catch {
        // Хранилище закрыто (приватное окно) — картинка просто не сменится
    }
}

export function initWidgets() {
    шагПриОткрытии();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') шагПриОткрытии();
    });

    $('widgetsOpen').addEventListener('click', () => openWidgets(0));
    for (const id of ['widgetsBack', 'widgetsDone']) {
        $(id).addEventListener('click', () => $('widgetsDialog').close());
    }

    $('widgetsTarget').addEventListener('change', () => {
        const значение = $('widgetsTarget').value;
        // На компьютере цель — вид окна-виджета, на телефоне — номер
        цель = /^\d+$/.test(значение) ? Number(значение) : значение;
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

    // Окно картинок: стрелка, «По дням», «Авто», «Менять», картинки, «Закрыть» (widget-picker.js)
    $('widgetsPicker').addEventListener('click', событие => {
        const что = pickerAction(событие, стильЦели(), картинкиОткрыты);
        if (!что) return;
        if ('open' in что) {
            картинкиОткрыты = что.open;
            нарисоватьФорму();
        }
        if (что.patch) изменить(что.patch);
    });

    $('widgetsAlpha').addEventListener('input', () => {    $('widgetsAlpha').addEventListener('input', () => {
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

    $('widgetsTileAdd').addEventListener('click', поставитьПлитку);

    $('widgetsGallery').addEventListener('click', событие => {
        const кнопка = событие.target.closest('button[data-install]');
        if (кнопка) установить(кнопка.dataset.install);
        const компьютер = событие.target.closest('button[data-desktop]');
        if (компьютер) открытьНаКомпьютере(компьютер.dataset.desktop);
    });
}
