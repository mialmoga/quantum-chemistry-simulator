/**
 * app.js
 * Main application entry point
 */

import { Simulation } from './core/Simulation.js';
import { getWorldPosition, findAtomAtPoint } from './utils/raycasting.js';
import { showHint, playSound, loadJSON } from './utils/helpers.js';
import { initInteractions } from './ui/interactions.js';
import { CrystalGenerator } from './structures/CrystalGenerator.js';
import { ElementLoader } from './data/ElementLoader.js';
import { GroupPanel } from './ui/GroupPanel.js';

// Global state
let simulation;
let camera, renderer, scene;
let elementDatabase, molecules;
let elementLoader; // NEW: Group-based element loader
let groupPanel; // NEW: UI panel for element groups
let elementSortMode = 'number'; // NEW: 'number' or 'group'
let floorMesh; // Reference to floor plane
let crystalGenerator; // Crystal structure generator
let lastCrystalAtoms = []; // Track last generated crystal

// Background particles
let bgParticles = [];

async function init() {
    // Load data
    try {
        // Load element groups with new loader
        elementLoader = new ElementLoader();
        await elementLoader.loadIndex();
        elementDatabase = elementLoader.getElements();
        
        // Load molecules (still using old format)
        molecules = await loadJSON('data/moleculas.json');
        
        // Convert color strings to numbers
        Object.values(elementDatabase).forEach(el => {
            if(typeof el.color === 'string') {
                el.color = parseInt(el.color, 16);
            }
        });
        
        console.log(`✅ Loaded ${Object.keys(elementDatabase).length} elements from ${elementLoader.getActiveGroups().length} groups`);
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
    renderer.setClearColor(0x000000, 0); // Alpha 0 = canvas transparente, deja ver CSS gradient
    document.body.appendChild(renderer.domElement);
    
    // Lighting (same as WORKING version for warm ambiance)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x64c8ff, 1, 100);
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
    
    // Auto-collapse panels on mobile
    initMobileLayout();
    
    showHint('🧪 Selecciona un elemento y toca para agregar átomos');
}

function initMobileLayout() {
    const isMobile = window.innerWidth <= 768 || 
                     /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if(!isMobile) return;
    
    // Collapse: Physics panel
    const physicsPanel = document.getElementById('physicsPanel');
    const collapsePhysics = document.getElementById('collapsePhysics');
    if(physicsPanel && collapsePhysics) {
        physicsPanel.style.display = 'none';
        collapsePhysics.textContent = '▲ Física';   // ▲ = oculto, toca para mostrar
    }
    
    // Collapse: Crystal panel
    const crystalPanel = document.getElementById('crystalPanel');
    const collapseCrystal = document.getElementById('collapseCrystal');
    if(crystalPanel && collapseCrystal) {
        crystalPanel.style.display = 'none';
        collapseCrystal.textContent = '▲ Cristales'; // ▲ = oculto, toca para mostrar
    }
    
    // Collapse: Group panel (created by GroupPanel.js)
    const groupPanelEl = document.getElementById('groupPanel');
    const collapseGroupsBtn = document.getElementById('collapseGroups');
    if(groupPanelEl && collapseGroupsBtn) {
        groupPanelEl.style.display = 'none';
        collapseGroupsBtn.style.display = 'block';
    }
    
    // Collapse: Molecule panel
    const moleculePanel = document.querySelector('.molecule-panel');
    if(moleculePanel) {
        moleculePanel.classList.add('hidden');
        const collapseMolecules = document.getElementById('collapseMolecules');
        if(collapseMolecules) collapseMolecules.textContent = '◀'; // ◀ = oculto, toca para mostrar
    }
    
    console.log('📱 Mobile: paneles colapsados automáticamente');
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
    // Initialize sort mode before building grid
    window.elementSortMode = elementSortMode;
    
    // Build element grid with colors from the start
    refreshElementGrid();
    
    const moleculeContainer = document.getElementById('moleculeButtons');
    molecules.forEach((mol, idx) => {
        const btn = document.createElement('button');
        btn.className = 'control-btn';
        btn.textContent = `${mol.icon} ${mol.formula}`;
        btn.title = mol.name;
        btn.addEventListener('click', () => createMolecule(idx));
        moleculeContainer.appendChild(btn);
    });
    
    // Create group panel
    groupPanel = new GroupPanel(elementLoader, (groupKey, enabled) => {
        // Callback when group is toggled or sort changes
        if(groupKey) {
            // Group toggled
            if(enabled) {
                showHint(`✅ Grupo ${elementLoader.getGroup(groupKey).name} activado`);
            } else {
                showHint(`❌ Grupo ${elementLoader.getGroup(groupKey).name} desactivado`);
            }
        }
        
        // Refresh element grid
        refreshElementGrid();
    });
    groupPanel.createPanel();
    
    // Add fullscreen button
    addFullscreenButton();

    updateStats();
}

// Add fullscreen button to UI panel
function addFullscreenButton() {
    const uiPanel = document.getElementById('ui');
    if(!uiPanel) {
        console.error('Panel #ui no encontrado');
        return;
    }
    
    // Make sure panel has position relative
    if(window.getComputedStyle(uiPanel).position === 'static') {
        uiPanel.style.position = 'relative';
    }
    
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = 'fullscreenBtn';
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.title = 'Pantalla completa';
    fullscreenBtn.className = 'fullscreen-btn'; // Add class for styling
    fullscreenBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(100, 200, 255, 0.15);
        border: 1px solid rgba(100, 200, 255, 0.4);
        border-radius: 6px;
        color: #64c8ff;
        width: 32px;
        height: 32px;
        font-size: 18px;
        cursor: pointer;
        transition: all 0.2s;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
    `;
    
    fullscreenBtn.addEventListener('mouseenter', () => {
        fullscreenBtn.style.background = 'rgba(100, 200, 255, 0.3)';
        fullscreenBtn.style.borderColor = 'rgba(100, 200, 255, 0.6)';
        fullscreenBtn.style.transform = 'scale(1.05)';
    });
    
    fullscreenBtn.addEventListener('mouseleave', () => {
        fullscreenBtn.style.background = 'rgba(100, 200, 255, 0.15)';
        fullscreenBtn.style.borderColor = 'rgba(100, 200, 255, 0.4)';
        fullscreenBtn.style.transform = 'scale(1)';
    });
    
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent any parent handlers
        toggleFullscreen();
    });
    
    // Insert as first child (top-right corner)
    uiPanel.insertBefore(fullscreenBtn, uiPanel.firstChild);
    
    // Listen for fullscreen changes to update icon
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
    document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
    document.addEventListener('MSFullscreenChange', updateFullscreenIcon);
    
    console.log('✅ Fullscreen button added');
}

function toggleFullscreen() {
    if (!document.fullscreenElement && 
        !document.webkitFullscreenElement && 
        !document.mozFullScreenElement && 
        !document.msFullscreenElement) {
        // Enter fullscreen
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
        console.log('Entering fullscreen');
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        console.log('Exiting fullscreen');
    }
}

function updateFullscreenIcon() {
    const btn = document.getElementById('fullscreenBtn');
    if(!btn) return;
    
    const isFullscreen = document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.mozFullScreenElement || 
                        document.msFullscreenElement;
    
    if(isFullscreen) {
        btn.innerHTML = '⛶'; // Same icon (context changes meaning)
        btn.title = 'Salir de pantalla completa (ESC)';
    } else {
        btn.innerHTML = '⛶';
        btn.title = 'Pantalla completa';
    }
}


function refreshElementGrid() {
    const grid = document.getElementById('elementGrid');
    grid.innerHTML = ''; // Clear existing
    
    // Rebuild with current elements
    elementDatabase = elementLoader.getElements();
    
    // Sort elements based on current mode
    const sortMode = window.elementSortMode || 'number';
    let sortedElements;
    
    if(sortMode === 'number') {
        // Sort by atomic number (traditional periodic table)
        sortedElements = Object.entries(elementDatabase).sort((a, b) => 
            a[1].number - b[1].number
        );
    } else {
        // Sort by group, then by number within group
        sortedElements = Object.entries(elementDatabase).sort((a, b) => {
            // First by group
            if(a[1].group !== b[1].group) {
                return a[1].group.localeCompare(b[1].group);
            }
            // Then by number within group
            return a[1].number - b[1].number;
        });
    }
    
    sortedElements.forEach(([symbol, element]) => {
        const btn = document.createElement('button');
        btn.className = 'element-btn';
        btn.innerHTML = `
            <div class="element-number">${element.number}</div>
            <div class="element-symbol">${symbol}</div>
            <div class="element-name">${element.name}</div>
        `;
        
        // Apply group color as border (groupColor may be string or number)
        if(element.groupColor !== undefined) {
            const colorNum = typeof element.groupColor === 'string'
                ? parseInt(element.groupColor.replace('0x', ''), 16)
                : element.groupColor;
            const hexColor = '#' + colorNum.toString(16).padStart(6, '0');
            btn.style.borderColor = hexColor;
            btn.style.borderWidth = '2px';
        }
        
        btn.addEventListener('click', () => {
            document.querySelectorAll('.element-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('selectedElement').textContent = element.name;
        });
        grid.appendChild(btn);
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
        const btn = document.getElementById('collapseMolecules');
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        // oculto→visible: ▶  |  visible→oculto: ◀
        btn.textContent = isHidden ? '▶' : '◀';
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
        crystalGenerator.freezeCrystal(atoms, true); // Default frozen
        lastCrystalAtoms = atoms;
        document.getElementById('freezeCrystalToggle').checked = true; // Update UI
        updateStats();
        showHint('🧂 Cristal NaCl generado (congelado)');
        playSound('add');
    });
    
    document.getElementById('crystalFe').addEventListener('click', () => {
        const atoms = crystalGenerator.generateBCC(crystalSize(), 'Fe');
        crystalGenerator.strengthenCrystalBonds(atoms);
        crystalGenerator.freezeCrystal(atoms, true); // Default frozen
        lastCrystalAtoms = atoms;
        document.getElementById('freezeCrystalToggle').checked = true;
        updateStats();
        showHint('🔩 Cristal de Hierro (BCC) generado (congelado)');
        playSound('add');
    });
    
    document.getElementById('crystalDiamond').addEventListener('click', () => {
        const atoms = crystalGenerator.generateFCC(crystalSize(), 'C');
        crystalGenerator.strengthenCrystalBonds(atoms);
        crystalGenerator.freezeCrystal(atoms, true); // Default frozen
        lastCrystalAtoms = atoms;
        document.getElementById('freezeCrystalToggle').checked = true;
        updateStats();
        showHint('💎 Cristal de Diamante (FCC) generado (congelado)');
        playSound('add');
    });
    
    document.getElementById('crystalIce').addEventListener('click', () => {
        const atoms = crystalGenerator.generateHexagonal(crystalSize(), 'O');
        crystalGenerator.strengthenCrystalBonds(atoms);
        crystalGenerator.freezeCrystal(atoms, true); // Default frozen
        lastCrystalAtoms = atoms;
        document.getElementById('freezeCrystalToggle').checked = true;
        updateStats();
        showHint('❄️ Cristal de Hielo (Hex) generado (congelado)');
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
        const btn = document.getElementById('collapsePhysics');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '▼ Física' : '▲ Física';
    });
    
    document.getElementById('collapseCrystal').addEventListener('click', () => {
        const panel = document.getElementById('crystalPanel');
        const btn = document.getElementById('collapseCrystal');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '▼ Cristales' : '▲ Cristales';
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