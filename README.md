# Castle TIME

A single-file 3D first-person action game. Open `castle-time.html` in any browser.

**No dependencies. No network. No asset files.** Every texture, every piece of
geometry, every sound effect, the music, and the voices are generated at runtime
from code inside that one file (~350 KB). Drop it on a phone and it works offline.

## The story

It is 2026. A lattice AI finds a scroll of impossible mathematics — catalogued
once, in 1283, and never again. It burns on the night of **17 October 1283**.

You have a Motorola Timeport, a laser blaster you built yourself, and no time to
change out of your clothes. That last part turns out to matter.

You arrive behind a livestock shed on the outskirts of Castle Aldergarde,
47.9264 N, 3.5583 E. The peasants take one look at you and reach for the
pitchforks.

## Playing

| | Keyboard / mouse | Touch |
|---|---|---|
| Move | `W A S D`, `Shift` sprint, `Space` jump | left stick, RUN, JUMP |
| Look / fire | mouse, left click | drag right half, FIRE |
| Interact | `E` | USE |
| Weapon mode | `1` PULSE / `2` LANCE / `Q` cycle | — |
| Vent heat | `R` | — |
| Codex / pause | `Tab` / `Esc` | pause button |

PULSE is fast and accurate. LANCE is slow, punches through crowds, and is the
only thing that will get you through the barred spire door. They share one heat
sink — burst, don't hold.

## What's in it

- Seven connected zones built as one continuous world: village, ditch and
  gatehouse, bailey, great hall, a 76-step spiral spire, the dungeon, and a
  timed escape through all of it while the castle burns.
- Nine voiced cutscenes with cinematic camera moves, subtitles, and text-to-speech
  using the device's own voices.
- Six archetypes of enemy with a shared procedural humanoid rig, plus a boss.
- **12 anomalies** and **6 relics** to find, logged in an in-game codex.
  One of them is the Konami code. One of them implies you are not the first
  traveller to make this jump.

## How it is built

Written from scratch, in order:

- `math + WebGL micro-engine` — mat4/frustum, one surface shader with hemisphere
  ambient, a moon, eight pooled point lights, ACES tone mapping and fog; a
  billboard shader for particles, beams, decals and contact shadows; a procedural
  sky with stars, moon and drifting cloud.
- `geometry kit` — a transform-stack builder (box, lathe, extrude, gable, stairs,
  arch-with-opening…) that batches every surface sharing a material into one
  buffer per zone. The whole castle draws in ~130 calls.
- `texture foundry` — 38 canvas-painted surfaces with baked relief, soot, moss
  and wear, including the arms of Aldergarde.
- `audio` — WebAudio synthesis for every sound, a convolution reverb built from
  noise, and an adaptive eight-mode score that follows the fight.
- `collision` — oriented-box resolution with step-up, ground/ceiling probes and
  ray casts against world, actors and destructibles.

Quality auto-adjusts if the frame rate drops; there is a manual override in
Settings.
