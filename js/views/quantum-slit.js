/* Опыт с двумя щелями — то, что видно на пульте, пока не выбрана часть.

   Пульт открывается с двумя погашенными кнопками, и под ними остаётся
   чёрное поле. Раньше там не было ничего. Теперь там идёт сам опыт, с
   которого начинается весь раздел: слева, под «Архитектором», частицы
   ведут себя как волна и дают семь полос; справа, под «Наблюдателем», за
   щелями смотрят глаза, и полос остаётся две.

   Почему это стоит именно здесь. Две кнопки наверху называются ровно так
   же, как два исхода опыта, и человек должен увидеть разницу раньше, чем
   выберет. Поле под ними для этого — единственное место.

   Оба опыта идут всегда, но вполсилы: редкие частицы, приглушённое
   золото. Нажали на поле — оно оживает, второе гаснет и замирает.

   Рисуется на canvas и ничего не знает об остальном приложении: наружу
   уходят две функции, initSlit и stopSlit. */

/* Геометрия в долях от поля: при любом размере опыт выглядит одинаково.
   Источник слева, пластина с двумя щелями посередине, экран справа. */
const SRC_X = 0.10;
const PLATE_X = 0.42;
const SCREEN_X = 0.88;
const SLIT_GAP = 0.13;          // щели выше и ниже середины
const SLIT_H = 0.075;           // высота самой щели

/* Семь полос интерференции — столько же, сколько в задании. Яркость
   падает от середины к краям: так выглядит настоящая картина, где
   центральный максимум самый сильный. */
const WAVE_BANDS = [-3, -2, -1, 0, 1, 2, 3].map(i => ({
    y: 0.5 + i * 0.105,
    w: [0.3, 0.55, 0.8, 1, 0.8, 0.55, 0.3][i + 3]
}));

// Наблюдение схлопывает картину до двух полос — прямо напротив щелей
const PART_BANDS = [
    { y: 0.5 - SLIT_GAP, w: 1 },
    { y: 0.5 + SLIT_GAP, w: 1 }
];

const BINS = 64;                // на столько долей поделён экран
const MAX_DPR = 2;              // выше этого телефон греется зря

const GOLD = '255, 226, 150';
const GOLD_DIM = '214, 176, 96';

let panels = [];
let raf = null;
let wired = false;
let last = 0;

/* Одна частица живёт от источника до экрана и начинается заново.

   Путь ломается о пластину: до неё частица летит к своей щели, после —
   к своей полосе на экране. У волны это дуга, у частицы прямая. */
function seed(p, panel) {
    const slit = Math.random() < 0.5 ? -1 : 1;
    p.slitY = 0.5 + slit * SLIT_GAP;
    p.y0 = 0.5 + (Math.random() - 0.5) * 0.08;
    p.t = -Math.random() * 0.6;          // отрицательное — ещё не вылетела
    p.speed = 0.26 + Math.random() * 0.2;
    p.size = 1.1 + Math.random() * 1.4;

    const bands = panel.kind === 'wave' ? WAVE_BANDS : PART_BANDS;
    if (panel.kind === 'wave') {
        // Полоса выбирается по яркости: в центр попадает чаще
        let r = Math.random() * bands.reduce((s, b) => s + b.w, 0);
        let band = bands[0];
        for (const b of bands) { r -= b.w; band = b; if (r <= 0) break; }
        p.hitY = band.y + (Math.random() - 0.5) * 0.045;
    } else {
        p.hitY = p.slitY + (Math.random() - 0.5) * 0.03;
    }
    p.landed = false;
}

// Где частица сейчас: t идёт от 0 у источника до 1 у экрана
function positionOf(p, t) {
    if (t <= PLATE_X) {
        const k = t / PLATE_X;
        return { x: SRC_X + (PLATE_X - SRC_X) * k, y: p.y0 + (p.slitY - p.y0) * k };
    }
    const k = (t - PLATE_X) / (SCREEN_X - PLATE_X);
    const x = PLATE_X + (SCREEN_X - PLATE_X) * k;
    /* Дуга вместо прямой: волна уходит от щели вбок и только потом
       выходит к своей полосе. Прямая читалась бы тем же корпускулярным
       полётом, что и справа, и разницы между опытами не осталось бы. */
    const bend = Math.sin(k * Math.PI) * 0.12 * (p.slitY < 0.5 ? -1 : 1);
    const y = p.slitY + (p.hitY - p.slitY) * k * k;
    return { x, y: y + (p.wave ? bend * (1 - k) : 0) };
}

