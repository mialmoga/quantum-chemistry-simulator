# 🧪⚛️ Quantum Chemistry Simulator

**Simulador molecular 3D interactivo con física real** para educación química

Creado por [Brujo](https://github.com/mialmoga) con Claude (Ámbar · Claudio)  
Con contribuciones de Velvet (GPT-5) y Éter (Gemini)
=======
Creado por [Brujo](https://github.com/mialmoga) con Claude (Ámbar)  
Con contribuciones de Velvet (GPT5) y Éter (GEMINI) (118 elementos CPK)

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://mialmoga.github.io/quantum-chemistry-simulator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Quick Start

### Versión Online
[**🔗 Abrir Simulador (GitHub Pages)**](https://mialmoga.github.io/quantum-chemistry-simulator/)

### Local
```bash
python -m http.server 8000
# Abrir: http://localhost:8000
```

---

## ✨ Features Completas

### 🎮 Interacción 3D Completa
- ✅ Agregar átomos individuales (118 elementos)
- ✅ Crear moléculas preset (15 moléculas)
- ✅ Crear cristales (NaCl, Fe BCC, Diamante, Hielo Ih)
- ✅ Arrastrar átomos y moléculas completas
- ✅ Rotación fluida (1 dedo / click izquierdo)
- ✅ Zoom (scroll / pinch)
- ✅ Pan (click derecho / 2 dedos)
- ✅ Doble tap: eliminar átomo / molécula completa

### ⚛️ Visualización Cuántica
- **Modo Nubes:** Orbitales probabilísticos animados (modelo cuántico)
- **Modo Anillos:** Órbitas clásicas Bohr con rotación 3D por capa
- **Electrones de enlace:** Animados entre núcleos enlazados
- Toggle: mostrar electrones de valencia / todos

### 🌡️ Sistema de Temperatura
- Control de temperatura por superficie (piso, techo)
- Color térmico de superficies: azul frío → rojo caliente → blanco
- Energía cinética visual: nubes de electrones se expanden con calor
- Temperatura inicial configurable (300 K por defecto)

### 🌍 Motor de Física
- **Gravedad** ajustable (0–10×, basada en masa real)
- **Repulsión de Pauli** entre átomos no enlazados
- **XPBD constraints** para distancias y ángulos de enlace
- **Lennard-Jones** (Van der Waals) para gases nobles y moléculas
- **Fricción**, velocidad terminal configurable
- **Modo Pedagógico / Realista** — toggle para enseñanza

### 📐 Geometría Molecular Real (VSEPR)
- Ángulos correctos desde datos avanzados por elemento:
  - H₂O: 104.5° (angular)
  - CH₄: 109.5° (tetraédrico)
  - NH₃: 107° (pirámide trigonal)
  - CO₂: 180° (lineal)
- Bonds explícitos en JSON: sin auto-bonding por distancia
- Posiciones calculadas desde radios covalentes reales

### 🏠 Contenedores de Física
- **Piso** con curvatura (bowl / dome), rebote, opacidad, brillo y temperatura
- **Techo** con curvatura inversa, rebote configurable, temperatura
- **Esfera** como recipiente cerrado con rebote
- Visibilidad independiente de la física activa
- Curvatura visual ×45 exagerada para pedagogía; física usa valores reales

### 💎 Estructuras Cristalinas
- NaCl (cúbico simple, iónico)
- Hierro BCC (body-centered cubic)
- Diamante (tetraédrico)
- Hielo Ih (hexagonal)
- Generador N×N×N (2×2×2 hasta 6×6×6)
- Modo congelado (estructura rígida)

### 🎨 UI Profesional
- Panel Física con pestañas: **Física / Geometría**
- Panel Agregar con toggle: **Moléculas / Cristales**
- Panel Laboratorio con sliders experimentales
- Panel Grupos para filtrar elementos por categoría
- Sistema de collapse automático en móvil
- Animaciones de panel normalizadas y consistentes
- Hints informativos contextuales

---

## 📊 Base de Datos de Elementos

Datos organizados por grupos, cargados bajo demanda:

| Grupo | Elementos | Datos básicos | Datos avanzados |
|---|---|---|---|
| No Metales | 7 | ✅ | ✅ |
| Metales Alcalinos | 6 | ✅ | ✅ |
| Alcalinotérreos | 6 | ✅ | ✅ |
| Metales de Transición | 29 | ✅ | ✅ |
| Post-Transición | 7 | ✅ | ✅ |
| Metaloides | 7 | ✅ | ✅ |
| Halógenos | 5 | ✅ | ✅ |
| Gases Nobles | 6 | ✅ | ✅ |
| Lantánidos | 15 | ✅ | ✅ |
| Actínidos | 15 | ✅ | ✅ |
| Superpesados | 15 | ✅ | ✅ |

**Propiedades por elemento (datos avanzados):**
`geometry_preference` · `ideal_bond_angle` · `max_bonds` · `vanderwaals_radius_pm` · `radius_covalent_pm` · `ionic_radius_pm` · `bond_energy_ev` · `electron_affinity_ev` · `polarizability_angstrom3` · `quantum_numbers` · `lattice_structure` · y ~30 más.

---

## 🔬 Física: Decisiones de Diseño

### Radio Visual vs Radio de Colisión

```
radius_atomic_pm  → nube electrónica completa (muy grande, causa interferencia)
radius_covalent_pm × 0.3 → radio visual del núcleo  ✅ usado desde v0.11
radius_covalent_pm × 3.5 → borde de nube visual     ✅ usado para colisiones
```

El cambio de `radius_atomic_pm` a `radius_covalent_pm` en la versión 0.11 fue el fix que estabilizó H₂O con 104.5° después de 2 semanas de iteración. El radio atómico incluye la nube electrónica completa → las esferas gigantes hacían que Pauli compitiera con los constraints de enlace → resonancia → aleteo.

### XPBD para Enlaces

Los enlaces usan Position-Based Dynamics (XPBD) en vez de spring forces:
- Corrección de posición directa cada frame (no acumulación de energía)
- Velocity damping a lo largo del eje del enlace
- Pauli excluye pares directamente enlazados (el constraint XPBD ya maneja esa distancia)

### Escala del Mundo

```
1 world unit ≈ 100 picometers
Enlace O-H: 104pm → 1.04wu
Enlace C-H: 108pm → 1.08wu
Enlace C-C: 154pm → 1.54wu
```

---

## 📁 Arquitectura

```
qcs/
├── index.html
├── lib/
│   └── three.min.js              ← Three.js r128 (local fallback)
├── src/
│   ├── app.js                    ← Entrada, UI handlers, inicialización
│   ├── core/
│   │   ├── Atom.js               ← Núcleo, capas, nube, animación
│   │   ├── Bond.js               ← XPBD constraints, velocity damping
│   │   ├── BondRenderer.js       ← InstancedMesh para performance
│   │   ├── MetallicCloud.js      ← Mar de electrones metálicos
│   │   ├── Molecule.js           ← Detección de moléculas
│   │   ├── Physics.js            ← Gravedad, Pauli, piso, techo, esfera
│   │   ├── Simulation.js         ← Estado central, createMolecule
│   │   └── electronMaterial.js   ← Material GPU de electrones
│   ├── data/
│   │   └── ElementLoader.js      ← Carga bajo demanda por grupo
│   ├── physics/
│   │   ├── BondAngleConstraints.js ← Geometría VSEPR post-integración
│   │   ├── LennardJones.js       ← Fuerzas Van der Waals
│   │   ├── MoleculeFragmentation.js ← Detección de ruptura de moléculas
│   │   ├── PhysicsMode.js        ← Pedagógico vs Realista
│   │   └── Temperature.js        ← Sistema de temperatura y calor
│   ├── structures/
│   │   └── CrystalGenerator.js   ← Redes cristalinas NxNxN
│   ├── styles/
│   │   ├── GroupPanel.css
│   │   ├── main.css
│   │   ├── panels.css
│   │   └── themes.css
│   ├── ui/
│   │   ├── GroupPanel.js         ← Filtros por categoría
│   │   ├── interactions.js       ← Touch/mouse handlers
│   │   └── panels.js             ← Lógica de paneles y collapse
│   └── utils/
│       ├── helpers.js
│       └── raycasting.js
└── data/
    ├── elements-index.json       ← Índice de grupos y rutas
    ├── moleculas.json            ← 15 moléculas con bonds explícitos
    └── groups/                   ← 11 grupos × 2 archivos
        ├── nonmetals.json
        ├── nonmetals-advanced-data.json
        └── ... (alkali-metals, halogens, noble-gases, etc.)
```

**~5000 líneas · 25 módulos · ES6 · Three.js r128**

---

## 🎯 Roadmap

### ✅ Fase 1 — Base Modular
- [x] Arquitectura ES6 modules
- [x] 118 elementos con propiedades reales
- [x] 3 modos de visualización
- [x] Controles touch/mouse

### ✅ Fase 2 — Física Básica
- [x] Gravedad, fricción, velocidad terminal
- [x] Colisiones con radio efectivo
- [x] Spring physics → XPBD constraints
- [x] Repulsión de Pauli

### ✅ Fase 3 — Cristales
- [x] 4 estructuras cristalinas
- [x] Generador N×N×N
- [x] Modo congelado

### ✅ Fase 4 — Química Avanzada
- [x] Base de datos avanzada por grupo
- [x] Geometría VSEPR real (ángulos desde datos)
- [x] H₂O 104.5°, CH₄ tetraédrico, NH₃ piramidal
- [x] Bonds explícitos en JSON
- [x] Radios covalentes para física y visual
- [x] Sistema de temperatura con color térmico
- [x] Contenedores: piso, techo, esfera con curvatura

### 🔄 Fase 5 — Termoquímica (próximo)
- [ ] Temperatura como parámetro de condición real
- [ ] Presión / volumen
- [ ] Cambios de fase visibles
- [ ] Reacciones simples (H₂ + O₂ → H₂O)

### ⏳ Fase 6 — Reacciones
- [ ] Motor de reacciones químicas
- [ ] Ecuaciones balanceadas
- [ ] Combustión, neutralización

### ⏳ Fase 7 — Visualización Avanzada
- [ ] Orbitales s, p, d, f
- [ ] Isosuperficies de densidad electrónica
- [ ] LOD: protones y neutrones en zoom extremo

---

## 🎮 Controles

### PC
| Acción | Control |
|---|---|
| Rotar escena | Click izq + drag |
| Pan cámara | Click der + drag |
| Zoom | Scroll |
| Mover átomo | Click átomo + drag |
| Agregar átomo | Click vacío (modo Add) |
| Eliminar átomo | Doble click |
| Eliminar molécula | Doble click + Shift |

### Touch (Móvil / Tablet)
| Acción | Control |
|---|---|
| Rotar escena | 1 dedo drag |
| Zoom | Pinch 2 dedos |
| Pan cámara | 2 dedos drag |
| Mover átomo | Tap + drag |
| Agregar átomo | Tap vacío (modo Add) |
| Eliminar átomo | Doble tap |
| Eliminar molécula | Doble tap + mantener |

---

## 🛠️ Para Desarrolladores

```bash
git clone https://github.com/mialmoga/quantum-chemistry-simulator.git
cd quantum-chemistry-simulator
python -m http.server 8000
# http://localhost:8000
```

```javascript
// Crear molécula con bonds explícitos
import { Simulation } from './core/Simulation.js';
const simulation = new Simulation(scene, elementDatabase, config);
simulation.createMolecule(molData, offsetVector);

// Física
simulation.physics.setGravity(true, 5);
simulation.physics.setCeiling(true);
simulation.physics.setSphere(true, 20);
simulation.update();
```

---

## 🙏 Créditos

**Concepto y Desarrollo:** [Brujo](https://github.com/mialmoga)  
**Implementación:** Claude Ámbar (Sonnet 4.5) · Claude Claudio (Sonnet 4.6) — Anthropic  
**Diseño y Filosofía:** Velvet (GPT-5)  
**Datos 118 elementos:** Éter (Gemini)  
**Criterio de Sliders:** Velvet  
**Validación Química:** Maestra de Preparatoria (SLP, México)

**Club de las Mentes Curiosas (CMC)** 🌙

---

## 📜 Licencia

MIT License — Libre para uso educativo y comercial

---

## 🌟 Estado del Proyecto

**Versión:** v0.11 (Física Molecular Correcta)  
**Líneas de código:** ~5000  
**Módulos:** 20+  
**Elementos:** 118 con datos avanzados  
**Moléculas:** 15 (9 con bonds explícitos)  
**Tiempo de desarrollo:** ~14 días  
**Estado:** ACTIVO ✅

---

## 💎 Por Qué es Diferente

1. **Física real** — no solo visualización: Pauli, XPBD, Lennard-Jones, temperatura
2. **Geometría molecular correcta** — ángulos desde datos reales VSEPR, no estimados
3. **Base de datos monumental** — 118 elementos × ~40 propiedades = datos reales
4. **Temperatura de superficies** — piso/techo calientes transfieren energía a átomos
5. **Contenedores físicos** — piso, techo y esfera con curvatura y rebote
6. **Cristales funcionales** — 4 estructuras con enlaces automáticos
7. **Touch nativo** — optimizado para móvil desde el día 1
8. **Código abierto modular** — fácil de extender, bien documentado

---

*"Los sliders no son juguetes: unos representan condiciones reales, otros constantes que solo deformamos para aprender, y otros son puro control del simulador. Si no los separamos, enseñamos mal."* — Velvet

*"No es un simulador. Es un instrumento."* — Velvet

*"Absolute Cinema."* — Brujo 🚬🗿

*INCREDIBOL.* 🌙⚛️💎✨🔥
