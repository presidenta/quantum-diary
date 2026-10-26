/* СТИЛИ ВИДЖЕТОВ НА КОМПЬЮТЕРЕ (выкладка 182).

   Владелец 26.10.2026: «настраиваешь один виджет — меняются настройки всех виджетов». До 182 у всех
   окон-виджетов был один стиль (kvant-desktop-widget-style), а окно «Установить виджет» в браузере
   открывалось с умолчаниями и при первой правке затирало его — так «слетели» залитые виджеты.

   Теперь у каждого вида на компьютере свой стиль: kvant-desktop-widget-style:<вид>. Общий ключ без
   вида остался — это «Новые виджеты»: его берёт окно, у которого своего стиля ещё нет. Хранилище у
   всех окон одно (браузер или сессия Electron), и окно виджета перерисовывается от записи сразу
   (событие storage). На телефоне стили хранит приложение (WidgetStore), этот модуль там не нужен. */

export const DESKTOP_STYLE_KEY = 'kvant-desktop-widget-style';

/** Ключ стиля: вида или общий («Новые виджеты»), если вид не назван. */
export const desktopStyleKey = вид => (вид ? `${DESKTOP_STYLE_KEY}:${вид}` : DESKTOP_STYLE_KEY);

function прочитать(ключ) {
    try {
        const сырое = localStorage.getItem(ключ);
        return сырое ? JSON.parse(сырое) : null;
    } catch {
        return null;
    }
}

/** Свой стиль вида есть. */
export const hasOwnDesktopStyle = вид => !!вид && прочитать(desktopStyleKey(вид)) !== null;

/** Стиль окна-виджета: свой, а нет — общий, а нет и его — пустой (всё по умолчанию). */
export function readDesktopStyle(вид) {
    return (вид && прочитать(desktopStyleKey(вид))) || прочитать(DESKTOP_STYLE_KEY) || {};
}

/** Записать стиль вида (или общий, если вид не назван). Хранилище закрыто — молча: окно возьмёт умолчания. */
export function writeDesktopStyle(вид, стиль) {
    try {
        localStorage.setItem(desktopStyleKey(вид), JSON.stringify(стиль));
    } catch {
        // Приватное окно браузера: хранилища нет
    }
}
