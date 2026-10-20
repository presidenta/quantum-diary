/* СВЯЗКА НАПОМИНАНИЙ С ПРИЛОЖЕНИЕМ.

   Три слоя, и у каждого своё дело:

     core/reminders.js      — фасад над плагином: разрешения, канал,
                              постановка и снятие. Про моменты и окна не
                              знает ничего.
     core/reminder-rules.js — чистые правила: что звонит и когда. Без
                              браузера, под тестами.
     этот файл              — связка: берёт состояние приложения, спрашивает
                              правила и отдаёт решение фасаду.

   ДВА ИСТОЧНИКА НАПОМИНАНИЙ.
   1. Моменты дня («Архитектор метавселенной») — приходят с сервера со
      своим временем, по девять на день.
   2. Окно возможностей («Наблюдатель метавселенной») — считается само:
      последний прыжок плюс 3 часа 33 минуты.

   В браузере весь модуль молчит и возвращает false. Системных напоминаний
   в браузере не бывает в принципе: страница закрыта — таймеры мертвы, а
   разбудить себя по часам вкладка не может. Это не чинится кодом, только
   установкой приложения. */

import {
    ensureReady, scheduleReminders, cancelKeys, onReminderAction, isNative,
    hasAlarmMode, alarmFullScreen, alarmOverlay, setGuard, pendingAlarms
} from './core/reminders.js';
import {
    momentPlan, windowPlan, normalizeQuiet as normalize, KEY_WINDOW, KEY_MOMENT, momentTarget,
    normalizeAlarm, ringsAsAlarm, nextRingPlan, isWindowKey, modeOf, lateUntil,
    guardFrames, guardText, guardTerm, namedHorizon, anchorHours, freshDay, orphanKeys
} from './core/reminder-rules.js';
import { widgetTexts } from './core/widgets.js';
import { provisionalDay } from './core/quantum.js';
import { todayKey, addDays } from './core/dates.js';
import { cycleNamedHour } from './core/observer-clock.js';
import { state, t } from './store.js';
import { getMeta, setMeta } from './db.js';
import { publishPref, prefValue, prefMissing, takeRemotePrefs } from './prefs.js';
import { logEvent } from './core/web-journal.js';
import { CONFIG } from './views/space/config.js';

/* ТИХИЙ ЧАС.

   Промежуток, когда приложение не беспокоит: не звонит, не вибрирует,
   не зажигает экран. Границы задаёт человек в профиле — кнопка «Тихий
   час». Раньше они были зашиты в код, и это было неправильно: время сна
   у каждого своё, и менять его правкой исходников нельзя.

   Начальные границы берутся из dailyWindow раздела — с 21 до 6. Эти
   цифры лежали в config.js с самого начала как рабочее время раздела, и
   до недавнего они ни разу не применялись. Пусть они и будут тем, что
   человек увидит в настройке до первой своей правки.

   Хранится настройка на устройстве, рядом с языком: это свойство
   телефона, а не учётной записи. На планшете человек вправе спать в
   другое время. */
const QUIET_KEY = 'quietHours';
const двеЦифры = n => String(n).padStart(2, '0') + ':00';

export const QUIET_DEFAULT = Object.freeze({
    on: true,
    from: двеЦифры(CONFIG.dailyWindow.endHour),     // 21:00
    until: двеЦифры(CONFIG.dailyWindow.startHour)   // 06:00
});

/* Проверка настройки живёт в чистых правилах и там же под тестами —
   здесь только подставляются начальные значения этого приложения. */
export const normalizeQuiet = raw => normalize(raw, QUIET_DEFAULT);

/* РЕЖИМ АКТИВНОСТИ.

   Напоминание звонит как будильник: окно поверх всех окон, экран
   включается сам, звук по громкости будильника, звонит, пока не нажмёшь.
   Разбор — раздел 9.3 методологии, нативная часть — android-alarm-plugin.

   Хранится рядом с тихим часом и по той же причине: это свойство
   телефона, а не учётной записи. Будильник уместен на телефоне у кровати
   и неуместен на планшете, который лежит на столе.

   НАЧАЛЬНОЕ ЗНАЧЕНИЕ — ВКЛЮЧЕНО, и это перемена от 16.10.2026. Прежде
   режим был выключен по умолчанию, а о девяти моментах дня звонила ещё и
   отдельная вторая галочка. Владелец включил режим, назвал час — и
   получил беззвучную плашку, потому что звонила та галочка, которую он не
   нашёл.

   От ночного звонка защищает тихий час, он тоже включён по умолчанию (с
   21 до 6) и в эти часы приходит беззвучная плашка. Защита от звонка —
   его дело, а не выключенный режим: выключенный режим защищает и днём,
   когда защищать не от чего. */
