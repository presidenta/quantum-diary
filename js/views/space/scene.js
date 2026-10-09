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

export class QuantumCorridorScene {
    constructor(canvasContainer, onDoorSelectCallback) {
        this.container = canvasContainer;
        this.onDoorSelect = onDoorSelectCallback;
        this.activeDoorMeshes = [];
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.isSelecting = false;
        this.tunnelMode = false;
        this.introBurst = 0; 
        
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
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
        this.renderer.domElement.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) this.onClick(e.touches[0]);
        }, { passive: false });
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

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 100), floorMat);
        floor.rotation.x = -Math.PI / 2; 
        floor.position.y = -2.5;
        
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 100), ceilMat);
        ceiling.rotation.x = Math.PI / 2; 
        ceiling.position.y = 4.5;

        const wallX = this.wallX;
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(100, 7), wallMat);
        leftWall.rotation.y = Math.PI / 2; 
        leftWall.position.set(-wallX, 1, -40);

        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(100, 7), wallMat);
        rightWall.rotation.y = -Math.PI / 2; 
        rightWall.position.set(wallX, 1, -40);

        // Черный квадратик в самом конце коридора (без изменений)
        const endSquareGeo = new THREE.PlaneGeometry(2.4, 4.2);
        const endSquareMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const endSquare = new THREE.Mesh(endSquareGeo, endSquareMat);
        endSquare.position.set(0, 1, -85);

        // Светящаяся тонкая рамка вокруг черного квадрата
        const endFrameGeo = new THREE.BoxGeometry(2.5, 4.3, 0.05);
        const endFrameMat = new THREE.MeshBasicMaterial({ color: 0xe5a93c });
        const endFrame = new THREE.Mesh(endFrameGeo, endFrameMat);
        endFrame.position.set(0, 1, -85.1);

        this.corridorGroup.add(floor, ceiling, leftWall, rightWall, endSquare, endFrame);
    }

    spawnParticleOutside(index) {
        const wallX = this.wallX;
        const side = Math.floor(Math.random() * 4); // 0: Левая, 1: Правая, 2: Потолок, 3: Пол
        const depth = Math.random() * 20; // Глубина рассеивания за стенами
        const span = 40; // Широкое рассредоточение

        if (side === 0) { 
            this.pTargets[index * 3] = -wallX - depth;
            this.pTargets[index * 3 + 1] = (Math.random() - 0.5) * span;
        } else if (side === 1) { 
            this.pTargets[index * 3] = wallX + depth;
            this.pTargets[index * 3 + 1] = (Math.random() - 0.5) * span;
        } else if (side === 2) { 
            this.pTargets[index * 3] = (Math.random() - 0.5) * span;
            this.pTargets[index * 3 + 1] = 4.5 + depth;
        } else { 
            this.pTargets[index * 3] = (Math.random() - 0.5) * span;
            this.pTargets[index * 3 + 1] = -2.5 - depth;
        }

        // Плотное распределение с самого начала: заполняем пространство далеко за пределы коридора
        this.pTargets[index * 3 + 2] = 10 - Math.random() * 150; 

        // Исключаем блокировку точки схода черного квадрата в центре
        if (Math.abs(this.pTargets[index * 3]) < 2.5 && Math.abs(this.pTargets[index * 3 + 1] - 1) < 3.2) {
            this.pTargets[index * 3] += (this.pTargets[index * 3] >= 0 ? 3 : -3);
        }
    }

    buildPerimeterParticles() {
        this.particleCount = 7000; // Увеличенное число частиц для полного заполнения пространства
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(this.particleCount * 3);

        this.pTargets = new Float32Array(this.particleCount * 3);
        this.pVelocities = new Float32Array(this.particleCount * 3); // Плавные вектора скорости

        for (let i = 0; i < this.particleCount; i++) {
            this.spawnParticleOutside(i);

            // Частицы предварительно плотно распределены по объему с первой секунды
            pPos[i * 3] = this.pTargets[i * 3];
            pPos[i * 3 + 1] = this.pTargets[i * 3 + 1];
            pPos[i * 3 + 2] = this.pTargets[i * 3 + 2];

            // Плавающие скорости
            this.pVelocities[i * 3] = (Math.random() - 0.5) * 0.15;
            this.pVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
            this.pVelocities[i * 3 + 2] = 0.5 + Math.random() * 1.5; // Медленно плывут на камеру
        }

        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        this.particlesMat = new THREE.PointsMaterial({
            color: 0xffcc00, size: 0.025, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
        });
        this.particlesMesh = new THREE.Points(pGeo, this.particlesMat);
        this.corridorGroup.add(this.particlesMesh);
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
        this.particlesMesh.visible = true;
        this.tunnelMesh.visible = false;
        this.scene.background = null;
        this.camera.position.set(0, 1, 5);
        this.camera.rotation.set(0, 0, 0);
        if (this.hand) this.hand.style.display = 'none';
        this.animate();
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        if (!this.tunnelMode) {
            // Рассредоточенные плавающие частицы
            const positions = this.particlesMesh.geometry.attributes.position.array;
            for (let i = 0; i < this.particleCount; i++) {
                positions[i * 3] += this.pVelocities[i * 3] * delta;
                positions[i * 3 + 1] += this.pVelocities[i * 3 + 1] * delta;
                positions[i * 3 + 2] += this.pVelocities[i * 3 + 2] * delta;

                // Зацикливание: когда частицы выходят за камеру, они возвращаются глубоко назад (-140)
                if (positions[i * 3 + 2] > 10) {
                    this.spawnParticleOutside(i);
                    positions[i * 3] = this.pTargets[i * 3];
                    positions[i * 3 + 1] = this.pTargets[i * 3 + 1];
                    positions[i * 3 + 2] = -140; 
                }
            }
            this.particlesMesh.geometry.attributes.position.needsUpdate = true;
            
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

    onClick(e) {
        if (this.isSelecting || !this.isRunning) return;

        this.mouse.x = (e.clientX ? (e.clientX / window.innerWidth) * 2 - 1 : (e.touches[0].clientX / window.innerWidth) * 2 - 1);
        this.mouse.y = (e.clientY ? -(e.clientY / window.innerHeight) * 2 + 1 : -(e.touches[0].clientY / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.activeDoorMeshes.map(d => d.doorMesh));

        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            if (!mesh.userData.isActive) return;

            const chosen = this.activeDoorMeshes.find(d => d.doorMesh === mesh);
            this.isSelecting = true;
            this.triggerSelectionSequence(chosen);
        }
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

        const sequenceInterval = setInterval(() => {
            if (phase === 0) {
                progress += 0.025; 
                if (progress > 1) progress = 1;
                const easeP = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                
                this.camera.position.x = THREE.MathUtils.lerp(startX, oppositeX, easeP);
                this.camera.position.y = THREE.MathUtils.lerp(startY, exactDoorY, easeP);
                this.camera.position.z = THREE.MathUtils.lerp(startZ, targetZ, easeP); 
                
                const lookX = THREE.MathUtils.lerp(0, exactDoorX, easeP);
                const lookY = THREE.MathUtils.lerp(startY, exactDoorY, easeP); 
                const lookZ = THREE.MathUtils.lerp(startZ - 10, targetZ, easeP);
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
    }
}