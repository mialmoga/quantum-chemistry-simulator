/**
 * QuantumField.js
 *
 * The medium. Not a grid.
 *
 * A grid implies fixed resolution across all space.
 * This is different: the field only exists where perturbations are active.
 * Empty space costs nothing. Resolution is local to activity.
 *
 * A FieldNode is not a particle. It is a sample of the field at a point
 * that has enough amplitude to warrant computation. Below the amplitude
 * threshold, the point doesn't exist in memory — it's vacuum.
 *
 * The LOD idea from the brief:
 *   - Near a nucleus: many nodes, high resolution, full Chladni computation
 *   - Far from nucleus: fewer nodes, lower resolution, just amplitude envelope
 *   - True vacuum: no nodes, no computation, no memory
 *
 * Integration with the simulation:
 *   QuantumField runs ALONGSIDE the quark/hadron simulation.
 *   Hadrons provide their position and identity.
 *   QuantumField computes the orbital patterns around them.
 *   The electron "reveals itself" as the stable constructive zone
 *   in the Chladni pattern — not as an entity we place.
 */

import { FieldKernel } from './FieldKernel.js';

// ─── Amplitude threshold ──────────────────────────────────────────────────────
// Below this, a field node doesn't exist.
// Tunable: lower = more nodes = higher resolution = more expensive.
const AMPLITUDE_THRESHOLD = 0.05;

// ─── LOD levels ───────────────────────────────────────────────────────────────
const LOD = {
    // Within 2× atomic radius: full Chladni computation
    NEAR:   { multiplier: 1.0,  angularSamples: 16 },
    // 2-5× atomic radius: simplified radial only
    MID:    { multiplier: 2.0,  angularSamples: 6  },
    // Beyond 5×: just envelope, no angular structure
    FAR:    { multiplier: 5.0,  angularSamples: 1  },
};


// ─── FieldNode ────────────────────────────────────────────────────────────────

class FieldNode {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;

        // Superposition of all nuclear contributions at this point
        this.amplitude = 0;

        // Phase at this point (for spin/interference computation)
        this.phase = 0;

        // Which nucleus dominates at this point (for rendering)
        this.dominantNucleus = null;
        this.dominantStrength = 0;

        // Is this a constructive zone? (potential electron location)
        this.isConstructive = false;
    }
}


// ─── QuantumField ─────────────────────────────────────────────────────────────

export class QuantumField {

    /**
     * @param {Object} opts
     * @param {number} opts.baseResolution   Spacing between field samples (pm)
     *                                       Default: 10 pm (sub-atomic scale)
     */
    constructor(opts = {}) {
        this.baseResolution = opts.baseResolution ?? 10; // pm

        // Active field nodes — only where amplitude > threshold
        // Map from "x,y,z" key → FieldNode
        // This IS the field. Not a grid. A sparse set of active points.
        this._nodes = new Map();

        // Nuclear sources: hadrons/nuclei that drive the field
        // Each entry: { position, pattern, id }
        this._sources = [];

        // Simulation time (for phase computation)
        this._time = 0;

        // Cached constructive zones (potential electron positions)
        this._constructiveZones = [];

        // Stats
        this.stats = {
            activeNodes:       0,
            constructiveZones: 0,
            sources:           0,
        };
    }


    // ─── Source management ────────────────────────────────────────────────────

    /**
     * Register a nucleus as a field source.
     * The field will compute Chladni patterns around it.
     *
     * @param {Object} source
     * @param {string} source.id          Unique identifier (hadron.id)
     * @param {Object} source.position    {x, y, z} in world units (pm)
     * @param {Object} source.elementData Parsed element JSON
     */
    addSource(source) {
        const ω = FieldKernel.inferNuclearFrequency(source.elementData);
        const pattern = FieldKernel.computeOrbitalPattern(source.elementData, ω);

        this._sources.push({
            id:          source.id,
            position:    source.position,
            pattern,
            elementData: source.elementData,
        });
    }

    /**
     * Update a source's position (nucleus moved).
     * @param {string}        id
     * @param {Object}        position  {x, y, z}
     */
    updateSource(id, position) {
        const source = this._sources.find(s => s.id === id);
        if (source) source.position = position;
    }

    /**
     * Remove a source (nucleus destroyed or moved out of scope).
     * @param {string} id
     */
    removeSource(id) {
        this._sources = this._sources.filter(s => s.id !== id);
    }

    clearSources() {
        this._sources = [];
    }


    // ─── Field computation ────────────────────────────────────────────────────

