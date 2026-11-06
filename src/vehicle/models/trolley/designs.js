// Per-vehicle layout of the three line-9 trolleybus bodies: glazing (pane z ranges per section and side), belt
// lines, signs, roof equipment, interior colours. z values in the section frames (front: middle axle, rear:
// rear axle; z backwards), fitted to the doors and axles of specs.js and the reference photographs; estimates.

const SOLARIS_PANES = {
  front: {
    right: [[-6.93, -5.62], [-5.52, -4.02], [-3.92, -2.47], [-0.98, 1.1]],
    left: [[-8.43, -7.18, 'cab'], [-7.08, -5.6], [-5.5, -3.98], [-3.88, -2.36], [-2.26, -0.74], [-0.64, 1.1]],
  },
  rear: {
    right: [[-2.13, -0.72], [-0.62, 0.7], [2.19, 3.12, 'tail']],
    left: [[-3.6, -2.2], [-2.1, -0.7], [-0.6, 0.8], [0.9, 2.08], [2.18, 3.12, 'tail']],
  },
};

const solaris = (gen) => ({
  gen,
  old: false,
  bodyR: 0.26, // plan radius of the body corners
  roofEdgeR: 0.22,
  tumble: 0.03,
  bandTop: 0.56, // blue lower band (skirt -> bandTop)
  panes: SOLARIS_PANES,
  paneR: 0.06,
  hopper: gen === 3 ? 0.32 : 0.0, // Urbino III: tilting top lights; Urbino IV: fixed flush panes
  doorTop: 2.42,
  archR: 0.64,
  wall: 0xd9dcdc,
  ceiling: 0xe3e5e4,
  trim: gen === 4 ? 0x2f3338 : 0x8a8f93,
  decalBlue: '#1d58b0',
  frontSign: { w: 1.85, h: 0.27, y: gen === 4 ? 2.78 : 2.84, dz: gen === 4 ? 0.1 : 0.03 },
  sideSign: { w: 1.05, h: 0.2, y: 2.47, z: -6.3 },
  rearSign: { w: 0.5, h: 0.2, x: 0.0, y: 2.58, dz: 0.012 },
  interiorSignZ: 1.85,
  hookRoofY: 3.05,
  // roof: converter / auxiliary fairing over the front section, a lower fairing round the pole base
  fairings: [
    { sec: 'front', z0: -7.8, z1: -6.55, h: 0.26, w: 1.75, r: 0.12, mat: 'roof' }, // air conditioning (cab)
    { sec: 'front', z0: -5.9, z1: -0.5, h: gen === 4 ? 0.36 : 0.32, w: 2.2, r: 0.14, mat: 'roof' }, // traction + auxiliary converters
    { sec: 'rear', z0: -3.62, z1: -2.3, h: 0.14, w: 1.6, r: 0.08, mat: 'roof' }, // pole base plinth
    { sec: 'rear', z0: -1.4, z1: 0.6, h: 0.22, w: 1.7, r: 0.1, mat: 'roof' }, // passenger AC
  ],
  roofKit: [
    ...[-5.3, -4.0, -2.7, -1.4].flatMap((z) => [
      { piece: 'roofLouvre', sec: 'front', x: 1.101, y: 3.05 + 0.17, z, yaw: Math.PI / 2, scale: 0.9 },
      { piece: 'roofLouvre', sec: 'front', x: -1.101, y: 3.05 + 0.17, z, yaw: -Math.PI / 2, scale: 0.9 },
    ]),
    { piece: 'roofFan', sec: 'front', x: 0.45, y: 3.05 + (gen === 4 ? 0.36 : 0.32), z: -4.6 },
    { piece: 'roofFan', sec: 'front', x: -0.45, y: 3.05 + (gen === 4 ? 0.36 : 0.32), z: -2.2 },
  ],
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
    bodyR: 0.1,
    roofEdgeR: 0.14,
    tumble: 0.01,
    bandTop: 0.62,
    panes: {
      front: {
        right: [[-6.36, -5.37], [-5.27, -4.33], [-4.23, -3.4], [-2.0, -1.0], [-0.9, 0.1], [0.2, 1.0]],
        left: [[-7.8, -6.82, 'cab'], [-6.72, -5.72], [-5.62, -4.62], [-4.52, -3.52], [-3.42, -2.42], [-2.32, -1.32], [-1.22, -0.22], [-0.12, 0.98]],
      },
      rear: {
        right: [[-2.05, -1.05], [-0.95, 0.05], [0.15, 1.1]],
        left: [[-3.42, -2.45], [-2.35, -1.35], [-1.25, -0.25], [-0.15, 0.85], [0.95, 1.95], [2.05, 2.72, 'tail']],
      },
    },
    paneR: 0.05,
    hopper: 0.36, // sliding top vents
    doorTop: 2.5,
    archR: 0.62,
    wall: 0xc9c6bd,
    ceiling: 0xdcd9cf,
    trim: 0x6a6e72,
    decalBlue: '#1b3f86',
    frontSign: { w: 1.6, h: 0.26, y: 2.78, dz: 0.04 },
    sideSign: { w: 0.95, h: 0.19, y: 2.45, z: -7.2 + 1.55 },
    rearSign: { w: 0.5, h: 0.2, x: 0.0, y: 2.52, dz: 0.01 },
    interiorSignZ: 1.8,
    hookRoofY: 3.0,
    fairings: [
      { sec: 'rear', z0: -3.45, z1: -2.45, h: 0.1, w: 1.4, r: 0.04, mat: 'paint' },
      { sec: 'front', z0: -7.3, z1: -6.6, h: 0.12, w: 0.9, r: 0.04, mat: 'paint' }, // roof hatch
      { sec: 'rear', z0: 0.6, z1: 1.2, h: 0.1, w: 0.8, r: 0.04, mat: 'paint' }, // roof hatch
    ],
    roofKit: [
      { piece: 'resistorGrid', sec: 'front', x: 0.42, y: 3.0, z: -3.6 },
      { piece: 'resistorGrid', sec: 'front', x: -0.42, y: 3.0, z: -3.6 },
      { piece: 'resistorGrid', sec: 'front', x: 0.42, y: 3.0, z: -1.9 },
    ],
    mirrors: 'mirrorsIkarus',
    heads: 'headIkarus',
    seatPiece: 'seat_ikarus',
  },
};
