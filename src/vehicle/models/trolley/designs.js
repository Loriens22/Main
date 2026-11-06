// Per-vehicle layout of the three line-9 trolleybus bodies, read from the reference photographs supplied with
// Expansion 5.0 (data/research/ref_photos/line9, ref01-ref18; which photo shows what: NOTES in
// data/research/line9/README.md). z values in the section frames (front: middle axle, rear: rear axle; z
// backwards), heights in metres above the road; proportions measured on the photos, so estimates.
//
// Sofia livery of both Solaris generations (ref02, ref09, ref13, ref08, ref17): sky-blue roof, roof fairings and
// the band over the windows; black glazing from the belt to the roof edge; an orange-yellow (Solaris IV) or
// lemon-yellow (Solaris III) panel band under the windows; the blue skirt below it, which also rises round every
// wheel arch as a broad blue surround. Ikarus 280.92F (ref05, ref07, ref11, ref12, ref18): deep yellow body with
// separate rubber-set windows between yellow pillars, a muted blue lower band (to the top of the wheel arches)
// edged with a black rub strip, a yellow front and rear.

const SOLARIS_PANES = {
  front: {
    right: [[-6.93, -5.62], [-5.52, -4.02], [-3.92, -2.47], [-0.98, 1.1]],
    left: [[-8.3, -7.18, 'cab'], [-7.08, -5.6], [-5.5, -3.98], [-3.88, -2.36], [-2.26, -0.74], [-0.64, 1.1]],
  },
  rear: {
    right: [[-2.13, -0.72], [-0.62, 0.7], [2.19, 3.0, 'tail']],
    left: [[-3.6, -2.2], [-2.1, -0.7], [-0.6, 0.8], [0.9, 2.08], [2.18, 3.0, 'tail']],
  },
};

