/* КАРТИНКИ ВИДЖЕТОВ — КАТАЛОГ (выкладка 180).

   Владелец 26.10.2026: «все картинки в отдельный файл, чтобы их было легко добавлять и менять».
   Это и есть тот файл: каждая картинка записана здесь одной строкой, и больше нигде.

   КАК ДОБАВИТЬ КАРТИНКУ
     1. Положить jpg в web/img/widget-mirror/ — до 1200 px по длинной стороне, около 100 КБ
        (полный размер телефону не нужен: виджет меньше).
     2. Дописать строку в WIDGET_PICTURES ниже: имя файла без .jpg, чакра — цвет кромки, точка обрезки.
     3. npm run pictures — переносит картинки и каталог в приложение (assets/quantum_mirror).
     4. npm test — замок test/kartinki.test.js проверит, что всё на месте.
   На телефоне новая картинка появится с новым APK: картинки лежат внутри приложения.

   КАК УБРАТЬ ИЛИ ПЕРЕСТАВИТЬ — удалить или передвинуть строку, затем npm run pictures. Виджет помнит
   картинку по имени, а не по номеру, поэтому выбор людей не съедет на соседнюю: пропавшую картинку
   виджет просто пропустит (в «Авто») или заменит картинкой дня (если она была одна).

   ПОЛЯ
     id     — имя файла без .jpg (латиница, цифры, дефис); его же запоминает виджет;
     chakra — цвет кромки и срока Наблюдателя: 0 красный, 1 оранжевый, 2 жёлтый, 3 зелёный,
              4 голубой, 5 синий, 6 сиреневый (CHAKRAS в widgets.js) — ближайший к картинке;
     focus  — какую часть оставить, когда виджет режет картинку: [доля ширины, доля высоты],
              как background-position; [0.5, 0.5] — середина, [0.5, 0.2] — ближе к верху.
              Нужна, потому что узкий виджет 4×1 и высокий 2×3 режут одну картинку по-разному;
     day    — для «Зеркала по дням»: день недели 0–6 (понедельник — 0). У каждого дня ровно одна;
     about  — для людей: что на картинке. */

export const PICTURE_DIR = 'img/widget-mirror/';

export const WIDGET_PICTURES = Object.freeze([
    // Семь картинок по дням недели (выкладка 179), по одной на цвет чакры
    { id: 'red-sunset', chakra: 0, focus: [0.5, 0.5], day: 0, about: 'красный закат над морем' },
    { id: 'orange-palms', chakra: 1, focus: [0.5, 0.5], day: 1, about: 'оранжевые пальмы на закате' },
    { id: 'yellow-sky', chakra: 2, focus: [0.5, 0.5], day: 2, about: 'жёлтое небо' },
    { id: 'green-jungle', chakra: 3, focus: [0.5, 0.5], day: 3, about: 'зелёные джунгли' },
    { id: 'blue-sea', chakra: 4, focus: [0.5, 0.5], day: 4, about: 'голубое море' },
    { id: 'night-mountains', chakra: 5, focus: [0.5, 0.5], day: 5, about: 'синие горы ночью' },
    { id: 'lilac-lake', chakra: 6, focus: [0.5, 0.5], day: 6, about: 'сиреневое озеро' },

    // Шестнадцать картинок из папки владельца (выкладка 180)
    { id: 'couple-candles', chakra: 1, focus: [0.4, 0.3], about: 'пара при свечах' },
    { id: 'bath-sunset', chakra: 2, focus: [0.3, 0.65], about: 'ванна у окна на закате' },
    { id: 'embrace', chakra: 1, focus: [0.5, 0.5], about: 'объятие, чёрно-белое' },
    { id: 'golden-buddha', chakra: 2, focus: [0.5, 0.4], about: 'золотой Будда, Паттайя' },
    { id: 'lovers-waves', chakra: 5, focus: [0.5, 0.3], about: 'влюблённые в волнах' },
    { id: 'blue-moon', chakra: 4, focus: [0.5, 0.5], about: 'пара под голубой луной' },
    { id: 'red-passion', chakra: 0, focus: [0.55, 0.3], about: 'пара, красное бельё' },
    { id: 'krabi-bay', chakra: 3, focus: [0.5, 0.5], about: 'бухта Краби, Таиланд' },
    { id: 'norway-valley', chakra: 3, focus: [0.3, 0.5], about: 'зелёная долина у фьорда, Норвегия' },
    { id: 'lake-town', chakra: 5, focus: [0.5, 0.45], about: 'городок над синей водой' },
    { id: 'pool-party', chakra: 4, focus: [0.5, 0.5], about: 'праздник у бассейна' },
    { id: 'pyramid-city', chakra: 6, focus: [0.5, 0.5], about: 'город радужных пирамид' },
    { id: 'red-silhouettes', chakra: 0, focus: [0.5, 0.5], about: 'силуэты пары на красном' },
    { id: 'lofoten', chakra: 4, focus: [0.5, 0.4], about: 'горы и залив, Лофотены' },
    { id: 'taj-fountain', chakra: 3, focus: [0.5, 0.2], about: 'Тадж-Махал и водопад' },
    { id: 'golden-fort', chakra: 1, focus: [0.5, 0.45], about: 'золотой город Джайсалмер' }
].map(Object.freeze));

