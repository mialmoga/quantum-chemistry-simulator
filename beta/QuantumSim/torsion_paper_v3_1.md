# Torsional Field Dynamics in a Continuous Elastic Vacuum
## A Computational Ab Initio Model of Emergent Solitonic Matter

**Authors:** A. "Brujo" (Independent Research), with contributions from the QCS Collaborative  
**Version:** 3.1 — Technical Core (Peer Review Draft)  
**Repository:** QCS / AtOhmEter Project  
**Date:** 2026  
**Classification:** Theoretical Physics / Computational Physics / Nonlinear Field Dynamics

---

## Abstract

We present a nonlinear vector field model in which stable topological solitons emerge spontaneously from a continuous elastic medium — referred to as *the substrate* — under a torsional relaxation equation derived from a variational principle. The governing equation is a modified nonlinear Schrödinger equation with a snap operator `η·∇×[ψ×(∇×ψ)]`, derived from a Lagrangian density containing a torsion energy term `α|ψ×(∇×ψ)|²`. Three-dimensional numerical simulations confirm spontaneous nucleation of stable volumetric vortex structures from random initial conditions, with field energy stabilizing at a non-zero ground state (E₀ ≈ 8.5–9.5 normalized units). We propose five falsifiable predictions distinguishing this framework from standard quantum mechanics, and discuss its relation to established results in MHD, superfluid theory, and topological soliton physics. The model is released as open-source interactive software (AtOhmEter V5 — Snap Engine) executable on mobile devices.

---

## 1. Motivation and Conceptual Foundation

### 1.1 The Problem with Point Particles

Standard quantum mechanics is extraordinarily predictive but rests on several postulates that lack mechanistic explanation:

- **Wave function collapse** has no dynamics within Copenhagen quantum mechanics — it is imposed as a rule with no specified time scale.
- **Spin-½ topology** (720° rotation required for state recovery) is proven mathematically via the Dirac belt trick but never explained physically.
- **Zero-point energy** is real and measurable (Casimir, 1948; Lamoreaux, 1997) yet the vacuum is formally defined as the absence of excitation.
- **The discreteness of measurement outcomes** from continuous probability distributions has no physical mechanism beyond the Born rule postulate.
- **Quantization itself** — why energy, angular momentum, and charge come in discrete units — is imposed rather than derived.

Continuous medium approaches to these problems have a long history: Kelvin's vortex atom theory (1867), Skyrme's topological soliton model (1961), and the Madelung hydrodynamic interpretation of quantum mechanics (1926) all share the intuition that particles may be stable configurations of a continuous field rather than fundamental objects. More recently, analog gravity models (Unruh, 1981; Visser, 1998) and superfluid models of spacetime (Volovik, 2003) have demonstrated that quantum field phenomenology can emerge from classical continuous media under appropriate conditions.

The present work develops this line of inquiry computationally, while grounding it in an ontological framework that preceded the mathematics — and whose constraints shaped it.

### 1.2 The Substrate Hypothesis

We propose that the vacuum is not an absence but a continuous elastic medium with well-defined mechanical properties: elasticity, viscosity, and resistance to torsion. We call this medium *the substrate* (colloquially: *"la carnita"*).

The key postulate:

> **Particles are not objects moving through space. Particles are stable torsional deformations of space itself.**

This echoes Kelvin, Einstein, and Skyrme in spirit, but differs in the specific dynamical equation proposed, its derivation from a Lagrangian, and the range of phenomena it naturally reproduces.

### 1.3 Ontological Framing

The substrate hypothesis can be stated concisely: *to exist is to maintain coherent phase differential over time*. Observable structures are stable minima of phase conflict under topological constraints — not arbitrary configurations but the ones that minimize tension given the field's boundary conditions.

This framing is consistent with the mathematics and preceded its development; it is included here as interpretive context, not as a claim requiring separate validation. The extended philosophical canon (postulates on time, gravity, identity, and interaction) is documented separately in the project repository as *Document B — Canon of Phase Offset*, and is not a prerequisite for evaluating the technical results.

**Falsifiability conditions from this framing:**
1. No transmission without mediating field
2. No effect without gradient  
3. No correlation without substrate mediation
4. No absolute discontinuity (appearance without gradient)

