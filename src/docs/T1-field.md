# T1 — `p2b-field.js`: the procedural planet heightfield

`fieldHeight2(dx,dy,dz,d)` is a drop-in replacement for p2-core's `fieldHeight()`:
same signature, same units (**metres of elevation relative to `d.radius`**, 0 = the
datum / sea level), same honouring of the `d._oct` octave cap. It is the canonical
surface — the cube-sphere quadtree mesher and every collision query read it.

Wiring is one line in the lead's integration step (`fieldHeight = fieldHeight2;`);
this file changes nothing else. `fldSelfTest()` returns `{ok:true, ...}` with the
measured numbers, or `{ok:false, why}`.

---

## 1. Why the old field was replaced

`fieldHeight()` built elevation as `uberfbm` + ridged noise gated on continental
gradient. Two things fell out of that:

* **No coherent landmasses.** fBm is unimodal, so thresholding it at sea level
  gives a marbled land/sea interleave rather than continents with coastlines —
  visible as the blue/brown filigree covering the whole globe.
* **LOD instability by construction.** `fbm`, `uberfbm` and `ridged` all divide by
  `n`, the sum of the amplitudes *actually used*. Adding one octave rescales every
  earlier octave, so the whole continent moves when a chunk subdivides. That is
  the terrain swim on descent, and the reason a ship can sink through ground the
  renderer drew somewhere else.

Both were fixed structurally, not by tuning.

---

## 2. Landform techniques

Ordered as they are evaluated. Everything is allocation-free; per-planet constants
are derived once in `fldPrep()` and cached on `dna._fldc`.

### Domain warp, and the fine-band warp fraction
Three value-noise channels displace the sample position, which turns concentric
noise blobs into peninsulas, bays and swept fold belts. A one-tap *derivative*
warp was rejected: a warp that is the gradient of a scalar is curl-free, and
combing an fBm along its own flow lines gives the planet a brushed-metal grain.

The warp is a displacement in *continent space*, so a band at `k×` the continent
frequency sees `k×` the phase **gradient**. At full amplitude that modulates the
local frequency of every band above ~600 km wavelength by **66%**, which stretches
fine detail into parallel flutes — real, and clearly visible as combing across
lowlands (worst down-slope, where it masqueraded as erosion rills). Rigid
advection of crust would be physical; this warp is not rigid, and its gradient is
what does the damage.

So the structural bands (continents, plates) keep the full warp — that is what
makes coastlines crinkly — and every band above them uses `C.warpQ = 0.22` of it,
dropping the modulation to ~15%. Fine detail still flows around the continents but
never combs. Cost: zero extra taps, the same three warp channels are reused.

### Continents and hypsometry
6 fixed octaves, Hurst ≈ 0.65 (gain 0.55 at lacunarity 2.05) — the spectral slope
real topography has. The result is *not* used as elevation. Earth's hypsometric
curve is bimodal (abyssal plain near −4 km, land near +0.3 km, joined by a narrow
continental slope and a very flat shelf), so the field is pushed through a
piecewise transfer reproducing that curve: abyssal plain → continental slope →
shelf → shelf break → coastal plain → interior. The steep segment around `c = 0`
is what makes coastlines crinkly — a tiny change in `c` becomes a large change in
height — and it gives a genuine **continental shelf** and a clean split against
`d.seaLevel`.

### Orogenic belts — plate tectonics, not gated noise
A jittered Voronoi tessellation of the sphere stands in for lithospheric plates
(~14–22 plates). Each plate's hash carries an Euler pole, so its surface velocity
is `ω × r`, a smooth field. Convergence across a boundary is `dot(v1−v2, n12)`,
and the belt profile is built from `F2−F1`, which is continuous everywhere.

This is what makes ranges follow **coherent arcs** the way real plate boundaries
do, instead of sprinkling ridged noise wherever the gradient happens to be steep.
Distinct structures are placed by margin type:

