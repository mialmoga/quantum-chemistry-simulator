/**
 * app.js
 * Main application entry point
 */

import { Simulation } from './core/Simulation.js';
import { getWorldPosition, findAtomAtPoint } from './utils/raycasting.js';
import { showHint, playSound, loadJSON } from './utils/helpers.js';

// Global state
let simulation;
let camera, renderer, scene;
let elementDatabase, molecules;
let selectedElement = null;

// Drag state
let draggedObject = null;
let dragStartWorld = null;

// Touch state
let touchState = {
    touches: [],
    initialDistance: 0,
    initialCameraZ: 0,
    mode: null,
    hasMoved: false,
    wasTwoFinger: false,
    gestureType: null
};

// Mouse state
let isPointerDown = false;
let pointerStart = { x: 0, y: 0 };
let pointerMoved = 0;
let previousMouse = { x: 0, y: 0 };
const DRAG_THRESHOLD = 15;

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
    
    // Init simulation
    simulation = new Simulation(scene, elementDatabase);
    
    // Init UI
    initUI();
    initControls();
    initInteractions();
    
    // Start animation loop
    animate();
    
    showHint('🧪 Selecciona un elemento y toca para agregar átomos');
}

function createBackgroundParticles() {
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const positions = [];
    
    for(let i = 0; i < particleCount; i++) {
        const x = (Math.random() - 0.5) * 100;
        const y = (Math.random() - 0.5) * 100;
        const z = (Math.random() - 0.5) * 100;
        positions.push(x, y, z);
    }
    
    particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const particleMat = new THREE.PointsMaterial({
        color: 0x64c8ff,
        size: 0.3,
        transparent: true,
        opacity: 0.6
    });
    
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    bgParticles.push(particles);
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
            selectedElement = symbol;
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

// ESTE ARCHIVO CONTINÚA... (separado por límite de tokens)
// Ver app-interactions.js para los handlers de touch/mouse

function animate() {
    requestAnimationFrame(animate);
    
    // Update simulation
    simulation.update();
    
    // Background particles animation
    bgParticles.forEach(p => {
        p.rotation.y += 0.0001;
    });
    
    renderer.render(scene, camera);
}

// Window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Export for interactions
export { 
    simulation, 
    camera, 
    scene, 
    renderer,
    selectedElement,
    draggedObject,
    dragStartWorld,
    touchState,
    isPointerDown,
    pointerStart,
    pointerMoved,
    previousMouse,
    DRAG_THRESHOLD,
    getWorldPosition,
    findAtomAtPoint,
    updateStats,
    playSound
};

// Start app
init();
