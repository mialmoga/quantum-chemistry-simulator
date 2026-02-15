# 🚀 Próximos Pasos - Modularización

## ✅ Lo que Ya Está Hecho

### Core (100%)
- ✅ `src/core/Atom.js` - Clase átomo modular
- ✅ `src/core/Bond.js` - Clase enlace modular
- ✅ `src/core/Molecule.js` - Clase molécula modular
- ✅ `src/core/Simulation.js` - Estado central

### Utils (100%)
- ✅ `src/utils/raycasting.js` - Funciones de raycast
- ✅ `src/utils/helpers.js` - Helpers generales

### Styles (100%)
- ✅ `src/styles/main.css`
- ✅ `src/styles/panels.css`
- ✅ `src/styles/themes.css`

### App Core (80%)
- ✅ `src/app.js` - Setup básico, init, UI

## ⏳ Lo que Falta (1-2 horas)

### 1. Interactions Module (30 min)

Crear `src/ui/interactions.js` con los handlers de touch/mouse.

Del HTML original (líneas 965-1200), extraer:
- `handlePointerDown()`
- `handlePointerMove()`
- `handlePointerUp()`
- Touch handlers (`touchstart`, `touchmove`, `touchend`)
- Wheel handler

**Template:**
```javascript
// src/ui/interactions.js
import { 
    simulation, camera, scene, 
    getWorldPosition, findAtomAtPoint,
    updateStats, playSound 
} from '../app.js';

let draggedObject = null;
let dragStartWorld = null;
// ... resto del estado de drag

export function initInteractions(renderer) {
    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    // ... resto de listeners
}

function handlePointerDown(e) {
    // Código del HTML líneas 995-1025
}

// ... resto de funciones
```

### 2. Actualizar index.html (15 min)

Reemplazar todo el `<script>` inline con:

```html
<script type="module" src="src/app.js"></script>
```

### 3. Testing (15 min)

Servidor local:
```bash
python -m http.server 8000
```

Abrir: http://localhost:8000

Verificar:
- [ ] Agregar átomos
- [ ] Crear moléculas
- [ ] Arrastrar
- [ ] Borrar
- [ ] Cambiar modos
- [ ] Touch funciona
- [ ] Performance OK

### 4. Fix Imports si Falla (30 min)

Si hay errores de `THREE is not defined`:

En cada módulo que usa Three.js, agregar al inicio:
```javascript
// Si Three.js no está disponible globalmente
const THREE = window.THREE;
```

O mejor: importar Three.js como módulo ES6:
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.skypack.dev/three@0.128.0"
  }
}
</script>
```

## 🎯 Orden Recomendado

1. **Crear interactions.js** (copiar del HTML original)
2. **Actualizar app.js** para importar interactions
3. **Actualizar index.html** (quitar inline script, agregar module)
4. **Probar en servidor local**
5. **Fix any bugs**
6. **Commit a GitHub**

## 📝 Plantilla interactions.js

```javascript
/**
 * interactions.js
 * Touch and mouse event handlers
 */

import { 
    simulation, 
    camera, 
    scene, 
    renderer,
    selectedElement,
    getWorldPosition,
    findAtomAtPoint,
    updateStats,
    playSound,
    showHint
} from '../app.js';

let draggedObject = null;
let dragStartWorld = null;

let touchState = {
    touches: [],
    initialDistance: 0,
    initialCameraZ: 0,
    mode: null,
    hasMoved: false,
    wasTwoFinger: false,
    gestureType: null
};

let isPointerDown = false;
let pointerStart = { x: 0, y: 0 };
let pointerMoved = 0;
let previousMouse = { x: 0, y: 0 };
const DRAG_THRESHOLD = 15;

export function initInteractions() {
    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('mouseup', handlePointerUp);
    
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
}

function handlePointerDown(e) {
    // COPIAR del HTML original línea 995
}

function handlePointerMove(e) {
    // COPIAR del HTML original línea 1011
}

function handlePointerUp(e) {
    // COPIAR del HTML original línea 1031
}

function handleTouchStart(e) {
    // COPIAR del HTML original línea 1076
}

function handleTouchMove(e) {
    // COPIAR del HTML original línea 1104
}

function handleTouchEnd(e) {
    // COPIAR del HTML original línea 1184
}

function handleWheel(e) {
    // COPIAR del HTML original línea 1230
}
```

## 🔧 Debugging

Si algo no jala:
1. Abrir F12 Console
2. Ver errores
3. Verificar rutas de imports
4. Verificar que THREE esté disponible
5. Verificar server está corriendo

## 🎉 Cuando Termine

Tendrás:
- ✅ Código modular escalable
- ✅ Fácil de mantener
- ✅ Fácil agregar features (gravedad, cristales, etc)
- ✅ Listo para Fase 2: Simulador

---

**Tiempo estimado total: 1-2 horas**

**Dificultad: Media (principalmente copy-paste inteligente)**

**Beneficio: BASE LIMPIA para todo lo que sigue** 🚀