| structure | condition | real analogue |
|---|---|---|
| plateau | continent/continent convergence | Tibet |
| cordillera | convergent, continental side | Andes, Cascades |
| trench | convergent, oceanic side | Mariana |
| mid-ocean ridge + axial rift | divergent, oceanic | Mid-Atlantic Ridge |
| rift valley + shoulders | divergent, continental | East African Rift |

Two correctness details. Plate A is canonically the one with the **larger hash**,
so the signed across-strike coordinate and the convergence scalar are both
invariant under the 1↔2 swap that happens when you cross a boundary — an arc can
sit on one side and a trench on the other with no seam down the middle. And which
plate is "second nearest" is ambiguous where `d2 == d3`, so the whole belt is
multiplied by a factor vanishing exactly on that locus: the ambiguity is
multiplied by zero. Real triple junctions are structurally messy gaps anyway.

Plate tectonics needs a convecting mantle under a thin, wet, mobile lithosphere,
i.e. worlds with oceans. Venus, Mars and the Moon are stagnant-lid / one-plate
bodies, so on those the Voronoi is skipped entirely (saving ~450 ns) and fold
belts and scarps instead track the steep flanks of the crustal field, using the
analytic gradient already in hand from the fBm — free.

Continentality is an inverse-distance-weighted vote over every nearby plate with
compact support, rather than "take the nearest plate's flag". That has no identity
switch at all, so it is continuous across boundaries *and* across triple junctions.

### Drainage networks
The channel network is the zero set of a **ridged multifractal**, which on a
2-sphere is a set of curves — a network, not blobs. Two things make it read as
drainage rather than as random cracks:

* the noise domain is **sheared along `grad(c)`**, the regional downhill direction
  (available free from the continent fBm), so channels run downhill and merge into
  the basins the continent field already has;
* the multifractal's `w`-feedback means octave *k* only has amplitude where octave
  *k−1* already had a sheet, so fine channels hang off coarse ones instead of
  running parallel to them. That hierarchical gating is what produces trunks with
  tributaries rather than a comb of unrelated cracks.

Carving is clamped so a river can never cut below its own base level, and is
masked to land.

### Canyons, mesas, terracing
Elevation is quantised to a bench height with a soft riser, giving flat-topped
mesas separated by cliffs — the layered-sediment look. Aridity picks the strength
(desert > airless > volcanic > ice > vegetated). Applied to the **structural**
height only, so its ~2.5× derivative amplification can never act on the
octave-dependent tail.

### Impact craters
Superposition (not nearest-only) of a jittered lattice at 4 size scales, so
overlapping craters read as overlapping craters. Profile in units of the crater's
own diameter: flat/gently-domed floor → steep wall → rim crest → ejecta blanket,
with a central peak and a flat floor for complex craters.

Depth follows the real lunar scaling `d = min(0.2·D, 1.044·D_km^0.301 km)` — simple
craters are **1:5 depth-to-diameter**, complex ones flatten out, so a 200 km basin
is ~5 km deep rather than 40 km. Rim crest sits at +0.22·depth, floor at
−0.78·depth, and older craters are degraded (shallower, softer). Dominant where
`d.craters` is high; mare/flood basalt then ponds *after* the craters, because
that is the order it happened — basin first, then the lava that filled it.

### Volcanism, dunes, ice
* **Shields** (`d.lava`): convex-flank cone with a summit caldera — the wide,
  gentle, flat-topped Hawaii/Olympus Mons profile. **Lava channels** are sinuous
  rilles cut along a `|noise|` zero set.
* **Dunes** (`d.dunes`): linear (seif) ergs run *with* the resultant wind, i.e.
  along the zonal circulation, so the corrugation is a function of `|latitude|` —
  a globally smooth coordinate, unlike longitude. Cross-section is asymmetric
  (long windward stoss slope, short slip face); wavelength ~11 km so the finest
  quadtree level can resolve it.