const ALARM_KEY = 'alarmMode';

export const ALARM_DEFAULT = Object.freeze({ on: true });

/** Режим будильника, как его задал человек. */
export async function loadAlarm() {
    try {
        return запомнитьЧас(await следоватьЦиклу(normalizeAlarm(await getMeta(ALARM_KEY))));
    } catch {
        return { ...ALARM_DEFAULT };
    }
}

/* ЧАС НАБЛЮДАТЕЛЯ СЛЕДУЕТ ЗА ЦИКЛОМ (выкладка 157, правило — cycleNamedHour в
   core/observer-clock.js). Применяется при каждом чтении режима — его читают и расписание, и
   окно «Режим будильника», и окно виджетов, — поэтому переехавший час сразу видят все: поле в
   настройках, панель на столе, плашка, виджеты и таймеры. Переезд записывается с отметкой
   «назначен сейчас»: следующий раз час переедет уже после своего нового звонка. */
async function следоватьЦиклу(alarm, now = Date.now()) {
    if (!alarm.on || alarm.windowMode === 'off') return alarm;
    const новый = cycleNamedHour({
        named: alarm.windowAt, setAt: alarm.windowSetAt, lastJump: lastJumpTime(), now,
        cooldownMs: CONFIG.timing.jumpCooldownMs, windowMs: CONFIG.timing.opportunityWindowMs,
        quiet: await loadQuiet()
    });
    if (!новый) return alarm;
    const следующий = { ...alarm, windowAt: новый, windowSetAt: now };
    await setMeta(ALARM_KEY, следующий);
    return следующий;
}

/* НАЗНАЧЕННЫЙ ЧАС НАБЛЮДАТЕЛЯ — В ПАМЯТИ ДЛЯ ТАЙМЕРОВ (выкладка 148). Таймеры тикают каждую
   секунду и ждать хранилища не могут, а считать им надо по тем же часам Наблюдателя, что и
   плашке (core/observer-clock.js). Обновляется при каждом чтении и сохранении режима. */
let часНаблюдателя = '';
let часНаблюдателяНазначен = 0;

function запомнитьЧас(alarm) {
    часНаблюдателя = назначенныеЧасы(alarm).window || '';
    часНаблюдателяНазначен = Number(alarm.windowSetAt) || 0;
    return alarm;
}

/** Когда назначен час Наблюдателя (мс), для таймеров: назначенный вручную вытесняет окно от прыжка. */
export function observerNamedSetAt() {
    return часНаблюдателяНазначен;
}

/** Назначенный час Наблюдателя «ЧЧ:ММ» или '' — для таймеров обратного отсчёта. */
export function observerNamedHour() {
    return часНаблюдателя;
}

/** Сохранить режим будильника и сразу переставить расписание под него. */
export async function saveAlarm(value, { windowTouched = false } = {}) {
    // Человек назначил другой час Наблюдателя — запомнить когда: до его звонка он не переедет, а на
    // экран он попадает сразу (core/observer-clock.js, РУЧНОЙ ЧАС). windowTouched — час выбран явно
    // (панель виджета), даже если он совпал с прежним: выбор человека — тоже назначение.
    const прежний = normalizeAlarm(await getMeta(ALARM_KEY).catch(() => null));
    const новый = normalizeAlarm(value);
    if (новый.windowAt !== прежний.windowAt || (windowTouched && новый.windowAt)) новый.windowSetAt = Date.now();
    else if (!новый.windowSetAt) новый.windowSetAt = прежний.windowSetAt;
    const alarm = запомнитьЧас(новый);
    await setMeta(ALARM_KEY, alarm);
    await publishPref('alarm', alarm);      // и на остальные устройства (выкладка 158)
    await planReminders();
    return alarm;
}

/* Что рассказать человеку о режиме прямо сейчас.
 *
 * Три разных «нет», и их нельзя сваливать в одно:
 *
 *   plugin: false   — приложение собрано до появления плагина. Чинится
 *                     установкой нового файла приложения, не настройкой.
 *   fullScreen      — разрешение на полноэкранные напоминания не выдано
 *                     (Android 14 и новее). Звук будет, экран не
 *                     загорится. Чинится настройкой телефона.
 *   askable         — есть ли куда вести за этим разрешением: на
 *                     Android 13 и старше такой настройки нет вовсе.
 *
 * Говорить об этом обязательно. Промолчать — значит обещать человеку
 * будильник и дать ему уведомление. */
