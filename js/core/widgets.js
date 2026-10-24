/* ВИДЖЕТЫ «КВАНТА»: КАТАЛОГ, ЦВЕТ ДНЯ, СТИЛЬ.

   Чистый модуль, без страницы: его читают окно «Установить виджет» и тесты. На
   телефоне то же самое считает Java (WidgetLook.java); расходиться им нельзя —
   человек выберет в окне один цвет, а на столе будет другой. Таблица цветов и
   таблица «тёмный ли текст на заливке» сверяются с Java в test/vidzhety.test.js.

   ШЕСТЬ ВИДОВ (ТЗ «Quantum UI», раздел 9.21 методологии):
     slim      — узкий 4×1, два срока в строку;
     hud       — средний 4×2, заголовок, два срока, «Настройки» и «В кабинет»;
     tall      — вертикальный 2×3;
     week      — чакровый 4×2: средний, а сверху неделя;
     fillWide  — залитый горизонтальный;
     fillTall  — залитый вертикальный.

   ЦВЕТ. Четыре режима:
     auto      — семь цветов чакр по дням недели, смена в полночь;
     chakra    — один цвет чакры на все дни (какой — поле chakra);
     gold      — золото сайта;
     graphite  — спокойный графит #1E2022 без неона.

   Прозрачность подложки — от 0 (стекло) до 100 (сплошная). Не задана — у неонового
   вида 88, у залитого 100. */

import { LANGUAGES, dictionary } from './i18n.js';

/* Ключи видов — те же, что в WidgetFormat.java. Менять только вместе с ним. */
export const FORMATS = Object.freeze([
    Object.freeze({ key: 'slim', fill: false, tall: false }),
    Object.freeze({ key: 'hud', fill: false, tall: false }),
    Object.freeze({ key: 'tall', fill: false, tall: true }),
    Object.freeze({ key: 'week', fill: false, tall: false }),
    Object.freeze({ key: 'fillWide', fill: true, tall: false }),
    Object.freeze({ key: 'fillTall', fill: true, tall: true })
]);

export const MODES = Object.freeze(['auto', 'chakra', 'gold', 'graphite']);

/* Перелив --pult-rim из web/css/app.css: остановки в процентах. Нужен тесту и Java. */
export const RIM_STOPS = Object.freeze([
    ['#FFFBE8', 0], ['#F3D375', 13], ['#FFFFFF', 25], ['#D9A83F', 38],
    ['#FFF4C0', 52], ['#C8902C', 66], ['#FFF9DC', 80], ['#AE7D21', 100]
]);

/* Золото сайта: --gold (надпись на тёмном) и одна из остановок перелива для значков. */
export const GOLD = Object.freeze({ text: '#E3C77C', icon: '#F3D375' });

export const GRAPHITE = Object.freeze({ base: '#1E2022', text: '#E6E8EB' });

export const NEON_BASE = '#0A0E1A';

export const DEFAULT_ALPHA = Object.freeze({ neon: 88, fill: 100 });

/* Длина надписи, которую человек может ввести на виджет. Больше не поместится,
   а золотая надпись рисуется картинкой, и длинная только сжимается. */
export const TEXT_MAX = 40;

