/**
 * shaders.js — Shaders GLSL del QuantumRenderer
 * ================================================
 * Fuente única de verdad para todos los shaders.
 * Importar desde QuantumRenderer.js y NucleusBuilder.js
 *
 * uLodFade — uniform compartido por orbital y esfera para transiciones LOD suaves.
 *   1.0 = completamente visible, 0.0 = invisible.
 *   El renderer hace lerp de este valor cada frame.
 */

// ── Núcleo ────────────────────────────────────────────────────────────────────

export const NUCLEUS_VERT = /* glsl */`
uniform float uTime, uType, uSize;
void main() {
    float v = (uType < 0.5) ? sin(uTime * 15.0) : cos(uTime * 12.0);
    vec4 mvP = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (1.0 + v * 0.3) * (350.0 / -mvP.z);
    gl_Position  = projectionMatrix * mvP;
}`;

export const NUCLEUS_FRAG = /* glsl */`
uniform vec3 uColor;
void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv);
    if (d > 0.25) discard;
    float a = 1.0 - smoothstep(0.18, 0.25, d);
    gl_FragColor = vec4(uColor * 6.0, a);
}`;

// ── Orbitales ─────────────────────────────────────────────────────────────────
// aPhase bakeado por punto — parpadeo que respeta la distribución real del orbital
// uLodFade — controlado por el sistema LOD para fade in/out suave

export const ORBITAL_VERT = /* glsl */`
uniform float uTime, uScale, uLevel, uPmScale, uSpeed, uAmp, uSize, uLodFade;
uniform float uInnerRadius;
attribute float aPhase;
varying float vBlink;
varying float vPresent;
void main() {
    vec3 wpos = position * uPmScale;
    // Hueco nuclear — descartar puntos dentro del radio mínimo
    if (length(wpos) < uInnerRadius) {
        gl_PointSize = 0.0;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);
        vBlink   = 0.0;
        vPresent = 0.0;
        return;
    }
    float spinOffset = aPhase < 0.5 ? 0.0 : 3.14159;
    float spinPhase  = aPhase < 0.5 ? aPhase * 2.0 : (aPhase - 0.5) * 2.0;
    float raw = sin(uTime * (3.0 + uLevel) * uSpeed + spinPhase * 6.2832 + spinOffset);
    vPresent  = pow(max(0.0, raw), 2.0);
    vBlink    = vPresent * uAmp;
    vec4 mvP  = modelViewMatrix * vec4(wpos, 1.0);
    gl_PointSize = uScale * uSize * (0.9 + vBlink * 4.0) / -mvP.z * uLodFade * vPresent;
    gl_Position  = projectionMatrix * mvP;
}`;

export const ORBITAL_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uBright, uEdge, uLodFade;
varying float vBlink;
varying float vPresent;
void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = dot(uv, uv);
    if (d > 0.25) discard;
    if (vPresent < 0.02) discard;
    float a = (1.0 - smoothstep(uEdge, 0.25, d)) * uLodFade * vPresent;
    gl_FragColor = vec4(uColor * (uBright * (0.85 + vBlink * 0.15)), a);
}`;

// ── Esfera Fibonacci (LOD far) ────────────────────────────────────────────────
// Distribución uniforme sin clustering en polos.
// Visible cuando la cámara está lejos — fade-out al acercarse y revelar orbitales.

export const SPHERE_VERT = /* glsl */`
uniform float uTime, uScale, uLodFade, uPulse, uPmScale;
attribute float aPhase;
varying float vBlink;
void main() {
    vBlink = sin(uTime * 1.2 + aPhase * 6.2832) * 0.3;
    vec3 wpos = position * uPmScale;
    vec4 mvP  = modelViewMatrix * vec4(wpos, 1.0);
    gl_PointSize = uScale * (0.9 + vBlink * uPulse) / -mvP.z * uLodFade;
    gl_Position  = projectionMatrix * mvP;
}`;

export const SPHERE_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uLodFade;
varying float vBlink;
void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = dot(uv, uv);
    if (d > 0.25) discard;
    float a = (1.0 - smoothstep(0.18, 0.25, d)) * uLodFade;
    gl_FragColor = vec4(uColor * (2.5 + vBlink), a * 0.7);
}`;

// ── Interfaz de uniforms para ShaderLab ───────────────────────────────────────
// Referencia de qué uniforms debe respetar un shader compatible.
export const SHADER_INTERFACE = {
    base: [
        'uTime', 'uScale', 'uLevel', 'uPmScale',
        'uSpeed', 'uAmp', 'uSize', 'uLodFade',
        'uColor', 'uBright', 'uEdge',
    ],
    valenceExtra: [
        'uBondState', 'uBondProgress', 'uBondStrength',
        'uBondDir', 'uBondColor', 'uExchangePhase',
    ],
    attributes: ['aPhase'],
};

