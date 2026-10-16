/* УСТАНОВКА «КВАНТА» НА КОМПЬЮТЕР.

   Кнопка «Установить на ПК» ставит сайт отдельным окном — без вкладок и
   адресной строки, со своим значком в меню «Пуск» и на панели задач.
   Значок тот же, что у приложения на телефоне (icons/icon-192.png и
   icon-512.png).

   ПОЧЕМУ МАНИФЕСТ ПОДКЛЮЧАЕТСЯ ОТСЮДА, А НЕ ССЫЛКОЙ В HTML.

   Манифест убран из index.html нарочно и возвращаться туда не должен.
   С ним Chrome на Android делал из сайта ярлык-приложение (WebAPK) —
   то же имя, тот же значок, — но без напоминаний: звук, вибрация и
   срабатывание при закрытом приложении умеет только настоящее
   приложение. Выходило два одинаковых «Кванта», и только один звонит.

   Поэтому здесь манифест подключается лишь тогда, когда это точно
   компьютер (правила — core/pc-install-rules.js, под тестами). На
   телефоне и планшете скрипт не делает ничего: ни манифеста, ни кнопки.
   Для iPhone есть свой путь — js/ios-home.js, он сюда не заходит.

   НА КОМПЬЮТЕРЕ ПРЕДЛАГАЕТ УСТАНОВКУ ТОЛЬКО CHROMIUM (Chrome, Edge, Brave,
   Opera): событие beforeinstallprompt есть у них. Firefox и Safari
   события не шлют — там кнопка просто не появится, и это не поломка.

   Напоминания при закрытом окне компьютерная версия так же не умеет, как
   и вкладка браузера: звонит только Android-приложение. Кнопку для него
   на компьютере прячем (см. profile.js) — apk на ПК не поставить. */

import { isDesktopBrowser, shouldOfferPcInstall } from './core/pc-install-rules.js';

const MANIFEST_PC = 'manifest-pc.webmanifest';

function среда() {
    const nav = navigator;
    const media = query => window.matchMedia?.(query).matches === true;

    return {
        userAgent: nav.userAgent || '',
        uaMobile: nav.userAgentData?.mobile,
        maxTouchPoints: nav.maxTouchPoints || 0,
        coarsePointer: media('(pointer: coarse)'),
        native: Boolean(window.Capacitor
            && typeof window.Capacitor.isNativePlatform === 'function'
            && window.Capacitor.isNativePlatform()),
        standalone: media('(display-mode: standalone)')
            || media('(display-mode: window-controls-overlay)')
    };
}

/** Открыт ли сайт на настольном браузере. Нужно profile.js. */
export const isDesktop = () => {
    const e = среда();
    return !e.native && isDesktopBrowser(e);
};

/* Событие приходит один раз и вызвать prompt() позволяет тоже один раз,
   поэтому его держим до нажатия на кнопку. */
let отложенный = null;

const кнопка = () => document.getElementById('installPc');

function показатьКнопку(видна) {
    const node = кнопка();
    if (node) node.hidden = !видна;
}

export function initPcInstall() {
    if (!isDesktop()) return;

    if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = MANIFEST_PC;
        document.head.appendChild(link);
    }

    window.addEventListener('beforeinstallprompt', event => {
        // Без этого Chrome показывает свою полоску вместо нашей кнопки
        event.preventDefault();
        отложенный = event;
        показатьКнопку(shouldOfferPcInstall(среда()));
    });

    // Поставили — кнопка своё отработала, а событие больше не придёт
    window.addEventListener('appinstalled', () => {
        отложенный = null;
        показатьКнопку(false);
    });

    кнопка()?.addEventListener('click', async () => {
        if (!отложенный) return;

        const запрос = отложенный;
        отложенный = null;
        показатьКнопку(false);

        try {
            await запрос.prompt();
            await запрос.userChoice;
        } catch (err) {
            // Окно установки закрыли или браузер отказал — не беда
            console.warn('[установка на ПК]', err && err.message);
        }
    });
}

initPcInstall();
