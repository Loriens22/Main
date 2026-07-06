# LUXORA Residences — Photoreal 3D Apartment Complex

A real-time, photorealistic **3D model of a modern European luxury residential
complex**, rendered in the browser with WebGL (Three.js) and delivered as a
**single, fully self-contained `index.html`** — no internet connection, build
step, or external assets required to view it.

The design is modelled on the reference photography: interconnected
L/U-shaped blocks around a private courtyard, 5–7 storeys, with clean white
large-format facade panels, warm teak wood cladding, dark charcoal metal
accents, vertical green living walls, floor-to-ceiling reflective glazing,
cantilevered wood penthouse volumes, and a landscaped courtyard beside a large
boulevard — all set against the Vitosha mountain backdrop.

## View it

Just open **`index.html`** in any modern desktop browser (Chrome, Edge,
Firefox, Safari). Everything — including the Three.js engine — is inlined.

**Controls**
- Drag to orbit · scroll to zoom · right-drag to pan
- Camera presets: *Aerial Drone · Courtyard · Facade Detail · Penthouse · Boulevard*
- *Midday* / *Golden Hour* lighting, plus live **sun elevation / direction** sliders
- *Auto-orbit* toggle

## Features

- **Architecture** — merged-geometry facade system: projecting floor slabs,
  picture-frame white panels, recessed dark-framed glazing with mullions,
  projecting balconies (perforated-metal & glass balustrades) with planters,
  full-height ivy living-wall strips, wood louvre bays, cantilevered wood
  penthouses with roof terraces, and rooftop HVAC / solar arrays.
- **Warm interiors** softly glow behind the reflective low-E glass.
- **Site** — courtyard lawns, winding stone paths, gabion seating walls,
  planting beds, benches, young trees; a full boulevard with lane markings,
  moving & parked cars, streetlights, sidewalks and street trees.
- **Environment** — real physical **sky + sun** with a PMREM environment map
  driving true reflections on glass and metal, ACES-filmic tone mapping, soft
  shadows, atmospheric haze, a displaced mountain range and neighbouring towers.
- **Performance** — static geometry is baked into a handful of merged meshes;
  trees, shrubs, flowers and people use GPU instancing.

## Rebuilding `index.html`

The single file is produced by bundling the ES-module sources in `build/src/`
(and Three.js) with esbuild.

```bash
cd build
npm install          # three + esbuild (from npm)
node build.mjs       # -> ../index.html
node verify.mjs      # headless-Chromium smoke test + screenshots
```

`build/src/` layout: `textures.js` (procedural PBR canvas textures) ·
`materials.js` · `building.js` (facade/wing generator) · `landscape.js` (site,
boulevard, backdrop) · `main.js` (scene, sky, camera, UI, loop) ·
`template.html` (HTML shell + UI).
