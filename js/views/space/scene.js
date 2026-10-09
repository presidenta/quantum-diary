/* 3D-коридор: двери, частицы, квантовый туннель.

   Часть раздела «Квант» — вторая вкладка «Пространство вариантов».
   THREE подключается глобально — см. index.js.

   ФАЙЛ СОВПАДАЕТ С ОРИГИНАЛОМ, кроме двух мест:
   1. createInfinitySymbol — знак построен лемнискатой, а не двумя
      окружностями, и плоскость под него вытянута.
   2. fitCorridorWidth и места, где берётся ширина коридора — подгонка
      под узкий экран телефона. На широком экране значения прежние:
      стена 6, дверь 5.9, отход камеры 3.0.

   Частицы, материалы, цвета, камера, туннель и вспышка не изменены. */

/* Пороги управления пальцем. Вынесены наверх, чтобы подкручивать в одном месте. */
const TAP_SLOP = 12;                      // px: дальше этого — уже жест, а не тап
const TAP_TIME = 500;                     // мс: дольше — уже не тап
const LOOK_SPEED = 0.003;                 // радиан поворота на пиксель
const WALK_SPEED = 0.015;                 // единиц сцены на пиксель
const LOOK_LIMIT = (85 * Math.PI) / 180;  // дальше голова не поворачивается
const WALK_BACK = 7;                      // дальше назад камера не отходит
const WALK_FORWARD = -22;                 // дальше вперёд не уходит: там кончается пол
const PARTICLE_NEAR = 3;                  // ближе этого к камере пылинок не бывает

/* РАСПРЕДЕЛЕНИЕ ЗВЁЗД.

   Звёзды живут тонкой оболочкой у самих поверхностей коридора — у стен, у
   пола, у потолка — и ровно по всей его длине. Середина коридора остаётся
   пустой: туда частицы не попадают вовсе.

   Дальше CORRIDOR_FAR звёзд нет намеренно. Там кончаются пол и потолок, а
   за ними в темноте стоит чёрный квадрат — он должен оставаться чистым,
   иначе пропадает ощущение бесконечности. Раньше частицы жили снаружи
   коридора и были видны только в этом просвете: оттого и получалось
   скопление в конце при пустых стенах. */
const SHELL_DEPTH = 0.6;                  // насколько вглубь от поверхности
const FLOOR_Y = -2.5;
const CEIL_Y = 4.5;
const SURFACE_GAP = 0.05;                 // чтобы точка не лежала в самой плоскости
/* Пустая воронка вдоль взгляда.

   Чем больше число, тем раньше звезде предел по глубине. Прежде стояло
   0.14 — при нём ни одна звезда не доходила дальше z ≈ -25, а задней
   стены ещё нет и нет до -38. Звёздное поле обрывалось в воздухе, и
   перед стеной висело тёмное кольцо.

   Теперь воронка узкая: она снимает только то, что идёт впритык к оси
   взгляда, а остальные звёзды доходят до самой стены. Скопление у точки
   схода больше не мешает — за ним стоит глухая стена, на которой пыль
   читается пылью. */
const CLEAR_CONE = 0.06;

/* ГДЕ КОНЧАЕТСЯ КОРИДОР.

   Раньше пол и потолок обрывались на z = -50, а чёрный квадрат с золотой
   рамкой стоял на -85 — в тридцати пяти единицах пустоты за ними. Оттого
   конец коридора и выглядел сломанным: поверхности пропадали, рамка висела
   сама по себе, а звёзды уходили в этот просвет.

   Теперь у коридора есть настоящая задняя стена. Пол, потолок и боковые
   стены доходят ровно до неё, квадрат с рамкой лежит на ней, а звёзды не
   доживают до неё двух единиц. Стена непрозрачна и пишет глубину, поэтому
   за неё ничего не просачивается. */
