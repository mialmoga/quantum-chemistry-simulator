/**
 * BondAngleConstraints.js
 * Applies angular constraints to maintain realistic molecular geometries
 * Uses ideal_bond_angle and geometry_preference from advanced element data
 * 
 * NOTE: THREE.js is loaded globally via script tag in index.html
 */

/**
 * Apply angular constraints to an atom's bonds
 * @param {Atom} centerAtom - The central atom
 * @param {number} strength - Constraint strength (0-1)
 */
export function applyBondAngleConstraints(centerAtom, strength = 0.5) {
    const bonds = centerAtom.bonds;
    if(bonds.length < 2) return; // Need at least 2 bonds for angles
    
    const element = centerAtom.element;
    
    // Get ideal angle from advanced data
    const idealAngle = element.ideal_bond_angle || null;
    const geometry = element.geometry_preference || 'unknown';
    
    // If no advanced data, use heuristics based on bond count
    const targetAngle = idealAngle || getDefaultAngle(bonds.length);
    
    // Apply constraints based on geometry type
    switch(geometry) {
        case 'linear':
            applyLinearConstraint(centerAtom, bonds, strength);
            break;
        case 'trigonal_planar':
            applyTrigonalPlanarConstraint(centerAtom, bonds, strength);
            break;
        case 'tetrahedral':
            applyTetrahedralConstraint(centerAtom, bonds, strength);
            break;
        case 'bent':
            applyBentConstraint(centerAtom, bonds, targetAngle, strength);
            break;
        case 'trigonal_pyramidal':
            applyTrigonalPyramidalConstraint(centerAtom, bonds, strength);
            break;
        case 'octahedral':
            applyOctahedralConstraint(centerAtom, bonds, strength);
            break;
        default:
            // Generic angle-based constraint
            applyGenericAngleConstraint(centerAtom, bonds, targetAngle, strength);
    }
}

/**
 * Get default angle based on number of bonds (VSEPR theory)
 */
function getDefaultAngle(bondCount) {
    switch(bondCount) {
        case 2: return 180;   // Linear
        case 3: return 120;   // Trigonal planar
        case 4: return 109.5; // Tetrahedral
        case 5: return 90;    // Trigonal bipyramidal (simplified)
        case 6: return 90;    // Octahedral
        default: return 120;
    }
}

/**
 * LINEAR (180°) - e.g., CO₂, BeH₂
 */
function applyLinearConstraint(centerAtom, bonds, strength) {
    if(bonds.length !== 2) return;
    
    const [bond1, bond2] = bonds;
    const atom1 = bond1.atom1 === centerAtom ? bond1.atom2 : bond1.atom1;
    const atom2 = bond2.atom1 === centerAtom ? bond2.atom2 : bond2.atom1;
    
    const center = centerAtom.group.position;
    const pos1 = atom1.group.position;
    const pos2 = atom2.group.position;
    
    const dir1 = new THREE.Vector3().subVectors(pos1, center).normalize();
    const dir2 = new THREE.Vector3().subVectors(pos2, center).normalize();
    
    // Target: dir1 and dir2 should be opposite (dot = -1)
    const dot = dir1.dot(dir2);
    const targetDot = -1.0;
    const error = targetDot - dot;
    
    if(Math.abs(error) < 0.01) return;
    
    // Apply corrective force perpendicular to current directions
    const correction = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
    if(correction.lengthSq() < 0.01) return; // Already aligned
    
    const force = correction.multiplyScalar(error * strength * 0.05);
    
    atom1.applyForce(force.clone());
    atom2.applyForce(force.clone().negate());
}

/**
 * TRIGONAL PLANAR (120°) - e.g., BF₃, NO₃⁻
 */
