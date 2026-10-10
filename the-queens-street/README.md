# The Queen's Street — Улицата на Кралицата

A darkly comedic 3D street-chaos game in one HTML file (`index.html`). It runs in any modern browser with WebGL2, on desktop and on phones.

Aunt Penka believes the street outside her peach-coloured house belongs to her. Anyone who parks there pays for it.

**All characters, names, houses and street names are fictional.** The game is set on an invented Bulgarian suburban street. It does not recreate any real person, home or address.

## How to run

Open `index.html` in Chrome, Edge, Firefox or Safari. The page loads three.js r169 from the jsDelivr CDN, so it needs an internet connection. Everything else is generated in the browser at load time: all textures, geometry, characters, cars, sound effects, music and voices.

Serving the folder works too (for example `npx serve the-queens-street`). On phones, landscape orientation plays best.

## Game modes

**1 · Play as the Queen (day-by-day campaign).** A full 24-hour day/night cycle: the sun and moon move, street lamps and windows light up at dusk, and car headlights come on at night. Every morning at about 07:50 Penka chooses how to spend the day:
- **Guard the street** (the original mode, until 22:00). An opening cinematic shows Penka smoking on her terrace when a car parks in front of her gate with its hazard lights on. She screams, and then you take control.
  - Go down the outside stairs into the garage and pick up the mace (боздуган), sledgehammer (чук), chainsaw (резачка) and a wheelbarrow of stones.
  - Cars keep arriving: single drivers, families, tracksuit guys who fight back, and the police once the scandal meter rises.
  - Rich drivers in black SUVs offer a random 500–2000 € bribe. Accept it, or refuse it and get punched.
  - Cars dent where you hit them, glass cracks and shatters, alarms and hazard lights go off, and damaged cars smoke, burn and explode. The chainsaw cuts roofs off; a cut roof is a "convertible".
  - **ULTRA** (Q): Penka launches into the air, spins in slow motion and flattens a car.
  - **Nokia** (F): she dials Granny Zlata, who stays for exactly 35 seconds and curses everything nearby. Cars melt like wax, cursed cars crash into each other, and a "truck of doom" barrels down the street.
  - **Hunger** fills over time. At 100% you choose between going back to the terrace for 28 seconds of rest with a very old discount chicken, or 30 seconds of monster mode in which she eats passers-by.
- **Go to the Municipality** (see mode 3).

Each day ends with a summary of money earned, fines and bribes paid, then a night time-lapse into the next morning. The campaign (day number, wallet, history) is saved in the browser.

**2 · Survive as a visitor.** You stopped "just for five minutes". Penka hunts you with the same abilities, including stones, the chainsaw, ULTRA leaps (with a red landing marker you can dodge) and Granny Zlata's curse orbs. A garbage truck blocks the only exit for 60 seconds, so survive until it leaves, then run west to the mountains. You can roll, throw stones, pick up a shovel and knock her down for a breather.

**3 · To the Municipality.** The property papers will not sort themselves out. This mode jumps straight into the mission; it is also the second daily choice in the campaign.
- **The terrace.** Penka yells at her husband Гошо and then calls her friend Кака Бистра on the Nokia. Bistra arrives carrying three enormous folders ("тежи цял тон").
- **The car.** They leave in a dirty sage-green estate with roof rails and mud up to the windows. Penka lights a cigarette and puts on black sunglasses.
- **The drive.** About 12 km along a long Sofia-style boulevard: tram tracks and trams with stops, traffic lights, zebra crossings with pedestrians, a tree-lined median, panel blocks, shops and billboards. Vitosha and the hills sit in the distance.
  - Traffic drives with its own AI: it brakes, changes lanes, honks and gets out to argue if you ram it.
  - Braking hard from speed makes the tyres squeal and starts an **oil leak**. The oil trail makes cars behind you spin.
  - Bistra throws beer bottles out of the window (B), and both women comment on everything.
  - **Police.** Red lights, rammed cars, hit pedestrians, bottles and car damage add up to a fine of 500–28 000 €. Pull over when the police chase you (or meet a checkpoint), then pay or try a bribe. Fines above 1 500 € get special lines.
- **The radio** (R). Two procedural stations play rap and a 7/16 чалга loop. A third, "Queen Radio", plays any MP3 you load with the ⏏ button. The file stays in your browser (IndexedDB) and loops if it is short. Turning to it triggers a 15–20 s cinematic: the car drives itself while both women nod and rap along, and Penka fans a stack of cash.
- **Arrival.** Penka brakes hard in front of a monumental building with relief panels and a tower. Both doors slam, and five seconds later the driver's door falls off.
- **Inside.** A communist-era hall with five counters, flickering fluorescent tubes, plastic chairs and a green elevator.
  - Леля Донка demands a queue ticket. Take one and wait (time-lapse), or refuse and start a **fight**. Clerks throw paper stacks, binders and staplers, any weapon works, and Bistra fights with her heel.
  - Chainsaw a counter and someone presses the red button. Four white vans and a black sedan bring the Mayoress. She opens the law book, and the paper turns into a **paper monster** with purple lasers, orbiting law books, stomps and paperling minions every 2 minutes.
  - The elevator to **floor 7 – Имотни въпроси** shakes and creaks, and the cable can snap (58% chance, game over and retry from the elevator).
  - On the luxurious 7th floor a secretary hands over the form. Fill it in correctly, attach the right documents and stamp it before 17:00, then drive home at sunset.

## Content note

All characters, names, houses, vehicles and institutions are fictional or generic. Penka, Гошо, Granny Zlata, Кака Бистра, Леля Донка and the Mayoress are invented characters, not portrayals of real people. Vehicles and buildings carry no real brand logos.

The game does not ship any copyrighted music. "Queen Radio" plays only a file that you load yourself.

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

**Driving (mode 3)**

| Action | Keyboard | Touch |
|---|---|---|
| Gas / brake & reverse | W / S | ГАЗ / СПИРАЧКА |
| Steer | A / D | left joystick |
| Handbrake | Space | РЪЧНА |
| Horn | H | КЛАКСОН |
| Radio station / load MP3 | R / ⏏ | РАДИО |
| Bistra throws a bottle | B | БУТИЛКА |
| Camera (chase / far / hood / cockpit) | C | КАМЕРА |
| Use / talk / take ticket (Municipality) | E | ВЗЕМИ |

The pause menu has a "skip the drive" button.

A gamepad is also supported, with a standard mapping.

## Settings

- **Graphics:** quality preset, shadows (off/1K/2K/4K), ambient occlusion (GTAO), bloom, resolution scale, dynamic resolution, field of view, time of day (noon, afternoon, sunset) for the menu and mode 2, campaign day length (12/24/48 real minutes per 24 h) and a daytime-only option.
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
- **Sound:** fully synthesized with WebAudio, including the music (a procedural ръченица in 7/16) and the radio stations.
- **City:** the boulevard is streamed in 120 m chunks, with canvas-generated facades whose windows light up at night.
- **Driving:** a bicycle-model car with tyre slip, a stability assist and handbrake drifts. Traffic uses an intelligent-driver model that obeys lights, pedestrians and trams.
- **Interiors:** the Municipality hall, elevator cabin and 7th floor are separate worlds, swapped in without reloading the page.
