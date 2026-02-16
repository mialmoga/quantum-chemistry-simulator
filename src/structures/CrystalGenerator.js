
/**
 * CrystalGenerator.js
 * Generates crystal lattice structures
 */

export class CrystalGenerator {
    constructor(simulation) {
        this.simulation = simulation;
    }
    
    /**
     * Generate NaCl (Rock Salt) - Simple Cubic
     * Alternating Na and Cl in cubic pattern
     */
    generateNaCl(size = 3) {
        const spacing = 4; // Distance between atoms
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
        const spacing = 4;
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
        const spacing = 4;
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
        const spacing = 4;
        const offset = -(size - 1) * spacing / 2;
        const atoms = [];
        
        const hexAngle = Math.PI / 3; // 60 degrees
        
        for(let layer = 0; layer < size; layer++) {
            for(let ring = 0; ring < size; ring++) {
                const radius = ring * spacing;
                const numAtoms = ring === 0 ? 1 : 6 * ring;
                
                for(let i = 0; i < numAtoms; i++) {
                    const angle = (i / numAtoms) * Math.PI * 2;
                    const position = new THREE.Vector3(
                        offset + Math.cos(angle) * radius,
                        offset + layer * spacing,
                        offset + Math.sin(angle) * radius
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
        const crystalBonds = [];
        
        this.simulation.bonds.forEach(bond => {
            if(bond.atom1.isCrystal || bond.atom2.isCrystal) {
                crystalBonds.push(bond);
            }
        });
        
        // Make crystal bonds 100x stronger
        crystalBonds.forEach(bond => {
            bond.springConstant = 5.0; // vs 0.02 normal
            bond.isCrystalBond = true;
        });
        
        return crystalBonds;
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