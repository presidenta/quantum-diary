/* DOM-разметка раздела.

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».
   Модуль изолирован: кроме этой папки и двух строк в app.js он ничего
   в Ежедневнике не трогает.

   id менять нельзя — на них завязаны обработчики в app.js и scene.js. */

export const TEMPLATE = [
    /* --- Выход из раздела -----------------------------------------------
       Раздел занимает весь экран и перекрывает меню Ежедневника, поэтому
       нужен собственный выход. Крестик приглушён и не тянет на себя
       внимание, но всегда на месте. */
    '<button type="button" id="btn-space-close" class="qm-close">×</button>',

    /* --- Переключатель языков (скрывается на время 3D-коридора) ------- */
    '<div id="lang-switcher-container" class="lang-switcher">',
    '    <button class="qm-lang-btn" data-lang="ru">RU</button>',
    '    <button class="qm-lang-btn" data-lang="en">EN</button>',
    '    <button class="qm-lang-btn" data-lang="uk">UK</button>',
    '</div>',

    /* --- Слои 3D-сцены и золотых песчинок ----------------------------- */
    '<div id="three-canvas"></div>',
    '<canvas id="sand-canvas"></canvas>',

    /* --- Оверлей отсчёта 1-2-3 ---------------------------------------- */
    '<div id="countdown-overlay" class="countdown-overlay hidden">',
    '    <div id="countdown-num" class="countdown-num">1</div>',
    '</div>',

    /* --- Плавное затемнение перехода ---------------------------------- */
    '<div id="blackout-screen" class="blackout-overlay hidden"></div>',

    /* --- Модальное окно «Окно возможностей открыто» -------------------- */
    '<div id="modal-opportunity" class="modal-overlay hidden">',
    '    <div class="modal-card">',
    '        <div class="modal-clock-icon">',
    '            <div class="glowing-blue-circle"><span class="clock-icon">\u{1F552}</span></div>',
    '        </div>',
    '        <h2 id="modal-title" class="modal-title" data-i18n="modalTitle">Окно возможностей открыто</h2>',
    '        <p class="modal-sub" data-i18n="modalSubtitle"></p>',
    '        <div class="modal-timer-box">',
    '            <span data-i18n="modalElapsedPrefix">прошло </span><span id="modal-timer-val">0мин 0сек</span>',
    '        </div>',
    '        <p class="modal-warning" data-i18n="modalWarning"></p>',
    '        <button id="btn-modal-start" class="btn-gold qm-block" data-i18n="modalBtnStart">Войти в суперпозицию</button>',
    '        <button id="btn-modal-later" class="btn-link qm-block" data-i18n="modalBtnLater">Позже</button>',
    '    </div>',
    '</div>',

    /* --- Верхний таймер квантового окна -------------------------------- */
    '<div id="hud-timer" class="hud-timer-container hidden">',
    '    <div class="hud-timer-badge"><span id="hud-timer-val">33.3</span>s</div>',
    '    <div id="txt-s2-sub" class="hud-timer-sub" data-i18n="screen2Instruction"></div>',
    '</div>',

    /* --- ЭКРАН 1: титульная страница раздела --------------------------- */
    '<div id="screen-1" class="qm-screen">',
    '    <div class="metaverse-title-top" data-i18n="metaverseTitle">Моя метавселенная</div>',
    '    <div id="header-metaverse" class="metaverse-header">',
    '        <div class="flower-orbit-container">',
    '            <svg class="flower-svg" viewBox="0 0 200 200" aria-hidden="true">',
    '                <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>',
    '                <circle cx="100" cy="100" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '                <circle cx="100" cy="65" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '                <circle cx="100" cy="135" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '                <circle cx="130.3" cy="82.5" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '                <circle cx="69.7" cy="82.5" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '                <circle cx="130.3" cy="117.5" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '                <circle cx="69.7" cy="117.5" r="35" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>',
    '            </svg>',
    '            <div class="quantum-particle outer-quantum"></div>',
    '            <div class="quantum-particle inner-quantum" id="iq1"></div>',
    '            <div class="quantum-particle inner-quantum" id="iq2"></div>',
    '        </div>',
    '    </div>',
    '    <h1 class="qm-hero-title" data-i18n="title1">Пространство вариантов</h1>',
    '    <div class="qm-hero-rule"></div>',
    '    <div class="qm-hero-actions">',
    '        <button id="btn-start-app" class="btn-gold" data-i18n="btnStart">Войти в суперпозицию</button>',
    '        <a href="#" id="btn-open-settings" class="btn-link" data-i18n="btnSettings">Изменить варианты реальностей</a>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН НАСТРОЕК: двери и намерения ----------------------------- */
    '<div id="screen-setup" class="qm-screen hidden">',
    '    <div class="card-panel">',
    '        <div class="qm-eyebrow" data-i18n="multiverse">Мультивселенная</div>',
    '        <h2 class="qm-title-md" data-i18n="setupTitle">Настройка Реальностей</h2>',
    '        <p class="qm-sub" data-i18n="setupSub"></p>',
    '        <div class="doors-count-selector">',
    '            <label for="doors-count-select" data-i18n="doorsCount">Количество дверей:</label>',
    '            <select id="doors-count-select">',
    '                <option value="3">3</option>',
    '                <option value="4">4</option>',
    '                <option value="5">5</option>',
    '                <option value="6">6</option>',
    '                <option value="7" selected>7</option>',
    '            </select>',
    '        </div>',
    '        <div id="doors-inputs-container" class="inputs-scroll-area"></div>',
    '        <button id="btn-save-setup" class="btn-gold qm-block" data-i18n="btnSave">Сохранить и войти</button>',
    '        <button id="btn-cancel-setup" class="btn-link qm-block" data-i18n="btnCancel">Отмена</button>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН 3: настройка реальности после выбора двери --------------- */
    '<div id="screen-3" class="qm-screen hidden">',
    '    <div class="card-panel text-center">',
    '        <p id="txt-s3-sub" class="qm-sub" data-i18n="screen3Subtitle"></p>',
    '        <h2 id="txt-s3-title" class="qm-title-lg" data-i18n="screen3MainTitle">Настройка реальности</h2>',
    '        <div id="txt-s3-chosen-reality" class="chosen-reality-box-clean"></div>',
    '        <p class="qm-speed-title" data-i18n="screen3SpeedTitle"></p>',
    '        <div class="speed-tabs-container">',
    '            <button type="button" class="speed-tab active" data-speed="1">',
    '                <span data-i18n="speedOption1Btn">Быстрый переход (в потоке дня)</span>',
    '            </button>',
    '            <button type="button" class="speed-tab" data-speed="2">',
    '                <span data-i18n="speedOption2Btn">Глубокое погружение (есть время)</span>',
    '                <span class="badge-rec" data-i18n="speedBadge">(Рекомендуем)</span>',
    '            </button>',
    '        </div>',
    '        <div id="speed-instruction-text" class="speed-instruction-box"></div>',
    '        <p id="txt-s3-audio-warn" class="qm-audio-warn" hidden></p>',

    /* Составная кнопка: слева «Закрой глаза», справа «Play».
       Правая зона появляется только у двери с прикреплённым аудио. */
    '        <div class="qm-split-btn">',
    '            <button type="button" id="btn-s3" class="btn-gold btn-eyes qm-split-main">',
    '                <span class="smiley-icon"></span><span data-i18n="screen3Btn">Закрой глаза</span>',
    '            </button>',
    '            <button type="button" id="btn-s3-play" class="btn-gold qm-split-play" hidden>',
    '                <span class="qm-play-glyph"></span>',
    '            </button>',
    '        </div>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН 4: Дневник Наблюдателя ---------------------------------- */
    '<div id="screen-4" class="qm-screen hidden">',
    '    <div class="card-panel">',
    '        <p id="txt-s4-top" class="gold-notice-box" data-i18n="screen4Top"></p>',
    '        <h2 id="txt-s4-title" class="qm-title-md" data-i18n="screen4Title">Дневник Наблюдателя</h2>',
    '        <p id="txt-s4-sub" class="qm-sub" data-i18n="screen4Subtitle"></p>',
    '        <textarea id="input-s4-diary" rows="7" data-i18n="screen4Placeholder"></textarea>',
    '        <button id="btn-s4-save" class="btn-gold qm-block" data-i18n="screen4Btn">Активировать в Хрониках Акаши</button>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН 5: Хроники Акаши ---------------------------------------- */
    '<div id="screen-5" class="qm-screen hidden">',
    '    <div class="qm-chronicles-wrap">',
    '        <div class="qm-cooldown-panel">',
    '            <div id="s5-cooldown-timer"></div>',
    '            <button id="btn-snooze" class="btn-snooze hidden"></button>',
    '        </div>',
    '        <div class="qm-chronicles-head">',
    '            <h3 id="txt-s5-title" data-i18n="screen5Title"></h3>',
    '            <button id="btn-edit-from-s5" class="btn-link-small" data-i18n="btnEditFromS5"></button>',
    '        </div>',
    '        <p id="txt-s5-sub" data-i18n="screen5Subtitle"></p>',
    '        <div id="chronicles-list"></div>',
    '    </div>',
    '</div>'
].join('\n');
