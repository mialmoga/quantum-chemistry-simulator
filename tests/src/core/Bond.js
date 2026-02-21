/**
 * Bond.js
 * Represents chemical bonds between atoms with spring physics
 * Bond type determined by electronegativity difference (Δχ)
 */

// Bond type constants
export const BOND_TYPES = {
    COVALENT:  { name: 'Covalente',       deltaX: [0,   0.5], color: 0xaaaaaa, emissive: 0x444444, electronColor: 0x00ffff, speed: 0.012, opacity: 0.50, glowIntensity: 0.15, glowColor: 0x888888 },
    POLAR:     { name: 'Polar Covalente', deltaX: [0.5, 1.7], color: 0x88aaff, emissive: 0x2244aa, electronColor: 0x4488ff, speed: 0.015, opacity: 0.55, glowIntensity: 0.30, glowColor: 0x4466ff },
    IONIC:     { name: 'Iónico',          deltaX: [1.7, 99 ], color: 0xffaa22, emissive: 0xaa5500, electronColor: 0xffdd00, speed: 0.008, opacity: 0.65, glowIntensity: 0.60, glowColor: 0xff8800 },
    METALLIC:  { name: 'Metálico',        deltaX: null,       color: 0xdddddd, emissive: 0x888888, electronColor: 0xffffff, speed: 0.020, opacity: 0.30, glowIntensity: 0.08, glowColor: 0xaaaaaa },
    CRYSTAL:   { name: 'Cristalino',      deltaX: null,       color: 0x66ccff, emissive: 0x224466, electronColor: 0x88eeff, speed: 0.006, opacity: 0.45, glowIntensity: 0.20, glowColor: 0x44aaff },
};

/**
 * Determine bond type from two atoms
 */
function getBondType(atom1, atom2) {
    const el1 = atom1.element;
    const el2 = atom2.element;

    // Metallic: both atoms are metals (electronegativity < 2.0)
    const isMetallic = el1 && el2 &&
        (el1.electronegativity && el1.electronegativity < 2.0) &&
        (el2.electronegativity && el2.electronegativity < 2.0) &&
        el1 === el2; // Solo homoatómico (Fe-Fe, Cu-Cu, no Fe-Ni mezcla)
    if(isMetallic) return BOND_TYPES.METALLIC;

    // Need electronegativity for ionic/polar/covalent
    if(el1?.electronegativity && el2?.electronegativity) {
        const delta = Math.abs(el1.electronegativity - el2.electronegativity);
        if(delta >= 1.7) return BOND_TYPES.IONIC;
        if(delta >= 0.5) return BOND_TYPES.POLAR;
        return BOND_TYPES.COVALENT;
    }

    // Fallback: covalente genérico
    return BOND_TYPES.COVALENT;
}

export class Bond {
    constructor(atom1, atom2, scene) {
        this.atom1 = atom1;
        this.atom2 = atom2;
        this.scene = scene;
        this.springConstant = 0.02;
        this.isCrystalBond = false;
        
        // Visibility flag (for BondRenderer) - read initial state
        this.visible = window.getBondsVisibilityState ? window.getBondsVisibilityState() : true;
        
        // Determine bond type
        this.bondType = getBondType(atom1, atom2);
        
        // Calculate ideal bond length from covalent radii
        this.targetDist = this._calculateBondLength(atom1, atom2);
        
        // NOTE: No meshes created here.
        // BondRenderer handles all GPU rendering via InstancedMesh.
        // Bond only owns physics + state.
        this._eData = []; // electron progress data, written by BondRenderer
        
        // Consume valence electrons from both atoms
        atom1.consumeValenceElectrons(1);
        atom2.consumeValenceElectrons(1);
        
        // Register bond in atoms
        atom1.bonds.push(this);
        atom2.bonds.push(this);
    }
    
    /**
     * Calculate ideal bond length from covalent radii
     * Uses advanced data if available, falls back to estimates
     */
    _calculateBondLength(atom1, atom2) {
        const el1 = atom1.element;
        const el2 = atom2.element;
        
        // Try to use covalent radii from advanced data (in picometers)
        const r1 = el1.radius_covalent_pm || this._estimateCovalentRadius(el1);
        const r2 = el2.radius_covalent_pm || this._estimateCovalentRadius(el2);
        
        // Sum of covalent radii (pm) → convert to world units
        // Scale factor: 1 world unit ≈ 100 pm (arbitrary but consistent)
        const bondLengthPm = r1 + r2;
        const worldUnits = bondLengthPm / 100;
        
        // Clamp to reasonable range (0.5 to 8.0 world units)
        return Math.max(0.5, Math.min(8.0, worldUnits));
    }
    
    /**
     * Estimate covalent radius if not in advanced data
     * Based on atomic number (rough approximation)
     */
    _estimateCovalentRadius(element) {
        const Z = element.number;
        
        // Very rough estimates (pm)
        if(Z === 1) return 37;  // H
        if(Z <= 10) return 70 + (Z - 1) * 5;  // Period 2
        if(Z <= 18) return 100 + (Z - 11) * 8; // Period 3
        if(Z <= 36) return 120 + (Z - 19) * 3; // Period 4
        return 150; // Heavier elements
    }
    
    setCrystalType() {
        this.isCrystalBond = true;
        this.bondType = BOND_TYPES.CRYSTAL;
        // BondRenderer picks up the new bondType next frame automatically
    }
    
    update() {
        const start = this.atom1.group.position;
        const end   = this.atom2.group.position;
        
        // Spring physics only — visuals handled by BondRenderer
        const dir    = new THREE.Vector3().subVectors(end, start);
        const length = dir.length();
        if(length < 0.01) return;
        
        // Use calculated target distance (not hardcoded)
        const force       = (length - this.targetDist) * this.springConstant;
        const springForce = dir.normalize().multiplyScalar(force);
        
        // Apply mode multiplier (pedagogical=1.0, realistic=0.3)
        const multiplier = window.simulation?.physics?.bondSpringMultiplier || 1.0;
        springForce.multiplyScalar(multiplier);
        
        this.atom1.applyForce(springForce.clone());
        this.atom2.applyForce(springForce.clone().negate());
    }
    
    isValid() {
        return this.atom1.group.parent && this.atom2.group.parent;
    }
    
    remove() {
        // No meshes to remove — BondRenderer handles cleanup via slot reset
        this.atom1.bonds = this.atom1.bonds.filter(b => b !== this);
        this.atom2.bonds = this.atom2.bonds.filter(b => b !== this);
    }
}