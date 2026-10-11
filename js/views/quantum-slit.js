/* Опыт с двумя щелями — то, что видно на пульте, пока не выбрана часть.

   Пульт открывается с двумя погашенными кнопками, и под ними остаётся
   чёрное поле. Там идёт сам опыт, с которого начинается весь раздел:
   слева, под «Архитектором», частицы ведут себя как волна и дают семь
   полос; справа, под «Наблюдателем», за щелями смотрят глаза, и полос
   остаётся две.

   ПОЧЕМУ ТРИ ЧЕТВЕРТИ, А НЕ ВИД СБОКУ.

   Сначала опыт был нарисован строго сбоку, и обе пластины вырождались в
   отрезки: у листа виден только торец. Щели при этом были не дырками, а
   разрывами линии, и прочитать, что частица проходит СКВОЗЬ преграду,
   было нельзя — проходить было не через что.

   Теперь сцена считается в трёх измерениях и проецируется наклонно:
   X идёт вдоль луча, Y вверх и вниз по пластине, Z вглубь. Пластина
   стала плоскостью с шириной и высотой, у неё появилась толщина, а щели
   прорезаны насквозь — сквозь них видно темноту за преградой.

   Проекция наклонная (косоугольная), а не перспективная: у неё нет
   точки схода, параллельные рёбра остаются параллельными, и пластина
   одинаково читается в любом углу холста. Для чертежа опыта это честнее
   перспективы, где дальний край пришлось бы сжимать.

   Рисуется на canvas и ничего не знает об остальном приложении: наружу
   уходят две функции, initSlit и stopSlit. */

/* ---------- Сцена в трёх измерениях ---------- */

const SRC_X = 0.00;             // источник
const PLATE_X = 0.44;           // преграда с двумя щелями
const SCREEN_X = 1.00;          // экран, на котором копится картина
const THICK = 0.02;             // толщина пластин вдоль луча

// Пластина по высоте и в глубину — в тех же долях
const PLATE_Y = 1.0;
const PLATE_Z0 = 0.0;
const PLATE_Z1 = 1.0;

// Щели: две прорези, выше и ниже середины
const SLIT_Y0 = 0.26;
const SLIT_Y1 = 0.54;
const SLIT_Z0 = 0.2;
const SLIT_Z1 = 0.8;
const SLIT_MID = (SLIT_Y0 + SLIT_Y1) / 2;
const SLIT_HALF = (SLIT_Y1 - SLIT_Y0) / 2;

/* РАЗМАХ ВОЛНОВОГО ВЕЕРА.

   WAVE_SPREAD — во сколько раз фронт шире по высоте, чем по лучу. Пока
   множитель был меньше единицы, веера от двух щелей шли узкими пучками
   каждый сам по себе: верхний не дотягивался до нижнего, пересекаться
   было нечему, и никакой картины сложения не возникало. Нужен размах,
   при котором фронты перекрывают друг друга задолго до экрана.

   WAVE_REACH — предел этого размаха. Экран высотой в две единицы, и
   расходиться шире незачем: дальше дуга просто ушла бы за холст.

   WAVE_PIN — насколько резко дуга сходится к краю прорези у самого конца.
   Четвёртая степень синуса почти ничего не меняет в теле дуги и забирает
   её концы только в последних градусах: середина остаётся широким
   полукругом, а концы всё так же садятся точно на края щели. */
const WAVE_SPREAD = 2.3;
const WAVE_REACH = 1.8;
const WAVE_PIN = 4;

/* Семь полос интерференции — столько же, сколько в задании. Яркость
   падает от середины к краям: так выглядит настоящая картина, где
   центральный максимум самый сильный. */
const WAVE_BANDS = [-3, -2, -1, 0, 1, 2, 3].map(i => ({
    y: i * 0.27,
    w: [0.3, 0.55, 0.8, 1, 0.8, 0.55, 0.3][i + 3]
}));

// Наблюдение схлопывает картину до двух полос — прямо напротив щелей
const PART_BANDS = [{ y: -SLIT_MID, w: 1 }, { y: SLIT_MID, w: 1 }];

