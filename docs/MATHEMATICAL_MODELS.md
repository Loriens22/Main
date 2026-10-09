# Hyperspace Walk — Mathematical Models and Sources

This document describes every model used by `hyperspace-walk.html`, where it appears in the code, what is exact, what is approximated, and the primary literature behind it. The same material is available in-game, in both languages, in the **Research Log**: each entry has rendered equations (LaTeX → MathML, with the LaTeX source one click away) and a reference list.

---

## 1. Four-dimensional Euclidean space and the viewer

**Space.** Points are 4-vectors `(x, y, z, w)` in ℝ⁴ with the Euclidean metric
`d² = Δx² + Δy² + Δz² + Δw²`. The fourth axis is spatial, never time.

**The viewer is a 4D frame.** The explorer carries an orthonormal frame `R, U, F, A` (right, up, forward, *ana*) in ℝ⁴ (`Player` in §9). The camera adds pitch to `U, F`. What you see is the hyperplane through the camera position spanned by `R, U, F`; `A` is the direction you cannot see.

* Yaw rotates the `(R, F)` plane; *turning into the fourth dimension* rotates the `(F, A)` and `(R, A)` planes (`Player.rotPlane`).
* Gram–Schmidt re-orthonormalises the frame every frame to remove numerical drift.
* **Snap** (T) picks the nearest axis-aligned frame with the *same orientation* (`det4` sign preserved) — rotations can never change the frame's orientation, which is why a 180° turn in a plane containing w returns the world mirror-reversed (Möbius 1827).

**Pixel rays are 4D lines.** For pixel `(u, v)`, the ray is
`X(t) = P + t (u R + v U + F)`, a straight line in ℝ⁴ that lies inside the viewer's hyperplane. Every renderer below intersects these 4D lines with 4D geometry, so the image is the *exact* 3D cross-section, not a projection.

**Rotations.** `M4.rot(i, j, θ)` is the rotation in the `xᵢxⱼ` coordinate plane. There are n(n−1)/2 = 6 such planes in ℝ⁴. Double and isoclinic rotations (`R_xy(α) R_zw(β)`, α = β) are shown in the projection hologram; isoclinic rotations correspond to unit-quaternion multiplication (Conway & Smith 2003).

---

## 2. The regular 4-polytopes (`Poly`, §7)

All six convex regular 4-polytopes are **generated from coordinates**; their combinatorics are computed, not typed in.

| Polytope | Construction | Computed |
|---|---|---|
| 5-cell `{3,3,3}` | 5 vertices of a centred regular simplex | facets n = −vᵢ/|vᵢ|, d = R/4 |
| tesseract `{4,3,3}` | (±1, ±1, ±1, ±1) | edges by bit flips, squares by axis pairs |
| 16-cell `{3,3,4}` | ±eᵢ | edges at distance √2, triangles = 3-cliques |
| 24-cell `{3,4,3}` | permutations of (±1, ±1, 0, 0) | 96 edges, 96 triangles, 24 octahedral facets |
| 600-cell `{3,3,5}` | 8 + 16 + 96 unit quaternions (binary icosahedral group; even permutations of ½(±φ, ±1, ±1/φ, 0)) | 720 edges at length 1/φ, 1200 triangles, 600 tetrahedra as 4-cliques |
| 120-cell `{5,3,3}` | dual of the 600-cell: normalised centroids of its 600 tetrahedra | 1200 edges (tetrahedra sharing a triangle), 720 pentagons (the 5 tetrahedra around each 600-cell edge, ordered cyclically) |

The f-vectors match Coxeter (1973): (5,10,10,5), (16,32,24,8), (8,24,32,16), (24,96,96,24), (600,1200,720,120), (120,720,1200,600).

**Slice analyser** (`sliceAnalyze`). For a hyperplane `n·x = c`: slice vertices are crossings of edges (or vertices lying on the plane), slice edges are crossings of 2-faces, slice faces are crossings of cells. Near-coincident points are merged with a tolerance, which is what turns the 12-vertex truncated tetrahedron into the 6-vertex octahedron exactly at the centre. `classifySlice` identifies tetrahedron, octahedron, triangular prism, hexagonal prism (2 hexagonal faces) vs truncated tetrahedron (4 hexagonal faces), cube, box, cuboctahedron.