    /**
     * Advance the field by one tick.
     * Recomputes active nodes around all sources.
     *
     * @param {number} dt
     */
    tick(dt) {
        this._time += dt;
        this._nodes.clear();
        this._constructiveZones = [];

        // For each source, sample the field in its local region
        for (const source of this._sources) {
            this._sampleAround(source);
        }

        // Find constructive interference zones between source pairs
        // (This is where molecular bonds emerge)
        for (let i = 0; i < this._sources.length; i++) {
            for (let j = i + 1; j < this._sources.length; j++) {
                const a = this._sources[i];
                const b = this._sources[j];

                const dist = Math.sqrt(
                    (b.position.x - a.position.x) ** 2 +
                    (b.position.y - a.position.y) ** 2 +
                    (b.position.z - a.position.z) ** 2
                );

                // Only compute if within van der Waals contact
                const maxRange = (a.pattern.r_vanderwaals + b.pattern.r_vanderwaals);
                if (dist > maxRange) continue;

                const zones = FieldKernel.findConstructiveZones(
                    a.position, a.pattern,
                    b.position, b.pattern,
                    this._time
                );

                for (const zone of zones) {
                    this._constructiveZones.push({
                        ...zone,
                        sourceA: a.id,
                        sourceB: b.id,
                        bondCharacter: FieldKernel.inferBondCharacter(
                            a.pattern, b.pattern
                        ),
                    });
                }
            }
        }

        // Update stats
        this.stats.activeNodes       = this._nodes.size;
        this.stats.constructiveZones = this._constructiveZones.length;
        this.stats.sources           = this._sources.length;
    }


    /**
     * Sample field points in the local region around a source.
     * Resolution adapts to distance (LOD).
     *
     * @param {Object} source
     */
    _sampleAround(source) {
        const { position, pattern } = source;
        const r_max = pattern.r_vanderwaals * 1.5; // sample out to 1.5× vdW radius
        const res   = this.baseResolution;

        // Sample on a sphere of radii at LOD-appropriate resolution
        const radii = this._lodRadii(pattern.r_atomic, r_max);

        for (const { radius, lod } of radii) {
            const angSamples = lod.angularSamples;

            for (let ti = 0; ti < angSamples; ti++) {
                const theta = (ti / angSamples) * Math.PI;

                for (let pi = 0; pi < angSamples * 2; pi++) {
                    const phi = (pi / (angSamples * 2)) * Math.PI * 2;

                    const x = position.x + radius * Math.sin(theta) * Math.cos(phi);
                    const y = position.y + radius * Math.sin(theta) * Math.sin(phi);
                    const z = position.z + radius * Math.cos(theta);

                    const amp = FieldKernel.evaluateField(
                        { x, y, z }, position, pattern, this._time
                    );

                    if (Math.abs(amp) < AMPLITUDE_THRESHOLD) continue;

                    const key  = this._key(x, y, z, res);
                    let   node = this._nodes.get(key);

                    if (!node) {
                        // Snap to grid resolution for deduplication
                        node = new FieldNode(
                            Math.round(x / res) * res,
                            Math.round(y / res) * res,
                            Math.round(z / res) * res,
                        );
                        this._nodes.set(key, node);
                    }

                    // Superposition: add this source's contribution
                    node.amplitude += amp;

                    // Track dominant source
                    if (Math.abs(amp) > node.dominantStrength) {
                        node.dominantStrength  = Math.abs(amp);
                        node.dominantNucleus   = source.id;
                    }
                }
            }
        }

        // Mark constructive nodes (where amplitude is stable and positive)
        for (const node of this._nodes.values()) {
            node.isConstructive = node.amplitude > AMPLITUDE_THRESHOLD * 2;
        }
    }


    /**
     * Generate radii to sample at, with LOD-appropriate density.
     * @param {number} r_atomic
     * @param {number} r_max
     * @returns {Array<{radius, lod}>}
     */
    _lodRadii(r_atomic, r_max) {
        const radii = [];
        const steps = 8; // number of radial shells to sample

        for (let i = 1; i <= steps; i++) {
            const radius = (i / steps) * r_max;
            const ratio  = radius / r_atomic;

            let lod;
            if      (ratio <= LOD.NEAR.multiplier) lod = LOD.NEAR;
            else if (ratio <= LOD.MID.multiplier)  lod = LOD.MID;
            else                                   lod = LOD.FAR;

            radii.push({ radius, lod });
        }

        return radii;
    }


    /**
     * Snap-to-grid key for deduplication at current resolution.
     */
    _key(x, y, z, res) {
        return `${Math.round(x/res)},${Math.round(y/res)},${Math.round(z/res)}`;
    }


    // ─── Read access for renderer ─────────────────────────────────────────────

    /**
     * Snapshot for the renderer — pure data, no live references.
     * @returns {Object}
     */
    snapshot() {
        const nodes = [];
        for (const node of this._nodes.values()) {
            nodes.push({
                x:               node.x,
                y:               node.y,
                z:               node.z,
                amplitude:       node.amplitude,
                isConstructive:  node.isConstructive,
                dominantNucleus: node.dominantNucleus,
            });
        }

        return {
            nodes,
            constructiveZones: [...this._constructiveZones],
            sources: this._sources.map(s => ({
                id:        s.id,
                position:  s.position,
                ω_nuclear: s.pattern.ω_nuclear,
                shells:    s.pattern.shells,
                symmetry:  s.pattern.dominantSymmetry,
            })),
            stats: { ...this.stats },
            time:  this._time,
        };
    }

    /**
     * Get orbital pattern for a specific source (for renderer LOD decisions).
     * @param {string} id
     * @returns {Object|null}
     */
    getPattern(id) {
        const source = this._sources.find(s => s.id === id);
        return source?.pattern ?? null;
    }

    /**
     * All active constructive zones — these are where electrons "are".
     * @returns {Object[]}
     */
    get constructiveZones() {
        return this._constructiveZones;
    }
}