const BINS = 48;                // на столько долей поделён экран по высоте
const MAX_DPR = 2;              // выше этого телефон греется зря

const GOLD = '255, 226, 150';
const GOLD_MID = '206, 165, 86';
const GOLD_DEEP = '92, 68, 24';

let panels = [];
let raf = null;
let wired = false;
let last = 0;

/* ---------- Проекция ---------- */

/* Наклонная проекция: X вправо, Y вниз, Z вправо-вверх.

   КУДА СМОТРЯТ ПЛАСТИНЫ. Глубина уходит вправо и ВНИЗ: дальний край
   листа ниже ближнего, и лист открывается зрителю сверху-слева — ровно
   так, как на образце владельца. Первый заход уводил глубину вверх, и
   пластины разворачивались в обратную сторону: лист показывал низ, а не
   верх, и сцена читалась зеркально образцу.

   Числа подобраны так, чтобы при любом отношении сторон холста сцена
   помещалась целиком: по ширине x и z вместе занимают 0,90, по высоте
   y и z вместе — 0,86. Начало отсчёта поднято вслед за разворотом:
   теперь вниз тянут обе оси сразу, и прежняя середина увела бы сцену за
   нижний край. Запас оставлен на толщину пластин и на хвосты частиц,
   которые вылетают чуть за габарит. */
function geom(w, h) {
    return {
        ox: w * 0.055, oy: h * 0.37,
        ax: w * 0.63, ay: h * 0.30,
        zx: w * 0.27, zy: h * 0.26
    };
}

const px = (g, x, z) => g.ox + x * g.ax + z * g.zx;
const py = (g, y, z) => g.oy + y * g.ay + z * g.zy;

// Четыре угла прямоугольника, лежащего в плоскости пластины
function face(g, x, y0, y1, z0, z1) {
    return [
        [px(g, x, z0), py(g, y0, z0)],
        [px(g, x, z1), py(g, y0, z1)],
        [px(g, x, z1), py(g, y1, z1)],
        [px(g, x, z0), py(g, y1, z0)]
    ];
}

function poly(ctx, pts, move = true) {
    if (move) ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
}

/* ---------- Пластины ---------- */

/* Пластина рисуется в три слоя, и порядок здесь — это и есть объём.

   Сначала задняя грань, она же дно щели: тёмное золото. Потом сквозь
   прорези выбивается чернота — то, что за преградой; без неё щель
   читалась бы вмятиной, а не дыркой. Потом боковой скос от задней грани
   к передней: это и есть видимая толщина. И только сверху — передняя
   грань с вырезанными отверстиями, по правилу even-odd.

   Внутренние стенки прорезей рисуются отдельно: у дырки в толстом листе
   видно её нутро, и без него отверстие выглядит наклейкой. */