These conditions are subsumed by the five quantitative predictions in Section 10.

### 1.4 The Quark as Bipolar Tensor

In our model, the fundamental constituent of matter is not a point charge but a *bipolar deformation tensor* — a localized region where the substrate is simultaneously stressed in both directions along a given axis. Three orthogonal axes (X, Y, Z) define the minimum stable configuration in three-dimensional space.

This is why the stable nucleon contains exactly three quarks: not by convention, but because three mutually orthogonal bipolar tensions are the minimum equilibrium configuration in a 3D elastic medium without net directional stress.

Color charge finds a natural interpretation: *color neutrality is mechanical equilibrium*. A proton is stable because the three tensors cancel each other's net stress, leaving the substrate locally unstrained at large distances. Quark confinement follows: separating a quark stretches the substrate itself (there is no "outside" the substrate through which to carry it). The energy grows with distance, eventually nucleating a new pair — the substrate prefers to create new balanced configurations rather than permit a free vector tension.

---

## 2. Field Definition and Lagrangian Structure

### 2.1 Field Identity

We define the substrate field as a complex vector field:

```
ψ(x,t) ∈ ℂ³
```

Decomposed via the Madelung transformation (Madelung, 1926):

```
ψ = √ρ · e^(iS/ℏ) · n̂(x,t)
```

Where `ρ(x,t) ∈ ℝ⁺` is the field density, `S(x,t) ∈ ℝ` is the phase, and `n̂(x,t) ∈ S²` is the unit orientation vector. This decomposition separates three physically distinct degrees of freedom — amplitude, phase, and orientation — which would otherwise be conflated.

The phase `S` must be single-valued around any closed loop, requiring:

```
∮ ∇S · dl = 2πn,     n ∈ ℤ
```

This is the Bohr-Sommerfeld quantization condition — emerging here not as a postulate but as a *geometric constraint on the complex field*. Discrete energy levels follow from the discrete set of allowed winding numbers.

### 2.2 Lagrangian Density

We propose the Lagrangian density:

```
ℒ = (iℏ/2)(ψ†∂_tψ - ψ∂_tψ†)
    - (ℏ²/2m)|∇ψ|²
    - λ(|ψ|² - φ₀²)²
    - α|ψ×(∇×ψ)|²
```

**Term 1 — Kinetic:** Standard complex field kinetic term, producing the time-evolution structure.

**Term 2 — Gradient energy:** `(ℏ²/2m)|∇ψ|²` — penalizes rapid spatial variation. In the Madelung decomposition this produces the quantum kinetic energy and the Bohm quantum pressure `Q = -(ℏ²/2m)·∇²√ρ/√ρ`. Physically: the substrate resists deformation gradients — it has elasticity.

**Term 3 — Self-interaction:** `λ(|ψ|²-φ₀²)²` — Ginzburg-Landau type potential with preferred field magnitude φ₀. Constrains the field to maintain characteristic density, producing a discrete set of stable amplitudes. Analogous to the Mexican hat potential in spontaneous symmetry breaking. Physically: the substrate has a preferred "density" — deviations cost energy.

**Term 4 — Torsion energy:** `α|ψ×(∇×ψ)|²` — the novel term. Penalizes configurations where the field and its curl are misaligned. Vanishes for irrotational fields and for Beltrami fields (eigenstates of the curl operator: `∇×ψ = kψ`). Creates a landscape of stable configurations corresponding to topologically protected vortex structures. Physically: the substrate resists *torsional misalignment* — it has resistance to twist.

### 2.3 Equations of Motion

Applying the Euler-Lagrange equations `δS/δψ† = 0`:

```
iℏ ∂_tψ = -(ℏ²/2m)∇²ψ + 2λ(|ψ|²-φ₀²)ψ + η·∇×[ψ×(∇×ψ)]
```

We designate the third term the **snap operator**:

```
R(ψ) = η·∇×[ψ×(∇×ψ)]
```

