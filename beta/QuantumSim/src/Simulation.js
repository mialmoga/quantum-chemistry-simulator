/**
 * Simulation.js
 *
 * Main loop. Now orchestrates two parallel layers:
 *
 *   LAYER 1 — Quark/Hadron (entities with forces)
 *     ColorField → NuclearForce → Integrate → DetectHadrons
 *
 *   LAYER 2 — QuantumField (the medium, perturbation-based)
 *     Syncs sources from stable hadrons → ticks field → finds Chladni zones
 *     The electron reveals itself here as a constructive interference pattern.
 *
 * The two layers are decoupled:
 *   - Layer 1 tells Layer 2 where stable nuclei are and what element they are
 *   - Layer 2 computes the field around them independently
 *   - Neither layer knows about rendering
 *
 * Loop order:
 *   1.  resetForce
 *   2.  ColorField.resolve         (quark-quark color forces)
 *   3.  NuclearForce               (hadron-hadron residual)
 *   4.  integrate
 *   5.  detectHadrons
 *   6.  cleanupHadrons
 *   7.  syncFieldSources           ← new: stable hadrons → QuantumField
 *   8.  QuantumField.tick          ← new: Chladni computation
 *   9.  updateStats
 *   10. snapshot                   ← includes field snapshot
 */

import { ColorField }   from './ColorField.js';
import { Hadron }       from './Hadron.js';
import { QuantumField } from './QuantumField.js';

// Element data registry — loaded lazily from /src/elements/
// Key: atomic number (Z), Value: parsed element JSON
const _elementCache = new Map();

export class Simulation {

    /**
     * @param {Object} opts
     * @param {number} opts.dt               Timestep (default 0.016)
     * @param {boolean} opts.enableField     Enable QuantumField layer (default true)
     * @param {number} opts.fieldResolution  Field sampling resolution in pm (default 10)
     * @param {Function} opts.loadElement    Async fn(Z) → elementData JSON
     *                                       If not provided, field layer is disabled
     *                                       until elements are registered manually.
     */
    constructor(opts = {}) {
        this.entities  = [];
        this.hadrons   = [];
        this.tick      = 0;
        this.dt        = opts.dt ?? 0.016;
        this.paused    = false;
        this.onSnapshot = opts.onSnapshot ?? null;

        // ── QuantumField layer ───────────────────────────────────────────────
        this.fieldEnabled = opts.enableField ?? true;
        this._field = this.fieldEnabled
            ? new QuantumField({ baseResolution: opts.fieldResolution ?? 10 })
            : null;

        // Optional element loader: async fn(Z) → elementData
        // If provided, elements are loaded automatically when hadrons stabilize.
        this._loadElement = opts.loadElement ?? null;

        // Track which hadron ids are currently registered as field sources
        // so we don't re-register on every tick
        this._fieldSourceIds = new Set();

        // Stats
        this.stats = {
            entities:          0,
            hadrons:           0,
            protons:           0,
            neutrons:          0,
            freeQuarks:        0,
            fieldNodes:        0,
            constructiveZones: 0,
            tick:              0,
        };
    }


    // ─── Element registry ─────────────────────────────────────────────────────

    /**
     * Manually register element data for a given atomic number.
     * Use this if you're not providing a loadElement callback.
     *
     * @param {number} Z           Atomic number (protons)
     * @param {Object} elementData Parsed element JSON
     */
    registerElement(Z, elementData) {
        _elementCache.set(Z, elementData);
    }

    /**
     * Get element data for Z protons. Returns null if not yet loaded.
     * @param {number} Z
     * @returns {Object|null}
     */
    _getElement(Z) {
        return _elementCache.get(Z) ?? null;
    }


    // ─── Entity management ────────────────────────────────────────────────────

    add(entity) {
        this.entities.push(entity);
        return this;
    }

    remove(entity) {
        if (entity.hadron) this._dissolveHadron(entity.hadron);
        this.entities = this.entities.filter(e => e !== entity);
    }

    clear() {
        this.entities = [];
        this.hadrons  = [];
        if (this._field) {
            this._field.clearSources();
            this._fieldSourceIds.clear();
        }
    }


    // ─── Main loop ────────────────────────────────────────────────────────────

    step() {
        if (this.paused) return;

        // 1. Reset forces
        for (const e of this.entities) e.resetForce();

        // 2. Color forces
        ColorField.resolve(this.entities);

        // 3. Nuclear force between stable hadrons
        for (let i = 0; i < this.hadrons.length; i++) {
            for (let j = i + 1; j < this.hadrons.length; j++) {
                Hadron.applyNuclearForce(this.hadrons[i], this.hadrons[j]);
            }
        }

        // 4. Integrate
        for (const e of this.entities) e.integrate(this.dt);

        // 5. Detect new hadrons
        this._detectHadrons();

        // 6. Clean up broken hadrons
        this._cleanupHadrons();

        // 7. Tick hadron age
        for (const h of this.hadrons) h.tick();

        // 8. Sync field sources from stable hadrons
        //    + tick the QuantumField
        if (this._field) {
            this._syncFieldSources();
            this._field.tick(this.dt);
        }

        // 9. Stats + tick counter
        this._updateStats();
        this.tick++;

        // 10. Snapshot
        if (this.onSnapshot) this.onSnapshot(this.getSnapshot());
    }


    // ─── QuantumField sync ────────────────────────────────────────────────────

