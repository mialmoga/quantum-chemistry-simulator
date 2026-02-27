/**
 * Temperature.js
 * Sistema de temperatura — Quantum Chemistry Simulator
 *
 * ── DOS MODOS EXPLÍCITOS ────────────────────────────────────────────────────
 *
 * DIDACTIC (default):
 *   Usa BOLTZMANN_DIDACTIC = 0.0001 (inventado).
 *   Slider 0–2000 K produce velocidades visualmente interesantes.
 *   Ideal para demostración en clase. No enseña valores correctos.
 *
 * REALISTIC:
 *   Usa k_B real = 1.380649e-23 J/K.
 *   Masas en kg (Da × 1.66054e-27).
 *   Velocidades calculadas en m/s, luego convertidas a unidades del simulador
 *   con WORLD_SCALE = 1e-10 m / 1 unidad (orden de magnitud Ångström).
 *   Los números son físicamente correctos. Las velocidades son exageradas
 *   visualmente porque el mundo 3D no tiene escala temporal real —
 *   esto se documenta en la UI con honestidad.
 *
 * ── INTEGRACIÓN ─────────────────────────────────────────────────────────────
 *   Desde Simulation.js:
 *     import { TemperatureSystem } from '../physics/Temperature.js';
 *     this.temperature = new TemperatureSystem(this.physics);
 *
 *   En Simulation.update():
 *     this.temperature.update(this.atoms, this.bonds);
 *
 *   En Simulation.addAtom():
 *     this.temperature.initAtom(atom);
 *
 * ── DETECCIÓN DE FASE ───────────────────────────────────────────────────────
 *   Usa melting_point_K / boiling_point_K de datos avanzados si existen.
 *   Fallback a umbrales genéricos pedagógicos.
 */

// ── Constantes ─────────────────────────────────────────────────────────────

// Boltzmann real (J/K)
const K_BOLTZMANN_REAL = 1.380649e-23;

// Boltzmann pedagógico (sin unidades — calibrado para visibilidad)
const K_BOLTZMANN_DIDACTIC = 0.0001;

// 1 unidad de mundo ≈ 1 Å = 1e-10 m
// Usada para convertir m/s → unidades/frame en modo REALISTIC
// (asumiendo ~60 fps → 1 frame ≈ 0.0167 s en tiempo real, pero la sim no corre en tiempo real)
// Aplicamos solo la escala espacial; el tiempo lo ajusta TIME_SCALE
const WORLD_SCALE  = 1e-10; // m por unidad de mundo
const TIME_SCALE   = 1e-13; // s por frame (ajustado para que 300K se vea "vivo" sin explotar)

// Dalton → kg
const DALTON_TO_KG = 1.66054e-27;

// Límites del slider
const TEMP_MIN  = 0;
const TEMP_MAX_DIDACTIC  = 2000;   // K pedagógicos
const TEMP_MAX_REALISTIC = 5000;   // K reales (Fe funde ~1811 K, C sublima ~3900 K)

// Umbrales de fase GENÉRICOS (fallback si el elemento no tiene datos avanzados)
const PHASE_GENERIC = {
    SOLID_TO_LIQUID: 500,
    LIQUID_TO_GAS:   1800,
};

// Modos disponibles
export const TEMP_MODE = {
    DIDACTIC:  'didactic',
    REALISTIC: 'realistic',
};

// ── Clase principal ────────────────────────────────────────────────────────

export class TemperatureSystem {

