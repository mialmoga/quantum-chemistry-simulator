/**
 * Atom.js
 * Core class for atomic structure and visualization
 */

export class Atom {
    constructor(position, elementSymbol, elementDatabase, scene, config = {}) {
        this.element = elementDatabase[elementSymbol];
        this.symbol = elementSymbol;
        this.group = new THREE.Group();
        this.bonds = [];
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.force = new THREE.Vector3(0, 0, 0);
        this.radius = 0.5; // For raycasting
        
        // Config (visualization modes)
        this.config = config;
        this.scene = scene;
        
        this._createNucleus();
        this._createShells();
        this._createCloudParticles();
        
        this.group.position.copy(position);
        this.scene.add(this.group);
    }
    
    _createNucleus() {
        const nucleusGeo = new THREE.SphereGeometry(this.radius, 32, 32);
        const nucleusMat = new THREE.MeshPhongMaterial({
            color: this.element.color,
            emissive: this.element.color,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        this.nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
        this.group.add(this.nucleus);
    }
    
    _createShells() {
        this.shells = [];
        this.shellElectrons = [];
        let radius = 1;
        
        const visualizationMode = this.config.visualizationMode || 'clouds';
        
        this.element.shells.forEach((electronCount, shellIndex) => {
            // Shell ring
            const shellGeo = new THREE.TorusGeometry(radius, 0.02, 8, 32);
            const shellMat = new THREE.MeshBasicMaterial({
                color: 0x64c8ff,
                transparent: true,
                opacity: 0.3
            });
            const shell = new THREE.Mesh(shellGeo, shellMat);
            // Give each shell a unique initial orientation based on index
            // This makes them start in different planes but consistently
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
            shell.rotation.x = shellIndex * goldenAngle * 0.5;
            shell.rotation.y = shellIndex * goldenAngle * 0.7;
            shell.rotation.z = shellIndex * goldenAngle * 0.3;
            shell.userData = {
                rotSpeedX: (Math.random() - 0.5) * 0.01,
                rotSpeedY: (Math.random() - 0.5) * 0.01,
                rotSpeedZ: (Math.random() - 0.5) * 0.01
            };
            shell.visible = visualizationMode === 'shells';
            this.group.add(shell);
            this.shells.push(shell);
            
            // Electrons in shell
            const isValenceShell = shellIndex === this.element.shells.length - 1;
            const shellElectronGroup = [];
            
            for(let i = 0; i < electronCount; i++) {
                const electronGeo = new THREE.SphereGeometry(0.08, 16, 16);
                const electronMat = new THREE.MeshPhongMaterial({
                    color: 0x00ffff,
                    emissive: 0x00ffff,
                    emissiveIntensity: 0.5
                });
                const electron = new THREE.Mesh(electronGeo, electronMat);
                
                electron.userData = { 
                    angle: (i / electronCount) * Math.PI * 2, 
                    radius, 
                    speed: 0.02 + Math.random() * 0.01, 
                    shellIndex,
                    isValence: isValenceShell,
                    inBond: false
                };
                electron.visible = visualizationMode === 'shells';
                
                shell.add(electron); // Add to shell so they rotate together
                shellElectronGroup.push(electron);
            }
            this.shellElectrons.push(shellElectronGroup);
            
            radius += 0.8;
        });
    }
    
    _createCloudParticles() {
        this.cloudParticles = [];
        const particleGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({
            color: this.element.color,
            transparent: true,
            opacity: 0.3
        });
        
        const totalElectrons = this.element.shells.reduce((a, b) => a + b, 0);
        const particlesPerElectron = 8;
        const visualizationMode = this.config.visualizationMode || 'clouds';
        
        for(let i = 0; i < totalElectrons * particlesPerElectron; i++) {
            const particle = new THREE.Mesh(particleGeo.clone(), particleMat.clone());
            const r = (Math.random() * 0.5 + 0.5) * (2 + Math.random() * 2);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            particle.userData = {
                baseR: r,
                theta: theta,
                phi: phi,
                speed: 0.01 + Math.random() * 0.02,
                phase: Math.random() * Math.PI * 2
            };
            
            particle.visible = visualizationMode === 'clouds';
            this.group.add(particle);
            this.cloudParticles.push(particle);
        }
    }
    
    consumeValenceElectrons(count) {
        const valenceShell = this.shellElectrons[this.shellElectrons.length - 1];
        let consumed = 0;
        for(let electron of valenceShell) {
            if(!electron.userData.inBond && consumed < count) {
                electron.userData.inBond = true;
                electron.visible = false;
                consumed++;
            }
        }
    }
    
    setVisualizationMode(mode) {
        this.config.visualizationMode = mode;
        const showShells = mode === 'shells';
        const showClouds = mode === 'clouds';
        
        this.shells.forEach(shell => shell.visible = showShells);
        this.updateElectronVisibility();
        this.cloudParticles.forEach(particle => particle.visible = showClouds);
    }
    
    updateElectronVisibility() {
        const visualizationMode = this.config.visualizationMode || 'clouds';
        const electronMode = this.config.electronMode || 'all';
        const showShells = visualizationMode === 'shells';
        
        this.shellElectrons.forEach(group => {
            group.forEach(electron => {
                if(electron.userData.inBond) {
                    electron.visible = false;
                } else if(electronMode === 'valence') {
                    electron.visible = showShells && electron.userData.isValence;
                } else {
                    electron.visible = showShells;
                }
            });
        });
    }
    
    applyForce(force) {
        this.force.add(force);
    }
    
    getEffectiveRadius() {
        // Return the outermost shell radius (electron cloud boundary)
        if(this.shells.length > 0) {
            // Each shell adds ~0.8 units, starting at 1
            return 1 + (this.shells.length * 0.8);
        }
        return this.radius; // Fallback to nucleus radius
    }
    
    updatePhysics(damping = 0.95) {
        this.velocity.add(this.force);
        this.velocity.multiplyScalar(damping);
        this.group.position.add(this.velocity);
        this.force.set(0, 0, 0);
    }
    
    update() {
        // Nucleus rotation
        this.nucleus.rotation.x += 0.01;
        this.nucleus.rotation.y += 0.01;
        
        // Energy-based glow
        const energy = this.velocity.length();
        this.nucleus.material.emissiveIntensity = 0.3 + energy * 2;
        
        const visualizationMode = this.config.visualizationMode || 'clouds';
        
        if(visualizationMode === 'shells') {
            // Rotate shells (each with unique rotation speeds)
            this.shells.forEach(shell => {
                shell.rotation.x += shell.userData.rotSpeedX;
                shell.rotation.y += shell.userData.rotSpeedY;
                shell.rotation.z += shell.userData.rotSpeedZ;
            });
            
            // Animate electrons in orbits (they're children of shells now)
            this.shellElectrons.forEach(electronGroup => {
                electronGroup.forEach(electron => {
                    if(electron.visible && !electron.userData.inBond) {
                        electron.userData.angle += electron.userData.speed;
                        const angle = electron.userData.angle;
                        const radius = electron.userData.radius;
                        
                        // Position on circular path in shell's local space
                        // This ensures electrons follow the visible orbit ring
                        const x = Math.cos(angle) * radius;
                        const z = Math.sin(angle) * radius;
                        const y = 0; // Stay on shell's plane
                        
                        electron.position.set(x, y, z);
                    }
                });
            });
        } else {
            // Animate cloud particles
            this.cloudParticles.forEach(particle => {
                const userData = particle.userData;
                userData.phase += userData.speed;
                const r = userData.baseR * (1 + Math.sin(userData.phase) * 0.2);
                const x = r * Math.sin(userData.phi) * Math.cos(userData.theta);
                const y = r * Math.sin(userData.phi) * Math.sin(userData.theta);
                const z = r * Math.cos(userData.phi);
                particle.position.set(x, y, z);
                particle.material.opacity = 0.2 + Math.sin(userData.phase) * 0.15;
            });
        }
    }
    
    remove() {
        this.scene.remove(this.group);
    }
}