/** Относительная яркость цвета «#RRGGBB» по WCAG. */
export function luminance(hex) {
    const канал = i => {
        const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * канал(0) + 0.7152 * канал(1) + 0.0722 * канал(2);
}

/** Контраст двух цветов (WCAG): от 1 до 21. */
export function contrastRatio(a, b) {
    const [ярче, темнее] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (ярче + 0.05) / (темнее + 0.05);
}

/** Контраст цвета с белым (WCAG): 1,05 / (L + 0,05). */
export function contrastWithWhite(hex) {
    return contrastRatio(hex, '#FFFFFF');
}

/* Чернила: тёмный текст на светлых заливках и заливка тёмной кнопки. */
export const INK = '#14110A';

/* Нужен ли ТЁМНЫЙ текст на заливке этого цвета: тёмный читается на ней лучше белого.
   Выкладка 171: прежнее правило «белый хуже трёх» на классическом зелёном дало бы белый
   текст с контрастом 3,2 и тёмную серединку, а владелец просил серединку как раньше. */
export function needsInk(hex) {
    return contrastRatio(hex, INK) > contrastWithWhite(hex);
}

/* Семь чакр, понедельник первым. ink — нужен ли тёмный текст на заливке.
   Классические насыщенные цвета (владелец 24.10.2026, набор «А»): тёмно-красный,
   оранжевый, жёлтый, зелёный, голубой, синий, сиреневый. */
export const CHAKRAS = Object.freeze([
    ['#C8102E', 'muladhara'], ['#FF6A00', 'svadhisthana'], ['#FFC800', 'manipura'],
    ['#00A651', 'anahata'], ['#00A3E0', 'vishuddha'], ['#1F47D6', 'ajna'],
    ['#8E3FD6', 'sahasrara']
].map(([hex, name]) => Object.freeze({ hex, name, ink: needsInk(hex) })));

/** Какой день недели: 0 — понедельник … 6 — воскресенье, по часам телефона. */
export function dayIndex(date = new Date()) {
    return (date.getDay() + 6) % 7;
}

/** Смешать два цвета «#RRGGBB»; k — доля второго. */
export function mix(a, b, k) {
    const ч = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const к = i => Math.round(ч(a, i) * (1 - k) + ч(b, i) * k).toString(16).padStart(2, '0');
    return `#${к(0)}${к(1)}${к(2)}`.toUpperCase();
}

/* КНОПКИ. Насколько цвет дня подмешан в заливку главной кнопки неонового вида и насколько
   затемнён цвет заливки для надписи на белой кнопке. Те же числа в WidgetLook.java
   (КНОПКА_ОТТЕНОК, КНОПКА_ТЕМНЕЕ); подобраны так, чтобы надпись читалась с контрастом
   не ниже 4,5 на любой кнопке любого цвета (проверка — test/vidzhety.test.js). */
export const BUTTON_TINT = 0.18;
export const BUTTON_DARKEN = 0.45;

/* СРОКИ НА НЕОНЕ (выкладка 171). Срок Наблюдателя был цветом дня с 40% белого — на красном
   выходил розовый (владелец 24.10.2026). Теперь белого 15%. А насыщенный синий на тёмной
   подложке почти не виден, поэтому сроку добавляется белого ровно столько, чтобы контраст
   с подложкой был не ниже трёх (крупные цифры). Те же числа в WidgetLook.java. */
export const TIME_SOFT = 0.15;
export const TIME_MIN_CONTRAST = 3;

/** Цвет, осветлённый шагами по 5% до контраста min с подложкой base. */
export function readableOn(hex, base, min = TIME_MIN_CONTRAST) {
    for (let k = 0; k <= 20; k++) {
        const цвет = mix(hex, '#FFFFFF', k * 0.05);
        if (contrastRatio(цвет, base) >= min) return цвет;
    }
    return '#FFFFFF';
}

/**
 * Цвета кнопок вида: главной («В кабинет») и малой («Настройки»), заливка и надпись.
 * Тот же расчёт, что в WidgetLook.java; окно рисует ими предпросмотр.
 *
 * @param look результат resolveLook
 * @param fill залитый ли вид
 */
export function buttonColors(look, fill) {
    if (look.gold) {
        return {
            main: { fill: INK, text: GOLD.text },
            small: { fill: '#1F1B11', text: GOLD.text }
        };
    }

    const основа = look.graphite ? GRAPHITE.base : look.accent;
    if (!fill) {
        const подложка = look.graphite ? GRAPHITE.base : NEON_BASE;
        return {
            main: { fill: mix(подложка, look.accent, BUTTON_TINT), text: look.soft },
            small: { fill: mix(подложка, '#FFFFFF', 0.08), text: look.soft }
        };
    }
    if (look.ink && !look.graphite) {
        return {
            main: { fill: INK, text: основа },
            small: { fill: mix(основа, '#FFFFFF', 0.45), text: INK }
        };
    }
    return {
        main: { fill: '#FFFFFF', text: mix(основа, '#000000', BUTTON_DARKEN) },
        small: { fill: mix(основа, '#000000', 0.35), text: '#FFFFFF' }
    };
}

const текст = значение => String(значение ?? '').trim().slice(0, TEXT_MAX);

/**
 * Привести стиль к виду, который понимают и окно, и телефон. Лишнее отбрасывается,
 * незнакомый режим становится «авто». Прозрачность не задана — null (за человека
 * решит вид).
 */
export function normalizeStyle(raw = {}) {
    const mode = MODES.includes(raw?.mode) ? raw.mode : 'auto';

    const чакра = Math.trunc(Number(raw?.chakra));
    const alpha = Number(raw?.alpha);

    return {
        mode,
        chakra: Number.isFinite(чакра) ? Math.min(6, Math.max(0, чакра)) : 0,
        alpha: raw?.alpha === undefined || raw?.alpha === null || raw?.alpha === '' || !Number.isFinite(alpha)
            ? null
            : Math.min(100, Math.max(0, Math.round(alpha))),
        title: текст(raw?.title),
        subtitle: текст(raw?.subtitle),
        architect: текст(raw?.architect),
        observer: текст(raw?.observer)
    };
}

/* Стиль для телефона: прозрачность названа числом (на телефоне пустого нет). */
export function styleForNative(style, fill = false) {
    const s = normalizeStyle(style);
    return { ...s, alpha: s.alpha ?? (fill ? DEFAULT_ALPHA.fill : DEFAULT_ALPHA.neon) };
}

/**
 * Цвета вида сегодня, как их разрешает WidgetLook.разрешить.
 *
 * @returns {{day:number, chakra:number, accent:string, soft:string, gold:boolean,
 *            graphite:boolean, ink:boolean}}
 *          ink — нужен ли тёмный текст, если вид залит цветом
 */
export function resolveLook(style, date = new Date()) {
    const s = normalizeStyle(style);
    const day = dayIndex(date);
    const чакра = s.mode === 'chakra' ? s.chakra : day;

    if (s.mode === 'gold') {
        return { day, chakra: чакра, accent: GOLD.icon, soft: GOLD.text, timeA: GOLD.icon, timeB: GOLD.text,
            gold: true, graphite: false, ink: true };
    }
    if (s.mode === 'graphite') {
        return { day, chakra: чакра, accent: GRAPHITE.text, soft: '#FFFFFF', timeA: GRAPHITE.text, timeB: '#FFFFFF',
            gold: false, graphite: true, ink: false };
    }

    // timeA, timeB — сроки Архитектора и Наблюдателя на неоновом виде (на залитом они цвета текста)
    const { hex, ink } = CHAKRAS[чакра];
    return {
        day, chakra: чакра, accent: hex, soft: mix(hex, '#FFFFFF', 0.4),
        timeA: readableOn(hex, NEON_BASE), timeB: readableOn(mix(hex, '#FFFFFF', TIME_SOFT), NEON_BASE),
        gold: false, graphite: false, ink
    };
}

/**
 * Слова виджетов на языке человека: заголовки, подписи, кнопки и дни недели. Телефон
 * получает их вместе с кадрами плашки (setGuard) и рисует ими виджеты, когда
 * приложение закрыто. Ключи те же, что в WidgetStore.ЗАПАСНЫЕ.
 */
export function widgetTexts(translate) {
    const слово = ключ => translate(`widgets.w.${ключ}`);
    return {
        titleHud: слово('titleHud'),
        titleWide: слово('titleWide'),
        titleTall: слово('titleTall'),
        subShort: слово('subShort'),
        architect: слово('architect'),
        observer: слово('observer'),
        settings: слово('settings'),
        cabinetTo: слово('cabinetTo'),
        cabinet: слово('cabinet'),
        cabinetPersonal: слово('cabinetPersonal'),
        cabinetMain: слово('cabinetMain'),
        // Панель настроек на рабочем столе (WidgetSheetActivity, выкладка 141)
        sheetTitle: слово('sheetTitle'),
        sheetOpacity: слово('sheetOpacity'),
        sheetColor: слово('sheetColor'),
        modeAuto: слово('modeAuto'),
        modeGold: слово('modeGold'),
        modeGraphite: слово('modeGraphite'),
        modeChakra: слово('modeChakra'),
        sheetMore: слово('sheetMore'),
        sheetDone: слово('sheetDone'),
        sheetTime: слово('sheetTime'),
        sheetRefresh: слово('sheetRefresh'),
        sheetOff: слово('sheetOff'),
        sheetNamed: слово('sheetNamed'),
        sheetNamedTomorrow: слово('sheetNamedTomorrow'),
        days: translate('widgets.days').split(',').map(д => д.trim()),
        aliases: widgetAliases(translate)
    };
}

/* СВОЯ НАДПИСЬ, СОВПАВШАЯ СО СТАНДАРТНОЙ (выкладка 171).
   Владелец 24.10.2026: на виджетах по-русски «Субквантовая связь», когда остальные слова
   уже английские. Это своя надпись из поля «Заголовок» (на вертикальных стандартный
   заголовок — «Хроники Акаши»), а свои надписи не переводятся. Просьба: слова оставить
   какие есть, но переводить. Поэтому своя надпись, равная стандартной фразе на любом из
   трёх языков, показывается этой же фразой на языке человека; любая другая — как написана.
   Таблицу «фраза → перевод» телефон получает вместе со словами (aliases), сравнивает так же:
   без регистра, лишних пробелов и разницы апострофов (WidgetStore.ключНадписи). */
export const OWN_TEXT_KEYS = Object.freeze(['titleHud', 'titleWide', 'titleTall', 'subShort', 'architect', 'observer']);

export const ownTextKey = текст => String(текст ?? '').trim().toLowerCase()
    .replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ');

/** Стандартные фразы всех языков → эта фраза на языке translate. */
export function widgetAliases(translate) {
    const таблица = {};
    for (const ключ of OWN_TEXT_KEYS) {
        const перевод = translate(`widgets.w.${ключ}`);
        for (const { code } of LANGUAGES) {
            const фраза = dictionary(code)[`widgets.w.${ключ}`];
            if (фраза) таблица[ownTextKey(фраза)] = перевод;
        }
    }
    return таблица;
}

/** Своя надпись: стандартная фраза любого языка — на языке человека, иначе как есть. */
export function translateOwn(текст, aliases) {
    return (текст && aliases[ownTextKey(текст)]) || текст;
}
