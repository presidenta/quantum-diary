/* Механика раздела: экраны, таймеры, двери, дневник, хроники.

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».
   Модуль изолирован: кроме этой папки и двух строк в app.js он ничего
   в Ежедневнике не трогает. */

import { CONFIG } from './config.js';
import { NotificationManager } from './notifications.js';
import { QuantumCorridorScene } from './scene.js';
import {
    saveDoorAudio, getDoorAudio, getDoorAudioMeta, deleteDoorAudio,
    canRecord, startRecording, formatDuration
} from './audio.js';
import {
    getDoorPhotos, addDoorPhotos, deleteDoorPhoto, PHOTO_LIMIT
} from './photos.js';

/* Языки раздела — те же и в том же порядке, что в Ежедневнике.
   Название языка пишется на нём самом, поэтому переводить его не нужно. */
const LANGS = [
    { code: 'ru', flag: '\u{1F1F7}\u{1F1FA}', label: 'Рус', name: 'Русский' },
    { code: 'uk', flag: '\u{1F1FA}\u{1F1E6}', label: 'Укр', name: 'Українська' },
    { code: 'en', flag: '\u{1F1EC}\u{1F1E7}', label: 'Eng', name: 'English' }
];

export class QuantumApp {
    constructor(rootEl) {
        this.rootEl = rootEl || null;   // корень модуля (.qm-root)
        this._destroyed = false;
        this._raf = null;
        this._timeouts = [];

        this.lang = localStorage.getItem('quantum_lang') || 'ru';
        this.realities = JSON.parse(localStorage.getItem('quantum_doors_texts') || '[]');

        // Неизменные id дверей: к ним привязаны записи, поэтому правка текста
        // или перестановка дверей аудио не теряет.
        this.doorIds = JSON.parse(localStorage.getItem('quantum_doors_ids') || '[]');
        this.syncDoorIds(this.realities.length);

        this.currentDoorId = null;       // дверь, выбранная в коридоре
        this.currentAudioRecord = null;  // её запись, если она есть
        this.audioEl = null;             // проигрыватель
        this.audioUrl = null;            // ссылка на blob, её надо освобождать
        this.recorder = null;            // активный диктофон
        this.recordingDoorId = null;     // дверь, которую сейчас записываем
        this.recTimer = null;            // отсчёт секунд во время записи
        this.smileyLocked = false;       // смайлик зажмурился и остался таким
        this.history = JSON.parse(localStorage.getItem('quantum_akashi_chronicles') || '[]');
        this.notifications = new NotificationManager();
        this.selectedSpeed = 1; // 1: Быстрый переход, 2: Глубокое погружение
        this.windowTriggered = false;

        /* Каждый кусок заводится отдельно и под присмотром.

           Раньше ошибка в любом из них обрывала конструктор целиком. Если
           спотыкался шаг до initUI, обработчики кнопок не навешивались
           вовсе: раздел открывался, рисовался, но ни одна кнопка не
           работала — в том числе «Войти в суперпозицию». Теперь сломанный
           кусок остаётся сломанным, а всё остальное живёт.

           Кнопки заводятся первыми: без них раздел бесполезен. */
        this.safely('кнопки раздела', () => this.initUI());
        this.safely('песочная анимация', () => this.initSandFX());
        this.safely('частицы заголовка', () => this.initInnerQuantums());
        this.safely('переключатель языков', () => this.initLangSwitcher());
        this.safely('смайлик', () => this.initSmiley());
        this.safely('подписи', () => this.applyLang());
        this.safely('расписание', () => this.checkScheduleAndTimer());
    }

    /* Заводит кусок раздела, не роняя остальные. */
    safely(what, step) {
        try {
            step();
        } catch (err) {
            console.error('[space] не удалось завести: ' + what, err);
        }
    }

    /* Модуль ищет элементы только внутри себя.

       Рядом на той же странице живёт Ежедневник, и его элементы трогать
       нельзя: у него сотня своих подписей, и чужой словарь подставил бы им
       служебные ключи вместо текста. */
    $(id) {
        return (this.rootEl || document).querySelector('#' + id);
    }

    $$(selector) {
        return (this.rootEl || document).querySelectorAll(selector);
    }

    t(key) {
        return CONFIG.translations[this.lang][key] || key;
    }