export async function alarmState() {
    const plugin = hasAlarmMode();
    if (!plugin) {
        return {
            plugin: false, fullScreen: false, askable: false,
            overlay: true, overlayAskable: false
        };
    }

    const экран = await alarmFullScreen();
    const поверх = await alarmOverlay();

    return {
        plugin: true,
        fullScreen: экран.granted,
        askable: экран.askable,
        /* Окно поверх того, чем человек занят, — отдельное разрешение и
           отдельная строка. Валить его в одну с полноэкранным нельзя: они
           про разное и выдаются в разных местах настроек. */
        overlay: поверх.granted,
        overlayAskable: поверх.askable
    };
}

/** Тихий час, как его задал человек. */
export async function loadQuiet() {
    try {
        return запомнитьТишину(normalizeQuiet(await getMeta(QUIET_KEY)));
    } catch {
        return { ...QUIET_DEFAULT };
    }
}

/* ТИХИЙ ЧАС — В ПАМЯТИ ДЛЯ ТАЙМЕРОВ (выкладка 160), как назначенный час (observerNamedHour):
   таймеры тикают каждую секунду и ждать хранилища не могут, а окно, попавшее в тишину, у них
   должно открываться там же, где у плашки и звонка. Обновляется при каждом чтении и сохранении. */
let тишина = null;

function запомнитьТишину(quiet) {
    тишина = quiet;
    return quiet;
}

/** Тихий час для часов Наблюдателя; ещё не прочитан — null (тогда тишины не учитываем). */
export function observerQuiet() {
    return тишина;
}

/** Сохранить тихий час и сразу переставить расписание под него. */
export async function saveQuiet(value) {
    const quiet = запомнитьТишину(normalizeQuiet(value));
    await setMeta(QUIET_KEY, quiet);
    await publishPref('quiet', quiet);
    await planReminders();
    return quiet;
}

/* НАСТРОЙКИ С ДРУГИХ УСТРОЙСТВ (выкладка 158, хранение — prefs.js). Зовётся после каждой
   удачной синхронизации. Принимает пришедшее: режим будильника и тихий час — как есть (их
   сохранил человек на другом устройстве, правка там позже здешней), последний прыжок — если он
   позже здешнего. Отдаёт своё, чего на сервере нет: режим и тихий час, настроенные до этой
   выкладки, — только когда их там точно нет (сервер знает prefs, а записи нет); прыжок —
   когда здешний позже. Что-то приняли — расписание, плашка и виджеты пересчитываются.

   @param {string[]} known  виды, что знает сервер
   @returns {Promise<boolean>} приняли ли что-нибудь */
export async function syncPrefs(known) {
    if (!known.includes('prefs')) return false;
    const пришло = await takeRemotePrefs();
    if ('alarm' in пришло) await setMeta(ALARM_KEY, запомнитьЧас(normalizeAlarm(пришло.alarm)));
    if ('quiet' in пришло) await setMeta(QUIET_KEY, запомнитьТишину(normalizeQuiet(пришло.quiet)));
    const прыжок = Number(пришло.observer?.lastJump) || 0;
    const принятПрыжок = прыжок > lastJumpTime();
    if (принятПрыжок) запомнитьПрыжок(прыжок);

    for (const [key, ключБазы] of [['alarm', ALARM_KEY], ['quiet', QUIET_KEY]]) {
        const своё = prefMissing(key) && await getMeta(ключБазы);
        if (своё) await publishPref(key, своё);
    }
    await отдатьПрыжок();

    const принято = 'alarm' in пришло || 'quiet' in пришло || принятПрыжок;
    if (принято) {
        logEvent('⇄', { m: Object.keys(пришло).join(', ') });
        await planReminders();
    }
    return принято;
}

/* Последний прыжок — на остальные устройства, если здесь он позже, чем на сервере. Время
   прыжка только растёт (прыжок, сброс пропущенного окна, «отложить» — всё «сейчас» или позже),
   поэтому спор решает больший. */
async function отдатьПрыжок() {
    const здесь = lastJumpTime();
    if (здесь > (Number(prefValue('observer')?.lastJump) || 0)) await publishPref('observer', { lastJump: здесь });
}

function запомнитьПрыжок(миг) {
    try {
        localStorage.setItem('last_quantum_jump_time', String(миг));
    } catch {
        /* приватный режим браузера — прыжок останется на сервере */
    }
}

