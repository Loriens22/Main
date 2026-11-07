// Layout of the two line-84 battery buses for the shared bus framework (models/trolley/TrolleyModel.js and its
// mixins), read from the reference photographs supplied with Expansion 6.0 (data/research/ref_photos/line84,
// ref01-ref10; which photo shows what: data/research/line84/README.md). z in the rigid frame (origin = rear axle,
// z backwards), heights in metres above the road; proportions measured on the photographs, so estimates.
//
// SOR EBN 11 (ref01-ref04): apple-green lower body to 0.99 m, a white strip at the belt, the black glazed band with
// flush panes in black frames, a thin green line over the windows, the white band and a green line along the roof
// edge; white roof pods; the front with the green bumper and its twin round lamps in silver pods, a silver line,
// the black mask with the silver crescent and the badge, the big windscreen with the black sign band behind it, and
// green corner pillars up to the roof; the green rear with the large black glazed panel in a silver frame.
// Yutong E12 (ref07-ref09): white body, the black glazed band reaching the roof edge, blue and turquoise leaves
// along the lower body, long white battery pods on the roof; the near-vertical windscreen with the separate display
// glass over it, the white front with the round badge and the three-lamp clusters; the white rear with the large
// black window, two louvre slots and the vertical lamp columns.

const common = {
  gen: 0,
  old: false,
  tumble: 0.02,
  archBand: 0,
  archCut: null,
  paneR: 0.035,
  glazing: 'flush',
  roofKit: [],
  hookFrame: null,
  poleColor: null,
  poleTip: null,
  heads: null,
  interiorSignY: null,
};

export const SOR_DESIGN = {
  ...common,
  ends: 'sor',
  livery: 'sor',
  fittings: 'ebusFittings',
  bodyR: 0.3, // plan radius of the body corners (rounded front, ref03)
  roofEdgeR: 0.22,
  bandTop: 0.99, // top of the green lower body = bottom of the white strip at the belt (ref02)
  archR: 0.53,
  panes: {
    front: {
      right: [[-7.45, -5.74], [-4.3, -2.84], [-1.42, 0.12], [0.22, 1.82]],
      left: [[-8.66, -7.42, 'cab'], [-7.32, -5.72], [-5.62, -4.02], [-3.92, -2.32], [-2.22, -0.62], [-0.52, 1.08], [1.18, 1.82]],
    },
  },
  hopper: 0.24, // top hoppers of the side windows (ref02)
  hopperEvery: 2, // on every second pane
  doorTop: 2.36,
  // the thin green lines: over the windows, along the roof edge (ref02, ref04)
  stripes: [{ y0: 2.528, y1: 2.566, mat: 'blue' }],
  roofLine: { y0: 2.69, y1: 2.735, mat: 'blue' },
  wall: 0xd3d6d9,
  ceiling: 0xe7e9ea,
  trim: 0x8e9398,
  decalBlue: '#1d58b0',
  front: { bumper: 0.72, silver: 0.79, wsBottom: 1.32, wsTop: 2.47, signTop: 2.72, rake: 0.12, bulge: 0.07, pillar: 0.11 },
  rear: { bumper: 0.55, panelBottom: 0.98, panelTop: 2.6, frame: 0.05, bulge: 0.03 },
  frontSign: { w: 1.66, h: 0.22, y: 2.6, dz: 0.16 },
  sideSign: { w: 0.9, h: 0.17, y: 2.28, z: -4.0, inset: 0.05 },
  rearSign: { w: 0.34, h: 0.15, x: 0.62, y: 2.44, dz: 0.012 },
  interiorSignZ: 1.75,
  hookRoofY: 2.78,
  // three white roof pods (ref02, ref04): over the window behind door 2, the middle (air conditioning) and the rear
  fairings: [
    { sec: 'front', z0: -6.15, z1: -4.25, h: 0.3, w: 1.62, r: 0.15, rampF: 0.28, rampR: 0.25, mat: 'roof' },
    { sec: 'front', z0: -2.75, z1: -0.65, h: 0.28, w: 1.62, r: 0.15, rampF: 0.26, rampR: 0.26, mat: 'roof', louvres: true },
    { sec: 'front', z0: 0.0, z1: 1.6, h: 0.32, w: 1.72, r: 0.15, rampF: 0.3, rampR: 0.38, mat: 'roof' },
  ],
  mirrors: 'mirrorsSolaris',
  mirrorY: -0.22,
  seatPiece: 'seat_sor',
  // saloon (ref05, ref06): light grey walls, white ceiling, stainless rails, light blue-grey floor
  coves: false,
  cabWhite: false,
  wheelchairBoard: true,
  railColor: 0xc9cdd1,
};

export const E12_DESIGN = {
  ...common,
  ends: 'e12',
  livery: 'e12',
  fittings: 'ebusFittings',
  bodyR: 0.22,
  roofEdgeR: 0.14,
  bandTop: 1.22, // the white lower body reaches the glazing
  archR: 0.56,
  panes: {
    front: {
      right: [[-7.18, -5.86], [-5.76, -4.44], [-4.34, -3.17], [-1.73, -0.55], [-0.45, 0.54], [1.98, 3.13]],
      left: [[-8.5, -7.25, 'cab'], [-7.15, -5.85], [-5.75, -4.45], [-4.35, -3.05], [-2.95, -1.65], [-1.55, -0.25], [-0.15, 1.15], [1.25, 2.55], [2.65, 3.13]],
    },
  },
  paneTop: 2.58, // the see-through glass; black frit above it up to the roof edge (ref07)
  hopper: 0.26,
  hopperEvery: 2,
  doorTop: 2.42,
  stripes: [],
  roofLine: null,
  wall: 0xdadcde,
  ceiling: 0xeeeff0,
  trim: 0x9ea4a9,
  decalBlue: '#1d4f9e',
  front: { lip: 0.4, fascia: 1.06, wsBottom: 1.12, wsTop: 2.6, signTop: 2.93, rake: 0.05, bulge: 0.05 },
  rear: { bumper: 0.55, winBottom: 1.74, winTop: 2.86, bulge: 0.03 },
  frontSign: { w: 1.9, h: 0.24, y: 2.77, dz: 0.09 },
  sideSign: { w: 1.0, h: 0.19, y: 2.33, z: -6.5, inset: 0.05 },
  rearSign: { w: 0.42, h: 0.18, x: -0.55, y: 2.66, dz: -0.04 },
  interiorSignZ: 1.85,
  hookRoofY: 3.0,
  // long white battery pods (ref07, ref08): over the front half with the air-conditioning unit, over the rear axle
  fairings: [
    { sec: 'front', z0: -7.7, z1: -2.1, h: 0.3, w: 2.04, r: 0.17, rampF: 0.4, rampR: 0.32, mat: 'roof' },
    { sec: 'front', z0: -7.45, z1: -6.05, h: 0.06, w: 1.55, r: 0.04, y: 0.29, mat: 'roof', louvres: true },
    { sec: 'front', z0: -0.75, z1: 2.35, h: 0.28, w: 2.04, r: 0.17, rampF: 0.32, rampR: 0.4, mat: 'roof' },
  ],
  mirrors: 'mirrorsSolaris',
  mirrorY: -0.06,
  // grey shells with the orange grab handle on the aisle side (kit pieces with the handle on +x and on -x)
  seatPiece: (s) => (s.x < 0 ? 'seat_e12' : 'seat_e12m'),
  coves: true,
  cabWhite: true,
  wheelchairBoard: true,
  railColor: 0xb9bdc1,
};
