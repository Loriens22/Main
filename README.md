# Spawn Hub — a Minecraft-style survival server spawn, in one HTML file

`dist/spawn-hub.html` is a self-contained, ~360 KB page that generates and
renders a complete voxel spawn hub at night. No network requests, no assets,
no build step needed to view it — open the file and it runs.

Around **1.9 million blocks** across a 192 × 192 × 112 world, meshed to
~600 k triangles, lit by a real Minecraft-style flood-fill of sky light and
lantern light, and drawn with WebGL2.

## What's in the scene

| District | Where | What |
|---|---|---|
| **Poor quarter** | south-west | 7-storey patched tenement with furnished flats, communal lobby, cellar, roof loft, laundry balconies, a 28-block lava fall down the east flank, floating quartz platforms on chains, a leaning shack, animal pen and crop plots |
| **The Bee Hall** | elevated centre-north | a colossal yellow-and-black bee perched on a timber-and-honeycomb tower — glass compound eyes lit from inside, four glass wings, antennae, plus a honey hall, apiary workshop, loft and a hidden chamber in the bee's belly |
| **Modern quarter** | north-east terrace | 9-storey quartz-and-glass high-rise, double-height lobby with sea-lantern chandeliers, furnished apartments, stair core and bubble-column lift, rooftop garden and helipad, a teal-and-gold annex joined by a glazed skybridge |
| **Market district** | east | seven individually styled shops (bakery, armoury, arcanum, general store, library, flower shop, fish hut), open-air stalls, a covered well, a canal with three bridges, raised timber walkways and a cellar |
| **Kids' pitch** | south | a marked-out 20 × 30 football field lit by eight floodlight masts, tiered spectator stand, scoreboard, playground with slide, swings, climbing frame and sandpit, and a clubhouse |
| **Central plaza** | middle | the spawn monument, community board, nether gate, ornamental pool with a jetty, farm plots, a minecart rail loop and the paths that link every district |

Plus terraced hills, a lake, a pond, streams, forests, bamboo, cave mouths, and
30 named camera viewpoints on a cinematic tour.

## Controls

* **Drag** to look, **W A S D** to fly, **Space / Shift** up and down, **Ctrl** to sprint, **scroll** for speed.
* On a phone: drag the **left half** to move (a stick appears under your thumb), the **right half** to look.
* **T** plays/pauses the tour, **P** opens the places menu, **?** shows help.
* Quality auto-detects; override it in the places panel.

## Source layout

```
src/
  blocks.js      390 block types — textures, shapes, light levels, orientation
  textures.js    331 procedurally painted 16x16 textures (no image files)
  world.js       the voxel volume and the build DSL
  light.js       sky + block light flood fill
  mesher.js      sub-voxel shape meshing, face culling, AO, smooth lighting
  render.js      WebGL2: chunk draw, night sky with a square moon, bloom
  particles.js   smoke, lava drips, fireflies, sparks, splashes, bees
  app.js         boot pipeline, camera, touch controls, cinematic tour, HUD
  shell.html     page shell and UI
  builds/        terrain.js poor.js bee.js modern.js market.js sports.js plaza.js
  BUILD_API.md   the contract every builder is written against
tools/
  bundle.js      concatenates everything into dist/spawn-hub.html
  checkbuild.js  per-builder validator: bounds, floating blocks, ASCII sections
  checkpois.js   verifies every camera viewpoint sits in air with a clear view
  shot.js        headless screenshots of all 30 viewpoints
  mobile.js      emulated-phone layout and load check
```

## Rebuilding

```bash
node tools/bundle.js               # -> dist/spawn-hub.html
node tools/checkbuild.js all       # validate every builder
node tools/checkpois.js            # validate every camera viewpoint
```

Requires Node for the tooling only; the output file itself has no dependencies.