/* Сутки в минутах: «Авто» делит их поровну на выбранные картинки. */
export const DAY_MINUTES = 24 * 60;

/** Путь картинки от корня сайта: так его видят окно «Установить виджет» и widget.html. */
export const picturePath = картинка => `${PICTURE_DIR}${картинка.id}.jpg`;

/** Номер картинки в каталоге по имени; число — стиль выкладки 179 (картинка дня n); нет — −1. */
export function pictureIndex(значение) {
    if (typeof значение === 'number' && Number.isFinite(значение)) return dayPicture(Math.trunc(значение));
    return WIDGET_PICTURES.findIndex(к => к.id === значение);
}

/** Номер картинки дня недели 0–6 для «Зеркала по дням»; дневной нет — первая. */
export function dayPicture(день) {
    const номер = WIDGET_PICTURES.findIndex(к => к.day === день);
    return номер >= 0 ? номер : 0;
}

/** Имя картинки, если она есть в каталоге (число 179-й выкладки — имя картинки дня); иначе null. */
export function pictureId(значение) {
    const номер = pictureIndex(значение);
    return номер >= 0 ? WIDGET_PICTURES[номер].id : null;
}

/**
 * Набор «Авто»: имена по порядку каталога, без повторов и пропавших картинок. Пустой — одна картинка
 * из поля mirror (или понедельника). Тот же расчёт — WidgetPictures.набор на телефоне.
 */
export function pictureSet(style) {
    const есть = new Set((Array.isArray(style?.mirrors) ? style.mirrors : []).map(pictureIndex).filter(н => н >= 0));
    if (!есть.size) {
        const одна = pictureIndex(style?.mirror);
        return [одна >= 0 ? одна : dayPicture(0)];
    }
    return [...есть].sort((a, b) => a - b);
}

/**
 * Какая картинка на виджете сейчас (номер в каталоге): «По дням» — картинка дня недели, одна — выбранная,
 * «Авто» — из набора по минуте суток. Тот же расчёт — WidgetPictures.сейчас на телефоне.
 *
 * @param day 0 — понедельник … 6 — воскресенье
 * @param minutes минута суток 0–1439
 */
export function mirrorNow(style, day, minutes) {
    if (style?.mode === 'mirrorAuto') return dayPicture(day);
    if (style?.mode === 'mirrorRotate') {
        const набор = pictureSet(style);
        const м = Math.min(DAY_MINUTES - 1, Math.max(0, Math.trunc(minutes)));
        return набор[Math.floor(м * набор.length / DAY_MINUTES)];
    }
    const одна = pictureIndex(style?.mirror);
    return одна >= 0 ? одна : dayPicture(day);
}

/** Сколько минут держится каждая картинка в «Авто». */
export const minutesEach = сколько => Math.floor(DAY_MINUTES / Math.max(1, сколько));

/* Каталог для телефона: то, что npm run pictures кладёт в assets/quantum_mirror/catalog.json и читает
   WidgetPictures. Без about — телефону он не нужен. */
export function nativeCatalog() {
    return {
        pictures: WIDGET_PICTURES.map(к => ({
            id: к.id, file: `${к.id}.jpg`, ...(к.day !== undefined ? { day: к.day } : {}), chakra: к.chakra, focus: к.focus
        }))
    };
}