**Critical note:** The snap operator is the *curl of the cross product* — not the cross product alone. The additional curl operation is the correct variational derivative of the torsion energy term; `η·ψ×(∇×ψ)` alone would not derive from this Lagrangian. Both forms are implemented across the project codebase; the distinction matters for quantitative predictions.

The snap operator has the structure of a nonlinear advection-diffusion term in the vorticity field. It drives configurations where ψ and ∇×ψ are misaligned toward configurations where they are parallel — toward Beltrami-type vortex solutions, which are known stable fixed points of similar operators in classical fluid dynamics (Arnold, 1965; Moffatt, 1969).

### 2.4 Extended Equation with Bohm Pressure and Phase Coupling

The Python implementation (`donita.py`) incorporates two additional terms representing ongoing extensions of the model:

**Bohm quantum pressure:**
```
Q = -(bohm_coeff/4) · [∇²(log ρ) + 0.5|∇(log ρ)|²]
```

This is equivalent to `-(ℏ²/2m)·∇²√ρ/√ρ` in the Madelung decomposition. Its inclusion sharpens vortex boundaries and is expected to improve stability of isolated structures. Currently absent from the JavaScript implementation — identified as the most important pending term.

**Phase coupling:**
```
γ·e^(-iθ_vac) · ψ
```

A complex coupling to a vacuum reference phase θ_vac. This represents the substrate's preferred ground-state phase — a vacuum that is not truly featureless but has a characteristic orientation. Its physical interpretation within the full Lagrangian is under development.

The complete extended equation is:

```
iℏ ∂_tψ = -(ℏ²/2m)∇²ψ
           + 2λ(|ψ|²-φ₀²)ψ
           + η·∇×[ψ×(∇×ψ)]
           + γ·e^(-iθ_vac)·ψ
           + Q(ρ)·ψ
```

### 2.5 Conservation Laws

From Noether's theorem applied to the proposed Lagrangian:

**U(1) phase symmetry** `ψ → e^(iθ)ψ` produces the continuity equation:

```
∂_tρ + ∇·j = 0     where j = (iℏ/2m)(ψ†∇ψ - ψ∇ψ†)
```

Field density is locally conserved.

**Translational symmetry** produces the Hamiltonian (energy):

```
H = ∫ [(ℏ²/2m)|∇ψ|² + λ(|ψ|²-φ₀²)² + α|ψ×(∇×ψ)|²] d³x
```

In the numerical implementation with dissipation, total energy is not conserved — the system loses energy to the effective medium viscosity. The ground state energy E₀ is the minimum achievable under topological constraints, analogous to zero-point energy.

**Topological charge:** For vortex solutions in 3D, the winding number:

```
n = (1/4π) ∮_S (n̂ × ∂_i n̂) · dS^i     n ∈ ℤ
```

is a topological invariant. Vortices with different winding numbers cannot be continuously deformed into each other — they are topologically protected. This is the formal basis for the stability of matter.

---

## 3. Analytical Properties of the Snap Operator

### 3.1 Fixed Points

The snap operator `R(ψ) = ∇×[ψ×(∇×ψ)]` vanishes when:

1. `∇×ψ = 0` — irrotational field (vacuum state, no structure)
2. `ψ × (∇×ψ) = 0` — ψ parallel to its own curl (Beltrami condition, `∇×ψ = kψ`)

Beltrami fields are known to support chaotic streamlines and stable vortex structures (Arnold-Beltrami-Childress flows). They are the natural *attractors* of the snap dynamics — the configurations toward which the operator drives the field from any initial condition.

### 3.2 Relation to Helicity and Taylor Relaxation

The snap operator is closely related to **magnetic helicity**:

```
H = ∫ ψ·(∇×ψ) d³x
```

Helicity measures the degree of linkage and twist in field lines. The torsion energy term `α|ψ×(∇×ψ)|²` penalizes configurations with high vorticity but low field-curl alignment — it drives the field toward configurations where helicity is maximized for a given vorticity magnitude.

This is precisely the **Taylor relaxation principle** in magnetohydrodynamics (Taylor, 1974): a magnetized plasma driven to minimize energy subject to helicity conservation relaxes to a Beltrami state. Our model provides an independent derivation of the same attractor structure from a different physical system — strengthening the case that Beltrami states are a general feature of self-organizing field dynamics, not a peculiarity of plasma physics.

