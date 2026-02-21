/**
 * CrystalGenerator.js
 * Generates crystal lattice structures
 */

import { Bond } from '../core/Bond.js';
import { MetallicCloud } from '../core/MetallicCloud.js';

export class CrystalGenerator {
    constructor(simulation) {
        this.simulation = simulation;
    }
    
    /**
     * Generate NaCl (Rock Salt) - Simple Cubic
     * Alternating Na and Cl in cubic pattern
     */
    generateNaCl(size = 3) {
        // Calculate ideal spacing from covalent radii
        const elementDatabase = window.elementDatabase || {};
        const Na = elementDatabase['Na'];
        const Cl = elementDatabase['Cl'];
        
        const rNa = Na?.radius_covalent_pm || 166;
        const rCl = Cl?.radius_covalent_pm || 99;
        const spacing = ((rNa + rCl) / 100) * 1.05; // Convert pm to world units, +5% lattice spacing
        
        const offset = -(size - 1) * spacing / 2; // Center the crystal
        const atoms = [];
        
        for(let x = 0; x < size; x++) {
            for(let y = 0; y < size; y++) {
                for(let z = 0; z < size; z++) {
                    const position = new THREE.Vector3(
                        offset + x * spacing,
                        offset + y * spacing,
                        offset + z * spacing
                    );
                    
                    // Alternate Na and Cl based on position
                    const isNa = (x + y + z) % 2 === 0;
                    const element = isNa ? 'Na' : 'Cl';
                    
                    const atom = this.simulation.addAtom(position, element);
                    atom.isCrystal = true; // Mark as crystal atom
                    atoms.push(atom);
                }
            }
        }
        
        return atoms;
    }
    
    /**
     * Generate BCC (Body-Centered Cubic) - Iron, Chromium
     */
    generateBCC(size = 3, element = 'Fe') {
        // Calculate ideal spacing from covalent radius
        const elementDatabase = window.elementDatabase || {};
        const el = elementDatabase[element];
        const radius = el?.radius_covalent_pm || 132; // Fe default
        const spacing = (radius * 2 * 1.1) / 100; // Metallic lattice spacing
        
        const offset = -(size - 1) * spacing / 2;
        const atoms = [];
        
        for(let x = 0; x < size; x++) {
            for(let y = 0; y < size; y++) {
                for(let z = 0; z < size; z++) {
                    // Corner atoms
                    const corner = new THREE.Vector3(
                        offset + x * spacing,
                        offset + y * spacing,
                        offset + z * spacing
                    );
                    const atom1 = this.simulation.addAtom(corner, element);
                    atom1.isCrystal = true;
                    atoms.push(atom1);
                    
                    // Center atom (between corners)
                    if(x < size - 1 && y < size - 1 && z < size - 1) {
                        const center = new THREE.Vector3(
                            corner.x + spacing / 2,
                            corner.y + spacing / 2,
                            corner.z + spacing / 2
                        );
                        const atom2 = this.simulation.addAtom(center, element);
                        atom2.isCrystal = true;
                        atoms.push(atom2);
                    }
                }
            }
        }
        
        return atoms;
    }
    
    /**
     * Generate FCC (Face-Centered Cubic) - Diamond, Gold
     */
    generateFCC(size = 3, element = 'C') {
        // Calculate ideal spacing from covalent radius
        const elementDatabase = window.elementDatabase || {};
        const el = elementDatabase[element];
        const radius = el?.radius_covalent_pm || 76; // C default
        const spacing = (radius * 2 * 1.1) / 100; // FCC lattice spacing
        
        const offset = -(size - 1) * spacing / 2;
        const atoms = [];
        
        for(let x = 0; x < size; x++) {
            for(let y = 0; y < size; y++) {
                for(let z = 0; z < size; z++) {
                    const base = new THREE.Vector3(
                        offset + x * spacing,
                        offset + y * spacing,
                        offset + z * spacing
                    );
                    
                    // Corner atom
                    const atom1 = this.simulation.addAtom(base, element);
                    atom1.isCrystal = true;
                    atoms.push(atom1);
                    
                    // Face-centered atoms
                    const faceOffsets = [
                        [spacing/2, spacing/2, 0], // XY face
                        [spacing/2, 0, spacing/2], // XZ face
                        [0, spacing/2, spacing/2]  // YZ face
                    ];
                    
                    faceOffsets.forEach(([dx, dy, dz]) => {
                        if((dx > 0 && x === size - 1) ||
                           (dy > 0 && y === size - 1) ||
                           (dz > 0 && z === size - 1)) {
                            return; // Skip if outside bounds
                        }
                        
                        const facePos = new THREE.Vector3(
                            base.x + dx,
                            base.y + dy,
                            base.z + dz
                        );
                        const atom = this.simulation.addAtom(facePos, element);
                        atom.isCrystal = true;
                        atoms.push(atom);
                    });
                }
            }
        }
        
        return atoms;
    }
    
