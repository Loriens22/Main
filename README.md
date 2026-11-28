# Interstellar: Beyond Endurance

An unofficial, fan-made 3D space-exploration game inspired by *Interstellar* (2014), playable in the browser on
desktop, tablet and phone. Built with TypeScript, Three.js, Rapier physics and Preact; every model (farm, NASA
complex, Ranger, Endurance, stations, bases, creatures) is generated in Blender from the scripts in `blender/`.

## Play in the browser

**https://loriens22.github.io/Beyound-Endurance-New-2/**

Desktop (keyboard and mouse, or a gamepad), tablet or phone (touch). Use a current Chrome, Edge, Firefox or Safari
with hardware acceleration on (models and textures, about 190 MB in all, load world by world as you travel). On the main menu choose
Play → Creative Mode.

To leave Earth straight away, open the mission computer (M, or Computer on a touch screen) and choose **Start the
mission now**: the crew boards Ranger 1 with you and the launch computer runs the checklist and the count. Or walk to
the crew access arm in the launch cavern and board there.

## What is in it

- **Earth**: the farm in the dust storms, six kilometres of county road, the concealed NASA facility with its
  launch silo; the launch to orbit.
- **The Endurance**: walkable ring of twelve modules, hub and spoke lift, spin gravity, docking of the Rangers.
- **The Solar System and Gargantua**: real ephemerides, Lambert transfers, time compression, Saturn, the wormhole,
  the black hole with its time dilation.
- **Hypersleep**: four pods in the Endurance's cryo-lab. Use one during a voyage (or just to rest): its lid slides
  open, you climb in and lie down, the plastic film closes round you, the lid closes, and you wake in orbit at the
  destination as the pod opens again. The crew sleeps in the pods beside you.
- **Landings**: every solid body has a landing site; the gas and ice giants have floating stations at 1 bar
  (reached by descent and left with an ascent booster). From Ranger 1 docked to the Endurance, the flight computer
  (Y, or Computer) lands with one button: at a giant the Endurance first takes the Ranger down to the survey orbit,
  then the Ranger undocks, backs away and flies the descent.
- **Warp expansion (in progress)**: NASA's Meridian orbital platform holds the warp starship WSV-1 Halcyon (two
  60 m field rings, bow saucer and bridge, spine with side modules, stern engine; original markings) in an exterior
  cradle 1.6 km ahead of the Endurance. In orbit after the launch the flight computer offers two destinations:
  (A) autopilot docking with the Endurance, unchanged, or (B) **AUTO LAND — ORBITAL PLATFORM**: rendezvous and a hard
  dock on the landing deck's berth, with restraints. The mission computer can launch straight to either. From the
  berth you walk aboard without a cut: Ranger cabin and berth vestibule (weightless), airlock 1 (interlocked doors,
  pressure cycle), the station corridor, operations with the engineers, the glazed inspection gallery between the
  rings, the gangway head, and the zero-g gangway down to the Halcyon's dorsal hatch. Transfers between the Endurance
  and the platform are one button in the flight computer. The dorsal airlock opens into the Halcyon itself: the
  bridge inside the canopy (command dais, flight deck, panoramic window and windscreen, sit-able seats, live
  displays), astrometry with the 4.24-ly star map, warp-field operations, science labs, medical, life support and
  hydroponics, crew cabins, mess and galley, hibernation with four new hinged-canopy capsules (the same sleep cycle
  as the Endurance pods), stores, the four-station pod bay, field-ring access, engineering and its crew. Coming next:
  the engine rooms, the warp flight to the Asterion system, its four planets and the landing pods.
- **Lazarus worlds**: Miller's wave world (wreck and beacon), Mann's ice world (shelter and robot), Edmunds'
  desert (base and old lander).
- **Speculative life** (switchable to a conservative science mode in the settings): animals in Miller's ocean
  and rift (with a submersible), in a Martian cave system, and in Jupiter's air round the station. A field codex
  (J) and scanner (R) record what you find.

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move / look | W A S D, mouse | left / right stick | left half: floating stick; right half: drag to look |
| Jump / crouch / run | Space / C / Shift | A / B / L3 | Jump, Crouch, Run buttons |
| Use (prompt) | E | X | Use button, or tap the prompt |
| Leave seat / vehicle | F | Y | Stand / Exit / Leave seat |
| Helmet lamp, scanner, codex | L, R, J | | Lamp, Scan, Codex (top strip) |
| Crew, mission computer, creative options | G, M, P (the same key closes it) | D-pad, Back | Crew, Computer (top strip) |
| Driving | W A S D, Space brake, H lights, V camera | | stick, Brake, Lights, Cam |
| Submersible | W S A D, Space / C up / down, Shift boost, L lamps | | stick, Up, Down, Boost, Lamps |
| Flying | stick or W S A D pitch / yaw, Q E roll, Shift / Ctrl throttle, Z max, X cut, I J K L U O translation, R SAS, N gear, Y autopilot | | stick, Roll L/R, Thr +/-, Max, Cut, RCS pad, SAS, Auto, VTOL; Gear, Lights, Camera in the top strip |
| Skip the farm–NASA drive (in the pickup, Creative fast travel) | K, or the pause menu | | Skip drive (top strip), or Menu |
| Pause menu | Esc | Start | Menu |

On phones and tablets the touch controls appear at the first touch. Turn the device sideways; the Full screen
button (where the browser allows it) hides the browser bars. Touch devices get the same graphics preset as a
desktop; Settings → Graphics lowers it if a device needs more frame rate.

## Development

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and production build into dist/
npm test           # orbital mechanics, landing, wave and site tests
```

Assets: `npm run assets:textures` (procedural textures), `npm run assets:models` (Blender, needs the `bpy`
module), `node tools/optimize_glb.mjs` and `node tools/optimize_creatures.mjs` (compression). Design notes are in
`docs/`.

Pushes to `main` or the development branch build and publish the game with GitHub Actions
(`.github/workflows/pages.yml`).

*Interstellar* is a trademark of its owners; this project is unofficial and non-commercial, with original models,
characters and designs.
