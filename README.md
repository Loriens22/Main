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
Buttons: Aerial / Courtyard / Facade / Boulevard / Penthouse / Inside camera
views, Golden hour <-> Midday lighting toggle, Auto-orbit, FX (bloom
post-processing), Walk (first-person mode: drag to look, on-screen arrows
or WASD to move; enter the lobby and show apartment through the courtyard
doors).

Construction model: reinforced-concrete flat-slab frame. Facades are built
from real 1.85 m-deep loggia voids (side wing walls, wood soffits, decks,
balustrades on the open side only), cantilevered glazed bays, punched
windows with jamb reveals, and full-footprint floor slabs with white edge
aprons - the same system as the real-world buildings this is based on.
The north wing ground floor is fully modeled inside: glass entrance lobby
(reception, mailboxes, elevators, mirror wall) and a furnished one-bedroom
show apartment (herringbone oak, kitchen island with pendants, dining set,
living room, bedroom, bathroom) with warm interior lighting.

Realism features: procedural normal maps on every material, image-based
lighting rendered from the live sky (reflections follow the lighting mode),
HDR bloom + MSAA post pipeline, recessed glazing with jamb reveals + sills +
blinds, true 3D railing bars and glass balustrades, sculpted extruded car
bodies with spinning wheels, articulated people, noise-displaced organic
tree canopies with wind sway, 3D noise-displaced mountain terrain with
altitude-based coloring, ballistic fountain particles, animated water
ripples, street lamps with light pools and a string-light pergola at dusk.

## Rebuilding from source

```
npm install three@0.160.1 esbuild
node source/build.mjs
```

- `source/scene.js` — the entire procedural scene (buildings, courtyard,
  boulevard, landscaping, vehicles, people, lighting presets)
- `source/template.html` — page shell (UI, styles)
- `source/build.mjs` — bundles everything into the single HTML file