* **Polar caps** (`d.ice`): concave ice-sheet dome with zero slope at the margin,
  grounded only — a cap over deep water is a floating shelf and adds no elevation.
  **Europa-style linea** are double ridges with a medial trough.

### Coupling to the biome shader
The province tap is *deliberately* the same low-frequency noise `biomeColor2()`
reads at `p5b-biome.js:119`, so mare basalt is both dark and low, the erg albedo
coincides with the actual dunes, and the mesa country is the same country. One
tap, four jobs. This is the reason the file keeps two noise functions — see §4.

---

## 3. The LOD-stability guarantee

The mesher gives a chunk `_oct = min(9, max(4, 3 + round(depth·0.75)))`; collision
always uses `_oct = d.octaves = 9`. So the same direction is evaluated at 4…9.
Stability is structural, from two rules:

**R1 — fixed normalisation.** `fldFbm` / `fldRidge` never divide by the octave
count. Amplitudes are `gain^i` and the caller multiplies by one constant, so
adding an octave only ever *adds a term*; it never rescales earlier ones. The
ridged `w`-feedback only reads octaves `< i`, so a truncated sum is an exact
prefix of the longer one.

**R2 — one structural band at a fixed octave count, plus an additive tail.**
Everything that decides *shape* — warp, continents, plates, hypsometry, rivers,
terracing, craters, shields, dunes, ice — is computed with octave counts that do
not depend on `_oct` at all. Exactly two things are gated on `_oct`, and both
enter **additively at the very end**: the orogenic ridge texture (2–4 octaves) and
three roughness bands (`i = 6,7,8`).

Every nonlinear operator — the hypsometric transfer, mesa terracing, river
clamping, lava flooding — is applied to the **structural** height only, so none of
them can amplify the tail. `C.rgA` is capped at `1.0 × amp` so the bound stays a
fraction of `d.amp` even where `dna.ridgeAmp ≫ dna.amp`.

Analytic bound:

```
|h(4) − h(9)| ≤ 0.1875·C.rgA + (0.045 + 0.026 + 0.015)·amp ≈ 0.27 · d.amp
```

**Measured**, 4000 random directions × 6 tuned worlds, worst `|h(oct) − h(9)|` as a
fraction of `amp`:

| body | amp | oct4 | oct5 | oct6 | oct7 | oct8 |
|---|---|---|---|---|---|---|
| Earth | 6200 | 0.141 | 0.141 | 0.143 | 0.064 | **0.000** |
| Luna | 2400 | 0.160 | 0.160 | 0.152 | 0.054 | **0.000** |
| Mars | 9000 | 0.141 | 0.141 | 0.143 | 0.051 | **0.000** |
| Europa | 600 | 0.104 | 0.104 | 0.091 | 0.031 | **0.000** |
| Titan | 900 | 0.111 | 0.111 | 0.106 | 0.038 | **0.000** |
| Io | 3000 | 0.161 | 0.161 | 0.160 | 0.060 | **0.000** |

Global worst **0.161 × amp**; `fldSelfTest` asserts < 0.32.

Two deliberate consequences:

* **`h(_oct=8)` is bit-identical to `h(_oct=9)`.** The tail's last band is `i = 8`
  and the ridge texture saturates at 4 octaves by `_oct = 8`. Since the mesher
  reaches `_oct = 9` at depth ≥ 8, **every chunk at depth ≥ 7 reproduces the
  collision height exactly** — and the player always stands on a depth ≥ 8 chunk.
  The surface drawn under the ship and the surface the ship collides with are the
  same numbers, not merely close ones. Nothing can sink.
* **Refinement steps shrink geometrically** (Earth: 0 / 254 / 771 / 367 / 0 m for
  4→5 … 8→9), so a descent *adds* detail rather than rearranging it.

### Continuity
The input is a unit direction, so cube-face seams are free. Three further rules:

* the only use of latitude is `|dy|`, and every term reading it is multiplied by a
  smoothstep that is identically 0 through `dy = 0` (or identically 1 — see the
  global-glaciation note below);