// ── Interfaz de uniforms para Bond shaders ────────────────────────────────────
// Referencia de qué uniforms debe respetar un shader de enlace compatible.
// El ShaderLab y el ML usan esto para generar bond materials compilados.
export const BOND_SHADER_INTERFACE = {
    // Uniforms geométricos — posicionamiento GPU-side del cuello
    geometry: [
        'uPosA', 'uPosB',           // vec3 — posiciones world de los dos átomos
        'uRadA', 'uRadB',           // float — radios covalentes
        'uNeckMin', 'uNeckMax',     // float — grosor mín/máx del cuello
        'uPiOff',                   // vec3 — offset para sub-bonds π
    ],
    // Uniforms visuales — apariencia y animación
    visual: [
        'uTime', 'uScale', 'uBondT', 'uAspect',
        'uColorA', 'uColorB',       // vec3 — colores de los dos átomos
    ],
    // Uniforms LCAO — coeficientes de orbitales moleculares
    // Solo presentes cuando MoleculeFactory inyecta datos de LCAO.json
    lcao: [
        'uCoeffA', 'uCoeffB',       // float — coeficientes normalizados del MO σ
        'uAntibonding',              // float — 0.0 bonding, 1.0 antibonding
    ],
    // Atributos por vértice (geometría estática prebakeada)
    attributes: ['aPhase', 'aT'],
};

// ── Shaders por capa — base para el ShaderLab ─────────────────────────────────
//
// Cada capa tiene su propia personalidad visual:
//   CORE    — casi estático, muy tenue, puntitos pequeños
//   SEMI    — turbulencia leve, más presencia, colores vivos
//   VALENCE — reactivo, incluye todos los uniforms de enlace
//
// El ShaderLab usa estos como punto de partida para diseñar variaciones.
// El usuario puede empezar desde cualquiera y modificarlo con nodos.

// ── Base vertex compartido (core y otros layers simples) ──────────────────────
export const BASE_VERT = /* glsl */`
uniform float uTime, uScale, uLevel, uPmScale, uSpeed, uAmp, uSize, uLodFade;
uniform float uInnerRadius;
attribute float aPhase;
varying float vBlink;
varying float vPresent;

void main() {
    vec3 wpos = position * uPmScale;
    if (length(wpos) < uInnerRadius) {
        gl_PointSize = 0.0;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);
        vBlink = 0.0; vPresent = 0.0;
        return;
    }
    float spinPhase  = aPhase < 0.5 ? aPhase * 2.0 : (aPhase - 0.5) * 2.0;
    float spinOffset = aPhase < 0.5 ? 0.0 : 3.14159;
    float raw = sin(uTime * (3.0 + uLevel) * uSpeed + spinPhase * 6.2832 + spinOffset);
    vPresent  = pow(max(0.0, raw), 2.0);
    vBlink    = vPresent * uAmp;
    vec4 mvP  = modelViewMatrix * vec4(wpos, 1.0);
    gl_PointSize = uScale * uSize * (0.9 + vBlink) / -mvP.z * uLodFade * vPresent;
    gl_Position  = projectionMatrix * mvP;
}`;

// ── Core: casi estático, muy tenue, costo mínimo ──────────────────────────────
export const CORE_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uBright, uEdge, uLodFade;
varying float vBlink;
varying float vPresent;

void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = dot(uv, uv);
    if (d > 0.25) discard;
    // El punto desaparece completamente cuando vPresent = 0
    if (vPresent < 0.02) discard;
    float a = (1.0 - smoothstep(uEdge, 0.25, d)) * uLodFade * vPresent;
    gl_FragColor = vec4(uColor * uBright * 0.6, a * 0.45);
}`;

// ── Semi: turbulencia leve, más presencia ────────────────────────────────────
export const SEMI_VERT = /* glsl */`
uniform float uTime, uScale, uLevel, uPmScale, uSpeed, uAmp, uSize, uLodFade;
uniform float uTurbFreq, uTurbAmp;
uniform float uInnerRadius;
attribute float aPhase;
varying float vBlink;
varying float vPresent;

void main() {
    vec3 wpos = position * uPmScale;
    if (length(wpos) < uInnerRadius) {
        gl_PointSize = 0.0;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);
        vBlink = 0.0; vPresent = 0.0;
        return;
    }
    float spinOffset = aPhase < 0.5 ? 0.0 : 3.14159;
    float spinPhase  = aPhase < 0.5 ? aPhase * 2.0 : (aPhase - 0.5) * 2.0;
    float raw = sin(uTime * (3.0 + uLevel) * uSpeed + spinPhase * 6.2832 + spinOffset);
    vPresent  = pow(max(0.0, raw), 2.0);
    vBlink    = vPresent * uAmp;
    float tb = sin(position.x * uTurbFreq + uTime * 1.8)
             * sin(position.y * uTurbFreq + uTime * 1.26) * uTurbAmp * vPresent;
    wpos += vec3(tb, tb * 0.6, tb * 0.4) * uPmScale;
    vec4 mvP = modelViewMatrix * vec4(wpos, 1.0);
    gl_PointSize = uScale * uSize * (0.9 + vBlink) / -mvP.z * uLodFade * vPresent;
    gl_Position  = projectionMatrix * mvP;
}`;

export const SEMI_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uBright, uEdge, uLodFade;
varying float vBlink;
varying float vPresent;

void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = dot(uv, uv);
    if (d > 0.25) discard;
    if (vPresent < 0.02) discard;
    float a = (1.0 - smoothstep(uEdge, 0.25, d)) * uLodFade * vPresent;
    gl_FragColor = vec4(uColor * uBright * (0.8 + vBlink * 0.2), a * 0.75);
}`;