function plate(ctx, g, x, holes, a, shade) {
    const back = x + THICK;

    /* Задняя грань — тоже с вырезами, по even-odd.

       Сначала прорези пробивались насквозь через весь холст
       (destination-out), и это было неверно: стиралось не только дно
       щели, но и дальний экран, уже нарисованный под преградой. Сквозь
       щель видна была чернота, а не то, что за ней. Теперь в области
       прорези просто не кладётся краска, и через отверстие видно экран —
       как и должно быть у настоящей дырки. */
    ctx.fillStyle = `rgba(${GOLD_DEEP}, ${0.85 * a})`;
    ctx.beginPath();
    poly(ctx, face(g, back, -PLATE_Y, PLATE_Y, PLATE_Z0, PLATE_Z1), false);
    for (const [y0, y1] of holes) {
        poly(ctx, face(g, back, y0, y1, SLIT_Z0, SLIT_Z1), false);
    }
    ctx.fill('evenodd');

    // Нутро прорези: стенка от задней грани к передней
    for (const [y0, y1] of holes) {
        ctx.fillStyle = `rgba(${GOLD_DEEP}, ${0.95 * a})`;
        poly(ctx, [
            [px(g, x, SLIT_Z0), py(g, y1, SLIT_Z0)],
            [px(g, x, SLIT_Z1), py(g, y1, SLIT_Z1)],
            [px(g, back, SLIT_Z1), py(g, y1, SLIT_Z1)],
            [px(g, back, SLIT_Z0), py(g, y1, SLIT_Z0)]
        ]);
        ctx.fill();
    }

    // Толщина по нижнему краю листа
    ctx.fillStyle = `rgba(${GOLD_MID}, ${0.5 * a})`;
    poly(ctx, [
        [px(g, x, PLATE_Z0), py(g, PLATE_Y, PLATE_Z0)],
        [px(g, x, PLATE_Z1), py(g, PLATE_Y, PLATE_Z1)],
        [px(g, back, PLATE_Z1), py(g, PLATE_Y, PLATE_Z1)],
        [px(g, back, PLATE_Z0), py(g, PLATE_Y, PLATE_Z0)]
    ]);
    ctx.fill();

    /* Передняя грань с отверстиями. Заливка переливом поперёк листа:
       плоский цвет на такой площади читается бумагой, а перелив от
       светлого к тёмному даёт металл. */
    const c0 = [px(g, x, PLATE_Z0), py(g, 0, PLATE_Z0)];
    const c1 = [px(g, x, PLATE_Z1), py(g, 0, PLATE_Z1)];
    const grad = ctx.createLinearGradient(c0[0], c0[1], c1[0], c1[1]);
    grad.addColorStop(0, `rgba(${GOLD_MID}, ${shade * a})`);
    grad.addColorStop(0.45, `rgba(${GOLD}, ${shade * a})`);
    grad.addColorStop(1, `rgba(${GOLD_MID}, ${shade * 0.72 * a})`);
    ctx.fillStyle = grad;

    ctx.beginPath();
    poly(ctx, face(g, x, -PLATE_Y, PLATE_Y, PLATE_Z0, PLATE_Z1), false);
    for (const [y0, y1] of holes) {
        poly(ctx, face(g, x, y0, y1, SLIT_Z0, SLIT_Z1), false);
    }
    ctx.fill('evenodd');

    /* Кромка: тонкий светлый кант по контуру листа и по краю прорезей.

       Заодно замыкаются углы: четыре коротких ребра от передней грани к
       задней. Без них лист распадался на две отдельные пластины — лицо
       и спину, — между которыми ничего. С рёбрами это одно тело с
       толщиной, и края сходятся. */
    ctx.strokeStyle = `rgba(${GOLD}, ${0.55 * a})`;
    ctx.lineWidth = 1;
    poly(ctx, face(g, x, -PLATE_Y, PLATE_Y, PLATE_Z0, PLATE_Z1));
    ctx.stroke();
    for (const [y0, y1] of holes) {
        poly(ctx, face(g, x, y0, y1, SLIT_Z0, SLIT_Z1));
        ctx.stroke();
    }

    ctx.strokeStyle = `rgba(${GOLD_MID}, ${0.45 * a})`;
    ctx.beginPath();
    for (const yy of [-PLATE_Y, PLATE_Y]) {
        for (const zz of [PLATE_Z0, PLATE_Z1]) {
            ctx.moveTo(px(g, x, zz), py(g, yy, zz));
            ctx.lineTo(px(g, back, zz), py(g, yy, zz));
        }
    }
    ctx.stroke();
}

/* ---------- Частицы ---------- */

function seed(p, panel) {
    const side = Math.random() < 0.5 ? -1 : 1;
    p.slitY = side * SLIT_MID;
    p.y0 = (Math.random() - 0.5) * 0.3;
    p.z0 = 0.5 + (Math.random() - 0.5) * 0.3;
    p.zSlit = SLIT_Z0 + 0.1 + Math.random() * (SLIT_Z1 - SLIT_Z0 - 0.2);
    p.t = -Math.random() * 0.5;
    p.speed = 0.3 + Math.random() * 0.22;
    p.size = 1.1 + Math.random() * 1.3;
    p.bend = side;

    if (panel.kind === 'wave') {
        // Полоса выбирается по яркости: в центр попадает чаще
        let r = Math.random() * WAVE_BANDS.reduce((s, b) => s + b.w, 0);
        let band = WAVE_BANDS[0];
        for (const b of WAVE_BANDS) { r -= b.w; band = b; if (r <= 0) break; }
        p.hitY = band.y + (Math.random() - 0.5) * 0.1;
    } else {
        p.hitY = p.slitY + (Math.random() - 0.5) * 0.07;
    }
    p.zHit = p.zSlit + (Math.random() - 0.5) * 0.12;
    p.landed = false;
}

