/* ОКНО КАРТИНОК — ОДНО НА ДВА МЕСТА (выкладка 182).

   «Картинки ▾» стоят в окне «Установить виджет» и в окне настроек виджета на компьютере (widget-sheet.html,
   шестерёнка на виджете). Чтобы два окна не разошлись, разметку и нажатия делает этот модуль, а окна только
   вставляют её и применяют правку. На телефоне то же окно рисует WidgetSheetActivity.

   Что внутри (выкладки 180–181): «По дням» и «Авто»; при «Авто» — «Менять» (30 мин … 24 ч, «Авто», «При
   открытии»); сетка всех картинок каталога; «Закрыть». Сетка строится, только пока окно открыто.

   КАРТИНКИ — ПОЛНЫМ АДРЕСОМ (выкладка 182). Путь к картинке едет в CSS переменной (--sw-img, --wg-photo), а
   Chrome разрешает относительный url() из переменной от файла стилей, где переменная использована
   (css/widgets.css), — то есть искал css/img/…, и вместо картинок были видны цветные кружки (скриншот
   владельца 26.10.2026). Поэтому адрес — от страницы, целиком: pictureUrl. */

import { CHAKRAS, MIRROR_MODES } from './core/widgets.js';
import {
    WIDGET_PICTURES, EVERY_OPTIONS, picturePath, pictureSet, minutesEach, normalizeEvery, tapPicture, toggleAuto
} from './core/widget-pictures.js';

const экран = текст => String(текст ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Полный адрес картинки или файла сайта от текущей страницы (см. шапку). */
export const pictureUrl = путь => new URL(путь, document.baseURI).href;

/** «8 ч», «2 ч 40 мин», «48 мин» — словами языка человека. */
export function duration(минуты, t) {
    const часы = Math.floor(минуты / 60);
    const остаток = минуты % 60;
    return [часы ? `${часы} ${t('widgets.w.unitH')}` : '', остаток ? `${остаток} ${t('widgets.w.unitMin')}` : '']
        .filter(Boolean).join(' ');
}

/** Подпись под цветом: что делает выбранный режим сегодня. */
export function styleNote(стиль, look, t) {
    if (стиль.mode === 'mirrorRotate') {
        const набор = pictureSet(стиль);
        const каждые = normalizeEvery(стиль.every);
        if (набор.length < 2) return t('widgets.modeNote.mirrorRotateOne');
        if (каждые === 'open') return t('widgets.modeNote.mirrorRotateOpen', { n: набор.length });
        if (каждые !== 'auto') return t('widgets.modeNote.mirrorRotateFixed', { n: набор.length, time: duration(каждые, t) });
        return t('widgets.modeNote.mirrorRotate', { n: набор.length, time: duration(minutesEach(набор.length), t) });
    }
    return t(`widgets.modeNote.${стиль.mode}`, {
        day: t('widgets.days').split(',')[look.day].trim(),
        chakra: t(`widgets.chakra.${look.chakra}`)
    });
}

/**
 * Разметка «Картинки ▾» и окна под ней.
 *
 * @param открыто открыто ли окно (иначе — только строка со стрелкой)
 */
export function pickerHtml(стиль, look, t, открыто) {
    const режим = стиль.mode;
    const набор = pictureSet(стиль);
    const поКругу = режим === 'mirrorRotate';
    const сейчас = поКругу ? `${t('widgets.pics.auto')} · ${набор.length}`
        : режим === 'mirrorAuto' ? t('widgets.pics.byDays')
        : режим === 'mirror' ? t('widgets.mode.mirror') : '';
    const голова = `<button type="button" class="wg-pics-head" data-pick="toggle" aria-expanded="${открыто}">
        <span>${экран(t('widgets.pics'))}</span><span class="wg-pics-now">${экран(сейчас)}</span>
        <span class="wg-pics-arrow" aria-hidden="true">${открыто ? '▴' : '▾'}</span></button>`;
    if (!открыто) return голова;

    const каждые = normalizeEvery(стиль.every);
    const смена = !поКругу ? '' : `<div class="wg-pic-every"><span class="muted">${экран(t('widgets.pics.every'))}</span>
        <div class="wg-every-row">${EVERY_OPTIONS.map(вариант => `<button type="button" class="btn wg-every" data-every="${вариант}"
            aria-pressed="${вариант === каждые}">${экран(вариант === 'auto' ? t('widgets.pics.everyAuto')
                : вариант === 'open' ? t('widgets.pics.onOpen') : duration(вариант, t))}</button>`).join('')}</div></div>`;

    const отмечены = поКругу ? new Set(набор) : new Set(режим === 'mirror' ? [look.mirror] : []);
    const сетка = WIDGET_PICTURES.map((картинка, i) =>
        `<button type="button" class="wg-swatch wg-swatch-mirror" data-pick-id="${картинка.id}" data-sw="${CHAKRAS[картинка.chakra].hex}"
            data-img="${picturePath(картинка)}" aria-label="${экран(`${t('widgets.pics')} ${i + 1}`)}" aria-pressed="${отмечены.has(i)}"></button>`).join('');

    return `${голова}<div class="wg-pics">
        <div class="segmented wg-modes" role="group">
          <button type="button" data-pick="days" aria-pressed="${режим === 'mirrorAuto'}">${экран(t('widgets.pics.byDays'))}</button>
          <button type="button" data-pick="auto" aria-pressed="${поКругу}">${экран(t('widgets.pics.auto'))}</button>
        </div>
        ${смена}
        <div class="wg-swatches wg-pic-grid">${сетка}</div>
        <button type="button" class="btn wg-pics-close" data-pick="close">${экран(t('widgets.pics.close'))} ▴</button>
      </div>`;
}

/** Цвета и картинки кружков — свойствами (атрибут style из разметки политика страниц отбрасывает). */
export function applySwatches(корень) {
    for (const круг of корень.querySelectorAll('[data-sw]')) {
        круг.style.setProperty('--sw', круг.dataset.sw);
        if (круг.dataset.img) круг.style.setProperty('--sw-img', `url("${pictureUrl(круг.dataset.img)}")`);
    }
}

/**
 * Нажатие в окне картинок: что сделать. { open } — открыть или закрыть окно; { patch } — правка стиля;
 * null — нажали мимо (или последнюю картинку «Авто», её не снять).
 */
export function pickerAction(событие, стиль, открыто) {
    const кнопка = событие.target.closest('[data-pick], [data-every], [data-pick-id]');
    if (!кнопка) return null;
    if (кнопка.dataset.pickId) {
        const правка = tapPicture(стиль, кнопка.dataset.pickId);
        return правка ? { patch: правка } : null;
    }
    if (кнопка.dataset.every) return { patch: { every: normalizeEvery(кнопка.dataset.every) } };
    switch (кнопка.dataset.pick) {
        case 'toggle': return { open: !открыто };
        case 'close': return { open: false };
        case 'days': return { patch: { mode: 'mirrorAuto' } };
        case 'auto': return { patch: toggleAuto(стиль) };
        default: return null;
    }
}

/** Режим — картинка (для подсветки цвета: при картинке ни один кружок цвета не выбран). */
export const isPictureMode = стиль => MIRROR_MODES.includes(стиль.mode);
