# Endurance — layout and systems

Built in Blender by `blender/assets/endurance.py` (exterior) and `blender/assets/endurance_int.py`
(interior); played in `src/world/space/EnduranceZone.ts`. Proportions and palette follow reference
images 8–16 (see `REFERENCE_NOTES.md`).

## Frame and gravity

The zone moves with the ship: the ship is still and the Earth, Sun and stars wheel round it at the
spin rate. Gravity is the centripetal acceleration ω²r away from the spin axis, so it changes the
moment the ring is spun up or down (ship computer, rotation page):

| Place | Radius | At 5.25 rpm |
|---|---|---|
| Main decks (floor) | 29 m | 0.90 g |
| Corridor decks, ring tunnels and nodes | 25 m | 0.78 g |
| Spoke lift at the hub stop | 4.8 m | 0.15 g |
| Hub wall | 2.35 m | 0.07 g |

Below about 0.1 g you float (hub, docked Rangers); above it you walk. Jump push-off speed is the same
in any gravity, so you jump much higher in weak gravity.

## Layout (clock positions, forward view)

| Clock | Module | Main deck |
|---|---|---|
| 12 | Habitat A | crew quarters: bunks, wardrobe, desk, exercise |
| 1 | Landing pod 1 | EVA suits on racks, helmets, preparation bench |
| 2, 4, 8, 10 | Engines 1–4 | run tanks, turbopumps, feedlines into the thrust bulkhead, valves, gauges, control station |
| 3 | Habitat B | mess, galley, air and water recycling; the spoke lands on its corridor deck |
| 5, 11 | Landing pods 2, 4 | stores racks; water tanks in pod 4 |
| 6 | Cryo-lab | hibernation pods in floor wells, sick bay |
| 7 | Landing pod 3 | laboratory, seed vault dewars, growth chamber |
| 9 | Command module | flight console under the window band, command seats, main console bank, ring map, chart table |

Each module has a corridor deck (doors port and starboard into the ring tunnels, a stair down to the
main deck). Ring tunnels run through knuckle nodes; nodes 1, 4, 7 and 10 carry ring airlocks. The hub
has the two axial Ranger ports, the radial Lander ports (12 and 6) and the spoke (3).

## Getting about

* **Docked Ranger → hub:** unbuckle (F) — no cut, the view carries straight on in the ship's frame.
  Open the docking hatches at the panel by the hatch (E): the cabin hatch, the Ranger's docking hatch
  and the hub hatch open in sequence once pressures are equal.
* **Spoke lift:** call it from the hub or the Habitat B corridor deck. The shaft is closed by an iris
  in the hub floor and a curved landing door on the corridor deck unless the car is parked there.
  At the hub stop, jump to float up out of the car.
* **Seats and terminals:** the command seats (sit, F to stand), the navigation, rotation, docking,
  crew, cryo, life-support, laboratory, EVA and engine terminals all open the ship computer on the
  matching page. Ranger seats hand you back to flight (undock from the flight computer, Y).

## Crew

Once the commander is down in the ring, the crew go to their posts: Reyes takes the right command
seat, Hartmann the cryo-lab, Okoye the laboratory. The ring map in the command module shows where
everyone is.

## Displays

Every screen is drawn from the simulation (`EnduranceScreens.ts`): orbit and mission clock, spin and
the gravity it makes on each deck, Ranger status, propellant and hatches, life support and power,
the ground track, the ring map with live positions, the hibernation pods, the mission log, engine
status and tank pressures.

## Developer entry points

* `?zone=endurance`: Ranger 1 docked at the forward port with the crew aboard; you unbuckle in its
  cabin.
* `?zone=endurance&start=hub`: hatches open, you start in the hub.
* `?zone=orbit&start=gate|near|far`: Ranger 1 in orbit near the Endurance (automatic or manual
  docking).
