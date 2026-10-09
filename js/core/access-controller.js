/* Контроль доступа: дата окончания вместо ежедневного пинга.

   Приложение работает автономно сколько угодно дней, пока дата на устройстве
   меньше даты окончания доступа. Связь с сервером нужна не для разрешения
   работать, а чтобы узнать новую дату и услышать, если администратор закрыл
   доступ вручную.

   Две блокировки, и они разные:

     • администратор закрыл доступ — сервер отвечает 401, 403 или
       status: 'blocked'. Снимается только таким же ответом сервера;
     • срок доступа вышел — на устройстве наступила дата accessUntil.
       Снимается новым ответом сервера с датой в будущем.

   Падение сервера и отсутствие сети блокировкой НЕ считаются: иначе час
   недоступности сервера выключил бы приложение у всех сразу. Решает дата,
   а не наличие связи.

   Безлимит: если сервер прислал accessUntil пустым, доступ бессрочный —
   по дате приложение не заблокируется никогда.

   Базу данных при блокировке НЕ чистим: ложное срабатывание уничтожило бы
   записи дверей безвозвратно.

   ВАЖНО. По умолчанию модуль ВЫКЛЮЧЕН (ACCESS_ENABLED = false) и не делает
   ничего. Включать после проверки на живом сервере. */

/** Главный выключатель. Пока false — модуль спит. */
export const ACCESS_ENABLED = false;

/** Исходы проверки. */
export const ALLOWED = 'allowed';
export const BLOCKED_ADMIN = 'blocked_admin';
export const BLOCKED_EXPIRED = 'blocked_expired';

/* Ответ сервера, отдельно от итогового решения. */
const SERVER_OK = 'ok';
const SERVER_BLOCKED = 'blocked';        // администратор закрыл доступ
const SERVER_EXPIRED = 'expired';        // сервер говорит: срок вышел
const SERVER_UNREACHABLE = 'unreachable';

const KEY_UNTIL = 'access_until';    // число, метка времени; пусто — безлимит
const KEY_STATUS = 'access_status';  // active, blocked и т.п.
const KEY_BLOCK = 'access_block';    // '', 'admin' или 'expired'
const KEY_CLOCK = 'access_clock';    // самое позднее время, которое мы видели

/* Насколько часам устройства позволено отстать от уже виденного времени.
   Обычная правка часов или смена пояса укладывается в эти двенадцать часов,
   а перевод даты на месяц назад — нет. */
const CLOCK_TOLERANCE_MS = 12 * 60 * 60 * 1000;

const UNLIMITED = 'unlimited';

function read(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        /* приватный режим браузера — переживём */
    }
}

/** Приводит значение accessUntil к метке времени или к признаку безлимита. */
function normalizeUntil(value) {
    if (value === null || value === undefined || value === '') return UNLIMITED;
    const ms = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(ms) ? ms : UNLIMITED;
}

export class AccessController {
    /**
     * @param {object} options
     * @param {string} options.apiBase адрес сервера
     * @param {() => Promise<string|null>} options.getToken токен сессии
     * @param {() => Promise<void>|void} [options.cancelAlarms] снять напоминания
     * @param {(kind: string) => void} [options.onBlocked]
     * @param {() => void} [options.onAllowed]
     * @param {boolean} [options.showScreen] показывать экран блокировки
     */
    constructor(options = {}) {
        this.apiBase = options.apiBase || '';
        this.getToken = options.getToken || (async () => null);
        this.cancelAlarms = options.cancelAlarms || (() => {});
        this.onBlocked = options.onBlocked || (() => {});
        this.onAllowed = options.onAllowed || (() => {});
        this.showScreen = options.showScreen !== false;

        this.timer = null;
        this.listeners = [];
        this.checking = false;

        const saved = read(KEY_BLOCK);
        this.blockKind = saved === 'admin' || saved === 'expired' ? saved : '';
    }

    isBlocked() {
        return this.blockKind !== '';
    }

