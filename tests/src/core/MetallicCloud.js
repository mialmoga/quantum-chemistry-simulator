/**
 * MetallicCloud.js
 * Simulates the "sea of electrons" in metallic bonds
 * Instead of discrete bonds, metal valence electrons float freely
 * throughout the crystal volume as a shared electron cloud
 */

import { makeElectronMaterial } from './electronMaterial.js';

// Reusable objects to avoid GC pressure
const _tempDir = new THREE.Vector3();
const _tempForce = new THREE.Vector3();

export class MetallicCloud {
    constructor(atoms, scene) {
        this.atoms = atoms;
        this.scene = scene;
        this.freeElectrons = [];
        this.springConstant = 0.008; // Softer than regular bonds
        this.isCrystalBond = true;
        this.bondType = { name: 'Metálico' }; // For compatibility checks
        this._frameCounter = 0;  // For skipping expensive O(N²) physics
        
        // Calculate ideal lattice spacing from covalent radius
        this.targetDist = this._calculateLatticeSpacing(atoms[0]);
        
        // Calculate total free electrons (sum of valence electrons)
        const totalValence = atoms.reduce((sum, atom) => {
            return sum + (atom.element?.valence || 1);
        }, 0);
        
        // Create free electron particles (not tied to specific atoms)
        // Use fewer particles for performance: ~3 per valence electron
        const particleCount = Math.min(totalValence * 3, 200);
        this._createFreeElectrons(particleCount);
        
        // Create very faint structural lines between nearby atoms
        // (just to show crystal structure, almost invisible)
        this.structureLines = [];
        this._createStructureLines();
        
        console.log(`⚗️ MetallicCloud: ${atoms.length} atoms, ${particleCount} free electrons, spacing: ${this.targetDist.toFixed(2)}`);
    }
    
    /**
     * Calculate lattice spacing from covalent radius
     * Metallic bonds are slightly longer than covalent
     */
    _calculateLatticeSpacing(atom) {
        const element = atom.element;
        
        // Use covalent radius if available (pm)
        const radius = element.radius_covalent_pm || this._estimateCovalentRadius(element);
        
        // For metallic lattices: spacing ≈ 2 × covalent radius × 1.1
        // The 1.1 factor accounts for metallic bonds being slightly longer
        const spacingPm = radius * 2 * 1.1;
        
        // Convert to world units (1 world unit ≈ 100 pm)
        const worldUnits = spacingPm / 100;
        
        // Clamp to reasonable range
        return Math.max(2.0, Math.min(8.0, worldUnits));
    }
    
    /**
     * Estimate covalent radius if not in advanced data
     */
    _estimateCovalentRadius(element) {
        const Z = element.number;
        if(Z === 26) return 132; // Fe
        if(Z === 29) return 132; // Cu
        if(Z === 79) return 136; // Au
        if(Z <= 10) return 70 + (Z - 1) * 5;
        if(Z <= 18) return 100 + (Z - 11) * 8;
        if(Z <= 36) return 120 + (Z - 19) * 3;
        return 150;
    }
    
    _createFreeElectrons(count) {
        const bounds = this._getCrystalBounds();

        // Store particle data for animation
        this.electronData = [];
        const posArr = new Float32Array(count * 3);

        for(let i = 0; i < count; i++) {
            const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
            const y = bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y);
            const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
            posArr[i*3]   = x;
            posArr[i*3+1] = y;
            posArr[i*3+2] = z;

            this.electronData.push({
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.15,
                    (Math.random() - 0.5) * 0.15,
                    (Math.random() - 0.5) * 0.15
                ),
                phase:      Math.random() * Math.PI * 2,
                pulseSpeed: 0.05 + Math.random() * 0.05
            });
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

        const mat = makeElectronMaterial(0xffffff, 0.38, 0.9, false);

        this.electronPoints = new THREE.Points(geo, mat);
        this.electronPoints.renderOrder = 2;  // Draw after bonds, same as shell electrons
        this.scene.add(this.electronPoints);

