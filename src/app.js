/**
 * app.js
 * Main application entry point
 */

import { Simulation } from './core/Simulation.js';
import { getWorldPosition, findAtomAtPoint } from './utils/raycasting.js';
import { showHint, playSound, loadJSON } from './utils/helpers.js';
import { initInteractions } from './ui/interactions.js';
import { CrystalGenerator } from './structures/CrystalGenerator.js';

// Global state
let simulation;
let camera, renderer, scene;
let elementDatabase, molecules;
let floorMesh; // Reference to floor plane
let crystalGenerator; // Crystal structure generator
let lastCrystalAtoms = []; // Track last generated crystal

// Background particles
let bgParticles = [];

async function init() {
    // Load data
    try {
        [elementDatabase, molecules] = await Promise.all([
            loadJSON('data/elementos.json'),
            loadJSON('data/moleculas.json')
        ]);
        
        // Convert color strings to numbers
        Object.values(elementDatabase).forEach(el => {
            if(typeof el.color === 'string') {
                el.color = parseInt(el.color, 16);
            }
        });
    } catch(error) {
        console.error('Error loading data:', error);
        showHint('❌ Error cargando datos');
        return;
    }
    
    // Setup Three.js
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.015);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 25);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    document.body.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);
    
    // Background particles
    createBackgroundParticles();
    
    // Floor plane (visible)
    createFloorPlane();
    
    // Init simulation
    simulation = new Simulation(scene, elementDatabase);
    
    // Init crystal generator
    crystalGenerator = new CrystalGenerator(simulation);
    
    // Init UI
    initUI();
    initControls();
    
    // Init interactions with dependencies
    initInteractions({
        simulation,
        camera,
        scene,
        renderer,
        getWorldPosition,
        findAtomAtPoint,
        updateStats,
        playSound,
        showHint
    });
    
    // Start animation loop
    animate();
    
    showHint('🧪 Selecciona un elemento y toca para agregar átomos');
}

function animate() {
    requestAnimationFrame(animate);
    
    // Animate background particles
    bgParticles.forEach(p => {
        p.position.y += p.userData.speed;
        if(p.position.y > 25) p.position.y = -25;
    });
    
    // Update simulation
    simulation.update();
    
    renderer.render(scene, camera);
}

function createBackgroundParticles() {
    for(let i = 0; i < 100; i++) {
        const geo = new THREE.SphereGeometry(0.05, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x64c8ff,
            transparent: true,
            opacity: 0.1
        });
        const particle = new THREE.Mesh(geo, mat);
        particle.position.set(
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50
        );
        particle.userData = { speed: Math.random() * 0.02 + 0.01 };
        scene.add(particle);
        bgParticles.push(particle);
    }
}

function createFloorPlane() {
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshBasicMaterial({
        color: 0x1a1a1a,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -15; // Match physics floor
    scene.add(floor);
    floorMesh = floor; // Save reference
    return floor;
}

function initUI() {
    const grid = document.getElementById('elementGrid');
    Object.entries(elementDatabase).forEach(([symbol, element]) => {
        const btn = document.createElement('button');
        btn.className = 'element-btn';
        btn.innerHTML = `
            <div class="element-number">${element.number}</div>
            <div class="element-symbol">${symbol}</div>
            <div class="element-name">${element.name}</div>
        `;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.element-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('selectedElement').textContent = element.name;
        });
        grid.appendChild(btn);
    });
    
    const moleculeContainer = document.getElementById('moleculeButtons');
    molecules.forEach((mol, idx) => {
        const btn = document.createElement('button');
        btn.className = 'control-btn';
        btn.textContent = `${mol.icon} ${mol.formula}`;
        btn.title = mol.name;
        btn.addEventListener('click', () => createMolecule(idx));
        moleculeContainer.appendChild(btn);
    });
    
    updateStats();
}

