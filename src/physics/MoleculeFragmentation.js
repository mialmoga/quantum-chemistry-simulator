/**
 * MoleculeFragmentation.js
 * Detects when molecules/crystals fragment into disconnected pieces
 * and splits them into separate independent structures
 */

/**
 * Find all connected components (molecules) in atom graph
 * Uses Depth-First Search on bond connections OR spatial proximity
 * @param {Array<Atom>} atoms - All atoms to analyze
 * @param {boolean} useSpatial - Use spatial proximity instead of bonds (for MetallicClouds)
 * @returns {Array<Array<Atom>>} - Array of disconnected fragments
 */
export function findDisconnectedFragments(atoms, useSpatial = false) {
    const visited = new Set();
    const fragments = [];
    
    for(const atom of atoms) {
        if(visited.has(atom)) continue;
        
        // Start new fragment
        const fragment = [];
        const stack = [atom];
        
        // DFS to find all connected atoms
        while(stack.length > 0) {
            const current = stack.pop();
            
            if(visited.has(current)) continue;
            visited.add(current);
            fragment.push(current);
            
            if(useSpatial) {
                // Use spatial proximity (for MetallicClouds without explicit bonds)
                const maxDist = 6.0; // Same as MetallicCloud physics cutoff
                for(const other of atoms) {
                    if(visited.has(other)) continue;
                    const dist = current.group.position.distanceTo(other.group.position);
                    if(dist < maxDist) {
                        stack.push(other);
                    }
                }
            } else {
                // Use explicit bonds
                for(const bond of current.bonds) {
                    const neighbor = bond.atom1 === current ? bond.atom2 : bond.atom1;
                    if(!visited.has(neighbor)) {
                        stack.push(neighbor);
                    }
                }
            }
        }
        
        fragments.push(fragment);
    }
    
    return fragments;
}

/**
 * Check if a metallic cloud has fragmented
 * Returns fragments if cloud split, null if still connected
 * @param {MetallicCloud} cloud - The metallic cloud to check
 * @returns {Array<Array<Atom>>|null} - Fragments or null
 */
export function checkMetallicCloudFragmentation(cloud) {
    if(!cloud || !cloud.atoms || cloud.atoms.length < 2) return null;
    
    // Find fragments using spatial proximity (MetallicClouds don't have explicit bonds)
    const fragments = findDisconnectedFragments(cloud.atoms, true); // useSpatial = true
    
    // If only 1 fragment, cloud is still connected
    if(fragments.length === 1) return null;
    
    // Cloud has fragmented
    return fragments;
}

/**
 * Split a fragmented metallic cloud into separate structures
 * Small fragments (< 3 atoms) become regular bonds
 * Larger fragments become new clouds
 * @param {MetallicCloud} cloud - The fragmented cloud
 * @param {Array<Array<Atom>>} fragments - The detected fragments
 * @param {Simulation} simulation - Simulation instance
 */
export function splitMetallicCloud(cloud, fragments, simulation) {
    const scene = cloud.scene;
    
    // Remove original cloud
    cloud.remove();
    
    // Process each fragment
    for(const fragment of fragments) {
        if(fragment.length === 0) continue;
        
        // Clear metallicCloud reference from atoms
        fragment.forEach(atom => {
            atom.metallicCloud = null;
            // Reset velocities to prevent explosion
            atom.velocity.set(0, 0, 0);
            atom.force.set(0, 0, 0);
        });
        
        if(fragment.length === 1) {
            // Single atom - just leave it alone
            console.log('⚛️ Single atom fragment (no bonds needed)');
            
        } else if(fragment.length === 2) {
            // Two atoms - create simple bond
            const [a1, a2] = fragment;
            const bond = new window.Bond(a1, a2, scene);
            simulation.bonds.push(bond);
            console.log('🔗 Fragment → simple bond (2 atoms)');
            
        } else {
            // 3+ atoms - create new metallic cloud
            const MetallicCloud = window.MetallicCloud;
            if(MetallicCloud) {
                const newCloud = new MetallicCloud(fragment, scene);
                simulation.bonds.push(newCloud);
                console.log(`⚗️ Fragment → new metallic cloud (${fragment.length} atoms)`);
            } else {
                console.warn('⚠️ MetallicCloud not available, creating bonds');
                // Fallback: create bonds between nearby atoms
                createFallbackBonds(fragment, simulation, scene);
            }
        }
    }
}

/**
 * Create bonds between nearby atoms as fallback
 */
function createFallbackBonds(atoms, simulation, scene) {
    for(let i = 0; i < atoms.length; i++) {
        for(let j = i + 1; j < atoms.length; j++) {
            const a1 = atoms[i];
            const a2 = atoms[j];
            const dist = a1.group.position.distanceTo(a2.group.position);
            
            // Bond if close enough
            if(dist < 4.0) {
                const bond = new window.Bond(a1, a2, scene);
                simulation.bonds.push(bond);
            }
        }
    }
}

/**
 * Check all structures for fragmentation
 * Called periodically (e.g., after atom deletion)
 * @param {Simulation} simulation - Simulation instance
 */
export function checkAllFragmentation(simulation) {
    const cloudsToSplit = [];
    
    // Check metallic clouds
    for(const bond of simulation.bonds) {
        if(bond.isCrystalBond && bond.atoms && bond.atoms.length > 0) {
            // This is a metallic cloud
            const fragments = checkMetallicCloudFragmentation(bond);
            if(fragments) {
                cloudsToSplit.push({ cloud: bond, fragments });
            }
        }
    }
    
    // Split fragmented clouds
    for(const { cloud, fragments } of cloudsToSplit) {
        // Remove from bonds array first
        const index = simulation.bonds.indexOf(cloud);
        if(index > -1) {
            simulation.bonds.splice(index, 1);
        }
        
        // Split into new structures
        splitMetallicCloud(cloud, fragments, simulation);
    }
    
    if(cloudsToSplit.length > 0) {
        console.log(`🔀 Split ${cloudsToSplit.length} fragmented structure(s)`);
    }
}
