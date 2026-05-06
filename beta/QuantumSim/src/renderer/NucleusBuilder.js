/**
 * NucleusBuilder.js — Construcción del núcleo atómico
 * =====================================================
 * Genera los Points de protones y neutrones.
 * Separado del renderer principal para mantenibilidad.
 */

import * as THREE from 'three';
import { NUCLEUS_VERT, NUCLEUS_FRAG } from './shaders.js';

export class NucleusBuilder {

    /**
     * @param {boolean} isMobile
     * @param {THREE.Material[]} materialsRef — array del renderer para tick de uTime
     */
    constructor(isMobile, materialsRef) {
        this._isMobile    = isMobile;
        this._materialsRef = materialsRef;
    }

    /**
     * Construye el grupo del núcleo y lo retorna.
     * El caller es responsable de añadirlo a la escena.
     *
     * @param {Object} meta — datos del elemento (ElementLoader)
     * @param {THREE.Group} group — grupo existente a reutilizar (se limpia primero)
     * @returns {THREE.Group}
     */
    build(meta, group) {
        this._clear(group);

        const identity = meta.identity ?? {};
        const z        = identity.number ?? 1;
        const mass     = Math.round(meta.physical_properties?.mass ?? z * 2);
        const nCount   = Math.max(0, mass - z);

        // Escala nuclear honesta en proporción:
        // r_nuclear real ∝ A^(1/3) en fm — ~100,000× más pequeño que el átomo.
        // Aquí mantenemos la proporción relativa entre elementos pero hacemos
        // el núcleo visualmente minúsculo para reflejar esa realidad física:
        //   H  (A~1)   → ~0.5wu
        //   Fe (A~56)  → ~0.7wu
        //   Og (A~295) → ~1.0wu  (tope máximo)
        const rMax = Math.min(0.3 + Math.pow(z + nCount, 1 / 3) * 0.08, 1.0);
        const size = this._isMobile ? 3 : 2;  // puntos pequeños — el núcleo es diminuto

        const pMesh = this._mkPoints(z,      0xff3344, 0, rMax, size); // protones
        const nMesh = this._mkPoints(nCount, 0x00f5ff, 1, rMax, size); // neutrones

        group.add(pMesh, nMesh);
        return group;
    }

    // ── Privados ──────────────────────────────────────────────────────────────

    _mkPoints(count, color, type, rMax, size) {
        if (count <= 0) return new THREE.Object3D();

        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count * 3; i += 3) {
            const r     = rMax * Math.pow(Math.random(), 0.75);
            const phi   = Math.acos(Math.random() * 2 - 1);
            const theta = Math.random() * Math.PI * 2;
            pos[i]     = r * Math.sin(phi) * Math.cos(theta);
            pos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i + 2] = r * Math.cos(phi);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime:  { value: 0 },
                uColor: { value: new THREE.Color(color) },
                uType:  { value: type },
                uSize:  { value: size },
            },
            vertexShader:   NUCLEUS_VERT,
            fragmentShader: NUCLEUS_FRAG,
            transparent:    true,
            blending:       THREE.AdditiveBlending,
            depthWrite:     false,
            depthTest:      false,
            toneMapped:     false,
        });

        this._materialsRef.push(mat);

        const pts = new THREE.Points(geo, mat);
        pts.isPoints = true;
        return pts;
    }

    _clear(group) {
        while (group.children.length > 0) {
            const c = group.children[0];
            c.geometry?.dispose();
            c.material?.dispose();
            group.remove(c);
        }
    }
}