function applyTrigonalPlanarConstraint(centerAtom, bonds, strength) {
    if(bonds.length !== 3) return;
    
    const center = centerAtom.group.position;
    const neighbors = bonds.map(b => 
        (b.atom1 === centerAtom ? b.atom2 : b.atom1).group.position
    );
    
    const targetAngle = (Math.PI * 2) / 3; // 120° in radians
    
    for(let i = 0; i < 3; i++) {
        const next = (i + 1) % 3;
        const dir1 = new THREE.Vector3().subVectors(neighbors[i], center).normalize();
        const dir2 = new THREE.Vector3().subVectors(neighbors[next], center).normalize();
        
        const currentAngle = Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1));
        const error = targetAngle - currentAngle;
        
        if(Math.abs(error) < 0.01) continue;
        
        // Apply rotational correction
        const axis = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
        const correction = axis.multiplyScalar(error * strength * 0.03);
        
        const atom1 = bonds[i].atom1 === centerAtom ? bonds[i].atom2 : bonds[i].atom1;
        const atom2 = bonds[next].atom1 === centerAtom ? bonds[next].atom2 : bonds[next].atom1;
        
        atom1.applyForce(correction.clone());
        atom2.applyForce(correction.clone().negate());
    }
}

/**
 * TETRAHEDRAL (109.5°) - e.g., CH₄, NH₄⁺
 */
function applyTetrahedralConstraint(centerAtom, bonds, strength) {
    if(bonds.length !== 4) return;
    
    const center = centerAtom.group.position;
    const neighbors = bonds.map(b => 
        (b.atom1 === centerAtom ? b.atom2 : b.atom1).group.position
    );
    
    const targetAngle = Math.acos(-1/3); // 109.47° in radians
    
    // Apply constraint to all pairs
    for(let i = 0; i < 4; i++) {
        for(let j = i + 1; j < 4; j++) {
            const dir1 = new THREE.Vector3().subVectors(neighbors[i], center).normalize();
            const dir2 = new THREE.Vector3().subVectors(neighbors[j], center).normalize();
            
            const currentAngle = Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1));
            const error = targetAngle - currentAngle;
            
            if(Math.abs(error) < 0.01) continue;
            
            const axis = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
            const correction = axis.multiplyScalar(error * strength * 0.02);
            
            const atom1 = bonds[i].atom1 === centerAtom ? bonds[i].atom2 : bonds[i].atom1;
            const atom2 = bonds[j].atom1 === centerAtom ? bonds[j].atom2 : bonds[j].atom1;
            
            atom1.applyForce(correction.clone());
            atom2.applyForce(correction.clone().negate());
        }
    }
}

/**
 * BENT (variable angle) - e.g., H₂O (104.5°), H₂S (92°)
 */
function applyBentConstraint(centerAtom, bonds, targetAngleDeg, strength) {
    if(bonds.length !== 2) return;
    
    const [bond1, bond2] = bonds;
    const atom1 = bond1.atom1 === centerAtom ? bond1.atom2 : bond1.atom1;
    const atom2 = bond2.atom1 === centerAtom ? bond2.atom2 : bond2.atom1;
    
    const center = centerAtom.group.position;
    const pos1 = atom1.group.position;
    const pos2 = atom2.group.position;
    
    const dir1 = new THREE.Vector3().subVectors(pos1, center).normalize();
    const dir2 = new THREE.Vector3().subVectors(pos2, center).normalize();
    
    const currentAngle = Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1));
    const targetAngle = targetAngleDeg * Math.PI / 180;
    const error = targetAngle - currentAngle;
    
    if(Math.abs(error) < 0.01) return;
    
    // Determine which atom to move (move both for symmetry)
    const axis = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
    if(axis.lengthSq() < 0.01) return;
    
    const correction = axis.multiplyScalar(error * strength * 0.04);
    
    atom1.applyForce(correction.clone());
    atom2.applyForce(correction.clone().negate());
}

/**
 * TRIGONAL PYRAMIDAL (107°) - e.g., NH₃, PCl₃
 */
