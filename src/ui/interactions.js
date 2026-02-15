/**
 * interactions.js
 * Touch and mouse event handlers
 */

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
        const atom = findAtomAtPointMouse(e);
        
        if(atom && simulation.config.interactionMode === 'delete') {
            deleteAtomOrMolecule(atom);
            return;
        }
        
        if(atom && simulation.config.interactionMode === 'add') {
            // Drag mode
            if(atom.bonds.length === 0) {
                draggedObject = atom;
            } else {
                draggedObject = simulation.findMoleculeContaining(atom);
                draggedObject.highlight(0.5);
            }
            dragStartWorld = getWorldPosition(e.clientX, e.clientY, camera, scene);
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
            } else if(draggedObject.atoms) { // It's a Molecule
                draggedObject.moveAll(delta);
            }
            
            dragStartWorld = currentWorld;
        }
    } else if(isPointerDown) {
        // Rotating scene
        const deltaX = e.clientX - previousMouse.x;
        const deltaY = e.clientY - previousMouse.y;
        
        pointerMoved += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        scene.rotation.y += deltaX * 0.01;
        scene.rotation.x += deltaY * 0.01;
        
        previousMouse = { x: e.clientX, y: e.clientY };
    }
}

function handlePointerUp(e) {
    if(draggedObject) {
        // Release dragged object
        if(draggedObject.atoms) { // Molecule
            draggedObject.highlight(0);
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
            if(atom.bonds.length === 0) {
                draggedObject = atom;
            } else {
                draggedObject = simulation.findMoleculeContaining(atom);
                draggedObject.highlight(0.5);
            }
            dragStartWorld = getWorldPosition(touch.clientX, touch.clientY, camera, scene);
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
            } else if(draggedObject.atoms) { // It's a Molecule
                draggedObject.moveAll(delta);
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
                draggedObject.highlight(0);
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
    if(atom.bonds.length === 0) {
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
