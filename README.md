# CIVITAS — City & Nation Builder

A single-file 3D city-building and management game (`civitas.html`), inspired by modern city builders and built on Three.js r170.

Open `civitas.html` in a desktop browser with WebGL2 (it loads Three.js from jsDelivr and fonts from Google Fonts). Add `?q=low|medium|high|ultra` to the URL to force a graphics preset.

## Highlights

- **World**: endless streamed terrain with rivers, editable landscape, natural resources, climates, seasons, day/night, weather (rain, snow, storms, fog).
- **Rendering**: PBR materials, procedural facades with interior mapping, GTAO, height fog, bloom, depth of field / tilt-shift, SMAA, cloud shadows.
- **Landscape**: ground shading that varies from lush to dry grass, bare soil, scree and rock with slope and altitude, beaches and mud at the shore; clustered forests with clearings, hedgerows and lone field trees; depth-shaded water with shoreline foam; aerial haze, a filmic colour grade and moonlit nights.
- **Streets**: roads follow hills with graded cut and fill, grassy embankments and retaining walls; junctions sit on flat plateaus with zebra crossings, stop lines, lane arrows, bike lanes, traffic signals, stop and give-way signs and street furniture; asphalt shows age and tyre wear, and winter adds slush tracks and kerb snow.
- **Lots and traffic**: natural lawns with gardens, sheds, hedges and fences, paved forecourts and parking bays, industrial yards with pallets and skips; detailed cars, vans, trucks and buses with working head and tail lights.
- **Near-camera detail layer**: within range of the camera every building gains real 3D window surrounds, sills, lintels and pediments, balconies, cornices, gutters, chimneys, porches, cars, rooftop plant and yard props. Trees switch to branching skeletons with alpha-tested leaf, needle and frond cards. Detail is generated on demand inside a per-quality vertex budget.
- **Architecture**: houses from 1965 / 1985 / 2008 / 2015 / 2025; apartment blocks (Old European, Haussmann, socialist panel, renovated panel, 2008, 2017, 2025); four economic classes; era variants for shops, big-box stores, hotels, offices, industry, farms, mines, oil fields and fisheries; about 50 civic services.
- **Simulation**: citizens, households, companies, jobs, education, demand, an economy with production chains, budgets, taxes and policies, traffic agents, public transport, tourism, milestones and a development tree.
- **Territories**: draw and paint cities, countries and districts; merge and split them; assign capitals; flags, colours, borders and per-territory policies.
- **Corporations**: supermarket chains, tech companies and AI labs that release models with benchmark scores.
- **Pulse**: a citizen opinion feed and thought bubbles.
- **Tools**: info views, a mod / god menu, photo mode, and save/load to browser storage or to a file.

## Gameplay notes

- **Getting started**: the starting highway and its avenue are free. Roads must connect to the highway before anything can be built. Until you build your own utilities, power, water and sewage are imported through that connection. Water towers, water pumps, sewage outlets, wind turbines and coal plants are available from the start.
- **City Advisor**: a card at the top of the screen names the city's most urgent problem and how to fix it, for example "Your roads aren't connected to the highway" or "12 buildings have no water". Tap it for the full list; tap an item to fly to it.
- **Businesses**: shops, factories and offices earn money in proportion to their staff and customers. A struggling business lays off staff and shrinks before it ever closes, and grows back when demand returns.
- **Shopping**: households spend at the shops near home, weighted by distance and appeal. Supermarket chains open stores in dense neighbourhoods that lack one, and shopping trips (including grocery stops on the way home from work) go to the stores that actually get the customers.
- **Pulse**: every post comes from a real citizen and describes their own situation: their rent as a share of income, their workplace and commute, the nearest grocery store, the source of the smoke outside their window. Neighbours reply when they share (or don't share) the experience. Open any citizen to see their likes and dislikes and to ask them questions.

## Controls

**Mouse & keyboard:** right-drag to rotate, middle-drag or Shift+right-drag to pan, and use the wheel to zoom toward the cursor. WASD/QE move the camera; Esc opens the pause menu and `I` opens the info views.

**Touch:** one finger pans and a tap selects; pinch to zoom; twist two fingers to rotate; drag two fingers up or down to tilt; double-tap to zoom in. With a tool active, one finger uses the tool and two fingers move the camera. Buttons at the bottom left zoom, rotate and tilt while held. On phones, panels open as bottom sheets you can drag down or collapse, and the toolbar uses two rows of large buttons.
