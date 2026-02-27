/**
 * BondAngleConstraints.js — XPBD angular con velocity damping
 *
 * PRINCIPIO:
 *   - Corrige posiciones post-integración (no fuerzas)
 *   - Amortigua la velocidad en la dirección de corrección
 *     para evitar que la energía de corrección se acumule como cinética
 *   - Sin damping → el ángulo se corrige pero la velocidad acumulada
 *     lo vuelve a deformar → aleteo
 */

const DEG = Math.PI / 180;

export function applyBondAngleConstraints(centerAtom, strength = 0.5) {
    const bonds = centerAtom.bonds;
    if(bonds.length < 2 || bonds.length > 6) return;

    const el    = centerAtom.element;
    const ideal = el?.ideal_bond_angle || _defaultAngle(bonds.length);

    // Stiffness según número de vecinos
    // Más suave para estructuras grandes — cristales solo con factor mínimo
    const stiffness = bonds.length <= 2 ? strength * 0.6
                    : bonds.length <= 4 ? strength * 0.4
                    : strength * 0.15;

    const targetRad = ideal * DEG;
    const center    = centerAtom.group.position;

    for(let i = 0; i < bonds.length; i++) {
        for(let j = i + 1; j < bonds.length; j++) {
            const a1 = bonds[i].atom1 === centerAtom ? bonds[i].atom2 : bonds[i].atom1;
            const a2 = bonds[j].atom1 === centerAtom ? bonds[j].atom2 : bonds[j].atom1;
            if(a1.frozen && a2.frozen) continue;

            const r1 = new THREE.Vector3().subVectors(a1.group.position, center);
            const r2 = new THREE.Vector3().subVectors(a2.group.position, center);
            const len1 = r1.length();
            const len2 = r2.length();
            if(len1 < 0.01 || len2 < 0.01) continue;

            const d1  = r1.clone().divideScalar(len1);
            const d2  = r2.clone().divideScalar(len2);
            const dot = THREE.MathUtils.clamp(d1.dot(d2), -1, 1);

            // Octaédrico: no corregir pares opuestos (ya están a 180°)
            if(bonds.length === 6 && dot < -0.7) continue;

            const currentAngle = Math.acos(dot);
            const error        = currentAngle - targetRad;
            if(Math.abs(error) < 0.005) continue; // ~0.3° — ignorar ruido

            const axis = new THREE.Vector3().crossVectors(d1, d2);
            if(axis.lengthSq() < 0.0001) continue;
            axis.normalize();

            // Corrección angular — clamp para evitar saltos grandes
            const half = THREE.MathUtils.clamp(
                error * stiffness * 0.5,
                -0.10, 0.10
            );

            // ── Corrección de posición ──────────────────────────────────────
            if(!a1.frozen) {
                a1.group.position.copy(center).add(
                    r1.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, -half))
                );
            }
            if(!a2.frozen) {
                a2.group.position.copy(center).add(
                    r2.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis,  half))
                );
            }

            // ── Velocity damping en dirección de corrección ─────────────────
            // Sin esto, la corrección de posición inyecta energía cinética
            // que en el siguiente frame vuelve a deformar el ángulo → aleteo
            const VDAMP = 0.05;
            const perpAxis = axis; // eje de rotación = dirección de corrección angular

            if(!a1.frozen && a1.velocity) {
                const vProj = a1.velocity.dot(perpAxis);
                a1.velocity.addScaledVector(perpAxis, -vProj * VDAMP);
            }
            if(!a2.frozen && a2.velocity) {
                const vProj = a2.velocity.dot(perpAxis);
                a2.velocity.addScaledVector(perpAxis, -vProj * VDAMP);
            }
        }
    }
}

function _defaultAngle(n) {
    switch(n) {
        case 2: return 180;
        case 3: return 120;
        case 4: return 109.5;
        case 5: return 90;
        case 6: return 90;
        default: return 120;
    }
}
