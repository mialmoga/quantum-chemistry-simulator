/**
 * BondRenderer.js
 * GPU-instanced renderer for all bonds in the scene.
 *
 * Instead of 1 Mesh per bond (N draw calls),
 * we use InstancedMesh: 1 draw call for ALL bonds of the same type.
 *
 * Electrons travelling along bonds → 1 Points object total.
 *
 * Usage:
 *   const renderer = new BondRenderer(scene, maxBonds)
 *   // each frame:
 *   renderer.update(bonds)
 */

import { BOND_TYPES } from './Bond.js';
import { makeElectronMaterial } from './electronMaterial.js';

// Reusable math objects (avoid GC pressure per frame)
const _start     = new THREE.Vector3();
const _end       = new THREE.Vector3();
const _dir       = new THREE.Vector3();
const _mid       = new THREE.Vector3();
const _up        = new THREE.Vector3(0, 1, 0);
const _quat      = new THREE.Quaternion();
const _scale     = new THREE.Vector3();
const _matrix    = new THREE.Matrix4();
const _color     = new THREE.Color();

const CYLINDER_GEO  = new THREE.CylinderGeometry(0.08, 0.08, 1, 7);
const GLOW_GEO      = new THREE.CylinderGeometry(0.22, 0.22, 1, 7);

function makeMat(color, emissive, opacity, isBasic = false) {
    if(isBasic) return new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false
    });
    return new THREE.MeshPhongMaterial({
        color, emissive, emissiveIntensity: 0.2,
        transparent: true, opacity
    });
}

export class BondRenderer {
    constructor(scene, maxBonds = 4000) {
        this.scene    = scene;
        this.maxBonds = maxBonds;

        // One InstancedMesh pair (cylinder + glow) per bond type
        this._instancedMeshes = {};   // type → { cylinder, glow }
        this._typeSlots       = {};   // type → current slot index this frame

        for(const [key, bt] of Object.entries(BOND_TYPES)) {
            const cylinder = new THREE.InstancedMesh(CYLINDER_GEO, makeMat(bt.color, bt.emissive, bt.opacity), maxBonds);
            // GLOW DISABLED for better electron visibility (can re-enable later)
            // const glow     = new THREE.InstancedMesh(GLOW_GEO,     makeMat(bt.glowColor, 0x000000, bt.glowIntensity * 0.4, true), maxBonds);
            cylinder.count = 0;
            // glow.count     = 0;
            cylinder.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            // glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            // InstancedMesh supports per-instance color
            cylinder.instanceColor = null; // we'll tint via material emissiveIntensity globally
            
            // Force render order: bonds first (0), then electrons (1)
            cylinder.renderOrder = 0;
            // glow.renderOrder = 0;
            
            scene.add(cylinder);
            // scene.add(glow);
            this._instancedMeshes[key] = { cylinder, glow: null };
            this._typeSlots[key] = 0;
        }

        // Single Points pool for ALL bond electrons
        this._maxElectrons = maxBonds * 2;
        this._electronData = [];   // { progress, speed, bondIndex, isIonic, ... }
        this._electronPos  = new Float32Array(this._maxElectrons * 3);
        const eGeo = new THREE.BufferGeometry();
        eGeo.setAttribute('position', new THREE.BufferAttribute(this._electronPos, 3));
        this._electronPoints = new THREE.Points(eGeo, makeElectronMaterial(0x00ffff, 0.42, 1.3, true));
        // Per-electron colors
        this._electronColors = new Float32Array(this._maxElectrons * 3);
        eGeo.setAttribute('color', new THREE.BufferAttribute(this._electronColors, 3));
        this._electronPoints.count = 0;
        this._electronPoints.renderOrder = 1;  // Draw AFTER bonds (renderOrder: 0)
        scene.add(this._electronPoints);

        this._electronSlot = 0;
    }