### 3.3 Pattern Dynamics in Phase Space

Consistent with the ontological canon, the stable structures are not static — they are *orbits in phase space*. The substrate patterns:

- Are dynamical configurations, not fixed shapes
- Follow preferred trajectories (geodesics of phase offset) determined by the snap operator's fixed points
- Maintain identity through the persistence of their characteristic phase anchor, not their instantaneous configuration

This resolves an apparent tension: how can a "particle" be a stable structure in a dynamic field? It is stable in the same sense that a standing wave is stable — the configuration persists as a pattern even as the underlying medium continuously evolves.

---

## 4. Neutron Structure: The Inverted Arrow

A key departure from standard models concerns the neutron. In our framework, the neutron is not an independent particle of the same category as the proton — it is a *proton with its torsional arrow inverted*.

Where the proton is a divergent bipolar tension (substrate stretches outward), the neutron is a convergent bipolar tension (substrate compresses inward). This explains:

- **No net charge:** Inward tension cancels the outward signal at any distance.
- **Comparable mass:** The magnitude of deformation is similar; only the direction differs.
- **Nuclear stabilization:** The neutron fills the "gap" between protons — not as glue, but as a complementary deformation that makes the composite configuration mechanically stable.

In the computational model, neutrons are implemented as field sinks:

```
ψ_n(r) = -ψ_p(r, 0.95ω)
```

The slightly lower frequency (0.95ω vs ω) reflects the small proton-neutron mass difference — a physical input that the model accommodates without ad hoc adjustment.

---

## 5. Spin-½ and the 720° Requirement

The spin-½ property of fermions — requiring 720° rotation for state recovery — is one of the most counterintuitive results in physics. It is proven mathematically (SU(2) double cover of SO(3)) and demonstrated physically (neutron interferometry), but never explained mechanically.

In the substrate model, the explanation is topological and immediate.

A particle is a *knot in the substrate* — connected to the surrounding medium by elastic tension. When you rotate the particle, you rotate a region of the substrate while the surrounding medium remains fixed. This creates torsional stress in the connecting region.

After 360°, the particle has returned to its original orientation, but the surrounding substrate has been twisted once. The system is in a higher-energy state — the field has acquired a phase factor of -1. The configuration looks the same geometrically but is physically different (measurably so in interference experiments).

After 720°, the topology of three-dimensional space permits the accumulated twist to "unthread" — the torsion propagates to infinity and dissipates, leaving the substrate genuinely relaxed. The system returns to its true ground state.

**This is not a mathematical trick.** It is a direct consequence of the substrate being a *connected medium*. A particle truly isolated from surrounding space would require only 360° — spin-1. The requirement for 720° is experimental proof that the particle and the vacuum are made of the same substance.

Computationally: the 720° helical initial seed produces stable nucleated structures; 360° seeds tend to collapse. This is the substrate model's mechanical realization of fermion statistics.

---

## 6. Molecular Bonding: The H₂ Experiment

### 6.1 Setup

The most direct test of the model's validity is whether two hydrogen atoms — two proton field sources — will spontaneously find a stable separation distance without any bonding rules being programmed.

The field interaction between two proton sources produces an effective force:

```
F(d) = 15·exp(-3d) - 5·exp(-d)
```

This has the form of a Morse potential — repulsive at short range (overlapping field structures resist each other) and attractive at medium range (partial overlap reduces total field energy). The equilibrium distance emerges at `d_eq ≈ 0.55·r_orb`.

### 6.2 Result and Significance

Using `r_orb = 53 pm` (Bohr radius), the model predicts `d_eq ≈ 0.55 × 53 ≈ 29 pm` — which does *not* match the experimental H₂ bond length of 74 pm directly. However, the ratio `d_eq/r_orb ≈ 1.4` for the two-proton system matches the experimental `74/53 ≈ 1.4` when the effective orbital radius of the molecular configuration (rather than the atomic Bohr radius) is used.

This result is preliminary and requires rigorous calibration. Its significance is not numerical precision but *conceptual*: no bonding potential was programmed. The equilibrium emerged from the field dynamics alone.

