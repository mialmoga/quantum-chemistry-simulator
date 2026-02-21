/**
 * Molecule.js
 * Represents a group of bonded atoms as a single entity
 */

export class Molecule {
    constructor(atoms, allBonds) {
        this.atoms = atoms;
        this.allBonds = allBonds; // Reference to global bonds array
        this.bonds = [];
        this.centerOfMass = new THREE.Vector3();
        this.updateBonds();
        this.updateCenterOfMass();
    }
    
    updateBonds() {
        this.bonds = [];
        this.allBonds.forEach(bond => {
            if(this.atoms.includes(bond.atom1) && this.atoms.includes(bond.atom2)) {
                this.bonds.push(bond);
            }
        });
    }
    
    updateCenterOfMass() {
        this.centerOfMass.set(0, 0, 0);
        this.atoms.forEach(atom => {
            this.centerOfMass.add(atom.group.position);
        });
        this.centerOfMass.divideScalar(this.atoms.length);
    }
    
    moveAll(delta) {
        this.atoms.forEach(atom => {
            atom.group.position.add(delta);
        });
        this.updateCenterOfMass();
    }
    
    highlight(intensity) {
        this.atoms.forEach(atom => {
            atom.nucleus.material.emissiveIntensity = 0.3 + intensity;
        });
    }
    
    remove(atomsArray) {
        // Remove all bonds
        this.bonds.forEach(bond => {
            const index = this.allBonds.indexOf(bond);
            if(index > -1) {
                bond.remove();
                this.allBonds.splice(index, 1);
            }
        });
        
        // Remove all atoms
        this.atoms.forEach(atom => {
            const index = atomsArray.indexOf(atom);
            if(index > -1) {
                atom.remove();
                atomsArray.splice(index, 1);
            }
        });
    }
}
