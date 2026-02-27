/**
 * app.js
 * Main application entry point
 *
 * CAMBIOS v0.11:
 * - Race condition corregida: Physics Lab handlers movidos dentro de
 *   initControls(), que se llama desde init() → simulation siempre existe.
 * - PHYSICS_DEFAULTS movido a scope de módulo (compartido, no duplicado).
 * - selectElementInUI() optimizado: O(N) en lugar de O(N²).
 * - Limpieza menor de whitespace y comentarios redundantes.
 */

import { Simulation } from './core/Simulation.js';
import { Bond } from './core/Bond.js';
import { MetallicCloud } from './core/MetallicCloud.js';
import { getWorldPosition, findAtomAtPoint } from './utils/raycasting.js';
import { showHint, playSound, loadJSON } from './utils/helpers.js';
import { initInteractions } from './ui/interactions.js';
import { initAddPanelTabs } from './ui/panels.js';
import { CrystalGenerator } from './structures/CrystalGenerator.js';
import { ElementLoader } from './data/ElementLoader.js';
import { GroupPanel } from './ui/GroupPanel.js';
import { BondRenderer } from './core/BondRenderer.js';
import { TemperatureSystem } from './physics/Temperature.js';

// ── Global state ───────────────────────────────────────────────────────────
let simulation;
let camera, renderer, scene;
let bondRenderer;
let elementDatabase, molecules;
window.elementDatabase = null; // Exposed for console debugging + CrystalGenerator
let elementLoader;
let groupPanel;
let elementSortMode = 'number'; // 'number' | 'group'
let floorMesh;
let ceilingMesh;
let sphereMesh;    // Recipiente esférico — oculto por defecto
let crystalGenerator;
let lastCrystalAtoms = [];
let lastTouchedAtom  = null;
let bgParticles      = [];

// ── Physics Lab defaults — module-level so initControls() shares them ──────
const PHYSICS_DEFAULTS = {
    gravity:        0.00001,
    pauliStrength:  0.5,
    pauliFactor:    1.6,
    friction:       0.98,
    terminalVel:    2.0,
    bondSpring:     1.0,
    bondAngles:     0.5,
    lennardJones:   0.1,
    floorCurvature: 0.0
};

// ── Entry point ────────────────────────────────────────────────────────────
async function init() {
    try {
        elementLoader    = new ElementLoader();
        await elementLoader.loadIndex();
        elementDatabase  = elementLoader.getElements();
        window.elementDatabase = elementDatabase;

        molecules = await loadJSON('data/moleculas.json');

        Object.values(elementDatabase).forEach(el => {
            if(typeof el.color === 'string') el.color = parseInt(el.color, 16);
        });

        console.log(`✅ Loaded ${Object.keys(elementDatabase).length} elements from ${elementLoader.getActiveGroups().length} groups`);
    } catch(error) {
        console.error('Error loading data:', error);
        showHint('❌ Error cargando datos');
        return;
    }

    // Three.js setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0x64c8ff, 1, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    createBackgroundParticles();
    createFloorPlane();
    createCeilingPlane();
    createSphereMesh();

    simulation    = new Simulation(scene, elementDatabase);
    simulation.temperature = new TemperatureSystem(simulation.physics);
    bondRenderer  = new BondRenderer(scene, 8000);
    crystalGenerator = new CrystalGenerator(simulation);

    // initControls() is called AFTER simulation exists → no race condition
    initUI();
    initControls();

    initInteractions({
        simulation, camera, scene, renderer,
        getWorldPosition, findAtomAtPoint,
        updateStats, playSound, showHint
    });

    animate();
    initMobileLayout();

    showHint('🧪 Selecciona un elemento y toca para agregar átomos');
}

// ── Mobile layout ──────────────────────────────────────────────────────────
function initMobileLayout() {
    const isMobile = window.innerWidth <= 768 ||
                     /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if(!isMobile) return;

    const collapseIfExists = (panelId, btnId, text) => {
        const panel = document.getElementById(panelId);
        const btn   = document.getElementById(btnId);
        if(panel && btn) { panel.classList.add('hidden'); btn.textContent = text; }
    };

    collapseIfExists('physicsPanel', 'collapsePhysics', '▲ Física');
    collapseIfExists('addPanel',     'collapseAdd',     '▲ Agregar');

    const groupPanelEl     = document.getElementById('groupPanel');
    const collapseGroupBtn = document.getElementById('collapseGroups');
    if(groupPanelEl && collapseGroupBtn) {
        groupPanelEl.classList.add('hidden');
        collapseGroupBtn.classList.add('visible');
    }

    console.log('📱 Mobile: paneles colapsados automáticamente');
}

// ── Render loop ────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);

    bgParticles.forEach(p => {
        p.position.y += p.userData.speed;
        if(p.position.y > 25) p.position.y = -25;
    });

    simulation.update();
    if(simulation.temperature) simulation.temperature.update(simulation.atoms);
    if(bondRenderer) bondRenderer.update(simulation.bonds);
    if(window._updateTempReadout) window._updateTempReadout();
    renderer.render(scene, camera);
}

// ── Scene helpers ──────────────────────────────────────────────────────────
function createBackgroundParticles() {
    for(let i = 0; i < 100; i++) {
        const geo = new THREE.SphereGeometry(0.05, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x64c8ff, transparent: true, opacity: 0.1 });
        const p   = new THREE.Mesh(geo, mat);
        p.position.set(
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50
        );
        p.userData = { speed: Math.random() * 0.02 + 0.01 };
        scene.add(p);
        bgParticles.push(p);
    }
}

