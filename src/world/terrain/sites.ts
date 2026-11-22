/**
 * Where the Lazarus camps stand, in each landing site's local frame (metres from the pad, y up; yaw about +y, 0 = the
 * model's own forward toward -z). `flat` is the radius of ground levelled for the camp, `blend` the width of the
 * slope back to the natural ground. Shared by the terrain worker (levelling) and the surface zone (placement).
 */
export interface CampSite { x: number; z: number; yaw: number; flat: number; blend: number }

export const LAZARUS_SITE: Record<string, CampSite> = {
  // Miller's lander came down a few hundred metres from where Ranger 1 lands; the waves broke it up there
  miller: { x: 62, z: -48, yaw: 0.6, flat: 0, blend: 0 },
  // Mann's shelter on the glacier: the door faces the pad
  mann: { x: 30, z: 190, yaw: 0, flat: 34, blend: 46 },
  // Edmunds' camp on the desert floor, among its boulder piles
  edmunds: { x: -120, z: 120, yaw: 0, flat: 44, blend: 60 },
};

/** the ridge on Mann's glacier he says he will show the crew (the survey site of his reports) */
export const MANN_RIDGE = { x: 90, z: 540 };

/**
 * Miller's rift (original worldbuilding for the game, not from the film): beyond the knee-deep flats round the landing
 * site the floor shelves to a few metres, then drops into a canyon of stepped walls that deepens eastward into a basin
 * some 230 m deep. The flats stay as the film shows them; the life of the deeper water lives here.
 * Centre line of the canyon (zone x, z) with its floor depth below the sea surface (m) and half-width (m).
 */
export const MILLER_RIFT: { x: number; z: number; depth: number; w: number }[] = [
  { x: 120, z: -300, depth: 8, w: 26 },
  { x: 260, z: -360, depth: 45, w: 34 },
  { x: 480, z: -430, depth: 95, w: 42 },
  { x: 760, z: -450, depth: 140, w: 50 },
  { x: 1020, z: -380, depth: 190, w: 60 },
];
export const MILLER_BASIN = { x: 1300, z: -300, r: 330, depth: 230 };
/** the rocky outcrops of the flats (wet black basalt breaking the surface): grazers, the shield-backs' nests */
export const MILLER_ROCKS = [{ x: 95, z: 70, r: 26 }, { x: -140, z: 120, r: 18 }, { x: 160, z: -150, r: 20 }];
/** the sandy hollow where the sediment maws lie */
export const MILLER_SANDS = { x: -60, z: -190, r: 60 };

/** nearest point on the canyon centre line: distance (m), along-line parameter 0..1, interpolated depth and half-width */
export function riftQuery(x: number, z: number) {
  let best = 1e9, bt = 0, bd = 0, bw = 0, acc = 0, total = 0;
  for (let i = 0; i < MILLER_RIFT.length - 1; i++) total += Math.hypot(MILLER_RIFT[i + 1].x - MILLER_RIFT[i].x, MILLER_RIFT[i + 1].z - MILLER_RIFT[i].z);
  for (let i = 0; i < MILLER_RIFT.length - 1; i++) {
    const a = MILLER_RIFT[i], b = MILLER_RIFT[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (L * L)));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bt = (acc + t * L) / total; bd = a.depth + (b.depth - a.depth) * t; bw = a.w + (b.w - a.w) * t; }
    acc += L;
  }
  return { d: best, t: bt, depth: bd, w: bw };
}

/**
 * Mars: the opening of the cave system (game alternate-history extension), a collapse trench into voids under the
 * crater plain. The model's origin is the centre of the opening on levelled ground; `r` the opening's radius (the
 * terrain is cut away inside it), `flat` / `blend` the levelling round it, `keep` the radius over the chambers inside
 * which the ground is kept from dipping toward them. Yaw: the trench's surface end faces the landing pad.
 */
export const MARS_CAVE = { x: -160, z: -150, r: 30, flat: 34, blend: 40, keep: 270, yaw: Math.atan2(-160 / Math.hypot(160, 150), -150 / Math.hypot(160, 150)) };
