/**
 * interactions.js
 * Touch and mouse event handlers
 */

import { checkAllFragmentation } from '../physics/MoleculeFragmentation.js';

// Imports will be added when integrating
let simulation, camera, scene, renderer;
let getWorldPosition, findAtomAtPoint, updateStats, playSound, showHint;

// State
let draggedObject = null;
let dragStartWorld = null;

let touchState = {
    touches: [],
    initialDistance: 0,
    initialCameraZ: 0,
    mode: null,
    hasMoved: false,
    wasTwoFinger: false,
    gestureType: null
};

let isPointerDown = false;
let pointerStart = { x: 0, y: 0 };
let pointerMoved = 0;
let previousMouse = { x: 0, y: 0 };
let mouseButton = 0; // 0=left, 1=middle, 2=right
const DRAG_THRESHOLD = 15;

export function initInteractions(deps) {
    // Inject dependencies
    simulation = deps.simulation;
    camera = deps.camera;
    scene = deps.scene;
    renderer = deps.renderer;
    getWorldPosition = deps.getWorldPosition;
    findAtomAtPoint = deps.findAtomAtPoint;
    updateStats = deps.updateStats;
    playSound = deps.playSound;
    showHint = deps.showHint;
    
    // Setup event listeners
    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('mouseup', handlePointerUp);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu
    
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
}

function findAtomAtPointMouse(e) {
    const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
    );
    return findAtomAtPoint(mouse.x, mouse.y, camera, simulation.atoms);
}

function handlePointerDown(e) {
    if(e.target === renderer.domElement) {
        mouseButton = e.button; // 0=left, 1=middle, 2=right
        
        // Right-click or middle-click = Pan
        if(mouseButton === 2 || mouseButton === 1) {
            e.preventDefault();
            isPointerDown = true;
            pointerStart = { x: e.clientX, y: e.clientY };
            previousMouse = { x: e.clientX, y: e.clientY };
            return;
        }
        
        // Left-click = Atom interaction
        const atom = findAtomAtPointMouse(e);
        
        if(atom && simulation.config.interactionMode === 'delete') {
            deleteAtomOrMolecule(atom);
            return;
        }
        
        if(atom && simulation.config.interactionMode === 'add') {
            // Drag mode
            if(atom.metallicCloud) {
                // Metal crystal: move ALL atoms in the cloud together
                draggedObject = {
                    atoms: atom.metallicCloud.atoms,
                    cloud: atom.metallicCloud,
                    moveAll(delta) {
                        this.atoms.forEach(a => a.group.position.add(delta));
                        // Also move free electrons so they don't pile up at bounds
                        if(this.cloud.electronPoints && this.cloud.electronData) {
                            const arr = this.cloud.electronPoints.geometry.attributes.position.array;
                            for(let i = 0; i < this.cloud.electronData.length; i++) {
                                arr[i*3]   += delta.x;
                                arr[i*3+1] += delta.y;
                                arr[i*3+2] += delta.z;
                            }
                            this.cloud.electronPoints.geometry.attributes.position.needsUpdate = true;
                        }
                    }
                };
                draggedObject.atoms.forEach(a => a.isDragging = true);
            } else if(atom.bonds.length === 0) {
                draggedObject = atom;
                atom.isDragging = true;
            } else {
                draggedObject = simulation.findMoleculeContaining(atom);
                draggedObject.highlight?.(0.5);  // optional - metallic cloud doesn't have this
                draggedObject.atoms.forEach(a => a.isDragging = true);
            }
            dragStartWorld = getWorldPosition(e.clientX, e.clientY, camera, scene);
            
            // Auto-select dragged atom's element in UI
            if(window.selectElementInUI && atom) {
                window.selectElementInUI(atom.symbol);
            }
            
            // Track for freeze/unfreeze
            if(window.setLastTouchedAtom && atom) {
                window.setLastTouchedAtom(atom);
            }
            
            // Update freeze checkbox to reflect structure's frozen state
            if(window.updateFreezeCheckbox) {
                window.updateFreezeCheckbox(atom);
            }
        } else {
            // Rotate scene
            isPointerDown = true;
            pointerMoved = 0;
            pointerStart = { x: e.clientX, y: e.clientY };
            previousMouse = { x: e.clientX, y: e.clientY };
        }
    }
}

