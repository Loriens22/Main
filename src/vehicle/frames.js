// Section-frame landmarks of a vehicle spec (see Vehicles.js): front bumper, body ends,
// hitch points and rear bumper, all in the section frames (z backwards).
export function frames(spec) {
  const d = spec.dims;
  const frontZ = -(d.frontOverhang + d.wb1);
  if (!spec.articulated) return { frontZ, frontEnd: d.rearOverhang, rearStart: d.rearOverhang, rearZ: d.rearOverhang, hitchFront: 0, hitchRear: 0 };
  const hitchFront = d.hitchBehindAxle2, hitchRear = -(d.wb2 - d.hitchBehindAxle2);
  return { frontZ, frontEnd: hitchFront - d.bellowsGap, rearStart: hitchRear + d.bellowsGap, rearZ: d.rearOverhang, hitchFront, hitchRear };
}