function applyTrigonalPyramidalConstraint(centerAtom, bonds, strength) {
    if(bonds.length !== 3) return;
    
    // Similar to tetrahedral but with 3 bonds
    // Target angle ~107° between bonds
    const targetAngle = 107 * Math.PI / 180;
    
    const center = centerAtom.group.position;
    const neighbors = bonds.map(b => 
        (b.atom1 === centerAtom ? b.atom2 : b.atom1).group.position
    );
    
    for(let i = 0; i < 3; i++) {
        for(let j = i + 1; j < 3; j++) {
            const dir1 = new THREE.Vector3().subVectors(neighbors[i], center).normalize();
            const dir2 = new THREE.Vector3().subVectors(neighbors[j], center).normalize();
            
            const currentAngle = Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1));
            const error = targetAngle - currentAngle;
            
            if(Math.abs(error) < 0.01) continue;
            
            const axis = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
            const correction = axis.multiplyScalar(error * strength * 0.03);
            
            const atom1 = bonds[i].atom1 === centerAtom ? bonds[i].atom2 : bonds[i].atom1;
            const atom2 = bonds[j].atom1 === centerAtom ? bonds[j].atom2 : bonds[j].atom1;
            
            atom1.applyForce(correction.clone());
            atom2.applyForce(correction.clone().negate());
        }
    }
}

/**
 * OCTAHEDRAL (90°) - e.g., SF₆
 */
function applyOctahedralConstraint(centerAtom, bonds, strength) {
    if(bonds.length !== 6) return;
    
    const targetAngle = Math.PI / 2; // 90°
    
    const center = centerAtom.group.position;
    const neighbors = bonds.map(b => 
        (b.atom1 === centerAtom ? b.atom2 : b.atom1).group.position
    );
    
    // Apply 90° constraint to adjacent pairs
    for(let i = 0; i < 6; i++) {
        for(let j = i + 1; j < 6; j++) {
            const dir1 = new THREE.Vector3().subVectors(neighbors[i], center).normalize();
            const dir2 = new THREE.Vector3().subVectors(neighbors[j], center).normalize();
            
            const dot = dir1.dot(dir2);
            
            // Skip opposite pairs (dot ≈ -1) - they should be 180°
            if(dot < -0.9) continue;
            
            const currentAngle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
            const error = targetAngle - currentAngle;
            
            if(Math.abs(error) < 0.01) continue;
            
            const axis = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
            const correction = axis.multiplyScalar(error * strength * 0.02);
            
            const atom1 = bonds[i].atom1 === centerAtom ? bonds[i].atom2 : bonds[i].atom1;
            const atom2 = bonds[j].atom1 === centerAtom ? bonds[j].atom2 : bonds[j].atom1;
            
            atom1.applyForce(correction.clone());
            atom2.applyForce(correction.clone().negate());
        }
    }
}

/**
 * GENERIC angle constraint (fallback)
 */
function applyGenericAngleConstraint(centerAtom, bonds, targetAngleDeg, strength) {
    if(bonds.length < 2) return;
    
    const targetAngle = targetAngleDeg * Math.PI / 180;
    const center = centerAtom.group.position;
    
    // Apply constraint to all pairs
    for(let i = 0; i < bonds.length; i++) {
        for(let j = i + 1; j < bonds.length; j++) {
            const atom1 = bonds[i].atom1 === centerAtom ? bonds[i].atom2 : bonds[i].atom1;
            const atom2 = bonds[j].atom1 === centerAtom ? bonds[j].atom2 : bonds[j].atom1;
            
            const pos1 = atom1.group.position;
            const pos2 = atom2.group.position;
            
            const dir1 = new THREE.Vector3().subVectors(pos1, center).normalize();
            const dir2 = new THREE.Vector3().subVectors(pos2, center).normalize();
            
            const currentAngle = Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1));
            const error = targetAngle - currentAngle;
            
            if(Math.abs(error) < 0.01) continue;
            
            const axis = new THREE.Vector3().crossVectors(dir1, dir2).normalize();
            if(axis.lengthSq() < 0.01) continue;
            
            const correction = axis.multiplyScalar(error * strength * 0.03);
            
            atom1.applyForce(correction.clone());
            atom2.applyForce(correction.clone().negate());
        }
    }
}
