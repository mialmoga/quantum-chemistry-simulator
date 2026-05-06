/**
 * QuantumRendererPool.js
 *
 * Gestiona el LOD multi-átomo usando el QuantumRenderer principal.
 * No instancia QRs adicionales — reutiliza el QR principal reposicionando
 * sus grupos cada frame según el átomo más cercano a la cámara.
 *
 * Interacción orbital reactiva:
 *   Los orbitales de valencia del primario reaccionan a cualquier vecino
 *   en función de la distancia entre sus r_sample_pm — mucho antes de que
 *   se forme el bond real. El bond real (en atom.bonds) sube el estado
 *   a intercambio (3). El tipo de bond determina el comportamiento visual.
 *
 *   Estados setBondState:
 *     0 — libre       (sin vecino en rango orbital)
 *     1 — atracción   (vecino en rango r_sample, sin bond real aún)
 *     2 — repulsión   (no usado aquí por ahora — reservado)
 *     3 — intercambio (bond real formado)
 */

import * as THREE from 'three';

export const QUANTUM_RADIUS = 800;  // wu = pm — radio inicial, se ajusta por elemento

// Fallback de r_sample si el metadata no lo tiene
const R_SAMPLE_FALLBACK = 150;  // pm — conservador

export class QuantumRendererPool {

    /** @param {QuantumRenderer} qr — instancia principal ya inicializada */
    constructor(qr) {
        this._qr           = qr;
        this._qr2          = null;
        this._active       = new Map();
        this._loadedSym    = null;
        this._loadedSym2   = null;
        this._primary      = null;
        this._secondary    = null;
        this._activeRadius = QUANTUM_RADIUS;
        this._rSamplePrimary = R_SAMPLE_FALLBACK;

        // Callbacks externos — se pueden setear desde app.js
        // onElementLoaded(symbol, qr): llamado cuando el QR primario carga un elemento
        // onSecondaryLoaded(symbol, qr): ídem para el secundario
        this.onElementLoaded   = null;
        this.onSecondaryLoaded = null;

        // LOD habilitado — cuando es false el pool no procesa (solo esferas)
        this.enabled = true;
    }

    /**
     * Inicializar el segundo QR compartiendo escena/renderer/cámara del primario.
     * Llamar después de que el QR principal esté inicializado.
     */
    async initSecondary() {
        const qr = this._qr;
        // Importar QuantumRenderer dinámicamente para evitar circular
        const { QuantumRenderer } = await import('./QuantumRenderer.js');
        this._qr2 = new QuantumRenderer(null, {
            renderer:     qr.renderer,
            scene:        qr.scene,
            camera:       qr.camera,
            externalLoop: true,
        });
        await this._qr2._initPoolInstance();
        console.log('[Pool] QR secundario listo 🔬');
    }