const solaris = (gen) => ({
  gen,
  old: false,
  // Urbino IV: sharper, more angular corners than the rounded Urbino III (ref02, ref09, ref13)
  bodyR: gen === 4 ? 0.12 : 0.22, // plan radius of the body corners
  roofEdgeR: gen === 4 ? 0.16 : 0.3,
  tumble: 0.025,
  bandTop: gen === 4 ? 0.6 : 0.62, // top of the blue skirt, bottom of the coloured panel band
  archBand: 0.13, // width of the blue surround round each wheel arch
  // Solaris IV: raised blue fenders reaching just over the window line (offsets from the axle: the rear leg, the
  // front leg at the band bottom and at the belt; estimated from ref02)
  archCut: gen === 4 ? { rear: 0.68, front0: 0.66, front1: 0.4, rise: 0.05 } : null,
  panes: SOLARIS_PANES,
  paneR: 0.03,
  glazing: 'flush', // black glazed band, panes set flush in it
  hopper: gen === 3 ? 0.3 : 0.26, // tilting top lights (dark bars across the panes)
  doorTop: gen === 4 ? 2.42 : 2.52,
  archR: gen === 4 ? 0.56 : 0.62, // the Solaris IV fenders hug the tyres (ref02)
  // interior: Solaris IV dark grey saloon with red stanchions (ref01, ref06, ref16); Solaris III light grey with
  // orange-red stanchions (ref03, ref10)
  // daylight photographs of the Solaris IV saloon (ref01, ref16): light grey ceiling and wall panels, dark grey
  // window frames and podium sides
  wall: gen === 4 ? 0xb8bdc1 : 0xa5aaae,
  ceiling: gen === 4 ? 0xcfd3d5 : 0xd2d5d6,
  trim: gen === 4 ? 0x52575c : 0x70757a,
  decalBlue: '#1d58b0',
  // front: blue bumper -> coloured panel -> black frame and windscreen -> black sign band -> blue roof cap
  front: gen === 4
    ? { bumper: 0.55, panelTop: 0.98, wsBottom: 1.03, wsTop: 2.55, signTop: 3.02, rake: 0.1, bulge: 0.06, lampY: 0.5, lampDy: -0.3 }
    : { bumper: 0.64, silver: 0.8, panelTop: 1.04, wsBottom: 1.1, wsTop: 2.5, signTop: 2.92, rake: 0.09, bulge: 0.06, lampY: 0.72, lampDy: -0.14 },
  // rear: blue bumper -> (lamp strip) -> coloured panel -> black glazed upper part
  rear: gen === 4
    ? { bumper: 0.64, strip: 0.8, panelTop: 1.72, winTop: 3.05 }
    : { bumper: 0.8, strip: 0.93, panelTop: 1.48, winTop: 2.95 },
  frontSign: { w: gen === 4 ? 1.7 : 1.85, h: 0.27, y: gen === 4 ? 2.8 : 2.72, dz: 0.15 },
  sideSign: { w: 1.05, h: 0.2, y: 2.4, z: -6.3 },
  rearSign: { w: 0.4, h: 0.2, x: 0.0, y: gen === 4 ? 2.86 : 2.78, dz: 0.012 },
  interiorSignZ: 1.85,
  hookRoofY: 3.05,
  // roof equipment (ref02, ref09, ref13 / ref08, ref17)
  // Urbino IV roof shroud: the sides rise from the window top (2.5 m) in tall, slightly leaning faces to a crease at
  // about 3.2 m (ref13: the top of the front cap, the sign glass reaching it), then a nearly flat roof. The front
  // section is shrouded from the front cap to the bellows, with slanted dark glass panels set into the shroud over
  // the front part (ref02 close-up); over the rear section the shroud sides are blue round the pole bases and black
  // glass behind them, rising towards the rear, where the shroud rounds down into the black glazed rear end (ref09)
  shroud: gen === 4 ? {
    top: 3.2,
    parts: [
      { sec: 'front', z0: -8.6, z1: 1.2, rampF: 0.01, rampR: 0.3, capF: false },
      { sec: 'rear', z0: -3.7, z1: 3.4, rampF: 0.12, rampR: 0.85, capR: false, blackFrom: -2.45, blackRise: [0.4, 0.82] },
    ],
    // [side, bottom edge z0 -> z1, lean forwards at the top]
    inserts: [
      [1, -6.3, -8.3, 0.28], [1, -4.5, -5.95, 0.28],
      [-1, -6.95, -8.3, 0.28], [-1, -4.5, -5.95, 0.28],
    ],
    insertY: [0.02, 0.5], // above the window top, relative
  } : null,
  fairings: gen === 4
    ? [
      // the silver louvred air-conditioning unit on the front of the shroud (ref13)
      { sec: 'front', z0: -7.75, z1: -6.1, h: 0.2, w: 1.6, r: 0.05, y: 0.18, mat: 'acSilver', louvres: true },
      // the raised box over the pole bases behind the bellows, as wide as the shroud top (ref09, ref13)
      { sec: 'rear', z0: -3.66, z1: -2.45, h: 0.2, w: 2.0, r: 0.05, y: 0.19, rampF: 0.08, rampR: 0.04, mat: 'paint' },
    ]
    : [
      // air-conditioning pod over the cab: blue cover with black louvres
      { sec: 'front', z0: -7.95, z1: -6.75, h: 0.3, w: 1.75, r: 0.12, rampF: 0.25, rampR: 0.15, mat: 'roof', louvres: true },
      // silver equipment box behind it
      { sec: 'front', z0: -6.7, z1: -5.95, h: 0.26, w: 1.9, r: 0.03, mat: 'acSilver' },
      // segmented converter fairing: six covers with seams between them
      ...[0, 1, 2, 3, 4, 5].map((k) => ({ sec: 'front', z0: -5.9 + k * 0.86, z1: -5.9 + k * 0.86 + 0.82, h: 0.32, w: 2.2, r: 0.14, rampF: k === 0 ? 0.3 : 0.06, rampR: k === 5 ? 0.3 : 0.06, mat: 'roof' })),
      // pole base fairing, then the saloon air-conditioning unit
      { sec: 'rear', z0: -3.65, z1: -2.3, h: 0.32, w: 1.9, r: 0.14, rampF: 0.2, rampR: 0.2, mat: 'roof' },
      { sec: 'rear', z0: -2.2, z1: -0.55, h: 0.27, w: 1.85, r: 0.12, rampF: 0.2, rampR: 0.25, mat: 'roof', louvres: true },
    ],
  roofKit: [],
  hookFrame: { z0: 2.35, z1: 3.15, h: 0.42 }, // tubular pole catcher frame over the rear end (ref08, ref09)
  poleColor: gen === 4 ? 0xb9bec2 : 0x9aa1a7,
  poleTip: gen === 3 ? 0xf2c21a : null, // Solaris III: yellow insulated end of the poles (ref08)
  mirrors: 'mirrorsSolaris',
  heads: gen === 4 ? 'headS4' : 'headS3',
  seatPiece: gen === 4 ? 'seat_solaris4' : 'seat_solaris3',
});

