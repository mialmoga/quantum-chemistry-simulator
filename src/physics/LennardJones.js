/**
 * LennardJones.js
 * Implements Lennard-Jones potential for Van der Waals forces
 * Used for non-bonded interactions (noble gases, weak molecular attraction)
 * 
 * NOTE: THREE.js is loaded globally via script tag in index.html
 */

// Reusable objects
const _delta = new THREE.Vector3();
const _force = new THREE.Vector3();

export class LennardJonesForces {
    constructor() {
        this.enabled = false;
        this.strength = 0.1; // 0-1 scale (start very weak)
        this.cutoffDistance = 8.0; // Only calculate for nearby atoms
        
        // Performance: skip every N frames for distant atoms
        this.frameSkip = 3;
        this._frameCounter = 0;
    }
    
    /**
     * Apply Lennard-Jones forces between all non-bonded atom pairs
     * @param {Array<Atom>} atoms - All atoms in simulation
     */
    applyForces(atoms) {
        if(!this.enabled) return;
        
        this._frameCounter++;
        const skipFrame = this._frameCounter % this.frameSkip !== 0;
        
        for(let i = 0; i < atoms.length; i++) {
            for(let j = i + 1; j < atoms.length; j++) {
                const a = atoms[i];
                const b = atoms[j];
                
                // Skip frozen atoms
                if(a.frozen && b.frozen) continue;
                
                // Skip if bonded (they already have spring forces)
                if(this._areBonded(a, b)) continue;
                
                // Skip if part of same metallic cloud
                if(a.metallicCloud && a.metallicCloud === b.metallicCloud) continue;
                
                // Calculate distance
                _delta.subVectors(b.group.position, a.group.position);
                const r = _delta.length();
                
                // Skip if too far (cutoff for performance)
                if(r > this.cutoffDistance) {
                    // For distant atoms, only calculate every N frames
                    if(skipFrame) continue;
                }
                
                if(r < 0.1) continue; // Avoid singularity
                
                // Get Lennard-Jones parameters
                const params = this._getLJParameters(a, b);
                
                // Calculate force magnitude: F = -dV/dr
                const forceMag = this._calculateForceMagnitude(r, params);
                
                // Apply force (normalized direction)
                _force.copy(_delta).normalize().multiplyScalar(forceMag * this.strength);
                
                if(!a.frozen) {
                    a.applyForce(_force);
                }
                if(!b.frozen) {
                    b.applyForce(_force.clone().negate());
                }
            }
        }
    }
    
    /**
     * Check if two atoms are bonded
     */
    _areBonded(atom1, atom2) {
        return atom1.bonds.some(bond => 
            bond.atom1 === atom2 || bond.atom2 === atom2
        );
    }
    
    /**
     * Get Lennard-Jones parameters for atom pair
     * Uses Van der Waals radius and polarizability from advanced data
     */
    _getLJParameters(atom1, atom2) {
        const el1 = atom1.element;
        const el2 = atom2.element;
        
        // Sigma (σ): equilibrium distance
        // Use Van der Waals radii if available
        const r1 = el1.vanderwaals_radius_pm || this._estimateVDWRadius(el1);
        const r2 = el2.vanderwaals_radius_pm || this._estimateVDWRadius(el2);
        const sigma = (r1 + r2) / 100; // Convert pm to world units
        
        // Epsilon (ε): well depth
        // Use polarizability as proxy if available
        const pol1 = el1.polarizability_angstrom3 || this._estimatePolarizability(el1);
        const pol2 = el2.polarizability_angstrom3 || this._estimatePolarizability(el2);
        
        // Combine using geometric mean (Lorentz-Berthelot rules)
        // Scale WAY down for stability (Van der Waals is WEAK)
        const epsilon = Math.sqrt(pol1 * pol2) * 0.00001; // 100× más débil
        
        return { sigma, epsilon };
    }
    
    /**
     * Estimate Van der Waals radius if not in advanced data
     */
    _estimateVDWRadius(element) {
        const Z = element.number;
        
        // Noble gases (known values)
        if(Z === 2) return 140;  // He
        if(Z === 10) return 154; // Ne
        if(Z === 18) return 188; // Ar
        if(Z === 36) return 202; // Kr
        if(Z === 54) return 216; // Xe
        
        // Rough estimates for others
        if(Z === 1) return 120;  // H
        if(Z === 6) return 170;  // C
        if(Z === 7) return 155;  // N
        if(Z === 8) return 152;  // O
        if(Z === 9) return 147;  // F
        
        // General estimate: ~1.5× covalent radius
        const covalent = element.radius_covalent_pm || 100;
        return covalent * 1.5;
    }
    
    /**
     * Estimate polarizability if not in advanced data
     */
    _estimatePolarizability(element) {
        const Z = element.number;
        
        // Known values (Å³)
        if(Z === 1) return 0.667;   // H
        if(Z === 2) return 0.205;   // He
        if(Z === 6) return 1.76;    // C
        if(Z === 7) return 1.10;    // N
        if(Z === 8) return 0.802;   // O
        if(Z === 10) return 0.396;  // Ne
        if(Z === 18) return 1.64;   // Ar
        
        // Rough estimate: increases with size
        return Z * 0.1;
    }
    
    /**
     * Calculate force magnitude from Lennard-Jones potential
     * F = -dV/dr = 24ε/r [(2(σ/r)¹² - (σ/r)⁶)]
     */
    _calculateForceMagnitude(r, params) {
        const { sigma, epsilon } = params;
        
        const sr = sigma / r;
        const sr6 = Math.pow(sr, 6);
        const sr12 = sr6 * sr6;
        
        // Force = 24ε/r [2(σ/r)¹² - (σ/r)⁶]
        const forceMag = (24 * epsilon / r) * (2 * sr12 - sr6);
        
        return forceMag;
    }
    
    /**
     * Set enabled state
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    /**
     * Set strength (0-1)
     */
    setStrength(strength) {
        this.strength = Math.max(0, Math.min(1, strength));
    }
    
    /**
     * Set cutoff distance
     */
    setCutoff(distance) {
        this.cutoffDistance = Math.max(2, distance);
    }
}
