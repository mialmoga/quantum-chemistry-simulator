/**
 * QuantumEntity.js
 * 
 * The fundamental unit of the simulation.
 * 
 * A QuantumEntity is NOT a particle in the classical sense.
 * It is a condition of space — a region with properties that
 * demand resolution through interaction with neighboring conditions.
 * 
 * Philosophy:
 *   - Behavior lives here. Representation lives elsewhere.
 *   - An entity only "knows" what is within its field radius.
 *   - Gluons are not entities — they are the consequence of
 *     two color fields overlapping. That computation happens
 *     in ColorField.js, not here.
 * 
 * Units: 1 world unit = 1 picometer (pm)
 * Compatible with Three.js r183
 */

import * as THREE from 'three';

// ─── Color Charge Constants ───────────────────────────────────────────────────
// The three color charges of QCD. Not colors — names borrowed from optics.
// R + G + B = color-neutral (white). That neutrality is what binds quarks.
export const COLOR = Object.freeze({
    R: 'R',   // Red
    G: 'G',   // Green
    B: 'B',   // Blue
    // Anticolors for antiquarks (future use)
    ANTI_R: 'AR',
    ANTI_G: 'AG',
    ANTI_B: 'AB',
});

// ─── Flavor Constants ─────────────────────────────────────────────────────────
// Quark flavors. For nuclear physics we only need up and down.
// The others exist in the constant space for completeness — not yet simulated.
export const FLAVOR = Object.freeze({
    UP:      'u',   // charge +2/3 — found in protons (uud) and neutrons (udd)
    DOWN:    'd',   // charge -1/3
    // Reserved — not simulated at this layer:
    // STRANGE, CHARM, BOTTOM, TOP
});

// ─── Spin Constants ───────────────────────────────────────────────────────────
export const SPIN = Object.freeze({
    UP:   +0.5,
    DOWN: -0.5,
});

// ─── Entity Types ─────────────────────────────────────────────────────────────
export const ENTITY_TYPE = Object.freeze({
    QUARK: 'quark',
    // ANTIQUARK: 'antiquark',  // future
    // LEPTON: 'lepton',        // future — the electron reveals itself later
});


// ─── QuantumEntity ────────────────────────────────────────────────────────────

export class QuantumEntity {

    /**
     * @param {Object} opts
     * @param {THREE.Vector3} opts.position     Initial position in world units (pm)
     * @param {string}        opts.type         ENTITY_TYPE constant
     * @param {string}        opts.flavor       FLAVOR constant
     * @param {string}        opts.color        COLOR constant
     * @param {number}        opts.spin         SPIN constant
     */
    constructor(opts) {
        // ── Identity ────────────────────────────────────────────────────────
        this.id      = QuantumEntity._nextId++;
        this.type    = opts.type;

        // ── Quantum numbers (the "signature" of this condition of space) ────
        this.flavor  = opts.flavor;
        this.color   = opts.color;
        this.spin    = opts.spin;

        // Derived: electric charge from flavor
        this.charge  = QuantumEntity._chargeFromFlavor(opts.flavor);

        // ── Spatial state ───────────────────────────────────────────────────
        // Position in pm (world units). Use THREE.Vector3 for Three.js compat.
        this.position = opts.position
            ? opts.position.clone()
            : new THREE.Vector3();

        // Velocity in pm/step. Starts at rest.
        this.velocity = new THREE.Vector3();

        // Accumulated force this step. Reset each tick before force computation.
        this._force   = new THREE.Vector3();

        // ── Field ───────────────────────────────────────────────────────────
        // The radius (in pm) within which this entity perceives and affects others.
        // A quark's color field extends ~0.8 pm (roughly hadronic scale).
        // Outside this radius: entity is invisible to this quark. No O(n²).
        this.fieldRadius = QuantumEntity.FIELD_RADIUS_DEFAULT;

        // ── Tension ─────────────────────────────────────────────────────────
        // A scalar [0..1] expressing how "unresolved" this entity is.
        // - tension = 1.0 → fully isolated, maximum pull toward complementary colors
        // - tension = 0.0 → fully confined in a color-neutral group, stable
        // Computed each tick by ColorField based on neighbors.
        this.tension = 1.0;

        // ── Confinement ─────────────────────────────────────────────────────
        // Reference to the hadron this quark is currently bound to, if any.
        // null = free (high energy state — unstable).
        this.hadron  = null;

        // ── Mass ────────────────────────────────────────────────────────────
        // Bare quark mass in MeV/c² mapped to simulation mass units.
        // We use relative mass — absolute values don't matter for emergence,
        // only the ratios do (down quark is ~2x heavier than up).
        this.mass = QuantumEntity._massFromFlavor(opts.flavor);
    }