/**
 * Actualiza el color del material de una superficie según su temperatura.
 * Escala de color:
 *   0 K      → azul profundo  (#0a1a3a) — frío absoluto
 *   300 K    → gris neutro    (#1a1a2a) — temperatura ambiente
 *   1000 K   → naranja suave  (#2a1a0a) — caliente
 *   3000 K   → rojo intenso   (#3a0a0a) — muy caliente
 */
function _updateSurfaceThermalColor(mesh, tempK) {
    if(!mesh) return;

    let r, g, b;
    if(tempK <= 300) {
        // Frío: interpolamos de azul (0K) a neutro (300K)
        const t = tempK / 300;
        r = Math.round(10  + t * (26 - 10));   // 10 → 26
        g = Math.round(26  + t * (26 - 26));   // 26 → 26
        b = Math.round(58  + t * (42 - 58));   // 58 → 42
    } else {
        // Caliente: interpolamos de neutro (300K) a rojo (3000K)
        const t = Math.min((tempK - 300) / 2700, 1);
        r = Math.round(26  + t * (80 - 26));   // 26 → 80
        g = Math.round(26  + t * (10 - 26));   // 26 → 10
        b = Math.round(42  + t * (10 - 42));   // 42 → 10
    }

    mesh.material.color.setRGB(r / 255, g / 255, b / 255);
}

function createFloorPlane() {
    const floorGeo = new THREE.PlaneGeometry(100, 100, 50, 50);
    const floorMat = new THREE.MeshBasicMaterial({
        color: 0x1a1a1a, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, wireframe: false
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -15;
    scene.add(floor);
    floorMesh = floor;
    return floor;
}

function updateFloorGeometry(curvature) {
    if(!floorMesh) return;
    const pos = floorMesh.geometry.attributes.position;
    const vc  = curvature * 45; // Visual exaggeration factor
    for(let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        pos.setZ(i, vc * 0.01 * (x * x + y * y));
    }
    pos.needsUpdate = true;
    floorMesh.geometry.computeVertexNormals();
    floorMesh.geometry.computeBoundingSphere();
}

function createCeilingPlane() {
    const geo = new THREE.PlaneGeometry(100, 100, 50, 50);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x1a1a1a,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        wireframe: false
    });
    const ceiling = new THREE.Mesh(geo, mat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 15;
    ceiling.visible = false;
    scene.add(ceiling);
    ceilingMesh = ceiling;
    return ceiling;
}

function updateCeilingGeometry(curvature) {
    if(!ceilingMesh) return;
    const pos = ceilingMesh.geometry.attributes.position;
    const vc  = -curvature * 45; // Invertido — curva hacia abajo
    for(let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        pos.setZ(i, vc * 0.01 * (x * x + y * y));
    }
    pos.needsUpdate = true;
    ceilingMesh.geometry.computeVertexNormals();
    ceilingMesh.geometry.computeBoundingSphere();
}

function createSphereMesh() {
    // SphereGeometry: radio=20, 32 segmentos horizontales, 24 verticales
    // side=BackSide → renderiza la cara interna (el usuario ve desde adentro)
    const geo = new THREE.SphereGeometry(20, 32, 24);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x224466,
        transparent: true,
        opacity: 0.0,          // Invisible hasta que se active
        side: THREE.BackSide,  // Cara interna visible
        wireframe: false,
        depthWrite: false,     // No bloquea transparencias internas
    });
    sphereMesh = new THREE.Mesh(geo, mat);
    sphereMesh.position.y = 0;
    sphereMesh.visible = false;
    scene.add(sphereMesh);
    return sphereMesh;
}


function initUI() {
    window.elementSortMode = elementSortMode;
    refreshElementGrid();

    const moleculeContainer = document.getElementById('moleculeButtons');
    molecules.forEach((mol, idx) => {
        const btn = document.createElement('button');
        btn.className   = 'control-btn';
        btn.textContent = `${mol.icon} ${mol.formula}`;
        btn.title       = mol.name;
        btn.addEventListener('click', () => createMolecule(idx));
        moleculeContainer.appendChild(btn);
    });

    groupPanel = new GroupPanel(elementLoader, (groupKey, enabled) => {
        if(groupKey) {
            showHint(enabled
                ? `✅ Grupo ${elementLoader.getGroup(groupKey).name} activado`
                : `❌ Grupo ${elementLoader.getGroup(groupKey).name} desactivado`
            );
        }
        refreshElementGrid();
    });
    groupPanel.createPanel();

    initAddPanelTabs();
    addFullscreenButton();
    updateStats();
}

function addFullscreenButton() {
    const uiPanel = document.getElementById('ui');
    if(!uiPanel) { console.error('Panel #ui no encontrado'); return; }

    if(window.getComputedStyle(uiPanel).position === 'static') {
        uiPanel.style.position = 'relative';
    }

    const btn   = document.createElement('button');
    btn.id      = 'fullscreenBtn';
    btn.innerHTML = '⛶';
    btn.title   = 'Pantalla completa';
    btn.className = 'fullscreen-btn';
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
    uiPanel.insertBefore(btn, uiPanel.firstChild);

    ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
        .forEach(ev => document.addEventListener(ev, updateFullscreenIcon));

    console.log('✅ Fullscreen button added');
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement &&
        !document.mozFullScreenElement && !document.msFullscreenElement) {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen ||
         el.mozRequestFullScreen || el.msRequestFullscreen).call(el);
    } else {
        (document.exitFullscreen || document.webkitExitFullscreen ||
         document.mozCancelFullScreen || document.msExitFullscreen)
            .call(document);
    }
}

