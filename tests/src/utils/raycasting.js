/**
 * raycasting.js
 * Utilities for raycasting and 3D position detection
 */

export function getWorldPosition(clientX, clientY, camera, scene) {
    const mouse = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Get point at camera's Z distance
    const distance = camera.position.z;
    const worldPosition = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(distance)
    );
    
    // Transform from world space to scene's local space
    const localPosition = scene.worldToLocal(worldPosition.clone());
    
    return localPosition;
}

export function findAtomAtPoint(mouseX, mouseY, camera, atoms) {
    const mouse = new THREE.Vector2(mouseX, mouseY);
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Collect all nucleus meshes
    const nucleusMeshes = [];
    atoms.forEach(atom => {
        if(atom.nucleus) {
            nucleusMeshes.push(atom.nucleus);
        }
    });
    
    // Intersect with meshes
    const intersects = raycaster.intersectObjects(nucleusMeshes);
    
    if(intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        return atoms.find(atom => atom.nucleus === intersectedMesh);
    }
    
    return null;
}