/* Разрешение и канал спрашиваем один раз за запуск, а не на каждую
   перестановку расписания: ensureReady обращается к системе, и звать её
   по десять раз на дню незачем. */
let ready = null;

async function readyOnce() {
    if (ready === null) ready = await ensureReady();
    return ready;
}

function lastJumpTime() {
    try {
        return Number(localStorage.getItem('last_quantum_jump_time')) || 0;
    } catch {
        return 0;   // приватный режим браузера — не беда
    }
}

/* КАДРЫ ПЛАШКИ НА ОСТАТОК ДНЯ — ОБЩИЕ ДЛЯ ПЛАШКИ, ВИДЖЕТОВ И ОКНА «УСТАНОВИТЬ ВИДЖЕТ».

   Кроме готового текста плашки, в кадре едут сроки двух направлений по отдельности
   (architect и observer, уже словами: «после 18:03», «окно открыто», «—»): виджетам
   на рабочем столе нужны две цифры, а не весь текст. Считаются они ровно теми же
   правилами, что и плашка, поэтому на виджете, в шторке и на главном экране
   времена совпадают.

   Текст плашки — украшение, а не работа: ошибка в его расчёте не вправе
   остановить постановку самих звонков. Без кадров нативная часть обойдётся
   запасным текстом. */
function guardFramesFor(now, alarm, день, заготовка = {}, quiet = тишина) {
    try {
        /* Сегодняшнего дня нет (не загрузился) — звонит заготовка (см. горизонт), и на
           плашке её же часы. Завтрашняя заготовка — для кадров после последнего момента:
           там Архитектор показывает первый завтрашний момент, а не прочерк. */
        const сегодня = день?.moments?.length ? день.moments : заготовка.сегодня?.moments;
        return guardFrames(сегодня, lastJumpTime(), now, {
            cooldownMs: CONFIG.timing.jumpCooldownMs,
            windowMs: CONFIG.timing.opportunityWindowMs,
            // Выключенное направление времени не имеет — на плашке прочерк
            architectOn: alarm.momentsMode !== 'off',
            observerOn: alarm.windowMode !== 'off',
            tomorrow: заготовка.завтра?.moments,
            named: назначенныеЧасы(alarm),
            // Окно, попавшее в тихий час, — с её концом (core/observer-clock.js, выкладка 160)
            quiet,
            // Час, назначенный вручную, сразу на экране, даже если он позже окна (выкладка 164)
            windowSetAt: alarm.windowSetAt
        }).map(кадр => ({
            from: кадр.from,
            text: guardText(кадр, t),
            architect: guardTerm(кадр.architect, t),
            observer: guardTerm(кадр.observer, t)
        }));
    } catch (err) {
        console.warn('[напоминания] текст плашки не посчитался:', err);
        return [];
    }
}

/* ЧАСЫ, НАЗНАЧЕННЫЕ ЧЕЛОВЕКОМ В «РЕЖИМЕ БУДИЛЬНИКА» — для кадров плашки и виджетов: это
   тоже звонки направлений, и срок на плашке обязан их видеть (выкладка 147). Выключенный
   режим или выключенное направление часа не даёт — так же, как не ставит и звонка. */
function назначенныеЧасы(alarm) {
    const настройка = normalizeAlarm(alarm);
    if (!настройка.on) return {};
    return {
        window: настройка.windowMode === 'off' ? '' : настройка.windowAt,
        moments: настройка.momentsMode === 'off' ? '' : настройка.momentsAt
    };
}

/* ЗАГОТОВКИ СЕГОДНЯШНЕГО И ЗАВТРАШНЕГО ДНЯ — те же, по которым горизонт ставит звонки
   (provisionalDay: часы считает телефон по дате, человеку, тихому часу и названным часам).
   Не посчиталось — пусто: плашка обойдётся без завтрашних кадров. */
async function заготовки(now, quiet, alarm) {
    try {
        const человек = String((await getMeta('userId').catch(() => '')) || '');
        const якорь = anchorHours(alarm);
        const сегодня = todayKey(now);
        return {
            сегодня: provisionalDay(сегодня, человек, quiet, якорь),
            завтра: provisionalDay(addDays(сегодня, 1), человек, quiet, якорь)
        };
    } catch (err) {
        console.warn('[напоминания] заготовка дня не посчиталась:', err);
        return {};
    }
}