**Hinton's slices of the tesseract** (the Bulk puzzle). The lever applies
`O = R_xw(30°) R_yw(arctan 1/√2) R_zw(45°)` in stages, which carries the normals (0,0,1,1)/√2, (0,1,1,1)/√3 and (1,1,1,1)/2 onto the w-axis (face-, edge- and vertex-first). The orientation is interpolated through the three plane angles, so the slice morphs continuously. Slices:

* cell-first → cubes; face-first → boxes up to 2×2×2√2;
* edge-first → triangular prisms for 1/√3 < |s| < √3, hexagonal prisms through the centre;
* vertex-first → tetrahedra for 1 < |s| < 2, truncated tetrahedra, a regular octahedron at s = 0.

The puzzle checks the *actual* cross-section of the tesseract by the player's current hyperplane, so any route to the right orientation — the lever or the player's own 4D turning — is accepted.

**Unfolding** (Node I). Each side cell turns 90° in its `(axis, w)` plane about the square it shares with the base cell `w = −1`; the opposite cell first hinges onto the +x cell and then rides with it, giving the 8-cube net painted by Dalí in *Corpus Hypercubus* (1954).

---

## 3. Rendering 4D solids: half-space clipping (the Bulk, `FS_BULK`)

Each object is a convex 4-polytope stored as half-spaces `nᵢ·q ≤ d` in a float texture, with a rotation matrix, centre and per-axis scale in a second texture. For each pixel's 4D line `q(t) = q₀ + t v` (in object coordinates) **Cyrus–Beck clipping** (1978) gives

```
t_in  = max over nᵢ·v < 0 of (d − nᵢ·q₀)/(nᵢ·v)
t_out = min over nᵢ·v > 0 of (d − nᵢ·q₀)/(nᵢ·v)
```

which is exactly where the line enters and leaves the 4D solid; a bounding 3-sphere test rejects most pixels first. Consequences:

* the visible solid is exactly the 3D slice of the polytope by your hyperplane;
* glowing edges appear where a second facet hyperplane is within a pixel of the hit point (`edgeD`), vertices where a third is;
* each slice face is tinted by the 4D cell it belongs to;
* the glome uses the exact ray–3-sphere quadratic;
* shadows are cast by tracing 4D rays toward a 4D light direction, and the floor is the hyperplane `y = 0` whose grid lines mark x (red), z (blue) and w (violet) — the violet lines only appear when your hyperplane is tilted in w;
* the floor reflects the scene by tracing the mirrored 4D ray (High/Ultra).

Collisions use the same half-space description as a signed-distance lower bound `max(nᵢ·q − d)·s` sampled at three heights of the explorer's capsule, so walls exist only where they exist in 4D. The sealed vault is five 4D boxes of w-extent ±0.8 m; stepping beyond that along w removes them from your slice and from the collision set.

---

## 4. The tesseract lattice (`FS_LATTICE`)

The "tesseract" of chapter III is a genuine 4D lattice with period C = 10 m:

* bars along x, y and z with cross-section `{|a| + |w| ≤ h, |b| + |w| ≤ h}` in their three perpendicular axes (a square bipyramid). Their 3D slice at lattice coordinate w is a square of half-size `h − |w|`, so the channels shrink smoothly to nothing as you move along w — the same lesson as the hypersphere slice;
* bars along w with cubic cross-section `|x|, |y|, |z| ≤ h_r` — these are the rooms, each the world-line of the bedroom extended along w. A room's displayed moment is `τ = 0.37 (i + j + k) + 0.11 w`, so channels and w both move you through its history.

**Traversal.** A 4D generalisation of Amanatides & Woo's voxel walk (1987) steps the line through lattice cells (`tMax`, `tDelta` per axis). In each cell the four bars are clipped analytically as *slabs* (`|s| ≤ h` for `s = y ± w`, …). Entry and exit events of the union are sorted and composited front-to-back as translucent layers; the exit from a room's box shades its inner wall (bookshelf, window with time-of-day sky, desk, door, floor with the dust message).