    // ─── Static defaults ──────────────────────────────────────────────────────

    // Hadronic scale: ~0.8 pm is roughly 1 femtometer in real QCD.
    // In our 1pm = 1wu mapping this is our interaction radius.
    static FIELD_RADIUS_DEFAULT = 0.8;

    // ─── Internal ID counter ──────────────────────────────────────────────────
    static _nextId = 0;

    // ─── Derived property helpers ─────────────────────────────────────────────

    static _chargeFromFlavor(flavor) {
        switch (flavor) {
            case FLAVOR.UP:   return  2/3;
            case FLAVOR.DOWN: return -1/3;
            default:          return  0;
        }
    }

    static _massFromFlavor(flavor) {
        // Relative units. Real bare masses: u ≈ 2.2 MeV, d ≈ 4.7 MeV
        // We normalize to up quark = 1.0
        switch (flavor) {
            case FLAVOR.UP:   return 1.0;
            case FLAVOR.DOWN: return 2.1;
            default:          return 1.0;
        }
    }

    // ─── Per-tick lifecycle ───────────────────────────────────────────────────

    /**
     * Reset accumulated force before each physics step.
     * Called by the simulation loop at the start of each tick.
     */
    resetForce() {
        this._force.set(0, 0, 0);
    }

    /**
     * Accumulate a force vector onto this entity.
     * Forces are summed from all local interactions this tick.
     * @param {THREE.Vector3} f
     */
    applyForce(f) {
        this._force.add(f);
    }

    /**
     * Integrate: advance position and velocity by one timestep.
     * Simple symplectic Euler — good enough at this scale.
     * @param {number} dt  Timestep in simulation units
     */
    integrate(dt) {
        // a = F / m
        const acceleration = this._force.clone().divideScalar(this.mass);

        // v += a * dt
        this.velocity.addScaledVector(acceleration, dt);

        // x += v * dt
        this.position.addScaledVector(this.velocity, dt);

        // Velocity damping — models energy dissipation in the color field.
        // Without this, quarks oscillate forever. Real QCD has this implicitly.
        this.velocity.multiplyScalar(QuantumEntity.DAMPING);
    }

    // Damping per tick: 0.92 means 8% energy loss per step.
    // Tunable — lower = faster confinement, higher = more oscillation.
    static DAMPING = 0.92;

    // ─── Queries ──────────────────────────────────────────────────────────────

    /**
     * Is this entity within field interaction range of another?
     * This is the ONLY locality check. If false, they don't interact. Period.
     * @param {QuantumEntity} other
     * @returns {boolean}
     */
    inFieldOf(other) {
        const combinedRadius = this.fieldRadius + other.fieldRadius;
        return this.position.distanceToSquared(other.position)
            <= combinedRadius * combinedRadius;
    }

    /**
     * Distance to another entity in world units (pm).
     * @param {QuantumEntity} other
     * @returns {number}
     */
    distanceTo(other) {
        return this.position.distanceTo(other.position);
    }

    /**
     * Whether this quark is part of a color-neutral group (confined).
     * @returns {boolean}
     */
    get isConfined() {
        return this.hadron !== null && this.tension < 0.05;
    }

    /**
     * Snapshot of this entity's state for the renderer.
     * The renderer never touches the entity directly — it reads this.
     * Behavior ≠ Representation.
     * @returns {Object}
     */
    snapshot() {
        return {
            id:       this.id,
            type:     this.type,
            flavor:   this.flavor,
            color:    this.color,
            spin:     this.spin,
            charge:   this.charge,
            mass:     this.mass,
            tension:  this.tension,
            confined: this.isConfined,
            hadron:   this.hadron?.id ?? null,
            position: this.position.clone(),
            velocity: this.velocity.clone(),
        };
    }

    toString() {
        return `[${this.type}:${this.flavor}|${this.color}|spin${this.spin > 0 ? '+' : '-'} @(${
            this.position.x.toFixed(2)},${
            this.position.y.toFixed(2)},${
            this.position.z.toFixed(2)}) t=${this.tension.toFixed(3)}]`;
    }
}