* branching is on **per-planet constants** only, never on a per-sample value,
  except exact-zero early-outs where the skipped term is provably 0;
* the Voronoi uses canonical plate ordering and a triple-junction fade, as above.

Verified two ways. A dense great-circle sweep at decreasing sample spacing shows
the worst adjacent step shrinking **linearly** with spacing (79 m at 64 m spacing →
0.04 m at 0.25 m), i.e. steep slopes, not tears. And the lattice thresholds are
probed directly — see below.

---

## 4. Two bugs found and fixed while verifying

**A 103.5 m C0 tear along the crater lattice.** `fldCraters` skips neighbouring
cells using a fixed threshold on the cell-local coordinate, which is only legal
while the skipped cell's contribution is *identically zero*. Centres are jittered
into the middle half of a cell (never nearer than 0.25), and the ejecta reaches
`1.5·rc`, so a neighbour can contribute while `fx < 1.5·rcMax − 0.25`. With
`rcMax = 0.46` the reach was **0.69** against a scan bound of **0.60**: the largest
basins (~840 km across) were being dropped from the scan *mid-blanket*, a hard
cliff along a lattice plane worth up to **103.5 m** on Luna. `rcMax` is now 0.40,
making `1.5·0.40 − 0.25 = 0.35` exactly the threshold in use — at the boundary the
dropped term is `rim·q³` with `q = 0`. Measured after the fix: **1.7e-4 m** (pure
probe offset × slope). `fldShields` had the arithmetic right already
(`0.21 = 0.46 − 0.25`).

Random arc sampling does **not** find this — it needs the largest feature size
*and* a centre on the near edge of its cell, so it hides at ~1e-5 of directions.
`fldSelfTest` now probes the thresholds directly, straddling each by 1e-9 of a
cell, where any surviving jump is a pure discontinuity. Reintroducing the old
constant makes the self-test fail with `crater cell-scan discontinuity: 100.5 m`,
so it is a real regression test.

**An equatorial stripe on every ice moon.** `cap` is used twice — as the ice dome
profile *and* as the roughness damper. On a body frozen solid (Europa, Enceladus,
Triton, Pluto) the latitude ramp bottoms out at ~1°, which does not mean "ice
everywhere": it left a ~17° equatorial band outside the cap carrying full
roughness while the rest of the globe was damped, i.e. a bright stripe around the
equator. A world that cold has a shell over the whole sphere, so the cap now
blends toward a global 1 as it freezes (`C.capG`). Earth (`capG = 0`) and Mars
(`capG = 0`) keep their latitude caps unchanged. Continuity is unaffected:
`capA ≥ 0.02` always, so the smoothstep is identically 0 (flat, zero slope)
through the equator for any `capG < 1`, and identically 1 when `capG == 1`.

**Also hardened:** the `_fldc` constant cache keyed only on
seed/radius/amp/ridgeAmp/type, but `p5-world` sets `temp`/`humidity`/`vegetation`
on procedural planets *without* touching `amp`, and `temp` drives the polar-cap
and linea constants. Safe today only because all DNA edits happen before any
sampling. The guard now compares every DNA field `fldPrep` reads — 15 numeric
compares, ~15 ns against a ~2000 ns call — which makes a whole class of
stale-constant bugs impossible.

---

## 5. Cost

Two noise primitives, both allocation-free with no per-call closure:

| | ns/tap | used for |
|---|---|---|
| `noise3` (p2-core) | 180 | — |
| `fldNoise` | 82 | the province tap + gradient-bearing octaves |
| `fldNoiseF` | 70 | everything else |

`fldNoiseF` mixes its hash with `Math.imul` instead of a float multiply.
`h*1274126177` overflows the 53-bit mantissa, so the float version's low bits are
rounding noise and `Math.imul`'s are not: the two hashes are equally good but
**not equal**. That matters in exactly one place — the province tap must stay
bit-identical to the `noise3` tap `biomeColor2` makes, or the dark basalt stops
coinciding with the maria. Hence two functions rather than one.