export const DESIGNS = {
  solaris4: solaris(4),
  solaris3: solaris(3),
  ikarus: {
    gen: 0,
    old: true,
    bodyR: 0.12,
    roofEdgeR: 0.2,
    tumble: 0.01,
    bandTop: 1.0, // the blue lower band reaches the top of the wheel arches (ref11, ref18)
    archBand: 0,
    archCut: null,
    panes: {
      front: {
        right: [[-6.3, -5.25], [-5.12, -4.07], [-3.95, -3.42], [-1.98, -0.98], [-0.86, 0.14], [0.26, 1.0]],
        left: [[-7.72, -6.9, 'cab'], [-6.72, -5.67], [-5.55, -4.5], [-4.38, -3.33], [-3.21, -2.16], [-2.04, -0.99], [-0.87, 0.18], [0.3, 1.0]],
      },
      rear: {
        right: [[-2.02, -1.02], [-0.9, 0.1], [0.22, 1.08]],
        left: [[-3.42, -2.42], [-2.3, -1.3], [-1.18, -0.18], [-0.06, 0.94], [1.06, 2.06], [2.18, 2.7, 'tail']],
      },
    },
    paneR: 0.1,
    glazing: 'rubber', // separate windows in black rubber, yellow pillars between them
    hopper: 0.36, // sliding top vents
    doorTop: 2.6,
    archR: 0.62,
    wall: 0xc6ccd0,
    ceiling: 0xd5dadc,
    trim: 0x8b9195,
    decalBlue: '#1b3f86',
    front: { panelTop: 1.18, blackTop: 1.33, wsBottom: 1.33, wsTop: 2.62, signTop: 2.62, rake: 0.05, bulge: 0.025, lampY: 0.78, lampDy: 0 },
    rear: { winBottom: 1.6, winTop: 2.56 },
    frontSign: { w: 1.6, h: 0.24, y: 2.47, dz: 0.12 },
    sideSign: { w: 0.95, h: 0.19, y: 2.38, z: -5.7 },
    rearSign: { w: 0.4, h: 0.2, x: 0.0, y: 2.4, dz: 0.02 },
    interiorSignZ: 1.8,
    hookRoofY: 3.0,
    fairings: [
      // the light grey louvred equipment box on the front section in front of the bellows (ref18)
      { sec: 'front', z0: -1.55, z1: 0.35, h: 0.36, w: 1.25, r: 0.03, mat: 'acSilver', louvres: true },
      // roof hatches
      { sec: 'front', z0: -6.4, z1: -5.7, h: 0.09, w: 0.8, r: 0.03, mat: 'paint' },
      { sec: 'rear', z0: 0.5, z1: 1.2, h: 0.09, w: 0.8, r: 0.03, mat: 'paint' },
      // the low platform the pole bases stand on
      { sec: 'rear', z0: -3.5, z1: -2.45, h: 0.1, w: 1.3, r: 0.02, mat: 'satin' },
    ],
    roofKit: [],
    hookFrame: null,
    poleColor: 0xd98a2b, // orange-painted poles (ref11, ref18)
    poleTip: null,
    markers: true, // amber marker lamps along the front roof edge (ref18)
    mirrors: 'mirrorsIkarus',
    heads: 'headIkarus',
    seatPiece: 'seat_ikarus',
  },
};