// Где частица сейчас: t идёт от 0 у источника до 1 у экрана
function at(p, t) {
    if (t <= PLATE_X) {
        const k = PLATE_X ? t / PLATE_X : 1;
        return {
            x: SRC_X + (PLATE_X - SRC_X) * k,
            y: p.y0 + (p.slitY - p.y0) * k,
            z: p.z0 + (p.zSlit - p.z0) * k
        };
    }
    const k = (t - PLATE_X) / (SCREEN_X - PLATE_X);
    /* Дуга вместо прямой: волна уходит от щели вбок и только потом
       выходит к своей полосе. Прямая читалась бы тем же корпускулярным
       полётом, что и справа, и разницы между опытами не осталось бы. */
    const arc = p.wave ? Math.sin(k * Math.PI) * 0.17 * p.bend * (1 - k) : 0;
    return {
        x: PLATE_X + (SCREEN_X - PLATE_X) * k,
        y: p.slitY + (p.hitY - p.slitY) * (p.wave ? k * k : k) + arc,
        z: p.zSlit + (p.zHit - p.zSlit) * k
    };
}

/* ---------- Прочие части чертежа ---------- */

// Источник: катушка слева, из которой идёт поток
function drawSource(ctx, g, a) {
    const x = px(g, SRC_X - 0.07, 0.5);
    const y = py(g, 0, 0.5);
    const r = Math.max(4, g.ax * 0.035);

    ctx.strokeStyle = `rgba(${GOLD}, ${0.8 * a})`;
    ctx.lineWidth = Math.max(1, r * 0.17);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Виток внутри: знак того, что это излучатель, а не просто точка
    ctx.lineWidth = Math.max(0.8, r * 0.13);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const sx = x - r * 0.62 + r * 1.24 * t;
        const sy = y + Math.sin(t * Math.PI * 4) * r * 0.42;
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    }
    ctx.stroke();
}

/* Волновые фронты за преградой.

   ОТКУДА ОНИ РАСТУТ. Дуга привязана к самой прорези: её концы лежат
   ровно на верхней и нижней гранях щели, на задней грани преграды, а
   тело уходит вперёд широким полукругом. Привязка держится последними
   градусами — половина размаха умножается на (1 - sin⁴), — и в теле
   дуги её почти не слышно.

       half = ry - (ry - SLIT_HALF) * |sin(ang)|⁴

   При ang = ±90° синус единица, и точка садится ровно на край прорези;
   к середине поправка тает, и фронт расходится на полную. Радиус по
   лучу там же обращается в ноль, поэтому оба конца лежат точно на
   задней грани преграды.

   ПОЧЕМУ ВЕЕР ШИРОКИЙ. Первый заход сводил концы к щели слишком рано —
   множитель входил в размах прямым косинусом и душил дугу по всей
   длине. Веера выходили узкими пучками: верхний шёл сам по себе, нижний
   сам по себе, пересекаться им было негде, и картины сложения не
   получалось вовсе. Теперь размах берётся с запасом (WAVE_SPREAD), а
   поправка на привязку — четвёртой степенью: фронты перекрывают друг
   друга примерно с трети пути и дальше идут внахлёст. Там, где дуги
   верхней и нижней щели скрещиваются, свет складывается — из этих
   пересечений и собирается ромбовидная сетка, которая доходит до
   экрана во всю его высоту.

   ПОЧЕМУ У ЭКРАНА НЕТ ПОЛОС. Прежде точки, перелетевшие экран, просто
   выбрасывались из пути — а обводка замыкала разрыв прямой. Эта прямая
   и была жёсткими вертикальными рёбрами на экране: не волна, а хорда
   поперёк разрыва. Теперь выбрасывать нечего: радиус доходит до экрана
   ровно, не перелетая, а у самой плоскости фронт гаснет — по времени и
   продольным переливом, у которого правый конец прозрачный.

   Дуга считается в сцене и проецируется по точкам, поэтому в наклонном
   ракурсе она ложится эллипсом, как и должна. */