function handlePointerMove(e) {
    if(draggedObject) {
        // Dragging atom/molecule
        const currentWorld = getWorldPosition(e.clientX, e.clientY, camera, scene);
        if(currentWorld) {
            const delta = currentWorld.clone().sub(dragStartWorld);
            
            if(draggedObject.group) { // It's an Atom
                draggedObject.group.position.add(delta);
                // Update velocity so nucleus glows during drag
                draggedObject.velocity.copy(delta).multiplyScalar(10);
            } else if(draggedObject.atoms) { // It's a Molecule or metallic cloud
                draggedObject.moveAll(delta);
                // Update velocity for all atoms in molecule/cloud
                draggedObject.atoms.forEach(a => {
                    a.velocity.copy(delta).multiplyScalar(10);
                });
            }
            
            dragStartWorld = currentWorld;
        }
    } else if(isPointerDown) {
        const deltaX = e.clientX - previousMouse.x;
        const deltaY = e.clientY - previousMouse.y;
        
        pointerMoved += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Right/Middle button = Pan camera
        if(mouseButton === 2 || mouseButton === 1) {
            camera.position.x -= deltaX * 0.02;
            camera.position.y += deltaY * 0.02;
        } else {
            // Left button = Rotate scene
            scene.rotation.y += deltaX * 0.01;
            scene.rotation.x += deltaY * 0.01;
        }
        
        previousMouse = { x: e.clientX, y: e.clientY };
    }
}

function handlePointerUp(e) {
    if(draggedObject) {
        // Release dragged object
        if(draggedObject.atoms) { // Molecule or metallic cloud
            draggedObject.highlight?.(0);  // optional - metallic cloud doesn't have this
            draggedObject.atoms.forEach(a => {
                a.isDragging = false;
                a.velocity.multiplyScalar(0.1); // Decay velocity so glow fades
            });
        } else { // Atom
            draggedObject.isDragging = false;
            draggedObject.velocity.multiplyScalar(0.1); // Decay velocity so glow fades
        }
        draggedObject = null;
        dragStartWorld = null;
    } else if(isPointerDown && pointerMoved < DRAG_THRESHOLD && e && e.target === renderer.domElement && simulation.config.interactionMode === 'add') {
        // Add new atom
        const selectedElement = getSelectedElement();
        if(selectedElement) {
            const position = getWorldPosition(e.clientX, e.clientY, camera, scene);
            simulation.addAtom(position, selectedElement);
            updateStats();
            playSound('add');
        }
    }
    isPointerDown = false;
    pointerMoved = 0;
}