    constructor(physics) {
        this.physics = physics;

        // Estado
        this.enabled            = false;
        this.mode               = TEMP_MODE.DIDACTIC;
        this.targetTemperature  = 300;   // K (ambos modos usan Kelvin)
        this.currentTemperature = 0;     // Medido desde velocidades reales

        // Termostato Berendsen
        this.thermostatEnabled = true;
        this.thermostatTau     = 60;     // Frames para converger (mayor = más suave)

        // Ruptura de enlaces por temperatura
        this.thermalBondBreaking = false;
        this.bondBreakingScale   = 1.0;

        // Visualización de color ambiente (gradiente CSS del fondo)
        this.colorAmbient = true;   // Colorea el fondo, NO los átomos

        // Colores del gradiente ambiente
        this._ambientCold   = '10, 15, 40';    // RGB azul oscuro frío
        this._ambientNeutral = '5, 5, 15';     // RGB negro casi puro (base)
        this._ambientHot    = '40, 15, 5';     // RGB rojo oscuro caliente
        this._ambientPlasma = '60, 40, 0';     // RGB ámbar plasma

        // Reusable — evitar GC en hot path
        this._tempVec    = new THREE.Vector3();
        this._frameCount = 0;

        // Cache de color base por átomo (para restaurar al desactivar)
        this._baseColors = new WeakMap();
    }

    // ── API pública ──────────────────────────────────────────────────────────

    setEnabled(enabled) {
        this.enabled = enabled;
        if(!enabled) this._restoreAllColors();
        console.log(`🌡️ Temperature: ${enabled ? 'ON' : 'OFF'} [${this.mode}]`);
    }

    setMode(mode) {
        if(!TEMP_MODE[mode.toUpperCase()] && mode !== TEMP_MODE.DIDACTIC && mode !== TEMP_MODE.REALISTIC) {
            console.warn(`Unknown temperature mode: ${mode}`);
            return;
        }
        this.mode = mode;
        console.log(`🌡️ Temperature mode → ${mode}`);
    }

    setTargetTemperature(kelvin) {
        const max = this.mode === TEMP_MODE.REALISTIC ? TEMP_MAX_REALISTIC : TEMP_MAX_DIDACTIC;
        this.targetTemperature = Math.max(TEMP_MIN, Math.min(max, kelvin));
    }

    getCurrentTemperature() { return this.currentTemperature; }

    getMaxTemperature() {
        return this.mode === TEMP_MODE.REALISTIC ? TEMP_MAX_REALISTIC : TEMP_MAX_DIDACTIC;
    }

    /**
     * Inicializar un átomo recién creado con velocidad térmica.
     * Llamar desde Simulation.addAtom() si temperature está habilitada.
     * También guarda el color base para restauración.
     */
    initAtom(atom) {
        // Guardar color base
        this._baseColors.set(atom, atom.nucleus.material.color.getHex());

        // Aplicar velocidad inicial si temperatura activa y > 0
        if(this.enabled && this.targetTemperature > 0) {
            this._applyMaxwellBoltzmann(atom, this.targetTemperature);
        }
    }

    /**
     * Update principal — llamar en Simulation.update() al final del loop.
     */
    update(atoms, bonds) {
        if(!this.enabled || !atoms || atoms.length === 0) return;

        this._frameCount++;

        // Medir temperatura actual cada 15 frames
        if(this._frameCount % 15 === 0) {
            this.currentTemperature = this._measureTemperature(atoms);
        }

        // Termostato
        if(this.thermostatEnabled && this.currentTemperature > 0.001) {
            this._applyBerendsenThermostat(atoms);
        }

        // Ruptura de enlaces
        if(this.thermalBondBreaking && bonds && this._frameCount % 5 === 0) {
            this._checkThermalBondBreaking(bonds);
        }

        // Color ambiente (fondo CSS)
        if(this.colorAmbient && this._frameCount % 10 === 0) {
            this._updateAmbientColor();
        }
    }

    /**
     * Info para la UI del panel.
     */
    getUIInfo(atoms) {
        return {
            mode:               this.mode,
            enabled:            this.enabled,
            targetTemperature:  Math.round(this.targetTemperature),
            currentTemperature: Math.round(this.currentTemperature),
            phase:              this._detectPhase(atoms),
            phaseName:          getPhaseName(this._detectPhase(atoms)),
            maxTemperature:     this.getMaxTemperature(),
            thermostatTau:      this.thermostatTau,
        };
    }

    // ── Maxwell-Boltzmann ────────────────────────────────────────────────────

