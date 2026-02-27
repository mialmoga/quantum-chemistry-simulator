/**
 * Bond.js — XPBD puro
 *
 * ARQUITECTURA:
 *   - Sin spring (F = k*Δx). Los springs acumulan energía y resuenan.
 *   - XPBD de distancia: corrige posiciones directamente cada frame.
 *   - targetDist se mide de la posición inicial real, no de radios estimados.
 *   - Esto garantiza que la molécula nace y se queda en su geometría.
 */

export const BOND_TYPES = {
    COVALENT:  { name: 'Covalente',       deltaX: [0,   0.5], color: 0xaaaaaa, emissive: 0x444444, electronColor: 0x00ffff, speed: 0.012, opacity: 0.50, glowIntensity: 0.15, glowColor: 0x888888 },
    POLAR:     { name: 'Polar Covalente', deltaX: [0.5, 1.7], color: 0x88aaff, emissive: 0x2244aa, electronColor: 0x4488ff, speed: 0.015, opacity: 0.55, glowIntensity: 0.30, glowColor: 0x4466ff },
    IONIC:     { name: 'Iónico',          deltaX: [1.7, 99 ], color: 0xffaa22, emissive: 0xaa5500, electronColor: 0xffdd00, speed: 0.008, opacity: 0.65, glowIntensity: 0.60, glowColor: 0xff8800 },
    METALLIC:  { name: 'Metálico',        deltaX: null,       color: 0xdddddd, emissive: 0x888888, electronColor: 0xffffff, speed: 0.020, opacity: 0.30, glowIntensity: 0.08, glowColor: 0xaaaaaa },
    CRYSTAL:   { name: 'Cristalino',      deltaX: null,       color: 0x66ccff, emissive: 0x224466, electronColor: 0x88eeff, speed: 0.006, opacity: 0.45, glowIntensity: 0.20, glowColor: 0x44aaff },
};

function getBondType(atom1, atom2) {
    const el1 = atom1.element;
    const el2 = atom2.element;
    const isMetallic = el1 && el2 &&
        el1.electronegativity && el1.electronegativity < 2.0 &&
        el2.electronegativity && el2.electronegativity < 2.0 &&
        el1 === el2;
    if(isMetallic) return BOND_TYPES.METALLIC;
    if(el1?.electronegativity && el2?.electronegativity) {
        const delta = Math.abs(el1.electronegativity - el2.electronegativity);
        if(delta >= 1.7) return BOND_TYPES.IONIC;
        if(delta >= 0.5) return BOND_TYPES.POLAR;
        return BOND_TYPES.COVALENT;
    }
    return BOND_TYPES.COVALENT;
}

export class Bond {
    constructor(atom1, atom2, scene) {
        this.atom1 = atom1;
        this.atom2 = atom2;
        this.scene = scene;
        this.isCrystalBond = false;
        this.visible = window.getBondsVisibilityState ? window.getBondsVisibilityState() : true;
        this.bondType = getBondType(atom1, atom2);
        this._eData = [];

        // targetDist: distancia real en el momento de creación del enlace.
        // Es la fuente de verdad — no depende de tablas de radios.
        this.targetDist = atom1.group.position.distanceTo(atom2.group.position);

        // Clamp a rango razonable por si se crea entre átomos muy lejos/cerca
        this.targetDist = Math.max(0.3, Math.min(8.0, this.targetDist));

        // Stiffness XPBD: 1.0 = completamente rígido, 0.0 = sin restricción
        // 0.8 es rígido pero deja algo de flexibilidad natural
        this.stiffness = 0.8;

        atom1.consumeValenceElectrons(1);
        atom2.consumeValenceElectrons(1);
        atom1.bonds.push(this);
        atom2.bonds.push(this);
    }

    /**
     * XPBD de distancia — corrige posiciones para mantener targetDist.
     *
     * Matemática:
     *   error = currentDist - targetDist
     *   Mover atom1 y atom2 simétricamente (mitad cada uno si masas iguales)
     *   corrección = error * stiffness * 0.5 en la dirección del enlace
     */
    update() {
        const p1 = this.atom1.group.position;
        const p2 = this.atom2.group.position;

        const dir = new THREE.Vector3().subVectors(p2, p1);
        const currentDist = dir.length();
        if(currentDist < 0.001) return;

        const error = currentDist - this.targetDist;
        if(Math.abs(error) < 0.0001) return;

        // Pesos inversos de masa (átomos más pesados se mueven menos)
        const m1 = this.atom1.element?.mass || 1.0;
        const m2 = this.atom2.element?.mass || 1.0;
        const w1 = 1.0 / m1;
        const w2 = 1.0 / m2;
        const wSum = w1 + w2;
        if(wSum < 0.0001) return;

        // Corrección total a distribuir
        const correction = dir.normalize().multiplyScalar(error * this.stiffness);

        if(!this.atom1.frozen) {
            p1.addScaledVector(correction,  w1 / wSum);
        }
        if(!this.atom2.frozen) {
            p2.addScaledVector(correction, -w2 / wSum);
        }

        // Amortiguación de velocidad relativa en la dirección del enlace
        // Evita que la energía de corrección se acumule como velocidad
        const v1 = this.atom1.velocity;
        const v2 = this.atom2.velocity;
        const relVel = new THREE.Vector3().subVectors(v2, v1);
        const relVelAlongBond = relVel.dot(dir); // dir ya normalizado arriba
        const dampingFactor = 0.1;
        const dampImpulse = dir.clone().multiplyScalar(relVelAlongBond * dampingFactor);
        if(!this.atom1.frozen) v1.add(dampImpulse.clone().multiplyScalar( w1 / wSum));
        if(!this.atom2.frozen) v2.add(dampImpulse.clone().multiplyScalar(-w2 / wSum));
    }

    setCrystalType() {
        this.isCrystalBond = true;
        this.bondType = BOND_TYPES.CRYSTAL;
    }

    isValid() {
        return this.atom1.group.parent && this.atom2.group.parent;
    }

    remove() {
        this.atom1.bonds = this.atom1.bonds.filter(b => b !== this);
        this.atom2.bonds = this.atom2.bonds.filter(b => b !== this);
    }
}
