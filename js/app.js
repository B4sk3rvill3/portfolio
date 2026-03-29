import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { applyMaterials } from './material.js';

let scene, camera, renderer, controls, currentModel, floorModel, infiniteFloor;
let isInteracting = false;
let lastInteractionTime = 0;
const idleDelay = 5000; // 5 seconds delay before auto-rotation

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
gltfLoader.setDRACOLoader(dracoLoader);

const BG_COLOR = 0x3d4c5e;
const GRAD_COLOR_OUTER = 0x5c728d;
const GRAD_COLOR_INNER = 0x8f8f8f;

// ─── Lighting config ──────────────────────────────────────────────────────────
const LIGHTS = {
    key:  { color: 0xfff5e0, intensity: 1.8,  pos: [  3,  6,  4 ] },  // warm front-right
    fill: { color: 0xe8f0ff, intensity: 0.4,  pos: [ -4,  3, -3 ] },  // cool left
    rim:  { color: 0xffffff, intensity: 0.6,  pos: [  0,  4, -6 ] },  // back separation
    ambient: { color: 0xffffff, intensity: 0.15 },
};

// ─── Renderer config ──────────────────────────────────────────────────────────
const RENDERER = {
    toneMapping:         THREE.NeutralToneMapping ?? THREE.LinearToneMapping,
    toneMappingExposure: 1.0,
};

function initThree() {
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);
    scene.fog = new THREE.Fog(GRAD_COLOR_OUTER, 15, 40);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping         = RENDERER.toneMapping;
    renderer.toneMappingExposure = RENDERER.toneMappingExposure;

    container.appendChild(renderer.domElement);

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('assets/hdri/white_home_studio_1k.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
    });

    // Three-point lighting
    const keyLight = new THREE.DirectionalLight(LIGHTS.key.color, LIGHTS.key.intensity);
    keyLight.position.set(...LIGHTS.key.pos);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(LIGHTS.fill.color, LIGHTS.fill.intensity);
    fillLight.position.set(...LIGHTS.fill.pos);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(LIGHTS.rim.color, LIGHTS.rim.intensity);
    rimLight.position.set(...LIGHTS.rim.pos);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(LIGHTS.ambient.color, LIGHTS.ambient.intensity));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.saveState();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Floor — radial color gradient fading to transparent at edges (no hard border)
    const innerHex = '#' + new THREE.Color(GRAD_COLOR_INNER).getHexString();
    const outerHex = '#' + new THREE.Color(GRAD_COLOR_OUTER).getHexString();

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 512; colorCanvas.height = 512;
    const colorCtx = colorCanvas.getContext('2d');
    const colorGrad = colorCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
    colorGrad.addColorStop(0, innerHex);
    colorGrad.addColorStop(1, outerHex);
    colorCtx.fillStyle = colorGrad;
    colorCtx.fillRect(0, 0, 512, 512);

    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 512; alphaCanvas.height = 512;
    const alphaCtx = alphaCanvas.getContext('2d');
    const alphaGrad = alphaCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
    alphaGrad.addColorStop(0,   'white');
    alphaGrad.addColorStop(0.6, 'white');
    alphaGrad.addColorStop(1,   'black');
    alphaCtx.fillStyle = alphaGrad;
    alphaCtx.fillRect(0, 0, 512, 512);

    infiniteFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({
            map:      new THREE.CanvasTexture(colorCanvas),
            alphaMap: new THREE.CanvasTexture(alphaCanvas),
            transparent: true,
            depthWrite:  false,
            roughness: 0.6,
            metalness: 0.2,
        })
    );
    infiniteFloor.rotation.x = -Math.PI / 2;
    infiniteFloor.position.y = -0.05;
    scene.add(infiniteFloor);

    gltfLoader.load('assets/models/floor.gltf', (gltf) => {
        floorModel = gltf.scene;
        floorModel.position.y = -0.02;
        scene.add(floorModel);
    });

    window.scene = scene;
    window.THREE = THREE;

    animate();
}

function loadModel(path) {
    gltfLoader.load(
        path,
        async (gltf) => {
            try {
                if (currentModel) scene.remove(currentModel);
                currentModel = gltf.scene;
                currentModel.updateMatrixWorld(true);

                const box = new THREE.Box3().setFromObject(currentModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3()).length();

                currentModel.position.x -= center.x;
                currentModel.position.y -= box.min.y;
                currentModel.position.z -= center.z;

                scene.add(currentModel);
                await applyMaterials(currentModel, path);

                const fogNear = size * 1.5;
                const fogFar = size * 5;
                scene.fog.near = fogNear;
                scene.fog.far = fogFar;

                // Scale floor so gradient fills roughly 3× model radius, alpha fades beyond that
                if (infiniteFloor) {
                    const s = (size * 6) / 1000;
                    infiniteFloor.scale.set(s, s, 1);
                }

                const isLandscape = window.innerWidth > window.innerHeight;
                const zoomFactor = isLandscape ? 1.8 : 1.2;
                const verticalOffset = isLandscape ? size * 0.05 : size * 0.08;

                controls.reset();
                controls.minDistance = size * 0.1;
                controls.maxDistance = size * 2;
                controls.target.set(0, verticalOffset, 0);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;
                controls.minPolarAngle = Math.PI / 6;
                controls.maxPolarAngle = Math.PI / 2;
                controls.enablePan = false;
                controls.autoRotate = true;
                controls.autoRotateSpeed = 1.0;

                controls.addEventListener('start', () => {
                    isInteracting = true;
                    controls.autoRotateSpeed = 1.0;
                });

                controls.addEventListener('end', () => {
                    isInteracting = false;
                    lastInteractionTime = Date.now();
                });

                camera.position.set(size / zoomFactor * 0.5, size / 4, size / zoomFactor);
                camera.near = size / 100;
                camera.far = size * 100;
                camera.updateProjectionMatrix();
                camera.lookAt(controls.target);
                controls.update();

                document.getElementById('threejs-container').style.opacity = '1';
                document.getElementById('modal-loader').style.display = 'none';
            } catch (error) {
                console.error('Error during model setup:', error);
            }
        },
        (xhr) => {
            if (xhr.total) {
                const pct = Math.round(xhr.loaded / xhr.total * 100);
                const loaderEl = document.getElementById('modal-loader');
                if (loaderEl) loaderEl.textContent = `Loading... ${pct}%`;
            }
        },
        (error) => { console.error('GLTF Load Error:', error); }
    );
}

function animate() {
    requestAnimationFrame(animate);

    if (isInteracting) {
        lastInteractionTime = Date.now();
        controls.autoRotate = false;
    } else {
        const timeSinceLastInteraction = Date.now() - lastInteractionTime;
        if (timeSinceLastInteraction > idleDelay) {
            // console.log("Auto-rotate re-engaged"); // Check your console!
            controls.autoRotate = true;
        } else {
            controls.autoRotate = false;
        }
    }

    controls?.update();
    renderer.render(scene, camera);
}

// ─── Modal ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
        const modelPath = card.getAttribute('data-model');
        if (!modelPath) return;

        document.getElementById('tp-modal').style.display = 'block';
        document.getElementById('modal-loader').style.display = 'block';

        if (!renderer) {
            initThree();
        } else {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }

        loadModel(modelPath);
    });
});

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('tp-modal').style.display = 'none';
    document.getElementById('threejs-container').style.opacity = '0';

    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    if (controls) controls.reset();
});