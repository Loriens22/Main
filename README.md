# Saltlight · The Coastal Line

An original, playable 3D browser game about a gentle evening tram run between floating seaside villages. The models are made in **Blender 4.3** and the game is built in **Godot 4.6**, using its WebGL 2 Compatibility renderer. The browser HUD is a small, responsive HTML/CSS/JavaScript shell around the real Godot simulation.

## Play

**[Play Saltlight in your browser](https://rawcdn.githack.com/Loriens22/Main/955fe1dafa3f22adc01837c7b626bd1f078b2c4b/web/index.html)**

On a first visit, the host displays an external-content notice. Choose **Open the page**, then **All aboard**. The published build has been checked in a browser with real keyboard and touch input.

Choose **All aboard**, then hold **W** for power and **S** to brake. Release to coast. Arrow keys also accelerate, brake, and look around. **C** changes between chase, window and scenic cameras. **Space** opens the doors at a station and departs after boarding. **R** visits Oliver's Cloudworks while stopped at a station. **P / Esc** pauses. On mobile, hold the Power and Brake buttons.

Carry passengers between **Saltlight Terminus** and **Mango Tide**. Ease off for raised curves, downhill sections, and crosswinds. A smooth arrival earns **75 coins**; a rough one earns **35**. Rough driving can break your tip streak, and a stretch of balanced driving rebuilds it. A station safety brake prevents missed platforms.

The workshop fits **Hearth leaves** (50 coins: green roof and ivy) and **Little Companion** (75 coins: luggage rack, lanterns and softer suspension). Fittings are animated in an isometric workshop and visibly change your tram. Fares and fitted parts are saved locally in your browser. Sound starts after your first interaction; the sound button mutes the original procedural score, wheel joints, wind and bells.

## Open the source

- `blender/saltlight_assets.blend` — editable original low-poly asset library.
- `blender/build_assets.py` — deterministic, commented asset generator and glTF exporter.
- `godot/project.godot` — open this project in Godot 4.6.3 or later.
- `godot/scripts/world.gd` — Catmull–Rom/Bezier loop, continuous rails, instanced sleepers, bridges, village assembly, sea, clouds and workshop.
- `godot/scripts/game.gd` — inertial acceleration and braking, corner roll, crosswinds, comfort, boarding, rewards, upgrades and follow cameras.
- `web/` — the checked-in browser build and responsive HUD. No runtime CDN or third-party game assets are required.

### Rebuild

Install Blender 4.3+, Godot 4.6.3 and its matching export templates, then run from the repository root:

```sh
blender -b -t 2 --python blender/build_assets.py
godot --headless --path godot --editor --import --quit
godot --headless --path godot --script res://tests/simulation_check.gd
godot --headless --path godot --export-release Web ../web/index.html
python3 -m http.server 8000 --directory web
```

Visit `http://localhost:8000`. Browser security requires serving the WebAssembly game over HTTP(S), so opening `index.html` as a `file://` URL will not work. The export is single-threaded and works on GitHub Pages without cross-origin isolation headers.

The game lives on the `saltlight-coastal-line` branch of `Loriens22/Main`. The connected GitHub integration cannot enable GitHub Pages, so the play link serves the published GitHub build through the githack CDN. The link is pinned to the tested game commit.

Re-export after changing Godot source or Blender assets, publish the updated browser build to this branch, and update the CDN link to the new commit. To use GitHub Pages instead, the repository owner can select **Settings → Pages → Deploy from a branch → saltlight-coastal-line → / (root)**.

## Credits

All 3D models, game code and procedural music were created for Saltlight. Fraunces and DM Sans are bundled under their SIL Open Font Licenses (`web/fonts/`). Godot is MIT-licensed; Blender is GPL-licensed. No Studio Ghibli or Nintendo assets are used.

This is a complete small game with an endless two-station line, rather than a commercial-sized open world. It requires a recent browser with WebGL 2 enabled.