**Light threads** are 2-planes `{x_B = ±C/2, x_C = ±C/2}` extended along x_A and w (so they appear as lines in every slice). Their glow uses the closest approach between the pixel's 4D line and the 2-plane in each cell.

**Closing.** The lattice matrix is animated as `R_xw(1.25k) R_yw(0.8k) R_zw(0.55k)` about the explorer — a real 4D rotation of the whole structure.

**Slit-scan streaks.** The streak profile is a function of the across-coordinate, the along-coordinate (time) and w — a 4D solid texture, so it too is sliced, not projected.

---

## 5. The black hole (`GLSL_BH`)

**Geometry.** Schwarzschild (1916), `r_s = 2GM/c²`. In the orbital plane null geodesics obey `d²u/dφ² + u = (3/2) r_s u²`, `u = 1/r`.

**Integrator.** Each pixel integrates

```
ẍ = −(3/2) r_s h² x / |x|⁵,   h = |x × ẋ| = const
```

a central force whose Binet equation is exactly the orbit equation above, so the trajectories (not the affine parameter) are exact up to integration error. Velocity-Verlet with a step proportional to r (shrinking near the horizon), 110–320 steps by quality. A ray is captured at r < r_s; otherwise its final direction samples the procedural star field and Milky Way band — so the shadow (edge at b_c = 3√3/2 r_s ≈ 2.598 r_s), photon ring, lensed far side of the disk and Einstein ring of stars all emerge without being painted. The same integrator draws the "light paths" hologram.

**Disk.** Thin disk in the equatorial plane from the Schwarzschild ISCO (3 r_s) to 14 r_s, sampled at plane crossings (semi-transparent, so secondary images show through). Temperature `T ∝ r^(−3/4) (1 − √(r_in/r))^(1/4)` (Shakura & Sunyaev 1973; Novikov & Thorne 1973), Keplerian differential rotation (Ω ∝ r^(−3/2)), colour from a Planck-spectrum fit. Two modes:

* **Film** (default): no Doppler beaming or colour shift, as in *Interstellar* (James et al. 2015);
* **Physical** (Settings): `g = √(1 − r_s/r) / (γ (1 − β cos θ)) / √(1 − r_s/r_cam)` with orbital speed `β = √(M/(r − 2M))`, observed intensity `∝ g⁴`.

**Infalling observer.** During the plunge the camera's look directions are transformed by relativistic aberration for an observer falling from rest at infinity (`β = √(r_s/r)` relative to static observers): `cos θ_s = (cos θ_o − β)/(1 − β cos θ_o)`; star colours use the Doppler factor `γ(1 + β cos θ_s)` in Physical mode. The cockpit shows the static-observer `dτ/dt = √(1 − r_s/r)`, `1 + z`, the infall speed, and the **real** tidal acceleration `2GML/r³ ≈ 2×10⁻⁶ m s⁻² · (r_s/r)³` for M = 10⁸ M☉, L = 2 m.

**Honest limits.** Spin (Kerr 1963) is described in the log but not traced: frame dragging is not modelled. The pacing of the pod's fall is a scripted curve, not a geodesic. Everything after the horizon crossing (the nested luminous shells, the tesseract) is labelled in-game as a dramatization, following Thorne (2014).

---

## 6. Euclid Station (`FS_STATION`)

Signed-distance architecture (deck, under-cone, railing, arches, research pedestals, gangway, pod) ray-marched per pixel, GGX microfacet specular, soft shadows and ambient occlusion from the SDF, and a key light from the direction of the disk. The sky is the full geodesic tracer, viewed from r ≈ 22 r_s with a tilted station frame; glossy reflections on High/Ultra trace the geodesic sky again with fewer steps.

---

## 7. Holograms (§8)

4D wireframes projected by