        // Keep legacy array for remove() compatibility
        this.freeElectrons = [];
    }
    
    _createStructureLines() {
        // Very faint lines showing crystal structure
        const maxDist = 5.5;
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.12, // Very faint - just structural reference
        });
        
        for(let i = 0; i < this.atoms.length; i++) {
            for(let j = i + 1; j < this.atoms.length; j++) {
                const a1 = this.atoms[i];
                const a2 = this.atoms[j];
                const dist = a1.group.position.distanceTo(a2.group.position);
                
                if(dist < maxDist && dist > 0.1) {
                    const points = [
                        a1.group.position.clone(),
                        a2.group.position.clone()
                    ];
                    const geo = new THREE.BufferGeometry().setFromPoints(points);
                    const line = new THREE.Line(geo, lineMat.clone());
                    line.userData = { atom1: a1, atom2: a2 };
                    this.scene.add(line);
                    this.structureLines.push(line);
                }
            }
        }
    }
    
    _getCrystalBounds() {
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        const padding = 2.5; // Extra space for electron cloud
        
        this.atoms.forEach(atom => {
            const p = atom.group.position;
            min.min(p);
            max.max(p);
        });
        
        min.subScalar(padding);
        max.addScalar(padding);
        
        return { min, max };
    }
    
    update() {
        this._frameCounter++;
        const bounds = this._getCrystalBounds();

        // Update free electrons via GPU buffer (every frame - cheap)
        if(this.electronPoints && this.electronData) {
            const positions = this.electronPoints.geometry.attributes.position;
            const arr = positions.array;

            for(let i = 0; i < this.electronData.length; i++) {
                const d = this.electronData[i];

                // Move
                arr[i*3]   += d.velocity.x;
                arr[i*3+1] += d.velocity.y;
                arr[i*3+2] += d.velocity.z;

                // Bounce off bounds
                if(arr[i*3]   < bounds.min.x) { arr[i*3]   = bounds.min.x; d.velocity.x =  Math.abs(d.velocity.x); }
                if(arr[i*3]   > bounds.max.x) { arr[i*3]   = bounds.max.x; d.velocity.x = -Math.abs(d.velocity.x); }
                if(arr[i*3+1] < bounds.min.y) { arr[i*3+1] = bounds.min.y; d.velocity.y =  Math.abs(d.velocity.y); }
                if(arr[i*3+1] > bounds.max.y) { arr[i*3+1] = bounds.max.y; d.velocity.y = -Math.abs(d.velocity.y); }
                if(arr[i*3+2] < bounds.min.z) { arr[i*3+2] = bounds.min.z; d.velocity.z =  Math.abs(d.velocity.z); }
                if(arr[i*3+2] > bounds.max.z) { arr[i*3+2] = bounds.max.z; d.velocity.z = -Math.abs(d.velocity.z); }

                // Thermal perturbation
                d.velocity.x += (Math.random() - 0.5) * 0.01;
                d.velocity.y += (Math.random() - 0.5) * 0.01;
                d.velocity.z += (Math.random() - 0.5) * 0.01;

                // Speed clamp
                const speed = d.velocity.length();
                if(speed > 0.2)  d.velocity.multiplyScalar(0.2  / speed);
                if(speed < 0.02) d.velocity.multiplyScalar(0.02 / speed);

                // Pulse opacity globally via material (cheap)
                d.phase += d.pulseSpeed;
            }

            positions.needsUpdate = true;
            // Pulse the whole cloud opacity
            if(this.electronData.length > 0) {
                const t = performance.now() * 0.001;
                this.electronPoints.material.opacity = 0.4 + Math.sin(t * 1.5) * 0.25;
            }
        }
        
        // O(N²) expensive physics: skip most frames (only every 3rd frame)
        if(this._frameCounter % 3 !== 0) return;
        
        // Update structure lines to follow frozen crystal atoms
        this.structureLines.forEach(line => {
            const { atom1, atom2 } = line.userData;
            const pts = line.geometry.attributes.position.array;
            const p1 = atom1.group.position;
            const p2 = atom2.group.position;
            pts[0] = p1.x; pts[1] = p1.y; pts[2] = p1.z;
            pts[3] = p2.x; pts[4] = p2.y; pts[5] = p2.z;
            line.geometry.attributes.position.needsUpdate = true;
        });
        
        // Soft spring: atoms maintain approximate positions relative to each other
        // (much softer than covalent - metals are malleable)
        for(let i = 0; i < this.atoms.length; i++) {
            for(let j = i + 1; j < this.atoms.length; j++) {
                const a1 = this.atoms[i];
                const a2 = this.atoms[j];
                _tempDir.subVectors(a2.group.position, a1.group.position);
                const dist = _tempDir.length();
                if(dist < 6 && dist > 0.1) {
                    // Use calculated lattice spacing (not hardcoded)
                    const force = (dist - this.targetDist) * this.springConstant;
                    _tempDir.normalize().multiplyScalar(force);
                    if(!a1.frozen) {
                        _tempForce.copy(_tempDir);
                        a1.applyForce(_tempForce);
                    }
                    if(!a2.frozen) {
                        _tempForce.copy(_tempDir).negate();
                        a2.applyForce(_tempForce);
                    }
                }
            }
        }
    }
    
    isValid() {
        return this.atoms.length > 0 && this.atoms[0].group.parent;
    }
    
    remove() {
        if(this.electronPoints) this.scene.remove(this.electronPoints);
        this.structureLines.forEach(l => this.scene.remove(l));
        this.freeElectrons = [];
        this.structureLines = [];
    }
}