function updateFullscreenIcon() {
    const btn = document.getElementById('fullscreenBtn');
    if(!btn) return;
    const isFS = document.fullscreenElement || document.webkitFullscreenElement ||
                 document.mozFullScreenElement || document.msFullscreenElement;
    btn.innerHTML = '⛶';
    btn.title     = isFS ? 'Salir de pantalla completa (ESC)' : 'Pantalla completa';
}

// Debounce timer para refreshElementGrid — evita reconstruir 118 botones
// múltiples veces si el usuario activa/desactiva grupos rápido.
let _refreshGridTimer = null;
function refreshElementGrid() {
    if(_refreshGridTimer) clearTimeout(_refreshGridTimer);
    _refreshGridTimer = setTimeout(_doRefreshElementGrid, 150);
}

function _doRefreshElementGrid() {
    const grid = document.getElementById('elementGrid');
    grid.innerHTML = '';
    elementDatabase = elementLoader.getElements();

    const sortMode = window.elementSortMode || 'number';
    const sorted   = Object.entries(elementDatabase).sort((a, b) =>
        sortMode === 'number'
            ? a[1].number - b[1].number
            : a[1].group !== b[1].group
                ? a[1].group.localeCompare(b[1].group)
                : a[1].number - b[1].number
    );

    sorted.forEach(([symbol, element]) => {
        const btn = document.createElement('button');
        btn.className      = 'element-btn';
        btn.dataset.symbol = symbol;
        btn.innerHTML = `
            <div class="element-number">${element.number}</div>
            <div class="element-symbol">${symbol}</div>
            <div class="element-name">${element.name}</div>
        `;

        // Dynamic per-element border color — intentionally inline (data-driven)
        if(element.groupColor !== undefined) {
            const n = typeof element.groupColor === 'string'
                ? parseInt(element.groupColor.replace('0x', ''), 16)
                : element.groupColor;
            btn.style.borderColor = '#' + n.toString(16).padStart(6, '0');
            btn.style.borderWidth = '2px';
        }

        // Fix O(N²): quitar 'selected' de todos y añadir al correcto
        // en lugar de hacer querySelectorAll dentro de cada click handler.
        btn.addEventListener('click', () => {
            const prev = grid.querySelector('.element-btn.selected');
            if(prev) prev.classList.remove('selected');
            btn.classList.add('selected');
            document.getElementById('selectedElement').textContent = element.name;
        });
        grid.appendChild(btn);
    });

    updateStats();
}