// Touch handlers
function handleTouchStart(e) {
    e.preventDefault();
    const touches = Array.from(e.touches);
    touchState.touches = touches.map(t => ({ x: t.clientX, y: t.clientY }));
    touchState.hasMoved = false;
    
    if(touches.length === 1) {
        const touch = touches[0];
        const mouse = new THREE.Vector2(
            (touch.clientX / window.innerWidth) * 2 - 1,
            -(touch.clientY / window.innerHeight) * 2 + 1
        );
        
        const atom = findAtomAtPoint(mouse.x, mouse.y, camera, simulation.atoms);
        
        if(atom && simulation.config.interactionMode === 'delete') {
            deleteAtomOrMolecule(atom);
            touchState.mode = null;
            return;
        }
        
        if(atom && simulation.config.interactionMode === 'add') {
            // Drag mode
            touchState.mode = 'drag';
            if(atom.metallicCloud) {
                draggedObject = {
                    atoms: atom.metallicCloud.atoms,
                    cloud: atom.metallicCloud,
                    moveAll(delta) {
                        this.atoms.forEach(a => a.group.position.add(delta));
                        // Also move free electrons so they don't pile up at bounds
                        if(this.cloud.electronPoints && this.cloud.electronData) {
                            const arr = this.cloud.electronPoints.geometry.attributes.position.array;
                            for(let i = 0; i < this.cloud.electronData.length; i++) {
                                arr[i*3]   += delta.x;
                                arr[i*3+1] += delta.y;
                                arr[i*3+2] += delta.z;
                            }
                            this.cloud.electronPoints.geometry.attributes.position.needsUpdate = true;
                        }
                    }
                };
                draggedObject.atoms.forEach(a => a.isDragging = true);
            } else if(atom.bonds.length === 0) {
                draggedObject = atom;
                atom.isDragging = true;
            } else {
                draggedObject = simulation.findMoleculeContaining(atom);
                draggedObject.highlight?.(0.5);  // optional - metallic cloud doesn't have this
                draggedObject.atoms.forEach(a => a.isDragging = true);
            }
            dragStartWorld = getWorldPosition(touch.clientX, touch.clientY, camera, scene);
            
            // Auto-select dragged atom's element in UI
            if(window.selectElementInUI && atom) {
                window.selectElementInUI(atom.symbol);
            }
            
            // Track for freeze/unfreeze
            if(window.setLastTouchedAtom && atom) {
                window.setLastTouchedAtom(atom);
            }
            
            // Update freeze checkbox to reflect structure's frozen state
            if(window.updateFreezeCheckbox) {
                window.updateFreezeCheckbox(atom);
            }
        } else {
            // Rotate scene
            touchState.mode = 'rotate';
            touchState.wasTwoFinger = false;
            pointerStart = { x: touch.clientX, y: touch.clientY };
            previousMouse = { x: touch.clientX, y: touch.clientY };
            isPointerDown = true;
            pointerMoved = 0;
        }
    } else if(touches.length === 2) {
        touchState.mode = 'gesture';
        touchState.wasTwoFinger = true;
        touchState.gestureType = null;
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        touchState.initialDistance = Math.sqrt(dx * dx + dy * dy);
        touchState.initialCameraZ = camera.position.z;
        isPointerDown = false;
        pointerMoved = 9999;
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    const touches = Array.from(e.touches);
    
    if(touches.length === 1 && touchState.mode === 'drag' && draggedObject) {
        // Dragging atom/molecule
        touchState.hasMoved = true;
        const touch = touches[0];
        const currentWorld = getWorldPosition(touch.clientX, touch.clientY, camera, scene);
        if(currentWorld) {
            const delta = currentWorld.clone().sub(dragStartWorld);
            
            if(draggedObject.group) { // It's an Atom
                draggedObject.group.position.add(delta);
                // Update velocity so nucleus glows during drag
                draggedObject.velocity.copy(delta).multiplyScalar(10);
            } else if(draggedObject.atoms) { // It's a Molecule or metallic cloud
                draggedObject.moveAll(delta);
                // Update velocity for all atoms
                draggedObject.atoms.forEach(a => {
                    a.velocity.copy(delta).multiplyScalar(10);
                });
            }
            
            dragStartWorld = currentWorld;
        }
    } else if(touches.length === 1 && touchState.mode === 'rotate') {
        touchState.hasMoved = true;
        const touch = touches[0];
        const deltaX = touch.clientX - previousMouse.x;
        const deltaY = touch.clientY - previousMouse.y;
        
        pointerMoved += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        scene.rotation.y += deltaX * 0.01;
        scene.rotation.x += deltaY * 0.01;
        
        previousMouse = { x: touch.clientX, y: touch.clientY };
    } else if(touches.length === 2 && touchState.mode === 'gesture') {
        touchState.hasMoved = true;
        pointerMoved = 9999;
        
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        const distanceChange = Math.abs(currentDistance - touchState.initialDistance);
        const center = {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
        const oldCenter = {
            x: (touchState.touches[0].x + touchState.touches[1].x) / 2,
            y: (touchState.touches[0].y + touchState.touches[1].y) / 2
        };
        const centerDelta = Math.sqrt(
            Math.pow(center.x - oldCenter.x, 2) + 
            Math.pow(center.y - oldCenter.y, 2)
        );
        
        // Tolerant threshold
        if(!touchState.gestureType) {
            if(distanceChange > 15) {
                touchState.gestureType = 'pinch';
            } else if(centerDelta > 10) {
                touchState.gestureType = 'pan';
            }
        }
        
        if(touchState.gestureType === 'pinch') {
            const scale = currentDistance / touchState.initialDistance;
            camera.position.z = touchState.initialCameraZ / scale;
            camera.position.z = Math.max(5, Math.min(50, camera.position.z));
        } else if(touchState.gestureType === 'pan') {
            const deltaX = (center.x - oldCenter.x) * 0.02;
            const deltaY = (center.y - oldCenter.y) * 0.02;
            camera.position.x -= deltaX;
            camera.position.y += deltaY;
        }
        
        touchState.touches = touches.map(t => ({ x: t.clientX, y: t.clientY }));
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    if(e.touches.length === 0) {
        if(draggedObject) {
            if(draggedObject.atoms) {
                draggedObject.highlight?.(0);  // optional - metallic cloud doesn't have this
                draggedObject.atoms.forEach(a => {
                    a.isDragging = false;
                    a.velocity.multiplyScalar(0.1); // Decay velocity so glow fades
                });
            } else {
                draggedObject.isDragging = false;
                draggedObject.velocity.multiplyScalar(0.1); // Decay velocity so glow fades
            }
            draggedObject = null;
            dragStartWorld = null;
        }
        
        const shouldPlaceAtom = (
            touchState.mode === 'rotate' && 
            !touchState.hasMoved && 
            !touchState.wasTwoFinger &&
            pointerMoved < DRAG_THRESHOLD &&
            simulation.config.interactionMode === 'add'
        );
        
        if(shouldPlaceAtom) {
            const selectedElement = getSelectedElement();
            if(selectedElement) {
                const position = getWorldPosition(pointerStart.x, pointerStart.y, camera, scene);
                simulation.addAtom(position, selectedElement);
                updateStats();
                playSound('add');
            }
        }
        
        touchState.mode = null;
        touchState.touches = [];
        touchState.hasMoved = false;
        touchState.wasTwoFinger = false;
        touchState.gestureType = null;
        isPointerDown = false;
        pointerMoved = 0;
    } else if(e.touches.length === 1) {
        if(touchState.wasTwoFinger) {
            touchState.mode = null;
            isPointerDown = false;
            pointerMoved = 9999;
        } else {
            touchState.mode = 'rotate';
            touchState.hasMoved = false;
            const touch = e.touches[0];
            pointerStart = { x: touch.clientX, y: touch.clientY };
            previousMouse = { x: touch.clientX, y: touch.clientY };
            isPointerDown = true;
            pointerMoved = 0;
        }
    }
}

function handleWheel(e) {
    e.preventDefault();
    camera.position.z += e.deltaY * 0.01;
    camera.position.z = Math.max(5, Math.min(50, camera.position.z));
}

// Helper functions
function deleteAtomOrMolecule(atom) {
    const mode = simulation.config.deleteMode || 'structure'; // Default structure
    
    // Mode: atom - ALWAYS delete only the clicked atom
    if(mode === 'atom') {
        // Special handling for metallic crystals
        if(atom.metallicCloud) {
            const cloud = atom.metallicCloud;
            
            // Remove structure lines connected to this atom
            if(cloud.structureLines && Array.isArray(cloud.structureLines)) {
                const linesToRemove = cloud.structureLines.filter(line => {
                    const { atom1, atom2 } = line.userData;
                    return atom1 === atom || atom2 === atom;
                });
                
                linesToRemove.forEach(line => {
                    scene.remove(line);
                    if(line.geometry) line.geometry.dispose();
                    if(line.material) line.material.dispose();
                });
                
                // Keep only lines that don't involve this atom
                cloud.structureLines = cloud.structureLines.filter(line => {
                    const { atom1, atom2 } = line.userData;
                    return atom1 !== atom && atom2 !== atom;
                });
            }
            
            // IMPORTANT: Remove atom from simulation FIRST
            simulation.removeAtom(atom);
            
            // Then remove from cloud's atoms array
            cloud.atoms = cloud.atoms.filter(a => a !== atom);
            
            // If cloud has 2 or fewer atoms, destroy it and convert to normal bonds
            if(cloud.atoms.length <= 2) {
                // Remove cloud visualization
                if(cloud.electronPoints) {
                    scene.remove(cloud.electronPoints);
                    cloud.electronPoints.geometry.dispose();
                    cloud.electronPoints.material.dispose();
                }
                
                // Remove structure lines (array of Line objects)
                if(cloud.structureLines && Array.isArray(cloud.structureLines)) {
                    cloud.structureLines.forEach(line => {
                        scene.remove(line);
                        if(line.geometry) line.geometry.dispose();
                        if(line.material) line.material.dispose();
                    });
                    cloud.structureLines = [];
                }
                
                // Remove cloud from simulation.bonds
                simulation.bonds = simulation.bonds.filter(b => b !== cloud);
                
                // Clear metallicCloud reference from remaining atoms
                cloud.atoms.forEach(a => { a.metallicCloud = null; });
                
                // If exactly 2 atoms remain, create a normal bond between them
                if(cloud.atoms.length === 2) {
                    const [a1, a2] = cloud.atoms;
                    const Bond = window.Bond; // Access Bond class from global
                    if(Bond) {
                        const bond = new Bond(a1, a2, scene);
                        simulation.bonds.push(bond);
                        showHint('⚛️ Átomo eliminado (cristal → enlace metálico)');
                    } else {
                        showHint('⚛️ Átomo eliminado (cristal disuelto)');
                    }
                } else {
                    showHint('⚛️ Átomo eliminado (cristal metálico destruido)');
                }
            } else {
                showHint(`⚛️ Átomo eliminado (quedan ${cloud.atoms.length} en cristal)`);
                
                // Check if crystal fragmented into disconnected pieces
                checkAllFragmentation(simulation);
            }
        } else {
            // Regular atom
            simulation.removeAtom(atom);
            showHint('⚛️ Átomo eliminado');
        }
        updateStats();
        playSound('delete');
        return;
    }
    
    // Mode: structure - Delete entire structure
    // Check if atom is part of metallic cloud (Fe crystal)
    if(atom.metallicCloud) {
        const cloud = atom.metallicCloud;
        const atomCount = cloud.atoms.length;
        
        // Remove all atoms in the cloud
        cloud.atoms.forEach(a => {
            simulation.removeAtom(a);
        });
        
        // Remove the cloud itself from scene
        if(cloud.electronPoints) {
            scene.remove(cloud.electronPoints);
            cloud.electronPoints.geometry.dispose();
            cloud.electronPoints.material.dispose();
        }
        
        // Remove structure lines (array of Line objects)
        if(cloud.structureLines && Array.isArray(cloud.structureLines)) {
            cloud.structureLines.forEach(line => {
                scene.remove(line);
                if(line.geometry) line.geometry.dispose();
                if(line.material) line.material.dispose();
            });
            cloud.structureLines = [];
        }
        
        // Remove from simulation.bonds
        simulation.bonds = simulation.bonds.filter(b => b !== cloud);
        
        showHint(`🧲 Cristal metálico eliminado (${atomCount} átomos)`);
    } else if(atom.bonds.length === 0) {
        simulation.removeAtom(atom);
        showHint('Átomo eliminado');
    } else {
        const molecule = simulation.findMoleculeContaining(atom);
        molecule.remove(simulation.atoms);
        showHint(`Molécula eliminada (${molecule.atoms.length} átomos)`);
    }
    updateStats();
    playSound('delete');
}

function getSelectedElement() {
    const selectedBtn = document.querySelector('.element-btn.selected');
    if(!selectedBtn) return null;
    return selectedBtn.querySelector('.element-symbol').textContent;
}
