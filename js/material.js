import * as THREE from 'three';

// ─── Texture loader ───────────────────────────────────────────────────────────

const texLoader = new THREE.TextureLoader();

function loadTex(path, colorSpace = THREE.NoColorSpace) {
    return new Promise((resolve) => {
        texLoader.load(
            path,
            (tex) => {
                tex.colorSpace = colorSpace;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            },
            undefined,
            () => {
                console.warn(`[materials] Texture not found: ${path}`);
                resolve(null);
            }
        );
    });
}

// ─── Material library ─────────────────────────────────────────────────────────
//
// Keys must match material names set in Blender.
// Supported PBR texture slots (all use UV0):
//   map           diffuse/albedo   — sRGB
//   roughnessMap  roughness        — linear
//   metalnessMap  metalness        — linear
//   sheenColorMap sheen color      — sRGB
//   colorFallback hex fallback when map is absent or fails to load
//   + any other MeshStandard/PhysicalMaterial params
//
// AO/shadow maps are model-level (see MODEL_AO below) and use UV1.
// Materials not listed here are left as-is from the GLTF.

export const MATERIAL_LIBRARY = {
    'Fabric_LightGrey': {
        type:           'physical',
        map:            'assets/models/textures/fabric_120_color.webp',
        roughnessMap:   'assets/models/textures/fabric_120_roughness.webp',
        metalnessMap:   'assets/models/textures/fabric_120_metalness.webp',
        sheenColorMap:  'assets/models/textures/fabric_120_sheen.webp',
        colorFallback:  0xc8a882,
        roughness:      0.85,
        metalness:      0,
        sheen:          0.01,
        sheenColor:     new THREE.Color(0xd4b896),
        sheenRoughness: 0.01,
    },
    'Fabric_Old_Grey': {
        type:          'standard',
        map:           'assets/models/textures/fabric01_diffuse.webp',
        roughnessMap:  'assets/models/textures/fabric01_roughness.webp',
        colorFallback: 0xc8a882,
        roughness:     0.4,
        metalness:     0.1,
    },
    'Fabric_Old_Blue': {
        type:          'standard',
        map:           'assets/models/textures/fabric01_diffuse.webp',
        roughnessMap:  'assets/models/textures/fabric01_roughness.webp',
        colorFallback: 0xc8a882,
        roughness:     0.4,
        metalness:     0.1,
    },
    'Carpet_Beige': {
        type:          'standard',
        map:           'assets/models/textures/fabric01_diffuse.webp',
        roughnessMap:  'assets/models/textures/fabric01_roughness.webp',
        colorFallback: 0xc8a882,
        roughness:     0.4,
        metalness:     0.1,
    },
    'Legs_Wood': {
        type:          'standard',
        colorFallback: 0x8b7355,
        roughness:     0.5,
        metalness:     0,
    },
};

// ─── Per-model shadow maps ────────────────────────────────────────────────────
//
// Key: exact filename from data-model attribute.
// Texture is applied to meshes with material named 'shadowMap' (UV1, transparent).
// If the mesh has no UV1, falls back to UV0 with a console warning.

export const MODEL_AO = {
    'sofa.gltf': 'assets/models/textures/shadowMap_AO/sofa_AO.webp',
};

// ─── Build a Three.js material from a descriptor ──────────────────────────────

// Slots and their expected colorSpace
const TEX_SLOTS = {
    map:           THREE.SRGBColorSpace,
    roughnessMap:  THREE.NoColorSpace,
    metalnessMap:  THREE.NoColorSpace,
    sheenColorMap: THREE.SRGBColorSpace,
};

async function buildMaterial(desc) {
    const { type, colorFallback, ...params } = desc;
    const Ctor = type === 'physical' ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;

    // Strip texture path strings from params before passing to constructor
    const slotKeys = Object.keys(TEX_SLOTS);
    const matParams = Object.fromEntries(
        Object.entries(params).filter(([k]) => !slotKeys.includes(k))
    );
    const mat = new Ctor({ color: colorFallback, ...matParams });

    await Promise.all(
        slotKeys.map(async (slot) => {
            const path = desc[slot];
            if (!path) return;
            const tex = await loadTex(path, TEX_SLOTS[slot]);
            if (tex) {
                tex.channel = 0;
                mat[slot] = tex;
                mat.needsUpdate = true;
            }
        })
    );

    return mat;
}

// ─── Caches ───────────────────────────────────────────────────────────────────

const matCache    = new Map();   // keyed by material name
const aoCache     = new Map();   // keyed by model filename
const shadowCache = new Map();   // keyed by model filename

async function getMaterial(name) {
    if (!matCache.has(name)) {
        matCache.set(name, await buildMaterial(MATERIAL_LIBRARY[name]));
    }
    return matCache.get(name);
}

async function getAO(filename) {
    if (!aoCache.has(filename)) {
        const path = MODEL_AO[filename];
        const tex = path ? await loadTex(path, THREE.NoColorSpace) : null;
        aoCache.set(filename, tex);
    }
    return aoCache.get(filename);
}

async function getShadowMaterial(filename) {
    if (!shadowCache.has(filename)) {
        const tex = await getAO(filename);
        if (!tex) { shadowCache.set(filename, null); return null; }
        tex.repeat.set(1, -1);  // Blender UV1 V-axis is flipped
        const mat = new THREE.MeshBasicMaterial({
            map:        tex,
            blending:   THREE.MultiplyBlending,
            depthWrite: false,
            transparent: true,
        });
        shadowCache.set(filename, mat);
    }
    return shadowCache.get(filename);
}

// ─── Apply library overrides to a loaded model ────────────────────────────────

export async function applyMaterials(model, modelPath) {
    const filename = modelPath.split('/').pop();

    const hits = [];
    const shadowNodes = [];
    model.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const name = node.material.name;
        if (name === 'shadowMap')        shadowNodes.push(node);
        else if (MATERIAL_LIBRARY[name]) hits.push({ node, name });
    });

    const [shadowMat] = await Promise.all([
        getShadowMaterial(filename),
        ...hits.map(async ({ node, name }) => {
            node.material = await getMaterial(name);
        }),
    ]);

    for (const node of shadowNodes) {
        if (!shadowMat) { console.warn(`[materials] No MODEL_AO entry for ${filename} — shadowMap left as GLTF default`); continue; }
        const hasUV1 = !!(node.geometry.attributes.uv1 ?? node.geometry.attributes.uv2);
        if (!hasUV1) console.warn(`[materials] ${node.name} has no UV1 — shadowMap falling back to UV0`);
        shadowMat.map.channel = hasUV1 ? 1 : 0;
        node.material = shadowMat;
    }
}