const CORRIDOR_END = -38;                 // плоскость задней стены
const CORRIDOR_BACK = 10;                 // передний край пола, за спиной
const CORRIDOR_LEN = CORRIDOR_BACK - CORRIDOR_END;
const CORRIDOR_MID = (CORRIDOR_BACK + CORRIDOR_END) / 2;
const CORRIDOR_WIDE = 16;                 // ширина пола и задней стены
const CORRIDOR_TALL = 7;                  // высота стен
const CORRIDOR_FAR = CORRIDOR_END + 2;    // дальше звёзды не залетают

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class QuantumCorridorScene {
    constructor(canvasContainer, onDoorSelectCallback) {
        this.container = canvasContainer;
        this.onDoorSelect = onDoorSelectCallback;
        this.activeDoorMeshes = [];
        this.clock = new THREE.Clock();
        this.starCamZ = 5;           // где стояла камера, когда звёзды считались
        this.isRunning = false;
        this.isSelecting = false;
        this.tunnelMode = false;
        this.introBurst = 0; 
        
        this.viewYaw = 0;
        this.walkZ = 5;

        this.initScene();
        this.initHandCursor();
    }

    initHandCursor() {
        this.hand = document.createElement('div');
        this.hand.innerHTML = '👆';
        this.hand.style.cssText = `
            position: fixed;
            top: 50%; left: 50%;
            font-size: 50px;
            pointer-events: none;
            z-index: 1000;
            display: none;
            transform: translate(-20%, -10%);
            filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8));
        `;
        document.body.appendChild(this.hand);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x05070a, 0.015);

        this.checkMobile();
        this.camera = new THREE.PerspectiveCamera(this.isMobile ? 85 : 60, window.innerWidth / window.innerHeight, 0.1, 300);
        this.camera.position.set(0, 1, 5);
        this.fitCorridorWidth();

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const centerLight = new THREE.PointLight(0xe5a93c, 1.2, 35);
        centerLight.position.set(0, 2, 0);
        this.scene.add(centerLight);

        this.corridorGroup = new THREE.Group();
        this.scene.add(this.corridorGroup);

        this.buildCorridorStructure();
        this.buildPerimeterParticles();
        this.buildQuantumTunnel();
        this.buildDoorExplosion(); 

        window.addEventListener('resize', () => this.resize());
        this.initPointerControls();
    }

    checkMobile() {
        this.isMobile = window.innerWidth < 768;
    }

    // Ширина коридора под реальный горизонтальный угол обзора.
    //
    // fov у камеры three.js — ВЕРТИКАЛЬНЫЙ. На вытянутом экране телефона
    // горизонтальный угол выходит вдвое меньше, и двери с фиксированным
    // отступом уезжали за край кадра.
    //
    // Прежние 6 и 5.9 остаются верхней границей, поэтому на широком экране
    // не меняется ничего. Коридор сужается только там, где иначе не влез бы.
    fitCorridorWidth() {
        const aspect = window.innerWidth / Math.max(1, window.innerHeight);
        const halfV = (this.camera.fov * Math.PI) / 180 / 2;
        const halfH = Math.atan(Math.tan(halfV) * aspect);

        // Камера на z = 5, первая дверь на z = -3, половина её длины 1.2:
        // ближний край двери оказывается в 6.8 единицах от камеры.
        const visibleHalf = 6.8 * Math.tan(halfH);

        const maxX = this.isMobile ? 4 : 6;
        this.wallX = Math.max(2.2, Math.min(maxX, visibleHalf - 0.3));
        this.doorX = this.wallX - 0.1;
    }

    createBlackTileTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Зеркальная черная плитка
        ctx.fillStyle = '#020204';
        ctx.fillRect(0, 0, 512, 512);
        
        // Линии швов между плитками
        ctx.strokeStyle = '#1a1e28';
        ctx.lineWidth = 3;
        const tileSize = 64;
        for (let x = 0; x <= 512; x += tileSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 512);
            ctx.stroke();
        }
        for (let y = 0; y <= 512; y += tileSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(512, y);
            ctx.stroke();
        }

        // Глянцевый отблик на плитке
        for (let x = 0; x < 512; x += tileSize) {
            for (let y = 0; y < 512; y += tileSize) {
                const grad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
                grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.01)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
                ctx.fillStyle = grad;
                ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 50);
        return texture;
    }

    buildCorridorStructure() {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 0.8 });
        const ceilMat = new THREE.MeshPhysicalMaterial({ color: 0x040507, roughness: 0.2, metalness: 0.85, clearcoat: 1 });

        // Зеркальная черная плитка для пола
        const tileTex = this.createBlackTileTexture();
        const floorMat = new THREE.MeshPhysicalMaterial({
            map: tileTex,
            color: 0x010103,
            roughness: 0.03,        
            metalness: 0.95,
            clearcoat: 1.0,        
            clearcoatRoughness: 0.02,
            reflectivity: 1.0,
            transparent: false
        });

        // Пол и потолок кончаются ровно на задней стене, не раньше
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDE, CORRIDOR_LEN), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, FLOOR_Y, CORRIDOR_MID);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDE, CORRIDOR_LEN), ceilMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, CEIL_Y, CORRIDOR_MID);

        const wallX = this.wallX;
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_LEN, CORRIDOR_TALL), wallMat);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-wallX, 1, CORRIDOR_MID);

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_LEN, CORRIDOR_TALL), wallMat);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(wallX, 1, CORRIDOR_MID);

        /* Конец коридора — чистая чернота.

           Коридор должен читаться бесконечным. Для этого в конце не нужно
           ничего рисовать: сходящиеся стены, пол и потолок сами обводят
           вертикальный чёрный прямоугольник, и глаз достраивает, что за
           ним коридор продолжается.

           Раньше тут стояли чёрный квадрат и золотая рамка вокруг него, а
           сама стена была освещённой: она смотрит прямо в камеру и ловила
           больше света, чем боковые стены, которые камера видит вскользь.
           Оттого в конце и висела светлая плита с подсвеченной дверцей —
           коридор упирался в неё и кончался.

           Теперь стена не освещается вовсе: MeshBasicMaterial чёрного цвета
           рисуется ровно чёрным при любом свете. Непрозрачна и пишет
           глубину, поэтому ни одна звезда за неё не просачивается. */
        const endWallMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
        const endWall = new THREE.Mesh(
            new THREE.PlaneGeometry(CORRIDOR_WIDE, CORRIDOR_TALL + 1), endWallMat);
        endWall.position.set(0, 1, CORRIDOR_END);

        /* Сам конец — вертикальный чёрный прямоугольник, и только он.

           Ни рамки, ни подсветки: пустой проём, за которым коридор как бы
           продолжается. Чтобы он читался прямоугольником, а не пятном,
           стена вокруг него чуть светлее — по нижнему краю того, как
           рисуются боковые стены (замерено по кадру: 4–8 из 255 на
           телефоне, 4–9 на широком экране). Светлее делать нельзя: тогда
           она читается отдельной плитой, висящей в конце. Сам проём —
           чистый ноль. */
        const endGateMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const endGate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5.0), endGateMat);
        endGate.position.set(0, 1, CORRIDOR_END + 0.05);

        this.leftWall = leftWall;
        this.rightWall = rightWall;
        this.endWall = endWall;
        this.corridorGroup.add(floor, ceiling, leftWall, rightWall, endWall, endGate);
    }

    /* Одна звезда у одной из четырёх поверхностей коридора.

       Сторона выбирается поровну, поэтому стены, пол и потолок заселены
       одинаково. Глубина — небольшой отступ внутрь от поверхности, так что
       сердцевина коридора остаётся пустой сама собой, без отдельных
       проверок.

       Место по ширине и высоте звезде даётся один раз и на всю жизнь:
       плывёт она только вдоль коридора. Вместе с местом считаются её
       собственные края по глубине — ближний и дальний, — и дальше она
       ходит между ними по кругу. Поэтому плотность звёзд держится ровной
       всё время, а не только в первую секунду.

       Раньше отработавшая звезда отправлялась на общий дальний край. Все
       они приходили в одну и ту же плоскость, и у конца коридора копилась
       светящаяся стенка — это и был мусор, который ты видела. */
    placeStar(layer, index) {
        const innerX = Math.max(0.4, this.wallX - SURFACE_GAP);
        const side = Math.floor(Math.random() * 4);   // 0 левая, 1 правая, 2 потолок, 3 пол
        const depth = Math.random() * SHELL_DEPTH;
        let x, y;

        if (side === 0) {
            x = -innerX + depth;
            y = FLOOR_Y + Math.random() * (CEIL_Y - FLOOR_Y);
        } else if (side === 1) {
            x = innerX - depth;
            y = FLOOR_Y + Math.random() * (CEIL_Y - FLOOR_Y);
        } else if (side === 2) {
            x = (Math.random() * 2 - 1) * innerX;
            y = CEIL_Y - SURFACE_GAP - depth;
        } else {
            x = (Math.random() * 2 - 1) * innerX;
            y = FLOOR_Y + SURFACE_GAP + depth;
        }

        /* Пустая воронка вдоль взгляда.

           Чем ближе звезда к оси взгляда, тем раньше ей предел по глубине.
           Иначе дальние звёзды сходятся в точку схода и собираются там в
           облако, а чёрный квадрат за ними перестаёт читаться пустотой. */
        const near = this.particleNearZ();
        const radial = Math.hypot(x, y - this.camera.position.y);
        const far = Math.max(CORRIDOR_FAR, this.camera.position.z - radial / CLEAR_CONE);

        layer.x[index] = x;
        layer.y[index] = y;
        layer.near[index] = near;
        layer.far[index] = far;
    }

    // Ближе этого к камере пылинок не бывает; работает и на ходу по коридору
    particleNearZ() {
        return this.camera.position.z - PARTICLE_NEAR;
    }

    /* Круглая пылинка вместо квадрата.

       PointsMaterial без карты рисует точку квадратом. Пока точка размером в
       пару пикселей, этого не видно. Но размер точки на экране растёт обратно
       расстоянию: частица, подошедшая к камере, раздувалась в большой
       непрозрачный квадрат — это и было видно на телефоне.

       Ядро держим плотным до 35% радиуса: иначе дальние частицы в два-три
       пикселя выцветают и звёздное поле в конце коридора тускнеет. */
    createParticleSprite() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const half = size / 2;

        const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    /* ТРИ СЛОЯ ЗВЁЗД РАЗНОГО РАЗМЕРА.

       Прежде все пылинки были одного размера — коридор от этого читался
       плоским: по одинаковым точкам глаз не понимает, что ближе, а что
       дальше. Теперь звёзд три сорта. Мелкой пыли много, она держит фон;
       средних меньше; крупных совсем немного, и они проплывают близко,
       заметно обгоняя остальных.

       Размер на экране всё равно падает с расстоянием (sizeAttenuation),
       так что вместе эти три сорта дают разброс примерно от половины
       пикселя у дальней пыли до трёх с половиной у ближней крупной. */
    buildPerimeterParticles() {
        const kinds = [
            { count: 1100, size: 0.035, color: 0xbfd0ff, slow: 0.25, fast: 0.70 },
            { count: 550,  size: 0.055, color: 0xffe9b5, slow: 0.50, fast: 1.40 },
            { count: 150,  size: 0.090, color: 0xfff6de, slow: 0.95, fast: 2.30 }
        ];

        const sprite = this.createParticleSprite();
        this.starLayers = [];
        this.particleCount = kinds.reduce((sum, kind) => sum + kind.count, 0);

        for (const kind of kinds) {
            const layer = {
                count: kind.count,
                pos: new Float32Array(kind.count * 3),
                x: new Float32Array(kind.count),
                y: new Float32Array(kind.count),
                near: new Float32Array(kind.count),
                far: new Float32Array(kind.count),
                speed: new Float32Array(kind.count)
            };

            for (let i = 0; i < kind.count; i++) {
                this.placeStar(layer, i);
                layer.speed[i] = kind.slow + Math.random() * (kind.fast - kind.slow);

                // Первый раз звёзды раскиданы по всей длине, а не выстроены
                // в одну плоскость: коридор полон с первого кадра.
                const span = layer.near[i] - layer.far[i];
                layer.pos[i * 3] = layer.x[i];
                layer.pos[i * 3 + 1] = layer.y[i];
                layer.pos[i * 3 + 2] = layer.far[i] + Math.random() * span;
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(layer.pos, 3));

            /* Светящаяся пыль: круглая карта, сложение света, без записи глубины.

               depthWrite: false — чтобы пылинки не загораживали друг друга и
               не спорили за глубину. Проверка глубины остаётся включённой,
               поэтому стены коридора и задняя заглушка их закрывают. */
            layer.mat = new THREE.PointsMaterial({
                color: kind.color,
                size: kind.size,
                sizeAttenuation: true,
                map: sprite,
                transparent: true,
                opacity: 1,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            layer.mesh = new THREE.Points(geo, layer.mat);
            this.corridorGroup.add(layer.mesh);
            this.starLayers.push(layer);
        }
    }

    // Звёзды коридора целиком: прячутся на время прыжка в туннель
    setStarsVisible(visible) {
        if (!this.starLayers) return;
        for (const layer of this.starLayers) layer.mesh.visible = visible;
    }

    /* Ход звёзд: только вдоль коридора, шагом по времени кадра.

       Шаг считается от clock.getDelta(), поэтому на быстром и на медленном
       телефоне звёзды плывут одинаково, а не дёргаются вслед за частотой
       кадров.

       Дойдя до своего ближнего края, звезда уходит на свой же дальний — не
       на общий. Каждая ходит по своему отрезку, поэтому ни общей плоскости
       прилёта, ни провала в плотности не возникает. */
    moveStars(delta) {
        if (!this.starLayers) return;
        const shift = this.camera.position.z - this.starCamZ;
        this.starCamZ = this.camera.position.z;

        for (const layer of this.starLayers) {
            const pos = layer.mesh.geometry.attributes.position.array;

            for (let i = 0; i < layer.count; i++) {
                // Человек прошёл по коридору — края едут вместе с ним
                if (shift !== 0) {
                    layer.near[i] += shift;
                    layer.far[i] = Math.max(CORRIDOR_FAR, layer.far[i] + shift);
                }

                let z = pos[i * 3 + 2] + layer.speed[i] * delta;
                const near = layer.near[i];
                const far = layer.far[i];
                const span = near - far;

                if (span > 0.5) {
                    while (z > near) z -= span;
                    if (z < far) z = far;
                } else if (z > near) {
                    z = far;
                }

                pos[i * 3 + 2] = z;
            }

            layer.mesh.geometry.attributes.position.needsUpdate = true;
        }
    }

    buildDoorExplosion() {
        this.doorParticlesCount = 5000;
        const dpGeo = new THREE.BufferGeometry();
        const dpPos = new Float32Array(this.doorParticlesCount * 3);
        this.dpTarget = new Float32Array(this.doorParticlesCount * 3);

        for (let i = 0; i < this.doorParticlesCount; i++) {
            dpPos[i*3] = 0; dpPos[i*3+1] = 0; dpPos[i*3+2] = 0;
            
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1); 
            const radius = 1.0 + Math.random() * 3.5; 

            this.dpTarget[i*3] = Math.sin(phi) * Math.cos(theta) * radius;
            this.dpTarget[i*3+1] = Math.sin(phi) * Math.sin(theta) * radius;
            this.dpTarget[i*3+2] = Math.cos(phi) * radius;
        }

        dpGeo.setAttribute('position', new THREE.BufferAttribute(dpPos, 3));
        this.doorExplosionMat = new THREE.PointsMaterial({
            color: 0xffffff, size: 0.01, transparent: true, blending: THREE.AdditiveBlending, opacity: 0
        });
        this.doorExplosionMesh = new THREE.Points(dpGeo, this.doorExplosionMat);
        this.doorExplosionMesh.visible = false;
        this.scene.add(this.doorExplosionMesh);
    }

    buildQuantumTunnel() {
        this.tunnelCount = 5000;
        const tGeo = new THREE.BufferGeometry();
        const tPos = new Float32Array(this.tunnelCount * 3);
        
        this.tunnelAngles = new Float32Array(this.tunnelCount);
        this.tunnelRadii = new Float32Array(this.tunnelCount);

        for (let i = 0; i < this.tunnelCount; i++) {
            this.tunnelAngles[i] = Math.random() * Math.PI * 2;
            this.tunnelRadii[i] = 3.0 + Math.random() * 4.0; 
            tPos[i * 3 + 2] = 10 - Math.random() * 250; 
        }
        
        tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
        this.tunnelMat = new THREE.PointsMaterial({
            color: 0xffffff, size: 0.03, transparent: true, blending: THREE.AdditiveBlending
        });
        this.tunnelMesh = new THREE.Points(tGeo, this.tunnelMat);
        this.tunnelMesh.visible = false; 
        this.scene.add(this.tunnelMesh);
    }

    createInfinitySymbol(colorStr) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Лемниската Жероно: x = cos t, y = sin t * cos t.
        // Даёт вытянутый знак бесконечности с тонкой талией — вместо прежней
        // «перевёрнутой восьмёрки», собранной из двух окружностей.
        const cx = 128, cy = 64, a = 100, b = 36;

        const trace = () => {
            ctx.beginPath();
            for (let i = 0; i <= 360; i++) {
                const t = (i / 360) * Math.PI * 2;
                const x = cx + a * Math.cos(t);
                const y = cy + b * Math.sin(2 * t);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        };

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.strokeStyle = colorStr;
        ctx.shadowColor = colorStr;
        ctx.shadowBlur = 22;
        ctx.lineWidth = 7;
        trace();

        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = '#fff6e0';
        trace();

        return new THREE.CanvasTexture(canvas);
    }

    setupRealities(realitiesArray) {
        this.activeDoorMeshes.forEach(d => this.corridorGroup.remove(d.group));
        this.activeDoorMeshes = [];

        const colors = ['#00f0ff', '#ff007f', '#e5a93c', '#00ff88', '#9d00ff', '#ff3300', '#0044ff'];
        
        const doorXDist = this.doorX; 
        
        for (let i = 0; i < 8; i++) {
            const isLeft = i % 2 === 0;
            const zPos = -3 - Math.floor(i / 2) * (this.isMobile ? 8 : 6); 
            const xPos = isLeft ? -doorXDist : doorXDist;
            
            const isEighthDoor = (i === 7);
            const isActive = i < realitiesArray.length && !isEighthDoor;
            const doorColor = isActive ? colors[i % colors.length] : '#222222';

            const group = new THREE.Group();
            group.position.set(xPos, -0.4, zPos);
            group.rotation.y = isLeft ? Math.PI / 2 : -Math.PI / 2; 

            const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(doorColor) });
            const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.2), frameMat);
            frameL.position.set(-1.25, 0, -0.1);
            const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.2), frameMat);
            frameR.position.set(1.25, 0, -0.1);
            const frameT = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.2), frameMat);
            frameT.position.set(0, 2.15, -0.1);
            const frameB = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.2), frameMat);
            frameB.position.set(0, -2.15, -0.1);
            group.add(frameL, frameR, frameT, frameB);

            const darkRoomMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const darkRoomMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.2), darkRoomMat);
            darkRoomMesh.position.set(0, 0, -0.15); 
            group.add(darkRoomMesh);

            const doorLeaf = new THREE.Group();
            const hingeX = isLeft ? 1.2 : -1.2;
            doorLeaf.position.set(hingeX, 0, 0); 

            const doorMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.6, metalness: 0.3 });
            const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.2, 0.1), doorMat);
            leafMesh.userData = { isEighth: isEighthDoor, index: i, isActive }; 
            
            leafMesh.position.set(-hingeX, 0, 0); 
            doorLeaf.add(leafMesh);

            const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(doorColor) });
            const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(2.42, 4.22, 0.02), edgeMat);
            edgeMesh.position.set(-hingeX, 0, 0);
            doorLeaf.add(edgeMesh);

            const handle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 0.4),
                new THREE.MeshStandardMaterial({ color: doorColor, emissive: isActive ? doorColor : 0x000 })
            );
            handle.position.set(isLeft ? -2.1 : 2.1, 0, 0.15);
            doorLeaf.add(handle);

            if (isActive) {
                const symbolTex = this.createInfinitySymbol(doorColor);
                const symbolMat = new THREE.MeshBasicMaterial({ map: symbolTex, transparent: true, blending: THREE.AdditiveBlending });
                const symbolMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), symbolMat);
                symbolMesh.position.set(-hingeX, 0.5, 0.06);
                doorLeaf.add(symbolMesh);
            }

            group.add(doorLeaf);
            this.corridorGroup.add(group);

            this.activeDoorMeshes.push({
                group, doorLeaf, doorMesh: leafMesh, handle, 
                text: realitiesArray[i] || '', index: i, isLeft, isActive, doorColor
            });
        }
    }

    startAnimation() {
        this.isRunning = true;
        this.isSelecting = false;
        this.tunnelMode = false;
        this.introBurst = 0; 
        this.corridorGroup.visible = true;
        this.setStarsVisible(true);
        this.tunnelMesh.visible = false;
        this.scene.background = null;
        this.camera.position.set(0, 1, 5);
        this.camera.rotation.set(0, 0, 0);
        this.viewYaw = 0;
        this.walkZ = 5;
        this.starCamZ = 5;

        /* Возвращаем угол обзора коридора.

           Сцена живёт одна на все заходы (app.js создаёт её один раз).
           Туннель переключал камеру на свой широкий угол и обратно его не
           возвращал — на втором заходе коридор оказывался шире, чем нужно,
           и крайние двери уходили за край кадра. */
        this.camera.fov = this.isMobile ? 85 : 60;
        this.camera.updateProjectionMatrix();

        // Окно приложения к этому мигу уже разложено по месту — ширину
        // коридора пересчитываем по настоящему размеру кадра, а не по тому,
        // каким он был в миг сборки сцены.
        this.refitCorridor();
        if (this.hand) this.hand.style.display = 'none';
        this.animate();
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        if (!this.tunnelMode) {
            this.moveStars(delta);
        } else {
            const positions = this.tunnelMesh.geometry.attributes.position.array;
            for (let i = 0; i < this.tunnelCount; i++) {
                let z = positions[i * 3 + 2] + 200.0 * delta; 
                if (z > 5) z = -250; 
                positions[i * 3 + 2] = z;

                const angle = this.tunnelAngles[i];
                const r = this.tunnelRadii[i];
                
                const bendX = (Math.sin(z * 0.015)) * 8;
                const bendY = (Math.cos(z * 0.01) - 1) * 8; 
                
                positions[i * 3] = Math.cos(angle) * r + bendX;
                positions[i * 3 + 1] = Math.sin(angle) * r + bendY;
            }
            this.tunnelMesh.geometry.attributes.position.needsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    /* УПРАВЛЕНИЕ ПАЛЬЦЕМ.

       Прежде выбор двери срабатывал прямо по touchstart: любое движение по
       экрану открывало ту дверь, с которой начался палец, и осмотреться было
       нельзя. Теперь нажатие дослушивается до конца. Палец почти не сдвинулся
       и отпущен быстро — это тап по двери. Повело вверх или вниз — идём по
       коридору, вбок — поворачиваем голову.

       Pointer Events охватывают и палец, и мышь одним кодом: в приложении это
       касания, на компьютере — прежний клик и перетаскивание мышью. */
    initPointerControls() {
        const canvas = this.renderer.domElement;
        canvas.style.touchAction = 'none';   // иначе систему уведёт в прокрутку и зум

        let active = false;
        let startX = 0, startY = 0, startTime = 0;
        let lastX = 0, lastY = 0, moved = 0;

        canvas.addEventListener('pointerdown', e => {
            if (!this.navigationAllowed()) return;
            active = true;
            moved = 0;
            startX = lastX = e.clientX;
            startY = lastY = e.clientY;
            startTime = performance.now();
            try { canvas.setPointerCapture(e.pointerId); } catch { /* браузер без захвата */ }
        });

        canvas.addEventListener('pointermove', e => {
            if (!active) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            moved += Math.abs(dx) + Math.abs(dy);
            if (moved < TAP_SLOP) return;    // мелкое дрожание пальца — ещё не жест
            this.lookBy(dx);
            this.walkBy(dy);
        });

        canvas.addEventListener('pointerup', e => {
            if (!active) return;
            active = false;
            try { canvas.releasePointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }

            const slid = Math.hypot(e.clientX - startX, e.clientY - startY);
            const held = performance.now() - startTime;
            if (slid <= TAP_SLOP && held <= TAP_TIME) this.pickDoorAt(e.clientX, e.clientY);
        });

        canvas.addEventListener('pointercancel', () => { active = false; });
    }

    // Пока идёт выбор двери или полёт по туннелю, управление отключено:
    // кинематографическая часть не должна спорить с пальцем.
    navigationAllowed() {
        return this.isRunning && !this.isSelecting && !this.tunnelMode;
    }

    // Поворот головы. Палец ведёт сцену за собой: тянем вправо — взгляд уходит
    // влево. Предел — почти прямой угол, чтобы коридор не пропал из виду.
    lookBy(dx) {
        this.viewYaw = clamp(this.viewYaw + dx * LOOK_SPEED, -LOOK_LIMIT, LOOK_LIMIT);
        this.camera.rotation.set(0, this.viewYaw, 0);
    }

    // Шаг вдоль коридора. Строго по оси Z, как бы ни была повёрнута голова:
    // так не пройдёшь сквозь стену и не выйдешь за край пола.
    walkBy(dy) {
        this.walkZ = clamp(this.walkZ + dy * WALK_SPEED, WALK_FORWARD, WALK_BACK);
        this.camera.position.z = this.walkZ;
    }

    /* ПОПАДАНИЕ ПО ДВЕРИ.

       Исправлены два прежних промаха. Координаты берём из прямоугольника
       самого холста, а не из размеров окна: при малейшем расхождении — полоса
       состояния, вырез экрана — луч уходил мимо. И проверяем всю группу двери
       целиком (косяк, полотно, ручку), а не одно полотно: попасть пальцем в
       узкую створку на телефоне трудно. */
    pickDoorAt(clientX, clientY) {
        if (this.isSelecting || !this.isRunning) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.activeDoorMeshes.map(d => d.group), true);
        if (intersects.length === 0) return;

        const chosen = this.doorOf(intersects[0].object);
        if (!chosen || !chosen.doorMesh.userData.isActive) return;

        this.isSelecting = true;
        this.triggerSelectionSequence(chosen);
    }

    // От задетого лучом кусочка поднимаемся вверх до группы своей двери
    doorOf(object) {
        for (let node = object; node; node = node.parent) {
            const found = this.activeDoorMeshes.find(d => d.group === node);
            if (found) return found;
        }
        return null;
    }

    triggerSelectionSequence(chosen) {
        this.hand.style.display = 'block';
        this.hand.style.transition = 'left 1.2s ease-in-out, top 1.2s ease-in-out';

        const handlePos = new THREE.Vector3();
        chosen.handle.getWorldPosition(handlePos);
        handlePos.project(this.camera);
        const x = (handlePos.x * .5 + .5) * window.innerWidth;
        const y = (handlePos.y * -.5 + .5) * window.innerHeight;
        
        setTimeout(() => {
            this.hand.style.left = `${x}px`;
            this.hand.style.top = `${y}px`;
        }, 50);

        setTimeout(() => {
            this.hand.style.transition = 'none'; 
            
            let progress = 0;
            const openInterval = setInterval(() => {
                progress += 0.015; 
                if (progress > 1) progress = 1;
                const easeP = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                
                chosen.doorLeaf.rotation.y = (chosen.isLeft ? Math.PI * 0.6 : -Math.PI * 0.6) * easeP;

                const currentHandlePos = new THREE.Vector3();
                chosen.handle.getWorldPosition(currentHandlePos);
                currentHandlePos.project(this.camera);
                const hx = (currentHandlePos.x * .5 + .5) * window.innerWidth;
                const hy = (currentHandlePos.y * -.5 + .5) * window.innerHeight;
                this.hand.style.left = `${hx}px`;
                this.hand.style.top = `${hy}px`;

                if (progress >= 1) {
                    clearInterval(openInterval);
                    this.hand.style.display = 'none'; 
                    setTimeout(() => this.triggerVacuumAndTunnel(chosen), 200);
                }
            }, 16);
        }, 1300);
    }

    triggerVacuumAndTunnel(chosen) {
        const startZ = this.camera.position.z;
        const startX = this.camera.position.x;
        const startY = this.camera.position.y;
        
        const exactDoorX = chosen.group.position.x; 
        const exactDoorY = -0.4;
        const targetZ = chosen.group.position.z;
        
        // В узком коридоре телефона камера не должна уехать сквозь стену
        const oppositeX = (chosen.isLeft ? 1 : -1) * Math.min(3.0, this.wallX - 0.6);
        
        let phase = 0; 
        let progress = 0;
        const startFov = this.camera.fov;

        // Откуда начинается взгляд. Если головой не вертели, это ровно прежняя
        // точка (0, startY, startZ - 10) и пролёт идёт как раньше. Если
        // вертели — камера не дёргается в первый же кадр.
        const startLook = new THREE.Vector3(0, 0, -10)
            .applyQuaternion(this.camera.quaternion)
            .add(this.camera.position);

        const sequenceInterval = setInterval(() => {
            if (phase === 0) {
                progress += 0.025; 
                if (progress > 1) progress = 1;
                const easeP = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                
                this.camera.position.x = THREE.MathUtils.lerp(startX, oppositeX, easeP);
                this.camera.position.y = THREE.MathUtils.lerp(startY, exactDoorY, easeP);
                this.camera.position.z = THREE.MathUtils.lerp(startZ, targetZ, easeP); 
                
                const lookX = THREE.MathUtils.lerp(startLook.x, exactDoorX, easeP);
                const lookY = THREE.MathUtils.lerp(startLook.y, exactDoorY, easeP); 
                const lookZ = THREE.MathUtils.lerp(startLook.z, targetZ, easeP);
                this.camera.lookAt(lookX, lookY, lookZ); 

                if (progress === 1) { 
                    const lookTargetX = chosen.isLeft ? exactDoorX - 10 : exactDoorX + 10;
                    this.camera.lookAt(lookTargetX, exactDoorY, targetZ);
                    phase = 2; progress = 0; 
                }
            }
            else if (phase === 2) {
                if (progress === 0) {
                    this.doorExplosionMesh.visible = true;
                    this.doorExplosionMat.opacity = 1;
                    this.doorExplosionMesh.position.set(exactDoorX, exactDoorY, targetZ);
                }

                progress += 0.04; 
                if (progress > 1) {
                    progress = 1;
                    phase = 4;
                }

                const easeOut = 1 - Math.pow(1 - progress, 5); 
                const positions = this.doorExplosionMesh.geometry.attributes.position.array;
                
                for (let i = 0; i < this.doorParticlesCount; i++) {
                    positions[i*3] = this.dpTarget[i*3] * easeOut;
                    positions[i*3+1] = this.dpTarget[i*3+1] * easeOut;
                    positions[i*3+2] = this.dpTarget[i*3+2] * easeOut;
                }
                this.doorExplosionMesh.geometry.attributes.position.needsUpdate = true;
                
                if (progress === 1) progress = 0;
            }
            else if (phase === 4) {
                progress += 0.0025;
                if (progress > 1) progress = 1;

                const easeIn = Math.pow(progress, 3);
                const positions = this.doorExplosionMesh.geometry.attributes.position.array;
                
                for (let i = 0; i < this.doorParticlesCount; i++) {
                    positions[i*3] = this.dpTarget[i*3] * (1 - easeIn);
                    positions[i*3+1] = this.dpTarget[i*3+1] * (1 - easeIn);
                    positions[i*3+2] = this.dpTarget[i*3+2] * (1 - easeIn);
                }
                this.doorExplosionMesh.geometry.attributes.position.needsUpdate = true;

                this.camera.position.x = THREE.MathUtils.lerp(oppositeX, exactDoorX, easeIn);
                
                this.camera.fov = startFov + (70 * easeIn); 
                this.camera.updateProjectionMatrix();

                if (progress === 1) {
                    clearInterval(sequenceInterval);
                    this.doorExplosionMesh.visible = false;
                    this.startQuantumTunnel(chosen, startFov);
                }
            }
        }, 16);
    }

    startQuantumTunnel(chosen, originalFov) {
        this.tunnelMode = true;
        
        this.camera.fov = this.isMobile ? 90 : 75;
        this.camera.updateProjectionMatrix();

        this.corridorGroup.visible = false;
        this.tunnelMesh.visible = true;
        this.scene.background = new THREE.Color(0x000000);
        
        this.camera.position.set(0, 0, 0); 
        this.camera.rotation.set(0, 0, 0);

        setTimeout(() => {
            this.isRunning = false;
            this.onDoorSelect(chosen.index, chosen.text);
        }, 4500);
    }

    resize() {
        this.checkMobile();
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.aspect = aspect;
        this.camera.fov = this.isMobile ? 85 : 60;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.refitCorridor();
    }

    /* ПЕРЕСЧЁТ ШИРИНЫ КОРИДОРА ПОД КАДР.

       Раньше ширина считалась один раз при сборке сцены. В приложении кадр
       успевает измениться после этого — полоса состояния, поворот экрана,
       разворот на весь экран, — и коридор оставался рассчитанным под старый
       размер: крайние двери уезжали за край. Теперь стены и двери переезжают
       вместе с кадром. Пропорции, цвета и расстановка по длине не меняются —
       двигается только отступ от середины. */
    refitCorridor() {
        this.fitCorridorWidth();
        if (this.leftWall) this.leftWall.position.x = -this.wallX;
        if (this.rightWall) this.rightWall.position.x = this.wallX;
        for (const door of this.activeDoorMeshes) {
            door.group.position.x = door.isLeft ? -this.doorX : this.doorX;
        }
        // Стены переехали — звёзды переставляются к ним, иначе часть
        // осталась бы висеть снаружи коридора
        this.rebuildStars();
    }

    // Раздать звёздам новые места у нынешних стен, сохранив их скорости
    rebuildStars() {
        if (!this.starLayers) return;
        this.starCamZ = this.camera.position.z;

        for (const layer of this.starLayers) {
            for (let i = 0; i < layer.count; i++) {
                this.placeStar(layer, i);
                const span = layer.near[i] - layer.far[i];
                layer.pos[i * 3] = layer.x[i];
                layer.pos[i * 3 + 1] = layer.y[i];
                layer.pos[i * 3 + 2] = layer.far[i] + Math.random() * span;
            }
            layer.mesh.geometry.attributes.position.needsUpdate = true;
        }
    }
}