// Engine sound profiles of the vehicle types (spec.audio.profile). BusVoice synthesises every bus
// with the same graph; a profile retunes it: the brightness of the firing harmonics at idle and
// under load, the fixed resonances (exhaust/engine-bay formants), the cycle irregularity of a
// spark-ignition engine (CNG) against the steadier but knocking diesel, the injector/combustion
// tick, the turbo whistle range, the gearbox whine order and the overall level.
// Values are by ear against public recordings of each engine family (not measured); see
// docs/PROGRESS.md (sound) for the reasoning.
export const ENGINE_PROFILES = {
  // MAN E2876 LUH, 12.8 l CNG, spark ignition, ZF EcoLife 6-speed: the tuned original
  man_cng: {
    slopes: [7.0, 4.2], fm: [[105, 1.0, 5], [190, 2.0, 6], [410, 2.5, 5], [760, 1.8, 3]],
    wobble: [9, 5], lope: 1, tone: 0, tickF: 3000, tickQ: 1.4, tickIdle: 0, tick: 0,
    roarF: [700, 1700], roar: 0, turboF: [2600, 6000], turbo: 0, gbxOrder: 19, gbx: 0, intakeF: [280, 500], intake: 0,
  },
  // Mercedes-Benz OM 457 hLA, 12 l diesel, ZF Ecomat 5-speed: diesel clatter at idle, a stronger,
  // lower growl under load, a clearly audible turbo whistle and a busier old gearbox
  mb_diesel: {
    slopes: [5.6, 3.4], fm: [[92, 1.1, 6], [168, 1.8, 7], [360, 2.2, 5], [690, 1.6, 4]],
    wobble: [3, 2], lope: 0.45, tone: 1.5, tickF: 1900, tickQ: 1.1, tickIdle: 9, tick: 4,
    roarF: [550, 1450], roar: 2, turboF: [3200, 7200], turbo: 5, gbxOrder: 17, gbx: 4, intakeF: [240, 430], intake: 1,
  },
  // Cummins ISL G, 8.9 l CNG (stoichiometric, spark ignition), ZF 6-speed: smaller and smoother,
  // higher resonances, soft ignition tick, modest turbo
  cummins_cng: {
    slopes: [7.6, 4.8], fm: [[120, 1.0, 5], [220, 2.0, 5], [460, 2.4, 5], [840, 1.8, 3]],
    wobble: [7, 4], lope: 0.8, tone: -1, tickF: 3400, tickQ: 1.6, tickIdle: -2, tick: -3,
    roarF: [800, 1900], roar: -1, turboF: [3000, 6800], turbo: -2, gbxOrder: 21, gbx: -1, intakeF: [300, 540], intake: 0,
  },
  // Yutong ZK6126HGA, ~9-10 l CNG (spark ignition), automatic: close to the Cummins, a slightly
  // hollower exhaust resonance and a more audible gearbox/electric drive whine
  yutong_cng: {
    slopes: [7.3, 4.6], fm: [[112, 1.0, 5], [205, 2.2, 6], [440, 2.6, 4], [900, 1.8, 3]],
    wobble: [8, 4], lope: 0.9, tone: -0.5, tickF: 3200, tickQ: 1.5, tickIdle: -1, tick: -2,
    roarF: [760, 1800], roar: -0.5, turboF: [2800, 6400], turbo: -1, gbxOrder: 23, gbx: 2, intakeF: [290, 520], intake: 0,
  },
};

export function engineProfile(name) {
  return ENGINE_PROFILES[name] || ENGINE_PROFILES.man_cng;
}