    /**
     * Aplicar velocidad inicial según distribución Maxwell-Boltzmann.
     *
     * DIDACTIC:
     *   v_rms = sqrt(3 * K_DIDACTIC * T / m_sim)
     *   m_sim = masa atómica (número adimensional en el motor)
     *
     * REALISTIC:
     *   v_rms = sqrt(3 * k_B * T / m_kg)   [m/s]
     *   → convertir a unidades de mundo: v_world = v_ms * TIME_SCALE / WORLD_SCALE
     */
    _applyMaxwellBoltzmann(atom, temperature) {
        if(temperature <= 0) { atom.velocity.set(0, 0, 0); return; }

        const mass_sim = atom.element.mass || 1.0;
        let vp; // velocidad más probable (componente escalar)

        if(this.mode === TEMP_MODE.REALISTIC) {
            const mass_kg = mass_sim * DALTON_TO_KG;
            const v_ms    = Math.sqrt(2 * K_BOLTZMANN_REAL * temperature / mass_kg); // m/s
            vp = v_ms * TIME_SCALE / WORLD_SCALE; // → unidades/frame
        } else {
            vp = Math.sqrt(2 * K_BOLTZMANN_DIDACTIC * temperature / mass_sim);
        }

        // Componentes gaussianas independientes (Box-Muller)
        atom.velocity.set(
            this._gaussian() * vp,
            this._gaussian() * vp,
            this._gaussian() * vp
        );
    }

    // ── Medición de temperatura ──────────────────────────────────────────────

    /**
     * T = (2/3) * Ek_avg / k_eff
     * donde k_eff = K_BOLTZMANN_DIDACTIC o K_BOLTZMANN_REAL × (TIME_SCALE/WORLD_SCALE)²
     */
    _measureTemperature(atoms) {
        const free = atoms.filter(a => !a.frozen && !a.isDragging);
        if(free.length === 0) return 0;

        const totalEk = free.reduce((sum, atom) => {
            const mass = atom.element.mass || 1.0;
            return sum + 0.5 * mass * atom.velocity.lengthSq();
        }, 0);

        const avgEk = totalEk / free.length;

        if(this.mode === TEMP_MODE.REALISTIC) {
            // Deshacer la conversión de unidades para obtener K reales
            const unitConv = TIME_SCALE / WORLD_SCALE;
            const k_eff    = K_BOLTZMANN_REAL * unitConv * unitConv * DALTON_TO_KG;
            return (2/3) * avgEk / k_eff;
        } else {
            return (2/3) * avgEk / K_BOLTZMANN_DIDACTIC;
        }
    }

    // ── Termostato Berendsen ─────────────────────────────────────────────────

    /**
     * λ = sqrt(1 + (1/τ) × (T_target/T_actual − 1))
     * Escala velocidades de átomos libres para converger a T objetivo.
     * Estable, simple, sin oscilaciones. No conserva NVT estrictamente
     * pero es perfecto para pedagogía.
     */
    _applyBerendsenThermostat(atoms) {
        const ratio     = this.targetTemperature / this.currentTemperature;
        const lambdaSq  = 1 + (1 / this.thermostatTau) * (ratio - 1);
        if(lambdaSq <= 0) return;
        const lambda = Math.sqrt(lambdaSq);

        atoms.forEach(atom => {
            if(atom.frozen || atom.isDragging) return;
            atom.velocity.multiplyScalar(lambda);
        });
    }

    // ── Detección de fase ────────────────────────────────────────────────────

    /**
     * Detecta fase dominante de la escena (mayoría de átomos).
     * Usa melting_point_K / boiling_point_K de datos avanzados si existen.
     */
    _detectPhase(atoms) {
        if(!atoms || atoms.length === 0) return 'solid';
        const T = this.currentTemperature;

        // Intentar usar puntos de fase del primer elemento disponible
        const el = atoms[0]?.element;
        const melt = el?.melting_point_K  ?? PHASE_GENERIC.SOLID_TO_LIQUID;
        const boil = el?.boiling_point_K  ?? PHASE_GENERIC.LIQUID_TO_GAS;

        if(T < melt)  return 'solid';
        if(T < boil)  return 'liquid';
        return 'gas';
    }

