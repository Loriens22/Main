# Main

Create things

---

## Island Protocol: Presidential Extraction

A single-file 3D survival-horror action game. Open **`island-protocol.html`** in any
modern browser — no build step, no server, no dependencies, no network access. The
whole thing (renderer, audio, AI, levels, UI) is ~7,000 lines in one file.

### What's in it

**Engine** — a hand-written WebGL2 renderer (with a WebGL1 fallback): procedural
surface shading with no textures at all, hemisphere ambient + up to 14 dynamic point
lights + a real spotlight for the flashlight, exponential fog, filmic tonemapping, a
GPU-batched particle/decal/billboard system, animated rain, lightning that lights the
world, and a skeletal humanoid rig driven entirely by matrix math.

**Audio** — every sound is synthesised at runtime with WebAudio. Gunshots, reloads,
footsteps per surface, formant-filtered creature voices, a Revenant's wet breathing,
an amplitude-modulated chainsaw, thunder, and a four-layer adaptive score that
responds to threat proximity, combat intensity, and how frightened Elena is.

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

Pointer lock is used when available; if it is blocked the game falls back to
cursor-edge steering so it stays playable inside sandboxed frames. Touch controls
appear automatically on phones and tablets.
