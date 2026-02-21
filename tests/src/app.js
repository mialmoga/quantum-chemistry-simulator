/**
 * app.js
 * Main application entry point
 */

import { Simulation } from './core/Simulation.js';
import { Bond } from './core/Bond.js';
import { MetallicCloud } from './core/MetallicCloud.js';
import { getWorldPosition, findAtomAtPoint } from './utils/raycasting.js';
import { showHint, playSound, loadJSON } from './utils/helpers.js';
import { initInteractions } from './ui/interactions.js';
import { CrystalGenerator } from './structures/CrystalGenerator.js';
import { ElementLoader } from './data/ElementLoader.js';
import { GroupPanel } from './ui/GroupPanel.js';
import { BondRenderer } from './core/BondRenderer.js';

// Global state
let simulation;
let camera, renderer, scene;
let bondRenderer;
let elementDatabase, molecules;
// Expose globally for console debugging and CrystalGenerator
window.elementDatabase = null; // Will be set after loading
let elementLoader; // NEW: Group-based element loader
let groupPanel; // NEW: UI panel for element groups
let elementSortMode = 'number'; // NEW: 'number' or 'group'
let floorMesh; // Reference to floor plane
let crystalGenerator; // Crystal structure generator
let lastCrystalAtoms = []; // Track last generated crystal
let lastTouchedAtom = null; // Track last dragged/touched atom for freeze/unfreeze

// Background particles
let bgParticles = [];