// ── Controls ───────────────────────────────────────────────────────────────
function initControls() {

    // Main controls
    document.getElementById('clearBtn').addEventListener('click', () => {
        simulation.clearAll();
        updateStats();
        camera.position.set(0, 0, 25);
        camera.lookAt(0, 0, 0);
        scene.rotation.set(0, 0, 0);
        showHint('🧹 Escena limpiada y cámara restablecida');
    });

    document.getElementById('modeBtn').addEventListener('click', (e) => {
        if(simulation.config.interactionMode === 'add') {
            showDeleteModeModal();
        } else {
            simulation.config.interactionMode = 'add';
            e.target.textContent = '➕ Agregar';
            e.target.classList.remove('btn-delete-active');
            showHint('Modo Agregar: Selecciona elemento y toca para agregar');
        }
    });

    document.getElementById('toggleVisualization').addEventListener('click', (e) => {
        const mode = simulation.config.visualizationMode === 'clouds' ? 'shells' : 'clouds';
        simulation.setVisualizationMode(mode);
        e.target.textContent = mode === 'clouds' ? '☁️ Nubes' : '⚛️ Anillos';
        showHint(mode === 'clouds' ? '☁️ Nubes Probabilísticas' : '⚛️ Órbitas Clásicas');
    });

    document.getElementById('toggleElectrons').addEventListener('click', (e) => {
        const mode = simulation.config.electronMode === 'all' ? 'valence' : 'all';
        simulation.setElectronMode(mode);
        e.target.textContent = mode === 'all' ? '⚛️ Todos' : '⚡ Valencia';
        showHint(mode === 'all' ? '⚛️ Todos los Electrones' : '⚡ Solo Electrones de Valencia');
    });

    // Collapse buttons
    document.getElementById('collapseUI').addEventListener('click', () => {
        const ui = document.getElementById('ui');
        ui.classList.toggle('hidden');
        document.getElementById('collapseUI').textContent =
            ui.classList.contains('hidden') ? '▶' : '◀';
    });

    document.getElementById('collapseElements').addEventListener('click', () => {
        const sel = document.getElementById('elementSelector');
        sel.classList.toggle('hidden');
        document.getElementById('collapseElements').textContent =
            sel.classList.contains('hidden') ? '▼' : '▲';
    });

    const collapseAddBtn = document.getElementById('collapseAdd');
    if(collapseAddBtn) {
        collapseAddBtn.addEventListener('click', () => {
            const panel = document.getElementById('addPanel');
            panel.classList.toggle('hidden');
            collapseAddBtn.textContent =
                panel.classList.contains('hidden') ? '▲ Agregar' : '▼ Agregar';
        });
    }

    document.getElementById('collapsePhysics').addEventListener('click', () => {
        const panel = document.getElementById('physicsPanel');
        const btn   = document.getElementById('collapsePhysics');
        panel.classList.toggle('hidden');
        btn.textContent = panel.classList.contains('hidden') ? '▲ Física' : '▼ Física';
    });

    // ── physicsPanel tab switching ──────────────────────────────────────────
    document.getElementById('tabPhysics').addEventListener('click', () => {
        document.getElementById('physicsTabContent').classList.remove('tab-hidden');
        document.getElementById('geometryTabContent').classList.add('tab-hidden');
        document.getElementById('tabPhysics').classList.add('physics-tab--active');
        document.getElementById('tabGeometry').classList.remove('physics-tab--active');
    });

    document.getElementById('tabGeometry').addEventListener('click', () => {
        document.getElementById('geometryTabContent').classList.remove('tab-hidden');
        document.getElementById('physicsTabContent').classList.add('tab-hidden');
        document.getElementById('tabGeometry').classList.add('physics-tab--active');
        document.getElementById('tabPhysics').classList.remove('physics-tab--active');
    });

    // Physics panel
    document.getElementById('gravityToggle').addEventListener('change', (e) => {
        simulation.physics.setGravity(e.target.checked);
        showHint(e.target.checked ? '🌍 Gravedad activada' : '🌍 Gravedad desactivada');
    });

    document.getElementById('gravitySlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('gravityValue').textContent = `x${v}`;
        simulation.physics.gravityStrength = v;
    });

    document.getElementById('floorToggle').addEventListener('change', (e) => {
        simulation.physics.setFloor(e.target.checked);
        showHint(e.target.checked ? '🌍 Piso físico activado' : '🌍 Piso físico desactivado');
    });

    let floorVisible = true;
    document.getElementById('floorVisibilityBtn').addEventListener('click', () => {
        floorVisible = !floorVisible;
        if(floorMesh) floorMesh.visible = floorVisible;
        const btn = document.getElementById('floorVisibilityBtn');
        btn.textContent = floorVisible ? '👁️ Visible' : '🚫 Oculto';
        btn.classList.toggle('hidden-floor', !floorVisible);
    });

    document.getElementById('bounceSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('bounceValue').textContent = v;
        simulation.physics.restitution = v;
    });

    document.getElementById('repulsionToggle').addEventListener('change', (e) => {
        simulation.physics.repulsionEnabled = e.target.checked;
        showHint(e.target.checked ? '⚛️ Repulsión activada' : '⚛️ Repulsión desactivada');
    });

    document.getElementById('cpkColorToggle').addEventListener('change', (e) => {
        const useCPK = e.target.checked;
        simulation.config.useCPKColors = useCPK;
        simulation.atoms.forEach(atom => {
            const el = atom.element;
            if(useCPK && el.cpk_color) {
                const c = typeof el.cpk_color === 'string'
                    ? parseInt(el.cpk_color.replace('0x', ''), 16) : el.cpk_color;
                atom.nucleus.material.color.setHex(c);
                atom.nucleus.material.emissive.setHex(c);
            } else {
                atom.nucleus.material.color.setHex(el.color);
                atom.nucleus.material.emissive.setHex(el.color);
            }
        });
        showHint(useCPK ? '🎨 Colores CPK activados' : '🎨 Colores por elemento activados');
    });

    document.getElementById('bondsToggle').addEventListener('change', (e) => {
        const show = e.target.checked;
        simulation.bonds.forEach(bond => {
            if(bond.atom1 && bond.atom2) bond.visible = show;
            if(bond.electronPoints) bond.electronPoints.visible = show;
            if(bond.structureLines) bond.structureLines.forEach(l => { l.visible = show; });
        });
        showHint(show ? '🔗 Enlaces visibles' : '👁️ Enlaces ocultos');
    });

    document.getElementById('bondAnglesToggle').addEventListener('change', (e) => {
        simulation.physics.bondAnglesEnabled = e.target.checked;
        showHint(e.target.checked
            ? '📐 Ángulos de enlace activados' : '📐 Ángulos de enlace desactivados');
    });

    document.getElementById('lennardJonesToggle').addEventListener('change', (e) => {
        simulation.physics.lennardJones.setEnabled(e.target.checked);
        showHint(e.target.checked
            ? '🌊 Fuerzas Van der Waals activadas' : '🌊 Fuerzas Van der Waals desactivadas');
    });

    document.getElementById('physicsModeToggle').addEventListener('change', (e) => {
        const mode     = e.target.checked ? 'realistic' : 'pedagogical';
        const modeInfo = simulation.physics.modeManager.setMode(mode);
        showHint(`🔬 Modo: ${modeInfo.name}`);
    });

    document.getElementById('floorOpacitySlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('floorOpacityValue').textContent = v.toFixed(2);
        if(floorMesh) floorMesh.material.opacity = v;
    });

    document.getElementById('floorBrightnessSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('floorBrightnessValue').textContent = v.toFixed(1);
        if(floorMesh) {
            const c = Math.floor(0x1a + (0xe0 - 0x1a) * v);
            floorMesh.material.color.setHex(c * 0x010101);
        }
    });

    // Crystal controls
    const crystalSize = () => parseInt(document.getElementById('crystalSizeSlider').value);

    document.getElementById('crystalSizeSlider').addEventListener('input', (e) => {
        ['crystalSizeValue','crystalSizeValue2','crystalSizeValue3'].forEach(id => {
            document.getElementById(id).textContent = e.target.value;
        });
    });

    const makeCrystal = (check, gen, label) => {
        if(!check()) return;
        const atoms = gen();
        crystalGenerator.strengthenCrystalBonds(atoms);
        crystalGenerator.freezeCrystal(atoms, true);
        lastCrystalAtoms = atoms;
        document.getElementById('freezeCrystalToggle').checked = true;
        updateStats();
        showHint(label);
        playSound('add');
    };

    document.getElementById('crystalNaCl').addEventListener('click', () => {
        const missing = ['Na','Cl'].filter(s => !elementDatabase[s]);
        if(missing.length) { showHint(`⚠️ Activa los grupos de: ${missing.join(', ')}`, 'warning'); return; }
        makeCrystal(() => true, () => crystalGenerator.generateNaCl(crystalSize()), '🧂 Cristal NaCl generado (congelado)');
    });

    document.getElementById('crystalFe').addEventListener('click', () => {
        if(!elementDatabase['Fe']) { showHint('⚠️ Activa el grupo de: Fe', 'warning'); return; }
        makeCrystal(() => true, () => crystalGenerator.generateBCC(crystalSize(), 'Fe'), '🔩 Cristal de Hierro (BCC) generado (congelado)');
    });

    document.getElementById('crystalDiamond').addEventListener('click', () => {
        if(!elementDatabase['C']) { showHint('⚠️ Activa el grupo de: C', 'warning'); return; }
        makeCrystal(() => true, () => crystalGenerator.generateFCC(crystalSize(), 'C'), '💎 Cristal de Diamante (FCC) generado (congelado)');
    });

    document.getElementById('crystalIce').addEventListener('click', () => {
        if(!elementDatabase['O']) { showHint('⚠️ Activa el grupo de: O', 'warning'); return; }
        makeCrystal(() => true, () => crystalGenerator.generateHexagonal(crystalSize(), 'O'), '❄️ Cristal de Hielo (Hex) generado (congelado)');
    });

    document.getElementById('freezeCrystalToggle').addEventListener('change', (e) => {
        const freeze = e.target.checked;
        if(lastTouchedAtom) {
            let atoms = [];
            if(lastTouchedAtom.metallicCloud)       atoms = lastTouchedAtom.metallicCloud.atoms;
            else if(lastTouchedAtom.bonds.length > 0) atoms = simulation.findMoleculeContaining(lastTouchedAtom).atoms;
            else                                      atoms = [lastTouchedAtom];
            if(atoms.length) {
                crystalGenerator.freezeCrystal(atoms, freeze);
                showHint(freeze ? '❄️ Estructura congelada' : '🔥 Estructura descongelada');
                return;
            }
        }
        if(lastCrystalAtoms.length) {
            crystalGenerator.freezeCrystal(lastCrystalAtoms, freeze);
            showHint(freeze ? '❄️ Cristal congelado' : '🔥 Cristal descongelado');
        }
    });

    // ── Temperature Panel ──────────────────────────────────────────────────
    // Registered inside initControls() — simulation.temperature guaranteed to exist

    const TEMP_MODE_DESCS = {
        didactic:  'Escala pedagógica — valores inventados para visibilidad. Ideal para clase.',
        realistic: 'k_B = 1.38×10⁻²³ J/K, masas reales en kg. Físicamente correcto, visualmente exagerado.',
    };

    // Open / close
    document.getElementById('closeTempPanel').addEventListener('click', () => {
        document.getElementById('tempPanel').classList.add('hidden');
    });

    // Mode buttons
    document.getElementById('tempModeDidactic').addEventListener('click', () => {
        simulation.temperature.setMode('didactic');
        _syncTempModeUI('didactic');
        showHint('🎓 Temperatura: modo didáctico');
    });

    document.getElementById('tempModeRealistic').addEventListener('click', () => {
        simulation.temperature.setMode('realistic');
        _syncTempModeUI('realistic');
        showHint('⚗️ Temperatura: modo realista (k_B real)');
    });

    function _syncTempModeUI(mode) {
        document.getElementById('tempModeDidactic').classList.toggle('temp-mode-btn--active',  mode === 'didactic');
        document.getElementById('tempModeRealistic').classList.toggle('temp-mode-btn--active', mode === 'realistic');
        document.getElementById('tempModeDesc').textContent = TEMP_MODE_DESCS[mode];
        document.getElementById('tempRealisticWarning').classList.toggle('hidden', mode !== 'realistic');

        // Adjust slider max
        const maxT = simulation.temperature.getMaxTemperature();
        const slider = document.getElementById('tempSlider');
        slider.max = maxT;
        if(parseFloat(slider.value) > maxT) slider.value = maxT;
        _updateTempDisplay(parseFloat(slider.value));
    }

    // Enable toggle
    document.getElementById('tempEnabledToggle').addEventListener('change', (e) => {
        simulation.temperature.setEnabled(e.target.checked);
        showHint(e.target.checked ? '🌡️ Sistema de temperatura activado' : '🌡️ Sistema de temperatura desactivado');
    });

    // Target temperature slider
    document.getElementById('tempSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.temperature.setTargetTemperature(v);
        _updateTempDisplay(v);
    });

    function _updateTempDisplay(v) {
        document.getElementById('tempTargetValue').textContent = `${Math.round(v)} K`;
    }

    // Color ambiente (fondo, no átomos)
    document.getElementById('tempColorToggle').addEventListener('change', (e) => {
        simulation.temperature.colorAmbient = e.target.checked;
        if(!e.target.checked) {
            // Restaurar gradiente neutro
            document.documentElement.style.setProperty('--ambient-temp-rgb', '5, 5, 15');
        }
        showHint(e.target.checked ? '🎨 Color ambiente activado' : '🎨 Color ambiente desactivado');
    });

    // Floor temperature
    document.getElementById('floorTempSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.floorTemperature = v;
        document.getElementById('floorTempValue').textContent = `${Math.round(v)} K`;
        _updateSurfaceThermalColor(floorMesh, v);
    });

    document.getElementById('ceilingTempSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.ceilingTemperature = v;
        document.getElementById('ceilingTempValue').textContent = `${Math.round(v)} K`;
        _updateSurfaceThermalColor(ceilingMesh, v);
    });

    // Default 300K en ambas superficies (temperatura ambiente)
    simulation.physics.floorTemperature   = 300;
    simulation.physics.ceilingTemperature = 300;
    document.getElementById('floorTempSlider').value   = 300;
    document.getElementById('ceilingTempSlider').value = 300;
    document.getElementById('floorTempValue').textContent   = '300 K';
    document.getElementById('ceilingTempValue').textContent = '300 K';
    _updateSurfaceThermalColor(floorMesh,   300);
    _updateSurfaceThermalColor(ceilingMesh, 300);

    // Ceiling toggle (physicsPanel)
    document.getElementById('ceilingToggle').addEventListener('change', (e) => {
        const enabled = e.target.checked;
        simulation.physics.setCeiling(enabled);
        if(ceilingMesh) {
            // Activar físicamente pero visibilidad independiente
            if(enabled && !ceilingMesh._wasVisible) {
                ceilingMesh.visible = true;
                ceilingMesh.material.opacity = 0.15;
                ceilingMesh._wasVisible = true;
            }
        }
        showHint(enabled ? '❄️ Techo activado' : '❄️ Techo desactivado');
    });

    // Ceiling visibility (independiente de física — igual que piso)
    let ceilingVisible = false;
    document.getElementById('ceilingVisibilityBtn').addEventListener('click', () => {
        ceilingVisible = !ceilingVisible;
        const btn = document.getElementById('ceilingVisibilityBtn');
        if(ceilingMesh) ceilingMesh.visible = ceilingVisible;
        btn.textContent = ceilingVisible ? '👁️ Visible' : '🚫 Oculto';
        btn.classList.toggle('hidden-floor', !ceilingVisible);
    });

    // Ceiling opacity
    document.getElementById('ceilingOpacitySlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('ceilingOpacityValue').textContent = v.toFixed(2);
        if(ceilingMesh) ceilingMesh.material.opacity = v;
    });

    // Ceiling brightness
    document.getElementById('ceilingBrightnessSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('ceilingBrightnessValue').textContent = v.toFixed(1);
        if(ceilingMesh) {
            const c = Math.floor(0x1a + (0xe0 - 0x1a) * v);
            ceilingMesh.material.color.setHex(c * 0x010101);
        }
    });

    // Ceiling bounce
    document.getElementById('ceilingBounceSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.ceilingRestitution = v;
        document.getElementById('ceilingBounceValue').textContent = v.toFixed(1);
    });

    // Ceiling Y (Laboratorio)
    document.getElementById('ceilingYSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.ceilingY = v;
        if(ceilingMesh) ceilingMesh.position.y = v;
        document.getElementById('ceilingYValue').textContent = Math.round(v);
    });

    // Ceiling curvature (Laboratorio)
    document.getElementById('ceilingCurvatureSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.ceilingCurvature = v;
        document.getElementById('ceilingCurvatureValue').textContent = v.toFixed(2);
        updateCeilingGeometry(v);
    });

    // ── Sphere container ────────────────────────────────────────────────────
    document.getElementById('sphereToggle').addEventListener('change', (e) => {
        const enabled = e.target.checked;
        simulation.physics.sphereEnabled = enabled;
        if(sphereMesh) {
            sphereMesh.visible = enabled;
            sphereMesh.material.opacity = enabled ? 0.08 : 0;
        }
        showHint(enabled ? '🔮 Recipiente esférico activado' : '🔮 Recipiente esférico desactivado');
    });

    document.getElementById('sphereVisibilityBtn').addEventListener('click', () => {
        if(!sphereMesh) return;
        const visible = !sphereMesh.visible;
        sphereMesh.visible = visible;
        const btn = document.getElementById('sphereVisibilityBtn');
        btn.textContent = visible ? '👁️ Visible' : '🚫 Oculto';
        btn.classList.toggle('hidden-floor', !visible);
    });

    document.getElementById('sphereOpacitySlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('sphereOpacityValue').textContent = v.toFixed(2);
        if(sphereMesh) sphereMesh.material.opacity = v;
    });

    document.getElementById('sphereBounceSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('sphereBounceValue').textContent = v.toFixed(1);
        simulation.physics.sphereRestitution = v;
    });

    // Sphere radius (Laboratorio)
    document.getElementById('sphereRadiusSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('sphereRadiusValue').textContent = Math.round(v);
        simulation.physics.sphereRadius = v;
        // Escalar la malla visual para que coincida con la física
        if(sphereMesh) sphereMesh.scale.setScalar(v / 20); // 20 = radio base del geo
    });

    // Sphere center Y (pestaña Geometría)
    document.getElementById('sphereCenterYSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('sphereCenterYValue').textContent = Math.round(v);
        simulation.physics.sphereCenterY = v;
        if(sphereMesh) sphereMesh.position.y = v;
    });

    // Bond breaking
    document.getElementById('tempBondBreakToggle').addEventListener('change', (e) => {
        simulation.temperature.thermalBondBreaking = e.target.checked;
        showHint(e.target.checked ? '🔥 Ruptura por temperatura activada' : '🔥 Ruptura por temperatura desactivada');
    });

    // Thermostat tau
    document.getElementById('tempTauSlider').addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        simulation.temperature.thermostatTau = v;
        document.getElementById('tempTauValue').textContent = v;
    });

    // Live readout update — attached to animate loop via exposed function
    window._updateTempReadout = function() {
        if(!simulation?.temperature?.enabled) return;
        const info = simulation.temperature.getUIInfo(simulation.atoms);
        document.getElementById('tempCurrentValue').textContent = `${info.currentTemperature} K`;
        const phaseEl = document.getElementById('tempPhaseValue');
        phaseEl.textContent  = info.phaseName;
        phaseEl.style.color  = _phaseColor(info.phase);
    };

    function _phaseColor(phase) {
        return { solid: '#88ccff', liquid: '#44aaff', gas: '#ff8844' }[phase] ?? '#fff';
    }
    document.getElementById('togglePhysicsLab').addEventListener('click', () => {
        document.querySelector('.physics-panel').classList.toggle('hidden');
    });

    document.getElementById('openTempPanel').addEventListener('click', () => {
        document.getElementById('tempPanel').classList.remove('hidden');
    });

    document.getElementById('closePhysicsLab').addEventListener('click', () => {
        document.querySelector('.physics-panel').classList.add('hidden');
    });

    document.getElementById('gravityLabSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.gravityConstant = v;
        document.getElementById('gravityLabValue').textContent = v.toFixed(5);
    });

    document.getElementById('pauliStrengthSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.repulsionStrength = v;
        document.getElementById('pauliStrengthValue').textContent = v.toFixed(2);
    });

    document.getElementById('pauliFactorSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.repulsionFactor = v;
        document.getElementById('pauliFactorValue').textContent = v.toFixed(1);
    });

    document.getElementById('frictionSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.friction = v;
        document.getElementById('frictionValue').textContent = v.toFixed(2);
    });

    document.getElementById('terminalVelSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.terminalVelocity = v;
        document.getElementById('terminalVelValue').textContent = v.toFixed(1);
    });

    document.getElementById('bondSpringSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.bondSpringMultiplier = v;
        document.getElementById('bondSpringValue').textContent = v.toFixed(1);
    });

    document.getElementById('bondAnglesSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.bondAngleStrength = v;
        document.getElementById('bondAnglesValue').textContent = v.toFixed(2);
    });

    document.getElementById('lennardJonesSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.lennardJones.setStrength(v);
        document.getElementById('lennardJonesValue').textContent = v.toFixed(2);
    });

    document.getElementById('floorCurvatureSlider').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        simulation.physics.floorCurvature = -v; // Inverted for physics
        document.getElementById('floorCurvatureValue').textContent = v.toFixed(2);
        updateFloorGeometry(v);
    });

    document.getElementById('resetPhysicsDefaults').addEventListener('click', () => {
        simulation.physics.gravityConstant      = PHYSICS_DEFAULTS.gravity;
        simulation.physics.repulsionStrength     = PHYSICS_DEFAULTS.pauliStrength;
        simulation.physics.repulsionFactor       = PHYSICS_DEFAULTS.pauliFactor;
        simulation.physics.friction             = PHYSICS_DEFAULTS.friction;
        simulation.physics.terminalVelocity     = PHYSICS_DEFAULTS.terminalVel;
        simulation.physics.bondSpringMultiplier = PHYSICS_DEFAULTS.bondSpring;
        simulation.physics.bondAngleStrength    = PHYSICS_DEFAULTS.bondAngles;
        simulation.physics.lennardJones.setStrength(PHYSICS_DEFAULTS.lennardJones);
        simulation.physics.floorCurvature       = -PHYSICS_DEFAULTS.floorCurvature;

        const set = (id, v) => { document.getElementById(id).value = v; };
        set('gravityLabSlider',    PHYSICS_DEFAULTS.gravity);
        set('pauliStrengthSlider', PHYSICS_DEFAULTS.pauliStrength);
        set('pauliFactorSlider',   PHYSICS_DEFAULTS.pauliFactor);
        set('frictionSlider',      PHYSICS_DEFAULTS.friction);
        set('terminalVelSlider',   PHYSICS_DEFAULTS.terminalVel);
        set('bondSpringSlider',    PHYSICS_DEFAULTS.bondSpring);
        set('bondAnglesSlider',    PHYSICS_DEFAULTS.bondAngles);
        set('lennardJonesSlider',  PHYSICS_DEFAULTS.lennardJones);
        set('floorCurvatureSlider', PHYSICS_DEFAULTS.floorCurvature);

        document.getElementById('gravityLabValue').textContent    = PHYSICS_DEFAULTS.gravity.toFixed(5);
        document.getElementById('pauliStrengthValue').textContent = PHYSICS_DEFAULTS.pauliStrength.toFixed(2);
        document.getElementById('pauliFactorValue').textContent   = PHYSICS_DEFAULTS.pauliFactor.toFixed(1);
        document.getElementById('frictionValue').textContent      = PHYSICS_DEFAULTS.friction.toFixed(2);
        document.getElementById('terminalVelValue').textContent   = PHYSICS_DEFAULTS.terminalVel.toFixed(1);
        document.getElementById('bondSpringValue').textContent    = PHYSICS_DEFAULTS.bondSpring.toFixed(1);
        document.getElementById('bondAnglesValue').textContent    = PHYSICS_DEFAULTS.bondAngles.toFixed(2);
        document.getElementById('lennardJonesValue').textContent  = PHYSICS_DEFAULTS.lennardJones.toFixed(2);
        document.getElementById('floorCurvatureValue').textContent = PHYSICS_DEFAULTS.floorCurvature.toFixed(2);

        updateFloorGeometry(PHYSICS_DEFAULTS.floorCurvature);
        showHint('🔄 Física restaurada a valores reales');
    });

    document.getElementById('randomizePhysics').addEventListener('click', () => {
        const rand = (min, max) => min + Math.random() * (max - min);
        const v = {
            gravity:        rand(0, 0.0005),
            pauliStrength:  rand(0.1, 1.5),
            pauliFactor:    rand(1.2, 2.5),
            friction:       rand(0.85, 0.99),
            terminalVel:    rand(1, 8),
            bondSpring:     rand(0.3, 2.5),
            bondAngles:     rand(0, 0.8),
            lennardJones:   rand(0, 0.8),
            floorCurvature: rand(-0.3, 0.3)
        };

        simulation.physics.gravityConstant      = v.gravity;
        simulation.physics.repulsionStrength     = v.pauliStrength;
        simulation.physics.repulsionFactor       = v.pauliFactor;
        simulation.physics.friction             = v.friction;
        simulation.physics.terminalVelocity     = v.terminalVel;
        simulation.physics.bondSpringMultiplier = v.bondSpring;
        simulation.physics.bondAngleStrength    = v.bondAngles;
        simulation.physics.lennardJones.setStrength(v.lennardJones);
        simulation.physics.floorCurvature       = -v.floorCurvature;

        const set = (id, val) => { document.getElementById(id).value = val; };
        set('gravityLabSlider',    v.gravity);
        set('pauliStrengthSlider', v.pauliStrength);
        set('pauliFactorSlider',   v.pauliFactor);
        set('frictionSlider',      v.friction);
        set('terminalVelSlider',   v.terminalVel);
        set('bondSpringSlider',    v.bondSpring);
        set('bondAnglesSlider',    v.bondAngles);
        set('lennardJonesSlider',  v.lennardJones);
        set('floorCurvatureSlider', v.floorCurvature);

        document.getElementById('gravityLabValue').textContent    = v.gravity.toFixed(5);
        document.getElementById('pauliStrengthValue').textContent = v.pauliStrength.toFixed(2);
        document.getElementById('pauliFactorValue').textContent   = v.pauliFactor.toFixed(1);
        document.getElementById('frictionValue').textContent      = v.friction.toFixed(2);
        document.getElementById('terminalVelValue').textContent   = v.terminalVel.toFixed(1);
        document.getElementById('bondSpringValue').textContent    = v.bondSpring.toFixed(1);
        document.getElementById('bondAnglesValue').textContent    = v.bondAngles.toFixed(2);
        document.getElementById('lennardJonesValue').textContent  = v.lennardJones.toFixed(2);
        document.getElementById('floorCurvatureValue').textContent = v.floorCurvature.toFixed(2);

        updateFloorGeometry(v.floorCurvature);
        showHint('🎲 Física randomizada - ¡prepárate para el caos!');
    });
}

