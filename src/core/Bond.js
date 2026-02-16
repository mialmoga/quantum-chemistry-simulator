/**
 * Bond.js
 * Represents chemical bonds between atoms with spring physics
 */

export class Bond {
    constructor(atom1, atom2, scene) {
        this.atom1 = atom1;
        this.atom2 = atom2;
        this.scene = scene;
        
        // Bond cylinder
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const material = new THREE.MeshPhongMaterial({
            color: 0x888888,
            emissive: 0x444444,
            emissiveIntensity: 0.2
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        
        // Electrons traveling along bond
        this.electrons = [];
        for(let i = 0; i < 2; i++) {
            const electronGeo = new THREE.SphereGeometry(0.1, 16, 16);
            const electronMat = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 0.8
            });
            const electron = new THREE.Mesh(electronGeo, electronMat);
            electron.userData = { progress: i * 0.5, speed: 0.01 };
            this.scene.add(electron);
            this.electrons.push(electron);
        }
        
        // Consume valence electrons from both atoms
        atom1.consumeValenceElectrons(1);
        atom2.consumeValenceElectrons(1);
        
        // Register bond in atoms
        atom1.bonds.push(this);
        atom2.bonds.push(this);
        
        this.update();
    }
    
    update() {
        const start = this.atom1.group.position;
        const end = this.atom2.group.position;
        
        // Position bond cylinder
        this.mesh.position.copy(start).add(end).multiplyScalar(0.5);
        
        // Orient and scale bond
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        this.mesh.scale.y = length;
        
        const axis = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize());
        this.mesh.quaternion.copy(quaternion);
        
        // Spring physics (stronger to resist gravity)
        const targetDist = 3.5;
        const force = (length - targetDist) * 0.02; // Increased from 0.005
        const springForce = direction.clone().normalize().multiplyScalar(force);
        this.atom1.applyForce(springForce.clone());
        this.atom2.applyForce(springForce.clone().negate());
        
        // Visual tension feedback
        const tension = Math.abs(force);
        this.mesh.material.emissiveIntensity = 0.2 + tension * 50;
        
        // Animate electrons
        this.electrons.forEach(electron => {
            electron.userData.progress += electron.userData.speed;
            if(electron.userData.progress > 1) electron.userData.progress -= 1;
            
            const t = electron.userData.progress;
            electron.position.lerpVectors(start, end, t);
        });
    }
    
    isValid() {
        return this.atom1.group.parent && this.atom2.group.parent;
    }
    
    remove() {
        this.scene.remove(this.mesh);
        this.electrons.forEach(e => this.scene.remove(e));
    }
}