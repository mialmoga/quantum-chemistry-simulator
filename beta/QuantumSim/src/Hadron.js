/**
 * Hadron.js
 *
 * A Hadron is not a particle. It is a recognition.
 *
 * When three quarks happen to form a color-neutral group —
 * R + G + B — the simulation recognizes that as a stable
 * configuration and creates a Hadron to track it.
 *
 * The Hadron does NOT tell quarks what to do.
 * The quarks form first. The Hadron notices.
 *
 * This is the key to emergent behavior:
 *   - No quark knows it's "in a proton"
 *   - The proton identity emerges from their collective state
 *   - The Hadron is a label we put on an already-existing condition
 *
 * Hadron classification emerges from quark content:
 *   uud → charge = 2/3 + 2/3 - 1/3 = +1 → Proton
 *   udd → charge = 2/3 - 1/3 - 1/3 =  0 → Neutron
 *
 * We don't hardcode "proton = uud". We compute charge and recognize it.
 *
 * Units: positions in pm (wu), compatible with Three.js r183
 */

import * as THREE from 'three';
import { FLAVOR } from './QuantumEntity.js';

// ─── Hadron Classification ────────────────────────────────────────────────────

/**
 * Classify a hadron by the total electric charge of its quarks.
 * Charge emerges from flavor content — not from any hardcoded rule.
 */
function classifyHadron(quarks) {
    const totalCharge = quarks.reduce((sum, q) => sum + q.charge, 0);

    // Round to avoid floating point noise (e.g. 0.9999... → 1)
    const charge = Math.round(totalCharge * 3) / 3;

    const flavors = quarks.map(q => q.flavor).sort().join('');

    return {
        charge,
        // Identity recognized from charge (the only externally observable thing)
        identity: charge === 1  ? 'proton'
                : charge === 0  ? 'neutron'
                : charge === 2  ? 'delta++'
                : charge === -1 ? 'delta-'
                : 'exotic',
        // Flavor content (for display/debug — not used in physics)
        flavors,
        // Isospin: relates proton and neutron as two states of same particle
        isospin: flavors.includes(FLAVOR.UP)
            ? (flavors.split('').filter(f => f === FLAVOR.UP).length - 1) * 0.5
            : -0.5,
    };
}


// ─── Nuclear Force (Residual Color Force) ─────────────────────────────────────
// This is what holds the nucleus together.
// A proton is color-neutral, but it still has a residual color field
// that leaks out — mediated by virtual pion exchange in real QCD.
// Here: we model it as a short-range Yukawa-like potential between hadrons.

const NUCLEAR_PARAMS = {
    // Range of residual force (Yukawa range ~ 1-2 fm = 1-2 pm in our units)
    RANGE:     1.5,
    // Strength of attraction between nucleons
    STRENGTH:  0.3,
    // Hard core repulsion: nucleons can't overlap
    CORE:      0.8,
    CORE_REPULSION: 6.0,
};


// ─── Hadron ───────────────────────────────────────────────────────────────────

export class Hadron {

    /**
     * @param {QuantumEntity[]} quarks   The three quarks that form this hadron.
     *                                   They must already be color-neutral.
     */
    constructor(quarks) {
        this.id     = Hadron._nextId++;
        this.quarks = quarks;

        // Tell each quark it belongs here
        for (const q of quarks) {
            q.hadron = this;
        }

        // Classify from emergent properties
        const classification = classifyHadron(quarks);
        this.charge   = classification.charge;
        this.identity = classification.identity;
        this.flavors  = classification.flavors;
        this.isospin  = classification.isospin;

        // Stability tracking
        this.age         = 0;       // ticks since formation
        this.stable      = false;   // becomes true after settling period
        this.settleTime  = 30;      // ticks to wait before declaring stable

        // Spin: sum of quark spins (half-integer for baryons)
        this.spin = quarks.reduce((sum, q) => sum + q.spin, 0);
    }

    static _nextId = 0;

    // ─── Center of mass ───────────────────────────────────────────────────────