function makePanel(root, kind) {
    const canvas = root.querySelector('canvas');
    const panel = {
        root, canvas, kind,
        ctx: canvas.getContext('2d'),
        w: 0, h: 0,
        active: false,
        glow: 0,                       // плавный переход между тускло и ярко
        bins: new Float32Array(BINS),
        dots: []
    };
    const count = kind === 'wave' ? 46 : 38;
    for (let i = 0; i < count; i++) {
        const p = { wave: kind === 'wave' };
        seed(p, panel);
        panel.dots.push(p);
    }
    return panel;
}

function resize(panel) {
    const rect = panel.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w !== panel.canvas.width || h !== panel.canvas.height) {
        panel.canvas.width = w;
        panel.canvas.height = h;
    }
    panel.w = w;
    panel.h = h;
    return true;
}

/* Пластина, экран и источник — неподвижная часть рисунка */
function drawRig(panel, a) {
    const { ctx, w, h } = panel;
    const plateX = PLATE_X * w;
    const topGap = (0.5 - SLIT_GAP) * h;
    const botGap = (0.5 + SLIT_GAP) * h;
    const half = SLIT_H * h / 2;

    ctx.lineCap = 'round';

    // Пластина: три куска золота, между ними две щели
    ctx.strokeStyle = `rgba(${GOLD}, ${0.75 * a})`;
    ctx.lineWidth = Math.max(2, w * 0.012);
    for (const [y1, y2] of [[0.08 * h, topGap - half],
                            [topGap + half, botGap - half],
                            [botGap + half, 0.92 * h]]) {
        ctx.beginPath();
        ctx.moveTo(plateX, y1);
        ctx.lineTo(plateX, y2);
        ctx.stroke();
    }

    // Экран, на котором копится картина
    ctx.strokeStyle = `rgba(${GOLD_DIM}, ${0.5 * a})`;
    ctx.lineWidth = Math.max(2, w * 0.014);
    ctx.beginPath();
    ctx.moveTo(SCREEN_X * w, 0.06 * h);
    ctx.lineTo(SCREEN_X * w, 0.94 * h);
    ctx.stroke();

    // Источник
    const sx = SRC_X * w, sy = 0.5 * h;
    const r = Math.max(3, w * 0.018);
    ctx.strokeStyle = `rgba(${GOLD}, ${0.8 * a})`;
    ctx.lineWidth = Math.max(1.2, w * 0.006);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
}

/* Волновые фронты: кольца, расходящиеся от каждой щели.

   Это и есть «сама себе помеха»: два набора колец идут навстречу друг
   другу, и там, где они складываются, на экране светлее. Рисуются
   дугами, а не расчётом поля, — на телефоне поле считать нечем. */
function drawWaves(panel, time, a) {
    const { ctx, w, h } = panel;
    const plateX = PLATE_X * w;
    const span = (SCREEN_X - PLATE_X) * w;
    ctx.lineWidth = Math.max(1, w * 0.004);

    for (const dir of [-1, 1]) {
        const cy = (0.5 + dir * SLIT_GAP) * h;
        for (let i = 0; i < 5; i++) {
            const k = ((time * 0.22 + i / 5) % 1);
            const rad = k * span;
            ctx.strokeStyle = `rgba(${GOLD}, ${(1 - k) * 0.3 * a})`;
            ctx.beginPath();
            ctx.arc(plateX, cy, rad, -Math.PI / 2.1, Math.PI / 2.1);
            ctx.stroke();
        }
    }
}

/* Глаза над щелями: знак того, что за опытом смотрят.

   Рисуются, а не берутся символом: символ приносит свой шрифт и свой
   цвет, а здесь всё должно быть одного золота. */