* orthographic `(x, y, z, w) ↦ (x, y, z)`,
* perspective `↦ d/(d − w) · (x, y, z)`,
* stereographic `↦ (x, y, z)/(1 − w)` on the unit 3-sphere (edges are subdivided and radially pushed onto S³ first, so they become circular arcs — the map is conformal).

Content: extrusion point → tesseract and its net; Flatland sphere; glome slice with the graph of `r(w) = √(R² − w²)`; vertex-first tesseract slices from the slice analyser; projection/rotation modes; all six polytopes; Schwarzschild light paths; a world-tube; a braneworld with the Randall–Sundrum warp factor `e^(−2k|y|)`; Kaluza–Klein modes `m_n = nħ/(Rc)`; parallel transport around a sphere octant (holonomy π/2); the metric tensor for Euclidean, Minkowski and Schwarzschild spacetimes; a Hénon–Heiles orbit integrated with RK4 in its 4D phase space; and the Hopf fibration (fibre over (a,b,c) ∈ S²: `(1/√(2(1+c))) ((1+c)cos θ, a sin θ − b cos θ, a cos θ + b sin θ, (1+c) sin θ)`).

Lines are drawn as screen-space quads with a Gaussian core and halo, depth-tested against the scene, alpha-blended so they stay legible in front of the bright disk.

---

## 8. Sound

* Procedural score: additive "organ" voices (partials 1, 2, 3, 4, 6, 8) through a generated convolution reverb; the chord index follows the explorer's w-coordinate, so the harmony changes as you move along w.
* Rotating in 4D detunes the score and drives a band-passed noise "whoosh" proportional to the angular speed in planes containing w.
* Polytopes in the Bulk are 4D point sources: intensity ∝ `1/(1 + (r/5)³)` with r the 4D distance (power spreads over a 3-sphere of area 2π²r³) — you can hear objects hidden from your slice.
* Threads are Karplus–Strong strings (1983). The plunge uses brown-noise rumble, sub-bass and stress creaks.

---

## 9. Post-processing and accessibility

HDR (RGBA16F) targets; 13-tap downsample / tent-upsample bloom; anamorphic horizontal flare; ACES filmic tone mapping (Narkowicz fit); grading per chapter; vignette, chromatic aberration and grain (all optional). Colour-vision assist is a daltonisation filter built on the dichromat simulation of Viénot, Brettel & Mollon (1999). Reduced motion slows 4D rotations and removes camera shake; reduced flashing slows and softens the plunge's alternating shells (all flashing is kept below 3 Hz regardless).

Dynamic resolution adjusts the internal render scale every 0.8 s to hold ~60 fps; quality presets set the geodesic step budget, lattice cell budget, reflections and bloom levels.

---

## 10. Extending the game (modularity)

* **New polytope:** add a generator to `Poly` (vertices → `adjacency` → faces/facets → `finish`), append its facets to the plane texture in `BulkCh.build`, and add an object record.
* **New language:** add a key to `UI_STR`, and `xx:` fields next to every `en`/`bg` in `SCRIPT` and `LOG`; Aether picks a voice for that language automatically.
* **New hologram:** add a function to `HOLO` that emits lines in local coordinates; it gets fading, projection beams, labels and depth-aware rendering for free.
* **New physics module:** add a GLSL chunk to the relevant scene shader and an entry to `LOG` with its equations and references.

---

## References

