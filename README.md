# Main

Create things

## Cloudline — The Coastal Line

`index.html` is a complete, single-file 3D browser game built with Three.js.
Open the file in any modern browser and drive.

You are the driver of a retro green tram running the Coastal Line, a loop of
islands floating above a sea of clouds. Four stops, and only two of them are
ordinary:

| Stop | What it is |
| --- | --- |
| **Saltlight Terminus** | Red-tiled harbour town, striped lighthouse, boats at the jetty |
| **Mango Tide** | Its warmer sister across the water |
| **Mycelia Market** | A fungal city — house-sized caps, glowing gills, spore drift |
| **Pumpkin Hollow** | Crooked roofs, carved lanterns, bats and a low mist, after dark |

Each region paints its own island *and* calls its own tune: the score is
generated live, and crossfades as you travel. The Hollow gets a music box in A
harmonic minor, tritone and all.

**Driving**

| Key | Action |
| --- | --- |
| `W` | Power |
| `S` | Brake |
| `A` / `D` | Trim — lean against a crosswind |
| `B` | Ring the bell (once fitted) |
| `←` / `→` | Swing the camera |
| `C` | Change view (chase / cab / cinematic / wing) |
| `M` / `H` | Sound / driver's notes |

On a touch screen, hold the POWER and BRAKE pads and drag to look around.

**The idea.** Passengers judge the ride, not the clock. Sudden power, hard
braking, taking the elevated curves too fast and unanswered crosswinds all drain
*leg comfort*; stop on the mark and the tips follow. Push it and things go
wrong — someone loses their footing, the tea goes over, a case comes off the
roof rack, and a passenger who has had enough gets off early.

The line also hands you jobs as you drive: spore drift to ease through, a
lantern rolled onto the rails, a squall to hold your trim against, a passenger
asleep in the front seat. Hold the job for the few seconds it asks and the
cabin pays you for it.

**The workshop.** Between runs, visit **Oliver's Cloudworks** to fit any of
twelve parts — lanterns, ivy, a turf roof, velvet benches, sand brakes, storm
skirts, a brass bell, living spore lamps, and eventually a second car. Each one
changes how the tram looks *and* how she rides.

Everything in the scene is generated in code: no textures, models or audio
files are loaded. Three.js is pulled from a CDN (with two fallbacks); nothing
else is required.
