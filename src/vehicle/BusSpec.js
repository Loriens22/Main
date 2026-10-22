// Dimensions of the MAN Lion's City G CNG (A23 generation) as photographed in Sofia.
// Sources / confidence are documented in data/research/bus_reference.json.
// Local frames: x = right, y = up, z = backwards (forward is -z).
//   front section origin = middle axle (axle 2) centre on the ground
//   rear section origin  = rear axle (axle 3) centre on the ground
export const BUS = {
  length: 17.98,
  width: 2.55,
  halfW: 1.275,
  roofY: 2.88, // top of the body shell (without roof equipment); datasheet body height 2.88
  podY: 3.32, // top of the CNG cylinder housings
  skirtY: 0.33, // lower edge of the side skirts
  floorY: 0.36, // passenger floor at the doors (low floor)
  beltY: 1.3, // window sill line (photo 3 camera fit: 1.29-1.37)
  windowTopY: 2.68, // top of the side glazing; black strip 2.68-2.76 above it
  wheelR: 0.478, // 275/70 R22.5
  tyreW: 0.276,
  track: 2.1, // centre-to-centre of the front tyres
  frontOverhang: 2.7,
  wb1: 5.105, // axle 1 -> axle 2
  wb2: 6.77, // axle 2 -> axle 3
  rearOverhang: 3.405,
  hitchBehindAxle2: 1.7,
  bellowsGap: 0.4, // half length of the bellows (each side of the hitch)
  maxSteer: 0.68, // rad, front wheel lock (turning circle ~22 m)
  maxArticulation: 0.92, // rad (~53°)
  steeringRatio: 21,
  doors: [
    // section, z of leading edge, z of trailing edge (section frame), side +1 = right
    // door 4 is behind the rear axle, over the overhang (photo 3); see data/research/bus/exterior/exterior_spec.md
    { id: 1, section: 'front', z0: -7.185, z1: -5.935 },
    { id: 2, section: 'front', z0: -2.205, z1: -0.955 },
    { id: 3, section: 'rear', z0: -2.05, z1: -0.8 },
    { id: 4, section: 'rear', z0: 0.8, z1: 2.05 },
  ],
};

export const FRONT_Z = -(BUS.frontOverhang + BUS.wb1); // front bumper, front frame (-7.805)
export const AXLE1_Z = -BUS.wb1;
export const HITCH_FRONT_Z = BUS.hitchBehindAxle2; // hitch in front frame (+1.70)
export const HITCH_REAR_Z = -(BUS.wb2 - BUS.hitchBehindAxle2); // hitch in rear frame (-5.07)
export const FRONT_BODY_END_Z = HITCH_FRONT_Z - BUS.bellowsGap; // 1.30
export const REAR_BODY_START_Z = HITCH_REAR_Z + BUS.bellowsGap; // -4.67
export const REAR_Z = BUS.rearOverhang; // rear bumper, rear frame (3.405)

// The seat map and standing areas live in BusLayout.js.
