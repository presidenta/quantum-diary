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

    /* ШЕСТЕРЁНКИ И ВЫБОРА ЯЗЫКА ЗДЕСЬ БОЛЬШЕ НЕТ.

       Обе кнопки висели в правом верхнем углу на всех экранах раздела и
       ни на одном не были нужны. Язык раздел берёт у Ежедневника и своего
       выбора не держит — вторая кнопка языка рядом с первой только
       сбивала. Настройка реальностей открывается ссылкой «Изменить
       варианты реальностей» на главном экране и кнопкой «Настройки
       дверей» в хрониках; отдельный значок для того же был третьим
       входом в одно и то же место.

       Код, который их обслуживал, остался и молчит: он весь написан
       через `if (элемент)`. Понадобятся снова — довольно вернуть сюда
       разметку. */

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
    '        <h2 id="modal-title" class="modal-title gold-cut" data-i18n="modalTitle">Окно возможностей открыто</h2>',
    '        <p class="modal-sub" data-i18n="modalSubtitle"></p>',
    '        <div class="modal-timer-box">',
    '            <span data-i18n="modalElapsedPrefix">прошло </span><span id="modal-timer-val">0мин 0сек</span>',
    '        </div>',
    '        <p class="modal-warning" data-i18n="modalWarning"></p>',
    '        <button id="btn-modal-start" class="btn-gold qm-block">',
    '            <span class="gold-cut" data-i18n="modalBtnStart">Войти в суперпозицию</span>',
    '        </button>',

    /* Отсрочка живёт здесь, а не в хрониках: откладывать есть смысл в тот
       миг, когда окно открылось и человек занят, — а не после перехода,
       когда откладывать уже нечего. Надпись ставит updateSnoozeButtonUI:
       в ней счётчик оставшихся отсрочек. */
    '        <button type="button" id="btn-snooze" class="btn-snooze qm-block hidden"></button>',
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
    /* ЦВЕТОК ЖИЗНИ — ТО ЖЕ ПРОРЕЗАННОЕ ЗОЛОТО, ЧТО И БУКВЫ.

       У букв золото показывается сквозь контур глифа, здесь — сквозь
       штрих окружности. Приём тот же, разница только в том, чем режут:
       у текста это background-clip, у рисунка — обводка переливом.

       Перелив повторяет --pult-rim: те же восемь остановок, тот же угол
       135°. Он задан в userSpaceOnUse на весь квадрат 200×200, а не на
       каждую окружность по отдельности: иначе каждый лепесток получил
       бы свой собственный перелив, и рисунок распался бы на восемь
       несвязанных колец вместо одной отливки.

       Тёмный контур вокруг штриха навешен в CSS теми же пятью тенями,
       что у плотного контура букв. */
    '            <svg class="flower-svg" viewBox="0 0 200 200" aria-hidden="true">',
    '                <defs>',
    '                    <linearGradient id="qm-flower-rim" gradientUnits="userSpaceOnUse" x1="29" y1="29" x2="171" y2="171">',
    '                        <stop offset="0%" stop-color="#FFFBE8"/>',
    '                        <stop offset="13%" stop-color="#F3D375"/>',
    '                        <stop offset="25%" stop-color="#FFFFFF"/>',
    '                        <stop offset="38%" stop-color="#D9A83F"/>',
    '                        <stop offset="52%" stop-color="#FFF4C0"/>',
    '                        <stop offset="66%" stop-color="#C8902C"/>',
    '                        <stop offset="80%" stop-color="#FFF9DC"/>',
    '                        <stop offset="100%" stop-color="#AE7D21"/>',
    '                    </linearGradient>',
    '                </defs>',
    '                <circle cx="100" cy="100" r="90" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.6"/>',
    '                <circle cx="100" cy="100" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '                <circle cx="100" cy="65" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '                <circle cx="100" cy="135" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '                <circle cx="130.3" cy="82.5" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '                <circle cx="69.7" cy="82.5" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '                <circle cx="130.3" cy="117.5" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '                <circle cx="69.7" cy="117.5" r="35" fill="none" stroke="url(#qm-flower-rim)" stroke-width="1.4"/>',
    '            </svg>',
    '            <div class="quantum-particle outer-quantum"></div>',
    '            <div class="quantum-particle inner-quantum" id="iq1"></div>',
    '            <div class="quantum-particle inner-quantum" id="iq2"></div>',
    '        </div>',
    '    </div>',
    '    <h1 class="qm-hero-title gold-cut" data-i18n="title1">Пространство вариантов</h1>',
    '    <div class="qm-hero-rule"></div>',
    '    <div class="qm-hero-actions">',
    '        <button id="btn-start-app" class="btn-gold">',
    '            <span class="gold-cut" data-i18n="btnStart">Войти в суперпозицию</span>',
    '        </button>',
    '        <a href="#" id="btn-open-settings" class="btn-link" data-i18n="btnSettings">Изменить варианты реальностей</a>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН НАСТРОЕК: двери и намерения ----------------------------- */
    '<div id="screen-setup" class="qm-screen hidden">',
    '    <div class="card-panel">',
    '        <div class="qm-eyebrow" data-i18n="multiverse">Мультивселенная</div>',
    '        <h2 class="qm-title-md gold-cut" data-i18n="setupTitle">Настройка Реальностей</h2>',
    '        <p class="qm-sub" data-i18n="setupSub"></p>',
    /* Подпись тянется на всю свободную ширину, выбор — компактный
       квадратик справа. */
    '        <div class="doors-count-selector">',
    '            <label class="doors-count-label" for="doors-count-select" data-i18n="doorsCount">Количество дверей:</label>',
    '            <select id="doors-count-select" class="doors-count-pick">',
    '                <option value="2">2</option>',
    '                <option value="3">3</option>',
    '                <option value="4">4</option>',
    '                <option value="5">5</option>',
    '                <option value="6">6</option>',
    '                <option value="7" selected>7</option>',
    '            </select>',
    '        </div>',
    '        <div id="doors-inputs-container" class="inputs-scroll-area"></div>',
    '        <button id="btn-save-setup" class="btn-gold qm-block">',
    '            <span class="gold-cut" data-i18n="btnSave">Сохранить и войти</span>',
    '        </button>',
    '        <button id="btn-cancel-setup" class="btn-link qm-block" data-i18n="btnCancel">Отмена</button>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН 3: настройка реальности после выбора двери --------------- */
    '<div id="screen-3" class="qm-screen hidden">',
    '    <div class="card-panel text-center">',
    /* ДЛИННОЕ ВСТУПЛЕНИЕ СВЁРНУТО ДО ТРЁХ СТРОК.

       На телефоне эта фраза занимала четверть экрана и отодвигала вниз
       всё, ради чего человек сюда пришёл. Теперь видны три строки, а
       остальное открывается галочкой. Текст никуда не делся — он просто
       не берёт место, пока его не позвали.

       Галочка — отдельная кнопка рядом с абзацем, а не внутри него:
       applyLang пишет перевод в содержимое элемента с data-i18n и
       выбросил бы значок при первой же смене языка. */
    '        <div class="qm-fold" id="fold-s3">',
    '            <p id="txt-s3-sub" class="qm-sub qm-fold-text" data-i18n="screen3Subtitle"></p>',
    '            <button type="button" class="qm-fold-btn" aria-expanded="false" hidden>',
    '                <i class="qm-chev" aria-hidden="true"></i>',
    '            </button>',
    '        </div>',
    '        <h2 id="txt-s3-title" class="qm-title-lg gold-cut" data-i18n="screen3MainTitle">Настройка реальности</h2>',
    '        <div id="txt-s3-chosen-reality" class="chosen-reality-box-clean"></div>',

    /* Содержимое выбранной двери: её снимки. Запись слышна правой
       половиной составной кнопки ниже. */
    '        <div id="s3-door-media" class="qm-s3-media" hidden></div>',
    '        <p class="qm-speed-title" data-i18n="screen3SpeedTitle"></p>',
    /* Две скорости стоят рядом, в один ряд на всю ширину: прежде они
       лежали одна под другой двумя длинными полосами и забивали экран.
       Подписи оставлены короткими — «Быстрый переход» и «Глубокое
       погружение»; пояснения в скобках ушли, их место под кнопками
       занимает сама инструкция.

       «Рекомендуем» не висит постоянно: оно показывается только когда
       выбрано глубокое погружение, и не мозолит глаза всё время. */
    '        <div class="speed-tabs-container">',
    /* Максимальный эффект стоит первым: это главный путь, и слева его
       встречают взглядом раньше. Порядок в разметке, а не в CSS, —
       пальцем и клавишей обход идёт в том же порядке, что и глазом.
       data-speed при этом не трогается: к нему привязан выбор и текст
       инструкции под кнопками. */
    '            <button type="button" class="speed-tab" data-speed="2">',
    '                <span class="gold-cut" data-i18n="speedOption2Btn">Максимальный эффект</span>',
    /* Отдельной пометки здесь больше нет: её слова — «Максимальный
       эффект» — стали названием самой кнопки. Две подписи об одном на
       одной кнопке были лишними и растили её в высоту на целую строку. */
    '            </button>',
    '            <button type="button" class="speed-tab active" data-speed="1">',
    '                <span class="gold-cut" data-i18n="speedOption1Btn">Мгновенный переход</span>',
    '            </button>',
    '        </div>',
    '        <div id="speed-instruction-text" class="speed-instruction-box"></div>',
    '        <p id="txt-s3-audio-warn" class="qm-audio-warn" hidden></p>',

    /* Золотая капсула: смайлик, пластина «Закрой глаза», круг «Play».

       Смайлик — не кнопка, а лицо всей капсулы: он закрывает глаза, когда
       палец или курсор оказывается на любой её части, и открывает, когда
       уходит. Нажатие на любую половину утапливает капсулу целиком. */
    '        <div class="qm-act" id="qm-act">',
    /* Лицо нарисовано, а не взято эмодзи: эмодзи приносит свой кружок и
       свой цвет, а кружок здесь золотой, из той же пластины, что
       капсула. Поэтому по золоту идут только черты — бровки, глаза,
       щёки и улыбка. Узлы декоративные, нажатий не ловят. */
    '            <span class="qm-act-face" aria-hidden="true">',
    '                <i class="qm-brow qm-brow-l"></i><i class="qm-brow qm-brow-r"></i>',
    '                <i class="qm-eye qm-eye-l"></i><i class="qm-eye qm-eye-r"></i>',
    '                <i class="qm-cheek qm-cheek-l"></i><i class="qm-cheek qm-cheek-r"></i>',
    '                <i class="qm-mouth"></i>',
    '            </span>',
    '            <button type="button" id="btn-s3" class="qm-act-main">',
    '                <span class="gold-cut" data-i18n="screen3Btn">Закрой глаза</span>',
    '            </button>',
    '            <button type="button" id="btn-s3-play" class="qm-act-play qm-play-idle">',
    '                <span class="qm-play-glyph"></span>',
    '            </button>',
    '        </div>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН 4: Дневник Наблюдателя ---------------------------------- */
    '<div id="screen-4" class="qm-screen hidden">',
    '    <div class="card-panel qm-akasha">',
    '        <div class="qm-fold" id="fold-s4">',
    '            <p id="txt-s4-top" class="gold-notice-box qm-fold-text" data-i18n="screen4Top"></p>',
    '            <button type="button" class="qm-fold-btn" aria-expanded="false" hidden>',
    '                <i class="qm-chev" aria-hidden="true"></i>',
    '            </button>',
    '        </div>',
    '        <h2 id="txt-s4-title" class="qm-title-md gold-cut" data-i18n="screen4Title">Дневник Наблюдателя</h2>',
    '        <p id="txt-s4-sub" class="qm-sub" data-i18n="screen4Subtitle"></p>',
    /* СЛОВА СОСТОЯНИЙ.

       Перед полем записи лежат сами слова — эмоции, телесные ощущения и
       место в теле. Нажатое слово загорается золотом и само встаёт в
       запись; нажатое второй раз — гаснет и из записи уходит. Квадратиков
       и галочек здесь нет: выбор виден по самому слову, а не по значку
       рядом с ним.

       Ряды рисует renderDiaryTags: слова живут в словаре и меняются
       вместе с языком, а выбор держится по номерам и смену языка
       переживает. */
    '        <p class="qm-tags-hint" data-i18n="diaryTagsHint"></p>',
    '        <div class="qm-tags" id="s4-tags"></div>',
    '        <textarea id="input-s4-diary" rows="7" data-i18n="screen4Placeholder"></textarea>',

    /* Гримуар Акаши: кнопка-фолиант, из которой при нажатии вылетает
       вихрь золотых и синих искр. Холст лежит поверх и кликов не ловит. */
    '        <div class="qm-tome-wrap">',
    '            <canvas id="qm-tome-sparks" class="qm-tome-sparks" aria-hidden="true"></canvas>',
    '            <button type="button" id="btn-s4-save" class="qm-tome">',
    '                <span class="qm-tome-edge" aria-hidden="true"></span>',
    '                <span class="qm-tome-text gold-cut" id="qm-tome-text" data-i18n="screen4Btn">Активировать в Хрониках Акаши</span>',
    '                <span class="qm-tome-flare" aria-hidden="true"></span>',
    '            </button>',
    '        </div>',
    '    </div>',
    '</div>',

    /* --- ЭКРАН 5: Хроники Акаши ---------------------------------------- */
    '<div id="screen-5" class="qm-screen hidden">',
    '    <div class="qm-chronicles-wrap">',
    '        <div class="qm-cooldown-panel">',
    '            <div id="s5-cooldown-timer"></div>',
    '        </div>',
    '        <div class="qm-chronicles-head">',
    '            <h3 id="txt-s5-title" class="gold-cut" data-i18n="screen5Title"></h3>',
    /* Шестерёнка вместо надписи: подпись «Настройки дверей» стояла в
       строке с заголовком хроник и спорила с ним за внимание. Значок
       тише, а слова приходят подсказкой под курсором и под пальцем.
       Текст подсказки ставит applyLang — в разметке его нет, иначе
       data-i18n затёр бы содержимое кнопки вместо атрибута. */
    '            <button type="button" id="btn-edit-from-s5" class="qm-gear qm-tip"></button>',
    '        </div>',
    '        <p id="txt-s5-sub" data-i18n="screen5Subtitle"></p>',
    '        <div id="chronicles-list"></div>',
    '    </div>',
    '</div>'
].join('\n');