    // Экранирование текста пользователя перед вставкой в HTML
    escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/[&<>"']/g, function (ch) {
                return {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                }[ch];
            });
    }

    // Отложенный вызов с запоминанием таймера — чтобы снять его при уходе
    later(fn, ms) {
        const id = setTimeout(() => {
            if (!this._destroyed) fn();
        }, ms);
        this._timeouts.push(id);
        return id;
    }

    initInnerQuantums() {
        // Координаты центров кругов SVG "Цветка жизни"
        this.flowerCircles = [
            {x: 100, y: 100},
            {x: 100, y: 65},
            {x: 130.3, y: 82.5},
            {x: 130.3, y: 117.5},
            {x: 100, y: 135},
            {x: 69.7, y: 117.5},
            {x: 69.7, y: 82.5}
        ];

        // Логика двух квантов
        this.q2 = { circle: 0, angle: 0, speed: 0.02, cooldown: 0 };
        this.q3 = { circle: 4, angle: Math.PI, speed: -0.025, cooldown: 0 };

        const animateQ = () => {
            if (this._destroyed) return;

            const screen1 = document.getElementById('screen-1');
            if (!screen1 || screen1.classList.contains('hidden')) {
                this._raf = requestAnimationFrame(animateQ);
                return;
            }

            const r = 35;

            // Обновление кванта 2
            this.q2.angle += this.q2.speed;
            if (this.q2.cooldown > 0) this.q2.cooldown--;
            let p2x = this.flowerCircles[this.q2.circle].x + r * Math.cos(this.q2.angle);
            let p2y = this.flowerCircles[this.q2.circle].y + r * Math.sin(this.q2.angle);

            // Обновление кванта 3
            this.q3.angle += this.q3.speed;
            if (this.q3.cooldown > 0) this.q3.cooldown--;
            let p3x = this.flowerCircles[this.q3.circle].x + r * Math.cos(this.q3.angle);
            let p3y = this.flowerCircles[this.q3.circle].y + r * Math.sin(this.q3.angle);

            // Избежание столкновений
            if (Math.hypot(p2x - p3x, p2y - p3y) < 15) {
                this.q2.speed *= -1;
                this.q3.speed *= -1;
                this.q2.angle += this.q2.speed * 2;
                this.q3.angle += this.q3.speed * 2;
            }

            // Логика перехода между орбитами в точках соприкосновения (q2)
            if (this.q2.cooldown === 0) {
                for (let i = 0; i < 7; i++) {
                    if (i === this.q2.circle) continue;
                    if (Math.abs(Math.hypot(p2x - this.flowerCircles[i].x, p2y - this.flowerCircles[i].y) - r) < 1.0) {
                        if (Math.random() < 0.4) {
                            this.q2.circle = i;
                            this.q2.angle = Math.atan2(p2y - this.flowerCircles[i].y, p2x - this.flowerCircles[i].x);
                            this.q2.cooldown = 40;
                            break;
                        }
                    }
                }
            }

            // Логика перехода между орбитами в точках соприкосновения (q3)
            if (this.q3.cooldown === 0) {
                for (let i = 0; i < 7; i++) {
                    if (i === this.q3.circle) continue;
                    if (Math.abs(Math.hypot(p3x - this.flowerCircles[i].x, p3y - this.flowerCircles[i].y) - r) < 1.0) {
                        if (Math.random() < 0.4) {
                            this.q3.circle = i;
                            this.q3.angle = Math.atan2(p3y - this.flowerCircles[i].y, p3x - this.flowerCircles[i].x);
                            this.q3.cooldown = 40;
                            break;
                        }
                    }
                }
            }

            // Применяем позиционирование относительно SVG
            const iq1 = document.getElementById('iq1');
            const iq2 = document.getElementById('iq2');
            if (iq1 && iq2) {
                iq1.style.left = (10 + p2x * 0.55) + 'px';
                iq1.style.top = (10 + p2y * 0.55) + 'px';
                iq2.style.left = (10 + p3x * 0.55) + 'px';
                iq2.style.top = (10 + p3y * 0.55) + 'px';
            }

            this._raf = requestAnimationFrame(animateQ);
        };
        animateQ();
    }

    /* Переключатель языков: одна кнопка с текущим языком, по нажатию —
       список остальных.

       Раздел занимает весь экран и перекрывает кнопку языка Ежедневника,
       поэтому своя здесь обязательна. Выбор уходит наружу событием: язык в
       Ежедневнике и в разделе должен остаться одним, а менять чужое
       состояние напрямую модуль не вправе. */
    initLangSwitcher() {
        const button = this.$('qm-lang-btn');
        const menu = this.$('qm-lang-menu');
        if (!button || !menu) return;

        /* Список собирается по одному элементу, без replaceChildren:
           эта команда появилась в браузерах недавно, а раздел должен
           открываться и на старом движке. */
        menu.innerHTML = '';

        for (const item of LANGS) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'qm-lang-item';
            row.dataset.lang = item.code;

            const name = document.createElement('span');
            name.className = 'qm-lang-name';
            name.textContent = item.flag + ' ' + item.name;
            row.appendChild(name);

            const code = document.createElement('span');
            code.className = 'qm-lang-code';
            code.textContent = item.label;
            row.appendChild(code);

            row.addEventListener('click', () => {
                this.closeLangMenu();
                this.setLang(item.code);
            });

            menu.appendChild(row);
        }

        button.addEventListener('click', () => {
            const open = menu.hidden;
            menu.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
        });

        // Клик мимо списка закрывает его. Слушаем на корне раздела, чтобы
        // не оставлять обработчик на всей странице после ухода отсюда.
        if (this.rootEl) {
            this.rootEl.addEventListener('click', e => {
                if (!e.target.closest('#lang-switcher-container')) this.closeLangMenu();
            });
        }
    }

    closeLangMenu() {
        const button = this.$('qm-lang-btn');
        const menu = this.$('qm-lang-menu');
        if (menu) menu.hidden = true;
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    setLang(code) {
        if (!LANGS.some(item => item.code === code)) return;

        this.lang = code;
        localStorage.setItem('quantum_lang', code);
        this.applyLang();

        // Просим Ежедневник переключиться следом, чтобы язык был один
        document.dispatchEvent(new CustomEvent('qm-lang-change', { detail: code }));
    }

    /* Смайлик жмурится от любого прикосновения.

       На наведение, касание и фокус — пока взаимодействие длится. После
       нажатия остаётся зажмуренным, пока не выберут новую дверь. Одним CSS
       так не выйдет: :hover и :active отпускают состояние сразу. */
    initSmiley() {
        const button = this.$('btn-s3');
        if (!button) return;

        const shut = () => button.classList.add('qm-eyes-shut');
        const open = () => { if (!this.smileyLocked) button.classList.remove('qm-eyes-shut'); };

        ['pointerenter', 'pointerdown', 'touchstart', 'focus'].forEach(type => {
            button.addEventListener(type, shut, { passive: true });
        });
        ['pointerleave', 'pointercancel', 'blur'].forEach(type => {
            button.addEventListener(type, open);
        });
        button.addEventListener('click', () => {
            this.smileyLocked = true;
            shut();
        });
    }

    applyLang() {
        // Текущий язык на кнопке и отметка в списке
        const current = LANGS.find(item => item.code === this.lang) || LANGS[0];
        const label = this.$('qm-lang-label');
        if (label) label.textContent = current.flag + ' ' + current.label;

        this.$$('.qm-lang-item').forEach(item => {
            const active = item.dataset.lang === this.lang;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
        });

        // Статичные тексты в разметке раздела — и только в ней
        this.$$('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = this.t(key);
            } else {
                el.innerText = this.t(key);
            }
        });

        // Динамические элементы.
        // Набранный, но ещё не сохранённый текст дверей переживает смену языка.
        const typedDoors = Array.from(document.querySelectorAll('.door-text-input')).map(inp => inp.value);
        this.renderSetupInputs(typedDoors.length || parseInt(document.getElementById('doors-count-select').value));
        if (typedDoors.length) {
            document.querySelectorAll('.door-text-input').forEach((inp, i) => {
                if (typeof typedDoors[i] === 'string') inp.value = typedDoors[i];
            });
        }

        const closeBtn = document.getElementById('btn-space-close');
        if (closeBtn) {
            closeBtn.setAttribute('aria-label', this.t('btnCloseSection'));
            closeBtn.title = this.t('btnCloseSection');
        }

        const gear = this.$('btn-gear');
        if (gear) {
            gear.setAttribute('aria-label', this.t('btnSettings'));
            gear.title = this.t('btnSettings');
        }

        this.renderChronicles();
        this.updateSnoozeButtonUI();
        this.updateSpeedUI();
    }

    initUI() {
        // Кнопка Старт с золотым салютом
        document.getElementById('btn-start-app').addEventListener('click', () => {
            this.triggerSandShower(() => this.checkFirstTimeOrCorridor());
        });

        // Настройки реальностей
        document.getElementById('btn-open-settings').addEventListener('click', (e) => {
            e.preventDefault();
            this.openSettingsScreen();
        });
        document.getElementById('btn-edit-from-s5').addEventListener('click', () => this.openSettingsScreen());

        // Шестерёнка на главном экране: тот же экран настройки
        const gear = this.$('btn-gear');
        if (gear) gear.addEventListener('click', () => this.openSettingsScreen());
        document.getElementById('doors-count-select').addEventListener('change', (e) => this.renderSetupInputs(parseInt(e.target.value)));

        // Панели аудио пересоздаются при каждой перерисовке дверей,
        // поэтому слушаем контейнер, а не каждую кнопку по отдельности.
        const doorsBox = document.getElementById('doors-inputs-container');
        doorsBox.addEventListener('click', (e) => this.onDoorAudioClick(e));
        doorsBox.addEventListener('change', (e) => this.onDoorAudioFile(e));

        // Значок готовности зажигается сразу, как в поле появился текст
        doorsBox.addEventListener('input', (e) => {
            if (!e.target.classList.contains('door-text-input')) return;
            const row = e.target.closest('.qm-door-row');
            if (row) this.updateDoorStatus(row);
        });
        document.getElementById('btn-save-setup').addEventListener('click', () => this.saveSettingsAndStart());
        document.getElementById('btn-cancel-setup').addEventListener('click', () => this.showScreen('screen-1'));

        // Переключения табов скорости на экране Настройка реальности
        document.querySelectorAll('.speed-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const btn = e.target.closest('.speed-tab');
                if (btn) {
                    this.selectedSpeed = parseInt(btn.getAttribute('data-speed'));
                    this.updateSpeedUI();
                }
            });
        });

        // Переходы между экранами
        // Левая зона: отсчёт без звука. Правая: отсчёт и следом аудио двери.
        document.getElementById('btn-s3').addEventListener('click', () => this.handleEyeCloseTransition(false));
        const playZone = document.getElementById('btn-s3-play');
        if (playZone) playZone.addEventListener('click', () => this.handleEyeCloseTransition(true));
        document.getElementById('btn-s4-save').addEventListener('click', () => this.saveDiaryEntry());
        document.getElementById('btn-snooze').addEventListener('click', () => this.handleSnooze());

        // Крестик не закрывает раздел сам: он лишь сообщает об этом наружу,
        // а что делать дальше — решает тот, кто модуль подключил.
        const closeBtn = document.getElementById('btn-space-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.rootEl) {
                    this.rootEl.dispatchEvent(new CustomEvent('qm-close', { bubbles: true }));
                }
            });
        }

        // Кнопки модального окна "Окно возможностей открыто"
        document.getElementById('btn-modal-start').addEventListener('click', () => {
            this.hideOpportunityModal();
            this.triggerSandShower(() => this.checkFirstTimeOrCorridor());
        });

        document.getElementById('btn-modal-later').addEventListener('click', () => {
            this.hideOpportunityModal();
        });
    }

    updateSpeedUI() {
        document.querySelectorAll('.speed-tab').forEach(tab => {
            const spd = parseInt(tab.getAttribute('data-speed'));
            tab.classList.toggle('active', spd === this.selectedSpeed);
        });

        const instructionBox = document.getElementById('speed-instruction-text');
        if (instructionBox) {
            const key = this.selectedSpeed === 1 ? 'speedOption1Text' : 'speedOption2Text';
            instructionBox.innerText = this.t(key);
        }
    }

    /**
     * Закрытие глаз и отсчёт до трёх.
     * @param {boolean} withAudio запускать ли аудио двери по окончании отсчёта
     */
    handleEyeCloseTransition(withAudio) {
        const countdownOverlay = document.getElementById('countdown-overlay');
        const countdownNum = document.getElementById('countdown-num');
        const blackout = document.getElementById('blackout-screen');

        if (!countdownOverlay || !countdownNum || !blackout) {
            if (withAudio) this.playCurrentDoorAudio();
            this.showScreen('screen-4');
            return;
        }

        let count = 1;
        countdownNum.innerText = count.toString();
        countdownOverlay.classList.remove('hidden');

        this.countTimer = setInterval(() => {
            count++;
            if (count <= 3) {
                countdownNum.innerText = count.toString();
                countdownNum.style.animation = 'none';
                void countdownNum.offsetWidth;
                countdownNum.style.animation = 'qmCountPulse 0.8s ease-out';
            } else {
                clearInterval(this.countTimer);

                // Отсчёт кончился — аудио стартует здесь, параллельно
                // с уходом экрана в затемнение.
                if (withAudio) this.playCurrentDoorAudio();

                blackout.classList.remove('hidden');
                blackout.classList.add('active');

                this.later(() => {
                    countdownOverlay.classList.add('hidden');
                    blackout.classList.remove('active');
                    blackout.classList.add('hidden');
                    this.showScreen('screen-4');
                }, 1200);
            }
        }, 1000);
    }

    initSandFX() {
        this.sandCanvas = document.getElementById('sand-canvas');
        this.sandCtx = this.sandCanvas.getContext('2d');
        this.resizeSandCanvas();
        this._onResize = () => this.resizeSandCanvas();
        window.addEventListener('resize', this._onResize);
    }

    resizeSandCanvas() {
        this.sandCanvas.width = window.innerWidth;
        this.sandCanvas.height = window.innerHeight;
    }

    triggerSandShower(callback) {
        const particles = [];
        const count = 150;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 18,
                vy: (Math.random() - 0.8) * 18,
                size: Math.random() * 4 + 2,
                alpha: 1
            });
        }

        let frames = 0;
        const animate = () => {
            if (this._destroyed) return;

            this.sandCtx.clearRect(0, 0, this.sandCanvas.width, this.sandCanvas.height);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.3;
                p.alpha -= 0.015;

                this.sandCtx.fillStyle = `rgba(216, 166, 63, ${Math.max(0, p.alpha)})`;
                this.sandCtx.beginPath();
                this.sandCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.sandCtx.fill();
            });

            frames++;
            if (frames < 50) {
                requestAnimationFrame(animate);
            } else {
                this.sandCtx.clearRect(0, 0, this.sandCanvas.width, this.sandCanvas.height);
                if (callback) callback();
            }
        };
        animate();
    }

    /* Двери уже настроены — сразу в коридор. Настройка открывается сама
       только при самом первом входе, когда дверей ещё нет. Поправить их в
       любой другой момент можно шестерёнкой на главном экране. */
    checkFirstTimeOrCorridor() {
        if (this.realities.length >= CONFIG.doors.min) {
            this.startCorridorScreen();
        } else {
            this.openSettingsScreen();
        }
    }

    openSettingsScreen() {
        const count = Math.max(CONFIG.doors.min, Math.min(CONFIG.doors.max, this.realities.length || 7));
        document.getElementById('doors-count-select').value = count.toString();
        this.renderSetupInputs(count);
        this.showScreen('screen-setup');
    }

    renderSetupInputs(count) {
        const container = document.getElementById('doors-inputs-container');
        container.innerHTML = '';
        this.syncDoorIds(count);

        for (let i = 0; i < count; i++) {
            const val = this.realities[i] || '';
            const placeholderText = this.t('doorPlaceholder').replace('{i}', i + 1);

            const row = document.createElement('div');
            row.className = 'qm-door-row';
            row.dataset.doorId = this.doorIds[i];
            row.dataset.hasAudio = '0';
            row.dataset.photoCount = '0';

            const head = document.createElement('div');
            head.className = 'qm-door-head';

            // Поле создаётся элементом, а не строкой HTML: кавычки и угловые
            // скобки в тексте намерения больше не ломают разметку.
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'door-text-input';
            input.placeholder = placeholderText;
            input.value = val;
            head.appendChild(input);

            // Значок готовности. Загорается, как только в двери появилось
            // хоть что-то: текст, запись или фотография.
            const badge = document.createElement('span');
            badge.className = 'qm-door-badge';
            badge.textContent = this.t('doorReady');
            badge.hidden = true;
            head.appendChild(badge);

            row.appendChild(head);
            row.appendChild(this.buildDoorMedia());
            container.appendChild(row);
        }

        this.refreshAudioControls();
    }

    /* ---------- Аудио дверей ---------- */

    makeDoorId() {
        return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // Список id всегда не короче списка дверей
    syncDoorIds(count) {
        while (this.doorIds.length < count) this.doorIds.push(this.makeDoorId());
    }

    /* Панель под полем двери: запись с микрофона, звуковой файл,
       фотографии, состояние записи и лента снимков.

       Вместо прежней надписи «Добавить аудио» — плашки со значками. Во
       время записи левая плашка превращается в таймер. */
    buildDoorMedia() {
        const box = document.createElement('div');
        box.className = 'qm-media';

        const actions = document.createElement('div');
        actions.className = 'qm-media-actions';

        const record = document.createElement('button');
        record.type = 'button';
        record.className = 'qm-chip qm-chip-rec';
        record.dataset.act = 'record';

        const dot = document.createElement('span');
        dot.className = 'qm-ico qm-ico-mic';
        dot.setAttribute('aria-hidden', 'true');
        record.appendChild(dot);

        const recText = document.createElement('span');
        recText.className = 'qm-chip-text';
        recText.textContent = this.t('audioRecord');
        record.appendChild(recText);

        if (!canRecord()) {
            record.disabled = true;
            record.title = this.t('audioNoRecorder');
        }
        actions.appendChild(record);

        actions.appendChild(this.buildPickChip('file', 'audio/*', false, 'qm-ico-file', this.t('audioPickFile')));

        const photoChip = this.buildPickChip('photo', 'image/*', true, 'qm-ico-photo', this.t('photoAdd'));
        const counter = document.createElement('span');
        counter.className = 'qm-photo-count';
        counter.textContent = '0/' + PHOTO_LIMIT;
        photoChip.appendChild(counter);
        actions.appendChild(photoChip);

        box.appendChild(actions);

        const state = document.createElement('div');
        state.className = 'qm-media-state';

        const info = document.createElement('span');
        info.className = 'qm-audio-info';
        state.appendChild(info);

        state.appendChild(this.buildIconButton('preview', 'qm-audio-preview', this.t('audioPlay')));
        state.appendChild(this.buildIconButton('remove', 'qm-audio-remove', this.t('audioRemove')));
        box.appendChild(state);

        const strip = document.createElement('div');
        strip.className = 'qm-photo-strip';
        box.appendChild(strip);

        return box;
    }

    // Плашка, за которой спрятан выбор файла: по нажатию открывается
    // системный проводник, отдельной кнопки для этого не нужно.
    buildPickChip(act, accept, multiple, iconClass, label) {
        const chip = document.createElement('label');
        chip.className = 'qm-chip';

        const icon = document.createElement('span');
        icon.className = 'qm-ico ' + iconClass;
        icon.setAttribute('aria-hidden', 'true');
        chip.appendChild(icon);

        const text = document.createElement('span');
        text.className = 'qm-chip-text';
        text.textContent = label;
        chip.appendChild(text);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.hidden = true;
        input.dataset.act = act;
        chip.appendChild(input);

        return chip;
    }

    buildIconButton(act, extraClass, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'qm-icon-btn ' + extraClass;
        button.dataset.act = act;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.hidden = true;
        return button;
    }

    /* Дверь заполнена, если есть хоть что-то: текст, запись ИЛИ фотография.
       Одного аудио достаточно — так в задании. */
    updateDoorStatus(row) {
        const input = row.querySelector('.door-text-input');
        const badge = row.querySelector('.qm-door-badge');

        const hasText = Boolean(input && input.value.trim());
        const hasAudio = row.dataset.hasAudio === '1';
        const hasPhoto = Number(row.dataset.photoCount || 0) > 0;
        const ready = hasText || hasAudio || hasPhoto;

        row.classList.toggle('qm-door-ready', ready);
        if (badge) badge.hidden = !ready;
    }

    /* Лента снимков двери с кнопкой «убрать» на каждом. */
    async refreshPhotoStrip(row) {
        const strip = row.querySelector('.qm-photo-strip');
        const counter = row.querySelector('.qm-photo-count');
        if (!strip) return;

        const photos = await getDoorPhotos(row.dataset.doorId);
        if (this._destroyed || !row.isConnected) return;

        this.releasePhotoUrls(strip);
        strip.innerHTML = '';

        for (const photo of photos) {
            const cell = document.createElement('div');
            cell.className = 'qm-photo-cell';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(photo.blob);
            img.alt = photo.fileName;
            cell.appendChild(img);

            const drop = document.createElement('button');
            drop.type = 'button';
            drop.className = 'qm-photo-drop';
            drop.dataset.act = 'photo-remove';
            drop.dataset.photoId = photo.id;
            drop.title = this.t('photoRemove');
            drop.setAttribute('aria-label', this.t('photoRemove'));
            cell.appendChild(drop);

            strip.appendChild(cell);
        }

        if (counter) counter.textContent = photos.length + '/' + PHOTO_LIMIT;
        row.dataset.photoCount = String(photos.length);
        this.updateDoorStatus(row);
    }

    // Ссылки на картинки отпускаем при замене ленты: иначе снимки копились
    // бы в памяти при каждой перерисовке дверей.
    releasePhotoUrls(strip) {
        strip.querySelectorAll('img').forEach(img => {
            if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        });
    }

    /* Таймер записи.

       Показывает, сколько уже пишется, и ведёт круговой указатель — полный
       оборот за минуту. Длительность записи не ограничена, поэтому это
       именно указатель хода, а не полоса до конца. */
    startRecTimer(row) {
        this.stopRecTimer();

        const record = row.querySelector('[data-act="record"]');
        const text = record ? record.querySelector('.qm-chip-text') : null;
        if (!record || !text) return;

        const startedAt = Date.now();
        const tick = () => {
            const seconds = Math.floor((Date.now() - startedAt) / 1000);
            text.textContent = formatDuration(seconds * 1000) || '0:00';
            record.style.setProperty('--qm-rec-turn', ((seconds % 60) / 60).toFixed(3));
        };

        tick();
        this.recTimer = setInterval(tick, 250);
    }

    stopRecTimer() {
        if (this.recTimer) {
            clearInterval(this.recTimer);
            this.recTimer = null;
        }
    }

    // Читает хранилище и расставляет состояние у всех дверей сразу
    async refreshAudioControls() {
        const rows = Array.from(this.$$('.qm-door-row'));
        for (const row of rows) {
            const meta = await getDoorAudioMeta(row.dataset.doorId);
            if (this._destroyed || !row.isConnected) return;
            this.applyAudioState(row, meta);

            await this.refreshPhotoStrip(row);
            if (this._destroyed || !row.isConnected) return;
        }
    }

    applyAudioState(row, meta) {
        const info = row.querySelector('.qm-audio-info');
        const preview = row.querySelector('.qm-audio-preview');
        const remove = row.querySelector('.qm-audio-remove');
        const record = row.querySelector('[data-act="record"]');
        const recText = record ? record.querySelector('.qm-chip-text') : null;
        const isRecording = this.recordingDoorId === row.dataset.doorId;

        row.dataset.hasAudio = meta ? '1' : '0';

        if (record && !record.disabled) {
            record.classList.toggle('qm-chip-rec-on', isRecording);
            // Во время записи подпись ведёт таймер, трогать её здесь нельзя
            if (recText && !isRecording) recText.textContent = this.t('audioRecord');
        }

        if (isRecording) {
            info.textContent = this.t('recElapsed');
            preview.hidden = true;
            remove.hidden = true;
            this.updateDoorStatus(row);
            return;
        }

        if (meta) {
            const length = formatDuration(meta.durationMs);
            info.textContent = meta.fileName + (length ? ' · ' + length : '');
            preview.hidden = false;
            remove.hidden = false;
        } else {
            // Пусто: о том, что можно добавить, говорят сами плашки
            info.textContent = '';
            preview.hidden = true;
            remove.hidden = true;
        }

        this.updateDoorStatus(row);
    }

    onDoorAudioClick(event) {
        const button = event.target.closest('[data-act]');
        if (!button || button.tagName === 'INPUT') return;

        const row = button.closest('.qm-door-row');
        if (!row) return;

        const act = button.dataset.act;
        if (act === 'record') this.toggleRecording(row);
        else if (act === 'preview') this.previewDoorAudio(row);
        else if (act === 'remove') this.removeDoorAudio(row);
        else if (act === 'photo-remove') this.removeDoorPhoto(row, button.dataset.photoId);
    }

    async removeDoorPhoto(row, photoId) {
        if (!photoId) return;
        await deleteDoorPhoto(row.dataset.doorId, photoId);
        if (this._destroyed || !row.isConnected) return;
        await this.refreshPhotoStrip(row);
    }

    async onDoorAudioFile(event) {
        const input = event.target;
        if (!input || !input.dataset) return;

        const row = input.closest('.qm-door-row');
        if (!row) return;

        if (input.dataset.act === 'file') {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;

            const meta = await saveDoorAudio(row.dataset.doorId, file, file.name);
            if (this._destroyed || !row.isConnected) return;
            this.applyAudioState(row, meta);
            return;
        }

        if (input.dataset.act === 'photo') {
            const files = Array.from(input.files || []);
            input.value = '';
            if (files.length === 0) return;

            // Лишние сверх трёх плагин отбрасывает сам и говорит сколько
            const { skipped } = await addDoorPhotos(row.dataset.doorId, files);
            if (this._destroyed || !row.isConnected) return;

            await this.refreshPhotoStrip(row);
            if (skipped > 0) alert(this.t('photoLimitReached'));
        }
    }

    async toggleRecording(row) {
        const doorId = row.dataset.doorId;

        // Второе нажатие по той же двери останавливает запись и сохраняет её
        if (this.recorder && this.recordingDoorId === doorId) {
            const recorder = this.recorder;
            this.recorder = null;
            this.recordingDoorId = null;

            this.stopRecTimer();
            const blob = await recorder.stop();
            const stamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const meta = await saveDoorAudio(doorId, blob, this.t('audioRecord') + ' ' + stamp);
            if (this._destroyed || !row.isConnected) return;
            this.applyAudioState(row, meta);
            return;
        }

        if (this.recorder) return;   // уже пишем другую дверь

        try {
            this.recorder = await startRecording();
            this.recordingDoorId = doorId;
            this.applyAudioState(row, null);
            this.startRecTimer(row);
        } catch (err) {
            console.error('[space] микрофон недоступен:', err);
            this.stopRecTimer();
            this.recorder = null;
            this.recordingDoorId = null;
            alert(this.t('audioNoMic'));
        }
    }

    async previewDoorAudio(row) {
        const record = await getDoorAudio(row.dataset.doorId);
        if (!record || this._destroyed) return;

        this.stopDoorAudio();
        this.audioUrl = URL.createObjectURL(record.blob);
        this.audioEl = new Audio(this.audioUrl);
        this.audioEl.onended = () => this.stopDoorAudio();
        this.audioEl.play().catch(() => this.stopDoorAudio());
    }

    async removeDoorAudio(row) {
        await deleteDoorAudio(row.dataset.doorId);
        if (this._destroyed || !row.isConnected) return;
        this.applyAudioState(row, null);
    }

    // Зона «Play» включается, только если у выбранной двери есть запись
    async prepareDoorAudio() {
        const play = document.getElementById('btn-s3-play');
        const warn = document.getElementById('txt-s3-audio-warn');
        if (!play || !warn) return;

        play.hidden = true;
        warn.hidden = true;
        this.currentAudioRecord = null;
        if (!this.currentDoorId) return;

        const record = await getDoorAudio(this.currentDoorId);
        if (this._destroyed || !play.isConnected) return;

        if (record && record.blob && record.blob.size > 0) {
            this.currentAudioRecord = record;
            play.hidden = false;
            play.setAttribute('aria-label', this.t('audioPlayAria'));
        } else if (record) {
            // Запись числится за дверью, но файл пуст или испорчен
            this.showAudioWarning();
        }
    }

    showAudioWarning() {
        const warn = document.getElementById('txt-s3-audio-warn');
        const play = document.getElementById('btn-s3-play');
        if (warn) {
            warn.textContent = this.t('audioMissing');
            warn.hidden = false;
        }
        if (play) play.hidden = true;
    }

    // Аудио выбранной двери. Играет до конца, экран ему не мешает.
    playCurrentDoorAudio() {
        const record = this.currentAudioRecord;
        if (!record) return;

        this.stopDoorAudio();

        try {
            this.audioUrl = URL.createObjectURL(record.blob);
            this.audioEl = new Audio(this.audioUrl);
            this.audioEl.onended = () => this.stopDoorAudio();
            this.audioEl.onerror = () => {
                this.showAudioWarning();
                this.stopDoorAudio();
            };

            // При входящем звонке браузер сам ставит воспроизведение на паузу.
            // Сами его не возобновляем — это делает человек.
            const started = this.audioEl.play();
            if (started && started.catch) started.catch(() => this.showAudioWarning());
        } catch (err) {
            console.error('[space] не удалось включить аудио:', err);
            this.showAudioWarning();
        }
    }

    stopDoorAudio() {
        if (this.audioEl) {
            this.audioEl.pause();
            this.audioEl.onended = null;
            this.audioEl.onerror = null;
            this.audioEl = null;
        }
        if (this.audioUrl) {
            URL.revokeObjectURL(this.audioUrl);
            this.audioUrl = null;
        }
    }

    saveSettingsAndStart() {
        // Идём по строкам, а не по полям: так текст двери и её id остаются
        // одной парой, и пустые двери выпадают вместе со своими id.
        const rows = Array.from(document.querySelectorAll('.qm-door-row'));
        const kept = [];

        for (const row of rows) {
            const input = row.querySelector('.door-text-input');
            const text = input ? input.value.trim() : '';
            const hasAudio = row.dataset.hasAudio === '1';
            const hasPhoto = Number(row.dataset.photoCount || 0) > 0;

            // Дверь живёт, если в ней есть хоть что-то. У двери без текста
            // должно остаться имя — иначе в коридоре она была бы безымянной.
            if (text === '' && !hasAudio && !hasPhoto) continue;

            kept.push({
                id: row.dataset.doorId,
                text: text || this.t('doorNoName').replace('{i}', String(kept.length + 1))
            });
        }

        if (kept.length < CONFIG.doors.min) {
            alert(this.t('doorMinAlert').replace('{min}', CONFIG.doors.min));
            return;
        }

        this.realities = kept.map(door => door.text);
        this.doorIds = kept.map(door => door.id);
        localStorage.setItem('quantum_doors_texts', JSON.stringify(this.realities));
        localStorage.setItem('quantum_doors_ids', JSON.stringify(this.doorIds));
        this.startCorridorScreen();
    }

    startCorridorScreen() {
        this.showScreen(null);

        if (!this.scene3D) {
            this.scene3D = new QuantumCorridorScene(
                document.getElementById('three-canvas'),
                (idx, txt) => this.onDoorChosen(idx, txt)
            );
        }

        this.scene3D.setupRealities(this.shuffleDoors());
        this.scene3D.startAnimation();

        let timeLeft = CONFIG.timing.quantumWindowSeconds;
        document.getElementById('hud-timer-val').innerText = timeLeft.toFixed(1);

        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = setInterval(() => {
            timeLeft -= 0.1;
            document.getElementById('hud-timer-val').innerText = Math.max(0, timeLeft).toFixed(1);

            if (timeLeft <= 0) {
                clearInterval(this.countdownInterval);
                if (this.scene3D) this.scene3D.isRunning = false;
                this.renderChronicles();
                this.showScreen('screen-5');
            }
            if (this.scene3D && this.scene3D.isSelecting) {
                clearInterval(this.countdownInterval);
            }
        }, 100);
    }

    /* СЛЕПОЙ ВЫБОР.

       Перед каждым входом содержимое дверей тасуется, поэтому запомнить,
       за какой дверью что лежит, нельзя. Тасуется только порядок показа:
       сами двери, их записи и фотографии остаются на своих местах. Обратная
       дорожка doorOrder помнит, какой слот куда встал, — по ней находится и
       аудио двери, и её место в сводке.

       Перемешивание Фишера — Йетса: каждый порядок равновероятен. */
    shuffleDoors() {
        const order = this.realities.map((_, slot) => slot);

        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const keep = order[i];
            order[i] = order[j];
            order[j] = keep;
        }

        this.doorOrder = order;
        return order.map(slot => this.realities[slot]);
    }

    // Какой слот стоит на этом месте в коридоре
    slotOfDoor(index) {
        if (Array.isArray(this.doorOrder) && Number.isInteger(this.doorOrder[index])) {
            return this.doorOrder[index];
        }
        return index;
    }

    onDoorChosen(index, text) {
        // Новая дверь — смайлик снова открывает глаза
        this.smileyLocked = false;
        const eyes = this.$('btn-s3');
        if (eyes) eyes.classList.remove('qm-eyes-shut');

        // index — место в коридоре, а двери перетасованы: берём слот
        const slot = this.slotOfDoor(index);
        this.currentSlot = slot;

        this.currentChosenText = text;
        this.currentDoorId = this.doorIds[slot] || null;
        document.getElementById('txt-s3-chosen-reality').innerText = text;
        this.updateSpeedUI();
        this.showScreen('screen-3');
        this.prepareDoorAudio();
    }

    saveDiaryEntry() {
        const trace = document.getElementById('input-s4-diary').value.trim();

        /* ts и doorId нужны сводке.

           ts — чтобы отделить сутки от всего времени; раньше в записи была
           только строка с датой, по ней не посчитаешь.

           doorId — чтобы считать по самой двери, а не по её названию:
           переименовал дверь, и статистика продолжилась под новым именем,
           а не завелась заново. */
        this.history.unshift({
            ts: Date.now(),
            slot: Number.isInteger(this.currentSlot) ? this.currentSlot : null,
            doorId: this.currentDoorId || null,
            dateStr: new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
            reality: this.currentChosenText,
            trace: trace || this.t('emptyTrace')
        });

        localStorage.setItem('quantum_akashi_chronicles', JSON.stringify(this.history));
        localStorage.setItem('last_quantum_jump_time', Date.now().toString());
        this.notifications.resetSnooze();

        document.getElementById('input-s4-diary').value = '';
        this.renderChronicles();
        this.showScreen('screen-5');
    }

    /* Хроники: сутки подробно, всё остальное — сводкой.

       Длинный список всех переходов разрастался в простыню, по которой
       ничего не видно. Теперь сверху — что было за последние сутки, ниже —
       сколько раз открывалась каждая дверь и какую долю это составляет. */
    renderChronicles() {
        const list = document.getElementById('chronicles-list');
        if (!list) return;

        if (this.history.length === 0) {
            list.innerHTML = `<p class="qm-empty">${this.escapeHtml(this.t('noRecords'))}</p>`;
            return;
        }

        list.innerHTML = this.renderRecentChronicles() + this.renderChronicleStats();
    }

    /* Ключ записи для сводки.

       Считаем по номеру слота: дверь — это место в списке, а не строка с
       названием. Переписал намерение в первой двери — счёт продолжился,
       просто под новым названием, а не завёлся заново.

       Записи, сделанные раньше, разбираем по старым приметам: сначала id
       двери (его ещё можно привести к слоту), потом текст. */
    statKeyOf(item) {
        if (Number.isInteger(item.slot)) return 'slot:' + item.slot;

        if (item.doorId) {
            const at = this.doorIds.indexOf(item.doorId);
            return at !== -1 ? 'slot:' + at : 'door:' + item.doorId;
        }

        return 'text:' + (item.reality || '');
    }

    // Нынешнее название слота; для старых записей — то, что в них записано
    statNameOf(key, fallback) {
        if (key.indexOf('slot:') === 0) {
            const slot = Number(key.slice(5));
            if (this.realities[slot]) return this.realities[slot];
        }
        return fallback || this.t('emptyTrace');
    }

    renderRecentChronicles() {
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const fresh = this.history.filter(item => Number(item.ts) >= since);

        // Тексты человека экранируются: кавычки и символы < > больше не
        // ломают карточку и не могут выполнить разметку.
        const body = fresh.length === 0
            ? `<p class="qm-empty">${this.escapeHtml(this.t('chroniclesNoneDay'))}</p>`
            : fresh.map(item => `
            <div class="chronicle-card">
                <div class="chronicle-date">${this.escapeHtml(item.dateStr)}</div>
                <div class="chronicle-reality">${this.escapeHtml(this.t('akashiAct'))}<br>${this.escapeHtml(this.statNameOf(this.statKeyOf(item), item.reality))}</div>
                <div class="chronicle-trace">${this.escapeHtml(this.t('akashiTrace'))}<br>«${this.escapeHtml(item.trace)}»</div>
            </div>`).join('');

        return `<section class="qm-chron-section">
            <h4 class="qm-chron-head">${this.escapeHtml(this.t('chronicles24h'))}</h4>
            ${body}
        </section>`;
    }

    renderChronicleStats() {
        const counts = new Map();

        for (const item of this.history) {
            const key = this.statKeyOf(item);
            const row = counts.get(key) || { key, count: 0, fallback: item.reality || '' };
            row.count += 1;
            counts.set(key, row);
        }

        const total = this.history.length;
        const rows = Array.from(counts.values()).sort((a, b) => b.count - a.count);

        const body = rows.map(row => {
            const share = Math.round((row.count / total) * 100);
            const name = this.statNameOf(row.key, row.fallback);
            // share — наше собственное число, в разметку идёт без него не обойтись
            return `<div class="qm-stat-row">
                <div class="qm-stat-top">
                    <span class="qm-stat-name">${this.escapeHtml(name)}</span>
                    <span class="qm-stat-count">${row.count} ${this.escapeHtml(this.plural(row.count))} · ${share}%</span>
                </div>
                <div class="qm-stat-bar"><span style="width:${share}%"></span></div>
            </div>`;
        }).join('');

        return `<section class="qm-chron-section">
            <h4 class="qm-chron-head">${this.escapeHtml(this.t('chroniclesAll'))}</h4>
            ${body}
        </section>`;
    }

    /* Склонение числа открытий: русскому и украинскому нужны три формы,
       английскому две — там вторая и третья в словаре совпадают. */
    plural(n) {
        if (this.lang === 'en') return this.t(n === 1 ? 'chroniclesTimesOne' : 'chroniclesTimesMany');

        const hundreds = Math.abs(n) % 100;
        const tens = hundreds % 10;

        if (hundreds > 10 && hundreds < 20) return this.t('chroniclesTimesMany');
        if (tens === 1) return this.t('chroniclesTimesOne');
        if (tens >= 2 && tens <= 4) return this.t('chroniclesTimesFew');
        return this.t('chroniclesTimesMany');
    }

    handleSnooze() {
        if (this.notifications.snooze()) {
            this.updateSnoozeButtonUI();
            alert(this.t('snoozeAlertOk'));
        } else {
            alert(this.t('snoozeAlertLimit'));
        }
    }

    updateSnoozeButtonUI() {
        const btn = document.getElementById('btn-snooze');
        if (this.notifications.canSnooze()) {
            btn.classList.remove('hidden');
            btn.innerText = `${this.t('btnSnooze')} (${3 - this.notifications.snoozeCount}/3)`;
        } else {
            btn.classList.add('hidden');
        }
    }

    showOpportunityModal() {
        const modal = document.getElementById('modal-opportunity');
        if (modal) modal.classList.remove('hidden');
    }

    hideOpportunityModal() {
        const modal = document.getElementById('modal-opportunity');
        if (modal) modal.classList.add('hidden');
    }

    checkScheduleAndTimer() {
        this.scheduleInterval = setInterval(() => {
            const last = parseInt(localStorage.getItem('last_quantum_jump_time') || '0');
            const now = Date.now();

            if (last === 0) {
                const disp = document.getElementById('s5-cooldown-timer');
                if (disp) disp.innerText = this.t('windowOpen');
                return;
            }

            const timeSinceLast = now - last;
            const cooldownRemaining = CONFIG.timing.jumpCooldownMs - timeSinceLast;
            const disp = document.getElementById('s5-cooldown-timer');

            if (cooldownRemaining > 0) {
                this.windowTriggered = false;
                if (disp) {
                    const hours = Math.floor(cooldownRemaining / (1000 * 60 * 60)).toString().padStart(2, '0');
                    const mins = Math.floor((cooldownRemaining % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
                    const secs = Math.floor((cooldownRemaining % (1000 * 60)) / 1000).toString().padStart(2, '0');
                    disp.innerText = `${this.t('timerPrefix')}${hours}:${mins}:${secs}`;
                    this.updateSnoozeButtonUI();
                }
            } else {
                // Окно возможностей открыто
                const elapsedWindowMs = timeSinceLast - CONFIG.timing.jumpCooldownMs;

                if (elapsedWindowMs < CONFIG.timing.opportunityWindowMs) {
                    const totalElapsedSec = Math.floor(elapsedWindowMs / 1000);
                    const mins = Math.floor(totalElapsedSec / 60);
                    const secs = totalElapsedSec % 60;

                    const modalTimerVal = document.getElementById('modal-timer-val');
                    if (modalTimerVal) {
                        modalTimerVal.innerText = `${mins}мин ${secs}сек`;
                    }

                    if (disp) {
                        disp.innerText = this.t('windowOpen');
                        const snoozeBtn = document.getElementById('btn-snooze');
                        if (snoozeBtn) snoozeBtn.classList.add('hidden');
                    }

                    if (!this.windowTriggered) {
                        this.windowTriggered = true;
                        this.showOpportunityModal();
                        this.notifications.triggerQuantumWindowNotification();
                    }
                } else {
                    // Окно пропущено, цикл сбрасывается
                    localStorage.setItem('last_quantum_jump_time', Date.now().toString());
                    this.windowTriggered = false;
                    this.hideOpportunityModal();
                }
            }
        }, 1000);
    }

    showScreen(screenKey) {
        document.querySelectorAll('.qm-screen').forEach(el => el.classList.add('hidden'));

        const timer = document.getElementById('hud-timer');
        const langSwitcher = document.getElementById('lang-switcher-container');

        // Режим погружения: 3D-коридор занимает весь экран, остальные
        // экраны живут внутри карточки раздела «Квант».
        if (this.rootEl && this.rootEl.classList) {
            this.rootEl.classList.toggle('qm-immersive', screenKey === null);
        }

        // Шестерёнка нужна только на главном экране
        const gear = this.$('btn-gear');
        if (gear) gear.hidden = screenKey !== 'screen-1';

        if (screenKey) {
            document.getElementById(screenKey).classList.remove('hidden');
            timer.classList.add('hidden');
            if (langSwitcher) langSwitcher.classList.remove('hidden');
        } else {
            timer.classList.remove('hidden');
            if (langSwitcher) langSwitcher.classList.add('hidden');
        }
    }

    // Полная остановка модуля при уходе с раздела
    destroy() {
        this._destroyed = true;

        if (this._raf) cancelAnimationFrame(this._raf);
        clearInterval(this.countdownInterval);
        clearInterval(this.scheduleInterval);
        clearInterval(this.countTimer);
        this._timeouts.forEach(clearTimeout);
        this._timeouts = [];

        if (this._onResize) window.removeEventListener('resize', this._onResize);

        this.stopDoorAudio();
        this.stopRecTimer();
        this.$$('.qm-photo-strip').forEach(strip => this.releasePhotoUrls(strip));
        if (this.recorder) {
            this.recorder.stop().catch(() => {});
            this.recorder = null;
            this.recordingDoorId = null;
        }

        if (this.scene3D) {
            this.scene3D.isRunning = false;
            if (this.scene3D.hand && this.scene3D.hand.parentNode) {
                this.scene3D.hand.parentNode.removeChild(this.scene3D.hand);
            }
            if (this.scene3D.renderer) this.scene3D.renderer.dispose();
            this.scene3D = null;
        }
    }
}