* Abbott, E. A. (1884). *Flatland: A Romance of Many Dimensions.* Seeley & Co.
* Amanatides, J. & Woo, A. (1987). A fast voxel traversal algorithm for ray tracing. *Eurographics '87*, 3–10.
* Arkani-Hamed, N., Dimopoulos, S. & Dvali, G. (1998). *Phys. Lett. B* 429, 263–272.
* Banchoff, T. F. (1990). *Beyond the Third Dimension.* Scientific American Library.
* Bardeen, J. M., Press, W. H. & Teukolsky, S. A. (1972). *Astrophys. J.* 178, 347–369.
* Conway, J. H. & Smith, D. A. (2003). *On Quaternions and Octonions.* A K Peters.
* Coxeter, H. S. M. (1973). *Regular Polytopes*, 3rd ed. Dover.
* Cyrus, M. & Beck, J. (1978). Generalized two- and three-dimensional clipping. *Computers & Graphics* 3(1), 23–28.
* Gullstrand, A. (1922). *Arkiv för Matematik, Astronomi och Fysik* 16(8), 1–15.
* Hadamard, J. (1923). *Lectures on Cauchy's Problem in Linear Partial Differential Equations.* Yale University Press.
* Hanson, A. J. & Heng, P. A. (1992). Illuminating the fourth dimension. *IEEE CG&A* 12(4), 54–62.
* Hanson, A. J. (2006). *Visualizing Quaternions.* Morgan Kaufmann.
* Hénon, M. & Heiles, C. (1964). *Astron. J.* 69, 73–79.
* Hinton, C. H. (1888). *A New Era of Thought.* Swan Sonnenschein. — (1904). *The Fourth Dimension.*
* Hollasch, S. R. (1991). *Four-Space Visualization of 4D Objects.* M.S. thesis, Arizona State University.
* Hopf, H. (1931). *Math. Ann.* 104, 637–665.
* James, O., von Tunzelmann, E., Franklin, P. & Thorne, K. S. (2015). *Class. Quantum Grav.* 32, 065001; *Am. J. Phys.* 83, 486–499.
* Kaluza, T. (1921). *Sitzungsber. Preuss. Akad. Wiss.*, 966–972. Klein, O. (1926). *Z. Phys.* 37, 895–906.
* Kapner, D. J. et al. (2007). *Phys. Rev. Lett.* 98, 021101. Lee, J. G. et al. (2020). *Phys. Rev. Lett.* 124, 101101.
* Karplus, K. & Strong, A. (1983). *Computer Music Journal* 7(2), 43–55.
* Kerr, R. P. (1963). *Phys. Rev. Lett.* 11, 237–238.
* Levi-Civita, T. (1917). *Rend. Circ. Mat. Palermo* 42, 173–205.
* Lohse, M. et al. (2018). *Nature* 553, 55–58. Zilberberg, O. et al. (2018). *Nature* 553, 59–62.
* Luminet, J.-P. (1979). *Astron. Astrophys.* 75, 228–235.
* Maldacena, J. (1998). *Adv. Theor. Math. Phys.* 2, 231–252.
* Misner, C. W., Thorne, K. S. & Wheeler, J. A. (1973). *Gravitation.* W. H. Freeman.
* Möbius, A. F. (1827). *Der barycentrische Calcul.* J. A. Barth.
* Noll, A. M. (1967). *Commun. ACM* 10(8), 469–473.
* Novikov, I. D. & Thorne, K. S. (1973). In *Black Holes* (Les Houches), Gordon & Breach, 343–450.
* Paczyński, B. & Wiita, P. J. (1980). *Astron. Astrophys.* 88, 23–31.
* Painlevé, P. (1921). *C. R. Acad. Sci. Paris* 173, 677–680.
* Pardo, K., Fishbach, M., Holz, D. E. & Spergel, D. N. (2018). *JCAP* 07, 048.
* Randall, L. & Sundrum, R. (1999). *Phys. Rev. Lett.* 83, 3370–3373; 4690–4693.
* Ricci-Curbastro, G. & Levi-Civita, T. (1901). *Mathematische Annalen* 54, 125–201.
* Riemann, B. (1868). *Abh. Königl. Ges. Wiss. Göttingen* 13, 133–152.
* Schläfli, L. (1901). *Theorie der vielfachen Kontinuität.* Denkschr. Schweiz. Naturf. Ges. 38.
* Schwarzschild, K. (1916). *Sitzungsber. Preuss. Akad. Wiss.*, 189–196.
* Shakura, N. I. & Sunyaev, R. A. (1973). *Astron. Astrophys.* 24, 337–355.
* Thorne, K. S. (2014). *The Science of Interstellar.* W. W. Norton.
* Viénot, F., Brettel, H. & Mollon, J. D. (1999). *Color Res. Appl.* 24(4), 243–252.