    /**
     * Keep QuantumField sources in sync with stable hadrons.
     *
     * Rules:
     *   - A hadron becomes a field source once it's stable (settled)
     *   - The element is determined by proton count (charge → Z)
     *   - If a hadron dissolves, its source is removed
     *   - If a stable hadron moves, its source position is updated
     *
     * Only protons contribute to Z. Neutrons affect nuclear frequency
     * via binding energy but don't change the element identity.
     */
    _syncFieldSources() {
        const liveIds = new Set(this.hadrons.map(h => h.id));

        // Remove dissolved hadrons from field
        for (const id of this._fieldSourceIds) {
            if (!liveIds.has(id)) {
                this._field.removeSource(id);
                this._fieldSourceIds.delete(id);
            }
        }

        // Count protons to determine Z for multi-hadron nuclei
        // Group hadrons that are close enough to form a nucleus
        const nuclei = this._groupNuclei();

        for (const nucleus of nuclei) {
            const Z = nucleus.protons.length;
            if (Z === 0) continue;

            // Use the proton group's center of mass as nucleus position
            const pos = this._groupCoM(nucleus.all);

            // Element data for this Z
            const elementData = this._getElement(Z);

            // Register each proton as a source (they drive the field together)
            // For simplicity: one source per nucleus group, positioned at CoM
            // The representative id is the first proton's id
            const repId = `nucleus_${nucleus.protons[0].id}`;

            if (!this._fieldSourceIds.has(repId)) {
                if (elementData) {
                    // New stable nucleus — register as field source
                    this._field.addSource({
                        id:          repId,
                        position:    pos,
                        elementData,
                    });
                    this._fieldSourceIds.add(repId);
                } else if (this._loadElement) {
                    // Async load element data then register
                    this._loadElement(Z).then(data => {
                        if (data) {
                            _elementCache.set(Z, data);
                            this._field.addSource({
                                id:          repId,
                                position:    pos,
                                elementData: data,
                            });
                            this._fieldSourceIds.add(repId);
                        }
                    }).catch(() => {/* element not found — field layer stays quiet */});
                }
            } else {
                // Already registered — just update position
                this._field.updateSource(repId, pos);
            }
        }
    }

    /**
     * Group stable hadrons into nuclei by proximity.
     * Hadrons within nuclear range (~2 pm) are considered the same nucleus.
     *
     * @returns {Array<{protons, neutrons, all}>}
     */
    _groupNuclei() {
        const NUCLEAR_RANGE = 2.0; // pm
        const stable = this.hadrons.filter(h => h.stable);
        const claimed = new Set();
        const nuclei  = [];

        for (const h of stable) {
            if (claimed.has(h.id)) continue;

            const group = [h];
            claimed.add(h.id);

            for (const other of stable) {
                if (claimed.has(other.id)) continue;
                const pos1 = h.position;
                const pos2 = other.position;
                const dist = Math.sqrt(
                    (pos2.x-pos1.x)**2 +
                    (pos2.y-pos1.y)**2 +
                    (pos2.z-pos1.z)**2
                );
                if (dist <= NUCLEAR_RANGE) {
                    group.push(other);
                    claimed.add(other.id);
                }
            }

            nuclei.push({
                protons:  group.filter(h => h.identity === 'proton'),
                neutrons: group.filter(h => h.identity === 'neutron'),
                all:      group,
            });
        }

        return nuclei;
    }

    /**
     * Center of mass of a group of hadrons.
     */
    _groupCoM(hadrons) {
        let x = 0, y = 0, z = 0, m = 0;
        for (const h of hadrons) {
            const pos = h.position;
            const hm  = h.mass;
            x += pos.x * hm;
            y += pos.y * hm;
            z += pos.z * hm;
            m += hm;
        }
        return { x: x/m, y: y/m, z: z/m };
    }


    // ─── Hadron lifecycle ─────────────────────────────────────────────────────

    _detectHadrons() {
        const free   = this.entities.filter(e => e.hadron === null);
        const groups = ColorField.detectNeutralGroups(free);
        for (const group of groups) {
            this.hadrons.push(new Hadron(group));
        }
    }

    _cleanupHadrons() {
        const broken = this.hadrons.filter(h => !h.isIntact());
        for (const h of broken) this._dissolveHadron(h);
    }

    _dissolveHadron(hadron) {
        // Remove from field if it was a source
        const repId = `nucleus_${hadron.id}`;
        if (this._fieldSourceIds.has(repId)) {
            this._field?.removeSource(repId);
            this._fieldSourceIds.delete(repId);
        }
        hadron.dissolve();
        this.hadrons = this.hadrons.filter(h => h !== hadron);
    }


    // ─── Stats ────────────────────────────────────────────────────────────────

    _updateStats() {
        this.stats.entities   = this.entities.length;
        this.stats.hadrons    = this.hadrons.length;
        this.stats.protons    = this.hadrons.filter(h => h.identity === 'proton').length;
        this.stats.neutrons   = this.hadrons.filter(h => h.identity === 'neutron').length;
        this.stats.freeQuarks = this.entities.filter(e => e.hadron === null).length;
        this.stats.tick       = this.tick;

        if (this._field) {
            this.stats.fieldNodes        = this._field.stats.activeNodes;
            this.stats.constructiveZones = this._field.stats.constructiveZones;
        }
    }


    // ─── Snapshot ─────────────────────────────────────────────────────────────

    getSnapshot() {
        return {
            tick:     this.tick,
            dt:       this.dt,
            stats:    { ...this.stats },
            entities: this.entities.map(e => e.snapshot()),
            hadrons:  this.hadrons.map(h => h.snapshot()),
            // Field snapshot — null if field layer disabled or no sources yet
            field:    this._field ? this._field.snapshot() : null,
        };
    }
}