/**
 * Сроки двух направлений на сейчас словами — то, что сейчас написано на плашке и
 * виджетах. Окно «Установить виджет» показывает ими живой предпросмотр.
 *
 * @returns {Promise<{architect: string, observer: string}|null>} null — кадров нет
 */
export async function widgetTerms(now = new Date()) {
    const alarm = await loadAlarm();
    const день = freshDay(state.quantum, todayKey(now));
    const quiet = await loadQuiet();
    const заготовка = await заготовки(now, quiet, alarm);

    // Тот же выбор, что у AlarmStore.кадрСейчас: последний кадр, чей час уже наступил
    let выбран = null;
    for (const кадр of guardFramesFor(now, alarm, день, заготовка, quiet)) {
        if (!выбран || кадр.from <= now.getTime()) выбран = кадр;
    }
    return выбран ? { architect: выбран.architect, observer: выбран.observer } : null;
}

/* СРОКИ ДЛЯ ОКНА ВИДЖЕТА НА КОМПЬЮТЕРЕ (выкладка 150). Те же кадры, что получает плашка на
   телефоне (guardFramesFor): расписаны по часам вперёд, и окно виджета (widget.html) само
   выбирает текущий — последний, чей час наступил. Кладутся на компьютер (localStorage) при
   каждой перестановке расписания в браузере; открытое окно виджета слышит это сразу. */
export async function publishDesktopWidget(now = new Date()) {
    try {
        const alarm = await loadAlarm();
        const день = freshDay(state.quantum, todayKey(now));
        const quiet = await loadQuiet();
        const кадры = guardFramesFor(now, alarm, день, await заготовки(now, quiet, alarm), quiet);
        const кадрыВиджетам = кадры.map(к => ({ from: к.from, architect: к.architect, observer: к.observer }));
        localStorage.setItem('kvant-desktop-widget', JSON.stringify({
            at: now.getTime(),
            lang: state.language,
            frames: кадрыВиджетам
        }));
        записатьСрокиВиджетам(кадрыВиджетам, now.getTime());
        return true;
    } catch (err) {
        console.warn('[виджет на компьютере] сроки не положились:', err);
        logEvent('V✗', { m: err?.message || String(err) });
        return false;
    }
}

/* В журнал компьютера — только когда сроки виджетам ИЗМЕНИЛИСЬ: расписание переставляется часто,
   и одинаковые строки вытеснили бы остальное (core/web-journal.js, выкладка 162). */
function записатьСрокиВиджетам(кадры, now) {
    try {
        const подпись = JSON.stringify(кадры.map(к => [к.from, к.architect, к.observer]));
        if (localStorage.getItem('kvant-widget-frames-sig') === подпись) return;
        localStorage.setItem('kvant-widget-frames-sig', подпись);
        const следующий = кадры.find(к => к.from > now);
        logEvent('V', { n: кадры.length, a: следующий?.from || 0 });
    } catch { /* журнал не обязателен */ }
}

/**
 * Переставить всё расписание заново.
 *
 * Звать можно сколько угодно раз и откуда угодно: прежние напоминания с
 * теми же ключами снимаются сами. Это важнее, чем кажется, — расписание
 * меняется от каждого прожитого момента и каждого прыжка.
 *
 * @returns {Promise<boolean>} поставлено ли хоть одно напоминание
 */
