/**
 * main.js — QSim Nuclear + Field layer demo
 *
 * Two layers running in parallel:
 *   Layer 1: Quarks → Hadrons (color confinement, nuclear force)
 *   Layer 2: QuantumField (Chladni patterns, orbital emergence)
 *
 * Element data loaded from /src/elements/{SYMBOL}.json
 * The loadElement callback maps Z → fetch → JSON.
 *
 * Scale: 1 wu = 1 pm. Camera starts at 3 pm — hadronic scale.
 */

import * as THREE                     from 'three';
import { Simulation }      from './src/Simulation.js';
import { QuantumRenderer } from './src/QuantumRenderer.js';
import { QuantumEntity, ENTITY_TYPE, FLAVOR, COLOR, SPIN } from './src/QuantumEntity.js';

// ─── Element loader ───────────────────────────────────────────────────────────
// Maps atomic number Z → element JSON from your /src/elements/ folder.
// Adjust the path to match your actual project structure.
const ELEMENT_SYMBOLS = {
    1: 'H', 2: 'He', 3: 'Li', 4: 'Be', 5: 'B',
    6: 'C', 7: 'N',  8: 'O',  9: 'F',  10: 'Ne',
    // extend as needed — the sim will silently skip unknown Z
};

async function loadElement(Z) {
    const symbol = ELEMENT_SYMBOLS[Z];
    if (!symbol) return null;
    try {
        const res  = await fetch(`./src/elements/${symbol}.json`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ─── Three.js scene ───────────────────────────────────────────────────────────

const threeRenderer = new THREE.WebGLRenderer({ antialias: true });
threeRenderer.setSize(window.innerWidth, window.innerHeight);
threeRenderer.setPixelRatio(window.devicePixelRatio);
threeRenderer.setClearColor(0x04060f);
document.body.appendChild(threeRenderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.001, 100000
);
camera.position.set(0, 0, 5);

// ─── Simulation ───────────────────────────────────────────────────────────────

const sim = new Simulation({
    dt:              0.016,
    enableField:     true,
    fieldResolution: 8,      // pm — resolution of Chladni sampling
    loadElement,             // async element loader
});

// Pre-load hydrogen so it's ready immediately
loadElement(1).then(data => {
    if (data) sim.registerElement(1, data);
});

// ─── Quantum Renderer (Layer 1 — quarks + hadrons) ────────────────────────────

const qRenderer = new QuantumRenderer(scene, {
    showHadronBounds: true,
    showFreeQuarks:   true,
});

// ─── Field Renderer (Layer 2 — Chladni pattern) ───────────────────────────────
// Visualizes active QuantumField nodes and constructive zones.
// Constructive zones = where the electron "is".

class FieldRenderer {
    constructor(scene) {
        this.scene = scene;

        // Field nodes: instanced points
        const nodeGeo = new THREE.SphereGeometry(3.0, 4, 3); // visible at orbital scale (~53 wu)
        const nodeMat = new THREE.MeshBasicMaterial({
            color:       0x2244aa,
            transparent: true,
            opacity:     0.25,
            depthWrite:  false,
            blending:    THREE.AdditiveBlending,
        });
        this._nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, 4096);
        this._nodeMesh.count = 0;
        this._nodeMesh.frustumCulled = false;
        scene.add(this._nodeMesh);

        // Constructive zones: brighter — these are where electrons reveal
        const zoneGeo = new THREE.SphereGeometry(6.0, 6, 4); // e⁻ zone — larger, brighter
        const zoneMat = new THREE.MeshBasicMaterial({
            color:       0x88ffcc,
            transparent: true,
            opacity:     0.5,
            depthWrite:  false,
            blending:    THREE.AdditiveBlending,
        });
        this._zoneMesh = new THREE.InstancedMesh(zoneGeo, zoneMat, 512);
        this._zoneMesh.count = 0;
        this._zoneMesh.frustumCulled = false;
        scene.add(this._zoneMesh);

        this._mtx = new THREE.Matrix4();
    }

    update(fieldSnap) {
        if (!fieldSnap) {
            this._nodeMesh.count = 0;
            this._zoneMesh.count = 0;
            return;
        }

        // Field nodes — the active medium
        let ni = 0;
        for (const node of fieldSnap.nodes) {
            if (ni >= 4096) break;
            this._mtx.setPosition(node.x, node.y, node.z);
            this._nodeMesh.setMatrixAt(ni, this._mtx);
            ni++;
        }
        this._nodeMesh.count = ni;
        this._nodeMesh.instanceMatrix.needsUpdate = true;

        // Constructive zones — the electron reveals itself here
        let zi = 0;
        for (const zone of fieldSnap.constructiveZones) {
            if (zi >= 512) break;
            this._mtx.setPosition(zone.position.x, zone.position.y, zone.position.z);
            this._zoneMesh.setMatrixAt(zi, this._mtx);
            zi++;
        }
        this._zoneMesh.count = zi;
        this._zoneMesh.instanceMatrix.needsUpdate = true;
    }

    setVisible(v) {
        this._nodeMesh.visible = v;
        this._zoneMesh.visible = v;
    }

    dispose() {
        this._nodeMesh.geometry.dispose();
        this._nodeMesh.material.dispose();
        this._zoneMesh.geometry.dispose();
        this._zoneMesh.material.dispose();
    }
}

const fieldRenderer = new FieldRenderer(scene);

// ─── Spawn helpers ────────────────────────────────────────────────────────────

function spawnProton(center) {
    const s = 0.5;
    [
        { flavor: FLAVOR.UP,   color: COLOR.R, spin: SPIN.UP   },
        { flavor: FLAVOR.UP,   color: COLOR.G, spin: SPIN.DOWN },
        { flavor: FLAVOR.DOWN, color: COLOR.B, spin: SPIN.UP   },
    ].forEach(q => sim.add(new QuantumEntity({
        type: ENTITY_TYPE.QUARK, ...q,
        position: new THREE.Vector3(
            center.x + (Math.random()-.5)*s,
            center.y + (Math.random()-.5)*s,
            center.z + (Math.random()-.5)*s,
        ),
    })));
}

function spawnNeutron(center) {
    const s = 0.5;
    [
        { flavor: FLAVOR.UP,   color: COLOR.R, spin: SPIN.UP   },
        { flavor: FLAVOR.DOWN, color: COLOR.G, spin: SPIN.DOWN },
        { flavor: FLAVOR.DOWN, color: COLOR.B, spin: SPIN.UP   },
    ].forEach(q => sim.add(new QuantumEntity({
        type: ENTITY_TYPE.QUARK, ...q,
        position: new THREE.Vector3(
            center.x + (Math.random()-.5)*s,
            center.y + (Math.random()-.5)*s,
            center.z + (Math.random()-.5)*s,
        ),
    })));
}

// Start: hydrogen nucleus (1 proton)
spawnProton(new THREE.Vector3(0, 0, 0));

// ─── HUD ─────────────────────────────────────────────────────────────────────

const hud = document.getElementById('hud');

function updateHUD(snap) {
    const s = snap.stats;
    const f = snap.field?.stats;
    hud.innerHTML = `
        <div class="stat">tick         <span>${s.tick}</span></div>
        <div class="stat">quarks       <span>${s.entities}</span></div>
        <div class="stat">protons      <span class="c-blue">${s.protons}</span></div>
        <div class="stat">neutrons     <span class="c-grey">${s.neutrons}</span></div>
        <div class="stat">free quarks  <span class="c-red">${s.freeQuarks}</span></div>
        ${f ? `
        <div class="divider"></div>
        <div class="stat">field nodes  <span class="c-teal">${f.activeNodes}</span></div>
        <div class="stat">field sources <span class="c-teal">${f.sources}</span></div>
        <div class="stat">e⁻ zones     <span class="c-green">${f.constructiveZones}</span></div>
        ` : ''}
    `;
}

// ─── Controls ────────────────────────────────────────────────────────────────

let showField = true;

document.getElementById('btn-proton') .addEventListener('click', () =>
    spawnProton(new THREE.Vector3((Math.random()-.5)*2, (Math.random()-.5)*2, 0)));
document.getElementById('btn-neutron').addEventListener('click', () =>
    spawnNeutron(new THREE.Vector3((Math.random()-.5)*2, (Math.random()-.5)*2, 0)));
document.getElementById('btn-clear') .addEventListener('click', () => sim.clear());
document.getElementById('btn-pause') .addEventListener('click', function() {
    sim.paused = !sim.paused;
    this.textContent = sim.paused ? '▶ Resume' : '⏸ Pause';
});
// Zoom presets: jump between quark scale and orbital scale
const ZOOM_LEVELS = [
    { r: 1,   label: '⚛ Quark'   },  // ~1 pm — see individual quarks
    { r: 5,   label: '🔴 Hadron'  },  // ~5 pm — see proton/neutron
    { r: 200, label: '🌐 Orbital' },  // ~200 pm — see full H orbital
];
let _zoomIdx = 1;
document.getElementById('btn-zoom').addEventListener('click', function() {
    _zoomIdx = (_zoomIdx + 1) % ZOOM_LEVELS.length;
    const z = ZOOM_LEVELS[_zoomIdx];
    sph.r = z.r;
    this.textContent = z.label;
});

document.getElementById('btn-field') .addEventListener('click', function() {
    showField = !showField;
    fieldRenderer.setVisible(showField);
    this.textContent = showField ? '🌊 Hide Field' : '🌊 Show Field';
});

// ─── Camera orbit ─────────────────────────────────────────────────────────────

let drag = false, prev = {x:0,y:0};
let sph  = { theta: 0, phi: Math.PI/2, r: 5 };

// ── Mouse ────────────────────────────────────────────────────────────────────
threeRenderer.domElement.addEventListener('mousedown', e => { drag=true; prev={x:e.clientX,y:e.clientY}; });
threeRenderer.domElement.addEventListener('mousemove', e => {
    if(!drag) return;
    sph.theta -= (e.clientX-prev.x)*0.005;
    sph.phi    = Math.max(0.1, Math.min(Math.PI-.1, sph.phi+(e.clientY-prev.y)*0.005));
    prev = {x:e.clientX, y:e.clientY};
});
threeRenderer.domElement.addEventListener('mouseup',   () => { drag=false; });
threeRenderer.domElement.addEventListener('wheel', e => {
    sph.r = Math.max(0.1, Math.min(2000, sph.r * (1 + e.deltaY * 0.001)));
});

// ── Touch ─────────────────────────────────────────────────────────────────────
let _touches = {};
let _pinchDist0 = null;

threeRenderer.domElement.addEventListener('touchstart', e => {
    e.preventDefault();
    drag = false;
    _touches = {};
    for (const t of e.touches) _touches[t.identifier] = {x: t.clientX, y: t.clientY};

    if (e.touches.length === 1) {
        drag = true;
        prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _pinchDist0 = Math.sqrt(dx*dx + dy*dy);
    }
}, { passive: false });

threeRenderer.domElement.addEventListener('touchmove', e => {
    e.preventDefault();

    if (e.touches.length === 1 && drag) {
        // One finger → orbit
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        sph.theta -= (tx - prev.x) * 0.005;
        sph.phi    = Math.max(0.1, Math.min(Math.PI-.1, sph.phi + (ty - prev.y) * 0.005));
        prev = { x: tx, y: ty };
    }

    if (e.touches.length === 2 && _pinchDist0 !== null) {
        // Two fingers → pinch zoom
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const scale = _pinchDist0 / dist;  // > 1 = pinch in = zoom out
        sph.r = Math.max(0.1, Math.min(2000, sph.r * scale));
        _pinchDist0 = dist;
    }
}, { passive: false });

threeRenderer.domElement.addEventListener('touchend', e => {
    e.preventDefault();
    drag = false;
    _pinchDist0 = null;
    if (e.touches.length === 1) {
        drag = true;
        prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
}, { passive: false });

function updateCamera() {
    camera.position.set(
        sph.r * Math.sin(sph.phi) * Math.sin(sph.theta),
        sph.r * Math.cos(sph.phi),
        sph.r * Math.sin(sph.phi) * Math.cos(sph.theta),
    );
    camera.lookAt(0,0,0);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Loop ─────────────────────────────────────────────────────────────────────

function animate() {
    requestAnimationFrame(animate);

    sim.step();
    const snap = sim.getSnapshot();

    qRenderer.update(snap);
    if (showField) fieldRenderer.update(snap.field);
    updateHUD(snap);
    updateCamera();

    threeRenderer.render(scene, camera);
}

animate();