    /** Дата окончания доступа: метка времени или 'unlimited'. */
    accessUntil() {
        const raw = read(KEY_UNTIL);
        if (!raw || raw === UNLIMITED) return UNLIMITED;
        const ms = Number(raw);
        return Number.isFinite(ms) ? ms : UNLIMITED;
    }

    /* ---------- Запуск и остановка ---------- */

    start() {
        if (this.timer) return;

        // Блокировка пережила перезапуск — закрываем сразу, не дожидаясь сети
        if (this.isBlocked() && this.showScreen) this.mountBlockScreen();

        this.checkNow();

        const onOnline = () => this.checkNow();
        const onVisible = () => {
            if (document.visibilityState === 'visible') this.checkNow();
        };
        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisible);
        this.listeners.push(() => window.removeEventListener('online', onOnline));
        this.listeners.push(() => document.removeEventListener('visibilitychange', onVisible));

        // Страховка, если приложение висит открытым сутками: дата окончания
        // может наступить прямо во время работы.
        this.timer = setInterval(() => this.checkNow(), 30 * 60 * 1000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.listeners.forEach(off => off());
        this.listeners = [];
    }

    /* ---------- Проверка ---------- */

    /**
     * Шаг 1 — спросить сервер, если он доступен.
     * Шаг 2 — решить по дате, что бы сервер ни ответил.
     * @returns {Promise<'allowed'|'blocked_admin'|'blocked_expired'>}
     */
    async checkNow() {
        if (this.checking) return this.blockKind || ALLOWED;
        this.checking = true;

        try {
            const answer = await this.askServer();

            if (answer === SERVER_BLOCKED) {
                await this.block('admin');
                return BLOCKED_ADMIN;
            }

            if (answer === SERVER_EXPIRED) {
                await this.block('expired');
                return BLOCKED_EXPIRED;
            }

            // Сервер не ответил — не беда, решает дата на устройстве
            return await this.decideByDate();
        } finally {
            this.checking = false;
            // Экран блокировки могли убрать из разметки — возвращаем на место
            if (this.isBlocked() && this.showScreen) this.mountBlockScreen();
        }
    }

    /* Сторож часов.

       Дата окончания живёт на сервере, и он сам отказывает по ней на каждом
       запросе — подделать её нельзя. Но пока связи нет, решение принимается
       по часам устройства, а их владелец телефона перевести может.

       Запоминаем самое позднее время, которое когда-либо видели. Если часы
       вдруг оказались сильно позади него — им больше не верим и требуем
       ответа сервера.

       @returns {boolean} можно ли доверять часам устройства */
    clockTrustworthy() {
        const now = Date.now();
        const seen = Number(read(KEY_CLOCK)) || 0;

        if (seen && now < seen - CLOCK_TOLERANCE_MS) return false;
        if (now > seen) write(KEY_CLOCK, now);
        return true;
    }

    /** Решение по локально сохранённой дате окончания. */
    async decideByDate() {
        // Часы перевели назад — автономное решение больше не принимаем
        if (!this.clockTrustworthy()) {
            await this.block('expired');
            return BLOCKED_EXPIRED;
        }

        const until = this.accessUntil();

        // Безлимит, либо сервер ещё ни разу не отвечал: по дате не блокируем
        if (until === UNLIMITED) {
            this.allow();
            return ALLOWED;
        }

        if (Date.now() < until) {
            this.allow();
            return ALLOWED;
        }

        await this.block('expired');
        return BLOCKED_EXPIRED;
    }

