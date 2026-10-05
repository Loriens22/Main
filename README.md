# CIVITAS — City & Nation Builder

A single-file 3D city-building and management game (`civitas.html`), inspired by modern city builders and built on Three.js r170.

Open `civitas.html` in a desktop browser with WebGL2 (it loads Three.js from jsDelivr and fonts from Google Fonts). Add `?q=low|medium|high|ultra` to the URL to force a graphics preset.

## Highlights

- **World**: endless streamed terrain with rivers, editable landscape, natural resources, climates, seasons, day/night, weather (rain, snow, storms, fog).
- **Rendering**: PBR materials, procedural facades with interior mapping, GTAO, height fog, bloom, depth of field / tilt-shift, SMAA, cloud shadows.
- **Near-camera detail layer**: within range of the camera every building gains real 3D window surrounds, sills, lintels and pediments, balconies, cornices, gutters, chimneys, porches, cars, rooftop plant and yard props. Trees switch to branching skeletons with alpha-tested leaf, needle and frond cards. Detail is generated on demand inside a per-quality vertex budget.
- **Architecture**: houses from 1965 / 1985 / 2008 / 2015 / 2025; apartment blocks (Old European, Haussmann, socialist panel, renovated panel, 2008, 2017, 2025); four economic classes; era variants for shops, big-box stores, hotels, offices, industry, farms, mines, oil fields and fisheries; about 50 civic services.
- **Simulation**: citizens, households, companies, jobs, education, demand, an economy with production chains, budgets, taxes and policies, traffic agents, public transport, tourism, milestones and a development tree.
- **Territories**: draw and paint cities, countries and districts; merge and split them; assign capitals; flags, colours, borders and per-territory policies.
- **Corporations**: supermarket chains, tech companies and AI labs that release models with benchmark scores.
- **Pulse**: a citizen opinion feed and thought bubbles.
- **Tools**: info views, a mod / god menu, photo mode, and save/load to browser storage or to a file.

## Controls

Right-drag to rotate, middle-drag or Shift+right-drag to pan, and use the wheel to zoom toward the cursor. WASD/QE move the camera; Esc opens the pause menu and `I` opens the info views.
