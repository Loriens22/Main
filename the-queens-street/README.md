# The Queen's Street — Улицата на Кралицата

A darkly comedic 3D street-chaos game in one HTML file (`index.html`). It runs in any modern browser with WebGL2, on desktop and on phones.

Aunt Penka believes the street outside her peach-coloured house belongs to her. Anyone who parks there pays for it.

**All characters, names, houses and street names are fictional.** The game is set on an invented Bulgarian suburban street. It does not recreate any real person, home or address.

## How to run

Open `index.html` in Chrome, Edge, Firefox or Safari. The page loads three.js r169 from the jsDelivr CDN, so it needs an internet connection. Everything else is generated in the browser at load time: all textures, geometry, characters, cars, sound effects, music and voices.

Serving the folder works too (for example `npx serve the-queens-street`). On phones, landscape orientation plays best.

## Game modes

**1 · Play as the Queen.** An opening cinematic shows Penka smoking on her terrace when a car parks in front of her gate with its hazard lights on. She screams, and then you take control.
- Go down the outside stairs into the garage and pick up the mace (боздуган), sledgehammer (чук), chainsaw (резачка) and a wheelbarrow of stones.
- Cars keep arriving: single drivers, families, tracksuit guys who fight back, and the police once the scandal meter rises.
- Rich drivers in black SUVs offer a random 500–2000 € bribe. Accept it, or refuse it and get punched.
- Cars dent where you hit them, glass cracks and shatters, alarms and hazard lights go off, and damaged cars smoke, burn and explode. The chainsaw cuts roofs off; a cut roof is a "convertible".
- **ULTRA** (Q): Penka launches into the air, spins in slow motion and flattens a car.
- **Nokia** (F): she dials Granny Zlata, who stays for exactly 35 seconds and curses everything nearby. Cars melt like wax, cursed cars crash into each other, and a "truck of doom" barrels down the street.
- **Hunger** fills over time. At 100% you choose between going back to the terrace for 28 seconds of rest with a very old discount chicken, or 30 seconds of monster mode in which she eats passers-by.

**2 · Survive as a visitor.** You stopped "just for five minutes". Penka hunts you with the same abilities, including stones, the chainsaw, ULTRA leaps (with a red landing marker you can dodge) and Granny Zlata's curse orbs. A garbage truck blocks the only exit for 60 seconds, so survive until it leaves, then run west to the mountains. You can roll, throw stones, pick up a shovel and knock her down for a breather.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / run | WASD / Shift | Left joystick (push far to run) |
| Look | Mouse (click to lock) | Drag on the right half |
| Hit (hold for chainsaw) | Left click / J | УДАР |
| Throw stone | Right click / K | КАМЪК |
| Pick up | E | ВЗЕМИ |
| Next weapon | R / Tab / 1–5 | ОРЪЖИЕ |
| ULTRA | Q | УЛТРА |
| Nokia → Granny Zlata | F | НОКИЯ |
| Dodge roll (mode 2) | C | ТЪРКАЛЯНЕ |
| Bribe accept / refuse | Y / N | on-screen buttons |
| Pause | Esc | II |

A gamepad is also supported, with a standard mapping.

## Settings

- **Graphics:** quality preset, shadows (off/1K/2K/4K), ambient occlusion (GTAO), bloom, resolution scale, dynamic resolution, field of view, and time of day (noon, afternoon, sunset).
- **Controls:** sensitivity, invert Y, touch controls on/off/auto, aim assist.
- **Audio:** master, music, effects and voice volumes.
- **Language:** Bulgarian or English UI. English mode adds translated subtitles.

## Voices

All dialogue is written in Bulgarian and is spoken through the browser's speech synthesis. The game picks a Bulgarian voice when one is installed and otherwise falls back to a Russian or other Cyrillic voice. Pitch and rate are set per character, so Penka sounds deep. If no suitable voice exists, or you choose "Babble", a synthesized gibberish voice is used instead. Subtitles are always available.

## Tech notes

- **Rendering:** three.js r169 with PBR materials, IBL from a procedural sky, soft shadows, GTAO, bloom, MSAA/FXAA and a colour-grading pass (vignette, grain, chromatic aberration).
- **Textures:** all canvas-generated, with normal and roughness maps (stucco, roof tiles, stone cladding, paving, asphalt, wood, leaves, fabrics).
- **Characters:** procedural skinned meshes driven by procedural animation, with verlet ragdolls.
- **Cars:** deformable shaped bodies on a custom rigid-body solver (ground contacts, car-to-car impulses).
- **Sound:** fully synthesized with WebAudio, including the music (a procedural ръченица in 7/16).