    /**
     * Llamar cada frame con los átomos cercanos a la cámara.
     * @param {Array<{atom, dist}>} nearAtoms — salida de world.getAtomsInRadius()
     * @param {number} elapsed
     * @param {number} dt
     */
    async tick(nearAtoms, elapsed, dt) {
        const qr = this._qr;

        // LOD desactivado — restaurar esferas y salir
        if (!this.enabled) {
            for (const [, atom] of this._active) {
                if (atom.sphereMesh) atom.sphereMesh.visible = true;
            }
            if (this._loadedSym)  { qr.clear();         this._loadedSym  = null; this._primary   = null; }
            if (this._loadedSym2) { this._qr2?.clear();  this._loadedSym2 = null; this._secondary = null; }
            this._active.clear();
            return;
        }

        const activeIds = new Set(nearAtoms.map(({ atom }) => atom.id));

        // Átomos que salieron del radio — restaurar sphereMesh
        for (const [id, atom] of this._active) {
            if (!activeIds.has(id)) {
                if (atom.sphereMesh) atom.sphereMesh.visible = true;
                this._active.delete(id);
            }
        }

        // Restaurar visibilidad de átomos que perdieron prioridad.
        // Excluir primary y secondary (se gestionan más abajo en el tick).
        for (const [id, atom] of this._active) {
            if (atom !== this._primary && atom !== this._secondary) {
                if (atom.sphereMesh) atom.sphereMesh.visible = true;
            }
        }

        if (nearAtoms.length === 0) {
            if (this._loadedSym)  { qr.clear();         this._loadedSym  = null; this._primary   = null; }
            if (this._loadedSym2) { this._qr2?.clear();  this._loadedSym2 = null; this._secondary = null; }
            return;
        }

        // Átomo primario = más cercano
        const { atom: primary, dist: primaryDist } = nearAtoms[0];
        this._primary = primary;

        // Cargar elemento primario si cambió
        if (this._loadedSym !== primary.symbol) {
            await qr.loadElement(primary.symbol);
            this._loadedSym = primary.symbol;
            this.onElementLoaded?.(primary.symbol, qr);

            const orbMeta = qr._orbMeta;
            this._rSamplePrimary = orbMeta
                ? _valenceRSample(orbMeta)
                : (qr._meta?.atomic_structure?.vanderwaals_radius_pm ?? R_SAMPLE_FALLBACK);
            this._activeRadius = this._rSamplePrimary * 4.0;
            console.log(`[Pool] ${primary.symbol} r_sample=${this._rSamplePrimary.toFixed(0)}pm activeRadius=${this._activeRadius.toFixed(0)}wu`);
        }

        // Posicionar grupos del primario
        if (qr.nucleusGroup) qr.nucleusGroup.position.copy(primary.position);
        if (qr.sphereGroup)  qr.sphereGroup.position.copy(primary.position);
        if (qr.shellsGroup)  qr.shellsGroup.position.copy(primary.position);

        await qr.updateLOD(primaryDist, dt);
        const lodState = qr._lodState;

        if (primary.sphereMesh) primary.sphereMesh.visible = (lodState === 'far');
        this._active.set(primary.id, primary);

        // ── Vecino más cercano ────────────────────────────────────────────────
        const neighbor = _closestNeighbor(nearAtoms, primary);

        if (!neighbor) {
            // Sin vecino — limpiar qr2 si tenía algo
            if (this._loadedSym2) {
                this._qr2?.clear();
                this._loadedSym2 = null;
                this._secondary  = null;
            }
            if (lodState === 'far' || lodState === 'mid') {
                if (qr._bondState?.state > 0) qr.setBondState(0, {});
            }
            qr.update(elapsed, dt);
            return;
        }

        const { atom: sec, dist: secDist } = neighbor;
        this._secondary = sec;
        this._active.set(sec.id, sec);

        const rSampleSec    = _rSampleFromAtom(sec);
        const interactionDist = this._rSamplePrimary + rSampleSec;
        const inOrbitalRange  = secDist < interactionDist;

        // ── QR secundario — orbitales del vecino ──────────────────────────────
        if (this._qr2 && inOrbitalRange && lodState !== 'far') {
            // Cargar elemento del vecino en qr2 si cambió
            if (this._loadedSym2 !== sec.symbol) {
                await this._qr2.loadElement(sec.symbol);
                this._loadedSym2 = sec.symbol;
                this.onSecondaryLoaded?.(sec.symbol, this._qr2);
                console.log(`[Pool] QR2 → ${sec.symbol}`);
            }

            // Posicionar grupos del secundario
            if (this._qr2.nucleusGroup) this._qr2.nucleusGroup.position.copy(sec.position);
            if (this._qr2.sphereGroup)  this._qr2.sphereGroup.position.copy(sec.position);
            if (this._qr2.shellsGroup)  this._qr2.shellsGroup.position.copy(sec.position);

            // LOD del secundario basado en su distancia a la cámara
            const cam = qr.camera;
            const distSec = cam ? cam.position.distanceTo(sec.position) : secDist;
            await this._qr2.updateLOD(distSec, dt);

            // Ocultar esfera del secundario cuando sus orbitales están activos
            if (sec.sphereMesh) sec.sphereMesh.visible = (this._qr2._lodState === 'far');

            this._qr2.update(elapsed, dt);

        } else {
            // Fuera de rango orbital — limpiar qr2
            if (this._loadedSym2) {
                this._qr2?.clear();
                this._loadedSym2 = null;
            }
            if (sec.sphereMesh) sec.sphereMesh.visible = true;
        }

        // ── Bond state del primario ───────────────────────────────────────────
        if (lodState !== 'far' && lodState !== 'mid') {
            const dir = new THREE.Vector3()
                .subVectors(sec.position, primary.position)
                .normalize();
            const secColor = sec.sphereMesh?.material?.uniforms?.uColor?.value ?? null;
            const realBond = _findBond(primary, sec);

            if (realBond) {
                const exchangeStrength = { covalent: 1.0, ionic: 0.7, metallic: 0.5 }[realBond.type] ?? 0.8;
                qr.setBondState(3, { dir, strength: exchangeStrength, color: secColor });
            } else if (inOrbitalRange) {
                const raw      = 1.0 - (secDist / interactionDist);
                const strength = Math.pow(Math.max(0, raw), 1.5);
                qr.setBondState(1, { dir, strength, color: secColor });
            } else {
                if (qr._bondState?.state > 0) qr.setBondState(0, {});
            }
        } else {
            if (qr._bondState?.state > 0) qr.setBondState(0, {});
        }

        qr.update(elapsed, dt);
    }