// ── Molecule creation ──────────────────────────────────────────────────────
function createMolecule(index) {
    const mol     = molecules[index];
    const missing = [...new Set(mol.atoms
        .filter(a => !elementDatabase[a.element])
        .map(a => a.element)
    )];

    if(missing.length) {
        showHint(`⚠️ Activa los grupos de: ${missing.join(', ')}`, 'warning');
        return;
    }

    const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 5
    );

    // Usa simulation.createMolecule que respeta bonds explícitos del JSON
    simulation.createMolecule(mol, offset);

    updateStats();
    showHint(`${mol.icon} ${mol.name} agregada`);
    playSound('add');
}

function updateStats() {
    const s = simulation.getStats();
    document.getElementById('atomCount').textContent     = s.atomCount;
    document.getElementById('bondCount').textContent     = s.bondCount;
    document.getElementById('moleculeCount').textContent = s.moleculeCount;
}

// ── Window resize ──────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── selectElementInUI — O(N) fix ───────────────────────────────────────────
function selectElementInUI(symbol) {
    const element = elementDatabase[symbol];
    if(!element) return;
    document.querySelectorAll('.element-btn').forEach(b => b.classList.remove('selected'));
    const target = document.querySelector(`.element-btn[data-symbol="${symbol}"]`);
    if(target) {
        target.classList.add('selected');
        document.getElementById('selectedElement').textContent = element.name;
    }
}