async function init() {
    // Load data
    try {
        // Load element groups with new loader
        elementLoader = new ElementLoader();
        await elementLoader.loadIndex();
        elementDatabase = elementLoader.getElements();
        window.elementDatabase = elementDatabase; // Expose globally
        
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
    
    // Init GPU bond renderer (InstancedMesh for all bonds)
    bondRenderer = new BondRenderer(scene, 8000);
    
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
    
    // Update simulation (physics + atom visuals)
    simulation.update();
    
    // GPU bond render: InstancedMesh + electron Points
    if(bondRenderer) bondRenderer.update(simulation.bonds);
    
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
        btn.dataset.symbol = symbol;  // Store for selection
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
        
        // Reset camera position
        camera.position.set(0, 0, 25);
        camera.lookAt(0, 0, 0);
        
        // Reset scene rotation
        scene.rotation.set(0, 0, 0);
        
        showHint('🧹 Escena limpiada y cámara restablecida');
    });
    
    document.getElementById('modeBtn').addEventListener('click', (e) => {
        // If switching TO delete mode, show modal
        if(simulation.config.interactionMode === 'add') {
            showDeleteModeModal();
        } else {
            // Switching back to add mode
            simulation.config.interactionMode = 'add';
            const btn = e.target;
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
        const enabled = e.target.checked;
        simulation.physics.setFloor(enabled);
        
        // Add/remove floor from scene
        if(enabled && floorMesh && !scene.children.includes(floorMesh)) {
            scene.add(floorMesh);
        } else if(!enabled && floorMesh) {
            scene.remove(floorMesh);
        }
        
        // Enable/disable floor sliders
        const opacitySlider = document.getElementById('floorOpacitySlider');
        const brightnessSlider = document.getElementById('floorBrightnessSlider');
        if(opacitySlider) opacitySlider.disabled = !enabled;
        if(brightnessSlider) brightnessSlider.disabled = !enabled;
        
        showHint(enabled ? '⬇️ Piso activado' : '⬆️ Piso desactivado');
    });
    
    document.getElementById('bounceSlider').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('bounceValue').textContent = value;
        simulation.physics.restitution = value;
    });
    
    // Atomic repulsion toggle (Pauli exclusion by Éter)
    document.getElementById('repulsionToggle').addEventListener('change', (e) => {
        simulation.physics.repulsionEnabled = e.target.checked;
        showHint(e.target.checked ? '⚛️ Repulsión activada' : '⚛️ Repulsión desactivada');
    });
    
    // CPK color toggle
    document.getElementById('cpkColorToggle').addEventListener('change', (e) => {
        const useCPK = e.target.checked;
        simulation.config.useCPKColors = useCPK;
        
        // Update all existing atoms
        simulation.atoms.forEach(atom => {
            const element = atom.element;
            
            // Check if cpk_color exists in element data
            if(useCPK && element.cpk_color) {
                const cpkColor = typeof element.cpk_color === 'string'
                    ? parseInt(element.cpk_color.replace('0x', ''), 16)
                    : element.cpk_color;
                atom.nucleus.material.color.setHex(cpkColor);
                atom.nucleus.material.emissive.setHex(cpkColor);
            } else {
                // Use original element color
                atom.nucleus.material.color.setHex(element.color);
                atom.nucleus.material.emissive.setHex(element.color);
            }
        });
        
        showHint(useCPK ? '🎨 Colores CPK activados' : '🎨 Colores por elemento activados');
    });
    
    // Bonds visibility toggle
    document.getElementById('bondsToggle').addEventListener('change', (e) => {
        const showBonds = e.target.checked;
        
        // Toggle all bonds
        simulation.bonds.forEach(bond => {
            // Regular bonds (set visible flag for BondRenderer)
            if(bond.atom1 && bond.atom2) {
                bond.visible = showBonds;
            }
            
            // Metallic clouds (have electronPoints and structureLines)
            if(bond.electronPoints) {
                bond.electronPoints.visible = showBonds;
            }
            if(bond.structureLines && Array.isArray(bond.structureLines)) {
                bond.structureLines.forEach(line => {
                    line.visible = showBonds;
                });
            }
        });
        
        showHint(showBonds ? '🔗 Enlaces visibles' : '👁️ Enlaces ocultos');
    });
    
    // Bond angles toggle
    document.getElementById('bondAnglesToggle').addEventListener('change', (e) => {
        simulation.physics.bondAnglesEnabled = e.target.checked;
        showHint(e.target.checked 
            ? '📐 Ángulos de enlace activados' 
            : '📐 Ángulos de enlace desactivados'
        );
    });
    
    // Lennard-Jones toggle
    document.getElementById('lennardJonesToggle').addEventListener('change', (e) => {
        simulation.physics.lennardJones.setEnabled(e.target.checked);
        showHint(e.target.checked 
            ? '🌊 Fuerzas Van der Waals activadas' 
            : '🌊 Fuerzas Van der Waals desactivadas'
        );
    });
    
    // Physics mode toggle (Pedagogical vs Realistic)
    document.getElementById('physicsModeToggle').addEventListener('change', (e) => {
        const mode = e.target.checked ? 'realistic' : 'pedagogical';
        const modeInfo = simulation.physics.modeManager.setMode(mode);
        showHint(`🔬 Modo: ${modeInfo.name}`);
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
        // Validate required elements are available
        const required = ['Na', 'Cl'];
        const missing = required.filter(sym => !elementDatabase[sym]);
        if(missing.length > 0) {
            showHint(`⚠️ Activa los grupos de: ${missing.join(', ')}`, 'warning');
            return;
        }
        
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
        // Validate required elements
        if(!elementDatabase['Fe']) {
            showHint(`⚠️ Activa el grupo de: Fe`, 'warning');
            return;
        }
        
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
        // Validate required elements
        if(!elementDatabase['C']) {
            showHint(`⚠️ Activa el grupo de: C`, 'warning');
            return;
        }
        
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
        // Validate required elements
        if(!elementDatabase['O']) {
            showHint(`⚠️ Activa el grupo de: O`, 'warning');
            return;
        }
        
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
        const shouldFreeze = e.target.checked;
        
        // Priority 1: Use last touched atom's structure
        if(lastTouchedAtom) {
            let structureAtoms = [];
            
            // Check if it's a metallic cloud
            if(lastTouchedAtom.metallicCloud) {
                structureAtoms = lastTouchedAtom.metallicCloud.atoms;
            } 
            // Check if it's part of a molecule
            else if(lastTouchedAtom.bonds.length > 0) {
                const molecule = simulation.findMoleculeContaining(lastTouchedAtom);
                structureAtoms = molecule.atoms;
            }
            // Single atom
            else {
                structureAtoms = [lastTouchedAtom];
            }
            
            if(structureAtoms.length > 0) {
                crystalGenerator.freezeCrystal(structureAtoms, shouldFreeze);
                showHint(shouldFreeze ? '❄️ Estructura congelada' : '🔥 Estructura descongelada');
                return;
            }
        }
        
        // Priority 2: Fallback to last generated crystal
        if(lastCrystalAtoms.length > 0) {
            crystalGenerator.freezeCrystal(lastCrystalAtoms, shouldFreeze);
            showHint(shouldFreeze ? '❄️ Cristal congelado' : '🔥 Cristal descongelado');
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
    
    // Check if all required elements are available (groups active)
    const missingElements = [];
    mol.atoms.forEach(atomData => {
        if(!elementDatabase[atomData.element]) {
            missingElements.push(atomData.element);
        }
    });
    
    if(missingElements.length > 0) {
        const unique = [...new Set(missingElements)];
        showHint(`⚠️ Activa los grupos de: ${unique.join(', ')}`, 'warning');
        return;
    }
    
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

/**
 * Select an element in the UI (highlights button and updates stats)
 * @param {string} symbol - Element symbol (e.g., 'H', 'Na')
 */
function selectElementInUI(symbol) {
    const element = elementDatabase[symbol];
    if(!element) return;
    
    // Find and click the element button to trigger selection
    const buttons = document.querySelectorAll('.element-btn');
    buttons.forEach(btn => {
        if(btn.dataset.symbol === symbol) {
            // Remove previous selection
            document.querySelectorAll('.element-btn').forEach(b => b.classList.remove('selected'));
            // Add selection to this button
            btn.classList.add('selected');
            // Update selected element display
            document.getElementById('selectedElement').textContent = element.name;
        }
    });
}

// Expose globally for interactions.js
window.selectElementInUI = selectElementInUI;
window.setLastTouchedAtom = function(atom) {
    lastTouchedAtom = atom;
};
window.updateFreezeCheckbox = function(atom) {
    if(!atom) return;
    
    const checkbox = document.getElementById('freezeCrystalToggle');
    if(!checkbox) return;
    
    // Check if atom is frozen (structures set atom.frozen = true)
    checkbox.checked = atom.frozen || false;
};
window.Bond = Bond; // Expose Bond class for crystal-to-molecule conversion
window.MetallicCloud = MetallicCloud; // Expose for fragmentation splits
window.showHint = showHint; // Expose for GroupPanel advanced data button

// Expose function to get initial visibility state
window.getBondsVisibilityState = function() {
    const checkbox = document.getElementById('bondsToggle');
    return checkbox ? checkbox.checked : true; // default visible
};

/**
 * Show modal to choose delete mode (atom or structure)
 */
function showDeleteModeModal() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: rgba(20, 20, 30, 0.95);
        border: 2px solid rgba(100, 200, 255, 0.5);
        border-radius: 12px;
        padding: 25px;
        max-width: 400px;
        color: white;
        font-family: 'Segoe UI', system-ui, sans-serif;
    `;
    
    modal.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #ff6666;">🗑️ Modo Borrar</h3>
        <p style="margin: 0 0 20px 0; opacity: 0.9; font-size: 14px;">
            Elige qué quieres eliminar al tocar un átomo:
        </p>
        <div style="display: flex; gap: 12px; flex-direction: column;">
            <button id="deleteAtomBtn" style="
                padding: 15px;
                background: rgba(255, 100, 100, 0.2);
                border: 2px solid rgba(255, 100, 100, 0.5);
                border-radius: 8px;
                color: white;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.2s;
            ">
                ⚛️ Átomo individual
            </button>
            <button id="deleteStructureBtn" style="
                padding: 15px;
                background: rgba(255, 50, 50, 0.3);
                border: 2px solid rgba(255, 50, 50, 0.6);
                border-radius: 8px;
                color: white;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.2s;
            ">
                🧬 Estructura completa
            </button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Add hover effects
    const atomBtn = modal.querySelector('#deleteAtomBtn');
    const structureBtn = modal.querySelector('#deleteStructureBtn');
    
    atomBtn.addEventListener('mouseenter', () => {
        atomBtn.style.background = 'rgba(255, 100, 100, 0.4)';
        atomBtn.style.transform = 'scale(1.02)';
    });
    atomBtn.addEventListener('mouseleave', () => {
        atomBtn.style.background = 'rgba(255, 100, 100, 0.2)';
        atomBtn.style.transform = 'scale(1)';
    });
    
    structureBtn.addEventListener('mouseenter', () => {
        structureBtn.style.background = 'rgba(255, 50, 50, 0.5)';
        structureBtn.style.transform = 'scale(1.02)';
    });
    structureBtn.addEventListener('mouseleave', () => {
        structureBtn.style.background = 'rgba(255, 50, 50, 0.3)';
        structureBtn.style.transform = 'scale(1)';
    });
    
    // Handle clicks
    atomBtn.addEventListener('click', () => {
        activateDeleteMode('atom');
        document.body.removeChild(overlay);
    });
    
    structureBtn.addEventListener('click', () => {
        activateDeleteMode('structure');
        document.body.removeChild(overlay);
    });
    
    // Click outside to cancel
    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
}

function activateDeleteMode(mode) {
    simulation.config.interactionMode = 'delete';
    simulation.config.deleteMode = mode; // 'atom' or 'structure'
    
    const btn = document.getElementById('modeBtn');
    btn.textContent = mode === 'atom' ? '🗑️ Borrar Átomo' : '🗑️ Borrar Estructura';
    btn.style.background = 'rgba(255, 50, 50, 0.3)';
    btn.style.borderColor = 'rgba(255, 100, 100, 0.5)';
    
    const hint = mode === 'atom' 
        ? '⚛️ Modo: Borrar átomo individual'
        : '🧬 Modo: Borrar estructura completa';
    showHint(hint);
}

// Start app
init();