    /**
     * Llamar desde app.js cuando se borra un átomo.
     */
    onAtomRemoved(atomId) {
        this._active.delete(atomId);
        if (this._primary?.id === atomId) {
            this._primary = null;
            this._loadedSym = null;
            this._qr.clear();
        }
        if (this._secondary?.id === atomId) {
            this._secondary  = null;
            this._loadedSym2 = null;
            this._qr2?.clear();
        }
    }

    /** Radio efectivo de activación LOD para el elemento actual. */
    get activeRadius() { return this._activeRadius; }

    get primaryAtom() { return this._primary; }

    dispose() {
        for (const [, atom] of this._active) {
            if (atom.sphereMesh) atom.sphereMesh.visible = true;
        }
        this._active.clear();
        this._loadedSym  = null;
        this._loadedSym2 = null;
        this._primary    = null;
        this._secondary  = null;
        this._qr2?.dispose?.();
    }
}

// ── Helpers privados ──────────────────────────────────────────────────────────

/**
 * r_sample_pm del orbital de valencia del metadata.
 * Usa el mayor r_sample entre todos los orbitales de capa valence.
 * Fallback: r_max_pm si no hay r_sample.
 */
function _valenceRSample(orbMeta) {
    const valence = orbMeta.orbitals.filter(o => o.layer === 'valence');
    if (!valence.length) {
        // Sin capa valence explícita — usar el mayor r_sample de todos
        return orbMeta.orbitals.reduce((mx, o) =>
            Math.max(mx, o.r_sample_pm ?? o.r_max_pm ?? R_SAMPLE_FALLBACK), R_SAMPLE_FALLBACK);
    }
    return valence.reduce((mx, o) =>
        Math.max(mx, o.r_sample_pm ?? o.r_max_pm ?? R_SAMPLE_FALLBACK), R_SAMPLE_FALLBACK);
}

/**
 * Estima r_sample del vecino sin tener su metadata orbital.
 * Usa vanderwaals_radius si está disponible, sino radio covalente * 1.5.
 * Es una aproximación — suficiente para la zona de interacción visual.
 */
function _rSampleFromAtom(atom) {
    const vdw = atom.elementData?.atomic_structure?.vanderwaals_radius_pm;
    if (vdw) return vdw * 1.5;  // r_sample ≈ 1.5× vdw es una buena aproximación
    return (atom.radius ?? 80) * 2.0;
}

/**
 * Vecino más cercano al primario entre los nearAtoms (excluye al primario mismo).
 */
function _closestNeighbor(nearAtoms, primary) {
    for (const entry of nearAtoms) {
        if (entry.atom.id !== primary.id) return entry;
    }
    return null;
}

/**
 * Busca si hay un bond real entre dos átomos en atom.bonds del primario.
 */
function _findBond(atomA, atomB) {
    for (const bond of atomA.bonds) {
        if (bond.atomA?.id === atomB.id || bond.atomB?.id === atomB.id) return bond;
    }
    return null;
}
