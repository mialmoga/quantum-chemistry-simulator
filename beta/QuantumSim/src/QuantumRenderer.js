/**
 * QuantumRenderer.js
 *
 * Representation layer. Reads snapshots. Never touches physics.
 *
 * Architecture:
 *   - ONE InstancedMesh for all quarks → single draw call regardless of count
 *   - ONE InstancedMesh for all hadron boundaries → single draw call
 *   - ShaderMaterial with per-instance color + tension via InstancedBufferAttribute
 *   - No per-quark Three.js objects. No Maps. Just arrays and offsets.
 *
 * Quark visual philosophy:
 *   A quark is a condition of space — a field with a gradient, not a surface.
 *   The shader computes a gaussian falloff from center: exp(-r² * sharpness)
 *   No hard edge. The field dissolves into space.
 *   Tension drives the field radius: high tension = expanded, bright, unstable.
 *   Confinement = contracted, dim, settled.
 *   Three overlapping fields in R+G+B → the overlap region approaches white.
 *   That whiteness IS the visual signal of confinement — no extra indicator needed.
 *
 * Compatible with Three.js r183.
 * Units: 1 world unit = 1 pm.
 */

import * as THREE from 'three';
import { COLOR } from './QuantumEntity.js';

// ─── Color charge → RGB vec3 (for shader) ────────────────────────────────────
const COLOR_RGB = {
    [COLOR.R]:      [1.00, 0.22, 0.22],
    [COLOR.G]:      [0.22, 1.00, 0.43],
    [COLOR.B]:      [0.22, 0.56, 1.00],
    [COLOR.ANTI_R]: [0.00, 0.80, 0.80],
    [COLOR.ANTI_G]: [0.80, 0.00, 0.80],
    [COLOR.ANTI_B]: [0.80, 0.80, 0.00],
};

// Hadron accent colors as vec3
const HADRON_RGB = {
    proton:    [0.53, 0.67, 1.00],
    neutron:   [0.67, 0.67, 0.67],
    'delta++': [1.00, 0.67, 0.00],
    'delta-':  [1.00, 0.27, 0.53],
    exotic:    [1.00, 0.00, 1.00],
};

// Max instances pre-allocated on GPU.
// Resize is expensive — allocate generously upfront.
const MAX_QUARKS  = 1024;
const MAX_HADRONS = 256;


// ─── Quark Field Shader ───────────────────────────────────────────────────────
// Vertex: standard instanced transform + pass UV and per-instance data to frag
// Fragment: gaussian field falloff — no hard edge, dissolves into space

const QUARK_VERT = /* glsl */`
    attribute vec3  iColor;     // color charge RGB
    attribute float iTension;   // [0..1] how unresolved this quark is
    attribute float iConfined;  // 0.0 = free, 1.0 = confined in hadron

    varying vec3  vColor;
    varying float vTension;
    varying float vConfined;
    varying vec2  vUv;

    void main() {
        vColor    = iColor;
        vTension  = iTension;
        vConfined = iConfined;
        vUv       = uv;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const QUARK_FRAG = /* glsl */`
    uniform float uTime;

    varying vec3  vColor;
    varying float vTension;
    varying float vConfined;
    varying vec2  vUv;

    void main() {
        // Distance from center of the sphere face [0..1]
        vec2  centered = vUv * 2.0 - 1.0;
        float r        = length(centered);

        // Gaussian field falloff.
        // sharpness: higher = tighter field, lower = more diffuse.
        // Tension expands the field: confined quarks are tight, free quarks bloom.
        float sharpness = mix(4.0, 1.8, vTension);
        float field     = exp(-r * r * sharpness);

        if (field < 0.01) discard;

        // Subtle pulsation on free (high-tension) quarks — they're unstable
        float pulse = 1.0;
        if (vTension > 0.5) {
            pulse = 1.0 + 0.15 * sin(uTime * 6.0 + vTension * 10.0);
        }

        // Core brighter, dissolves toward edges
        vec3 coreColor  = vColor * 1.8 * pulse;
        vec3 finalColor = mix(vec3(0.0), coreColor, field);

        // Confined quarks are calmer
        finalColor *= mix(1.0, 0.65, vConfined);

        float alpha = field * mix(0.95, 0.70, vConfined);

        gl_FragColor = vec4(finalColor, alpha);
    }
