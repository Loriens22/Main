# Interstellar: Beyond Endurance

An unofficial, fan-made 3D space-exploration game inspired by *Interstellar* (2014), playable in the browser on
desktop, tablet and phone. Built with TypeScript, Three.js, Rapier physics and Preact; every model (farm, NASA
complex, Ranger, Endurance, stations, bases, creatures) is generated in Blender from the scripts in `blender/`.

## Play in the browser

<!-- PLAY_LINK -->

## What is in it

- **Earth**: the farm in the dust storms, six kilometres of county road, the concealed NASA facility with its
  launch silo; the launch to orbit.
- **The Endurance**: walkable ring of twelve modules, hub and spoke lift, spin gravity, docking of the Rangers.
- **The Solar System and Gargantua**: real ephemerides, Lambert transfers, time compression, cryo sleep, Saturn,
  the wormhole, the black hole with its time dilation.
- **Landings**: every solid body has a landing site; the gas and ice giants have floating stations at 1 bar
  (reached by descent and left with an ascent booster).
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
| Crew, computer, creative | G, M, P | D-pad, Back | Crew, Computer (top strip) |
| Driving | W A S D, Space brake, H lights, V camera | | stick, Brake, Lights, Cam |
| Submersible | W S A D, Space / C up / down, Shift boost, L lamps | | stick, Up, Down, Boost, Lamps |
| Flying | stick or W S A D pitch / yaw, Q E roll, Shift / Ctrl throttle, Z max, X cut, I J K L U O translation, R SAS, N gear, Y autopilot | | stick, Roll L/R, Thr +/-, Max, Cut, RCS pad, SAS, Auto, VTOL; Gear, Lights, Camera in the top strip |
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