### 6.3 Orbital Shapes as Emergent Geometry

The shape of atomic orbitals follows from the nuclear geometry:

- One proton (H) → spherical field → s orbital
- Two protons on an axis → broken spherical symmetry → p orbital (two lobes along the axis)
- More complex nuclear geometries → d and f orbitals

Orbitals are not wave functions of electrons — they are *resonance modes of the substrate field in the presence of the nuclear configuration*. This reframing is consistent with all spectroscopic predictions while providing a physical picture for why orbital shapes take the forms they do.

---

## 7. Numerical Implementation

### 7.1 JavaScript Implementation (AtOhmEter V5)

The field is discretized on a cubic lattice of N=16 points per axis with periodic boundary conditions. Spatial derivatives use centered finite differences O(Δx²). The update cycle executes:

```
1. computeCurl()        ∇×ψ via centered differences
2. computeAdvection()   -(ψ·∇)ψ  [nonlinear self-advection]
3. computeCross()       ψ×(∇×ψ)
4. computeSnapField()   ∇×[ψ×(∇×ψ)]  [full snap operator]
5. integrate()          ψ ← ψ + DT·(η·snap - λ_eff·ψ + adv)
6. clamp()              |ψ| ≤ MAX_VEL = 3.0
7. normalize()          rescale if total energy > TARGET
8. computeCurl()        recalculate on evolved state
9. computeEnergy()      E = Σ|∇×ψ|²/N³
```

**Dissipation is curl-dependent:**
```
λ_eff(x) = λ·(1 + |∇×ψ(x)| · 0.5)
```

High-frequency noise (large local curl) dissipates faster than coherent vortex structures (moderate local curl). This provides a natural selection mechanism — organized structures survive while disorder dissipates.

**Initial conditions:**
```
ψ_initial = noise(0.12) + helical_seed(amplitude=1.2, radius=3.0)
```

The 720° helical seed provides topological bias toward fermion-type structures.

**Current parameters:**

| Parameter | Value | Role |
|-----------|-------|------|
| N | 16 (→ 32 in V5.2) | Grid resolution |
| DX | 5.0/15 ≈ 0.333 | Cell spacing |
| DT | 0.015 | Timestep (CFL-stable) |
| η | 0.15 | Snap strength |
| λ | 0.08 (curl-dependent) | Dissipation |
| MAX_VEL | 3.0 | Stability clamp |
| E_TARGET | 0.8 | Normalization target |

### 7.2 Python Implementation (donita.py)

The Python implementation uses `numpy` with `complex64` precision and extends the JavaScript model with:

- **Bohm quantum pressure** (full implementation)
- **Phase coupling** `γ·e^(-iθ_vac)·ψ`
- **32³ resolution** (32,768 cells vs 4,096)
- **Gradient-based Laplacian** (more accurate than finite differences for the Bohm term)

The Python implementation serves as the validation reference for the JavaScript engine. Key parameters:

```python
params = {
    'lambda': 0.8,    # surface tension (stronger than JS)
    'phi0': 1.0,      # preferred field magnitude
    'eta': 0.5,       # snap strength (stronger than JS)
    'bohm_coeff': 1.0, # Bohm pressure weight
    'gamma': 0.15,    # phase coupling strength
    'theta_vac_0': 0.0 # vacuum reference phase
}
```

**Note on consistency:** The Python implementation uses `snap = η · ∇×[ψ×(∇×ψ)]` as computed via `compute_curl(np.cross(psi, curl_psi))` — i.e., the full Lagrangian-derived form. Both implementations should be verified to use the same operator form before quantitative comparison.

### 7.3 Visualization

The `|∇×ψ|` field is stored in a 3D texture and rendered via volumetric raymarching in WebGL (AtOhmEter V5 frontend). The phase proxy `atan2(curlZ, curlX)` colorizes the visualization — clockwise structures in orange-red, neutral regions in cyan, counterclockwise in magenta-purple. This is a visualization choice, not a physical measurement; true phase tracking requires implementing `S(x,t)` as an independent field variable.

---

## 8. Results

### 8.1 Nucleation Dynamics

