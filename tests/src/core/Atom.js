/**
 * Atom.js
 * Core class for atomic structure and visualization
 */

import { makeElectronMaterial } from './electronMaterial.js';

// Reusable objects to avoid GC pressure (no new objects per frame)
const _tempVec = new THREE.Vector3();

export class Atom {
    constructor(position, elementSymbol, elementDatabase, scene, config = {}) {
        this.element = elementDatabase[elementSymbol];
        this.symbol = elementSymbol;
        this.group = new THREE.Group();
        this.bonds = [];
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.force = new THREE.Vector3(0, 0, 0);
        this.radius = 0.5; // For raycasting (updated below)
        
        // Scale nucleus size based on real atomic radius (pm)
        // Range: ~30pm (He) to ~260pm (Cs) → mapped to 0.3 - 1.2 visual units
        const atomicRadius = this.element.radius_atomic_pm || 100; // fallback 100pm
        const MIN_PM = 30, MAX_PM = 260;
        const MIN_VIS = 0.3, MAX_VIS = 1.1;
        this.nucleusRadius = MIN_VIS + ((atomicRadius - MIN_PM) / (MAX_PM - MIN_PM)) * (MAX_VIS - MIN_VIS);
        this.nucleusRadius = Math.max(MIN_VIS, Math.min(MAX_VIS, this.nucleusRadius));
        this.radius = this.nucleusRadius; // Update raycasting radius
        
        // Config (visualization modes)
        this.config = config;
        this.scene = scene;
        
        this._createNucleus();
        this._createShells();
        this._createCloudParticles();
        
        this.group.position.copy(position);
        this.scene.add(this.group);
    }
    
