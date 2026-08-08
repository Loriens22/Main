/* Documentation supplement: the remaining C# scripts, the Unreal plan, shader/VFX
   recommendations, ship import guidelines, the roadmap, and the performance budget.
   NOTE: this is a JS template literal — no raw backticks, no raw dollar-brace. */
const DOCS_HTML2 = `<div class="w">

<h2>2b. KEY C# SCRIPTS — ORBITAL CORE</h2>

<h3>KeplerSolver.cs</h3>
<p>State vectors to Keplerian elements and back. The bisection fallback is not optional:
Newton-Raphson on Kepler's equation diverges for high eccentricity with a naive initial
guess, and that is the single most common bug in hobby orbital code.</p>
<pre><code>using System;
using UnityEngine;

public static class KeplerSolver
{
    public const double Tolerance = 1e-12;
    public const int    MaxIter   = 64;

    public struct Elements
    {
        public double a, e, i, raan, argp, nu, m0, epoch, mu;
        public double Period =&gt; (e &lt; 1.0 &amp;&amp; a &gt; 0.0) ? 2.0 * Math.PI * Math.Sqrt(a*a*a/mu)
                                                       : double.PositiveInfinity;
        public double Periapsis =&gt; a * (1.0 - e);
        public double Apoapsis  =&gt; (e &lt; 1.0) ? a * (1.0 + e) : double.PositiveInfinity;
    }

    /// Solve M = E - e sin E for the eccentric anomaly.
    public static double SolveElliptic(double M, double e)
    {
        M = M % (2.0 * Math.PI); if (M &lt; 0.0) M += 2.0 * Math.PI;
        // Initial guess after Danby; good enough that Newton converges in ~4 steps.
        double E = M + 0.85 * e * Math.Sign(Math.Sin(M));
        for (int k = 0; k &lt; MaxIter; k++)
        {
            double f  = E - e * Math.Sin(E) - M;
            double fp = 1.0 - e * Math.Cos(E);
            if (Math.Abs(fp) &lt; 1e-14) break;
            double d = f / fp;
            E -= d;
            if (Math.Abs(d) &lt; Tolerance) return E;
        }
        // Newton failed (near-parabolic). Bisect, which cannot fail.
        double lo = 0.0, hi = 2.0 * Math.PI;
        for (int k = 0; k &lt; 200; k++)
        {
            double mid = 0.5 * (lo + hi);
            if (mid - e * Math.Sin(mid) - M &gt; 0.0) hi = mid; else lo = mid;
        }
        return 0.5 * (lo + hi);
    }

    /// Solve M = e sinh H - H for the hyperbolic anomaly.
    public static double SolveHyperbolic(double M, double e)
    {
        double H = Math.Sign(M) * Math.Log(2.0 * Math.Abs(M) / e + 1.8);
        for (int k = 0; k &lt; MaxIter; k++)
        {
            double f  = e * Math.Sinh(H) - H - M;
            double fp = e * Math.Cosh(H) - 1.0;
            if (Math.Abs(fp) &lt; 1e-14) break;
            double d = f / fp;
            H -= d;
            if (Math.Abs(d) &lt; Tolerance) break;
        }
        return H;
    }

    public static Elements FromState(DoubleVector3 r, DoubleVector3 v, double mu, double epoch)
    {
        double R = r.Magnitude, V = v.Magnitude;
        DoubleVector3 h = DoubleVector3.Cross(r, v);
        DoubleVector3 n = DoubleVector3.Cross(new DoubleVector3(0,0,1), h);
        DoubleVector3 ev = (DoubleVector3.Cross(v, h) / mu) - (r / R);

        Elements el = default;
        el.mu    = mu;
        el.epoch = epoch;
        el.e     = ev.Magnitude;
        double energy = V*V*0.5 - mu/R;
        el.a  = (Math.Abs(el.e - 1.0) &gt; 1e-9) ? -mu / (2.0 * energy) : double.PositiveInfinity;
        el.i  = Math.Acos(Clamp(h.z / h.Magnitude, -1.0, 1.0));

        // Circular and equatorial orbits leave argp / raan undefined; pick a stable
        // convention instead of returning NaN.
        if (n.Magnitude &gt; 1e-9)
        {
            el.raan = Math.Acos(Clamp(n.x / n.Magnitude, -1.0, 1.0));
            if (n.y &lt; 0.0) el.raan = 2.0 * Math.PI - el.raan;
        }
        else el.raan = 0.0;

        if (el.e &gt; 1e-9 &amp;&amp; n.Magnitude &gt; 1e-9)
        {
            el.argp = Math.Acos(Clamp(DoubleVector3.Dot(n, ev) / (n.Magnitude * el.e), -1.0, 1.0));
            if (ev.z &lt; 0.0) el.argp = 2.0 * Math.PI - el.argp;
        }
        else el.argp = 0.0;

        if (el.e &gt; 1e-9)
        {
            el.nu = Math.Acos(Clamp(DoubleVector3.Dot(ev, r) / (el.e * R), -1.0, 1.0));
            if (DoubleVector3.Dot(r, v) &lt; 0.0) el.nu = 2.0 * Math.PI - el.nu;
        }
        else el.nu = 0.0;

        return el;
    }

    static double Clamp(double x, double a, double b) =&gt; x &lt; a ? a : (x &gt; b ? b : x);
}</code></pre>

<h3>PatchedConicSolver.cs</h3>
<p>The sphere of influence radius is <code>r_SOI = a * (m/M)^(2/5)</code>. Crossing it means
changing reference frame: subtract or add the parent body's state vector. Do it in one
atomic step or the trajectory visibly kinks.</p>
<pre><code>public class PatchedConicSolver : MonoBehaviour
{
    public CelestialBody currentSOI;

    public static double SoiRadius(CelestialBody b)
        =&gt; b.parent == null ? double.PositiveInfinity
                            : b.semiMajorAxis * System.Math.Pow(b.mu / b.parent.mu, 0.4);

    /// Deepest body in the hierarchy whose SOI contains the point.
    public CelestialBody Dominant(DoubleVector3 pos)
    {
        CelestialBody best = CelestialBody.Root;
        foreach (var b in CelestialBody.All)
        {
            if (b.parent == null) continue;
            if ((pos - b.Position).Magnitude &lt; SoiRadius(b) &amp;&amp; b.Depth &gt; best.Depth)
                best = b;
        }
        return best;
    }

    /// Rebase the vessel's state when it crosses a SOI boundary.
    public void CheckTransition(Vessel v)
    {
        CelestialBody now = Dominant(v.Position);
        if (now == currentSOI) return;
        Debug.Log(\$"SOI change {currentSOI.name} -> {now.name}");
        // Position and velocity are absolute, so nothing to convert here; what changes is
        // which mu the conic is fitted against. Refit immediately so the predicted
        // trajectory does not flicker for a frame.
        v.elements  = KeplerSolver.FromState(v.Position - now.Position,
                                             v.Velocity - now.Velocity, now.mu, Time.timeAsDouble);
        currentSOI  = now;
        FloatingOrigin.Instance.RequestRebase();
    }
}</code></pre>

<h3>PlanetQuadtree.cs — chunked LOD on a cube-sphere</h3>
<p>Subdivide on screen-space error. Skirts are the cheapest crack fix and the one to use
first; edge-stitching produces cleaner normals but complicates the index buffer, and
geomorphing is only worth it once popping is your dominant artifact.</p>
<pre><code>public class QuadtreeNode
{
    public int face, depth;
    public Vector2 uvMin; public float size;
    public QuadtreeNode[] children;
    public Mesh mesh;

    /// Tangent warp spreads vertices evenly; a plain normalized cube bunches them
    /// badly at the face centres.
    public static Vector3 CubeToSphere(int face, float u, float v)
    {
        float tu = Mathf.Tan(u * Mathf.PI * 0.25f);
        float tv = Mathf.Tan(v * Mathf.PI * 0.25f);
        Vector3 p = FaceBasis[face].right   * tu
                  + FaceBasis[face].up      * tv
                  + FaceBasis[face].forward;
        return p.normalized;
    }

    public void Update(Vector3 camLocal, float planetRadius, int maxDepth)
    {
        Vector3 centre = CubeToSphere(face, uvMin.x + size*0.5f, uvMin.y + size*0.5f)
                       * planetRadius;
        float dist     = Vector3.Distance(camLocal, centre);
        float nodeSize = planetRadius * size;

        // Split while the node subtends more than ~2 chunk-widths of screen.
        bool wantSplit = dist &lt; nodeSize * 2.2f &amp;&amp; depth &lt; maxDepth;

        if (wantSplit &amp;&amp; children == null) Split();
        if (!wantSplit &amp;&amp; children != null &amp;&amp; dist &gt; nodeSize * 3.2f) Merge(); // hysteresis

        if (children != null) foreach (var c in children) c.Update(camLocal, planetRadius, maxDepth);
    }
}</code></pre>
<div class="note"><strong>Hysteresis matters.</strong> Split at 2.2x and merge at 3.2x, never at
the same threshold — otherwise a node sitting exactly on the boundary splits and merges
every frame, and you get a stutter that is very hard to trace.</div>

<h3>WormholeController.cs</h3>
<pre><code>public class WormholeController : MonoBehaviour
{
    public enum Phase { Idle, Charging, Opening, Transit, Exit }
    public Phase phase = Phase.Idle;

    [SerializeField] float chargeTime = 2.2f, openTime = 1.4f, transitTime = 4.2f;
    float t;
    CelestialBody target;

    public void Begin(CelestialBody destination)
    {
        if (ship.power &lt; 0.12f) { Hud.Warn("Insufficient reactor charge"); return; }
        target = destination; phase = Phase.Charging; t = 0f;
    }

    void Update()
    {
        if (phase == Phase.Idle) return;
        t += Time.deltaTime;
        switch (phase)
        {
            case Phase.Charging:
                ship.power -= 0.06f * Time.deltaTime;
                mouthMaterial.SetFloat("_Open", Mathf.Clamp01(t / chargeTime));
                if (t &gt; chargeTime) { phase = Phase.Opening; t = 0f; }
                break;
            case Phase.Transit:
                if (t &gt; transitTime) { Arrive(); phase = Phase.Exit; t = 0f; }
                break;
        }
    }

    /// Drop the ship on a stable circular orbit rather than at a random point, so the
    /// player is never dumped into an immediate escape or impact trajectory.
    void Arrive()
    {
        double r  = target.radius * 2.5;
        DoubleVector3 pos = target.Position + new DoubleVector3(r, 0, 0);
        double v  = System.Math.Sqrt(target.mu / r);          // vis-viva, circular case
        ship.SetState(pos, target.Velocity + new DoubleVector3(0, 0, -v));
        ship.transform.rotation = Quaternion.LookRotation(
            (Vector3)(target.Position - pos), Vector3.up);
        FloatingOrigin.Instance.RequestRebase();
    }
}</code></pre>

<h3>ScaleManager.cs — the space-to-surface handover</h3>
<p>One camera cannot cover 0.1 m to 1e13 m with a 24-bit depth buffer. Two options, and
the second is what this prototype uses.</p>
<ul>
<li><strong>Split cameras.</strong> A near camera (0.1 m to 10 km) and a far camera
(5 km to 1e13 m) rendering in sequence with depth cleared between. Robust, costs an extra
pass, and objects straddling the boundary need care.</li>
<li><strong>Logarithmic depth.</strong> Write
<code>z = log2(max(1e-6, 1 + w)) * (2 / log2(far + 1)) - 1</code> in the vertex shader.
One pass, no boundary, but interpolation across very large triangles is only approximate —
so tessellate long thin geometry, and write <code>gl_FragDepth</code> in the fragment shader
if you see z-fighting on huge polygons.</li>
</ul>

<h2>3. UNREAL ENGINE 5 ALTERNATIVE</h2>

<h3>What changes, and what does not</h3>
<p>UE5's <strong>Large World Coordinates</strong> makes <code>FVector</code> double-precision,
which removes the most painful part of the Unity approach: you can keep true 1:1
heliocentric positions in engine types without a custom double vector. It does <em>not</em>
remove the need for origin rebasing — GPU transforms are still float, so
<code>WorldToMeters</code> drift and shadow/depth precision still degrade far from origin.
Keep rebasing, just rebase less often.</p>

<h3>Module layout</h3>
<pre><code>Source/StellarExpanse/
  Public/
    Celestial/    APlanetActor.h  UOrbitalMovementComponent.h  FPlanetQuadtree.h
    Flight/       AVesselPawn.h   UAeroComponent.h  URcsComponent.h
    Warp/         AWormholeActor.h
    Render/       UPlanetTerrainComponent.h  FTerrainMeshBuilder.h
  Private/        (matching .cpp)
Content/
  Planets/   Materials/  Niagara/  Blueprints/  Maps/</code></pre>

<h3>Nanite: read this before you plan around it</h3>
<div class="note"><strong>Nanite does not solve procedural planets the way people assume.</strong>
Nanite clusters are built offline from static meshes. Runtime-generated geometry has to go
through the Nanite build path, which is far too slow to do per chunk per frame. As of UE 5.4+
there is runtime Nanite mesh creation, but it is expensive and not designed for continuous
streaming terrain. For a procedural planet you almost certainly want conventional chunked
LOD with your own mesh builder (Realtime Mesh Component or a custom
<code>UProceduralMeshComponent</code> replacement), and reserve Nanite for authored props
scattered on the surface — rocks, wreckage, buildings — where it genuinely shines.</div>

<h3>Lumen, World Partition, Chaos, Niagara</h3>
<ul>
<li><strong>Lumen</strong> works well for surface-level lighting but its screen-space and
distance-field paths assume human-scale worlds. At orbital distances, fall back to a simple
directional light plus your analytic atmosphere; switch Lumen on below roughly 50 km.</li>
<li><strong>World Partition</strong> is built around a finite grid and does not naturally
express a sphere. Use it for authored surface content on a "current landing region" tile,
and drive planet terrain from your own quadtree instead.</li>
<li><strong>Chaos</strong> handles the landing gear well: a physics constraint per leg with a
linear drive gives you spring and damping directly, and its solver is stable at the
stiffnesses landing gear needs.</li>
<li><strong>Niagara</strong> is the right tool for the plume, re-entry plasma and dust.
Use GPU sim with a fixed bounds override — the default dynamic bounds computation is a
readback stall, and at these particle counts it will dominate your frame.</li>
</ul>

<h2>4. SHADER AND VFX RECOMMENDATIONS</h2>

<h3>Atmospheric scattering</h3>
<p>Two credible choices. <strong>Bruneton and Neyret (2008)</strong> precompute transmittance
and multiple-scattering into LUTs; highest quality, but a per-planet bake and several
megabytes of texture. <strong>Hillaire (2020), "A Scalable and Production Ready Sky and
Atmosphere Rendering Technique"</strong> is what most modern engines ship: small LUTs, a
sky-view LUT in a latitude/longitude parameterisation, and an aerial-perspective volume.
It re-bakes cheaply, which matters when the player can wormhole to a new planet.</p>
<p>The cheap version — and what this prototype uses — is analytic single scattering with a
short optical-depth march. It costs about 20 texture-free ALU-heavy steps and looks correct
from space through to the ground. <strong>Include the ozone layer.</strong> Without it your
twilight has no purple-magenta band and every sunset looks subtly wrong. The failure mode of
all of these is banding on long rays; dither the sample offset per pixel.</p>

<h3>Volumetric clouds</h3>
<p><strong>Schneider and Vos, "The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn"</strong>
is still the reference: Perlin-Worley base shape, Worley erosion, a weather texture driving
coverage and type, height-gradient profiles per cloud type, dual-lobe Henyey-Greenstein
phase, and the Beer's-powder term for dark edges.</p>
<div class="note"><strong>Normalise your phase function.</strong> Henyey-Greenstein is
<code>(1 - g^2) / (4*pi*(1 + g^2 - 2*g*cos(theta))^1.5)</code>. Drop the <code>4*pi</code> and
at g = 0.8 the forward peak reaches about 45 instead of 3.6 — your clouds blow out to solid
white and no amount of density tuning will fix it. This exact bug occurred during
development of this prototype.</div>
<p>Cost control: march at quarter resolution into a separate buffer, offset samples with a
Bayer or blue-noise pattern, reproject the previous frame, and upsample with a depth-aware
bilateral filter. Early-out when transmittance drops below 0.01.</p>

<h3>Ocean</h3>
<p><strong>Tessendorf's FFT</strong> spectrum is the gold standard for a realistic open sea and
is what film uses, but it needs a compute pass and tiles, which is awkward on a sphere.
<strong>Sum-of-Gerstner-waves</strong> — 8 to 16 waves from a directional spectrum — gets you
the sharp trochoidal crests that read as real water, gives analytic normals and tangents for
free, and lets the CPU evaluate the identical displacement for buoyancy. The
<strong>Jacobian</strong> of the Gerstner displacement going negative tells you where a wave
is about to break: that is your foam mask, and it is far more convincing than a noise
texture.</p>
<p>The single detail that sells water at distance is <strong>slope-derived roughness</strong>
feeding a GGX lobe. It turns the sun's reflection from a dot into a long shimmering streak.</p>

<h3>Re-entry plasma and the bow shock</h3>
<p>Drive everything from real quantities: stagnation heat flux by <strong>Sutton-Graves</strong>,
<code>q = k * sqrt(rho / Rn) * v^3</code> with k about 1.7415e-4 in SI, and shock standoff
distance shrinking with Mach number. Colour the emission by blackbody temperature rather than
by an artist gradient, and modulate it by <code>dot(normal, -velocityDirection)</code> so
windward surfaces glow and leeward surfaces stay dark. The long turbulent wake behind the
vehicle is what conveys speed; without it, re-entry reads as a static glow.</p>

<h3>Engine plumes</h3>
<p>Make plume shape a function of ambient pressure. At sea level you get a narrow collimated
jet with visible <strong>Mach diamonds</strong> from the shock train; in vacuum the flow is
grossly underexpanded and blooms into a wide translucent bell. Animating that transition
during ascent is one of the highest-value details in the whole project, and it is nearly free
— it is one uniform.</p>

<h3>Wormhole</h3>
<p>Base it on the Ellis / Morris-Thorne metric as rendered for <em>Interstellar</em>:
<strong>James, von Tunzelmann, Franklin and Thorne, "Gravitational Lensing by Spinning Black
Holes in Astrophysics, and in the Movie Interstellar", Classical and Quantum Gravity 32,
065001 (2015)</strong>. The three things that make it read as real rather than as a portal
effect:</p>
<ol>
<li>The mouth is a <strong>sphere</strong> showing the destination sky, not a hole in a plane.</li>
<li>An <strong>Einstein ring</strong> where the deflection diverges at the throat edge.</li>
<li>If you add an accretion disk, <strong>Doppler beaming</strong> makes the approaching side
dramatically brighter and bluer, and lensing lifts the far side of the disk up over the top
and under the bottom of the mouth. That asymmetry is the recognisable signature.</li>
</ol>

<h3>Terrain surface</h3>
<p>Triplanar mapping avoids UV seams on a sphere and handles cliffs correctly; blend the three
projections by the squared normal components with a sharpening exponent around 4. Add parallax
occlusion mapping only below about 50 m from the camera — above that it costs the same and
does nothing visible. Tessellation is largely obsolete for this purpose; prefer denser chunk
meshes near the camera, which cost less and behave better with your collision mesh.</p>
<div class="note"><strong>Scale-aware thresholds.</strong> Any biome boundary — snowline,
waterline, slope-driven rock — must widen its transition as vertex spacing grows. A fixed
<code>smoothstep(a,b,x)</code> evaluated per vertex at coarse LOD flips between neighbouring
vertices hundreds of kilometres apart and Gouraud-interpolates into salt-and-pepper speckle.
This was a real bug in this prototype and it looks exactly like broken noise.</div>

<h2>5. SHIP MODEL IMPORT AND SETUP</h2>

<h3>Budgets and LOD chain</h3>
<table>
<tr><th>LOD</th><th>Triangles</th><th>Switch distance</th><th>Notes</th></tr>
<tr><td>LOD0</td><td>150k-400k</td><td>0-60 m</td><td>Cockpit interior visible, full greebles</td></tr>
<tr><td>LOD1</td><td>60k</td><td>60-250 m</td><td>Interior culled, small greebles baked to normal map</td></tr>
<tr><td>LOD2</td><td>15k</td><td>250 m-2 km</td><td>Silhouette only, panel lines in texture</td></tr>
<tr><td>LOD3</td><td>2k</td><td>2 km+</td><td>Plus an impostor billboard beyond about 20 km</td></tr>
</table>

<h3>Conventions</h3>
<ul>
<li><strong>Scale:</strong> author in metres, 1 unit = 1 m, and apply scale before export.
Non-uniform scale on a parent transform breaks normal mapping and physics inertia.</li>
<li><strong>Pivot:</strong> at the centre of mass, not at the geometric centre and not at the
nose. Your inertia tensor and every torque calculation assume this.</li>
<li><strong>Axis:</strong> pick one and enforce it. This project uses -Z forward, +Y up.
Unity is +Z forward and Blender is +Y forward, so an FBX round-trip will rotate your ship
unless you fix it at export.</li>
<li><strong>Naming:</strong> <code>SM_Vagrant_Hull_LOD0</code>,
<code>SKT_Engine_01</code> for sockets, <code>SM_Vagrant_Gear_L_Upper</code> for
articulated parts. Sockets for every engine bell, RCS port, gear leg and nav light —
the flight model finds them by name.</li>
</ul>

<h3>Rigging the moving parts</h3>
<ul>
<li><strong>Engine bells</strong> gimbal about two axes. Rig as a two-bone chain with the
pivot at the gimbal block, not at the throat, and rate-limit the actuation in code
(real gimbals slew at roughly 5-15 degrees per second).</li>
<li><strong>Landing gear</strong> needs a prismatic joint per leg for the shock stroke plus a
hinge for deployment. Drive the visual compression from the physics constraint, never the
other way round.</li>
<li><strong>Radiators</strong> deploy on a hinge; make sure the collider follows, or the ship
will collide with a stowed radiator's deployed collider.</li>
</ul>

<h3>Import settings people get wrong</h3>
<ul>
<li>Unity: turn <strong>off</strong> "Optimize Mesh" if you rely on vertex order, turn
<strong>on</strong> "Read/Write" only if you genuinely need CPU access (it doubles memory),
and set "Normals: Import" — recalculating destroys hard edges on machined surfaces.</li>
<li>Unreal: disable "Combine Meshes" for anything articulated, enable "Import Normals" for
the same reason, and set the collision complexity explicitly rather than accepting the
auto-generated convex hull, which will be wrong for a ship this shape.</li>
<li>Both: import the metallic/roughness maps as <strong>linear</strong>, not sRGB. This is the
most common material bug and it makes everything look like wet plastic.</li>
</ul>

<h2>6. IMPLEMENTATION ROADMAP — MVP TO FULL FEATURE</h2>
<table>
<tr><th>Phase</th><th>Deliverable</th><th>Acceptance test</th><th>Risk retired</th></tr>
<tr><td>0<br>1 week</td><td>One sphere, correct gravity, double-precision state, floating
origin, log depth</td><td>Circular orbit stable for 100 orbits with no drift and no
jitter at 1e11 m from origin</td><td><strong>Precision.</strong> If this fails, nothing
else matters</td></tr>
<tr><td>1<br>2 weeks</td><td>Cube-sphere quadtree terrain, CPU mesh build, skirts</td>
<td>Fly from 1000 km to touchdown with no cracks, no popping, no frame spikes above 8 ms</td>
<td><strong>LOD and streaming.</strong> The hardest sustained engineering problem here</td></tr>
<tr><td>2<br>1 week</td><td>Atmospheric scattering, ocean, basic clouds</td>
<td>Sunset from the ground, limb from orbit, and the transition between them, all with
no seam</td><td><strong>Multi-scale rendering</strong></td></tr>
<tr><td>3<br>2 weeks</td><td>Full flight model: aero, RCS, SAS, gear, re-entry heating</td>
<td>Deorbit burn, survive re-entry, land on a slope, take off again</td>
<td><strong>Physics stability</strong> across 12 orders of magnitude of velocity</td></tr>
<tr><td>4<br>1 week</td><td>Patched conics, manoeuvre nodes, time warp, navball</td>
<td>Plan and execute a Hohmann transfer to a moon using only the UI</td>
<td><strong>Gameplay readability</strong></td></tr>
<tr><td>5<br>1 week</td><td>Wormhole, procedural exosystems</td>
<td>Jump to another star, arrive on a stable orbit, land on a planet that has never been
generated before</td><td><strong>Content scale</strong></td></tr>
<tr><td>6<br>2 weeks</td><td>Surface scatter, weather, biome variety, audio</td>
<td>Ten planets that a player can tell apart from orbit and from the ground</td>
<td><strong>Perceived variety</strong> — the thing No Man's Sky is actually judged on</td></tr>
<tr><td>7<br>ongoing</td><td>Ship systems, resources, EVA, saving, multiplayer</td>
<td>A 30-minute session with a goal and no soft-locks</td><td><strong>Game</strong>, as
opposed to tech demo</td></tr>
</table>
<div class="note">Phases 0 and 1 are roughly half the total engineering effort and produce
almost nothing screenshot-worthy. Every project that skips them ends up rewriting from
scratch at phase 3, when the physics starts producing NaN at Jupiter's distance and the
terrain seams cannot be fixed without changing the LOD scheme.</div>

<h2>7. PERFORMANCE BUDGET</h2>
<p>Frame budgets: 16.6 ms at 60 fps on desktop, 33.3 ms at 30 fps on mobile. Leave 20 percent
headroom or you will miss vsync on the frames that matter.</p>
<table>
<tr><th>System</th><th>Desktop (ms)</th><th>Mobile (ms)</th><th>Main lever</th></tr>
<tr><td>Terrain raster</td><td>2.5</td><td>5.0</td><td>Chunk count, LOD depth cap</td></tr>
<tr><td>Terrain mesh generation (CPU)</td><td>1.5</td><td>3.0</td><td>Chunks built per frame; move to a worker/job</td></tr>
<tr><td>Atmosphere</td><td>1.5</td><td>3.5</td><td>March step count</td></tr>
<tr><td>Volumetric clouds</td><td>3.0</td><td>6.0</td><td>Quarter-res + reprojection, or billboard fallback</td></tr>
<tr><td>Ocean</td><td>1.0</td><td>2.0</td><td>Wave count, detail fade distance</td></tr>
<tr><td>Ship and props</td><td>1.5</td><td>3.0</td><td>LOD chain, instancing</td></tr>
<tr><td>Particles / VFX</td><td>1.0</td><td>2.5</td><td>Pool cap, overdraw</td></tr>
<tr><td>Post chain</td><td>2.0</td><td>4.0</td><td>Bloom resolution, drop motion blur first</td></tr>
<tr><td>Physics + orbits</td><td>0.5</td><td>1.0</td><td>On-rails propagation when coasting</td></tr>
<tr><td>Headroom</td><td>2.1</td><td>3.3</td><td></td></tr>
</table>

<h3>Optimisations in priority order</h3>
<ol>
<li><strong>Move terrain generation off the main thread.</strong> Unity Jobs plus Burst, or a
Web Worker. This is the single biggest win and it removes the hitching that players notice
most.</li>
<li><strong>Horizon-cull terrain chunks.</strong> On the ground you can see perhaps 5 percent
of a planet's chunks; culling by the horizon angle is a couple of lines and removes most of
the draw calls.</li>
<li><strong>LOD hysteresis</strong> — split and merge at different distances. Costs nothing
and eliminates a whole class of stutter.</li>
<li><strong>GPU instancing for surface scatter.</strong> Rocks and plants placed by a
deterministic hash need exactly one draw call per type per chunk.</li>
<li><strong>Quarter-resolution volumetrics</strong> with depth-aware upsampling before you
consider reducing step counts — resolution is cheaper to lose than sample count.</li>
<li><strong>Occlusion culling</strong> matters far less than people expect on a planet
surface, because the horizon already does the work. Spend the time on chunk streaming
instead.</li>
</ol>

<h3>Profiling method</h3>
<p>Measure with GPU timer queries per pass, not with frame rate. Frame rate is a ratio and it
hides which pass regressed. Capture a fixed camera path — orbit, re-entry, low flight,
landed — and run it after every change; the four scenarios stress completely different parts
of the pipeline, and an optimisation that helps orbit often hurts the ground.</p>

</div>`;
