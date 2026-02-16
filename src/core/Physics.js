/**
 * Physics.js
 * Physics engine for gravity, collisions, and forces
 */

export class PhysicsEngine {
    constructor() {
        // Gravity settings
        this.gravityEnabled = false;
        this.gravityStrength = 5;      // 0-10 scale
        this.gravityConstant = 0.001;  // Multiplier for realistic fall
        
        // Floor settings
        this.floorEnabled = true;
        this.floorY = -15;
        this.restitution = 0.6;  // Bounce coefficient (0-1)
        
        // General physics
        this.friction = 0.98;
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
        
        if(position.y < this.floorY) {
            // Place on floor
            position.y = this.floorY;
            
            // Bounce
            atom.velocity.y *= -this.restitution;
            
            // Dampen if bounce is small (to stop eventually)
            if(Math.abs(atom.velocity.y) < 0.01) {
                atom.velocity.y = 0;
            }
        }
    }
    
    updateAtom(atom) {
        // Skip frozen atoms (crystal mode)
        if(atom.frozen) return;
        
        // Apply gravity
        this.applyGravity(atom);
        
        // Update velocity from forces
        atom.velocity.add(atom.force);
        atom.velocity.multiplyScalar(this.friction);
        
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