    _createNucleus() {
        const nucleusGeo = new THREE.SphereGeometry(this.nucleusRadius, 32, 32);
        
        // Use CPK color if enabled, otherwise use element color
        const useCPK = this.config.useCPKColors || false;
        const displayColor = (useCPK && this.element.cpk_color) 
            ? (typeof this.element.cpk_color === 'string'
                ? parseInt(this.element.cpk_color.replace('0x', ''), 16)
                : this.element.cpk_color)
            : this.element.color;
        
        const nucleusMat = new THREE.MeshPhongMaterial({
            color: displayColor,
            emissive: displayColor,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        this.nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
        this.group.add(this.nucleus);
    }
    
    _createShells() {
        this.shells      = [];   // ring Lines (one per shell)
        this.shellElectrons = []; // kept for consumeValenceElectrons compatibility
        this._shellData  = [];   // animation data per electron
        this._shellRadii = [];   // radius per shell

        let radius = this.nucleusRadius + 0.6;
        const visualizationMode = this.config.visualizationMode || 'clouds';
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        // Count total electrons for Points buffer
        const totalE = this.element.shells.reduce((a, b) => a + b, 0);
        const ePosArr    = new Float32Array(totalE * 3);
        const eColorArr  = new Float32Array(totalE * 3); // cyan tint per shell

        let eIndex = 0;

        this.element.shells.forEach((electronCount, shellIndex) => {
            // ── Shell ring (Line - 1 object, stays cheap) ──────────────────
            const segments = 48;
            const pts = [];
            for(let i = 0; i <= segments; i++) {
                const a = (i / segments) * Math.PI * 2;
                pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
            }
            const shellGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const shellMat = new THREE.LineBasicMaterial({
                color: 0x64c8ff, transparent: true, opacity: 0.25
            });
            const shell = new THREE.Line(shellGeo, shellMat);
            shell.rotation.x = shellIndex * goldenAngle * 0.5;
            shell.rotation.y = shellIndex * goldenAngle * 0.7;
            shell.rotation.z = shellIndex * goldenAngle * 0.3;
            shell.userData = {
                rotSpeedX: (Math.random() - 0.5) * 0.01,
                rotSpeedY: (Math.random() - 0.5) * 0.01,
                rotSpeedZ: (Math.random() - 0.5) * 0.01
            };
            shell.visible = (visualizationMode === 'shells');
            this.group.add(shell);
            this.shells.push(shell);
            this._shellRadii.push(radius);

            // ── Electron data (no Mesh — goes into shared Points) ──────────
            const isValence = (shellIndex === this.element.shells.length - 1);
            // Valence electrons slightly brighter cyan, inner shells dimmer
            const brightness = isValence ? 1.0 : 0.5 + shellIndex * 0.1;

            const shellGroup = [];
            for(let i = 0; i < electronCount; i++) {
                const eData = {
                    angle:      (i / electronCount) * Math.PI * 2,
                    radius,
                    speed:      0.02 + Math.random() * 0.01,
                    shellIndex,
                    isValence,
                    inBond:     false,
                    bufferIdx:  eIndex,   // position in Points buffer
                };
                this._shellData.push(eData);

                // Initial position
                ePosArr[eIndex*3]   = Math.cos(eData.angle) * radius;
                ePosArr[eIndex*3+1] = 0;
                ePosArr[eIndex*3+2] = Math.sin(eData.angle) * radius;

                // Color: cyan with brightness by shell depth
                eColorArr[eIndex*3]   = 0 * brightness;
                eColorArr[eIndex*3+1] = 1 * brightness;
                eColorArr[eIndex*3+2] = 1 * brightness;

                // Legacy compatibility: push a plain object (no Mesh)
                shellGroup.push(eData);
                eIndex++;
            }
            this.shellElectrons.push(shellGroup);

            radius += 0.6 + this.nucleusRadius * 0.3;
        });

        // ── Single Points for ALL shell electrons ────────────────────────
        const eGeo = new THREE.BufferGeometry();
        eGeo.setAttribute('position', new THREE.BufferAttribute(ePosArr, 3));
        eGeo.setAttribute('color',    new THREE.BufferAttribute(eColorArr, 3));
        this._shellPoints = new THREE.Points(eGeo, makeElectronMaterial(0x00ffff, 0.32, 1.0, true));
        this._shellPoints.visible = (visualizationMode === 'shells');
        this._shellPoints.renderOrder = 2;  // Draw after bonds (0) and bond electrons (1)
        this.group.add(this._shellPoints);
    }
    
    _createCloudParticles() {
        const totalElectrons = this.element.shells.reduce((a, b) => a + b, 0);
        const particlesPerElectron = 8;
        const count = totalElectrons * particlesPerElectron;
        const visualizationMode = this.config.visualizationMode || 'clouds';
        const cloudScale = this.nucleusRadius * 2.5;

        // Store particle data for animation (replaces userData on each mesh)
        this.cloudData = [];
        for(let i = 0; i < count; i++) {
            const r = (Math.random() * 0.5 + 0.5) * cloudScale * (1 + Math.random() * 0.8);
            this.cloudData.push({
                baseR:  r,
                theta:  Math.random() * Math.PI * 2,
                phi:    Math.acos(2 * Math.random() - 1),
                speed:  0.01 + Math.random() * 0.02,
                phase:  Math.random() * Math.PI * 2
            });
        }

        // Single GPU Points object — 1 draw call instead of `count` draw calls
        const positions = new Float32Array(count * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = makeElectronMaterial(this.element.color, 0.26, 0.6, false);

        this.cloudPoints = new THREE.Points(geo, mat);
        this.cloudPoints.visible = (visualizationMode === 'clouds');
        this.cloudPoints.renderOrder = 3;  // Draw last (after nucleus, bonds, electrons)
        this.group.add(this.cloudPoints);

        // Keep legacy array empty so old code that iterates it does nothing
        this.cloudParticles = [];
    }
    
    consumeValenceElectrons(count) {
        // Mark valence electrons as in-bond (hidden from shell Points)
        let consumed = 0;
        for(const eData of this._shellData) {
            if(eData.isValence && !eData.inBond && consumed < count) {
                eData.inBond = true;
                consumed++;
            }
        }
    }
    
    setVisualizationMode(mode) {
        this.config.visualizationMode = mode;
        const showShells = (mode === 'shells');
        const showClouds = (mode === 'clouds');
        
        this.shells.forEach(shell => shell.visible = showShells);
        if(this._shellPoints) this._shellPoints.visible = showShells;
        if(this.cloudPoints)  this.cloudPoints.visible  = showClouds;
    }
    
    updateElectronVisibility() {
        // GPU Points: visibility handled in update() via buffer
        // Nothing needed here
    }
    
    applyForce(force) {
        this.force.add(force);
    }
    
    getEffectiveRadius() {
        // Return the outermost shell radius (electron cloud boundary)
        if(this.shells.length > 0) {
            // Each shell adds ~0.8 units, starting at 1
            return 1 + (this.shells.length * 0.8);
        }
        return this.radius; // Fallback to nucleus radius
    }
    
    updatePhysics(damping = 0.95) {
        this.velocity.add(this.force);
        this.velocity.multiplyScalar(damping);
        this.group.position.add(this.velocity);
        this.force.set(0, 0, 0);
    }
    
    update() {
        // Nucleus rotation
        this.nucleus.rotation.x += 0.01;
        this.nucleus.rotation.y += 0.01;
        
        // Energy-based glow
        const energy = this.velocity.length();
        this.nucleus.material.emissiveIntensity = 0.3 + energy * 2;
        
        const visualizationMode = this.config.visualizationMode || 'clouds';
        
        if(visualizationMode === 'shells') {
            // Rotate shells (each with unique rotation speeds)
            this.shells.forEach(shell => {
                shell.rotation.x += shell.userData.rotSpeedX;
                shell.rotation.y += shell.userData.rotSpeedY;
                shell.rotation.z += shell.userData.rotSpeedZ;
            });
            
            // Animate shell electrons → write into GPU Points buffer
            if(this._shellPoints && this._shellData) {
                const pos  = this._shellPoints.geometry.attributes.position;
                const col  = this._shellPoints.geometry.attributes.color;
                const pArr = pos.array;
                const cArr = col.array;
                const electronMode = this.config.electronMode || 'all';

                for(let i = 0; i < this._shellData.length; i++) {
                    const d = this._shellData[i];

                    // Hide inBond or filtered electrons → move far away (cheap cull)
                    const hide = d.inBond ||
                        (electronMode === 'valence' && !d.isValence);

                    if(hide) {
                        pArr[i*3] = 9999; pArr[i*3+1] = 9999; pArr[i*3+2] = 9999;
                        continue;
                    }

                    // Advance angle in the shell's local plane
                    d.angle += d.speed;

                    // Shell i rotates with shells[shellIndex]
                    const shell = this.shells[d.shellIndex];
                    if(!shell) continue;

                    // Local coords on the orbit circle
                    const lx = Math.cos(d.angle) * d.radius;
                    const lz = Math.sin(d.angle) * d.radius;

                    // Transform to group-local space via shell rotation matrix
                    _tempVec.set(lx, 0, lz);
                    _tempVec.applyQuaternion(shell.quaternion);

                    pArr[i*3]   = _tempVec.x;
                    pArr[i*3+1] = _tempVec.y;
                    pArr[i*3+2] = _tempVec.z;

                    // Valence electrons brighter
                    const b = d.isValence ? 1.0 : 0.5;
                    cArr[i*3]   = 0;
                    cArr[i*3+1] = b;
                    cArr[i*3+2] = b;
                }

                pos.needsUpdate = true;
                col.needsUpdate = true;
            }
        } else {
            // Animate cloud — write directly into GPU buffer
            if(this.cloudPoints && this.cloudData) {
                const positions = this.cloudPoints.geometry.attributes.position;
                const arr = positions.array;
                let avgOpacity = 0;

                for(let i = 0; i < this.cloudData.length; i++) {
                    const d = this.cloudData[i];
                    d.phase += d.speed;
                    const r = d.baseR * (1 + Math.sin(d.phase) * 0.2);
                    arr[i*3]   = r * Math.sin(d.phi) * Math.cos(d.theta);
                    arr[i*3+1] = r * Math.sin(d.phi) * Math.sin(d.theta);
                    arr[i*3+2] = r * Math.cos(d.phi);
                    avgOpacity += 0.2 + Math.sin(d.phase) * 0.15;
                }

                positions.needsUpdate = true; // Tell GPU to re-upload buffer
                this.cloudPoints.material.opacity =
                    this.cloudData.length > 0
                        ? avgOpacity / this.cloudData.length
                        : 0.3;
            }
        }
    }
    
    remove() {
        this.scene.remove(this.group);
    }
}