// ── Global window API ──────────────────────────────────────────────────────
window.selectElementInUI = selectElementInUI;

window.setLastTouchedAtom = (atom) => { lastTouchedAtom = atom; };

window.updateFreezeCheckbox = (atom) => {
    if(!atom) return;
    const cb = document.getElementById('freezeCrystalToggle');
    if(cb) cb.checked = atom.frozen || false;
};

window.Bond          = Bond;
window.MetallicCloud = MetallicCloud;
window.showHint      = showHint;

window.getBondsVisibilityState = () => {
    const cb = document.getElementById('bondsToggle');
    return cb ? cb.checked : true;
};

window.applyBondsVisibilityToLines = (lines) => {
    const v = window.getBondsVisibilityState();
    if(Array.isArray(lines)) lines.forEach(l => { if(l) l.visible = v; });
};

window.applyBondsVisibilityToElectronSea = (pts) => {
    if(pts) pts.visible = window.getBondsVisibilityState();
};

// ── Delete mode ────────────────────────────────────────────────────────────
function showDeleteModeModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-box';
    modal.innerHTML = `
        <h3>🗑️ Modo Borrar</h3>
        <p>Elige qué quieres eliminar al tocar un átomo:</p>
        <div class="modal-box__actions">
            <button id="deleteAtomBtn"      class="modal-btn modal-btn--atom">⚛️ Átomo individual</button>
            <button id="deleteStructureBtn" class="modal-btn modal-btn--structure">🧬 Estructura completa</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#deleteAtomBtn').addEventListener('click', () => {
        activateDeleteMode('atom'); document.body.removeChild(overlay);
    });
    modal.querySelector('#deleteStructureBtn').addEventListener('click', () => {
        activateDeleteMode('structure'); document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) document.body.removeChild(overlay);
    });
}

function activateDeleteMode(mode) {
    simulation.config.interactionMode = 'delete';
    simulation.config.deleteMode      = mode;
    const btn = document.getElementById('modeBtn');
    btn.textContent = mode === 'atom' ? '🗑️ Borrar Átomo' : '🗑️ Borrar Estructura';
    btn.classList.add('btn-delete-active');
    showHint(mode === 'atom'
        ? '⚛️ Modo: Borrar átomo individual'
        : '🧬 Modo: Borrar estructura completa'
    );
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
