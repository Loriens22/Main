# Sofia Metro M3 — Siemens Inspiro · Interactive 3D Model

A single-file, photorealistic-style interactive 3D visualization of the Sofia
Metro M3 line trainset (Siemens Inspiro, built by the Siemens–Newag
consortium), modelled after reference photos of the real rolling stock.

## ▶ Open it

**`sofia-metro-m3.html`** — the deliverable. One file, fully self-contained
(three.js is bundled inside), works offline in any modern browser, including
mobile. Just download and open it.

## Features

- Full 3-car trainset, 4 double sliding doors per car, ~60 m long, real-world metre scale
- Lofted aerodynamic cab nose with raked panoramic windshield, black glass mask,
  dot-matrix LED destination board «М3 Хаджи Димитър» (rear: «М3 Горна баня»),
  red marker lights, dual headlights, parked wipers, «B 021» service card, NEWAG · 201 plate
- Signature interior: teal loop-shaped centre poles, teal horizontal rails with
  hanging straps, longitudinal white benches, perforated acoustic ceiling with
  continuous LED strips, LCD info screens, fire extinguisher, emergency intercoms,
  Bulgarian pictograms & ads, anti-slip floor with wear marks
- Continuous teal waistband stripe, black-gasket tinted windows (see-through to
  the interior), yellow/black door hazard strips, exterior car numbers (3042 / 30154)
- Detailed bogies: wheels, axles, brake discs, coil & air springs, traction motors,
  cabling; underfloor equipment boxes and air tanks; roof AC units and antennas
- Metro station environment: platform, tactile strip, tiled walls, columns,
  station signage «ТЕАТРАЛНА», track on block sleepers, tunnel portals
- 9 camera presets (interior aisle, front ¾, side profile, handrails, seats,
  cab & display, doors, bogie, overview), animated door open/close,
  interior lights toggle, auto-orbit
- Mobile-friendly: touch orbit/pinch/pan, merged geometry (~hundreds of draw
  calls total), ACES tone mapping, PBR materials with procedural textures

## Development

Readable source: `src/sofia-metro-m3.dev.html` (loads three.js 0.160 from CDN).

Rebuild the self-contained file:

```bash
npm i esbuild three@0.160.0
node tools/build.mjs
```

three.js is © three.js authors, MIT license (bundled inside the deliverable).
