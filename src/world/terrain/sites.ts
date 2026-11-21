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
