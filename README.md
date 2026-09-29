# Space Exploration

An open-universe space exploration game in a **single HTML file** (`index.html`), built on three.js / WebGL2.
Open `index.html` in a modern desktop or mobile browser (Chrome, Edge, Firefox, Safari 16+). It loads three.js from the jsDelivr CDN, so it needs a network connection on first load.

## Highlights
- **Deterministic universe** from a 64-bit seed: 256 galaxies × 4,294,967,296 regions × 122–642 star systems × 2–6 planets + moons. Same seed, same universe for everyone.
- **Seamless planets**: quadtree cube-sphere terrain streamed from Web Workers, physically based atmospheric scattering, raymarched volumetric clouds, oceans / lava / ice, rings, aurora, weather (storms, blizzards, toxic rain, radiation, embers…), real day/night from planetary rotation.
- **Procedural life**: dozens of plant archetypes (trees, palms, conifers, foxglove stalks, flytraps, floating jellyfish flora, crystals, corals…), wind-animated dense grass, and skinned procedural creatures (quadrupeds, hexapods, bipeds, flyers, hoppers, slugs, swimmers, air-jellies) with herd AI.
- **Flight**: space ↔ atmosphere flight model, pulse drive, atmospheric entry heating, automatic landing/take-off with animated gear and dust, station docking, hyperdrive warp tunnel, photon cannons & beams, squadron wingmen.
- **Space stations** with walkable hangars and terminals, **freighters**, NPC traffic, asteroid fields, sentinels, points of interest (ruins, monoliths, portals, crashed ships, settlements…).
- **Building**: planetary bases, auto-connecting cuboid rooms, deployable orbital habitats, terrain manipulator, teleporters, landing pads.
- **Ship fabricator** with modular parts, classes and next-generation presets.
- **Endless research & lore**: procedural research tiers, discoveries with naming/upload, Chronicle entries, and messages from *The Archivist*.
- **Modes**: Creative (no hostility, infinite everything), Normal, Survival, Permadeath.
- **Co-op (optional)**: serverless peer-to-peer multiplayer over WebRTC. Pause → *Co-op* → *Create invite*, send the code to a friend, paste their reply, done. Other tabs of the same browser join automatically. Travellers see each other on foot and in their ships, share one world clock, chat (Enter), wave, and can travel to each other's systems.
- **Mobile**: virtual joystick, drag-to-look, context buttons that switch between on-foot, flight and build layouts; gamepad supported. Adaptive resolution and quality presets.

## Controls (touch)
Left thumb: floating joystick (walk; in flight it rolls and sets throttle) · Right thumb: drag to look — in flight the drag works as a held flight stick · Buttons: USE (multi-tool), JUMP (jetpack), E (interact / board), SCAN, VISOR, TOOL, RUN · In the ship: FIRE, PULSE (take off / pulse drive), BOOST, LAND, BEAM, TARGET · Top bar: menu, inventory, galaxy map, build, quick menu, camera, fullscreen.

## Controls (desktop)
WASD move · Mouse look · Space jump/jetpack · Shift sprint · E interact/board · F analysis visor · C scanner · LMB multi-tool · Q switch tool · B build · G quick menu · M galaxy map · Tab inventory · J research · V camera · Esc pause · Enter co-op chat.
In a ship: mouse steer · A/D roll · W/S throttle · Shift boost · Space pulse / ascend / take off · E land/exit · T target · LMB cannons · RMB beam.
