/**
 * Physics.js
 * Physics engine for gravity, collisions, and forces
 */

import { LennardJonesForces } from '../physics/LennardJones.js';
import { PhysicsModeManager, PHYSICS_MODE } from '../physics/PhysicsMode.js';

export class PhysicsEngine {
    constructor() {
        // Gravity settings
        this.gravityEnabled = false;
        this.gravityStrength = 5;      // 0-10 scale (UI slider)
        this.gravityConstant = 0.00001;  // Atomic scale (100x weaker than before)
        // NOTE: At atomic scale, gravity is ~10^36 weaker than electromagnetic forces
        // This value is still exaggerated for visibility, but much more realistic
        
        // Floor settings
        this.floorEnabled = true;
        this.floorY = -15;
        this.restitution = 0.6;  // Bounce coefficient (0-1)
        
        // General physics
        this.friction = 0.98;
        
        // Terminal velocity (prevents atoms from moving too fast)
        this.terminalVelocity = 2.0;  // Max speed in world units/frame
        // Prevents atoms from "tunneling" through repulsion barriers
        
        // Atomic repulsion (Pauli exclusion principle - by Éter)
        this.repulsionEnabled = true;
        this.repulsionStrength = 0.5;  // Fuerza de la barrera
        this.repulsionFactor = 1.6;    // Multiplicador de distancia mínima (punto dulce)
        
        // Bond angle constraints (molecular geometry)
        this.bondAnglesEnabled = true;
        this.bondAngleStrength = 0.5;  // 0-1, how strongly angles are enforced
        
        // Lennard-Jones forces (Van der Waals)
        this.lennardJones = new LennardJonesForces();
        this.lennardJones.enabled = false; // Start disabled
        
        // Physics mode manager (Pedagogical vs Realistic)
        this.modeManager = new PhysicsModeManager(this);
        this.bondSpringMultiplier = 1.0; // Controlled by mode
        
        // Reusable objects (avoid GC)
        this._delta = new THREE.Vector3();
        this._force = new THREE.Vector3();
    }
    
    applyGravity(atom) {
        if(!this.gravityEnabled) return;
        if(atom.isDragging) return; // Skip if being dragged
        
        // F = mg (mass * gravity)
        const mass = atom.element.mass;
        const force = mass * this.gravityStrength * this.gravityConstant;
        atom.force.y -= force;
    }
    
    checkFloorCollision(atom) {
        if(!this.floorEnabled) return;
        
        const position = atom.group.position;
        const effectiveRadius = atom.getEffectiveRadius(); // Use electron cloud boundary
        
        if(position.y - effectiveRadius < this.floorY) {
            // Place on floor with offset for radius
            position.y = this.floorY + effectiveRadius;
            
            // Bounce with energy loss
            atom.velocity.y *= -this.restitution;
            
            // Collision damping: absorb horizontal energy too (friction)
            atom.velocity.x *= 0.85;
            atom.velocity.z *= 0.85;
            
            // Dampen if bounce is small (to stop eventually)
            if(Math.abs(atom.velocity.y) < 0.01) {
                atom.velocity.y = 0;
            }
        }
    }
    
    /**
     * Apply Pauli exclusion repulsion between all atoms
     * Prevents atoms from overlapping (designed by Éter)
     * Uses quadratic force: stronger as atoms get closer
     */
    applyAtomicRepulsion(atoms) {
        if(!this.repulsionEnabled) return;
        
        for(let i = 0; i < atoms.length; i++) {
            for(let j = i + 1; j < atoms.length; j++) {
                const a = atoms[i];
                const b = atoms[j];
                
                // Skip if both frozen
                if(a.frozen && b.frozen) continue;
                
                this._delta.subVectors(b.group.position, a.group.position);
                const dist = this._delta.length();
                
                // Minimum distance based on nucleus radii
                const minDist = (a.nucleusRadius + b.nucleusRadius) * this.repulsionFactor;
                
                if(dist < minDist && dist > 0.01) {
                    // Quadratic repulsion: stronger at close range
                    const overlap = minDist - dist;
                    const forceMag = (overlap * overlap) * this.repulsionStrength;
                    
                    this._force.copy(this._delta).normalize().multiplyScalar(forceMag);
                    
                    if(!a.frozen) {
                        a.force.sub(this._force);  // Push a away
                    }
                    if(!b.frozen) {
                        b.force.add(this._force);  // Push b away
                    }
                }
            }
        }
    }
    
    updateAtom(atom) {
        // Skip frozen atoms (crystal mode)
        if(atom.frozen) return;
        
        // Apply gravity
        this.applyGravity(atom);
        
        // Update velocity from forces: F = ma → a = F/m
        const mass = atom.element.mass || 1.0; // Use actual atomic mass
        const acceleration = atom.force.clone().divideScalar(mass);
        atom.velocity.add(acceleration);
        atom.velocity.multiplyScalar(this.friction);
        
        // Apply terminal velocity (prevent tunneling through repulsion)
        const speed = atom.velocity.length();
        if(speed > this.terminalVelocity) {
            atom.velocity.multiplyScalar(this.terminalVelocity / speed);
        }
        
        // Update position
        atom.group.position.add(atom.velocity);
        
        // Check floor collision
        this.checkFloorCollision(atom);
        
        // Reset forces
        atom.force.set(0, 0, 0);
    }
    
    setGravity(enabled, strength = null) {
        this.gravityEnabled = enabled;
        if(strength !== null) {
            this.gravityStrength = Math.max(0, Math.min(10, strength));
        }
    }
    
    setFloor(enabled, y = null, restitution = null) {
        this.floorEnabled = enabled;
        if(y !== null) this.floorY = y;
        if(restitution !== null) {
            this.restitution = Math.max(0, Math.min(1, restitution));
        }
    }
}