function drawEyes(panel, time, a) {
    const { ctx, w, h } = panel;
    const x = PLATE_X * w - w * 0.1;
    const blink = Math.sin(time * 1.6) > 0.96 ? 0.12 : 1;

    for (const dir of [-1, 1]) {
        const cy = (0.5 + dir * SLIT_GAP) * h;
        const rx = w * 0.055;
        const ry = rx * 0.6 * blink;
        ctx.strokeStyle = `rgba(${GOLD}, ${0.85 * a})`;
        ctx.lineWidth = Math.max(1.2, w * 0.006);
        ctx.beginPath();
        ctx.moveTo(x - rx, cy);
        ctx.quadraticCurveTo(x, cy - ry * 2, x + rx, cy);
        ctx.quadraticCurveTo(x, cy + ry * 2, x - rx, cy);
        ctx.stroke();
        if (blink > 0.5) {
            ctx.fillStyle = `rgba(${GOLD}, ${0.8 * a})`;
            ctx.beginPath();
            ctx.arc(x, cy, Math.max(1.4, rx * 0.26), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Картина, накопленная экраном: полосы поперёк него
function drawPattern(panel, a) {
    const { ctx, w, h, bins } = panel;
    const x = SCREEN_X * w;
    const bw = Math.max(3, w * 0.03);
    const bh = h / BINS;
    let peak = 0;
    for (const v of bins) if (v > peak) peak = v;
    if (peak < 0.001) return;

    for (let i = 0; i < BINS; i++) {
        const v = bins[i] / peak;
        if (v < 0.02) continue;
        ctx.fillStyle = `rgba(${GOLD}, ${Math.min(1, v) * 0.85 * a})`;
        ctx.fillRect(x - bw / 2, i * bh, bw, bh + 0.6);
    }
}

function drawDots(panel, a) {
    const { ctx, w, h } = panel;
    for (const p of panel.dots) {
        if (p.t < 0 || p.landed) continue;
        const now = positionOf(p, p.t);

        // Хвост: та же частица чуть раньше во времени
        const tail = positionOf(p, Math.max(0, p.t - 0.055));
        const grad = ctx.createLinearGradient(tail.x * w, tail.y * h, now.x * w, now.y * h);
        grad.addColorStop(0, `rgba(${GOLD}, 0)`);
        grad.addColorStop(1, `rgba(${GOLD}, ${0.5 * a})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size * 0.9;
        ctx.beginPath();
        ctx.moveTo(tail.x * w, tail.y * h);
        ctx.lineTo(now.x * w, now.y * h);
        ctx.stroke();

        ctx.fillStyle = `rgba(${GOLD}, ${0.95 * a})`;
        ctx.beginPath();
        ctx.arc(now.x * w, now.y * h, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function step(panel, dt) {
    const target = panel.active ? 1 : 0;
    panel.glow += (target - panel.glow) * Math.min(1, dt * 3.5);

    // Погашённый опыт не стоит, а едва тлеет: движение должно быть видно
    const pace = 0.22 + panel.glow * 0.78;
    const fade = Math.pow(0.5, dt * 0.12);

    for (let i = 0; i < BINS; i++) panel.bins[i] *= fade;

    for (const p of panel.dots) {
        p.t += p.speed * pace * dt;
        if (p.t >= SCREEN_X && !p.landed) {
            p.landed = true;
            const bin = Math.min(BINS - 1, Math.max(0, Math.round(p.hitY * (BINS - 1))));
            panel.bins[bin] += 0.35 + panel.glow * 0.65;
            if (bin > 0) panel.bins[bin - 1] += 0.12;
            if (bin < BINS - 1) panel.bins[bin + 1] += 0.12;
        }
        if (p.t >= 1) seed(p, panel);
    }
}

function paint(panel, time) {
    if (!resize(panel)) return;
    const { ctx, w, h } = panel;
    ctx.clearRect(0, 0, w, h);

    const a = 0.3 + panel.glow * 0.7;
    drawRig(panel, a);
    if (panel.kind === 'wave') drawWaves(panel, time, a);
    else drawEyes(panel, time, a);
    drawPattern(panel, a);
    drawDots(panel, a);
}

function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;

    for (const panel of panels) {
        // Поле спрятано — считать и рисовать нечего
        if (!panel.canvas.isConnected || panel.canvas.offsetParent === null) continue;
        step(panel, dt);
        paint(panel, now / 1000);
    }
}

function setActive(kind) {
    for (const panel of panels) {
        panel.active = panel.kind === kind;
        panel.root.setAttribute('aria-pressed', String(panel.active));
        panel.root.classList.toggle('q-exp-on', panel.active);
    }
}

/* Зовётся один раз из app.js. Если поля в разметке нет — молча уходит:
   раздел должен открываться и без опыта. */
export function initSlit() {
    if (wired) return;
    const box = document.getElementById('quantumIdle');
    if (!box) return;

    panels = [...box.querySelectorAll('.q-exp')].map(root =>
        makePanel(root, root.dataset.exp === 'wave' ? 'wave' : 'particle'));
    if (!panels.length) return;

    for (const panel of panels) {
        panel.root.addEventListener('click', () => {
            // Второе нажатие по тому же полю гасит оба: опыт снова ничей
            setActive(panel.active ? null : panel.kind);
        });
    }

    wired = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
}

export function stopSlit() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    wired = false;
    panels = [];
}
