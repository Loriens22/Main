// Measured / chosen dimensions of the Yutong ZK6126HGA model (see NOTES.md for the sources).
// Frame: x right, y up, z backwards (front is -z), origin = rear axle centre on the ground.
// Everything in metres.
export const K = {
  hw: 1.25, // half width (2.50 m body)
  frontZ: -8.53, // front bumper
  rearZ: 3.47, // rear bumper
  axleF: -5.95, // steered axle
  axleR: 0, // driven axle (twin tyres)
  wheelR: 0.465, // 255/70 R22.5 (photo: tyre diameter about 0.92 m)
  archR: 0.545, // wheel-arch opening radius
  skirtY: 0.29, // lower edge of the side panels
  floorY: 0.34, // low floor at the doors
  beltY: 1.26, // top of the orange lower panels = bottom of the glazing
  glassTopY: 2.46, // top of the see-through glass; above it the opaque black header band
  winTopY: 2.72, // top of the black glazed band
  roofY: 2.8, // roof edge / crown
  podY: 3.03, // top of the long roof pod (CNG cylinders)
  rearPodY: 3.1, // top of the rear roof pod
  rf: 0.4, // plan corner radius at the front
  rr: 0.42, // plan corner radius at the rear
  rake: 0.27, // the windscreen top leans back by this much
  bumperTop: 1.1, // top of the orange front bumper module
  doorTopY: 2.4, // top of the door openings
  // clear door openings (z0 = leading edge); measured on ref13 (right side, 48.4 px/m)
  doors: [
    { id: 1, section: 'front', z0: -8.22, z1: -6.98 },
    { id: 2, section: 'front', z0: -3.06, z1: -1.82 },
    { id: 3, section: 'front', z0: 1.05, z1: 2.31 },
  ],
  // window panes of the glazed band [z0, z1] per side (pillars in between); the interior draws its pillars at the same z
  panesR: [[-6.8, -5.2], [-5.08, -3.2], [-1.7, -0.56], [-0.4, 0.94], [2.45, 3.2]],
  panesL: [[-8.05, -7.2], [-7.1, -5.7], [-5.58, -4.2], [-4.08, -2.7], [-2.58, -1.2], [-1.08, 0.3], [0.42, 1.8], [1.92, 3.2]],
  // interior
  wallX: 1.18, // inner face of the side walls
  ceilY: 2.58, // flat centre of the ceiling
  podiumY: 0.6, // top of the wheel-arch podiums
  cabY: 0.6, // driver's platform
  partitionZ: -7.28, // driver's cab partition (rear face)
  rearStepZ: 2.42, // riser of the raised rear bench platform
  rearBenchY: 0.7, // floor under the rear bench
};

export const FY = K.floorY;