    /**
     * Generate Hexagonal (Ice-like)
     */
    generateHexagonal(size = 3, element = 'O') {
        // Calculate ideal spacing from covalent radius
        const elementDatabase = window.elementDatabase || {};
        const el = elementDatabase[element];
        const radius = el?.radius_covalent_pm || 66; // O default
        const spacing = (radius * 2 * 1.15) / 100; // Hexagonal lattice spacing (slightly larger)
        
        const offset = -(size - 1) * spacing / 2;
        const atoms = [];
        
        const hexAngle = Math.PI / 3; // 60 degrees
        
        for(let layer = 0; layer < size; layer++) {
            for(let ring = 0; ring < size; ring++) {
                const ringRadius = ring * spacing;
                const numAtoms = ring === 0 ? 1 : 6 * ring;
                
                for(let i = 0; i < numAtoms; i++) {
                    const angle = (i / numAtoms) * Math.PI * 2;
                    const position = new THREE.Vector3(
                        offset + Math.cos(angle) * ringRadius,
                        offset + layer * spacing,
                        offset + Math.sin(angle) * ringRadius
                    );
                    
                    const atom = this.simulation.addAtom(position, element);
                    atom.isCrystal = true;
                    atoms.push(atom);
                }
            }
        }
        
        return atoms;
    }
    
    /**
     * Strengthen crystal bonds (prevent collapse)
     */
    strengthenCrystalBonds(atoms) {
        if(atoms.length === 0) return [];
        
        // Detect if this is a PURE metallic crystal
        // ALL atoms must be metals (not just the first one - NaCl fix)
        const isMetallic = atoms.every(atom => {
            const el = atom.element;
            return el && 
                el.electronegativity && 
                el.electronegativity < 2.0 &&
                el.category && 
                el.category.includes('metal');
        });
        
        if(isMetallic) {
            // METALLIC: remove any auto-bonds created during addAtom()
            // then create electron sea cloud instead
            console.log(`⚗️ Metallic crystal detected (${atoms[0].symbol}) → creating electron sea`);
            
            const atomSet = new Set(atoms);
            
            // Find and remove bonds between metal atoms
            const bondsToRemove = this.simulation.bonds.filter(bond => 
                bond.atom1 && bond.atom2 && // regular Bond (not MetallicCloud)
                atomSet.has(bond.atom1) && atomSet.has(bond.atom2)
            );
            
            bondsToRemove.forEach(bond => {
                bond.remove(); // removes mesh from scene
                // Remove from atom.bonds arrays
                bond.atom1.bonds = bond.atom1.bonds.filter(b => b !== bond);
                bond.atom2.bonds = bond.atom2.bonds.filter(b => b !== bond);
            });
            
            // Remove from simulation.bonds
            this.simulation.bonds = this.simulation.bonds.filter(b => !bondsToRemove.includes(b));
            
            // Now create the electron sea
            const cloud = new MetallicCloud(atoms, this.simulation.scene);
            // Register cloud reference in each atom so drag system can move all together
            atoms.forEach(atom => { atom.metallicCloud = cloud; });
            this.simulation.bonds.push(cloud);
            return [cloud];
        }
        
        // NON-METALLIC: use regular bonds
        this.forceConnectCrystal(atoms);
        
        const crystalBonds = [];
        this.simulation.bonds.forEach(bond => {
            if(bond.atom1 && (bond.atom1.isCrystal || bond.atom2.isCrystal)) {
                crystalBonds.push(bond);
            }
        });
        
        crystalBonds.forEach(bond => {
            bond.springConstant = 0.01;
            bond.isCrystalBond = true;
        });
        
        return crystalBonds;
    }
    
    /**
     * Force connect all nearby atoms in crystal
     */
    forceConnectCrystal(atoms) {
        if(atoms.length === 0) return;
        
        // Calculate appropriate bond distance based on element
        const firstAtom = atoms[0];
        const element = firstAtom.element;
        const radius = element.radius_covalent_pm || 100;
        const expectedSpacing = (radius * 2 * 1.1) / 100; // Same as crystal generation
        
        // maxBondDist = spacing * 1.4 (catches direct neighbors but not next-nearest)
        const maxBondDist = expectedSpacing * 1.09;
        
        console.log(`🔗 Crystal bonding: ${element.symbol}, radius=${radius}pm, spacing=${expectedSpacing.toFixed(2)}, maxDist=${maxBondDist.toFixed(2)}`);
        
        let bondCount = 0;
        
        for(let i = 0; i < atoms.length; i++) {
            for(let j = i + 1; j < atoms.length; j++) {
                const a1 = atoms[i];
                const a2 = atoms[j];
                const dist = a1.group.position.distanceTo(a2.group.position);
                
                if(dist < maxBondDist && dist > 0.1) {
                    // Check if bond already exists
                    const bondExists = a1.bonds.some(b => 
                        (b.atom1 === a1 && b.atom2 === a2) || 
                        (b.atom1 === a2 && b.atom2 === a1)
                    );
                    
                    if(!bondExists) {
                        const bond = new Bond(a1, a2, this.simulation.scene);
                        bondCount++;
                        // Solo forzar color cristalino en enlaces homoatómicos (Fe-Fe, C-C...)
                        // Los iónicos (Na-Cl) ya tienen su color correcto del constructor
                        if(a1.symbol === a2.symbol) {
                            bond.setCrystalType();
                        }
                        this.simulation.bonds.push(bond);
                    }
                }
            }
        }
        
        console.log(`✅ Created ${bondCount} bonds for ${atoms.length} atoms (avg ${(bondCount*2/atoms.length).toFixed(1)} bonds/atom)`);
    }
    
    /**
     * Freeze crystal (no physics)
     */
    freezeCrystal(atoms, frozen = true) {
        atoms.forEach(atom => {
            atom.frozen = frozen;
            if(frozen) {
                atom.velocity.set(0, 0, 0);
                atom.force.set(0, 0, 0);
            }
        });
    }
}