function initControls() {
    document.getElementById('clearBtn').addEventListener('click', () => {
        simulation.clearAll();
        updateStats();
    });
    
    document.getElementById('modeBtn').addEventListener('click', (e) => {
        simulation.config.interactionMode = simulation.config.interactionMode === 'add' ? 'delete' : 'add';
        const btn = e.target;
        if(simulation.config.interactionMode === 'delete') {
            btn.textContent = '🗑️ Borrar';
            btn.style.background = 'rgba(255, 50, 50, 0.3)';
            btn.style.borderColor = 'rgba(255, 100, 100, 0.5)';
            showHint('Modo Borrar: Toca átomo para eliminar');
        } else {
            btn.textContent = '➕ Agregar';
            btn.style.background = 'rgba(0, 0, 0, 0.85)';
            btn.style.borderColor = 'rgba(100, 200, 255, 0.3)';
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
        const isHidden = ui.classList.contains('hidden');
        ui.classList.toggle('hidden');
        document.getElementById('collapseUI').textContent = isHidden ? '◀' : '▶';
    });
    
    document.getElementById('collapseElements').addEventListener('click', () => {
        const selector = document.getElementById('elementSelector');
        const isHidden = selector.classList.contains('hidden');
        selector.classList.toggle('hidden');
        document.getElementById('collapseElements').textContent = isHidden ? '▼' : '▲';
    });
    
    document.getElementById('collapseMolecules').addEventListener('click', () => {
        const panel = document.querySelector('.molecule-panel');
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        document.getElementById('collapseMolecules').textContent = isHidden ? '▶' : '◀';
    });
    
    // Physics controls
    document.getElementById('gravityToggle').addEventListener('change', (e) => {
        simulation.physics.setGravity(e.target.checked);
        showHint(e.target.checked ? '🌍 Gravedad activada' : '🌍 Gravedad desactivada');
    });
    
    document.getElementById('gravitySlider').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('gravityValue').textContent = value;
        simulation.physics.gravityStrength = value;
    });
    
    document.getElementById('floorToggle').addEventListener('change', (e) => {
        simulation.physics.setFloor(e.target.checked);
        showHint(e.target.checked ? '⬇️ Piso activado' : '⬆️ Piso desactivado');
    });
    
    document.getElementById('bounceSlider').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('bounceValue').textContent = value;
        simulation.physics.restitution = value;
    });
    
    // Floor appearance controls
    document.getElementById('floorOpacitySlider').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('floorOpacityValue').textContent = value.toFixed(2);
        if(floorMesh) {
            floorMesh.material.opacity = value;
        }
    });
    
    document.getElementById('floorBrightnessSlider').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('floorBrightnessValue').textContent = value.toFixed(1);
        if(floorMesh) {
            // Interpolate from dark gray (0x1a1a1a) to light gray (0xe0e0e0)
            const darkGray = 0x1a;  // 26 in decimal
            const lightGray = 0xe0;  // 224 in decimal
            const color = Math.floor(darkGray + (lightGray - darkGray) * value);
            floorMesh.material.color.setHex(color * 0x010101); // RGB same value
        }
    });
    
    // Crystal controls
    const crystalSize = () => parseInt(document.getElementById('crystalSizeSlider').value);
    
    document.getElementById('crystalSizeSlider').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('crystalSizeValue').textContent = value;
        document.getElementById('crystalSizeValue2').textContent = value;
        document.getElementById('crystalSizeValue3').textContent = value;
    });
    
    document.getElementById('crystalNaCl').addEventListener('click', () => {
        const atoms = crystalGenerator.generateNaCl(crystalSize());
        crystalGenerator.strengthenCrystalBonds(atoms);
        lastCrystalAtoms = atoms;
        updateStats();
        showHint('🧂 Cristal NaCl generado');
        playSound('add');
    });
    
    document.getElementById('crystalFe').addEventListener('click', () => {
        const atoms = crystalGenerator.generateBCC(crystalSize(), 'Fe');
        crystalGenerator.strengthenCrystalBonds(atoms);
        lastCrystalAtoms = atoms;
        updateStats();
        showHint('🔩 Cristal de Hierro (BCC) generado');
        playSound('add');
    });
    
    document.getElementById('crystalDiamond').addEventListener('click', () => {
        const atoms = crystalGenerator.generateFCC(crystalSize(), 'C');
        crystalGenerator.strengthenCrystalBonds(atoms);
        lastCrystalAtoms = atoms;
        updateStats();
        showHint('💎 Cristal de Diamante (FCC) generado');
        playSound('add');
    });
    
    document.getElementById('crystalIce').addEventListener('click', () => {
        const atoms = crystalGenerator.generateHexagonal(crystalSize(), 'O');
        crystalGenerator.strengthenCrystalBonds(atoms);
        lastCrystalAtoms = atoms;
        updateStats();
        showHint('❄️ Cristal de Hielo (Hex) generado');
        playSound('add');
    });
    
    document.getElementById('freezeCrystalToggle').addEventListener('change', (e) => {
        if(lastCrystalAtoms.length > 0) {
            crystalGenerator.freezeCrystal(lastCrystalAtoms, e.target.checked);
            showHint(e.target.checked ? '❄️ Cristal congelado' : '🔥 Cristal descongelado');
        }
    });
    
    // Collapse buttons
    document.getElementById('collapsePhysics').addEventListener('click', () => {
        const panel = document.getElementById('physicsPanel');
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        document.getElementById('collapsePhysics').textContent = isHidden ? '▲ Física' : '▼ Física';
    });
    
    document.getElementById('collapseCrystal').addEventListener('click', () => {
        const panel = document.getElementById('crystalPanel');
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        document.getElementById('collapseCrystal').textContent = isHidden ? '▶ Cristales' : '◀ Cristales';
    });
}

function createMolecule(index) {
    const mol = molecules[index];
    
    const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 5
    );
    
    mol.atoms.forEach(atomData => {
        const pos = new THREE.Vector3(...atomData.position);
        pos.multiplyScalar(50);
        pos.add(offset);
        simulation.addAtom(pos, atomData.element);
    });
    
    updateStats();
    showHint(`${mol.icon} ${mol.name} agregada`);
    playSound('add');
}

function updateStats() {
    const stats = simulation.getStats();
    document.getElementById('atomCount').textContent = stats.atomCount;
    document.getElementById('bondCount').textContent = stats.bondCount;
    document.getElementById('moleculeCount').textContent = stats.moleculeCount;
}

// Window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start app
init();