// ── Valence: reactivo, incluye uniforms de enlace ────────────────────────────
// Este es el shader más completo — base ideal para diseño en el ShaderLab.
// Los uniforms uBond* solo se activan cuando el átomo está en modo 'quantum'.
export const VALENCE_VERT = /* glsl */`
uniform float uTime, uScale, uLevel, uPmScale, uSpeed, uAmp, uSize, uLodFade;
uniform float uInnerRadius;
uniform int   uBondState;
uniform float uBondProgress, uBondStrength, uExchangePhase;
uniform vec3  uBondDir;
attribute float aPhase;
varying float vBlink;
varying float vPresent;
varying float vBondInfluence;

void main() {
    vec3 wpos = position * uPmScale;
    // Hueco nuclear — Valencia tampoco convive con el núcleo
    if (length(wpos) < uInnerRadius) {
        gl_PointSize = 0.0;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);
        vBlink = 0.0; vPresent = 0.0; vBondInfluence = 0.0;
        return;
    }
    float spinOffset = aPhase < 0.5 ? 0.0 : 3.14159;
    float spinPhase  = aPhase < 0.5 ? aPhase * 2.0 : (aPhase - 0.5) * 2.0;
    float raw = sin(uTime * (3.0 + uLevel) * uSpeed + spinPhase * 6.2832 + spinOffset);
    vPresent  = pow(max(0.0, raw), 2.0);
    vBlink    = vPresent * uAmp;

    // Estado 1: Atracción — lóbulo se estira hacia el vecino
    if (uBondState == 1) {
        float align = max(0.0, dot(normalize(wpos), uBondDir));
        wpos += uBondDir * align * uBondStrength * uBondProgress * 0.35;
        vBondInfluence = align * uBondProgress;
    }
    // Estado 2: Repulsión — vibración de imán rechazado
    else if (uBondState == 2) {
        float repel = sin(uTime * 12.0 + aPhase * 3.14) * uBondStrength * 0.2;
        float align = max(0.0, dot(normalize(wpos), uBondDir));
        wpos -= uBondDir * align * repel * uBondProgress;
        vBondInfluence = align * 0.5;
    }
    // Estado 3: Intercambio — pulso viajero hacia el vecino y regresa
    else if (uBondState == 3) {
        float align = max(0.0, dot(normalize(wpos), uBondDir));
        float wave  = sin(uExchangePhase * 6.2832 + aPhase * 6.2832) * 0.5 + 0.5;
        wpos += uBondDir * align * wave * uBondStrength * 0.45;
        vBondInfluence = wave * align;
    }
    else {
        vBondInfluence = 0.0;
    }

    float presence = uBondState == 3
        ? max(vPresent, vBondInfluence)
        : vPresent;

    vec4 mvP = modelViewMatrix * vec4(wpos, 1.0);
    gl_PointSize = uScale * uSize * (0.9 + vBlink + vBondInfluence * 0.4) / -mvP.z * uLodFade * presence;
    gl_Position  = projectionMatrix * mvP;
}`;

export const VALENCE_FRAG = /* glsl */`
uniform vec3  uColor, uBondColor;
uniform float uBright, uEdge, uLodFade;
uniform float uBondProgress, uBondStrength;
uniform int   uBondState;
varying float vBlink;
varying float vPresent;
varying float vBondInfluence;

void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = dot(uv, uv);
    if (d > 0.25) discard;

    // Desaparecer completamente — el electrón no está aquí ahora
    float presence = uBondState == 3
        ? max(vPresent, vBondInfluence)
        : vPresent;
    if (presence < 0.02) discard;

    float a = (1.0 - smoothstep(uEdge, 0.25, d)) * uLodFade * presence;

    vec3 col = uColor;

    if (uBondState == 1) {
        col = mix(uColor, uBondColor, vBondInfluence * 0.5);
    } else if (uBondState == 2) {
        col = mix(uColor, vec3(0.8, 0.9, 1.0), vBondInfluence * 0.4);
    } else if (uBondState == 3) {
        col = mix(uColor, uBondColor, vBondInfluence * 0.7);
        a  *= 1.0 + vBondInfluence * 0.5;
    }

    float brightness = uBright * (0.85 + vBlink * 0.15 + vBondInfluence * 0.3);
    gl_FragColor = vec4(col * brightness, a);
}`;