Crater profile parameters are stored interleaved (`[rc, dep, rim, brk, pk]`,
stride 5) so a cell touches one cache line instead of five arrays.

**Microseconds per call**, node/V8, best-of-5, loop overhead subtracted:

| body | `_oct=4` | `_oct=6` | `_oct=9` | baseline `_oct=9` |
|---|---|---|---|---|
| Earth | 1.78 | 1.83 | 2.04 | 2.21 |
| Luna | 1.91 | 2.06 | 2.08 | 2.24 |
| Mars | 2.26 | 2.37 | 2.45 | 2.43 |
| Io | 1.47 | 1.57 | 1.75 | 1.69 |
| Europa | 1.66 | 1.75 | 1.89 | 1.81 |

In **Chromium/V8** — the environment that actually matters — `fldSelfTest`
reports **1.84–1.89 µs/call** at `_oct = 9` on Earth and Luna, inside the ~2 µs
budget. Most chunks are meshed well below `_oct 9`, so the figure driving frame
time is nearer the left-hand column.

Note the self-test's own timing is measured honestly: sample directions are
precomputed into arrays (four trig calls per iteration inside the timed region
cost ~0.15 µs and would inflate the result ~10%), the residual loop overhead is
measured separately and subtracted, and the best of 3 runs is reported.

Reference points: `fldPlate` (the Voronoi) 497 ns, `fldFbm` 6 octaves 541 ns,
craters ~230 ns per size level. The orogenic ridge texture is skipped entirely for
**76%** of samples because `beltEnv` is exactly 0 outside every belt.

---

## 6. What `fldSelfTest()` asserts

1. **Determinism** — every sample evaluated twice, across `_oct` 4…9, on 11 worlds.
2. **Boundedness** — finite, and within `(amp + ridgeAmp)·14 + 200 km`; poles and
   axis directions probed explicitly, since `|dy|` is the one non-smooth input.
3. **Continuity** — four dense great-circle arcs per world, 4000 samples over
   240 km (60 m spacing), one deliberately over the north pole; fails on any step
   beyond a 4:1 slope or 2.5% of the world's relief.
4. **Lattice cell-scan continuity** — the crater thresholds probed directly at
   ±1e-9 of a cell (§4).
5. **LOD stability** — `|h(4) − h(9)|` over 500 random directions per world,
   bound `0.32 × d.amp`.
6. **Timing** — µs/call over 20000 calls at `_oct = 9`, overhead-subtracted.

Returned on success: `usPerCall`, `usPerCallCratered`, `maxLodDeltaFracAmp`,
`maxLodDeltaM`, `worstLodWorld`, `maxAdjacentStepM`, `worstStepWorld`,
`maxAbsHeightM`.

---

## 7. Known limitation

The mesher caps `_oct` at `d.octaves = 9`, whose finest band is ~80 km, but the
deepest chunks have ~8 m vertex spacing. Terrain is therefore geometrically smooth
at human scale, and close-up relief comes from the shader (`uDetailAmt`,
per-pixel slope in `p5b-biome`). Extending the ladder would need the lead to raise
the cap; the tail is already written so extra bands would slot in additively with
the LOD bound unchanged. I did **not** add a band at `i = 9`, deliberately: it
would break the `h(8) ≡ h(9)` property that currently makes depth-7 chunks match
collision exactly.

---

## Derivation / references

Ridged multifractal and derivative-damped fBm: Musgrave, *Texturing & Modeling*.
Domain warping: Quílez. Hypsometric transfer and the shelf/slope profile: Earth's
actual hypsometric curve. Crater depth–diameter scaling: Pike (1977) lunar
morphometry. Plate-boundary morphology (cordillera / trench / MOR / rift
shoulders): standard plate-tectonic cross-sections. Aesthetic target: No Man's Sky
planet variety and seamless descent, with Kerbal Space Program's requirement that
the ground you collide with is the ground you see.
