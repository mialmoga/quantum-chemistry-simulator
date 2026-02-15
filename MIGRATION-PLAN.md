# 📋 Plan de Migración a Módulos

## ✅ Completado

- [x] Estructura de carpetas
- [x] CSS modular (main, panels, themes)
- [x] README.md
- [x] Versión funcional copiada

## 🔄 En Progreso

### Paso 1: Core Classes
- [ ] `src/core/Atom.js` - Exportar clase Atom
- [ ] `src/core/Bond.js` - Exportar clase Bond
- [ ] `src/core/Molecule.js` - Exportar clase Molecule
- [ ] `src/core/Physics.js` - Motor físico
- [ ] `src/core/Simulation.js` - Loop principal

### Paso 2: Renderer
- [ ] `src/renderer/Scene.js` - Setup Three.js
- [ ] `src/renderer/AtomVisuals.js` - Lógica visual átomos
- [ ] `src/renderer/BondVisuals.js` - Lógica visual enlaces
- [ ] `src/renderer/Camera.js` - Control cámara
- [ ] `src/renderer/Particles.js` - Background particles

### Paso 3: Utilidades
- [ ] `src/utils/raycasting.js` - getWorldPosition, findAtomAtPoint
- [ ] `src/utils/molecule-detector.js` - findMoleculeContaining
- [ ] `src/utils/helpers.js` - showHint, playSound

### Paso 4: UI
- [ ] `src/ui/panels.js` - initUI, updateStats
- [ ] `src/ui/controls.js` - Event listeners botones
- [ ] `src/ui/interactions.js` - Touch/mouse handlers

### Paso 5: Integración
- [ ] Actualizar `index.html` con imports ES6
- [ ] Cargar datos JSON async
- [ ] Conectar todo
- [ ] Testing

## 📝 Notas

### Variables Globales a Mover

**Del HTML actual al módulo correcto:**

```javascript
// → src/core/Simulation.js
let atoms = [];
let bonds = [];
let visualizationMode = 'clouds';
let electronMode = 'all';
let interactionMode = 'add';

// → src/renderer/Scene.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(...);
const renderer = new THREE.WebGLRenderer(...);

// → src/ui/interactions.js
let draggedObject = null;
let dragStartWorld = null;
let touchState = {...};

// → Cargar async
let ELEMENT_DATABASE = {};
let MOLECULES = [];
let selectedElement = null;
```

### Orden de Importación

```javascript
// index.html
import { Scene } from './src/renderer/Scene.js';
import { Simulation } from './src/core/Simulation.js';
import { initUI } from './src/ui/panels.js';
import { initControls } from './src/ui/controls.js';
import { initInteractions } from './src/ui/interactions.js';
```

### Testing Checklist

Después de migrar, verificar:
- [ ] Agregar átomos individuales
- [ ] Crear moléculas preset
- [ ] Arrastrar átomos/moléculas
- [ ] Borrar elementos
- [ ] Cambiar modos visualización
- [ ] Pan/zoom/rotate
- [ ] Touch y mouse funcionan
- [ ] Performance igual o mejor

## 🎯 Próxima Sesión

**Empezar con:** `src/core/Atom.js`

**Estrategia:**
1. Copiar clase Atom del HTML
2. Limpiar dependencias globales
3. Exportar como módulo ES6
4. Importar en módulo de prueba
5. Verificar funcionalidad

**Tiempo estimado:** 2-3 horas para core classes

---

*Última actualización: 15 Feb 2026*
