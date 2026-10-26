/* НАСТРОЙКИ ОДНОГО ВИДЖЕТА НА КОМПЬЮТЕРЕ (выкладка 182).

   Владелец 26.10.2026: «кнопка настройки на виджете на компьютере не работает — сбрасывает на основной
   кабинет; должна быть отдельная настройка, как на телефоне». На телефоне шестерёнка открывает лист
   поверх стола (WidgetSheetActivity); здесь — это маленькое окно, и устроено оно так же:
     непрозрачность — ползунок, виджет меняется, пока едет;
     цвет — кружки: «Авто по дням», «Золото», «Графит» и семь чакр;
     «Картинки ▾» — то же окно, что в «Установить виджет» (widget-picker.js);
     «Надписи и другие виды — в приложении» — окно «Установить виджет» сразу на этом виде.
   Время звонков, как на телефоне, здесь не правится: звонит телефон, а не компьютер.

   Стиль — свой у каждого вида (core/desktop-widget-store.js). Окно виджета слышит запись в хранилище
   (событие storage) и перерисовывается сразу — правка видна «на глазах», как на телефоне. */

import { FORMATS, CHAKRAS, DEFAULT_ALPHA, normalizeStyle, resolveLook } from './core/widgets.js';
import { translate } from './core/i18n.js';
import { PICTURE_STEP_KEY, setPictureStep } from './core/widget-pictures.js';
import { readDesktopStyle, writeDesktopStyle } from './core/desktop-widget-store.js';
import { pickerHtml, pickerAction, applySwatches, styleNote } from './widget-picker.js';

const $ = id => document.getElementById(id);
const экран = текст => String(текст ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ключ = new URLSearchParams(location.search).get('f');
const формат = FORMATS.find(ф => ф.key === ключ) || FORMATS.find(ф => ф.key === 'hud');

/* Язык — тот же, что у виджетов: приложение кладёт его вместе со сроками (publishDesktopWidget). */
function язык() {
    try {
        return JSON.parse(localStorage.getItem('kvant-desktop-widget') || 'null')?.lang || 'ru';
    } catch {
        return 'ru';
    }
}
const t = (к, значения) => translate(язык(), к, значения);

let стиль = normalizeStyle(readDesktopStyle(формат.key));
let картинкиОткрыты = false;    // окно картинок открывается свёрнутым, как на телефоне

/* Кружки цвета в одну строку, как на телефоне: «Авто по дням» (все чакры по кругу), «Золото», «Графит»,
   семь чакр. Выбранный — с белым кольцом. */
const ЦВЕТА = [
    { mode: 'auto', name: 'widgets.w.modeAuto', cls: 'ws-dot-auto' },
    { mode: 'gold', name: 'widgets.w.modeGold', cls: 'ws-dot-gold' },
    { mode: 'graphite', name: 'widgets.w.modeGraphite', cls: 'ws-dot-graphite' },
    ...CHAKRAS.map((ч, i) => ({ mode: 'chakra', chakra: i, name: `widgets.chakra.${i}`, sw: ч.hex }))
];

function нарисовать() {
    const look = resolveLook(стиль);
    setPictureStep(localStorage.getItem(PICTURE_STEP_KEY));

    document.documentElement.lang = язык();
    document.title = `${t('widgets.w.sheetTitle')} · ${t(`widgets.format.${формат.key}`)}`;
    $('wsTitle').textContent = t('widgets.w.sheetTitle');
    $('wsFormat').textContent = t(`widgets.format.${формат.key}`);
    $('wsDone').textContent = t('widgets.w.sheetDone');
    $('wsOpacityLabel').textContent = t('widgets.w.sheetOpacity');
    $('wsColorLabel').textContent = t('widgets.w.sheetColor');
    $('wsMore').textContent = t('widgets.w.sheetMore');

    const процент = стиль.alpha ?? (формат.fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon);
    $('wsAlpha').value = String(процент);
    $('wsPercent').textContent = `${процент}%`;

    $('wsColors').innerHTML = ЦВЕТА.map((ц, i) => {
        const выбран = ц.mode === стиль.mode && (ц.mode !== 'chakra' || ц.chakra === стиль.chakra);
        return `<button type="button" class="wg-swatch ws-dot ${ц.cls || ''}" data-color="${i}" ${ц.sw ? `data-sw="${ц.sw}"` : ''}
            aria-label="${экран(t(ц.name))}" title="${экран(t(ц.name))}" aria-pressed="${выбран}"></button>`;
    }).join('');
    applySwatches($('wsColors'));
    const выбранный = ЦВЕТА.find(ц => ц.mode === стиль.mode && (ц.mode !== 'chakra' || ц.chakra === стиль.chakra));
    $('wsColorName').textContent = выбранный ? t(выбранный.name)
        : стиль.mode === 'mirrorAuto' ? t('widgets.w.modeMirrorAuto')
        : стиль.mode === 'mirrorRotate' ? t('widgets.w.modeMirrorRotate') : t('widgets.w.modeMirror');

    $('wsPicker').innerHTML = pickerHtml(стиль, look, t, картинкиОткрыты);
    applySwatches($('wsPicker'));
    $('wsNote').textContent = styleNote(стиль, look, t);
}

/* Правка — в хранилище сразу: окно виджета перерисуется от события storage. */
function изменить(правка) {
    стиль = normalizeStyle({ ...стиль, ...правка });
    writeDesktopStyle(формат.key, стиль);
    нарисовать();
}

$('wsAlpha').addEventListener('input', () => изменить({ alpha: Number($('wsAlpha').value) }));
$('wsColors').addEventListener('click', событие => {
    const круг = событие.target.closest('button[data-color]');
    if (!круг) return;
    const { mode, chakra } = ЦВЕТА[Number(круг.dataset.color)];
    изменить(chakra === undefined ? { mode } : { mode, chakra });
});
$('wsPicker').addEventListener('click', событие => {
    const что = pickerAction(событие, стиль, картинкиОткрыты);
    if (!что) return;
    if ('open' in что) {
        картинкиОткрыты = что.open;
        нарисовать();
    }
    if (что.patch) изменить(что.patch);
});
$('wsDone').addEventListener('click', () => window.close());
// Надписи и прочее — в окне «Установить виджет» приложения, сразу на этом виде
$('wsMore').addEventListener('click', () => window.open(`index.html#widgets:${формат.key}`, 'kvant-app'));

// Стиль поменяли в приложении, пока окно открыто, — показать новый
window.addEventListener('storage', () => {
    стиль = normalizeStyle(readDesktopStyle(формат.key));
    нарисовать();
});

нарисовать();