function drawWaves(ctx, g, time, a) {
    const mouth = PLATE_X + THICK;        // устье щели: задняя грань преграды
    const span = SCREEN_X - mouth;        // сколько фронту лететь до экрана

    /* Сложение света вместо обычной заливки.

       В этом вся суть левого опыта: два набора дуг идут навстречу, и там,
       где они пересекаются, свет складывается и вспыхивает ярче. Обычным
       рисованием верхняя дуга просто закрывала бы нижнюю, и пересечение
       выглядело бы перекрёстком, а не усилением. С 'lighter' перекрестья
       сами собой становятся самыми светлыми точками поля — из них и
       складывается сетка.

       Режим возвращается обратно сразу после волн: всё остальное на
       поле должно рисоваться как обычно. */
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1.1, g.ax * 0.0055);
    ctx.lineCap = 'round';

    /* Размах считается от пропорций холста: на экранном золоте дуга
       должна читаться окружностью, а не сплюснутым блином, а наклонная
       проекция растягивает ось луча сильнее поперечной. */
    const spread = (g.ax / g.ay) * WAVE_SPREAD;
    const x0 = px(g, mouth, 0.5);
    const x1 = px(g, SCREEN_X, 0.5);

    for (const side of [-1, 1]) {
        const cy = side * SLIT_MID;

        /* Свечение в самом отверстии.

           Волны рисуются раньше преграды, и сквозь прорезь видно то, что
           под ней: это свечение попадает ровно в проём и гаснет к его
           краям. Без него щель оставалась тёмной дыркой, из которой
           почему-то идут дуги; с ним видно сам источник. */
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + side);
        const mx = px(g, mouth, 0.5);
        const my = py(g, cy, 0.5);
        const mr = Math.max(4, g.ay * SLIT_HALF * 1.6);
        const glow = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
        glow.addColorStop(0, `rgba(${GOLD}, ${(0.3 + pulse * 0.28) * a})`);
        glow.addColorStop(1, `rgba(${GOLD}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();

        /* Двенадцать фронтов вместо девяти: сетка собирается из
           пересечений, и чем гуще идут дуги, тем она разборчивее. */
        for (let i = 0; i < 12; i++) {
            const k = (time * 0.2 + i / 12) % 1;
            const rad = k * span;
            if (rad < 0.015) continue;

            /* Растворение у самой плоскости: фронт доходит до экрана, но
               касается его уже ничем. */
            const gone = Math.min(1, (1 - k) / 0.12);
            const alpha = (1 - k * 0.45) * 0.6 * gone * a;
            if (alpha < 0.004) continue;

            /* Продольный перелив вдоль луча: у преграды полная сила, у
               экрана ноль. Все точки дуги лежат на одной глубине, и
               экранный x зависит от сценического линейно — поэтому
               горизонтальный перелив и есть затухание по дальности. */
            const grad = ctx.createLinearGradient(x0, 0, x1, 0);
            grad.addColorStop(0, `rgba(${GOLD}, ${alpha})`);
            grad.addColorStop(0.85, `rgba(${GOLD}, ${alpha})`);
            grad.addColorStop(1, `rgba(${GOLD}, 0)`);
            ctx.strokeStyle = grad;

            const ry = Math.min(WAVE_REACH, Math.max(SLIT_HALF, rad * spread));
            ctx.beginPath();
            for (let j = 0; j <= 32; j++) {
                const ang = -Math.PI / 2 + Math.PI * (j / 32);
                const sin = Math.sin(ang);
                const pin = Math.pow(Math.abs(sin), WAVE_PIN);
                const half = ry - (ry - SLIT_HALF) * pin;
                const wx = mouth + Math.cos(ang) * rad;
                const wy = cy + sin * half;
                const sx = px(g, wx, 0.5);
                const sy = py(g, wy, 0.5);
                j ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
            }
            ctx.stroke();
        }
    }

    ctx.globalCompositeOperation = 'source-over';
}

/* Глаза у щелей: знак того, что за опытом смотрят.

   Рисуются, а не берутся символом: символ принёс бы свой шрифт и свой
   цвет, а здесь всё должно быть одного золота. */
function drawEyes(ctx, g, time, a) {
    const blink = Math.sin(time * 1.6) > 0.95 ? 0.12 : 1;

    for (const side of [-1, 1]) {
        const x = px(g, PLATE_X + 0.1, 0.5);
        const y = py(g, side * SLIT_MID, 0.5);
        const rx = Math.max(5, g.ax * 0.055);
        const ry = rx * 0.58 * blink;

        ctx.strokeStyle = `rgba(${GOLD}, ${0.9 * a})`;
        ctx.lineWidth = Math.max(1, rx * 0.12);
        ctx.beginPath();
        ctx.moveTo(x - rx, y);
        ctx.quadraticCurveTo(x, y - ry * 2, x + rx, y);
        ctx.quadraticCurveTo(x, y + ry * 2, x - rx, y);
        ctx.stroke();

        if (blink > 0.5) {
            ctx.fillStyle = `rgba(${GOLD}, ${0.85 * a})`;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(1.4, rx * 0.26), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Картина, накопленная экраном: полосы поперёк его плоскости
function drawPattern(ctx, g, bins, a) {
    let peak = 0;
    for (const v of bins) if (v > peak) peak = v;
    if (peak < 0.001) return;

    const step = (PLATE_Y * 2) / BINS;
    for (let i = 0; i < BINS; i++) {
        const v = bins[i] / peak;
        if (v < 0.03) continue;
        const y0 = -PLATE_Y + i * step;
        ctx.fillStyle = `rgba(${GOLD}, ${Math.min(1, v) * 0.9 * a})`;
        poly(ctx, face(g, SCREEN_X - 0.004, y0, y0 + step * 1.05, PLATE_Z0, PLATE_Z1));
        ctx.fill();
    }
}

function drawDots(ctx, g, panel, a) {
    for (const p of panel.dots) {
        if (p.t < 0 || p.landed) continue;
        const now = at(p, p.t);
        const tail = at(p, Math.max(0, p.t - 0.06));
        const nx = px(g, now.x, now.z), ny = py(g, now.y, now.z);
        const tx = px(g, tail.x, tail.z), ty = py(g, tail.y, tail.z);

        const grad = ctx.createLinearGradient(tx, ty, nx, ny);
        grad.addColorStop(0, `rgba(${GOLD}, 0)`);
        grad.addColorStop(1, `rgba(${GOLD}, ${0.55 * a})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size * 0.9;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        ctx.fillStyle = `rgba(${GOLD}, ${0.95 * a})`;
        ctx.beginPath();
        ctx.arc(nx, ny, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

/* ---------- Кадр ---------- */

function makePanel(root, kind) {
    const canvas = root.querySelector('canvas');
    const panel = {
        root, canvas, kind,
        ctx: canvas.getContext('2d'),
        w: 0, h: 0,
        active: false, hover: false,
        glow: 0,
        bins: new Float32Array(BINS),
        dots: []
    };
    const count = kind === 'wave' ? 40 : 34;
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
            const k = (p.hitY + PLATE_Y) / (PLATE_Y * 2);
            const bin = Math.min(BINS - 1, Math.max(0, Math.round(k * (BINS - 1))));
            panel.bins[bin] += 0.35 + panel.glow * 0.65;
            if (bin > 0) panel.bins[bin - 1] += 0.1;
            if (bin < BINS - 1) panel.bins[bin + 1] += 0.1;
        }
        if (p.t >= 1) seed(p, panel);
    }
}