    // ── Ruptura de enlaces por temperatura ───────────────────────────────────

    _checkThermalBondBreaking(bonds) {
        bonds.forEach(bond => {
            if(!bond.atom1 || !bond.atom2) return;
            if(bond.isCrystalBond) return;
            if(bond.atom1.frozen && bond.atom2.frozen) return;

            this._tempVec.subVectors(bond.atom1.velocity, bond.atom2.velocity);
            const relSpeed  = this._tempVec.length();
            const mu        = (bond.atom1.element.mass * bond.atom2.element.mass) /
                              (bond.atom1.element.mass + bond.atom2.element.mass);
            const relEk     = 0.5 * mu * relSpeed * relSpeed;
            const threshold = this._bondThreshold(bond) * this.bondBreakingScale;

            if(relEk > threshold) {
                bond._markedForThermalBreak = true;
            }
        });
    }

    _bondThreshold(bond) {
        const el1 = bond.atom1.element;
        const el2 = bond.atom2.element;

        if(el1.bond_dissociation_energy) {
            return el1.bond_dissociation_energy *
                   (this.mode === TEMP_MODE.REALISTIC ? 1e-9 : 1e-6);
        }

        // Estimación por electronegatividad
        if(el1.electronegativity && el2?.electronegativity) {
            const diff = Math.abs(el1.electronegativity - el2.electronegativity);
            if(diff > 1.7) return 0.08;  // Iónico
            if(diff > 0.4) return 0.04;  // Covalente polar
            return 0.02;                 // Covalente puro
        }
        return 0.03;
    }

    // ── Color ambiente (gradiente CSS del fondo) ──────────────────────────────

    /**
     * Actualiza el gradiente de fondo del canvas según la temperatura actual.
     * Modifica la variable CSS --ambient-temp-color en :root.
     * El canvas tiene background: var(--ambient-grad) definido en CSS.
     *
     * Escala:
     *   0 K   → azul oscuro frío
     *   300 K → negro base (neutro, sin temperatura)
     *   1500 K → rojo oscuro caliente
     *   3000 K → ámbar/plasma
     */
    _updateAmbientColor() {
        const maxT = this.getMaxTemperature();
        const t    = Math.max(0, Math.min(1, this.currentTemperature / maxT));

        let r, g, b;

        if(t < 0.05) {
            // Muy frío → azul
            const f = t / 0.05;
            r = Math.round(this._lerp(10, 5, f));
            g = Math.round(this._lerp(15, 5, f));
            b = Math.round(this._lerp(40, 15, f));
        } else if(t < 0.5) {
            // Neutro → caliente
            const f = (t - 0.05) / 0.45;
            r = Math.round(this._lerp(5, 40, f));
            g = Math.round(this._lerp(5, 15, f));
            b = Math.round(this._lerp(15, 5, f));
        } else {
            // Caliente → plasma
            const f = (t - 0.5) / 0.5;
            r = Math.round(this._lerp(40, 60, f));
            g = Math.round(this._lerp(15, 40, f));
            b = Math.round(this._lerp(5, 0, f));
        }

        document.documentElement.style.setProperty(
            '--ambient-temp-rgb', `${r}, ${g}, ${b}`
        );
    }

    _lerp(a, b, t) { return a + (b - a) * t; }

    _restoreAllColors() {
        // Restaurar gradiente neutro
        document.documentElement.style.setProperty('--ambient-temp-rgb', '5, 5, 15');
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    /** Box-Muller gaussian (media 0, σ 1) */
    _gaussian() {
        const u = Math.max(1e-10, Math.random());
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
}

// ── Helpers exportados ────────────────────────────────────────────────────

export function getPhaseName(phase) {
    return { solid: '🧊 Sólido', liquid: '💧 Líquido', gas: '💨 Gas' }[phase] ?? '❓';
}

export function getPhaseColor(phase) {
    return { solid: '#88ccff', liquid: '#44aaff', gas: '#ff8844' }[phase] ?? '#ffffff';
}

export { TEMP_MIN, TEMP_MAX_DIDACTIC, TEMP_MAX_REALISTIC };