`;


// ─── Hadron Boundary Shader ───────────────────────────────────────────────────
// A soft shell — Fresnel rim visible at grazing angles, hollow inside

const HADRON_VERT = /* glsl */`
    attribute vec3  iColor;
    attribute float iStability;

    varying vec3  vColor;
    varying float vStability;
    varying vec3  vNormal;

    void main() {
        vColor     = iColor;
        vStability = iStability;

        // Extract rotation from instanceMatrix for correct normal transform
        mat3 normalMat = mat3(instanceMatrix);
        vNormal = normalize(normalMatrix * normalMat * normal);

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const HADRON_FRAG = /* glsl */`
    uniform float uTime;

    varying vec3  vColor;
    varying float vStability;
    varying vec3  vNormal;

    void main() {
        // Fresnel rim: visible at grazing angles, invisible face-on
        float rim = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
        rim = pow(rim, 2.5);

        float alpha = rim * 0.35 * vStability;
        if (alpha < 0.005) discard;

        // Subtle breathing when freshly formed
        float breathe = 1.0 + 0.08 * sin(uTime * 2.0) * (1.0 - vStability);

        gl_FragColor = vec4(vColor * 0.8 * breathe, alpha);
    }
`;


// ─── QuantumRenderer ──────────────────────────────────────────────────────────

export class QuantumRenderer {

    /**
     * @param {THREE.Scene} scene
     * @param {Object}      opts
     * @param {boolean}     opts.showHadronBounds
     * @param {boolean}     opts.showFreeQuarks
     */
    constructor(scene, opts = {}) {
        this.scene = scene;

        this.opts = {
            showHadronBounds: opts.showHadronBounds ?? true,
            showFreeQuarks:   opts.showFreeQuarks   ?? true,
        };

        this._time = 0;
        this._mtx  = new THREE.Matrix4(); // reusable — avoid per-frame allocation

        this._initQuarkInstances();
        this._initHadronInstances();
        this._setupLights();
    }


    // ─── Initialization ───────────────────────────────────────────────────────

    _initQuarkInstances() {
        const geo = new THREE.SphereGeometry(0.18, 16, 10);

        // Per-instance buffer attributes — written every frame from snapshot
        this._quarkColorAttr = new THREE.InstancedBufferAttribute(
            new Float32Array(MAX_QUARKS * 3), 3
        );
        this._quarkTensionAttr = new THREE.InstancedBufferAttribute(
            new Float32Array(MAX_QUARKS), 1
        );
        this._quarkConfinedAttr = new THREE.InstancedBufferAttribute(
            new Float32Array(MAX_QUARKS), 1
        );

        geo.setAttribute('iColor',    this._quarkColorAttr);
        geo.setAttribute('iTension',  this._quarkTensionAttr);
        geo.setAttribute('iConfined', this._quarkConfinedAttr);

        const mat = new THREE.ShaderMaterial({
            vertexShader:   QUARK_VERT,
            fragmentShader: QUARK_FRAG,
            uniforms: { uTime: { value: 0 } },
            transparent: true,
            depthWrite:  false,
            blending:    THREE.AdditiveBlending,
            side:        THREE.FrontSide,
        });

        this._quarkMesh = new THREE.InstancedMesh(geo, mat, MAX_QUARKS);
        this._quarkMesh.count = 0;
        this._quarkMesh.frustumCulled = false;
        this.scene.add(this._quarkMesh);
    }

    _initHadronInstances() {
        if (!this.opts.showHadronBounds) return;

        const geo = new THREE.SphereGeometry(0.5, 20, 14);

        this._hadronColorAttr = new THREE.InstancedBufferAttribute(
            new Float32Array(MAX_HADRONS * 3), 3
        );
        this._hadronStabilityAttr = new THREE.InstancedBufferAttribute(
            new Float32Array(MAX_HADRONS), 1
        );

        geo.setAttribute('iColor',     this._hadronColorAttr);
        geo.setAttribute('iStability', this._hadronStabilityAttr);

        const mat = new THREE.ShaderMaterial({
            vertexShader:   HADRON_VERT,
            fragmentShader: HADRON_FRAG,
            uniforms: { uTime: { value: 0 } },
            transparent: true,
            depthWrite:  false,
            blending:    THREE.AdditiveBlending,
            side:        THREE.BackSide,
        });

        this._hadronMesh = new THREE.InstancedMesh(geo, mat, MAX_HADRONS);
        this._hadronMesh.count = 0;
        this._hadronMesh.frustumCulled = false;
        this.scene.add(this._hadronMesh);
    }

    _setupLights() {
        // Minimal — shaders are self-luminous
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.1));
    }


    // ─── Main update ──────────────────────────────────────────────────────────

    /**
     * @param {Object} snapshot   Simulation.getSnapshot()
     * @param {number} dt         Frame delta for time uniform
     */
    update(snapshot, dt = 0.016) {
        this._time += dt;

        this._quarkMesh.material.uniforms.uTime.value = this._time;
        if (this._hadronMesh) {
            this._hadronMesh.material.uniforms.uTime.value = this._time;
        }

        this._updateQuarks(snapshot.entities, snapshot.hadrons);
        if (this.opts.showHadronBounds && this._hadronMesh) {
            this._updateHadrons(snapshot.hadrons);
        }
    }


    // ─── Quark instancing ─────────────────────────────────────────────────────

    _updateQuarks(entities, hadrons) {
        // Confined id set for iConfined attribute
        const confinedIds = new Set();
        for (const h of hadrons) {
            for (const q of h.quarks) confinedIds.add(q.id);
        }

        let idx = 0;

        for (const entity of entities) {
            const isFree = !confinedIds.has(entity.id);
            if (isFree && !this.opts.showFreeQuarks) continue;
            if (idx >= MAX_QUARKS) break;

            // Instance transform: position only (shader handles shape)
            this._mtx.setPosition(
                entity.position.x,
                entity.position.y,
                entity.position.z,
            );
            this._quarkMesh.setMatrixAt(idx, this._mtx);

            // Color
            const rgb = COLOR_RGB[entity.color] ?? [1, 1, 1];
            const ci  = idx * 3;
            this._quarkColorAttr.array[ci]     = rgb[0];
            this._quarkColorAttr.array[ci + 1] = rgb[1];
            this._quarkColorAttr.array[ci + 2] = rgb[2];

            // Tension + confined
            this._quarkTensionAttr.array[idx]  = entity.tension;
            this._quarkConfinedAttr.array[idx] = isFree ? 0.0 : 1.0;

            idx++;
        }

        this._quarkMesh.count = idx;
        this._quarkMesh.instanceMatrix.needsUpdate  = true;
        this._quarkColorAttr.needsUpdate    = true;
        this._quarkTensionAttr.needsUpdate  = true;
        this._quarkConfinedAttr.needsUpdate = true;
    }


    // ─── Hadron instancing ────────────────────────────────────────────────────

    _updateHadrons(hadrons) {
        let idx = 0;

        for (const hadron of hadrons) {
            if (idx >= MAX_HADRONS) break;

            this._mtx.setPosition(
                hadron.position.x,
                hadron.position.y,
                hadron.position.z,
            );
            this._hadronMesh.setMatrixAt(idx, this._mtx);

            const rgb = HADRON_RGB[hadron.identity] ?? HADRON_RGB.exotic;
            const ci  = idx * 3;
            this._hadronColorAttr.array[ci]     = rgb[0];
            this._hadronColorAttr.array[ci + 1] = rgb[1];
            this._hadronColorAttr.array[ci + 2] = rgb[2];

            this._hadronStabilityAttr.array[idx] = hadron.stable
                ? 1.0
                : hadron.age / hadron.settleTime;

            idx++;
        }

        this._hadronMesh.count = idx;
        this._hadronMesh.instanceMatrix.needsUpdate   = true;
        this._hadronColorAttr.needsUpdate     = true;
        this._hadronStabilityAttr.needsUpdate = true;
    }


    // ─── Dispose ──────────────────────────────────────────────────────────────

    dispose() {
        this._quarkMesh.geometry.dispose();
        this._quarkMesh.material.dispose();
        this.scene.remove(this._quarkMesh);

        if (this._hadronMesh) {
            this._hadronMesh.geometry.dispose();
            this._hadronMesh.material.dispose();
            this.scene.remove(this._hadronMesh);
        }
    }
}