export async function planReminders() {
    // Прыгнули здесь — остальные устройства должны узнать (prefs.js); сбой не держит расписание
    await отдатьПрыжок().catch(err => console.warn('[настройки] прыжок не ушёл:', err));
    // В браузере ставить нечего — но окну виджета на компьютере нужны свежие сроки
    if (!isNative()) {
        await publishDesktopWidget();
        return false;
    }
    if (!await readyOnce()) return false; // человек не дал разрешения

    const now = new Date();
    const quiet = await loadQuiet();
    const alarm = await loadAlarm();

    /* ТОЛЬКО СЕГОДНЯШНИЙ ДЕНЬ. Приложение, пережившее полночь, держит в
       памяти вчерашний, и его часы привязывались к сегодняшней дате:
       девять звонков-призраков в вчерашние часы (см. freshDay). Чужой день
       для расписания — это «дня нет». */
    const день = freshDay(state.quantum, todayKey(now));

    /* ПЛАШКА СТОИТ, ПОКА ВКЛЮЧЁН РЕЖИМ АКТИВНОСТИ И ЕСТЬ ЧТО ЗВОНИТЬ.
       Это обычное уведомление в шторке, без службы (раздел 9.18). Нативная
       часть сама решает, есть ли что звонить, и сама убирает плашку, когда
       звонить нечем: здесь передаётся только настройка человека и подписи
       на его языке. Ставится ДО расписания — постановка звонков следом
       обновляет плашку сама.

       Вместе с настройкой едет и содержимое плашки: кадры текста на весь
       остаток дня (см. guardFrames) и подписи двух кнопок. Текст
       собирается здесь, на языке человека, а нативная часть лишь выбирает
       кадр по часам — так времена на плашке не могут разойтись с главным
       экраном, и обновляется она, даже когда приложение закрыто. */
    /* Текст плашки — украшение, а не работа: ошибка в его расчёте не вправе
       остановить постановку самих звонков, которая идёт ниже. Без кадров
       страж обойдётся запасным текстом. */
    const кадры = guardFramesFor(now, alarm, день, await заготовки(now, quiet, alarm), quiet);

    await setGuard({
        on: alarm.on && alarm.guardOn,
        title: t('guard.title'),
        text: t('guard.text'),
        frames: кадры,
        settingsLabel: t('guard.settings'),
        homeLabel: t('guard.home'),
        // Слова виджетов рабочего стола: они рисуются, когда приложение закрыто
        widgets: widgetTexts(t),
        // Часы «Режима будильника» — для строки «Время звонков» в панели виджета
        named: назначенныеЧасы(alarm),
        // Резервный будильник в «Часах» телефона (выкладка 169)
        clockBackup: alarm.clockBackup
    });

    /* Направление выключено совсем — в план оно не попадает, а его ключи
       уходят в снятие (momentPlan и windowPlan это делают сами). Режим
       активности сюда не смотрит: он решает только, звонить ли. */
    const moments = momentPlan(день?.moments, now, quiet, alarm);
    const window = windowPlan(lastJumpTime(), now, {
        cooldownMs: CONFIG.timing.jumpCooldownMs,
        windowMs: CONFIG.timing.opportunityWindowMs,
        // Назначенный звонок Наблюдателя перезапускает цикл (core/observer-clock.js)
        named: назначенныеЧасы(alarm).window || '',
        windowSetAt: alarm.windowSetAt,
        quiet,
        off: modeOf(KEY_WINDOW, alarm) === 'off'
    });

    /* ВРЕМЯ, НАЗНАЧЕННОЕ ЧЕЛОВЕКОМ.
       Своё у окна возможностей, своё у девяти моментов дня — поля в окне
       «Режим будильника». Пусто — список постановки пуст, а ключ попадает
       в снятие: стёртое время должно уйти и из системы. */
    const следующие = nextRingPlan(alarm, now);

    /* ГОРИЗОНТ: ЗАВТРАШНИЕ МОМЕНТЫ И ПОВТОР НАЗВАННЫХ ЧАСОВ.
       Без него в системе лежит только остаток сегодняшнего дня: после
       последнего момента звонить нечем, пока приложение не откроют. */
    const впереди = await горизонт(now, quiet, alarm, день);

    /* Сначала снимаем лишнее: прожитые и погашенные моменты, а если окна
       больше нет — и его. Фасад снимает только те ключи, которые ему
       передали на постановку, и про остальные знать не может. */
    const silence = (window ? moments.silence : moments.silence.concat(KEY_WINDOW))
        .concat(следующие.silence, впереди.silence);
    if (silence.length) await cancelKeys(silence);

    const totalSec = Math.floor(CONFIG.timing.opportunityWindowMs / 1000);

    /* Название действия этого момента — оно и станет надписью на главной
       кнопке экрана будильника. Берём у самого момента: это то, ради чего
       человека позвали, и слово «Открыть» вместо него ничего не говорит. */
    const поКлючу = new Map(
        (день?.moments || []).map(m => [KEY_MOMENT + m.id, m]));

    const ring = moments.ring.concat(впереди.moments).map(item => ({
        ...item,
        title: t('reminder.moment.title'),
        body: t('reminder.moment.body'),
        openLabel: поКлючу.get(item.key)?.title || t('alarm.openMoment'),
        // Звонок знает свой момент — «Прожить» открывает именно его (выкладка 163)
        openTarget: momentTarget(item.key)
    }));

    if (window) {
        ring.push({
            ...window,
            title: t('reminder.window.title'),
            body: t('reminder.window.body', {
                min: Math.floor(totalSec / 60),
                sec: totalSec % 60
            }),
            openLabel: t('alarm.openWindow'),
            openTarget: 'space'
        });
    }

    /* Назначенное время — отдельные напоминания со своими ключами. Про
       окно оно или про момент дня, видно по ключу: по нажатию откроется
       та вкладка, куда человека позвали. */
    for (const item of следующие.ring.concat(впереди.named)) {
        ring.push(isWindowKey(item.key)
            ? {
                ...item,
                title: t('reminder.window.title'),
                body: t('reminder.window.body', {
                    min: Math.floor(totalSec / 60),
                    sec: totalSec % 60
                }),
                openLabel: t('alarm.openWindow'),
                openTarget: 'space'
            }
            : {
                ...item,
                title: t('reminder.moment.title'),
                body: t('reminder.moment.body'),
                openLabel: t('alarm.openMoment'),
                openTarget: 'moments'
            });
    }

    /* СВЕРКА С ТЕМ, ЧТО РЕАЛЬНО СТОИТ В СИСТЕМЕ.
       Только если горизонт посчитался: упавший расчёт дал бы неполный
       список, и сверка сняла бы настоящие звонки как «лишние». */
    if (впереди.ok) await убратьЛишние(ring, now);

    if (!ring.length) return false;

    /* ГОДЕН ДО. Каждому напоминанию — час, до которого оно ещё годится, если телефон
       разбудит приложение позже срока (lateUntil в reminder-rules.js). Нативная часть
       хранит его вместе со звонком и по нему решает: опоздавший звонит, а не
       записывается «не дошёл». */
    return scheduleReminders(ring.map(item => разметитьРежим(
        { ...item, lateUntil: lateUntil(item, CONFIG.timing.opportunityWindowMs, quiet) }, alarm)));
}