    /**
     * Call once per frame with the current bonds array.
     * Re-writes all instance matrices and electron positions.
     */
    update(bonds) {
        // Reset slot counters
        for(const key of Object.keys(BOND_TYPES)) {
            this._typeSlots[key] = 0;
        }
        this._electronSlot = 0;

        for(const bond of bonds) {
            // Skip MetallicCloud or anything without atom1/atom2
            if(!bond.atom1 || !bond.atom2) continue;
            if(!bond.isValid()) continue;
            
            // Skip if bond is marked invisible
            if(bond.visible === false) continue;

            _start.copy(bond.atom1.group.position);
            _end.copy(bond.atom2.group.position);
            _dir.subVectors(_end, _start);
            const length = _dir.length();
            if(length < 0.01) continue;

            _mid.addVectors(_start, _end).multiplyScalar(0.5);
            _quat.setFromUnitVectors(_up, _dir.clone().normalize());
            _scale.set(1, length, 1);
            _matrix.compose(_mid, _quat, _scale);

            const typeKey = this._bondTypeKey(bond.bondType);
            const slot    = this._typeSlots[typeKey]++;

            if(slot < this.maxBonds) {
                const { cylinder, glow } = this._instancedMeshes[typeKey];
                cylinder.setMatrixAt(slot, _matrix);
                // glow.setMatrixAt(slot, _matrix);  // GLOW DISABLED

                // Tension-based emissive tint via color channel
                const tension = Math.abs((length - 3.5) * bond.springConstant);
                const intensity = Math.min(1, 0.3 + tension * 40);
                _color.setScalar(intensity);
                cylinder.setColorAt(slot, _color);
            }

            // Electrons
            this._updateBondElectrons(bond, _start, _end, length);
        }

        // Commit instance counts + flag updates
        for(const [key, bt] of Object.entries(BOND_TYPES)) {
            const { cylinder, glow } = this._instancedMeshes[key];
            cylinder.count = this._typeSlots[key];
            // glow.count     = this._typeSlots[key];  // GLOW DISABLED
            cylinder.instanceMatrix.needsUpdate = true;
            // glow.instanceMatrix.needsUpdate     = true;  // GLOW DISABLED
            if(cylinder.instanceColor) cylinder.instanceColor.needsUpdate = true;
        }

        // Commit electrons
        const eCount = this._electronSlot;
        this._electronPoints.geometry.attributes.position.needsUpdate = true;
        this._electronPoints.geometry.attributes.color.needsUpdate    = true;
        this._electronPoints.geometry.setDrawRange(0, eCount);
    }

    _updateBondElectrons(bond, start, end, length) {
        const bt = bond.bondType;
        const numE = bt === BOND_TYPES.IONIC ? 1 : 2;

        // Grow electronData array lazily
        while(bond._eData === undefined || bond._eData.length < numE) {
            if(!bond._eData) bond._eData = [];
            bond._eData.push({
                progress: bond._eData.length * 0.5,
                speed: bt.speed
            });
        }

        // Electron color as RGB 0-1
        _color.setHex(bt.electronColor);

        for(let i = 0; i < numE; i++) {
            const slot = this._electronSlot++;
            if(slot >= this._maxElectrons) break;

            const eData = bond._eData[i];
            eData.progress += eData.speed;
            if(eData.progress > 1) eData.progress -= 1;

            let t = eData.progress;

            // Ionic bias toward more electronegative atom
            if(bt === BOND_TYPES.IONIC) {
                const x1 = bond.atom1.element?.electronegativity || 0;
                const x2 = bond.atom2.element?.electronegativity || 0;
                const bias = x1 > x2 ? 0.8 : 0.2;
                t = t < 0.5
                    ? t * bias * 2
                    : bias + (1 - bias) * (t - 0.5) * 2;
            }

            const px = start.x + (end.x - start.x) * t;
            const py = start.y + (end.y - start.y) * t;
            const pz = start.z + (end.z - start.z) * t;

            this._electronPos[slot*3]   = px;
            this._electronPos[slot*3+1] = py;
            this._electronPos[slot*3+2] = pz;
            this._electronColors[slot*3]   = _color.r;
            this._electronColors[slot*3+1] = _color.g;
            this._electronColors[slot*3+2] = _color.b;
        }
    }

    _bondTypeKey(bondType) {
        for(const [key, bt] of Object.entries(BOND_TYPES)) {
            if(bt === bondType) return key;
        }
        return 'COVALENT';
    }

    dispose() {
        for(const { cylinder, glow } of Object.values(this._instancedMeshes)) {
            this.scene.remove(cylinder);
            // this.scene.remove(glow);  // GLOW DISABLED (null now)
        }
        this.scene.remove(this._electronPoints);
    }
}
