# Vehicle models

Every bus type is a **spec** (data the game uses: dimensions, doors, seat map, physics,
sound, fleet) plus a **model** (the Three.js object you see). Game code never imports a
particular bus; it asks `bus.spec` and talks to `bus.model` through the interface below.

```
src/vehicle/Vehicles.js        registry: VEHICLES, LINE_FLEETS, dispatchVehicle(), vehicleSpec()
src/vehicle/frames.js          section frames of a spec (bumper, body ends, hitch)
src/vehicle/models/<id>/spec.js     the spec
src/vehicle/models/<id>/index.js    spec.create = (opts) => new <Model>(spec, opts)
src/vehicle/models/<id>/*.js        the detailed model (any number of files)
src/vehicle/models/GenericBusModel.js   placeholder/fallback built from the spec alone
```

The MAN Lion's City G (`man`) predates this folder and lives in `src/vehicle/Bus*.js`.

## Coordinate frames

Metres; `x` right, `y` up, `z` **backwards** (forward is `-z`). Ground at `y = 0` under the
wheels (the wheel centres are at `y = wheelR`).

| | articulated (`man`, `conecto`) | rigid (`procity`, `yutong`) |
|---|---|---|
| `model.front` origin | middle axle (axle 2) | rear axle |
| `model.rear` origin | rear axle (axle 3) | unused, kept empty (BusEntity copies the front transform into it) |
| front bumper | `frames(spec).frontZ = -(frontOverhang + wb1)` | same |
| front body end / rear body start | `frontEnd`, `rearStart` (hitch ± bellowsGap) | - |
| rear bumper | `rearZ = rearOverhang` in the rear frame | `rearOverhang` in the front frame |

Doors are on the right (`+x`) side; `spec.doors[i] = {id, section, z0, z1}` gives the clear
opening in the section frame (`z0` leading edge). The model must put its door portals exactly
there: passengers, the AI and the player walk through those openings.

## Model interface (what the game calls)

Constructor: `new Model(spec, { fleet, quality, interior })` — `quality` is `'ultra' | 'high' |
'balanced'`; on `'balanced'` drop small trim (phones). `interior: false` may skip the cabin.

Required members:

| member | meaning |
|---|---|
| `root` | `THREE.Group` containing `front` and `rear` |
| `front`, `rear` | section groups; BusEntity sets their world transforms every frame |
| `signs` | `{front, side, rear, interior}` LedSign instances (see `LedSign.js`) |
| `wheels` | `[{knuckle, spin, steer, side, section}]`: `knuckle.rotation.y` steers, `spin.rotation.x` rolls |
| `doorLeaves` | `{[doorId]: [{pivot, end}]}` (used by the default `setDoor`) |
| `mats`, `lightMats` | `lightMats = {head, brake, tail, reverse, left, right}` materials switched by `setLights` |
| `interiorGroups` | groups hidden beyond 70 m (`setDetail`) |
| `dashCanvas`, `dashTex` | 512×256 canvas + CanvasTexture of the instrument cluster in the cab |
| `steeringWheel` | Object3D rotated about its local z by `setSteer` |
| `driverEyeLocal` | `THREE.Vector3`, driver's eye in the front frame (cab camera) |

Required methods: `setDestination(number, text)`, `setInteriorText(a, b)`, `setSteer(delta)`,
`spin(distFront, distRear)`, `setDoor(id, openness 0..1)`, `setLights({head, brake, reverse,
left, right, interior})`, `setStopRequested(on)`, `setWiper(angle)`, `setDetail(cameraDist)`,
`dispose()`, `afterPose()` (called after the section transforms change; update bellows here).

Optional: `drawDash(ctx2d, state)` draws this vehicle's own instrument cluster into `dashCanvas`
(Game.updateDashboard passes `{w, h, speedKmh, rpm, maxRpm, selector, gear, parking, stopBrake,
doorsOpen, head, indL, indR, engineOn, pressure, retarder, kneel, time, hour}`); without it the
generic cluster is drawn.

The simplest way to satisfy the interface is to **extend `GenericBusModel`** and override the
build methods (`buildSection`, `buildCabin`, `buildCab`, `buildSigns`, `buildBellows`, ...),
keeping the members listed above.

## Spec layout (seat map)

`spec.layout = {seats, standing, aisleFloorY(sec, z), walk, fabric}`:

* `seats[i] = {sec, x, z, yaw, fy, kind, side}` — `(x, z)` is the seat cushion centre, `fy` the
  floor height under it (podium seats are higher), `yaw` 0 faces forward, `Math.PI` backwards.
  Riders and the player sit at `(x, fy + 1.2, z)`. **The model draws its seats from this list**,
  so the seat map and the geometry never disagree.
* `standing[i] = {sec, x0, x1, z0, z1}` — areas where standing riders are drawn.
* `walk[sec] = {zMin, zMax, cabZ, cabX}` — the walkable aisle; ahead of `cabZ` the player
  cannot go left of `cabX` (the driver's cab).

`autoLayout(spec, opts)` generates a plausible map; a detailed model should replace it with
the seat map read from the reference photos (`data/research/ref_photos/v2/`).

## Performance budget (per bus, `high`)

* about 120 draw calls, including the interior; use `Parts` (BusGeom.js) to merge per material,
  then `bakeStatic(root, keepMaterials)` (BusBake.js) to merge plain colours;
* no textures over 1024 px; canvas textures are fine (BusTextures.js has helpers);
* nothing per frame except what the interface methods change.

## Checking a model

```
OUT=/path/test.html node build.mjs --dev
node tools/shot.cjs /path/test.html /out "noloop&q=high&scene=bus&veh=<id>&doors=1" \
  '[{"eval":"(__game.look(9,2.4,-16,0,1.4,-3,45),1)"},{"canvas":"34.jpg"}]'
VEH=<id> node tools/route_check.cjs /path/test.html A 40     # the AI drives the whole route
```

`?scene=bus&veh=<id>` is the model studio (`art=` articulation angle, `steer=`, `doors=0..1`,
`h=` hour, `w=` weather).
