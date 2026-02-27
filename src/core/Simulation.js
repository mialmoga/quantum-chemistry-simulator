/**
 * Simulation.js
 * Central state manager for the simulation
 */

import { Atom } from './Atom.js';
import { Bond } from './Bond.js';
import { Molecule } from './Molecule.js';
import { PhysicsEngine } from './Physics.js';
import { applyBondAngleConstraints } from '../physics/BondAngleConstraints.js';

export class Simulation {
    constructor(scene, elementDatabase) {
        this.scene = scene;
        this.elementDatabase = elementDatabase;
        
        // Physics engine
        this.physics = new PhysicsEngine();
        
        // State
        this.atoms = [];
        this.bonds = [];
        this.config = {
            visualizationMode: 'clouds', // 'clouds' or 'shells'
            electronMode: 'all',          // 'all' or 'valence'
            interactionMode: 'add'        // 'add' or 'delete'
        };
    }
    
    addAtom(position, elementSymbol) {
        const atom = new Atom(position, elementSymbol, this.elementDatabase, this.scene, this.config);
        this.atoms.push(atom);
        
        // Auto-bonding con threshold reducido.
        // Umbral = suma de radios covalentes × 1.3 (margen del 30%)
        // Antes era distancia < 5wu — demasiado agresivo, creaba enlaces basura.
        this.atoms.forEach(other => {
            if(other === atom) return;

            const r1 = (atom.element.radius_covalent_pm  || 70) / 100;
            const r2 = (other.element.radius_covalent_pm || 70) / 100;
            const threshold = (r1 + r2) * 1.3;

            const distance = atom.group.position.distanceTo(other.group.position);
            if(distance > threshold) return;

            const maxA = atom.element.max_bonds  || atom.element.valence  || 4;
            const maxB = other.element.max_bonds || other.element.valence || 4;
            if(atom.bonds.length  >= maxA) return;
            if(other.bonds.length >= maxB) return;

            const bond = new Bond(atom, other, this.scene);
            this.bonds.push(bond);
        });
        
        return atom;
    }
    
    /**
     * Crea una molécula desde datos del JSON.
     * Si el JSON trae "bonds" explícitos, los usa directamente.
     * Si no (moléculas legacy), usa auto-bonding con threshold reducido.
     *
     * @param {object} molData - objeto del moleculas.json
     * @param {THREE.Vector3} offset - posición en escena
     */
    createMolecule(molData, offset) {
        const createdAtoms = [];

        // Paso 1: crear todos los átomos SIN auto-bonding
        molData.atoms.forEach(atomData => {
            const pos = new THREE.Vector3(...atomData.position).add(offset);
            // Crear átomo sin que dispare auto-bonding (bandera temporal)
            const atom = new Atom(pos, atomData.element, this.elementDatabase, this.scene, this.config);
            atom._skipAutoBond = true;
            this.atoms.push(atom);
            createdAtoms.push(atom);
        });

        // Paso 2: crear enlaces
        if(molData.bonds && molData.bonds.length > 0) {
            // Bonds explícitos del JSON — fuente de verdad
            molData.bonds.forEach(bondData => {
                const a1 = createdAtoms[bondData.from];
                const a2 = createdAtoms[bondData.to];
                if(!a1 || !a2) return;
                const bond = new Bond(a1, a2, this.scene);
                this.bonds.push(bond);
            });
        } else {
            // Legacy: auto-bonding con threshold reducido entre átomos de ESTA molécula
            for(let i = 0; i < createdAtoms.length; i++) {
                for(let j = i + 1; j < createdAtoms.length; j++) {
                    const a = createdAtoms[i];
                    const b = createdAtoms[j];
                    const r1 = (a.element.radius_covalent_pm || 70) / 100;
                    const r2 = (b.element.radius_covalent_pm || 70) / 100;
                    const threshold = (r1 + r2) * 1.3;
                    const dist = a.group.position.distanceTo(b.group.position);
                    if(dist > threshold) continue;
                    const maxA = a.element.max_bonds || a.element.valence || 4;
                    const maxB = b.element.max_bonds || b.element.valence || 4;
                    if(a.bonds.length >= maxA || b.bonds.length >= maxB) continue;
                    const bond = new Bond(a, b, this.scene);
                    this.bonds.push(bond);
                }
            }
        }

        // Limpiar bandera temporal
        createdAtoms.forEach(a => delete a._skipAutoBond);
        return createdAtoms;
    }

    removeAtom(atom) {
        const index = this.atoms.indexOf(atom);
        if(index > -1) {
            atom.remove();
            this.atoms.splice(index, 1);
        }
    }
    
    findMoleculeContaining(atom) {
        const moleculeAtoms = [];
        const visited = new Set();
        
        const dfs = (currentAtom) => {
            visited.add(currentAtom);
            moleculeAtoms.push(currentAtom);
            
            currentAtom.bonds.forEach(bond => {
                const neighbor = bond.atom1 === currentAtom ? bond.atom2 : bond.atom1;
                if(!visited.has(neighbor)) {
                    dfs(neighbor);
                }
            });
        };
        
        dfs(atom);
        return new Molecule(moleculeAtoms, this.bonds);
    }
    
    setVisualizationMode(mode) {
        this.config.visualizationMode = mode;
        this.atoms.forEach(atom => atom.setVisualizationMode(mode));
    }
    
    setElectronMode(mode) {
        this.config.electronMode = mode;
        this.atoms.forEach(atom => atom.updateElectronVisibility());
    }
    
    clearAll() {
        this.atoms.forEach(a => a.remove());
        this.bonds.forEach(b => b.remove());
        this.atoms.length = 0;
        this.bonds.length = 0;
    }
    
    update() {
        // Fase 1: Fuerzas de campo
        this.physics.applyAtomicRepulsion(this.atoms);
        this.physics.lennardJones.applyForces(this.atoms);

        // Fase 2: Fuerzas de enlace (springs)
        this.bonds.forEach(bond => {
            if(bond.isValid()) bond.update();
        });

        // Fase 3: Integración (fuerza → velocidad → posición)
        this.atoms.forEach(atom => {
            this.physics.updateAtom(atom);
            atom.update();
        });

        // Fase 4: XPBD — corrección angular post-integración
        // Después de integrar, corregir posiciones para respetar geometría molecular.
        // No compite con springs porque ya se integraron.
        if(this.physics.bondAnglesEnabled) {
            this.atoms.forEach(atom => {
                if(atom.metallicCloud) return;
                if(atom.frozen) return;
                if(atom.bonds.length < 2 || atom.bonds.length > 6) return;
                applyBondAngleConstraints(atom, this.physics.bondAngleStrength);
            });
        }
    }
    
    getStats() {
        // Count molecules using DFS
        const visited = new Set();
        let moleculeCount = 0;
        
        const dfs = (atom) => {
            visited.add(atom);
            atom.bonds.forEach(bond => {
                const neighbor = bond.atom1 === atom ? bond.atom2 : bond.atom1;
                if(!visited.has(neighbor)) dfs(neighbor);
            });
        };
        
        for(const atom of this.atoms) {
            if(!visited.has(atom)) {
                moleculeCount++;
                dfs(atom);
            }
        }
        
        return {
            atomCount: this.atoms.length,
            bondCount: this.bonds.length,
            moleculeCount: moleculeCount
        };
    }
}
