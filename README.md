# Vitosha Grove Residences — Interactive 3D Model

A photorealistic-style, fully interactive 3D model of a luxury modern
residential complex (contemporary European style: white panel frames,
charcoal recessed floors, wood-clad penthouse volumes, vertical green
walls, landscaped courtyard, boulevard frontage, mountain backdrop).

## The deliverable

**`luxury-apartment-complex-3d.html`** — one single, fully self-contained
HTML file (Three.js is bundled inside, ~560 KB). No internet connection
needed; open it in any modern browser (phone or desktop).

Controls: drag to orbit, pinch/scroll to zoom, two-finger drag to pan.
Buttons: Aerial / Courtyard / Facade / Boulevard / Penthouse camera views,
Golden hour ↔ Midday lighting toggle, Auto-orbit.

## Rebuilding from source

```
npm install three@0.160.1 esbuild
node source/build.mjs
```

- `source/scene.js` — the entire procedural scene (buildings, courtyard,
  boulevard, landscaping, vehicles, people, lighting presets)
- `source/template.html` — page shell (UI, styles)
- `source/build.mjs` — bundles everything into the single HTML file
