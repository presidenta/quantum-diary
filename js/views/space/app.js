/* Механика раздела: экраны, таймеры, двери, дневник, хроники.

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».
   Модуль изолирован: кроме этой папки и двух строк в app.js он ничего
   в Ежедневнике не трогает. */

import { CONFIG } from './config.js';
import { NotificationManager } from './notifications.js';
import { QuantumCorridorScene } from './scene.js';

export class QuantumApp {
    constructor(rootEl) {
        this.rootEl = rootEl || null;   // корень модуля (.qm-root)
        this._destroyed = false;
        this._raf = null;
        this._timeouts = [];

        this.lang = localStorage.getItem('quantum_lang') || 'ru';
        this.realities = JSON.parse(localStorage.getItem('quantum_doors_texts') || '[]');
        this.history = JSON.parse(localStorage.getItem('quantum_akashi_chronicles') || '[]');
        this.notifications = new NotificationManager();
        this.selectedSpeed = 1; // 1: Быстрый переход, 2: Глубокое погружение
        this.windowTriggered = false;

        this.initSandFX();
        this.initInnerQuantums();
        this.initLangSwitcher();
        this.initUI();
        this.applyLang();
        this.checkScheduleAndTimer();
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

    initLangSwitcher() {
        document.querySelectorAll('.qm-lang-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.lang = e.target.getAttribute('data-lang');
                localStorage.setItem('quantum_lang', this.lang);
                this.applyLang();
            });
        });
    }

    applyLang() {
        // Подсветка активной кнопки языка
        document.querySelectorAll('.qm-lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === this.lang);
        });

        // Статичные тексты в HTML
        document.querySelectorAll('[data-i18n]').forEach(el => {
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
        document.getElementById('doors-count-select').addEventListener('change', (e) => this.renderSetupInputs(parseInt(e.target.value)));
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
        document.getElementById('btn-s3').addEventListener('click', () => this.handleEyeCloseTransition());
        document.getElementById('btn-s4-save').addEventListener('click', () => this.saveDiaryEntry());
        document.getElementById('btn-snooze').addEventListener('click', () => this.handleSnooze());

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

    handleEyeCloseTransition() {
        const countdownOverlay = document.getElementById('countdown-overlay');
        const countdownNum = document.getElementById('countdown-num');
        const blackout = document.getElementById('blackout-screen');

        if (!countdownOverlay || !countdownNum || !blackout) {
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
        for (let i = 0; i < count; i++) {
            const val = this.realities[i] || '';
            const placeholderText = this.t('doorPlaceholder').replace('{i}', i + 1);

            // Поле создаётся элементом, а не строкой HTML: кавычки и угловые
            // скобки в тексте намерения больше не ломают разметку.
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'door-text-input';
            input.placeholder = placeholderText;
            input.value = val;
            container.appendChild(input);
        }
    }

    saveSettingsAndStart() {
        const inputs = Array.from(document.querySelectorAll('.door-text-input'));
        const newRealities = inputs.map(i => i.value.trim()).filter(v => v !== '');

        if (newRealities.length < CONFIG.doors.min) {
            alert(this.t('doorMinAlert').replace('{min}', CONFIG.doors.min));
            return;
        }

        this.realities = newRealities;
        localStorage.setItem('quantum_doors_texts', JSON.stringify(this.realities));
        this.startCorridorScreen();
    }

    startCorridorScreen() {
        this.showScreen(null);

        if (!this.scene3D) {
            this.scene3D = new QuantumCorridorScene(
                document.getElementById('three-canvas'),
                (idx, txt) => this.onDoorChosen(txt)
            );
        }

        this.scene3D.setupRealities(this.realities);
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

    onDoorChosen(text) {
        this.currentChosenText = text;
        document.getElementById('txt-s3-chosen-reality').innerText = text;
        this.updateSpeedUI();
        this.showScreen('screen-3');
    }

    saveDiaryEntry() {
        const trace = document.getElementById('input-s4-diary').value.trim();
        this.history.unshift({
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

    renderChronicles() {
        const list = document.getElementById('chronicles-list');
        if (this.history.length === 0) {
            list.innerHTML = `<p class="qm-empty">${this.escapeHtml(this.t('noRecords'))}</p>`;
            return;
        }

        // Тексты пользователя экранируются: кавычки и символы < > больше
        // не ломают карточку и не могут выполнить разметку.
        list.innerHTML = this.history.map(item => `
            <div class="chronicle-card">
                <div class="chronicle-date">${this.escapeHtml(item.dateStr)}</div>
                <div class="chronicle-reality">${this.escapeHtml(this.t('akashiAct'))}<br>${this.escapeHtml(item.reality)}</div>
                <div class="chronicle-trace">${this.escapeHtml(this.t('akashiTrace'))}<br>«${this.escapeHtml(item.trace)}»</div>
            </div>
        `).join('');
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