    /**
     * Один запрос к серверу. Наружу не бросает.
     * @returns {Promise<'ok'|'denied'|'unreachable'>}
     */
    async askServer() {
        if (!this.apiBase) return SERVER_UNREACHABLE;

        let token = null;
        try {
            token = await this.getToken();
        } catch {
            return SERVER_UNREACHABLE;
        }
        // Не вошли — блокировать нечего, вход и так закрыт своим экраном
        if (!token) return SERVER_UNREACHABLE;

        let response;
        try {
            response = await fetch(this.apiBase + '/api/me', {
                cache: 'no-store',
                headers: { Authorization: 'Bearer ' + token }
            });
        } catch {
            return SERVER_UNREACHABLE;   // сети нет
        }

        // Явный отказ. Сервер различает два случая, и нам они тоже нужны:
        // access_expired — вышел срок, остальное — закрыл администратор.
        if (response.status === 401 || response.status === 403) {
            let reason = '';
            try {
                const body = await response.json();
                reason = (body && body.error) || '';
            } catch {
                reason = '';
            }
            return reason === 'access_expired' ? SERVER_EXPIRED : SERVER_BLOCKED;
        }

        // Сервер упал — это не отказ, это молчание
        if (!response.ok) return SERVER_UNREACHABLE;

        let profile = null;
        try {
            profile = await response.json();
        } catch {
            return SERVER_UNREACHABLE;
        }
        if (!profile) return SERVER_UNREACHABLE;

        if (profile.status === 'blocked') return SERVER_BLOCKED;

        // Свежие данные в кэш: дальше ими пользуемся без сети
        write(KEY_UNTIL, normalizeUntil(profile.accessUntil));
        write(KEY_STATUS, profile.status || 'active');

        return SERVER_OK;
    }

    /* ---------- Переходы ---------- */

    async block(kind) {
        if (this.blockKind === kind) return;

        this.blockKind = kind;
        write(KEY_BLOCK, kind);

        // Напоминания снимаем первым делом: закрытое приложение не должно
        // будить человека.
        try {
            await this.cancelAlarms();
        } catch (err) {
            console.error('[access] не удалось снять напоминания:', err);
        }

        if (this.showScreen) this.mountBlockScreen();
        this.onBlocked(kind);
    }

    allow() {
        if (!this.isBlocked()) return;
        this.blockKind = '';
        write(KEY_BLOCK, '');
        this.unmountBlockScreen();
        this.onAllowed();
    }

    /* ---------- Экран блокировки ---------- */

    blockText() {
        if (this.blockKind === 'admin') {
            return {
                title: 'Доступ ограничен администратором',
                hint: 'Свяжитесь с поддержкой. Приложение продолжит работу, как только доступ восстановят.'
            };
        }
        return {
            title: 'Срок доступа истёк',
            hint: 'Подключитесь к интернету для проверки или свяжитесь с администратором.'
        };
    }

    mountBlockScreen() {
        const existing = document.getElementById('accessBlockScreen');
        const text = this.blockText();

        if (existing) {
            // Вид блокировки мог смениться, пока экран висел
            existing.querySelector('[data-role="title"]').textContent = text.title;
            existing.querySelector('[data-role="hint"]').textContent = text.hint;
            return;
        }

        const screen = document.createElement('div');
        screen.id = 'accessBlockScreen';
        screen.setAttribute('role', 'alertdialog');
        screen.setAttribute('aria-modal', 'true');

        // Стиль задан прямо здесь, а не в таблице стилей: экран обязан
        // появиться, даже если css почему-то не загрузился.
        screen.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:2147483647',
            'display:flex', 'flex-direction:column',
            'align-items:center', 'justify-content:center',
            'gap:14px', 'padding:32px 24px', 'text-align:center',
            'background:#0b0a0f', 'color:#ece7de',
            "font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
        ].join(';');

        const title = document.createElement('p');
        title.dataset.role = 'title';
        title.style.cssText = 'margin:0;font-size:19px;font-weight:600;color:#D39D3C';
        title.textContent = text.title;

        const hint = document.createElement('p');
        hint.dataset.role = 'hint';
        hint.style.cssText = 'margin:0;font-size:14px;line-height:1.5;color:#a89fb2;max-width:320px';
        hint.textContent = text.hint;

        screen.appendChild(title);
        screen.appendChild(hint);
        document.body.appendChild(screen);

        // Закрыть экран нечем: кнопки нет, а страница под ним не прокручивается
        this.savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }

    unmountBlockScreen() {
        const screen = document.getElementById('accessBlockScreen');
        if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
        document.body.style.overflow = this.savedOverflow || '';
    }
}
