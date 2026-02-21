/**
 * PhysicsMode.js
 * Defines different physics simulation modes:
 * - PEDAGOGICAL: Traditional chemistry model (discrete bonds, enforced angles)
 * - REALISTIC: Continuous force fields (emergent bonds, natural geometry)
 */

export const PHYSICS_MODE = {
    PEDAGOGICAL: 'pedagogical',
    REALISTIC: 'realistic'
};

export class PhysicsModeManager {
    constructor(physics) {
        this.physics = physics;
        this.currentMode = PHYSICS_MODE.PEDAGOGICAL;
        
        // Store mode-specific settings
        this.modes = {
            [PHYSICS_MODE.PEDAGOGICAL]: {
                name: 'Pedagógico',
                description: 'Modelo tradicional (como se enseña)',
                settings: {
                    // Discrete bonds
                    useDiscreteBonds: true,
                    
                    // Enforce bond angles (VSEPR geometry)
                    bondAnglesEnabled: true,
                    bondAngleStrength: 0.5,
                    
                    // Stronger spring forces (rigid bonds)
                    bondSpringMultiplier: 1.0,
                    
                    // Van der Waals weak (background only)
                    lennardJonesEnabled: false,
                    lennardJonesStrength: 0.1,
                    
                    // Visualization
                    showBonds: true,
                    bondStyle: 'solid', // solid lines
                }
            },
            
            [PHYSICS_MODE.REALISTIC]: {
                name: 'Realista',
                description: 'Campos de fuerza continuos (físicamente correcto)',
                settings: {
                    // No discrete bonds (all force-based)
                    useDiscreteBonds: false,
                    
                    // Natural angles (no enforcement)
                    bondAnglesEnabled: false,
                    bondAngleStrength: 0.0,
                    
                    // Weaker springs (more flexible)
                    bondSpringMultiplier: 0.3,
                    
                    // Van der Waals primary (continuous attraction)
                    lennardJonesEnabled: true,
                    lennardJonesStrength: 0.5,
                    
                    // Visualization
                    showBonds: true, // Still show for reference
                    bondStyle: 'gradient', // intensity-based
                }
            }
        };
    }
    
    /**
     * Switch to a different physics mode
     */
    setMode(mode) {
        if(!this.modes[mode]) {
            console.error(`Unknown physics mode: ${mode}`);
            return;
        }
        
        const oldMode = this.currentMode;
        this.currentMode = mode;
        
        // Apply mode settings
        this.applyModeSettings();
        
        console.log(`🔬 Physics mode: ${oldMode} → ${mode}`);
        return this.modes[mode];
    }
    
    /**
     * Apply current mode settings to physics engine
     */
    applyModeSettings() {
        const settings = this.modes[this.currentMode].settings;
        
        // Bond angles
        this.physics.bondAnglesEnabled = settings.bondAnglesEnabled;
        this.physics.bondAngleStrength = settings.bondAngleStrength;
        
        // Lennard-Jones
        this.physics.lennardJones.setEnabled(settings.lennardJonesEnabled);
        this.physics.lennardJones.setStrength(settings.lennardJonesStrength);
        
        // Spring multiplier (will be used by bonds)
        this.physics.bondSpringMultiplier = settings.bondSpringMultiplier;
        
        console.log(`⚙️ Applied ${this.currentMode} mode settings:`, settings);
    }
    
    /**
     * Get current mode info
     */
    getCurrentMode() {
        return {
            mode: this.currentMode,
            ...this.modes[this.currentMode]
        };
    }
    
    /**
     * Get all available modes
     */
    getAllModes() {
        return Object.keys(this.modes).map(key => ({
            id: key,
            ...this.modes[key]
        }));
    }
    
    /**
     * Check if current mode uses discrete bonds
     */
    usesDiscreteBonds() {
        return this.modes[this.currentMode].settings.useDiscreteBonds;
    }
    
    /**
     * Get bond visualization style
     */
    getBondStyle() {
        return this.modes[this.currentMode].settings.bondStyle;
    }
}