    /**
     * Position of this hadron's center of mass.
     * Computed from quark positions — not stored separately.
     * The hadron has no position of its own, only its quarks do.
     * @returns {THREE.Vector3}
     */
    get position() {
        const com = new THREE.Vector3();
        let totalMass = 0;

        for (const q of this.quarks) {
            com.addScaledVector(q.position, q.mass);
            totalMass += q.mass;
        }

        return com.divideScalar(totalMass);
    }

    /**
     * Total mass = sum of constituent quark masses.
     * (In real QCD, most of the proton mass comes from gluon field energy,
     * but for our purposes the quark mass ratio is what matters.)
     * @returns {number}
     */
    get mass() {
        return this.quarks.reduce((sum, q) => sum + q.mass, 0);
    }

    // ─── Integrity check ──────────────────────────────────────────────────────

    /**
     * Check if the quarks still form a valid color-neutral group.
     * If quarks have drifted apart, the hadron should dissolve.
     * @returns {boolean}
     */
    isIntact() {
        // All quarks must still be within field range of each other
        for (let i = 0; i < this.quarks.length; i++) {
            for (let j = i + 1; j < this.quarks.length; j++) {
                if (!this.quarks[i].inFieldOf(this.quarks[j])) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Dissolve this hadron: release quarks back to free state.
     * Called when isIntact() returns false.
     */
    dissolve() {
        for (const q of this.quarks) {
            q.hadron  = null;
            q.tension = 1.0;
        }
    }

    // ─── Per-tick update ──────────────────────────────────────────────────────

    tick() {
        this.age++;
        if (this.age >= this.settleTime && !this.stable) {
            this.stable = true;
        }
    }


    // ─── Nuclear force between hadrons ────────────────────────────────────────

    /**
     * Apply residual color force (nuclear force) between two hadrons.
     * This is what holds nuclei together.
     *
     * Modeled as Yukawa potential: attractive at medium range (1-2 pm),
     * strongly repulsive at short range (hard core, < 0.8 pm).
     *
     * The force is applied to the quarks directly — the hadron has
     * no position of its own to push.
     *
     * @param {Hadron} a
     * @param {Hadron} b
     */
    static applyNuclearForce(a, b) {
        const posA = a.position;
        const posB = b.position;

        const delta = new THREE.Vector3().subVectors(posB, posA);
        const dist  = delta.length();

        if (dist < 1e-6 || dist > NUCLEAR_PARAMS.RANGE) return;

        const dir = delta.clone().divideScalar(dist);

        let magnitude;

        if (dist < NUCLEAR_PARAMS.CORE) {
            // Hard core repulsion — nucleons don't overlap
            magnitude = -NUCLEAR_PARAMS.CORE_REPULSION
                * (NUCLEAR_PARAMS.CORE - dist);
        } else {
            // Yukawa-like attraction: peaks around 1 fm, fades quickly
            // f(r) = -S * exp(-r/R) / r
            magnitude = NUCLEAR_PARAMS.STRENGTH
                * Math.exp(-dist / NUCLEAR_PARAMS.RANGE)
                / dist;
        }

        // Distribute force across quarks proportionally to mass
        // (The hadron has no body — only its quarks do)
        for (const q of a.quarks) {
            const fraction = q.mass / a.mass;
            q.applyForce(dir.clone().multiplyScalar(-magnitude * fraction));
        }

        for (const q of b.quarks) {
            const fraction = q.mass / b.mass;
            q.applyForce(dir.clone().multiplyScalar(magnitude * fraction));
        }
    }


    // ─── Snapshot for renderer ────────────────────────────────────────────────

    /**
     * State snapshot for the representation layer.
     * The renderer reads this — never touches the hadron directly.
     */
    snapshot() {
        return {
            id:       this.id,
            identity: this.identity,
            charge:   this.charge,
            flavors:  this.flavors,
            spin:     this.spin,
            isospin:  this.isospin,
            mass:     this.mass,
            stable:   this.stable,
            age:      this.age,
            position: this.position,
            quarks:   this.quarks.map(q => q.snapshot()),
        };
    }

    toString() {
        return `[${this.identity.toUpperCase()} #${this.id} | q=${
            this.charge > 0 ? '+' : ''}${this.charge.toFixed(2)} | ${
            this.flavors} | age=${this.age}]`;
    }
}