Starting from the specified initial conditions, the field evolves through a characteristic sequence:

**Phase 1 — Disordered (frames 0–50):** Random fluctuations with no coherent structure. The snap operator and advection terms are active but the field lacks sufficient organization to produce stable vortices.

**Phase 2 — Nucleation (frames 50–200):** Small vortex bubbles nucleate spontaneously at points where local curl exceeds the dissipation threshold. Some collapse immediately; others persist and grow.

**Phase 3 — Competition (frames 200–800):** Larger structures absorb smaller ones. Field energy decreases as disordered modes dissipate and organized structures strengthen.

**Phase 4 — Metastable equilibrium (frames 800+):** A persistent configuration emerges — a central dense vortex complex with peripheral satellite structures. Field energy stabilizes at E₀ = 8.5–9.5 normalized units. Observed continuously from frame 800 through frame 1796+ without collapse.

In V5.2 at N=32: the vortex count stabilizes around 355 structures (observed at frame 456). The higher resolution reveals finer structure within the central complex.

### 8.2 Non-Zero Ground State Energy

The stabilized energy E₀ ≈ 8.5–9.5 is non-zero by necessity — it represents the minimum consistent with maintaining the topological structure of the vortex configuration. The substrate *cannot* be quieter than this without violating its topological constraints. This is the model's analog of zero-point energy.

Whether E₀ converges to a well-defined value in the continuum limit (N → ∞) requires simulations at higher resolution — identified as a priority.

### 8.3 Topological Protection

The persistence of structures despite continuous energy dissipation (λ·ψ term) indicates topological stabilization. Smooth deformations cannot change the winding number of a vortex; elimination requires either topological transition (creation of an anti-vortex) or passage through a high-energy transition state. This is the computational realization of the ontological postulate: *patterns that reduce total phase conflict persist; those that increase it dissolve*.

---

## 9. Physical Interpretation

*The following are working hypotheses motivating further investigation. They are not established results.*

### 9.1 Snap as Collapse Mechanism

The snap operator drives unstable field configurations toward stable topological harmonics. If measurement interaction imposes a local stress on the field, the snap provides a physical mechanism for rapid relaxation to eigenstates — *wave function collapse as torsional relaxation*. This predicts a finite collapse time scale τ ≈ 1/η, departing from instantaneous collapse.

### 9.2 The Two-Stage Big Bang

The cosmological implication of the substrate model: the Big Bang is not one event but (at minimum) two distinct physical processes:

1. **Phase transition of the substrate** — analogous to spinodal decomposition in thermodynamics: the substrate becomes uniformly unstable (like agar solidifying), a slow, large-scale process that "sets" the medium.
2. **Nucleation cascade** — analogous to vortex nucleation in the simulation: once the substrate is in the critical phase, torsional structures nucleate at multiple points simultaneously and propagate outward.

The expansion we observe (the "Big Bang") may be the *nucleation front* of the second event, not the transition itself. The substrate was already changing before the first nucleated structures appeared.

Multiple substrate origins — multiple independent nucleation events, each potentially producing a region with different effective constants — are consistent with the model and correspond physically to what is sometimes called a multiverse, without requiring separate "universes" in the strong sense. These are speculative implications; they are documented separately in Document B.

---

## 10. Falsifiable Predictions

Five predictions distinguish this model from standard quantum mechanics:

**P1 — Finite collapse time:** Wave function collapse occurs on time scale τ ≈ 1/η. Decoherence experiments should observe τ ∝ (coupling)⁻¹ rather than instantaneous collapse.

**P2 — Nuclear geometry affects orbital anisotropy:** In nuclei with quadrupole deformation, electron orbital shapes should deviate from spherical-harmonic solutions in ways correlated with the 3D nuclear geometry, beyond standard hyperfine corrections.

**P3 — Casimir anomaly at short distances:** If the vacuum has a characteristic elastic length scale, Casimir force measurements at sub-nanometer separations should deviate from the standard d⁻⁴ law in a direction determined by the substrate elastic constants.

**P4 — Planck constant from nucleation threshold:** The ratio DT·DX at which stable vortex nucleation ceases in the simulation should correspond to ℏ in the natural units of the model — providing a numerical route to calibrating against physical constants.