function paint(panel, time) {
    if (!resize(panel)) return;
    const { ctx, w, h } = panel;
    ctx.clearRect(0, 0, w, h);

    const g = geom(w, h);
    const a = 0.32 + panel.glow * 0.68;

    /* Порядок — это глубина. Дальний экран, на нём картина; потом волны
       в пролёте; потом преграда, которая ближе к зрителю; и только
       сверху частицы, которые должны быть видны всегда. */
    plate(ctx, g, SCREEN_X, [], a, 0.5);
    drawPattern(ctx, g, panel.bins, a);

    if (panel.kind === 'wave') drawWaves(ctx, g, time, a);

    plate(ctx, g, PLATE_X, [[-SLIT_Y1, -SLIT_Y0], [SLIT_Y0, SLIT_Y1]], a, 0.9);

    if (panel.kind === 'particle') drawEyes(ctx, g, time, a);
    drawSource(ctx, g, a);
    drawDots(ctx, g, panel, a);
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

/* ---------- Связь с кнопками раздела ---------- */

/* Вкладка над полем зажигается вместе с ним.

   Поле и кнопка над ним — об одном и том же, и человек должен видеть
   эту связь раньше, чем нажмёт: навёл на «волновую интерференцию» —
   золотом налилась кнопка «Архитектор метавселенной».

   Класс свой, .qm-lit, а не .active: .active означает «часть открыта»,
   её ставит и снимает showPart, и подменять её отсюда значило бы врать
   о состоянии раздела. */
const TAB_OF = { wave: 'moments', particle: 'space' };

/* Горит ровно одна кнопка — или ни одной.

   Прежде зажжённые собирались в множество, и их легко оказывалось две:
   одно поле выбрано, на второе навели — золотыми стояли обе. А когда
   человек открывал часть, выбор поля никто не снимал, и чужая кнопка
   оставалась золотой рядом с открытой. Обе кнопки золотом — это ложь:
   выбран всегда один путь.

   Теперь кандидат один. Наведение старше выбора: палец на поле — это
   то, что человек делает прямо сейчас, и отвечать надо ему. Ушёл палец
   — свет возвращается к выбранному.

   И ничего не горит, пока поле спрятано: открыта часть — за её кнопку
   отвечает showPart, а не опыт. */
function litTabs() {
    const box = document.getElementById('quantumIdle');
    const shown = box && !box.hidden;
    const chosen = shown
        ? (panels.find(p => p.hover) || panels.find(p => p.active))
        : null;
    const part = chosen ? TAB_OF[chosen.kind] : null;

    document.querySelectorAll('#quantumTabs .qm-tab').forEach(tab => {
        tab.classList.toggle('qm-lit', tab.dataset.part === part);
    });
}

/* Зовётся из showPart, когда человек открыл часть: опыт отпускает
   кнопки и снимает свой выбор. Иначе, вернувшись назад, человек
   застал бы поле выбранным, а кнопку над ним — погасшей. */
export function resetSlit() {
    for (const panel of panels) {
        panel.active = false;
        panel.hover = false;
        panel.root.setAttribute('aria-pressed', 'false');
        panel.root.classList.remove('q-exp-on');
    }
    litTabs();
}

function setActive(kind) {
    for (const panel of panels) {
        panel.active = panel.kind === kind;
        panel.root.setAttribute('aria-pressed', String(panel.active));
        panel.root.classList.toggle('q-exp-on', panel.active);
    }
    litTabs();
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

        /* Наведение зажигает кнопку, но опыт не выбирает: это примерка,
           а не выбор. Палец ведём теми же событиями — pointer накрывает
           и мышь, и касание одним кодом. */
        const lit = on => { panel.hover = on; litTabs(); };
        panel.root.addEventListener('pointerenter', () => lit(true));
        panel.root.addEventListener('pointerleave', () => lit(false));
        panel.root.addEventListener('pointercancel', () => lit(false));
        panel.root.addEventListener('focus', () => lit(true));
        panel.root.addEventListener('blur', () => lit(false));
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
