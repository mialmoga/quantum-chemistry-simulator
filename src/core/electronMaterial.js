/**
 * electronMaterial.js
 * Shared helper: circular soft-glow texture + PointsMaterial for electrons.
 *
 * Using a canvas-generated texture gives round, soft particles
 * without any external assets. AdditiveBlending makes overlapping
 * electrons accumulate brightness — like real light/energy.
 */

let _cachedTexture = null;

/**
 * Returns a shared soft-circle texture (32×32 canvas, generated once).
 */
export function getElectronTexture() {
    if(_cachedTexture) return _cachedTexture;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Radial gradient: VERY bright center → transparent edge
    const gradient = ctx.createRadialGradient(
        size/2, size/2, 0,       // inner circle center + radius
        size/2, size/2, size/2   // outer circle center + radius
    );
    gradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');   // white hot core
    gradient.addColorStop(0.2, 'rgba(255,255,255,1.0)');   // stay bright longer
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.6)');   // medium glow
    gradient.addColorStop(0.8, 'rgba(255,255,255,0.2)');   // soft edge
    gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');   // transparent edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    _cachedTexture = new THREE.CanvasTexture(canvas);
    return _cachedTexture;
}

/**
 * Create a PointsMaterial optimised for electrons.
 * @param {number} color   - hex color (e.g. 0x00ffff)
 * @param {number} size    - world-space point size
 * @param {number} opacity - base opacity
 * @param {boolean} vertexColors - enable per-point colors
 */
export function makeElectronMaterial(color = 0x00ffff, size = 0.28, opacity = 1.0, vertexColors = false) {
    return new THREE.PointsMaterial({
        color,
        size,
        map:             getElectronTexture(),
        transparent:     true,
        opacity,
        alphaTest:       0.01,          // discard near-transparent fragments
        depthWrite:      false,
        sizeAttenuation: true,
        blending:        THREE.AdditiveBlending,  // overlapping = brighter (light-like)
        vertexColors,
    });
}