/* ЛИШНИЕ ЗВОНКИ: В СИСТЕМЕ ЕСТЬ, В РАСПИСАНИИ НЕТ.
 *
 * Расписание снимало только то, о чём знало: прожитое и погашенное в
 * сегодняшнем дне. Звонок с ключом, которого в расписании больше нет —
 * вчерашний день, момент, исчезнувший с сервера, заготовка не того дня, —
 * не снимал никто, и он звонил в свой час, рядом с настоящим. Так в ночь на
 * 17.10.2026 набралось 32 звонка вместо 24.
 *
 * Спрашиваем у нативной части, что стоит, и снимаем всё, чем распоряжается
 * расписание (isPlannedKey), если этого нет в новом списке. Проверочные
 * звонки не трогаем: их ставит человек. Не ответила нативная часть — не
 * снимаем ничего: лишний звонок лучше потерянного. */
async function убратьЛишние(ring, now) {
    try {
        const { alarms } = await pendingAlarms();
        if (!Array.isArray(alarms) || alarms.length === 0) return;

        const нужные = ring
            .filter(item => new Date(item.at).getTime() > now.getTime())
            .map(item => item.key);
        const лишние = orphanKeys(alarms.map(a => a.key), нужные);

        if (лишние.length) await cancelKeys(лишние);
    } catch (err) {
        console.warn('[напоминания] сверка со стоящими звонками не удалась:', err);
    }
}

/* ГОРИЗОНТ РАСПИСАНИЯ: ЧТО ЗВОНИТ, ПОКА ПРИЛОЖЕНИЕ ЗАКРЫТО.
 *
 * Системный будильник умеет только то, что ему поставили заранее, а
 * закрытое приложение ставить не умеет. Поэтому всё, что должно прозвонить
 * без открытия приложения, надо положить в систему ДО того, как оно
 * закроется. Раньше лежал только остаток сегодняшнего дня; к вечеру не
 * оставалось ничего, и утреннее напоминание не приходило, если накануне
 * приложение не открыли.
 *
 * Здесь два дополнения, оба чисто на стороне веб-слоя:
 *
 *   завтрашние моменты — заготовка дня (provisionalDay), посчитанная тем же
 *       retime, что и экран, поэтому часы те же. Имена у неё свои, и
 *       когда приложение открыли и пришёл настоящий день, сегодняшнюю
 *       заготовку снимаем: иначе моменты звонили бы дважды;
 *   названные часы на ближайшие дни — namedHorizon.
 *
 * Ошибка здесь не вправе остановить постановку остального: без горизонта
 * приложение работает, как работало, — поэтому всё в try.
 *
 * @param настоящий сегодняшний день или null, если его нет (не загрузился
 *                  или в памяти чужой — см. freshDay)
 * @returns {Promise<{moments: Array, named: Array, silence: string[], ok: boolean}>}
 *          ok — посчитано ли всё без ошибок; от него зависит, можно ли сверять
 *          расписание со стоящими звонками (неполный список снял бы лишнее)
 */
