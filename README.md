# Main

Create things

---

## Island Protocol: Presidential Extraction

A single-file 3D survival-horror action game. Open **`island-protocol.html`** in any
modern browser — no build step, no server, no dependencies, no network access. The
whole thing (renderer, audio, AI, levels, UI) is ~7,000 lines in one file.

### What's in it

**Engine** — a hand-written WebGL2 renderer (with a WebGL1 fallback), textureless
from top to bottom:

- **Shadow-mapped lighting.** Two 1024² depth maps with PCF filtering — one on your
  flashlight, one on the brightest fixed lamp near you — so everything in the beam
  throws a real shadow across the walls.
- **HDR + post chain.** The scene renders to a half-float buffer, then a bright-pass
  and three blurred mips give bloom, before a filmic tonemap, per-act colour grading,
  chromatic aberration, vignette, grain and a damage-state desaturation.
- **Volumetric light.** The composite pass ray-marches the view against the flashlight's
  shadow map, so the beam is a visible shaft of dusty air that things cast shadows *into*.
- **Procedural materials** with derivative-based bump mapping, rust and stain masks,
  and rain puddles that flatten the normal, darken the albedo and mirror the sky.
- **Baked vertex occlusion and wetness** in the level mesh — corners darken, floors
  open to the sky get wet, and the grime follows the geometry.
- Hemisphere ambient, up to 14 dynamic point lights, rim lighting that keeps
  silhouettes readable, exponential fog, world-lighting lightning, a GPU-batched
  particle system with depth-faded soft particles, rain with splash rings, airborne
  dust that glows inside the beam, and blood that mists and drips.

**Audio** — every sound is synthesised at runtime with WebAudio. Gunshots, reloads,
footsteps per surface, formant-filtered creature voices, a Revenant's wet breathing,
an amplitude-modulated chainsaw, thunder, and a four-layer adaptive score that
responds to threat proximity, combat intensity, and how frightened Elena is.

**Detail** — levels are dressed procedurally: pipe runs and junction boxes along the
walls, ceiling beams and conduit, wall panels, floor grates and drains, hanging cable
loops, emissive lamp fixtures, wall-hugging clutter chosen per room material, and
scattered rubble, litter, cabling, grass and pebbles. The humanoid rig builds a
jointed figure out of primitives — skull, jaw, brow and ears, collar and deltoids,
torso plates and webbing, belt pouches, hands with thumbs, boots with soles, and
tattered cloth that sways — with per-instance height, build and palette variation,
and a cheap rig swapped in for distant figures and the shadow pass.

**Gameplay** — over-the-shoulder third-person shooting with a laser sight and a
biosensor thermal optic; headshot staggers into six-times-damage knife finishers;
an attaché-case grid inventory with rotation, drag-and-drop and item combining;
a radio merchant with permanent weapon refinement; five hand-authored levels across
a prologue and three acts plus a finale; and a companion who can be ordered around,
grabbed, downed, revived — and lost.

**Bestiary** — sixteen enemy types inspired by *Resident Evil 4*'s Las Plagas, all
original: Husks that split open to release scythe-stalks, sack-headed Reapers,
blind sound-hunting Wardens, Revenants that regrow everything until you destroy every
parasite cluster, cloaked Crawlers revealed by lightning, Shepherds that walk straight
past you to take Elena, and three apex bosses.

### Controls

`WASD` move · `Shift` sprint · `Space` dodge roll · `Ctrl` crouch ·
`Mouse` look · `RMB` aim · `LMB` fire · `R` reload · `F` knife · `E` interact ·
`G` throw · `L` flashlight · `V` biosensor scope · `Q` about-face ·
`Tab` attaché case · hold `C` for Elena's order wheel · `Esc` pause

### On a phone or tablet

Touch controls appear automatically (and can be forced on or off in Options). Put a
thumb down anywhere in the **left half** and a movement stick appears under it — push
past the ring to sprint. Drag the **right half** to look. The thumb cluster carries
FIRE, AIM, RELOAD, KNIFE, USE and grenades, with ROLL on the far left; the top row has
LIGHT, WEAP, SCOPE, CASE and Elena's order wheel, and pause sits in the top-left
corner. Control size and look speed are both adjustable, the HUD reflows out from
under your thumbs, the order wheel and attaché case are fully touch-driven, and the
game asks you to rotate to landscape.

### Settings

Individual toggles for post-processing, dynamic shadows, bloom and volumetric light,
plus a quality preset — turn shadows and volumetrics off first if the frame rate
drags. There is a **Brightness** slider if the game is too dark for your screen.

Pointer lock is used when available; if it is blocked the game falls back to
cursor-edge steering so it stays playable inside sandboxed frames.