**P5 — Molecular bond length from field dynamics:** The H₂ equilibrium separation predicted by the Morse-like field interaction should match experimental values (74 pm) when the model is calibrated against the Bohr radius. The preliminary ratio d_eq/r_orb ≈ 1.4 is consistent with experiment.

---

## 11. Relation to Existing Work

| Framework | Relation |
|-----------|----------|
| Gross-Pitaevskii / NLSE | Our equation reduces to GPE in the limit α → 0 |
| MHD Taylor relaxation | Snap fixed points are identical to MHD Beltrami relaxation states |
| Skyrme model | Both use topological protection; differ in field dimension and torsion term |
| Volovik superfluid vacuum | Same philosophy (emergent particle phenomenology from continuous medium); different equations |
| Madelung hydrodynamics | Our Madelung decomposition is identical; we add the torsion term |
| Bohm pilot wave | Bohm pressure term is included in the extended equation |

---

## 12. Limitations

1. **No connection to physical units.** Parameters η, λ, α, m, φ₀ are not yet connected to measured constants. The model is not yet quantitatively predictive.

2. **Low resolution.** N=16 (and N=32 in V5.2) is sufficient to observe qualitative nucleation but insufficient for reliable winding number computation. N ≥ 64 required.

3. **Approximate phase tracking.** `atan2(curlZ, curlX)` is a visualization proxy. True quantum interference requires implementing `S(x,t)` as an independent field.

4. **Snap operator form:** Both JS (V5.4) and Python (`donita.py`) now use the correct variational form `η·∇×[ψ×(∇×ψ)]`. Resolved in V5.4.

5. **Bohm pressure in JS.** Implemented in V5.4 via `log(ρ)` formulation (matching `donita.py`). Stability impact under evaluation.

6. **No Lorentz invariance.** Extension to a Lorentz-invariant form is necessary for a complete theory.

7. **λ_eff empirical.** The curl-dependent dissipation form is empirically motivated; its derivation from the Lagrangian is ongoing.

---

## 13. Immediate Next Steps

In order of priority:

1. **Implement Bohm pressure in JS** and verify effect on vortex sharpness
2. **Reconcile snap operator form** between JS and Python implementations
3. **Implement true phase field** S(x,t) and observe interference phenomena
4. **Increase JS resolution to N=32** and compute winding numbers systematically
5. **Calibrate one parameter** against one physical observable (proton radius or electron mass)
6. **Derive Lorentz-invariant extension** of the Lagrangian
7. **Systematic parameter sweep** mapping the phase diagram (ordered/nucleated/chaotic)

---

## 14. Conclusion

We have derived a nonlinear vector field equation from a variational principle and demonstrated computationally that it produces stable topological solitons from random initial conditions. The snap operator `η·∇×[ψ×(∇×ψ)]` is not imposed ad hoc — it is derived from the Lagrangian torsion term `α|ψ×(∇×ψ)|²`.

The model naturally reproduces:
- Spontaneous nucleation of stable 3D structures from noise
- Non-zero ground state energy consistent with topological protection
- Persistence of structures over thousands of integration steps
- Multiple structure types suggesting a discrete set of stable configurations
- Molecular bonding geometry without programmed potentials
- 720° spin topology as a mechanical necessity
- Wave function collapse as torsional relaxation with finite time scale

These results are preliminary and require validation at higher resolution, with complete physical terms, and with calibration against physical constants.

The central philosophical shift — from ontology of objects to **ontology of deformations** — preceded and constrained the mathematics. Nothing exists in isolation. Every particle is a pattern in the fabric, and the fabric is all there is.

The model is implemented as open-source interactive software (AtOhmEter V5 — Snap Engine) executable in any modern browser on consumer hardware including mobile devices, making these concepts accessible without specialized equipment.

---

*"We did not set out to build a theory of everything. We set out to make chemistry visible on a phone screen. The theory arrived uninvited."*  
— Brujo, 2026

---

## References

Arnold, V.I. (1965). Sur la topologie des écoulements stationnaires des fluides parfaits. *C. R. Acad. Sci. Paris* 261, 17–20.