async function горизонт(now, quiet, alarm, настоящий) {
    const итог = { moments: [], named: [], silence: [], ok: false };

    try {
        const человек = String((await getMeta('userId').catch(() => '')) || '');
        const сегодня = todayKey(now);
        const завтра = addDays(сегодня, 1);
        const якорь = anchorHours(alarm);

        /* «Завтра» для часов «ЧЧ:ММ» — полдень завтрашнего дня: дата
           важна, а минуты затираются самим atToday. */
        const база = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
        const день = provisionalDay(завтра, человек, quiet, якорь);
        const план = momentPlan(день.moments, now, quiet, alarm, база);
        итог.moments = план.ring;
        итог.silence.push(...план.silence);

        const сегодняшняя = provisionalDay(сегодня, человек, quiet, якорь);

        if (настоящий?.moments?.length) {
            /* Настоящий день сегодня есть — заготовка на него не нужна:
               иначе моменты звонили бы дважды. */
            итог.silence.push(...сегодняшняя.moments.map(m => KEY_MOMENT + m.id));
        } else {
            /* Дня нет вовсе (не загрузился, нет сервера, в памяти чужой) —
               звонить нечем, кроме заготовки: она и звонит вместо него.
               Снимать её, пока заменить нечем, значило бы остаться без
               звонков на остаток дня. */
            const запасная = momentPlan(сегодняшняя.moments, now, quiet, alarm);
            итог.moments.push(...запасная.ring);
            итог.silence.push(...запасная.silence);
        }

        const названные = namedHorizon(alarm, now);
        итог.named = названные.ring;
        итог.silence.push(...названные.silence);
        итог.ok = true;
    } catch (err) {
        console.warn('[напоминания] горизонт не посчитался:', err);
    }

    return итог;
}

/* ЧЕМ ЗВОНИТЬ ЭТОМУ НАПОМИНАНИЮ.
 *
 * Фасад (js/core/reminders.js) про моменты и окна не знает ничего и
 * знать не должен — он смотрит только на поле alarm. Решение
 * принимается здесь, потому что только этот слой видит сразу и
 * настройку человека, и то, что за напоминание ставится.
 *
 * Надписи на кнопках едут вместе с напоминанием. Нативный экран
 * будильника своего перевода не имеет и иметь не должен: словарь в
 * приложении один (web/js/core/i18n.js), и человек, переключивший
 * язык, должен увидеть кнопки на своём — включая те, что рисует Java. */
function разметитьРежим(item, alarm) {
    /* ТИХИЙ ЧАС СИЛЬНЕЕ РЕЖИМА АКТИВНОСТИ, и проверка стоит первой.
       Напоминание, попавшее в тишину, не звонит никогда — ни будильником,
       ни звуком уведомления. Признак quiet несёт его до самого фаcада, а
       тот пошлёт беззвучным каналом. */
    if (item.quiet) return item;

    if (!ringsAsAlarm(item.key, alarm)) return item;

    return {
        ...item,
        alarm: true,
        stopLabel: t('alarm.stop'),
        snoozeLabel: t('alarm.snooze')
    };
}

/**
 * Связать планировщик с приложением. Звать один раз при запуске.
 *
 * @param {(key: string) => void} onOpen что делать по нажатию на уведомление
 */
export async function initReminders(onOpen) {
    if (!isNative()) return;

    await onReminderAction(onOpen);

    /* Расписание переставляем и когда приложение открыли, и когда закрыли.

       Возвращение понятно: пока приложение было закрыто, человек мог
       прожить момент или дождаться нового дня с новым расписанием.

       А вот УХОД важнее, и это не сразу очевидно. Самый обычный порядок
       такой: человек открыл приложение, совершил прыжок — и ушёл. Прыжок
       сдвинул время следующего окна на 3 часа 33 минуты вперёд. Если
       ставить расписание только при возвращении, новый срок попал бы в
       будильник лишь когда человек в следующий раз откроет приложение
       сам, — то есть ровно тогда, когда напоминание уже не нужно.

       Поэтому переставляем на любую смену видимости, без разбора.

       visibilitychange, а не плагин @capacitor/app: событие штатно
       работает и в браузере, и внутри приложения, и не тянет в проект
       ещё одну зависимость ради одной строки. */
    document.addEventListener('visibilitychange', () => {
        planReminders().catch(err => console.warn('[напоминания]', err));
    });

    await planReminders();
}
