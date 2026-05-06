/**
 * SpatialHash.js
 *
 * O(1) average-case neighbor lookup for the simulation.
 *
 * The problem with O(n²):
 *   Every quark checks every other quark. 168 quarks (iron nucleus) = 28,000
 *   pair checks per tick. At 60fps = 1.7M checks/second. Manageable now,
 *   but ugly and unnecessary — the universe doesn't work that way either.
 *
 * The universe's solution: locality.
 *   A quark only interacts with what's in its immediate field.
 *   We implement that with a spatial hash: divide space into cells,
 *   each entity registers in its cell, neighbors are found by checking
 *   only the 27 surrounding cells (3×3×3 in 3D).
 *
 * Complexity:
 *   Insert: O(n)
 *   Query neighbors: O(1) average (k neighbors, k << n)
 *   Full interaction pass: O(n·k) instead of O(n²)
 *
 * Design note:
 *   Cell size = field radius. An entity in cell (i,j,k) can only interact
 *   with entities in the 27 cells around it. This is exact — no false negatives
 *   as long as cellSize >= maxFieldRadius.
 *
 * No fixed grid. The hash table expands as needed.
 * Empty cells cost nothing — only populated cells exist in memory.
 */

export class SpatialHash {

    /**
     * @param {number} cellSize   Should equal or exceed the max field radius
     *                            in world units. For our quarks: 0.8 pm default.
     */
    constructor(cellSize = 0.8) {
        this.cellSize = cellSize;

        // The hash table: Map<string, QuantumEntity[]>
        // Key: "ix,iy,iz" — cell coordinates as integers
        // Value: array of entities in that cell
        this._cells = new Map();
    }

    // ─── Cell coordinate helpers ──────────────────────────────────────────────

    /**
     * Convert world position to integer cell coordinates.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {[number, number, number]}
     */
    _cellCoords(x, y, z) {
        return [
            Math.floor(x / this.cellSize),
            Math.floor(y / this.cellSize),
            Math.floor(z / this.cellSize),
        ];
    }

    /**
     * Cell key from integer coordinates.
     * Using template literal — fast enough for our scale.
     * @param {number} ix
     * @param {number} iy
     * @param {number} iz
     * @returns {string}
     */
    _key(ix, iy, iz) {
        return `${ix},${iy},${iz}`;
    }


    // ─── Rebuild ──────────────────────────────────────────────────────────────

    /**
     * Rebuild the hash from scratch every tick.
     *
     * Why rebuild instead of update?
     * - Entities move every tick, cells change
     * - Tracking moves is more complex than rebuilding
     * - At our scale (< 10,000 entities), rebuild is faster than delta-tracking
     * - The Map reuse avoids GC pressure (we clear, not recreate)
     *
     * @param {QuantumEntity[]} entities
     */
    build(entities) {
        this._cells.clear();

        for (const entity of entities) {
            const [ix, iy, iz] = this._cellCoords(
                entity.position.x,
                entity.position.y,
                entity.position.z,
            );
            const key = this._key(ix, iy, iz);

            let cell = this._cells.get(key);
            if (!cell) {
                cell = [];
                this._cells.set(key, cell);
            }
            cell.push(entity);
        }
    }


    // ─── Neighbor query ───────────────────────────────────────────────────────

    /**
     * Get all entities within field range of a given entity.
     * Checks the 27 cells surrounding the entity's cell (3×3×3 cube).
     *
     * Returns candidates — caller should still do exact distance check
     * if they need precision (cell boundary cases).
     *
     * @param {QuantumEntity} entity
     * @returns {QuantumEntity[]}   Neighbors (excludes entity itself)
     */
    neighborsOf(entity) {
        const [ix, iy, iz] = this._cellCoords(
            entity.position.x,
            entity.position.y,
            entity.position.z,
        );

        const result = [];

        // Check 3×3×3 = 27 surrounding cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key  = this._key(ix + dx, iy + dy, iz + dz);
                    const cell = this._cells.get(key);
                    if (!cell) continue;

                    for (const other of cell) {
                        if (other !== entity) result.push(other);
                    }
                }
            }
        }

        return result;
    }


    /**
     * Iterate over all unique pairs of potentially-interacting entities.
     * This replaces the O(n²) double loop in ColorField.resolve().
     *
     * Uses the spatial hash to only visit pairs that share neighboring cells.
     * Each pair is yielded exactly once.
     *
     * @yields {[QuantumEntity, QuantumEntity]}
     */
    *pairs() {
        // We only need to check each cell against its 13 "forward" neighbors
        // (the other 14 are handled when those cells are the primary cell).
        // This ensures each pair is visited exactly once.
        const FORWARD_OFFSETS = [
            [1,  0,  0],
            [0,  1,  0],
            [0,  0,  1],
            [1,  1,  0],
            [1, -1,  0],
            [1,  0,  1],
            [1,  0, -1],
            [0,  1,  1],
            [0,  1, -1],
            [1,  1,  1],
            [1,  1, -1],
            [1, -1,  1],
            [1, -1, -1],
        ];

        for (const [key, cellA] of this._cells) {
            const [ix, iy, iz] = key.split(',').map(Number);

            // Pairs within the same cell
            for (let i = 0; i < cellA.length; i++) {
                for (let j = i + 1; j < cellA.length; j++) {
                    yield [cellA[i], cellA[j]];
                }
            }

            // Pairs across neighboring cells (forward only)
            for (const [dx, dy, dz] of FORWARD_OFFSETS) {
                const neighborKey  = this._key(ix + dx, iy + dy, iz + dz);
                const cellB = this._cells.get(neighborKey);
                if (!cellB) continue;

                for (const a of cellA) {
                    for (const b of cellB) {
                        yield [a, b];
                    }
                }
            }
        }
    }


    // ─── Stats ────────────────────────────────────────────────────────────────

    get cellCount() { return this._cells.size; }

    get stats() {
        let maxPerCell = 0;
        let total      = 0;
        for (const cell of this._cells.values()) {
            total += cell.length;
            if (cell.length > maxPerCell) maxPerCell = cell.length;
        }
        return {
            cells:      this._cells.size,
            entities:   total,
            maxPerCell,
            avgPerCell: this._cells.size ? (total / this._cells.size).toFixed(1) : 0,
        };
    }
}