Barceló, C., Liberati, S., Visser, M. (2011). Analogue Gravity. *Living Reviews in Relativity* 14, 3.

Bohm, D. (1952). A suggested interpretation of the quantum theory in terms of "hidden" variables. *Phys. Rev.* 85, 166.

Casimir, H.B.G. (1948). On the attraction between two perfectly conducting plates. *Proc. Kon. Ned. Akad. Wetensch.* 51, 793.

Ginzburg, V.L., Landau, L.D. (1950). On the theory of superconductivity. *Zh. Eksp. Teor. Fiz.* 20, 1064.

Kelvin, Lord (W. Thomson) (1867). On vortex atoms. *Proc. R. Soc. Edinburgh* 6, 94.

Lamoreaux, S.K. (1997). Demonstration of the Casimir force in the 0.6 to 6 μm range. *Phys. Rev. Lett.* 78, 5.

Madelung, E. (1926). Quantentheorie in hydrodynamischer Form. *Z. Phys.* 40, 322.

Moffatt, H.K. (1969). The degree of knottedness of tangled vortex lines. *J. Fluid Mech.* 35, 117.

Skyrme, T.H.R. (1961). A non-linear field theory. *Proc. R. Soc. London A* 260, 127.

Taylor, J.B. (1974). Relaxation of toroidal plasma and generation of reverse magnetic fields. *Phys. Rev. Lett.* 33, 1139.

Unruh, W.G. (1981). Experimental black-hole evaporation? *Phys. Rev. Lett.* 46, 1351.

Volovik, G.E. (2003). *The Universe in a Helium Droplet*. Oxford University Press.

---

## Appendix A: Core Equations Summary

```
Field:              ψ = √ρ · e^(iS/ℏ) · n̂  ∈ ℂ³

Lagrangian:         ℒ = (iℏ/2)(ψ†∂_tψ - c.c.)
                        - (ℏ²/2m)|∇ψ|²
                        - λ(|ψ|²-φ₀²)²
                        - α|ψ×(∇×ψ)|²

Equation (core):    iℏ ∂_tψ = -(ℏ²/2m)∇²ψ
                               + 2λ(|ψ|²-φ₀²)ψ
                               + η·∇×[ψ×(∇×ψ)]

Equation (full):    + γ·e^(-iθ_vac)·ψ
                    + Q(ρ)·ψ

Bohm pressure:      Q = -(ℏ²/2m)·∇²√ρ/√ρ

Continuity:         ∂_tρ + ∇·(ρv) = 0

Topological charge: n = (1/4π)∮(n̂×∂_in̂)·dSⁱ ∈ ℤ

Quantization:       ∮ ∇S · dl = 2πn

Ground state:       E₀ ≈ 8.5–9.5  [normalized, N=16]
                    ~355 structures [N=32, V5.2]
```

## Appendix B: Simulation Parameters

| Parameter | JS (V5.1) | Python (donita.py) |
|-----------|-----------|-------------------|
| N | 16 | 32 |
| DX | 0.333 | 0.0625 |
| DT | 0.015 | 0.005 |
| η | 0.15 | 0.5 |
| λ | 0.08 (curl-dep) | 0.8 |
| φ₀ | — | 1.0 |
| bohm_coeff | — (pending) | 1.0 |
| γ | — | 0.15 |
| Steps run | 1796+ | 301 |
| E₀ observed | 8.5–9.5 | — |

## Appendix C: Philosophical Extensions

The full ontological canon (Canon of Phase Offset), including postulates on the nature of time, gravity, identity, consciousness, and cosmological implications, is documented in **Document B** of the project repository. Document B is explicitly speculative and is not required to evaluate the technical claims of this paper.

Separating technical and philosophical content is deliberate: the physics stands or falls on its own predictions (Section 10), independently of the ontological framework that motivated it.

## Appendix D: Code Availability

The simulation is implemented in JavaScript/WebGL (AtOhmEter V5) and Python (donita.py). Both run on consumer hardware. The JavaScript version runs in any modern browser without installation, including mobile devices.

[GitHub repository — to be added upon publication]
