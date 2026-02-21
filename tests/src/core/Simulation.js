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
        
        // Auto-bonding with nearby atoms
        this.atoms.forEach(other => {
            if(other !== atom) {
                const distance = atom.group.position.distanceTo(other.group.position);
                if(distance < 5) {
                    const atomBondCount = atom.bonds.length;
                    const otherBondCount = other.bonds.length;
                    
                    if(atomBondCount < atom.element.valence && otherBondCount < other.element.valence) {
                        const bond = new Bond(atom, other, this.scene);
                        this.bonds.push(bond);
                    }
                }
            }
        });
        
        return atom;
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
        // Apply inter-atomic repulsion first (Pauli exclusion by Éter)
        this.physics.applyAtomicRepulsion(this.atoms);
        
        // Apply Lennard-Jones forces (Van der Waals)
        this.physics.lennardJones.applyForces(this.atoms);
        
        // Apply bond angle constraints (molecular geometry)
        // Skip for metallic crystals and large structures
        if(this.physics.bondAnglesEnabled) {
            this.atoms.forEach(atom => {
                // Skip if part of metallic cloud (already has crystal structure)
                if(atom.metallicCloud) return;
                
                // Skip if too many bonds (likely a crystal, not a molecule)
                if(atom.bonds.length > 6) return;
                
                // Skip if atom is frozen (crystal structure)
                if(atom.frozen) return;
                
                // Apply only to small molecules (2-6 bonds)
                if(atom.bonds.length >= 2) {
                    applyBondAngleConstraints(atom, this.physics.bondAngleStrength);
                }
            });
        }
        
        // Update atoms with physics
        this.atoms.forEach(atom => {
            this.physics.updateAtom(atom);
            atom.update();
        });
        
        // Update bonds (spring forces + visuals)
        this.bonds.forEach(bond => {
            if(bond.isValid()) {
                bond.update();
            }
        });
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
