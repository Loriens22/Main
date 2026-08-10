/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   50_systems.js - Agent F. Pure simulation: player, combat, Elena, enemy AI,
   director, inventory/crafting/economy, save/load, objectives, endings.

   HARD RULES OBSERVED:
     - no ES modules, no external libs, no fetches
     - single IIFE, exposes only IP.Systems
     - NO WebGL, NO DOM (localStorage is accessed through a guarded shim)
     - never calls IP.Level / IP.Actors / IP.UI at load time
     - ASCII only
     - state object S is JSON-serializable (plain arrays, no functions,
       no cycles). Runtime-only scratch lives on S._rt which is never saved.
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  var U = IP.Util, V3 = IP.V3;
  var clamp = U.clamp, lerp = U.lerp, smoothstep = U.smoothstep;
  var TAU = U.TAU;

  /* =======================================================================
     0. SMALL HELPERS (plain-array vectors so JSON round-trips losslessly)
     ======================================================================= */

  function v3(x, y, z) { return [x || 0, y || 0, z || 0]; }
  function vcopy(a) { return [a[0], a[1], a[2]]; }
  function vset(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
  function vadd(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
  function vsub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
  function vscale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; }
  function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function vdist(a, b) {
    var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return Math.sqrt(x * x + y * y + z * z);
  }
  function vdist2(a, b) {
    var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return x * x + y * y + z * z;
  }
  function distXZ(a, b) {
    var x = a[0] - b[0], z = a[2] - b[2];
    return Math.sqrt(x * x + z * z);
  }
  function distXZ2(a, b) {
    var x = a[0] - b[0], z = a[2] - b[2];
    return x * x + z * z;
  }
  function vnorm(o, a) {
    var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    if (l > 1e-9) { o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; }
    else { o[0] = 0; o[1] = 0; o[2] = 0; }
    return o;
  }
  function finite(n, fb) { return (typeof n === 'number' && isFinite(n)) ? n : (fb || 0); }
  function sanitizeVec(a) {
    if (!a) { return; }
    a[0] = finite(a[0], 0); a[1] = finite(a[1], 0); a[2] = finite(a[2], 0);
  }
  function angleWrap(a) {
    while (a > Math.PI) { a -= TAU; }
    while (a < -Math.PI) { a += TAU; }
    return a;
  }
  function angleTo(from, to) {
    return Math.atan2(to[0] - from[0], to[2] - from[2]);
  }
  function approach(cur, tgt, rate, dt) {
    var d = tgt - cur, m = rate * dt;
    if (d > m) { return cur + m; }
    if (d < -m) { return cur - m; }
    return tgt;
  }
  function turnToward(cur, tgt, rate, dt) {
    var d = angleWrap(tgt - cur), m = rate * dt;
    if (d > m) { d = m; } else if (d < -m) { d = -m; }
    return angleWrap(cur + d);
  }
  function emit(name, payload) { if (U && U.emit) { U.emit(name, payload); } }

  /* deterministic, serializable PRNG carried on S */
  function rnd(S) {
    var s = S.rngState >>> 0;
    if (s === 0) { s = 0x9e3779b9; }
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    S.rngState = s >>> 0;
    return (s >>> 0) / 4294967296;
  }
  function rrange(S, a, b) { return a + rnd(S) * (b - a); }
  function rint(S, a, b) { return a + Math.floor(rnd(S) * (b - a + 1)); }
  function rchance(S, p) { return rnd(S) < p; }
  function rpick(S, arr) { return arr[Math.min(arr.length - 1, Math.floor(rnd(S) * arr.length))]; }

  /* scratch vectors - reused every frame, never allocated in hot loops */
  var T0 = [0, 0, 0], T1 = [0, 0, 0], T2 = [0, 0, 0], T3 = [0, 0, 0],
      T4 = [0, 0, 0], T5 = [0, 0, 0], T6 = [0, 0, 0], T7 = [0, 0, 0];
  var SCRATCH_PATH = [];

  /* =======================================================================
     1. TUNABLES
     ======================================================================= */

  var TUNE = {
    /* movement (m/s) - RE4 Remake reference numbers */
    speedWalk: 1.6,
    speedJog: 3.2,
    speedSprint: 5.0,
    speedAim: 1.0,
    speedCrouch: 0.9,
    accelTime: 0.18,          /* seconds to full speed */
    decelTime: 0.12,
    turnRate: 6.2,            /* rad/s body turn - deliberately heavy */
    aimTransition: 0.22,
    stepUp: 0.35,
    maxSlope: 0.72,           /* cos of max walkable slope ~44deg */
    gravity: -18.0,
    playerRadius: 0.34,
    playerHeight: 1.78,
    playerCrouchHeight: 1.12,
    eyeRatio: 0.91,
    substepMax: 0.14,         /* meters per collision substep (no tunnelling) */

    /* health */
    segments: 6,
    segHP: 100,
    regenDelay: 5.0,          /* out-of-combat seconds before segment regen */
    regenRate: 26.0,          /* hp/sec once regenerating */
    combatMemory: 4.0,        /* seconds after a hostile event you are "in combat" */

    /* stamina */
    staminaMax: 100,
    staminaSprint: 13.0,      /* per second */
    staminaMelee: 25.0,
    staminaAimHeavy: 6.0,
    staminaRegen: 22.0,
    staminaRegenDelay: 0.9,

    /* combat */
    coneConvergeTime: 0.55,
    meleeReach: 2.35,
    meleeIFrames: 0.62,
    meleeWindow: 1.65,        /* how long the contextual prompt stays up */
    parryWindow: 0.34,
    grabTelegraph: 0.50,
    grabMashWindow: 3.2,
    poiseRegen: 13.0,
    staggerBase: 1.1,

    /* elena */
    elenaSpeed: 3.35,
    elenaSprint: 4.5,
    elenaFollowClose: 1.8,
    elenaFollowMedium: 3.2,
    elenaFollowFar: 5.0,
    elenaCarryTime: 13.0,     /* generous but terrifying */
    elenaScreamDur: 4.0,
    elenaScreamCD: 42.0,
    elenaThrowCD: 6.0,
    elenaMaxHP: 240,
    elenaDownTime: 18.0,

    /* enemies */
    maxAliveBase: 14,
    corpseLinger: 6.0,
    effectCap: 220,
    projectileCap: 120,
    pickupCap: 160,

    /* economy */
    startScrip: 0
  };

  var DIFF = {
    easy:   { dmgIn: 0.60, dmgOut: 1.25, tokens: 2, mash: 4, spawnMul: 0.75,
              mutChance: 0.10, aggro: 0.75, elenaTargets: 1, dropMul: 1.35, poise: 0.80 },
    normal: { dmgIn: 1.00, dmgOut: 1.00, tokens: 3, mash: 6, spawnMul: 1.00,
              mutChance: 0.18, aggro: 1.00, elenaTargets: 2, dropMul: 1.00, poise: 1.00 },
    hard:   { dmgIn: 1.45, dmgOut: 0.88, tokens: 4, mash: 8, spawnMul: 1.25,
              mutChance: 0.28, aggro: 1.25, elenaTargets: 3, dropMul: 0.78, poise: 1.20 },
    pro:    { dmgIn: 1.90, dmgOut: 0.80, tokens: 4, mash: 10, spawnMul: 1.40,
              mutChance: 0.36, aggro: 1.45, elenaTargets: 3, dropMul: 0.65, poise: 1.35 }
  };
  function diffOf(S) { return DIFF[S.difficulty] || DIFF.normal; }

  /* hit-location damage multipliers and reaction hints */
  var HITLOC = {
    head:      { mult: 3.00, poise: 2.20, react: 'stumble_clutch', crit: 1.0 },
    torso:     { mult: 1.00, poise: 1.00, react: 'stumble_back',   crit: 1.0 },
    limbL:     { mult: 0.72, poise: 1.55, react: 'kneel',          crit: 0.6 },
    limbR:     { mult: 0.72, poise: 1.55, react: 'kneel',          crit: 0.6 },
    shield:    { mult: 0.08, poise: 0.25, react: 'shield_ring',    crit: 0.0 },
    weakpoint: { mult: 4.50, poise: 3.00, react: 'weak_flinch',    crit: 1.5 }
  };

  /* =======================================================================
     2. DATA TABLES: WEAPONS
     ======================================================================= */

  function upTree(label, vals, costs) { return { label: label, tiers: vals, costs: costs }; }

  var WEAPONS = {
    knife: {
      id: 'knife', name: 'Combat Knife', slot: 'melee', ammoType: null,
      damage: 30, rpm: 190, capacity: 0, reloadTime: 0, pierce: 0,
      cone: 0.0, coneBloom: 0.0, coneConverge: 0.0,
      falloffStart: 1.2, falloffEnd: 2.0,
      staggerPower: 14, critChance: 0.10, critMult: 2.0,
      recoil: 0.0, range: 2.1, aimSpeedMul: 1.0, noise: 2.0, w: 1, h: 2,
      upgrades: {
        power:    upTree('Blade Power', [1.15, 1.32, 1.55, 1.85, 2.30], [1500, 3000, 6000, 11000, 20000]),
        capacity: upTree('Durability',  [1.10, 1.25, 1.45, 1.70, 2.00], [1000, 2200, 4500, 8000, 15000]),
        reload:   upTree('Recovery',    [0.92, 0.85, 0.78, 0.70, 0.60], [1200, 2500, 5000, 9000, 16000]),
        rate:     upTree('Swing Speed', [1.10, 1.22, 1.35, 1.50, 1.70], [1400, 2800, 5600, 10000, 18000]),
        crit:     upTree('Edge',        [0.13, 0.17, 0.22, 0.28, 0.36], [2000, 4000, 8000, 14000, 26000])
      }
    },
    pistol: {
      id: 'pistol', name: 'SG-19 Sidearm', slot: 'primary', ammoType: 'pistol',
      damage: 34, rpm: 380, capacity: 12, reloadTime: 1.55, pierce: 0,
      cone: 0.0135, coneBloom: 0.030, coneConverge: 0.0021,
      falloffStart: 16, falloffEnd: 38,
      staggerPower: 22, critChance: 0.06, critMult: 2.4,
      recoil: 0.030, range: 60, aimSpeedMul: 1.0, noise: 26, w: 2, h: 2,
      upgrades: {
        power:    upTree('Firepower', [1.18, 1.38, 1.62, 1.95, 2.45], [2000, 4500, 9000, 16000, 30000]),
        capacity: upTree('Capacity',  [15, 18, 22, 26, 32],           [1800, 3600, 7000, 12000, 22000]),
        reload:   upTree('Reload',    [0.90, 0.82, 0.73, 0.64, 0.52], [1600, 3200, 6400, 11000, 20000]),
        rate:     upTree('Fire Rate', [1.10, 1.20, 1.33, 1.48, 1.66], [1700, 3400, 6800, 12000, 21000]),
        crit:     upTree('Precision', [0.09, 0.13, 0.18, 0.24, 0.32], [2400, 5000, 10000, 18000, 34000])
      }
    },
    magnum: {
      id: 'magnum', name: 'Broadhorn .44', slot: 'primary', ammoType: 'magnum',
      damage: 260, rpm: 105, capacity: 6, reloadTime: 3.20, pierce: 1,
      cone: 0.0180, coneBloom: 0.062, coneConverge: 0.0030,
      falloffStart: 24, falloffEnd: 55,
      staggerPower: 95, critChance: 0.10, critMult: 2.6,
      recoil: 0.115, range: 80, aimSpeedMul: 0.78, noise: 46, w: 3, h: 2,
      upgrades: {
        power:    upTree('Firepower', [1.20, 1.45, 1.75, 2.15, 2.70], [6000, 12000, 22000, 38000, 65000]),
        capacity: upTree('Capacity',  [7, 8, 9, 10, 12],              [4000, 8000, 15000, 26000, 44000]),
        reload:   upTree('Reload',    [0.88, 0.78, 0.68, 0.58, 0.46], [3500, 7000, 13000, 23000, 40000]),
        rate:     upTree('Fire Rate', [1.08, 1.16, 1.26, 1.38, 1.52], [3800, 7600, 14000, 25000, 42000]),
        crit:     upTree('Precision', [0.14, 0.19, 0.26, 0.35, 0.48], [7000, 14000, 26000, 45000, 78000])
      }
    },
    shotgun: {
      id: 'shotgun', name: 'Sabre 12-Gauge', slot: 'primary', ammoType: 'shell',
      damage: 22, pellets: 9, rpm: 68, capacity: 6, reloadTime: 0.55, shellReload: true,
      pierce: 0, cone: 0.070, coneBloom: 0.045, coneConverge: 0.0090,
      falloffStart: 5, falloffEnd: 16,
      staggerPower: 16, critChance: 0.04, critMult: 2.0,
      recoil: 0.098, range: 22, aimSpeedMul: 0.85, noise: 52, w: 4, h: 2,
      upgrades: {
        power:    upTree('Firepower', [1.20, 1.42, 1.68, 2.00, 2.50], [4500, 9000, 17000, 30000, 52000]),
        capacity: upTree('Capacity',  [7, 8, 10, 12, 15],             [3000, 6000, 11000, 19000, 33000]),
        reload:   upTree('Reload',    [0.88, 0.78, 0.68, 0.57, 0.45], [2800, 5600, 10500, 18000, 31000]),
        rate:     upTree('Fire Rate', [1.10, 1.21, 1.34, 1.48, 1.65], [3000, 6000, 11000, 19000, 33000]),
        crit:     upTree('Choke',     [0.07, 0.10, 0.14, 0.19, 0.26], [5000, 10000, 19000, 33000, 56000])
      }
    },
    smg: {
      id: 'smg', name: 'Wren PDW', slot: 'primary', ammoType: 'smg',
      damage: 18, rpm: 900, capacity: 30, reloadTime: 2.10, pierce: 0,
      cone: 0.0175, coneBloom: 0.021, coneConverge: 0.0034,
      falloffStart: 12, falloffEnd: 30,
      staggerPower: 9, critChance: 0.05, critMult: 2.0,
      recoil: 0.026, range: 45, aimSpeedMul: 0.95, noise: 30, w: 4, h: 2,
      upgrades: {
        power:    upTree('Firepower', [1.16, 1.34, 1.55, 1.82, 2.20], [3500, 7000, 13000, 23000, 40000]),
        capacity: upTree('Capacity',  [36, 42, 50, 60, 75],           [2600, 5200, 9800, 17000, 29000]),
        reload:   upTree('Reload',    [0.90, 0.81, 0.72, 0.62, 0.50], [2400, 4800, 9000, 16000, 27000]),
        rate:     upTree('Fire Rate', [1.06, 1.12, 1.20, 1.28, 1.38], [2800, 5600, 10500, 18000, 31000]),
        crit:     upTree('Precision', [0.08, 0.11, 0.15, 0.20, 0.27], [4200, 8400, 16000, 28000, 48000])
      }
    },
    rifle: {
      id: 'rifle', name: 'Kestrel M-7 (scoped)', slot: 'primary', ammoType: 'rifle',
      damage: 130, rpm: 55, capacity: 5, reloadTime: 2.80, pierce: 2,
      cone: 0.0022, coneBloom: 0.085, coneConverge: 0.0009,
      falloffStart: 60, falloffEnd: 140,
      staggerPower: 58, critChance: 0.12, critMult: 2.8,
      recoil: 0.088, range: 160, aimSpeedMul: 0.62, scoped: true, headMultBonus: 0.5,
      noise: 50, w: 5, h: 2,
      upgrades: {
        power:    upTree('Firepower', [1.20, 1.44, 1.72, 2.06, 2.55], [5000, 10000, 19000, 33000, 57000]),
        capacity: upTree('Capacity',  [6, 8, 10, 12, 15],             [3200, 6400, 12000, 21000, 36000]),
        reload:   upTree('Reload',    [0.88, 0.79, 0.69, 0.59, 0.48], [3000, 6000, 11000, 19000, 33000]),
        rate:     upTree('Bolt Cycle',[1.12, 1.25, 1.40, 1.58, 1.80], [3400, 6800, 12500, 22000, 38000]),
        crit:     upTree('Optics',    [0.16, 0.22, 0.29, 0.38, 0.50], [6000, 12000, 22000, 39000, 67000])
      }
    },
    grenade: {
      id: 'grenade', name: 'Frag Grenade', slot: 'throwable', ammoType: 'grenade',
      damage: 250, rpm: 45, capacity: 1, reloadTime: 0.9, pierce: 0,
      cone: 0.010, coneBloom: 0.020, coneConverge: 0.004,
      falloffStart: 0, falloffEnd: 0, blastRadius: 4.6, impulse: 9.0,
      staggerPower: 120, critChance: 0, critMult: 1, thrown: true,
      recoil: 0.02, range: 22, aimSpeedMul: 0.9, noise: 70, w: 1, h: 1,
      upgrades: {
        power:    upTree('Charge',    [1.15, 1.32, 1.52, 1.78, 2.10], [2500, 5000, 9500, 17000, 29000]),
        capacity: upTree('Carry',     [1, 1, 1, 1, 1],                [900, 1800, 3400, 6000, 10000]),
        reload:   upTree('Draw',      [0.90, 0.82, 0.74, 0.65, 0.55], [900, 1800, 3400, 6000, 10000]),
        rate:     upTree('Throw',     [1.08, 1.16, 1.25, 1.35, 1.46], [900, 1800, 3400, 6000, 10000]),
        crit:     upTree('Fragments', [0.05, 0.08, 0.12, 0.17, 0.24], [2200, 4400, 8400, 15000, 26000])
      }
    },
    flashbang: {
      id: 'flashbang', name: 'Flash Grenade', slot: 'throwable', ammoType: 'flash',
      damage: 12, rpm: 45, capacity: 1, reloadTime: 0.9, pierce: 0,
      cone: 0.010, coneBloom: 0.020, coneConverge: 0.004,
      falloffStart: 0, falloffEnd: 0, blastRadius: 7.0, impulse: 2.0,
      staggerPower: 200, blind: 6.0, critChance: 0, critMult: 1, thrown: true,
      recoil: 0.02, range: 22, aimSpeedMul: 0.9, noise: 62, w: 1, h: 1,
      upgrades: {
        power:    upTree('Yield',     [1.10, 1.20, 1.32, 1.46, 1.62], [1500, 3000, 5700, 10000, 17000]),
        capacity: upTree('Carry',     [1, 1, 1, 1, 1],                [700, 1400, 2600, 4600, 8000]),
        reload:   upTree('Draw',      [0.90, 0.82, 0.74, 0.65, 0.55], [700, 1400, 2600, 4600, 8000]),
        rate:     upTree('Throw',     [1.08, 1.16, 1.25, 1.35, 1.46], [700, 1400, 2600, 4600, 8000]),
        crit:     upTree('Duration',  [0.05, 0.08, 0.12, 0.17, 0.24], [1600, 3200, 6100, 11000, 19000])
      }
    },
    launcher: {
      id: 'launcher', name: 'Tube Launcher', slot: 'primary', ammoType: 'rocket',
      damage: 500, rpm: 22, capacity: 1, reloadTime: 4.2, pierce: 0,
      cone: 0.012, coneBloom: 0.030, coneConverge: 0.005,
      falloffStart: 0, falloffEnd: 0, blastRadius: 6.2, impulse: 16.0,
      staggerPower: 250, critChance: 0, critMult: 1, projectile: true,
      recoil: 0.16, range: 90, aimSpeedMul: 0.55, noise: 90, w: 6, h: 2,
      upgrades: {
        power:    upTree('Warhead',   [1.15, 1.32, 1.52, 1.76, 2.05], [12000, 24000, 44000, 76000, 130000]),
        capacity: upTree('Tube',      [1, 2, 2, 3, 3],                [9000, 18000, 33000, 57000, 98000]),
        reload:   upTree('Reload',    [0.90, 0.80, 0.70, 0.60, 0.50], [8000, 16000, 29000, 50000, 86000]),
        rate:     upTree('Cycle',     [1.08, 1.16, 1.25, 1.35, 1.46], [8000, 16000, 29000, 50000, 86000]),
        crit:     upTree('Shaping',   [0.05, 0.08, 0.12, 0.17, 0.24], [11000, 22000, 40000, 69000, 118000])
      }
    }
  };

  var AMMO_TYPES = {
    pistol:  { id: 'pistol',  name: 'Handgun Ammo',  max: 300 },
    magnum:  { id: 'magnum',  name: 'Magnum Ammo',   max: 60 },
    shell:   { id: 'shell',   name: 'Shotgun Shells', max: 120 },
    smg:     { id: 'smg',     name: 'SMG Ammo',      max: 500 },
    rifle:   { id: 'rifle',   name: 'Rifle Ammo',    max: 90 },
    grenade: { id: 'grenade', name: 'Frag Grenades', max: 12 },
    flash:   { id: 'flash',   name: 'Flash Grenades', max: 12 },
    rocket:  { id: 'rocket',  name: 'Rockets',       max: 6 }
  };

  /* =======================================================================
     3. DATA TABLES: ITEMS / RECIPES / UPGRADES
     ======================================================================= */

  function itm(id, name, w, h, kind, extra) {
    var o = { id: id, name: name, w: w, h: h, kind: kind, stack: 1, value: 0 };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) { o[k] = extra[k]; } } }
    return o;
  }

  var ITEMS = {};
  (function buildItems() {
    var list = [
      /* weapons (footprint mirrors WEAPONS w/h) */
      itm('w_knife', 'Combat Knife', 1, 2, 'weapon', { weapon: 'knife', value: 0 }),
      itm('w_pistol', 'SG-19 Sidearm', 2, 2, 'weapon', { weapon: 'pistol', value: 6000 }),
      itm('w_magnum', 'Broadhorn .44', 3, 2, 'weapon', { weapon: 'magnum', value: 28000 }),
      itm('w_shotgun', 'Sabre 12-Gauge', 4, 2, 'weapon', { weapon: 'shotgun', value: 14000 }),
      itm('w_smg', 'Wren PDW', 4, 2, 'weapon', { weapon: 'smg', value: 12000 }),
      itm('w_rifle', 'Kestrel M-7', 5, 2, 'weapon', { weapon: 'rifle', value: 22000 }),
      itm('w_launcher', 'Tube Launcher', 6, 2, 'weapon', { weapon: 'launcher', value: 60000 }),

      /* ammo */
      itm('a_pistol', 'Handgun Ammo', 1, 1, 'ammo', { ammo: 'pistol', stack: 60, per: 10, value: 300 }),
      itm('a_magnum', 'Magnum Ammo', 1, 1, 'ammo', { ammo: 'magnum', stack: 20, per: 4, value: 1600 }),
      itm('a_shell', 'Shotgun Shells', 1, 1, 'ammo', { ammo: 'shell', stack: 30, per: 6, value: 750 }),
      itm('a_smg', 'SMG Ammo', 1, 1, 'ammo', { ammo: 'smg', stack: 120, per: 30, value: 250 }),
      itm('a_rifle', 'Rifle Ammo', 1, 1, 'ammo', { ammo: 'rifle', stack: 30, per: 5, value: 1200 }),
      itm('a_grenade', 'Frag Grenade', 1, 1, 'ammo', { ammo: 'grenade', stack: 3, per: 1, value: 2500 }),
      itm('a_flash', 'Flash Grenade', 1, 1, 'ammo', { ammo: 'flash', stack: 3, per: 1, value: 1800 }),
      itm('a_rocket', 'Rocket', 1, 2, 'ammo', { ammo: 'rocket', stack: 2, per: 1, value: 15000 }),

      /* herbs and mixes */
      itm('herb_g', 'Green Herb', 1, 1, 'heal', { stack: 3, heal: 0.30, value: 400, herb: 'G' }),
      itm('herb_r', 'Red Herb', 1, 1, 'heal', { stack: 3, heal: 0.00, value: 500, herb: 'R', soloUseless: true }),
      itm('herb_y', 'Yellow Herb', 1, 1, 'heal', { stack: 3, heal: 0.00, capacity: 0.10, value: 700, herb: 'Y' }),
      itm('herb_gg', 'Mixed Herb (G+G)', 1, 1, 'heal', { stack: 2, heal: 0.60, value: 900, herb: 'GG' }),
      itm('herb_gr', 'Mixed Herb (G+R)', 1, 1, 'heal', { stack: 2, heal: 1.00, value: 1100, herb: 'GR' }),
      itm('herb_gy', 'Mixed Herb (G+Y)', 1, 1, 'heal', { stack: 2, heal: 0.30, capacity: 0.10, value: 1200, herb: 'GY' }),
      itm('herb_ggg', 'Mixed Herb (G+G+G)', 1, 1, 'heal', { stack: 2, heal: 1.00, value: 1400, herb: 'GGG' }),
      itm('herb_ggy', 'Mixed Herb (G+G+Y)', 1, 1, 'heal', { stack: 2, heal: 0.60, capacity: 0.10, value: 1700, herb: 'GGY' }),
      itm('herb_gry', 'Mixed Herb (G+R+Y)', 1, 1, 'heal', { stack: 2, heal: 1.00, capacity: 0.10, value: 2400, herb: 'GRY' }),
      itm('spray', 'First Aid Spray', 1, 2, 'heal', { stack: 1, heal: 1.00, full: true, value: 3000 }),
      itm('inhibitor', 'V-09 Inhibitor', 1, 1, 'key', { stack: 2, value: 0, quest: true }),

      /* resources */
      itm('gunpowder', 'Gunpowder', 1, 1, 'resource', { stack: 20, value: 120 }),
      itm('resource_l', 'Resources (L)', 1, 1, 'resource', { stack: 15, value: 300 }),
      itm('resource_s', 'Resources (S)', 1, 1, 'resource', { stack: 20, value: 150 }),
      itm('chem_flask', 'Chemical Flask', 1, 1, 'resource', { stack: 10, value: 450 }),

      /* thrown improvised (Elena can carry/throw these) */
      itm('brick', 'Brick', 1, 1, 'throwable', { stack: 4, value: 0, thrown: true, dmg: 26, stagger: 45 }),
      itm('bottle', 'Bottle', 1, 1, 'throwable', { stack: 4, value: 0, thrown: true, dmg: 14, stagger: 60 }),

      /* keys */
      itm('key_lift', 'Lift Override Key', 1, 1, 'key', { quest: true }),
      itm('key_containment', 'Containment B Card', 1, 1, 'key', { quest: true }),
      itm('key_sluice', 'Sluice Keys', 1, 1, 'key', { quest: true }),
      itm('key_chapel', 'Chapel Bell Key', 1, 1, 'key', { quest: true }),
      itm('key_cannery', 'Cannery Cold Room Key', 1, 1, 'key', { quest: true }),
      itm('key_ossuary', 'Ossuary Seal', 1, 1, 'key', { quest: true }),

      /* treasures */
      itm('t_censer', 'Brass Censer', 2, 2, 'treasure', { value: 4500 }),
      itm('t_rosary', 'Bone Rosary', 1, 1, 'treasure', { value: 2800 }),
      itm('t_ingot', 'Salt-Silver Ingot', 2, 1, 'treasure', { value: 6000 }),
      itm('t_pearl', 'Black Pearl', 1, 1, 'treasure', { value: 3500, gem: true }),
      itm('t_reliquary', 'Sealed Reliquary', 2, 3, 'treasure', { value: 9000, sockets: 3 }),
      itm('t_compass', 'Trawler Compass', 2, 2, 'treasure', { value: 5200 }),
      itm('t_crown', 'Votive Crown', 3, 2, 'treasure', { value: 12000, sockets: 2 }),

      /* documents */
      itm('doc', 'Document', 1, 1, 'document', { stack: 1, value: 0 }),

      /* case upgrades */
      itm('case_1', 'Attache Case (7x5)', 1, 1, 'upgrade_case', { caseW: 7, caseH: 5, value: 0 }),
      itm('case_2', 'Attache Case (8x5)', 1, 1, 'upgrade_case', { caseW: 8, caseH: 5, value: 0 }),
      itm('case_3', 'Attache Case (9x6)', 1, 1, 'upgrade_case', { caseW: 9, caseH: 6, value: 0 }),
      itm('case_4', 'Attache Case (10x6)', 1, 1, 'upgrade_case', { caseW: 10, caseH: 6, value: 0 })
    ];
    for (var i = 0; i < list.length; i++) { ITEMS[list[i].id] = list[i]; }
  })();

  var RECIPES = [
    /* ammo crafting */
    { id: 'r_pistol', kind: 'craft', out: { id: 'a_pistol', count: 10 },
      inputs: [{ id: 'gunpowder', count: 1 }, { id: 'resource_s', count: 1 }] },
    { id: 'r_shell', kind: 'craft', out: { id: 'a_shell', count: 6 },
      inputs: [{ id: 'gunpowder', count: 2 }, { id: 'resource_s', count: 1 }] },
    { id: 'r_smg', kind: 'craft', out: { id: 'a_smg', count: 25 },
      inputs: [{ id: 'gunpowder', count: 1 }, { id: 'resource_s', count: 2 }] },
    { id: 'r_rifle', kind: 'craft', out: { id: 'a_rifle', count: 5 },
      inputs: [{ id: 'gunpowder', count: 2 }, { id: 'resource_l', count: 1 }] },
    { id: 'r_magnum', kind: 'craft', out: { id: 'a_magnum', count: 4 },
      inputs: [{ id: 'gunpowder', count: 3 }, { id: 'resource_l', count: 2 }] },
    { id: 'r_grenade', kind: 'craft', out: { id: 'a_grenade', count: 1 },
      inputs: [{ id: 'gunpowder', count: 4 }, { id: 'resource_l', count: 2 }] },
    { id: 'r_flash', kind: 'craft', out: { id: 'a_flash', count: 1 },
      inputs: [{ id: 'chem_flask', count: 1 }, { id: 'resource_s', count: 2 }] },
    { id: 'r_rocket', kind: 'craft', out: { id: 'a_rocket', count: 1 },
      inputs: [{ id: 'gunpowder', count: 10 }, { id: 'resource_l', count: 6 }] },
    /* herb mixing - the 6 combinations */
    { id: 'm_gg', kind: 'mix', out: { id: 'herb_gg', count: 1 },
      inputs: [{ id: 'herb_g', count: 2 }] },
    { id: 'm_gr', kind: 'mix', out: { id: 'herb_gr', count: 1 },
      inputs: [{ id: 'herb_g', count: 1 }, { id: 'herb_r', count: 1 }] },
    { id: 'm_gy', kind: 'mix', out: { id: 'herb_gy', count: 1 },
      inputs: [{ id: 'herb_g', count: 1 }, { id: 'herb_y', count: 1 }] },
    { id: 'm_ggg', kind: 'mix', out: { id: 'herb_ggg', count: 1 },
      inputs: [{ id: 'herb_gg', count: 1 }, { id: 'herb_g', count: 1 }] },
    { id: 'm_ggy', kind: 'mix', out: { id: 'herb_ggy', count: 1 },
      inputs: [{ id: 'herb_gg', count: 1 }, { id: 'herb_y', count: 1 }] },
    { id: 'm_gry', kind: 'mix', out: { id: 'herb_gry', count: 1 },
      inputs: [{ id: 'herb_gr', count: 1 }, { id: 'herb_y', count: 1 }] }
  ];

  /* merchant-side upgrade catalogue: derived view over WEAPONS + case */
  var UPGRADES = {
    tracks: ['power', 'capacity', 'reload', 'rate', 'crit'],
    weapon: function (weaponId) {
      var w = WEAPONS[weaponId];
      return w ? w.upgrades : null;
    },
    cases: [
      { id: 'case_1', w: 7, h: 5, cost: 8000 },
      { id: 'case_2', w: 8, h: 5, cost: 18000 },
      { id: 'case_3', w: 9, h: 6, cost: 34000 },
      { id: 'case_4', w: 10, h: 6, cost: 60000 }
    ],
    /* exclusive perks unlocked at max power */
    exclusives: {
      pistol:   { id: 'ex_pistol', name: 'Hydra Rounds', cost: 60000, effect: 'critMult', value: 5.0 },
      magnum:   { id: 'ex_magnum', name: 'Breaker Loads', cost: 120000, effect: 'power', value: 2.0 },
      shotgun:  { id: 'ex_shotgun', name: 'Wide Choke', cost: 90000, effect: 'pellets', value: 1.6 },
      smg:      { id: 'ex_smg', name: 'Overpressure', cost: 80000, effect: 'power', value: 1.7 },
      rifle:    { id: 'ex_rifle', name: 'Through-and-Through', cost: 100000, effect: 'pierce', value: 5 },
      launcher: { id: 'ex_launcher', name: 'Infinite Tube', cost: 200000, effect: 'infinite', value: 1 },
      knife:    { id: 'ex_knife', name: 'Verdigris Edge', cost: 70000, effect: 'power', value: 2.0 }
    }
  };

  /* =======================================================================
     4. DATA TABLES: ENEMY ARCHETYPES
     ======================================================================= */

  var ARCH = {
    ganado: {
      id: 'ganado', name: 'Sembrador', hp: 120, poise: 60, speed: 2.05, sprint: 3.5,
      radius: 0.36, height: 1.78, dmg: 16, reach: 1.45, attackWind: 0.42, attackRec: 0.75,
      fov: 1.92, sight: 24, hearing: 16, mass: 78,
      grab: true, grabRange: 1.25, grabChance: 0.42,
      mutate: true, limbs: true, aggression: 1.0, scrip: 220,
      ranged: false, tokenCost: 1
    },
    brute: {
      id: 'brute', name: 'Jefe', hp: 620, poise: 240, speed: 1.55, sprint: 4.4,
      radius: 0.55, height: 2.15, dmg: 42, reach: 1.9, attackWind: 0.7, attackRec: 1.2,
      fov: 1.7, sight: 22, hearing: 18, mass: 190, armor: 0.42,
      grab: true, grabRange: 1.6, grabChance: 0.30,
      mutate: true, limbs: false, aggression: 1.25, scrip: 1400,
      ranged: false, charge: true, tokenCost: 2
    },
    shielder: {
      id: 'shielder', name: 'Bracero', hp: 180, poise: 90, speed: 1.75, sprint: 2.9,
      radius: 0.40, height: 1.80, dmg: 20, reach: 1.5, attackWind: 0.5, attackRec: 0.85,
      fov: 1.8, sight: 22, hearing: 15, mass: 95,
      grab: false, mutate: true, limbs: true, aggression: 0.85, scrip: 450,
      shield: { hp: 220, arc: 1.15 }, ranged: false, tokenCost: 1
    },
    spitter: {
      id: 'spitter', name: 'Regador', hp: 95, poise: 45, speed: 2.2, sprint: 3.9,
      radius: 0.34, height: 1.72, dmg: 22, reach: 0, attackWind: 0.85, attackRec: 1.6,
      fov: 2.0, sight: 30, hearing: 16, mass: 70,
      grab: false, mutate: true, limbs: true, aggression: 0.7, scrip: 520,
      ranged: true, preferredRange: 11, minRange: 6, projSpeed: 15, projArc: 0.30, tokenCost: 1
    },
    crawler: {
      id: 'crawler', name: 'Arana', hp: 80, poise: 35, speed: 3.3, sprint: 5.4,
      radius: 0.30, height: 1.10, dmg: 14, reach: 1.2, attackWind: 0.28, attackRec: 0.5,
      fov: 2.4, sight: 26, hearing: 22, mass: 55,
      grab: true, grabRange: 1.1, grabChance: 0.5,
      mutate: false, limbs: true, aggression: 1.4, scrip: 380,
      wallCrawl: true, ambush: true, ranged: false, tokenCost: 1
    },
    soldier: {
      id: 'soldier', name: 'ARGOS Contractor', hp: 155, poise: 70, speed: 2.4, sprint: 4.3,
      radius: 0.36, height: 1.80, dmg: 11, reach: 0, attackWind: 0.35, attackRec: 0.28,
      fov: 1.85, sight: 34, hearing: 20, mass: 88,
      grab: false, mutate: false, limbs: true, aggression: 0.9, scrip: 640,
      ranged: true, preferredRange: 14, minRange: 7, burst: 3, projSpeed: 120,
      usesCover: true, tokenCost: 1
    },
    boss: {
      id: 'boss', name: 'Second Growth', hp: 4200, poise: 600, speed: 2.0, sprint: 5.0,
      radius: 1.05, height: 3.10, dmg: 55, reach: 3.0, attackWind: 0.9, attackRec: 1.4,
      fov: 2.2, sight: 40, hearing: 40, mass: 520, armor: 0.55,
      grab: true, grabRange: 2.6, grabChance: 0.35,
      mutate: false, limbs: false, aggression: 1.1, scrip: 12000,
      boss: true, phases: 3, tokenCost: 0, weakpointWindow: 4.5
    }
  };

  /* =======================================================================
     5. WORLD STATE
     ======================================================================= */

  function makeHealth(maxSeg) {
    var m = maxSeg * TUNE.segHP;
    return { hp: m, max: m, segments: maxSeg, segHP: TUNE.segHP, regenT: 0, lastHurt: -99 };
  }

  function makePlayerWeapon(id, ammoInMag) {
    var w = WEAPONS[id];
    return {
      id: id, mag: (ammoInMag === undefined ? (w.capacity || 0) : ammoInMag),
      up: { power: 0, capacity: 0, reload: 0, rate: 0, crit: 0 },
      exclusive: false, kills: 0, shots: 0, hits: 0
    };
  }

  function createWorldState(seed) {
    seed = (seed === undefined || seed === null) ? 20260810 : seed;
    var S = {
      version: 4,
      seed: seed >>> 0,
      rngState: ((seed >>> 0) ^ 0x9e3779b9) >>> 0,
      time: 0,
      frame: 0,
      dt: 0,
      difficulty: 'normal',
      paused: false,
      gameOver: false,
      ending: null,
      act: 0,
      section: 'cells',
      sectionIndex: 0,
      objective: { id: 'obj_lift', text: 'Reach the service lift', done: false, progress: 0, target: 1 },
      objectiveHistory: [],
      flags: {
        introDone: false, powerRestored: false, cryoSealed: false, mastRaised: false,
        cisternDrained: false, serranoDead: false, dataDestroyed: false,
        haldane: 'unmet', inhibitorGiven: false, elenaLost: false,
        firstGrabEscaped: false, safeRoom: false, darkness: 0
      },
      stats: {
        shotsFired: 0, shotsHit: 0, headshots: 0, kills: 0, meleeKills: 0,
        damageTaken: 0, damageDealt: 0, elenaSaves: 0, itemsCrafted: 0,
        scripEarned: 0, scripSpent: 0, deaths: 0, timeInCombat: 0,
        survivors: 0, documentsFound: 0, treasuresFound: 0, grabsEscaped: 0,
        grabsFailed: 0, staggers: 0, mutations: 0, distance: 0
      },
      extractionClock: { active: false, timeLeft: 0, total: 900, expired: false },

      player: {
        pos: v3(0, 0, 0), vel: v3(0, 0, 0), moveDir: v3(0, 0, 0),
        yaw: 0, pitch: 0, bodyYaw: 0,
        speed: 0, speedTarget: 0,
        radius: TUNE.playerRadius, height: TUNE.playerHeight,
        grounded: true, groundY: 0, coyote: 0,
        crouch: false, crouchT: 0,
        aiming: false, aimT: 0,
        sprinting: false,
        stamina: TUNE.staminaMax, staminaMax: TUNE.staminaMax, staminaLock: 0, exhausted: false,
        health: makeHealth(TUNE.segments), maxSegments: TUNE.segments,
        alive: true, deathT: 0,
        inCombat: 0,
        iframes: 0,
        weapons: [makePlayerWeapon('knife', 0), makePlayerWeapon('pistol', 11)],
        equipped: 1, lastEquipped: 1,
        ammo: { pistol: 22, magnum: 0, shell: 0, smg: 0, rifle: 0, grenade: 0, flash: 0, rocket: 0 },
        cone: 0.030, coneTarget: 0.0135, coneBloom: 0,
        fireCooldown: 0, reloading: 0, reloadTotal: 0, reloadShells: 0,
        recoil: 0, recoilPitch: 0, recoilYaw: 0,
        meleeT: 0, meleeCooldown: 0, meleePrompt: null, meleeKind: null,
        parryT: 0, parrySuccess: 0,
        grabbedBy: -1, grabT: 0, grabTaps: 0, grabTapsNeeded: 6, grabWasTapped: false,
        vaulting: 0, climbing: null, climbT: 0,
        interactTarget: null, interactHold: 0, kickT: 0,
        flashlight: true, flashBattery: 1.0,
        blinded: 0, poisoned: 0, bleeding: 0,
        scrip: TUNE.startScrip,
        lastFireT: -99, lastNoiseT: -99,
        anim: 'idle', animT: 0
      },

      elena: {
        pos: v3(0, 0, -2), vel: v3(0, 0, 0), yaw: 0,
        radius: 0.30, height: 1.68,
        hp: TUNE.elenaMaxHP, maxHp: TUNE.elenaMaxHP, alive: true,
        behavior: 'Follow', prevBehavior: 'Follow', behaviorT: 0,
        order: 'follow', followDist: 'medium',
        fear: 0.55, fearTier: 'panic', fearSmoothed: 0.55,
        path: [], pathI: 0, repathT: 0, goal: v3(0, 0, 0), hasGoal: false,
        grabbedBy: -1, carryT: 0, carried: false,
        downed: false, downT: 0, revives: 0,
        hesitating: false, hesitateT: 0, hesitateAt: v3(0, 0, 0),
        screamCD: 0, screamT: 0,
        throwCD: 0, holding: null,
        bag: [null, null, null, null, null, null],
        interact: null, interactT: 0, interactHold: false,
        speed: 0, anim: 'idle', animT: 0,
        barkCD: 0, barkTier: 'panic', calloutCD: 0, lastCallout: -99,
        yieldT: 0, sidestepT: 0,
        stress: { threat: 0, gunfire: 0, dark: 0, playerHurt: 0 },
        safeT: 0, hurtT: 0, lastHitT: -99,
        arcTier: 1
      },

      enemies: [],
      projectiles: [],
      pickups: [],
      props: [],
      effects: [],
      hazards: [],
      spawners: [],
      nextId: 1,

      squad: {
        maxTokens: 3, tokens: [], alert: 0, alertT: 0,
        lastKnown: v3(0, 0, 0), lastKnownT: -99, hasContact: false,
        elenaHunters: [], maxElenaHunters: 2, calloutT: 0
      },

      director: {
        score: 0.5, accuracy: 0.5, dmgRate: 0, clearRate: 0.5,
        ammoPressure: 0.5, fearAvg: 0.5, healthAvg: 1.0,
        aggression: 1.0, spawnMul: 1.0, tokenBonus: 0,
        dropBias: { ammo: 1.0, heal: 1.0, resource: 1.0, treasure: 1.0 },
        preferredAmmo: 'pistol', usage: {}, window: 0, samples: 0,
        heat: 0.5, lastAdjust: 0, tension: 0, restT: 0
      },

      inventory: {
        w: 6, h: 4, maxW: 10, maxH: 6, items: [], nextUid: 1, caseTier: 0
      },

      merchant: { open: false, stock: [], lastRestock: -999, section: null },

      dialogueQueue: [],
      callouts: [],
      messages: [],

      /* assigned by integrator before the first update; NEVER serialized */
      level: null,

      /* runtime-only scratch; NEVER serialized */
      _rt: null
    };
    S._rt = makeRuntime();
    applyDifficulty(S);
    S.player.pos = v3(0, 0, 0);
    S.elena.pos = v3(-1.2, 0, -2.2);
    return S;
  }

  function makeRuntime() {
    return {
      hitboxScratch: [0, 0, 0],
      pathBuf: [],
      queryBuf: [],
      lastPerfSample: 0,
      weaponStatCache: {},
      weaponStatKey: '',
      navWarned: false,
      boxCache: null,
      boxCacheLevel: null,
      boxCacheSection: null,
      armed: false,
      dropTable: null,
      tmpTargets: []
    };
  }

  function applyDifficulty(S) {
    var d = diffOf(S);
    S.squad.maxTokens = d.tokens;
    S.squad.maxElenaHunters = d.elenaTargets;
    S.player.grabTapsNeeded = d.mash;
  }

  /* =======================================================================
     6. LEVEL ACCESS (all guarded - S.level may be absent)
     ======================================================================= */

  var FALLBACK_BOUNDS = { min: [-40, -4, -40], max: [40, 20, 40] };

  /* Every section is authored in the same world coordinates, so the merged
     global box list would have geometry from the docks blocking a sightline
     in the holding cells. Always collide and raycast against the ACTIVE
     section only; cache it until the section changes. */
  function levelBoxes(S) {
    if (!S.level) { return EMPTY_ARR; }
    var rt = S._rt;
    if (rt && rt.boxCacheLevel === S.level && rt.boxCacheSection === S.section && rt.boxCache) {
      return rt.boxCache;
    }
    var boxes = null;
    var sec = currentSection(S);
    if (sec && sec.collision && sec.collision.length) { boxes = sec.collision; }
    else if (S.level.collision && S.level.collision.boxes) { boxes = S.level.collision.boxes; }
    else { boxes = EMPTY_ARR; }
    if (rt) {
      rt.boxCache = boxes;
      rt.boxCacheLevel = S.level;
      rt.boxCacheSection = S.section;
    }
    return boxes;
  }
  var EMPTY_ARR = [];

  function levelBounds(S) {
    if (S.level && S.level.bounds) { return S.level.bounds; }
    if (S.level && S.level.sections && S.level.sections.length) {
      var sec = currentSection(S);
      if (sec && sec.bounds) { return sec.bounds; }
    }
    return FALLBACK_BOUNDS;
  }

  function currentSection(S) {
    if (!S.level || !S.level.sections) { return null; }
    var secs = S.level.sections;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].id === S.section) { return secs[i]; }
    }
    return secs[clamp(S.sectionIndex, 0, secs.length - 1)] || null;
  }

  function navIsWalkable(S, x, z) {
    var nq = S.level && S.level.navQuery;
    if (nq && nq.isWalkable) {
      var r = nq.isWalkable(x, z);
      return !!r;
    }
    var b = levelBounds(S);
    return x > b.min[0] + 0.2 && x < b.max[0] - 0.2 && z > b.min[2] + 0.2 && z < b.max[2] - 0.2;
  }

  function navSampleHeight(S, x, z) {
    var nq = S.level && S.level.navQuery;
    if (nq && nq.sampleHeight) {
      var h = nq.sampleHeight(x, z);
      if (typeof h === 'number' && isFinite(h)) { return h; }
    }
    return 0;
  }

  /* findPath returns an array of [x,y,z]; falls back to a straight line. */
  function navFindPath(S, from, to, out) {
    out = out || [];
    out.length = 0;
    var nq = S.level && S.level.navQuery;
    if (nq && nq.findPath) {
      var r = nq.findPath(from, to, out);
      var arr = (r && r.length !== undefined) ? r : out;
      if (arr !== out) {
        out.length = 0;
        for (var i = 0; i < arr.length; i++) { out.push(arr[i]); }
      }
      if (out.length) { return out; }
    }
    out.push([to[0], to[1], to[2]]);
    return out;
  }

  /* line-of-sight raycast against collision boxes */
  function hasLOS(S, a, b, ignoreTag) {
    var boxes = levelBoxes(S);
    if (!boxes.length) { return true; }
    T0[0] = a[0]; T0[1] = a[1]; T0[2] = a[2];
    T1[0] = b[0]; T1[1] = b[1]; T1[2] = b[2];
    for (var i = 0; i < boxes.length; i++) {
      var bx = boxes[i];
      if (ignoreTag && bx.tag === ignoreTag) { continue; }
      if (bx.tag === 'trigger' || bx.tag === 'water' || bx.tag === 'nolos_skip') { continue; }
      var t = U.segIntersectAABB(T0, T1, bx.min, bx.max);
      if (t >= 0 && t <= 1) { return false; }
    }
    return true;
  }

  /* raycast returning nearest hit t (or 1 if clear) */
  function rayBoxes(S, a, b) {
    var boxes = levelBoxes(S), best = 1;
    T0[0] = a[0]; T0[1] = a[1]; T0[2] = a[2];
    T1[0] = b[0]; T1[1] = b[1]; T1[2] = b[2];
    for (var i = 0; i < boxes.length; i++) {
      var bx = boxes[i];
      if (bx.tag === 'trigger' || bx.tag === 'water') { continue; }
      var t = U.segIntersectAABB(T0, T1, bx.min, bx.max);
      if (t >= 0 && t < best) { best = t; }
    }
    return best;
  }

  /* =======================================================================
     7. COLLISION: swept capsule vs AABB with step-up + slopes
     ======================================================================= */

  function boxTopUnder(S, x, z, feetY, radius, maxTop) {
    var boxes = levelBoxes(S), best = -1e9, i, bx;
    for (i = 0; i < boxes.length; i++) {
      bx = boxes[i];
      if (bx.tag === 'trigger') { continue; }
      if (x < bx.min[0] - radius || x > bx.max[0] + radius) { continue; }
      if (z < bx.min[2] - radius || z > bx.max[2] + radius) { continue; }
      var top = bx.max[1];
      if (top <= maxTop + 1e-4 && top > best) { best = top; }
    }
    return best;
  }

  /* Resolve one horizontal position against boxes. Returns adjusted y (step-up). */
  function resolveHorizontal(S, p, radius, feetY, height) {
    var boxes = levelBoxes(S);
    var headY = feetY + height;
    var stepped = feetY;
    var iter, i, bx;
    for (iter = 0; iter < 4; iter++) {
      var moved = false;
      for (i = 0; i < boxes.length; i++) {
        bx = boxes[i];
        if (bx.tag === 'trigger' || bx.tag === 'water') { continue; }
        /* vertical overlap test (with step-up tolerance) */
        var top = bx.max[1], bot = bx.min[1];
        if (top <= stepped + TUNE.stepUp + 1e-4) {
          /* low enough to step onto - not a wall */
          if (top > stepped) {
            /* candidate step: only if we actually overlap in XZ */
            var cx0 = clamp(p[0], bx.min[0], bx.max[0]);
            var cz0 = clamp(p[2], bx.min[2], bx.max[2]);
            var ddx0 = p[0] - cx0, ddz0 = p[2] - cz0;
            if (ddx0 * ddx0 + ddz0 * ddz0 < radius * radius) {
              stepped = top;
              headY = stepped + height;
            }
          }
          continue;
        }
        if (bot >= headY - 1e-4) { continue; }
        var cx = clamp(p[0], bx.min[0], bx.max[0]);
        var cz = clamp(p[2], bx.min[2], bx.max[2]);
        var dx = p[0] - cx, dz = p[2] - cz;
        var d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) { continue; }
        var d = Math.sqrt(d2);
        if (d < 1e-6) {
          /* deep inside: push out along the shortest axis */
          var toMinX = p[0] - bx.min[0], toMaxX = bx.max[0] - p[0];
          var toMinZ = p[2] - bx.min[2], toMaxZ = bx.max[2] - p[2];
          var m = Math.min(toMinX, Math.min(toMaxX, Math.min(toMinZ, toMaxZ)));
          if (m === toMinX) { p[0] = bx.min[0] - radius; }
          else if (m === toMaxX) { p[0] = bx.max[0] + radius; }
          else if (m === toMinZ) { p[2] = bx.min[2] - radius; }
          else { p[2] = bx.max[2] + radius; }
        } else {
          var pen = radius - d;
          p[0] += (dx / d) * pen;
          p[2] += (dz / d) * pen;
        }
        moved = true;
      }
      if (!moved) { break; }
    }
    /* keep inside world bounds */
    var b = levelBounds(S);
    p[0] = clamp(p[0], b.min[0] + radius, b.max[0] - radius);
    p[2] = clamp(p[2], b.min[2] + radius, b.max[2] - radius);
    return stepped;
  }

  /* Move an entity horizontally with substeps so nothing tunnels. */
  function moveEntity(S, ent, dx, dz, radius, height) {
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-7) {
      settleVertical(S, ent, radius, height, 0);
      return 0;
    }
    var steps = Math.min(24, Math.max(1, Math.ceil(dist / TUNE.substepMax)));
    var sx = dx / steps, sz = dz / steps;
    var p = ent.pos, travelled = 0;
    for (var i = 0; i < steps; i++) {
      var ox = p[0], oz = p[2];
      p[0] += sx; p[2] += sz;
      var newFeet = resolveHorizontal(S, p, radius, p[1], height);
      if (newFeet > p[1]) {
        var rise = newFeet - p[1];
        if (rise <= TUNE.stepUp + 1e-4) { p[1] = newFeet; }
      }
      travelled += Math.sqrt((p[0] - ox) * (p[0] - ox) + (p[2] - oz) * (p[2] - oz));
    }
    settleVertical(S, ent, radius, height, 0);
    sanitizeVec(p);
    return travelled;
  }

  function settleVertical(S, ent, radius, height, dtGrav) {
    var p = ent.pos;
    var ground = navSampleHeight(S, p[0], p[2]);
    var top = boxTopUnder(S, p[0], p[2], p[1], radius * 0.92, p[1] + TUNE.stepUp);
    if (top > ground) { ground = top; }
    var b = levelBounds(S);
    if (ground < b.min[1]) { ground = b.min[1]; }
    if (dtGrav > 0 && p[1] > ground + 0.02) {
      ent.vel[1] += TUNE.gravity * dtGrav;
      p[1] += ent.vel[1] * dtGrav;
      if (p[1] <= ground) { p[1] = ground; ent.vel[1] = 0; ent.grounded = true; }
      else { ent.grounded = false; }
    } else {
      /* snap: prevents falling through and enforces slope following */
      var diff = ground - p[1];
      if (diff > 0) { p[1] = ground; }
      else if (diff > -0.6) { p[1] = ground; }
      else { p[1] += Math.max(diff, -6 * (dtGrav || 0.016)); }
      ent.vel[1] = 0;
      ent.grounded = true;
    }
    ent.groundY = ground;
    p[1] = clamp(p[1], b.min[1] - 1, b.max[1]);
    sanitizeVec(p);
  }

  /* =======================================================================
     8. HEALTH / DAMAGE
     ======================================================================= */

  function segCap(h) {
    var seg = Math.floor((h.hp - 0.0001) / h.segHP);
    if (seg < 0) { seg = 0; }
    return Math.min(h.max, (seg + 1) * h.segHP);
  }

  function healthSegments(h) {
    return { filled: Math.ceil(h.hp / h.segHP), total: h.segments,
             frac: (h.hp % h.segHP) / h.segHP };
  }

  function healPlayer(S, amount, full) {
    var h = S.player.health;
    if (full) { h.hp = h.max; }
    else { h.hp = Math.min(h.max, h.hp + amount); }
    S.player.poisoned = 0;
    S.player.bleeding = 0;
    emit('heal', { amount: amount, hp: h.hp, max: h.max });
    return h.hp;
  }

  function expandPlayerCapacity(S, frac) {
    var h = S.player.health;
    var add = Math.round(h.segments * TUNE.segHP * frac);
    h.max += add;
    h.segments = Math.max(h.segments, Math.ceil(h.max / h.segHP));
    h.hp = Math.min(h.max, h.hp + add);
    S.player.maxSegments = h.segments;
  }

  /* central damage entry point */
  function damage(S, target, amount, type, hitPos, hitDir) {
    if (!target || amount <= 0) { return 0; }
    var d = diffOf(S);
    var applied = 0;
    if (target === S.player || target.__isPlayer) {
      if (S.player.iframes > 0 || !S.player.alive) { return 0; }
      amount *= d.dmgIn;
      var h = S.player.health;
      h.hp = Math.max(0, h.hp - amount);
      h.lastHurt = S.time;
      h.regenT = 0;
      applied = amount;
      S.stats.damageTaken += amount;
      S.player.inCombat = TUNE.combatMemory;
      S.player.cone = Math.min(0.28, S.player.cone + 0.045);
      emit('damage', { who: 'player', amount: amount, type: type, hp: h.hp, max: h.max,
                       dir: hitDir ? vcopy(hitDir) : null });
      if (h.hp <= 0) { killPlayer(S, type); }
      /* elena reacts to the player being hurt */
      S.elena.stress.playerHurt = Math.min(1, S.elena.stress.playerHurt + amount / 260);
      return applied;
    }
    if (target === S.elena || target.__isElena) {
      if (!S.elena.alive) { return 0; }
      amount *= d.dmgIn * 0.85;
      S.elena.hp = Math.max(0, S.elena.hp - amount);
      S.elena.lastHitT = S.time;
      S.elena.hurtT = 0.6;
      S.elena.fear = clamp(S.elena.fear + amount / 200, 0, 1);
      applied = amount;
      emit('damage', { who: 'elena', amount: amount, type: type, hp: S.elena.hp, max: S.elena.maxHp });
      if (S.elena.hp <= 0) {
        if (!S.elena.downed && S.elena.revives < 1) {
          S.elena.downed = true;
          S.elena.downT = TUNE.elenaDownTime;
          S.elena.hp = 1;
          setBehavior(S, 'Downed');
          emit('dialogue', { id: 'elena_downed', speaker: 'ELENA' });
        } else {
          killElena(S, type);
        }
      }
      return applied;
    }
    /* enemy */
    return damageEnemy(S, target, amount, type, hitPos, hitDir, 'torso', 1);
  }

  function killPlayer(S, cause) {
    if (!S.player.alive) { return; }
    S.player.alive = false;
    S.player.deathT = 0;
    S.stats.deaths++;
    S.gameOver = true;
    S.ending = 'end_warden_down';
    emit('player_death', { cause: cause, time: S.time });
  }

  function killElena(S, cause) {
    if (!S.elena.alive) { return; }
    S.elena.alive = false;
    S.elena.hp = 0;
    S.flags.elenaLost = true;
    S.gameOver = true;
    S.ending = 'end_the_field';
    emit('elena_death', { cause: cause, time: S.time });
  }

  /* =======================================================================
     9. WEAPON STATS (upgrade-aware, cached per weapon instance)
     ======================================================================= */

  function tierVal(track, level, base) {
    if (level <= 0) { return base; }
    var v = track.tiers[Math.min(track.tiers.length, level) - 1];
    return v;
  }

  function weaponStats(S, pw, out) {
    var base = WEAPONS[pw.id];
    out = out || {};
    var up = pw.up || { power: 0, capacity: 0, reload: 0, rate: 0, crit: 0 };
    var powMul = up.power > 0 ? tierVal(base.upgrades.power, up.power, 1) : 1;
    var rateMul = up.rate > 0 ? tierVal(base.upgrades.rate, up.rate, 1) : 1;
    var relMul = up.reload > 0 ? tierVal(base.upgrades.reload, up.reload, 1) : 1;
    var cap = up.capacity > 0 ? tierVal(base.upgrades.capacity, up.capacity, base.capacity) : base.capacity;
    var crit = up.crit > 0 ? tierVal(base.upgrades.crit, up.crit, base.critChance) : base.critChance;
    if (base.id === 'knife' || base.id === 'grenade' || base.id === 'flashbang' ||
        base.id === 'launcher') {
      if (up.capacity > 0 && typeof cap === 'number' && cap < 1) { cap = base.capacity; }
    }
    out.id = base.id;
    out.damage = base.damage * powMul * diffOf(S).dmgOut;
    out.pellets = base.pellets || 1;
    out.rpm = base.rpm * rateMul;
    out.interval = 60 / Math.max(1, out.rpm);
    out.capacity = Math.round(cap);
    out.reloadTime = base.reloadTime * relMul;
    out.cone = base.cone;
    out.coneBloom = base.coneBloom;
    out.coneConverge = base.coneConverge;
    out.falloffStart = base.falloffStart;
    out.falloffEnd = base.falloffEnd;
    out.pierce = base.pierce;
    out.staggerPower = base.staggerPower * (0.6 + 0.4 * powMul);
    out.critChance = crit;
    out.critMult = base.critMult;
    out.recoil = base.recoil;
    out.range = base.range;
    out.ammoType = base.ammoType;
    out.blastRadius = base.blastRadius || 0;
    out.impulse = base.impulse || 0;
    out.blind = base.blind || 0;
    out.noise = base.noise || 0;
    out.thrown = !!base.thrown;
    out.projectile = !!base.projectile;
    out.shellReload = !!base.shellReload;
    out.scoped = !!base.scoped;
    out.headMultBonus = base.headMultBonus || 0;
    out.aimSpeedMul = base.aimSpeedMul;
    out.slot = base.slot;
    if (pw.exclusive) {
      var ex = UPGRADES.exclusives[base.id];
      if (ex) {
        if (ex.effect === 'power') { out.damage *= ex.value; }
        else if (ex.effect === 'critMult') { out.critMult = ex.value; }
        else if (ex.effect === 'pellets') { out.pellets = Math.round(out.pellets * ex.value); }
        else if (ex.effect === 'pierce') { out.pierce = ex.value; }
        else if (ex.effect === 'infinite') { out.infinite = true; }
      }
    }
    return out;
  }

  var STAT_SCRATCH = {};
  function equippedWeapon(S) {
    return S.player.weapons[clamp(S.player.equipped, 0, S.player.weapons.length - 1)];
  }
  function equippedStats(S) {
    return weaponStats(S, equippedWeapon(S), STAT_SCRATCH);
  }

  function findWeapon(S, id) {
    for (var i = 0; i < S.player.weapons.length; i++) {
      if (S.player.weapons[i].id === id) { return S.player.weapons[i]; }
    }
    return null;
  }

  function giveWeapon(S, id, mag) {
    if (!WEAPONS[id]) { return null; }
    var existing = findWeapon(S, id);
    if (existing) { return existing; }
    var pw = makePlayerWeapon(id, mag === undefined ? WEAPONS[id].capacity : mag);
    S.player.weapons.push(pw);
    return pw;
  }

  function giveAmmo(S, type, count) {
    if (!AMMO_TYPES[type]) { return 0; }
    var before = S.player.ammo[type] || 0;
    var after = Math.min(AMMO_TYPES[type].max, before + count);
    S.player.ammo[type] = after;
    return after - before;
  }

  /* =======================================================================
     10. PLAYER UPDATE
     ======================================================================= */

  function playerSpeedTarget(S, input) {
    var p = S.player;
    if (p.grabbedBy >= 0 || p.meleeT > 0 || p.vaulting > 0 || p.climbing) { return 0; }
    if (p.aiming) { return TUNE.speedAim; }
    if (p.crouch) { return TUNE.speedCrouch; }
    if (p.sprinting) { return TUNE.speedSprint; }
    var mag = Math.min(1, Math.sqrt(input.moveX * input.moveX + input.moveY * input.moveY));
    if (mag < 0.55) { return TUNE.speedWalk; }
    return TUNE.speedJog;
  }

  function updatePlayer(S, input, dt) {
    var p = S.player;
    p.animT += dt;

    if (!p.alive) {
      p.deathT += dt;
      p.anim = 'death';
      return;
    }

    /* ---- look ---- */
    var sens = 0.0022;
    var aimSens = p.aiming ? 0.55 : 1.0;
    p.yaw = angleWrap(p.yaw - (input.lookX || 0) * sens * aimSens);
    p.pitch = clamp(p.pitch - (input.lookY || 0) * sens * aimSens, -1.30, 1.30);

    /* recoil decay pushes the view back down */
    if (p.recoilPitch !== 0 || p.recoilYaw !== 0) {
      var rec = Math.exp(-9 * dt);
      p.pitch -= p.recoilPitch * (1 - rec);
      p.yaw -= p.recoilYaw * (1 - rec);
      p.recoilPitch *= rec;
      p.recoilYaw *= rec;
      if (Math.abs(p.recoilPitch) < 1e-5) { p.recoilPitch = 0; }
      if (Math.abs(p.recoilYaw) < 1e-5) { p.recoilYaw = 0; }
    }
    p.recoil = Math.max(0, p.recoil - dt * 3.2);

    /* ---- timers ---- */
    p.iframes = Math.max(0, p.iframes - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.meleeCooldown = Math.max(0, p.meleeCooldown - dt);
    p.parryT = Math.max(0, p.parryT - dt);
    p.blinded = Math.max(0, p.blinded - dt);
    p.inCombat = Math.max(0, p.inCombat - dt);
    p.kickT = Math.max(0, p.kickT - dt);
    if (p.meleeT > 0) { p.meleeT = Math.max(0, p.meleeT - dt); }
    if (p.vaulting > 0) { p.vaulting = Math.max(0, p.vaulting - dt); }

    /* melee prompt lifetime */
    if (p.meleePrompt) {
      p.meleePrompt.t -= dt;
      var pe = enemyById(S, p.meleePrompt.enemyId);
      if (p.meleePrompt.t <= 0 || !pe || pe.dead ||
          distXZ(pe.pos, p.pos) > TUNE.meleeReach + 0.9) {
        p.meleePrompt = null;
      }
    }

    /* ---- grabbed state overrides everything ---- */
    if (p.grabbedBy >= 0) {
      updatePlayerGrabbed(S, input, dt);
      return;
    }

    /* ---- health regen (current segment only) ---- */
    var h = p.health;
    if (p.inCombat <= 0 && S.time - h.lastHurt > TUNE.regenDelay) {
      var cap = segCap(h);
      if (h.hp < cap) {
        h.hp = Math.min(cap, h.hp + TUNE.regenRate * dt);
      }
    }
    if (p.bleeding > 0) {
      p.bleeding = Math.max(0, p.bleeding - dt);
      h.hp = Math.max(1, h.hp - 3.5 * dt);
    }
    if (p.poisoned > 0) {
      p.poisoned = Math.max(0, p.poisoned - dt);
      h.hp = Math.max(1, h.hp - 5.0 * dt);
      h.lastHurt = S.time;
    }

    /* ---- crouch / aim transitions ---- */
    p.crouch = !!input.crouch && p.vaulting <= 0;
    p.crouchT = approach(p.crouchT, p.crouch ? 1 : 0, 1 / 0.20, dt);
    p.height = lerp(TUNE.playerHeight, TUNE.playerCrouchHeight, p.crouchT);

    var wantAim = !!input.aim && p.reloading <= 0 && p.meleeT <= 0;
    p.aiming = wantAim;
    p.aimT = approach(p.aimT, wantAim ? 1 : 0, 1 / TUNE.aimTransition, dt);

    /* ---- stamina ---- */
    var stats = equippedStats(S);
    var wantSprint = !!input.sprint && !p.aiming && !p.crouch && p.stamina > 1 &&
                     (Math.abs(input.moveX) + Math.abs(input.moveY)) > 0.2 && !p.exhausted;
    p.sprinting = wantSprint;
    var drained = false;
    if (p.sprinting) { p.stamina -= TUNE.staminaSprint * dt; drained = true; }
    if (p.aiming && stats.aimSpeedMul < 0.8) {
      p.stamina -= TUNE.staminaAimHeavy * dt * (1 - stats.aimSpeedMul); drained = true;
    }
    if (drained) { p.staminaLock = TUNE.staminaRegenDelay; }
    else {
      p.staminaLock = Math.max(0, p.staminaLock - dt);
      if (p.staminaLock <= 0) {
        p.stamina = Math.min(p.staminaMax, p.stamina + TUNE.staminaRegen * dt);
      }
    }
    if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; }
    if (p.exhausted && p.stamina > p.staminaMax * 0.35) { p.exhausted = false; }

    /* ---- movement with deliberate acceleration ---- */
    var mx = clamp(input.moveX || 0, -1, 1), my = clamp(input.moveY || 0, -1, 1);
    var mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
    var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    /* forward = +Z rotated by yaw */
    var wx = mx * cy + my * sy;
    var wz = -mx * sy + my * cy;

    var tgt = playerSpeedTarget(S, input) * mag;
    if (p.exhausted) { tgt = Math.min(tgt, TUNE.speedJog * 0.8); }
    var accel = (tgt > p.speed) ? (TUNE.speedSprint / TUNE.accelTime) : (TUNE.speedSprint / TUNE.decelTime);
    p.speed = approach(p.speed, tgt, accel, dt);

    if (mag > 0.001) {
      var desiredDir = Math.atan2(wx, wz);
      p.bodyYaw = turnToward(p.bodyYaw, p.aiming ? p.yaw : desiredDir, TUNE.turnRate, dt);
      vnorm(p.moveDir, vset(T0, wx, 0, wz));
    } else {
      p.bodyYaw = turnToward(p.bodyYaw, p.yaw, TUNE.turnRate * 0.6, dt);
      vset(p.moveDir, 0, 0, 0);
      p.speed = approach(p.speed, 0, TUNE.speedSprint / TUNE.decelTime, dt);
    }

    var vx = p.moveDir[0] * p.speed;
    var vz = p.moveDir[2] * p.speed;
    p.vel[0] = vx; p.vel[2] = vz;

    var moved = 0;
    if (p.meleeT <= 0 && p.vaulting <= 0 && !p.climbing) {
      moved = moveEntity(S, p, vx * dt, vz * dt, p.radius, p.height);
    } else {
      settleVertical(S, p, p.radius, p.height, 0);
    }
    S.stats.distance += moved;

    /* ---- aim cone: blooms with movement/fire, converges when still ---- */
    updateCone(S, stats, moved / Math.max(dt, 1e-5), dt);

    /* ---- noise emission (hearing model) ---- */
    if (p.sprinting && moved > 0) { makeNoise(S, p.pos, 9, 'sprint'); }
    else if (p.crouch) { /* quiet */ }
    else if (moved > 0.01) { makeNoise(S, p.pos, 4.5, 'walk'); }

    /* ---- reload ---- */
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) { finishReload(S); }
    } else if (input.reload) {
      startReload(S);
    }

    /* ---- weapon swap ---- */
    if (input.swapPressed) { cycleWeapon(S, 1); }

    /* ---- melee / parry ---- */
    if (input.meleePressed) { melee(S); }

    /* ---- fire ---- */
    if ((input.fire || input.firePressed) && p.reloading <= 0 && p.meleeT <= 0) {
      fireWeapon(S, dt, !!input.firePressed);
    }

    /* ---- interact ---- */
    if (input.interactPressed) { interact(S); }

    /* ---- flashlight ---- */
    if (input.flashlight !== undefined) { p.flashlight = !!input.flashlight; }

    /* ---- animation label ---- */
    if (p.meleeT > 0) { p.anim = 'melee'; }
    else if (p.reloading > 0) { p.anim = 'reload'; }
    else if (p.vaulting > 0) { p.anim = 'vault'; }
    else if (p.climbing) { p.anim = 'climb'; }
    else if (p.aiming) { p.anim = 'aim'; }
    else if (p.crouch) { p.anim = 'crouch'; }
    else if (p.sprinting && p.speed > 0.5) { p.anim = 'sprint'; }
    else if (p.speed > 2.2) { p.anim = 'run'; }
    else if (p.speed > 0.15) { p.anim = 'walk'; }
    else { p.anim = 'idle'; }

    sanitizeVec(p.pos); sanitizeVec(p.vel);
    p.health.hp = clamp(finite(p.health.hp, 0), 0, p.health.max);
    p.stamina = clamp(finite(p.stamina, 0), 0, p.staminaMax);
  }

  function updateCone(S, stats, speed, dt) {
    var p = S.player;
    /* target: tight when aiming and still, wide when hip-firing and moving */
    var base = stats.cone;
    var aimFactor = lerp(3.4, 1.0, p.aimT);
    var moveFactor = 1 + clamp(speed / TUNE.speedSprint, 0, 1) * 2.6;
    var crouchFactor = p.crouch ? 0.72 : 1.0;
    var staminaFactor = p.exhausted ? 1.45 : 1.0;
    var target = base * aimFactor * moveFactor * crouchFactor * staminaFactor;
    p.coneTarget = target;
    /* bloom decays; converge rate is per-weapon */
    p.coneBloom = Math.max(0, p.coneBloom - stats.coneConverge * 60 * dt);
    var conv = 1 - Math.exp(-dt / TUNE.coneConvergeTime * (p.aiming && speed < 0.3 ? 2.4 : 1.0));
    p.cone = p.cone + (target - p.cone) * conv;
    p.cone = clamp(p.cone + p.coneBloom, base * 0.5, 0.42);
  }

  function getAimCone(S) {
    var stats = equippedStats(S);
    return { current: S.player.cone, min: stats.cone, max: stats.cone * 6,
             converge: clamp(1 - (S.player.cone - stats.cone) / (stats.cone * 5 + 1e-6), 0, 1) };
  }

  function cycleWeapon(S, dir) {
    var p = S.player;
    var n = p.weapons.length;
    if (n <= 1) { return; }
    var i = p.equipped;
    for (var k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      var w = WEAPONS[p.weapons[i].id];
      if (w.slot === 'melee') { continue; }
      p.lastEquipped = p.equipped;
      p.equipped = i;
      p.reloading = 0;
      p.coneBloom = 0.02;
      emit('weapon_swap', { id: p.weapons[i].id });
      return;
    }
  }

  function equipWeapon(S, id) {
    for (var i = 0; i < S.player.weapons.length; i++) {
      if (S.player.weapons[i].id === id) {
        S.player.lastEquipped = S.player.equipped;
        S.player.equipped = i;
        S.player.reloading = 0;
        emit('weapon_swap', { id: id });
        return true;
      }
    }
    return false;
  }

  /* =======================================================================
     11. RELOAD
     ======================================================================= */

  function startReload(S) {
    var p = S.player;
    if (p.reloading > 0 || p.meleeT > 0) { return false; }
    var pw = equippedWeapon(S);
    var st = weaponStats(S, pw, STAT_SCRATCH);
    if (!st.ammoType) { return false; }
    if (st.infinite) { pw.mag = st.capacity; return false; }
    if (pw.mag >= st.capacity) { return false; }
    var reserve = p.ammo[st.ammoType] || 0;
    if (reserve <= 0) { emit('reload', { id: pw.id, empty: true }); return false; }
    if (st.shellReload) {
      p.reloading = st.reloadTime;
      p.reloadTotal = st.reloadTime;
      p.reloadShells = 1;
    } else {
      p.reloading = st.reloadTime;
      p.reloadTotal = st.reloadTime;
      p.reloadShells = 0;
    }
    p.coneBloom = Math.min(0.12, p.coneBloom + 0.03);
    emit('reload', { id: pw.id, time: st.reloadTime, shell: !!st.shellReload });
    return true;
  }

  function finishReload(S) {
    var p = S.player;
    var pw = equippedWeapon(S);
    var st = weaponStats(S, pw, STAT_SCRATCH);
    var reserve = p.ammo[st.ammoType] || 0;
    if (st.shellReload) {
      if (reserve > 0 && pw.mag < st.capacity) {
        pw.mag += 1; p.ammo[st.ammoType] = reserve - 1;
      }
      p.reloading = 0;
      if (pw.mag < st.capacity && (p.ammo[st.ammoType] || 0) > 0) {
        /* chain another shell unless interrupted next frame */
        p.reloading = st.reloadTime;
        p.reloadTotal = st.reloadTime;
      }
    } else {
      var need = st.capacity - pw.mag;
      var take = Math.min(need, reserve);
      pw.mag += take;
      p.ammo[st.ammoType] = reserve - take;
      p.reloading = 0;
    }
    emit('reload_done', { id: pw.id, mag: pw.mag });
  }

  function reload(S) { return startReload(S); }

  /* =======================================================================
     12. FIRING / HITSCAN
     ======================================================================= */

  function playerEye(S, out) {
    var p = S.player;
    out[0] = p.pos[0];
    out[1] = p.pos[1] + p.height * TUNE.eyeRatio;
    out[2] = p.pos[2];
    return out;
  }

  function aimDir(S, out, spreadX, spreadY) {
    var p = S.player;
    var yaw = p.yaw + (spreadX || 0);
    var pitch = clamp(p.pitch + (spreadY || 0), -1.45, 1.45);
    var cp = Math.cos(pitch);
    out[0] = Math.sin(yaw) * cp;
    out[1] = Math.sin(pitch);
    out[2] = Math.cos(yaw) * cp;
    return out;
  }

  function fireWeapon(S, dt, pressed) {
    var p = S.player;
    if (!p.alive || p.grabbedBy >= 0) { return false; }
    var pw = equippedWeapon(S);
    var st = weaponStats(S, pw, STAT_SCRATCH);
    if (st.slot === 'melee') { if (pressed) { melee(S); } return false; }
    if (p.fireCooldown > 0) { return false; }
    if (p.reloading > 0) { return false; }

    if (st.thrown) {
      var reserveT = p.ammo[st.ammoType] || 0;
      if (reserveT <= 0) { emit('dryfire', { id: pw.id }); return false; }
      if (!pressed) { return false; }
      p.ammo[st.ammoType] = reserveT - 1;
      throwGrenade(S, st);
      p.fireCooldown = st.interval;
      S.stats.shotsFired++;
      pw.shots++;
      makeNoise(S, p.pos, 8, 'throw');
      emit('shot', { id: pw.id, thrown: true });
      return true;
    }

    if (st.infinite) { pw.mag = Math.max(pw.mag, 1); }
    if (pw.mag <= 0) {
      if (pressed) { emit('dryfire', { id: pw.id }); startReload(S); }
      return false;
    }

    pw.mag -= 1;
    p.fireCooldown = st.interval;
    p.lastFireT = S.time;
    p.inCombat = TUNE.combatMemory;
    S.stats.shotsFired++;
    pw.shots++;
    trackWeaponUsage(S, pw.id);

    /* recoil + bloom */
    p.coneBloom = Math.min(0.30, p.coneBloom + st.coneBloom * (p.aiming ? 0.7 : 1.0));
    p.recoilPitch += st.recoil * (p.crouch ? 0.8 : 1.0);
    p.recoilYaw += (rnd(S) - 0.5) * st.recoil * 0.55;
    p.recoil = 1;

    makeNoise(S, p.pos, st.noise, 'gunshot');
    emit('shot', { id: pw.id, mag: pw.mag, cone: p.cone, pos: vcopy(p.pos) });

    if (st.projectile) {
      spawnProjectile(S, 'rocket', p.pos, aimDir(S, T3, 0, 0), 34, st.damage, st);
      return true;
    }

    var pellets = st.pellets;
    var anyHit = false;
    for (var i = 0; i < pellets; i++) {
      var sx, sy2;
      if (pellets > 1) {
        var a = rnd(S) * TAU, r = Math.sqrt(rnd(S)) * p.cone;
        sx = Math.cos(a) * r; sy2 = Math.sin(a) * r;
      } else {
        var a2 = rnd(S) * TAU, r2 = Math.sqrt(rnd(S)) * p.cone * 0.5;
        sx = Math.cos(a2) * r2; sy2 = Math.sin(a2) * r2;
      }
      if (hitscan(S, st, pw, sx, sy2)) { anyHit = true; }
    }
    if (anyHit) { S.stats.shotsHit++; pw.hits++; }
    return true;
  }

  /* ray vs enemy: returns hit location string or null */
  var HIT_SCRATCH = { enemy: null, t: 1, loc: 'torso', point: [0, 0, 0] };

  function rayEnemy(S, e, origin, dir, maxDist, out) {
    /* capsule approximated by a vertical cylinder + head sphere */
    var arch = ARCH[e.kind] || ARCH.ganado;
    var r = e.radius || arch.radius;
    var hgt = e.height || arch.height;
    var ox = origin[0] - e.pos[0], oz = origin[2] - e.pos[2];
    var dx = dir[0], dz = dir[2];
    var a = dx * dx + dz * dz;
    if (a < 1e-9) { return false; }
    var b = 2 * (ox * dx + oz * dz);
    var c = ox * ox + oz * oz - r * r;
    var disc = b * b - 4 * a * c;
    if (disc < 0) { return false; }
    var sq = Math.sqrt(disc);
    var t = (-b - sq) / (2 * a);
    if (t < 0) { t = (-b + sq) / (2 * a); }
    if (t < 0 || t > maxDist) { return false; }
    var hy = origin[1] + dir[1] * t;
    var baseY = e.pos[1];
    if (e.downed) { hgt *= 0.42; }
    if (hy < baseY - 0.05 || hy > baseY + hgt) { return false; }
    var rel = (hy - baseY) / hgt;
    var loc;
    if (e.shield && !e.shield.broken && facingShield(e, origin)) {
      loc = 'shield';
    } else if (e.mutated && rel > 0.72) {
      loc = 'weakpoint';
    } else if (e.weakpointOpen && rel > 0.55 && rel < 0.80) {
      loc = 'weakpoint';
    } else if (rel > 0.845) {
      loc = 'head';
    } else if (rel < 0.46) {
      /* legs: pick side from horizontal offset relative to facing */
      var side = (ox * Math.cos(e.yaw) - oz * Math.sin(e.yaw));
      loc = side > 0 ? 'limbR' : 'limbL';
    } else {
      var hx = origin[0] + dir[0] * t - e.pos[0];
      var hz = origin[2] + dir[2] * t - e.pos[2];
      var lat = hx * Math.cos(e.yaw) - hz * Math.sin(e.yaw);
      if (Math.abs(lat) > r * 0.62 && rel > 0.52 && rel < 0.78) {
        loc = lat > 0 ? 'limbR' : 'limbL';
      } else {
        loc = 'torso';
      }
    }
    out.t = t; out.loc = loc;
    out.point[0] = origin[0] + dir[0] * t;
    out.point[1] = hy;
    out.point[2] = origin[2] + dir[2] * t;
    return true;
  }

  function facingShield(e, from) {
    var dx = from[0] - e.pos[0], dz = from[2] - e.pos[2];
    var ang = Math.atan2(dx, dz);
    var d = Math.abs(angleWrap(ang - e.yaw));
    var arc = (ARCH[e.kind] && ARCH[e.kind].shield) ? ARCH[e.kind].shield.arc : 1.1;
    return d < arc;
  }

  function hitscan(S, st, pw, spreadX, spreadY) {
    var origin = playerEye(S, T2);
    var dir = aimDir(S, T3, spreadX, spreadY);
    var maxDist = st.range;
    /* clip against geometry */
    T4[0] = origin[0] + dir[0] * maxDist;
    T4[1] = origin[1] + dir[1] * maxDist;
    T4[2] = origin[2] + dir[2] * maxDist;
    var wallT = rayBoxes(S, origin, T4);
    var wallDist = wallT * maxDist;

    var pierce = st.pierce;
    var hitAny = false;
    var guard = 0;
    var searchFrom = 0;
    while (guard++ < 12) {
      var best = null, bestT = wallDist;
      for (var i = 0; i < S.enemies.length; i++) {
        var e = S.enemies[i];
        if (e.dead && e.corpseT > 0.15) { continue; }
        if (e.__pierced) { continue; }
        if (rayEnemy(S, e, origin, dir, bestT, HIT_SCRATCH)) {
          if (HIT_SCRATCH.t > searchFrom && HIT_SCRATCH.t < bestT) {
            bestT = HIT_SCRATCH.t;
            best = e;
            HIT_SCRATCH.enemy = e;
            best.__hitLoc = HIT_SCRATCH.loc;
            best.__hitPt = [HIT_SCRATCH.point[0], HIT_SCRATCH.point[1], HIT_SCRATCH.point[2]];
          }
        }
      }
      if (!best) { break; }
      hitAny = true;
      /* distance falloff */
      var dist = bestT;
      var fo = 1;
      if (st.falloffEnd > st.falloffStart) {
        fo = 1 - clamp((dist - st.falloffStart) / (st.falloffEnd - st.falloffStart), 0, 1);
        fo = 0.28 + 0.72 * fo;
      }
      var loc = best.__hitLoc;
      var hl = HITLOC[loc] || HITLOC.torso;
      var mult = hl.mult;
      if (loc === 'head' && st.headMultBonus) { mult += st.headMultBonus; }
      var crit = rnd(S) < (st.critChance * hl.crit);
      var dmg = st.damage * mult * fo * (crit ? st.critMult : 1);
      damageEnemy(S, best, dmg, 'bullet', best.__hitPt, dir, loc,
                  st.staggerPower * hl.poise * (crit ? 1.5 : 1));
      best.__pierced = true;
      if (pierce <= 0) { break; }
      pierce--;
      searchFrom = bestT + 0.01;
    }
    /* clear pierce markers */
    for (var k = 0; k < S.enemies.length; k++) { S.enemies[k].__pierced = false; }

    if (!hitAny) {
      addEffect(S, 'impact', T4, 0.4);
    }
    return hitAny;
  }

  /* =======================================================================
     13. ENEMY DAMAGE / STAGGER ECONOMY / LIMBS / MUTATION
     ======================================================================= */

  function damageEnemy(S, e, amount, type, hitPos, hitDir, loc, poisePower) {
    if (!e || e.dead) { return 0; }
    loc = loc || 'torso';
    var arch = ARCH[e.kind] || ARCH.ganado;

    if (loc === 'shield' && e.shield && !e.shield.broken) {
      e.shield.hp -= amount * 3.0;
      addEffect(S, 'spark', hitPos || e.pos, 0.25);
      emit('hit', { id: e.id, loc: 'shield', dmg: 0, shielded: true,
                    pos: hitPos ? vcopy(hitPos) : vcopy(e.pos) });
      if (e.shield.hp <= 0) {
        e.shield.broken = true;
        applyStagger(S, e, 'stumble_back', 1.4);
        emit('stagger', { id: e.id, type: 'shield_break' });
      }
      return 0;
    }

    var armor = arch.armor || 0;
    if (e.mutated) { armor *= 0.4; }
    var actual = amount * (1 - armor);
    if (e.limbs && loc === 'head' && e.limbs.head) { actual *= 1.35; }

    e.hp -= actual;
    e.lastHitT = S.time;
    e.alert = 1;
    noticePlayer(S, e, S.player.pos, 1.0);
    S.stats.damageDealt += actual;
    if (loc === 'head') { S.stats.headshots++; }

    emit('hit', { id: e.id, kind: e.kind, loc: loc, dmg: actual, hp: e.hp,
                  pos: hitPos ? vcopy(hitPos) : vcopy(e.pos),
                  dir: hitDir ? vcopy(hitDir) : null, type: type });
    addEffect(S, 'blood', hitPos || e.pos, 0.5);

    /* limb destruction */
    if (arch.limbs && e.limbs) {
      if (loc === 'limbL' || loc === 'limbR') {
        var key = (loc === 'limbL') ? 'larm' : 'rarm';
        e.limbDmg[key] += actual;
        if (!e.limbs[key] === false && e.limbDmg[key] > e.limbThreshold && !e.limbLost[key]) {
          destroyLimb(S, e, key);
        }
      }
    }

    /* poise / stagger economy */
    var pp = (poisePower !== undefined ? poisePower : amount * 0.35);
    pp *= TUNE.staggerBase / (diffOf(S).poise);
    if (e.mutated) { pp *= 0.65; }
    if (arch.boss) { pp *= 0.35; }
    e.poise -= pp;
    if (e.poise <= 0 && !e.staggered) {
      var hl = HITLOC[loc] || HITLOC.torso;
      var kind = hl.react;
      if (kind === 'shield_ring' || kind === 'weak_flinch') { kind = 'stumble_back'; }
      applyStagger(S, e, kind, 1.0);
      e.poise = e.poiseMax;
    }

    if (e.hp <= 0) {
      killEnemy(S, e, loc, type, hitDir);
    }
    return actual;
  }

  function destroyLimb(S, e, key) {
    e.limbLost[key] = true;
    e.limbs[key] = false;
    applyStagger(S, e, 'kneel', 1.1);
    emit('limb_lost', { id: e.id, limb: key });
    addEffect(S, 'gib', e.pos, 0.8);
    if (e.limbLost.larm && e.limbLost.rarm) {
      /* armless enemies charge and body-slam */
      e.armless = true;
      e.aggression = 1.8;
      e.speedMul = 1.35;
      e.canGrab = false;
      emit('enemy_armless', { id: e.id });
    }
  }

  function applyStagger(S, e, kind, scale) {
    if (e.dead) { return; }
    var dur = 1.1;
    if (kind === 'stumble_clutch') { dur = 1.55; }
    else if (kind === 'kneel') { dur = 2.0; }
    else if (kind === 'stumble_back') { dur = 1.15; }
    else if (kind === 'downed') { dur = 2.6; }
    dur *= scale || 1;
    if (e.mutated) { dur *= 0.7; }
    e.staggered = true;
    e.staggerKind = kind;
    e.staggerT = dur;
    e.state = 'Stagger';
    e.stateT = 0;
    releaseToken(S, e);
    if (e.grabbing === 'player') { releasePlayerGrab(S, e, 'stagger'); }
    if (e.grabbing === 'elena') { releaseElenaGrab(S, e, 'stagger'); }
    S.stats.staggers++;
    emit('stagger', { id: e.id, kind: e.kind, type: kind, dur: dur, pos: vcopy(e.pos) });
    offerMeleePrompt(S, e);
  }

  function offerMeleePrompt(S, e) {
    var p = S.player;
    if (!p.alive || p.grabbedBy >= 0) { return; }
    var d = distXZ(p.pos, e.pos);
    if (d > TUNE.meleeReach + 1.2) { return; }
    var kind;
    if (e.downed || e.staggerKind === 'downed') { kind = 'finisher'; }
    else if (e.staggerKind === 'kneel' && isBehind(p, e)) { kind = 'suplex'; }
    else if (e.staggerKind === 'kneel') { kind = 'roundhouse'; }
    else if (e.staggerKind === 'stumble_clutch') { kind = 'roundhouse'; }
    else { kind = 'roundhouse'; }
    p.meleePrompt = { enemyId: e.id, kind: kind, t: TUNE.meleeWindow };
    emit('melee_prompt', { id: e.id, kind: kind });
  }

  function isBehind(p, e) {
    var dx = p.pos[0] - e.pos[0], dz = p.pos[2] - e.pos[2];
    var ang = Math.atan2(dx, dz);
    return Math.abs(angleWrap(ang - e.yaw)) > 2.0;
  }

  function killEnemy(S, e, loc, type, hitDir) {
    if (e.dead) { return; }
    var arch = ARCH[e.kind] || ARCH.ganado;
    var d = diffOf(S);

    /* Plaga mutation on a killing headshot */
    if (!e.mutated && arch.mutate && loc === 'head' && type !== 'explosion') {
      var chance = d.mutChance * (1 + S.act * 0.22) * (1 + S.director.heat * 0.25);
      if (rnd(S) < clamp(chance, 0, 0.65)) {
        mutateEnemy(S, e);
        return;
      }
    }

    e.dead = true;
    e.hp = 0;
    e.corpseT = 0;
    e.state = 'Dead';
    releaseToken(S, e);
    if (e.grabbing === 'player') { releasePlayerGrab(S, e, 'killed'); }
    if (e.grabbing === 'elena') { releaseElenaGrab(S, e, 'killed'); }
    unmarkElenaHunter(S, e);
    S.stats.kills++;
    if (type === 'melee') { S.stats.meleeKills++; }
    S.player.inCombat = TUNE.combatMemory;
    emit('kill', { id: e.id, kind: e.kind, loc: loc, type: type, pos: vcopy(e.pos),
                   mutated: e.mutated });
    addEffect(S, 'death', e.pos, 1.0);
    /* reward + drops */
    var scrip = Math.round((arch.scrip || 200) * (e.mutated ? 1.4 : 1));
    S.player.scrip += scrip;
    S.stats.scripEarned += scrip;
    rollDrop(S, e);
  }

  function mutateEnemy(S, e) {
    e.mutated = true;
    e.hp = Math.max(1, Math.round((ARCH[e.kind] || ARCH.ganado).hp * 0.55));
    e.maxHp = e.hp;
    e.poiseMax = Math.round(e.poiseMax * 1.35);
    e.poise = e.poiseMax;
    e.speedMul = (e.speedMul || 1) * 1.42;
    e.aggression = (e.aggression || 1) * 1.55;
    e.staggered = false;
    e.staggerT = 0;
    e.state = 'Mutate';
    e.stateT = 0;
    e.mutateT = 0.85;
    e.canGrab = false;
    S.stats.mutations++;
    emit('mutate', { id: e.id, kind: e.kind, pos: vcopy(e.pos) });
    addEffect(S, 'burst', e.pos, 1.2);
    /* mutation heat: parasite growth ignites nearby fire */
    for (var i = 0; i < S.hazards.length; i++) {
      var hz = S.hazards[i];
      if (hz.kind === 'fire' && distXZ(hz.pos, e.pos) < hz.radius + 2.5) {
        spawnHazard(S, 'fire', e.pos, 2.0, 7.0);
        break;
      }
    }
  }

  /* =======================================================================
     14. MELEE / PARRY / GRABS (player side)
     ======================================================================= */

  function melee(S) {
    var p = S.player;
    if (!p.alive) { return false; }

    /* mash out of a grab */
    if (p.grabbedBy >= 0) { p.grabTaps++; return true; }

    if (p.meleeCooldown > 0 || p.meleeT > 0) { return false; }
    if (p.stamina < TUNE.staminaMelee * 0.5) { emit('melee_fail', { reason: 'stamina' }); return false; }

    /* parry check: any enemy currently telegraphing a grab within reach */
    var parried = null;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.dead) { continue; }
      if (e.state === 'GrabTelegraph' && e.stateT <= TUNE.parryWindow + 0.06) {
        if (distXZ(e.pos, p.pos) < 2.2) { parried = e; break; }
      }
      if (e.state === 'Windup' && e.stateT >= e.windTime * 0.55 &&
          distXZ(e.pos, p.pos) < 2.0 && rnd(S) < 0.85) {
        parried = e; break;
      }
    }

    p.stamina = Math.max(0, p.stamina - TUNE.staminaMelee);
    p.staminaLock = TUNE.staminaRegenDelay;
    p.meleeT = 0.55;
    p.meleeCooldown = 0.75;
    p.iframes = TUNE.meleeIFrames;
    p.inCombat = TUNE.combatMemory;

    if (parried) {
      p.parrySuccess = S.time;
      applyStagger(S, parried, 'stumble_clutch', 1.3);
      damageEnemy(S, parried, 45, 'melee', parried.pos, null, 'torso', 60);
      emit('parry', { id: parried.id, pos: vcopy(parried.pos) });
      makeNoise(S, p.pos, 6, 'melee');
      return true;
    }

    /* contextual finisher */
    var prompt = p.meleePrompt;
    var kind = 'kick';
    var dmg = 90;
    var radius = 2.4;
    if (prompt) {
      var pe = enemyById(S, prompt.enemyId);
      if (pe && !pe.dead && distXZ(pe.pos, p.pos) <= TUNE.meleeReach + 0.5) {
        kind = prompt.kind;
        if (kind === 'roundhouse') { dmg = 150; radius = 2.9; }
        else if (kind === 'suplex') { dmg = 260; radius = 2.0; }
        else if (kind === 'finisher') { dmg = 400; radius = 1.4; }
        p.meleePrompt = null;
        /* primary target takes the full hit */
        damageEnemy(S, pe, dmg, 'melee', pe.pos, null, kind === 'finisher' ? 'head' : 'torso',
                    260);
        if (!pe.dead && kind !== 'finisher') {
          pe.downed = true; pe.downT = 2.4;
          applyStagger(S, pe, 'downed', 1.0);
        }
      }
    }
    if (kind === 'kick') {
      dmg = 70; radius = 2.6;
    }
    /* AoE splash on everyone else in range */
    for (var j = 0; j < S.enemies.length; j++) {
      var q = S.enemies[j];
      if (q.dead) { continue; }
      if (prompt && q.id === prompt.enemyId) { continue; }
      var dd = distXZ(q.pos, p.pos);
      if (dd > radius) { continue; }
      var dot = 1;
      if (kind === 'kick' || kind === 'roundhouse') {
        var ang = Math.atan2(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]);
        dot = Math.cos(angleWrap(ang - p.yaw));
        if (dot < (kind === 'roundhouse' ? -0.4 : 0.2)) { continue; }
      }
      damageEnemy(S, q, dmg * 0.55, 'melee', q.pos, null, 'torso', 120);
      pushEnemy(S, q, p.pos, 3.2);
    }
    emit('melee', { kind: kind, pos: vcopy(p.pos) });
    makeNoise(S, p.pos, 7, 'melee');
    return true;
  }

  function pushEnemy(S, e, fromPos, force) {
    var dx = e.pos[0] - fromPos[0], dz = e.pos[2] - fromPos[2];
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    var arch = ARCH[e.kind] || ARCH.ganado;
    var m = Math.max(30, arch.mass);
    e.knock[0] += (dx / d) * force * (80 / m);
    e.knock[2] += (dz / d) * force * (80 / m);
  }

  function updatePlayerGrabbed(S, input, dt) {
    var p = S.player;
    var e = enemyById(S, p.grabbedBy);
    if (!e || e.dead) { releasePlayerGrab(S, e, 'lost'); return; }
    p.grabT += dt;
    p.anim = 'grabbed';
    if (input.qteTapped || input.meleePressed) { p.grabTaps++; }
    /* dragged toward the grabber */
    var dx = e.pos[0] - p.pos[0], dz = e.pos[2] - p.pos[2];
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.85) {
      moveEntity(S, p, (dx / d) * 1.1 * dt, (dz / d) * 1.1 * dt, p.radius, p.height);
    }
    if (p.grabTaps >= p.grabTapsNeeded) {
      S.stats.grabsEscaped++;
      applyStagger(S, e, 'stumble_back', 1.0);
      releasePlayerGrab(S, e, 'escape');
      emit('grab_escape', { id: e.id, who: 'player', taps: p.grabTaps, time: p.grabT });
      return;
    }
    if (p.grabT >= TUNE.grabMashWindow) {
      S.stats.grabsFailed++;
      damage(S, S.player, 28 + S.act * 5, 'grab', e.pos, null);
      releasePlayerGrab(S, e, 'damaged');
    }
  }

  function startPlayerGrab(S, e) {
    var p = S.player;
    if (p.grabbedBy >= 0 || p.iframes > 0 || !p.alive) { return false; }
    p.grabbedBy = e.id;
    p.grabT = 0;
    p.grabTaps = 0;
    p.grabTapsNeeded = diffOf(S).mash;
    p.sprinting = false;
    p.speed = 0;
    e.grabbing = 'player';
    e.state = 'Grabbing';
    e.stateT = 0;
    S.elena.fear = clamp(S.elena.fear + 0.28, 0, 1);
    emit('grab_start', { id: e.id, who: 'player', taps: p.grabTapsNeeded });
    return true;
  }

  function releasePlayerGrab(S, e, reason) {
    var p = S.player;
    p.grabbedBy = -1;
    p.grabT = 0;
    p.grabTaps = 0;
    p.iframes = Math.max(p.iframes, 0.45);
    if (e) {
      e.grabbing = null;
      e.grabCooldown = 3.0;
      if (e.state === 'Grabbing') { e.state = 'Chase'; e.stateT = 0; }
    }
    emit('grab_end', { who: 'player', reason: reason });
  }

  /* =======================================================================
     15. PROJECTILES / EXPLOSIONS / HAZARDS
     ======================================================================= */

  function spawnProjectile(S, kind, pos, dir, speed, dmg, st) {
    if (S.projectiles.length >= TUNE.projectileCap) { S.projectiles.shift(); }
    var pr = {
      id: S.nextId++, kind: kind,
      pos: [pos[0], pos[1] + 1.3, pos[2]],
      vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed],
      dmg: dmg, life: 6.0, t: 0,
      gravity: (kind === 'acid' || kind === 'grenade' || kind === 'brick' ||
                kind === 'bottle') ? -9.8 : 0,
      blast: st ? (st.blastRadius || 0) : 0,
      impulse: st ? (st.impulse || 0) : 0,
      blind: st ? (st.blind || 0) : 0,
      stagger: st ? (st.staggerPower || 0) : 0,
      fuse: -1, owner: 'player', radius: 0.12
    };
    S.projectiles.push(pr);
    return pr;
  }

  function throwGrenade(S, st) {
    var p = S.player;
    var dir = aimDir(S, T3, 0, 0);
    var pr = spawnProjectile(S, st.id === 'flashbang' ? 'flashbang' : 'grenade',
                             p.pos, dir, 14, st.damage, st);
    pr.gravity = -9.8;
    pr.fuse = 1.6;
    pr.radius = 0.14;
    return pr;
  }

  function updateProjectiles(S, dt) {
    for (var i = S.projectiles.length - 1; i >= 0; i--) {
      var pr = S.projectiles[i];
      pr.t += dt;
      pr.life -= dt;
      if (pr.gravity) { pr.vel[1] += pr.gravity * dt; }
      var ox = pr.pos[0], oy = pr.pos[1], oz = pr.pos[2];
      pr.pos[0] += pr.vel[0] * dt;
      pr.pos[1] += pr.vel[1] * dt;
      pr.pos[2] += pr.vel[2] * dt;
      sanitizeVec(pr.pos);

      var exploded = false;
      /* world collision */
      T0[0] = ox; T0[1] = oy; T0[2] = oz;
      var tHit = rayBoxes(S, T0, pr.pos);
      var ground = navSampleHeight(S, pr.pos[0], pr.pos[2]);
      if (pr.pos[1] <= ground + 0.05) {
        pr.pos[1] = ground + 0.05;
        if (pr.fuse > 0) {
          /* bounce */
          pr.vel[1] = Math.abs(pr.vel[1]) * 0.34;
          pr.vel[0] *= 0.6; pr.vel[2] *= 0.6;
        } else {
          exploded = true;
        }
      } else if (tHit < 1) {
        if (pr.fuse > 0) {
          pr.vel[0] *= -0.35; pr.vel[2] *= -0.35;
          pr.pos[0] = ox; pr.pos[2] = oz;
        } else {
          exploded = true;
        }
      }

      /* actor collision */
      if (!exploded && pr.owner === 'player') {
        for (var j = 0; j < S.enemies.length; j++) {
          var e = S.enemies[j];
          if (e.dead) { continue; }
          if (distXZ2(e.pos, pr.pos) < (e.radius + pr.radius) * (e.radius + pr.radius) &&
              pr.pos[1] > e.pos[1] - 0.2 && pr.pos[1] < e.pos[1] + e.height) {
            if (pr.blast > 0) { exploded = true; }
            else {
              damageEnemy(S, e, pr.dmg, 'projectile', pr.pos, pr.vel, 'torso', pr.stagger);
              S.projectiles.splice(i, 1);
            }
            break;
          }
        }
      } else if (!exploded && pr.owner === 'enemy') {
        var pl = S.player;
        if (distXZ2(pl.pos, pr.pos) < 0.42 * 0.42 &&
            pr.pos[1] > pl.pos[1] - 0.2 && pr.pos[1] < pl.pos[1] + pl.height) {
          damage(S, S.player, pr.dmg, pr.kind === 'acid' ? 'acid' : 'bullet', pr.pos, pr.vel);
          if (pr.kind === 'acid') { S.player.poisoned = 3.0; }
          if (pr.blast > 0) { exploded = true; }
          else { S.projectiles.splice(i, 1); continue; }
        } else if (S.elena.alive && distXZ2(S.elena.pos, pr.pos) < 0.40 * 0.40 &&
                   pr.pos[1] > S.elena.pos[1] - 0.2 && pr.pos[1] < S.elena.pos[1] + S.elena.height) {
          damage(S, S.elena, pr.dmg * 0.7, 'acid', pr.pos, pr.vel);
          S.projectiles.splice(i, 1); continue;
        }
      }

      if (pr.fuse > 0) {
        pr.fuse -= dt;
        if (pr.fuse <= 0) { exploded = true; }
      }
      if (pr.life <= 0) { exploded = pr.blast > 0; }

      if (exploded) {
        if (pr.blast > 0) {
          explode(S, pr.pos, pr.blast, pr.dmg, pr.impulse, pr.blind, pr.owner);
        }
        if (i < S.projectiles.length && S.projectiles[i] === pr) { S.projectiles.splice(i, 1); }
      } else if (pr.life <= 0) {
        S.projectiles.splice(i, 1);
      }
    }
  }

  function explode(S, pos, radius, dmg, impulse, blind, owner) {
    emit('explosion', { pos: vcopy(pos), radius: radius, blind: blind > 0 });
    addEffect(S, blind > 0 ? 'flash' : 'explosion', pos, 1.4);
    makeNoise(S, pos, 90, 'explosion');
    var i;
    for (i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.dead) { continue; }
      var d = vdist(e.pos, pos);
      if (d > radius) { continue; }
      if (!hasLOS(S, pos, e.pos)) { d *= 1.6; if (d > radius) { continue; } }
      var fall = 1 - clamp(d / radius, 0, 1);
      fall = fall * fall;
      if (blind > 0) {
        e.blinded = blind * fall;
        applyStagger(S, e, 'stumble_back', 1.2);
        damageEnemy(S, e, dmg * fall, 'explosion', e.pos, null, 'torso', 200 * fall);
      } else {
        damageEnemy(S, e, dmg * fall, 'explosion', e.pos, null, 'torso', 220 * fall);
        pushEnemy(S, e, pos, impulse * fall);
      }
    }
    /* player self-damage (only from own explosives if very close) */
    var pd = vdist(S.player.pos, pos);
    if (pd < radius && blind <= 0) {
      var pf = 1 - clamp(pd / radius, 0, 1);
      if (owner === 'enemy' || pf > 0.55) {
        damage(S, S.player, dmg * pf * (owner === 'player' ? 0.35 : 1), 'explosion', pos, null);
      }
    }
    if (blind > 0 && pd < radius) {
      S.player.blinded = Math.max(S.player.blinded, blind * 0.35 * (1 - pd / radius));
    }
    /* elena is never harmed by player ordnance, but is scared by it */
    if (vdist(S.elena.pos, pos) < radius * 1.5) {
      S.elena.fear = clamp(S.elena.fear + 0.12, 0, 1);
    }
    /* props take physics impulse */
    for (i = 0; i < S.props.length; i++) {
      var pr = S.props[i];
      if (pr.static) { continue; }
      var dp = vdist(pr.pos, pos);
      if (dp > radius * 1.3) { continue; }
      var f = (1 - clamp(dp / (radius * 1.3), 0, 1)) * impulse;
      var dx = pr.pos[0] - pos[0], dy = pr.pos[1] - pos[1] + 0.4, dz = pr.pos[2] - pos[2];
      var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var m = Math.max(4, pr.mass || 40);
      pr.vel[0] += (dx / dl) * f * (40 / m);
      pr.vel[1] += (dy / dl) * f * (40 / m) * 0.6;
      pr.vel[2] += (dz / dl) * f * (40 / m);
      pr.hp -= dmg * (1 - clamp(dp / radius, 0, 1));
      if (pr.hp <= 0 && !pr.broken) {
        pr.broken = true;
        emit('prop_break', { id: pr.id, kind: pr.kind, pos: vcopy(pr.pos) });
        if (pr.kind === 'barrel_fuel') { spawnHazard(S, 'fire', pr.pos, 2.6, 12); }
        if (pr.kind === 'barrel_explosive') {
          explode(S, pr.pos, 5.0, 200, 10, 0, owner);
        }
      }
    }
    if (blind <= 0) { spawnHazard(S, 'fire', pos, radius * 0.35, 3.5); }
  }

  function spawnHazard(S, kind, pos, radius, dur) {
    if (S.hazards.length > 48) { S.hazards.shift(); }
    S.hazards.push({
      id: S.nextId++, kind: kind, pos: vcopy(pos), radius: radius,
      t: 0, dur: dur, dps: kind === 'fire' ? 28 : (kind === 'electric' ? 55 : 10),
      spreadT: 0
    });
  }

  function updateHazards(S, dt) {
    for (var i = S.hazards.length - 1; i >= 0; i--) {
      var hz = S.hazards[i];
      hz.t += dt;
      if (hz.t >= hz.dur) { S.hazards.splice(i, 1); continue; }
      var j;
      for (j = 0; j < S.enemies.length; j++) {
        var e = S.enemies[j];
        if (e.dead) { continue; }
        if (distXZ(e.pos, hz.pos) < hz.radius) {
          damageEnemy(S, e, hz.dps * dt, hz.kind, e.pos, null, 'torso', 4 * dt);
          if (hz.kind === 'fire') { e.burning = 1.5; }
          if (hz.kind === 'electric') { e.stunned = Math.max(e.stunned || 0, 0.4); }
        }
      }
      if (distXZ(S.player.pos, hz.pos) < hz.radius) {
        damage(S, S.player, hz.dps * 0.55 * dt, hz.kind, hz.pos, null);
      }
      /* Elena never walks into hazards - handled in path validation */
      /* fire spreads toward mutated (parasite) growth */
      if (hz.kind === 'fire') {
        hz.spreadT += dt;
        if (hz.spreadT > 1.2) {
          hz.spreadT = 0;
          for (j = 0; j < S.enemies.length; j++) {
            var m = S.enemies[j];
            if (m.dead || !m.mutated) { continue; }
            var dd = distXZ(m.pos, hz.pos);
            if (dd < hz.radius + 2.2 && dd > hz.radius * 0.5 && S.hazards.length < 40) {
              spawnHazard(S, 'fire', m.pos, 1.8, 5.0);
              break;
            }
          }
        }
      }
      /* electrified water: any water hazard adjacent to an electric source */
      if (hz.kind === 'electric' && S.level && S.level.collision && S.level.collision.water) {
        /* radius follows the water volume it sits in */
        var waters = S.level.collision.water;
        for (j = 0; j < waters.length; j++) {
          var w = waters[j];
          if (!w.min || !w.max) { continue; }
          if (hz.pos[0] > w.min[0] && hz.pos[0] < w.max[0] &&
              hz.pos[2] > w.min[2] && hz.pos[2] < w.max[2]) {
            hz.radius = Math.max(hz.radius,
              Math.min(18, Math.max(w.max[0] - w.min[0], w.max[2] - w.min[2]) * 0.5));
            break;
          }
        }
      }
    }
  }

  function electrifyWater(S, pos, dur) {
    spawnHazard(S, 'electric', pos, 3.0, dur || 5.0);
  }

  /* =======================================================================
     16. EFFECTS / NOISE / PROPS
     ======================================================================= */

  function addEffect(S, kind, pos, life) {
    if (S.effects.length >= TUNE.effectCap) { S.effects.shift(); }
    S.effects.push({ kind: kind, pos: [pos[0], pos[1], pos[2]], t: 0, life: life || 0.5 });
  }

  function updateEffects(S, dt) {
    for (var i = S.effects.length - 1; i >= 0; i--) {
      var f = S.effects[i];
      f.t += dt;
      if (f.t >= f.life) { S.effects.splice(i, 1); }
    }
  }

  function makeNoise(S, pos, loudness, kind) {
    if (loudness <= 0) { return; }
    var sq = S.squad;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.dead) { continue; }
      var arch = ARCH[e.kind] || ARCH.ganado;
      var d = distXZ(e.pos, pos);
      var hearRange = Math.min(arch.hearing * (loudness / 24 + 0.35), loudness * 1.4);
      if (kind === 'gunshot' || kind === 'explosion') { hearRange = loudness * 0.9; }
      if (d < hearRange) {
        e.heardT = S.time;
        e.heardPos[0] = pos[0]; e.heardPos[1] = pos[1]; e.heardPos[2] = pos[2];
        if (e.alert < 0.55) { e.alert = 0.55; }
        if (e.state === 'Idle' || e.state === 'Patrol') {
          e.state = 'Investigate'; e.stateT = 0;
        }
      }
    }
    if (kind === 'gunshot' || kind === 'explosion') {
      sq.alert = Math.min(1, sq.alert + 0.25);
      sq.alertT = S.time;
      S.elena.stress.gunfire = Math.min(1, S.elena.stress.gunfire + 0.30);
    }
  }

  function updateProps(S, dt) {
    for (var i = 0; i < S.props.length; i++) {
      var p = S.props[i];
      if (p.static) { continue; }
      if (p.vel[0] === 0 && p.vel[1] === 0 && p.vel[2] === 0) { continue; }
      p.vel[1] += TUNE.gravity * dt;
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
      var g = navSampleHeight(S, p.pos[0], p.pos[2]);
      if (p.pos[1] <= g) {
        p.pos[1] = g;
        p.vel[1] = 0;
        p.vel[0] *= 0.65; p.vel[2] *= 0.65;
        if (Math.abs(p.vel[0]) < 0.05 && Math.abs(p.vel[2]) < 0.05) {
          p.vel[0] = 0; p.vel[2] = 0;
        }
      }
      var b = levelBounds(S);
      p.pos[0] = clamp(p.pos[0], b.min[0], b.max[0]);
      p.pos[2] = clamp(p.pos[2], b.min[2], b.max[2]);
      sanitizeVec(p.pos); sanitizeVec(p.vel);
    }
  }

  function addProp(S, kind, pos, opts) {
    var p = {
      id: S.nextId++, kind: kind, pos: vcopy(pos), vel: v3(0, 0, 0),
      mass: (opts && opts.mass) || 40, hp: (opts && opts.hp) || 40,
      broken: false, static: !!(opts && opts.static),
      tag: (opts && opts.tag) || null, used: false
    };
    S.props.push(p);
    return p;
  }

  /* ======================================================================
     SECTION -- LOOKUPS AND SQUAD RESOURCES
     ====================================================================== */

  function enemyById(S, id) {
    if (id === undefined || id === null || id < 0) { return null; }
    for (var i = 0; i < S.enemies.length; i++) {
      if (S.enemies[i].id === id) { return S.enemies[i]; }
    }
    return null;
  }

  /* --- attack tokens ---------------------------------------------------
     Only a few enemies may be committed to attacking at once; the rest
     circle and reposition. This is what makes a crowd of twelve feel
     dangerous without being an unsurvivable pile-on. */
  function tokenBudget(S) {
    return Math.max(1, (S.squad.maxTokens || 3) + (S.director.tokenBonus || 0));
  }
  function hasToken(S, e) { return S.squad.tokens.indexOf(e.id) >= 0; }
  function acquireToken(S, e) {
    var t = S.squad.tokens;
    if (t.indexOf(e.id) >= 0) { return true; }
    var cost = (ARCH[e.kind] || ARCH.ganado).tokenCost || 1;
    if (t.length + cost - 1 >= tokenBudget(S)) { return false; }
    for (var c = 0; c < cost; c++) { t.push(e.id); }
    e.hasToken = true;
    return true;
  }
  function releaseToken(S, e) {
    if (!e) { return; }
    var t = S.squad.tokens, i;
    for (i = t.length - 1; i >= 0; i--) { if (t[i] === e.id) { t.splice(i, 1); } }
    e.hasToken = false;
  }
  function pruneTokens(S) {
    var t = S.squad.tokens, i, e;
    for (i = t.length - 1; i >= 0; i--) {
      e = enemyById(S, t[i]);
      if (!e || e.dead || e.state === 'Stagger') { t.splice(i, 1); }
    }
  }

  /* --- Elena hunters: a capped subset actively goes for her ------------- */
  function markElenaHunter(S, e) {
    var h = S.squad.elenaHunters;
    if (h.indexOf(e.id) >= 0) { return true; }
    if (h.length >= (S.squad.maxElenaHunters || 2)) { return false; }
    h.push(e.id);
    e.huntingElena = true;
    /* telegraph it so the player can react rather than be ambushed */
    emit('callout', { kind: 'elena_targeted', pos: vcopy(e.pos), id: e.id });
    return true;
  }
  function unmarkElenaHunter(S, e) {
    if (!e) { return; }
    var h = S.squad.elenaHunters, i = h.indexOf(e.id);
    if (i >= 0) { h.splice(i, 1); }
    e.huntingElena = false;
  }

  function noticePlayer(S, e, pos, confidence) {
    e.alert = Math.max(e.alert || 0, confidence || 1);
    e.lastSeenT = S.time;
    vset(e.lastSeen, pos[0], pos[1], pos[2]);
    if (e.state === 'Idle' || e.state === 'Patrol' || e.state === 'Ambush') {
      e.state = 'Chase'; e.stateT = 0;
    }
    /* propagate through the squad blackboard */
    var sq = S.squad;
    if (!sq.hasContact || S.time - sq.lastKnownT > 0.5) {
      sq.hasContact = true;
      sq.lastKnownT = S.time;
      vset(sq.lastKnown, pos[0], pos[1], pos[2]);
      sq.alert = 1;
    }
  }

  function trackWeaponUsage(S, id) {
    var u = S.director.usage;
    u[id] = (u[id] || 0) + 1;
    var best = null, bestN = -1, k;
    for (k in u) {
      if (Object.prototype.hasOwnProperty.call(u, k) && u[k] > bestN) { bestN = u[k]; best = k; }
    }
    if (best) { S.director.preferredAmmo = WEAPON_AMMO[best] || 'pistol'; }
  }

  /* ======================================================================
     SECTION -- DROPS
     ====================================================================== */
  /* weapon id -> ammo reserve key -> the inventory item that feeds it */
  var WEAPON_AMMO = {
    pistol: 'pistol', magnum: 'magnum', shotgun: 'shell', smg: 'smg',
    rifle: 'rifle', grenade: 'grenade', flashbang: 'flash', launcher: 'rocket'
  };
  var AMMO_ITEM = {};
  (function () {
    for (var k in ITEMS) {
      if (Object.prototype.hasOwnProperty.call(ITEMS, k) && ITEMS[k].kind === 'ammo') {
        AMMO_ITEM[ITEMS[k].ammo] = k;
      }
    }
  })();

  function rollDrop(S, e) {
    var d = diffOf(S), bias = S.director.dropBias;
    var roll = rnd(S);
    var arch = ARCH[e.kind] || ARCH.ganado;
    S.player.scrip += Math.round((arch.scrip || 100) * 0.12 * d.scripMul);

    var pAmmo = 0.30 * bias.ammo, pHeal = 0.12 * bias.heal;
    var pRes = 0.16 * bias.resource, pTreasure = 0.07 * bias.treasure;
    var total = pAmmo + pHeal + pRes + pTreasure;
    if (roll > Math.min(0.85, total)) { return null; }

    var kind, itemId;
    if (roll < pAmmo) {
      kind = 'ammo';
      itemId = AMMO_ITEM[S.director.preferredAmmo] || 'a_pistol';
    } else if (roll < pAmmo + pHeal) {
      kind = 'heal'; itemId = rnd(S) < 0.6 ? 'herb_g' : 'herb_r';
    } else if (roll < pAmmo + pHeal + pRes) {
      kind = 'resource'; itemId = rnd(S) < 0.5 ? 'gunpowder' : 'resource_s';
    } else {
      kind = 'treasure'; itemId = rnd(S) < 0.6 ? 't_rosary' : 't_censer';
    }
    if (!ITEMS[itemId]) { return null; }
    var pick = {
      id: S.nextId++, item: itemId, kind: kind,
      pos: v3(e.pos[0] + (rnd(S) - 0.5) * 0.5, e.pos[1] + 0.1, e.pos[2] + (rnd(S) - 0.5) * 0.5),
      qty: kind === 'ammo' ? rint(S, 6, 14) : 1, t: 0
    };
    S.pickups.push(pick);
    emit('drop', { pos: vcopy(pick.pos), kind: kind, item: itemId });
    return pick;
  }

  /* ======================================================================
     SECTION -- ENEMY SPAWNING
     ====================================================================== */
  var ACT_INDEX = { prologue: 0, act1: 1, act2: 2, act3: 3 };
  function actIndex(S) {
    var a = S.act;
    if (typeof a === 'number') { return a; }
    return ACT_INDEX[a] === undefined ? 0 : ACT_INDEX[a];
  }

  function spawnEnemy(S, kind, pos, opts) {
    opts = opts || {};
    var arch = ARCH[kind] || ARCH.ganado;
    var d = diffOf(S);
    /* enemy toughness scales only with act; difficulty is expressed through
       damage, token count and aggression, not through HP sponges */
    var hp = arch.hp * (1 + actIndex(S) * 0.06);
    var e = {
      id: S.nextId++, kind: kind,
      pos: v3(pos[0], pos[1], pos[2]), vel: v3(0, 0, 0), yaw: opts.yaw || 0,
      hp: hp, maxHp: hp, poise: arch.poise, maxPoise: arch.poise,
      radius: arch.radius, height: arch.height,
      speed: 0, anim: 'idle', animT: 0,
      state: opts.state || 'Idle', stateT: 0,
      alert: 0, lastSeen: v3(pos[0], pos[1], pos[2]), lastSeenT: -99,
      path: [], pathI: 0, repathT: 0,
      attackT: 0, windT: 0, recoverT: 0, burstLeft: 0, fireCD: 0,
      staggered: false, staggerKind: null, staggerT: 0,
      grabbing: null, grabT: 0,
      hasToken: false, huntingElena: false,
      mutated: false, corpseT: 0, dead: false,
      lastHitT: -99, circleDir: rnd(S) < 0.5 ? -1 : 1, circleT: 0,
      heardPos: v3(pos[0], pos[1], pos[2]), heardT: -99, distracted: 0,
      limbs: arch.limbs ? { larm: false, rarm: false, head: false } : null,
      shield: arch.shield ? { hp: arch.shield.hp, arc: arch.shield.arc, broken: false } : null,
      phase: 0, phaseT: 0, weakpointT: 0,
      from: opts.from || 'ground', spawnT: 0,
      section: S.section
    };
    if (e.from === 'ceiling') { e.state = 'Ambush'; }
    S.enemies.push(e);
    emit('spawn', { id: e.id, kind: kind, pos: vcopy(e.pos) });
    return e;
  }

  /* Pull spawn markers out of the level and arm them against triggers. */
  function armSpawners(S) {
    S.spawners.length = 0;
    var sec = currentSection(S);
    if (!sec || !sec.spawns) { return; }
    for (var i = 0; i < sec.spawns.length; i++) {
      var sp = sec.spawns[i];
      S.spawners.push({
        kind: sp.kind, pos: sp.pos, wave: sp.wave || 0,
        trigger: sp.trigger || null, from: sp.from || 'ground',
        fired: false, delay: (sp.wave || 0) * 4.5 + rnd(S) * 1.5
      });
    }
  }

  function updateSpawners(S, dt) {
    var maxAlive = Math.round(10 * diffOf(S).spawnMul * S.director.spawnMul);
    var alive = 0, i;
    for (i = 0; i < S.enemies.length; i++) { if (!S.enemies[i].dead) { alive++; } }
    for (i = 0; i < S.spawners.length; i++) {
      var sp = S.spawners[i];
      if (sp.fired) { continue; }
      if (sp.trigger && !S.flags[sp.trigger]) { continue; }
      if (sp.trigger) { sp.delay -= dt; if (sp.delay > 0) { continue; } }
      else if (distXZ(S.player.pos, sp.pos) > 42) { continue; }
      if (alive >= maxAlive) { break; }
      /* never pop an enemy into existence in the player's face */
      var dToPlayer = distXZ(S.player.pos, sp.pos);
      if (dToPlayer < 6 && hasLOS(S, S.player.pos, sp.pos)) { continue; }
      spawnEnemy(S, sp.kind, sp.pos, { from: sp.from });
      sp.fired = true;
      alive++;
    }
  }

  /* ======================================================================
     SECTION -- ENEMY PERCEPTION AND AI
     ====================================================================== */
  var _pv = v3(0, 0, 0), _pv2 = v3(0, 0, 0), _pathTmp = [];

  function canSee(S, e, targetPos) {
    var arch = ARCH[e.kind] || ARCH.ganado;
    var dx = targetPos[0] - e.pos[0], dz = targetPos[2] - e.pos[2];
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > arch.sight) { return false; }
    if (dist > 0.4) {
      var facing = Math.atan2(dx, dz);
      var diff = Math.abs(angleWrap(facing - e.yaw));
      if (diff > arch.fov * 0.5) { return false; }
    }
    _pv[0] = e.pos[0]; _pv[1] = e.pos[1] + e.height * 0.82; _pv[2] = e.pos[2];
    _pv2[0] = targetPos[0]; _pv2[1] = targetPos[1] + 1.2; _pv2[2] = targetPos[2];
    return hasLOS(S, _pv, _pv2);
  }

  function updatePerception(S, e, dt) {
    var arch = ARCH[e.kind] || ARCH.ganado;
    var p = S.player;
    var sees = p.alive && canSee(S, e, p.pos);
    /* proximity awareness: you cannot sneak past someone at arm's length */
    if (!sees && p.alive && distXZ(e.pos, p.pos) < 3.2) {
      _pv[0] = e.pos[0]; _pv[1] = e.pos[1] + e.height * 0.7; _pv[2] = e.pos[2];
      _pv2[0] = p.pos[0]; _pv2[1] = p.pos[1] + 1.1; _pv2[2] = p.pos[2];
      if (hasLOS(S, _pv, _pv2)) { sees = true; }
    }
    if (sees) {
      noticePlayer(S, e, p.pos, 1);
      e.alert = 1;
    } else {
      e.alert = Math.max(0, (e.alert || 0) - dt * 0.16);
      /* fall back to squad knowledge before giving up entirely */
      if (e.alert < 0.4 && S.squad.hasContact && S.time - S.squad.lastKnownT < 8) {
        vset(e.lastSeen, S.squad.lastKnown[0], S.squad.lastKnown[1], S.squad.lastKnown[2]);
        e.alert = Math.max(e.alert, 0.55);
      }
    }
    /* hearing */
    if (S.time - p.lastNoiseT < 0.35) {
      var nd = distXZ(e.pos, p.pos);
      if (nd < arch.hearing * (p.lastNoiseLoud || 1)) {
        noticePlayer(S, e, p.pos, 0.7);
      }
    }
    return sees;
  }

  function faceToward(e, tx, tz, rate, dt) {
    var want = Math.atan2(tx - e.pos[0], tz - e.pos[2]);
    e.yaw = turnToward(e.yaw, want, rate * dt);
  }

  function stepAlongPath(S, e, dt, speed) {
    if (!e.path.length || e.pathI >= e.path.length) { return false; }
    var node = e.path[e.pathI];
    var dx = node[0] - e.pos[0], dz = node[2] - e.pos[2];
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.45) {
      e.pathI++;
      if (e.pathI >= e.path.length) { return false; }
      return true;
    }
    var inv = 1 / (d || 1);
    var mx = dx * inv * speed * dt, mz = dz * inv * speed * dt;
    moveEntity(S, e, mx, mz, e.radius, e.height);
    e.speed = speed;
    faceToward(e, node[0], node[2], 7.0, dt);
    return true;
  }

  function repath(S, e, target, dt, interval) {
    e.repathT -= dt;
    if (e.repathT <= 0 || !e.path.length) {
      e.repathT = interval || (0.45 + rnd(S) * 0.3);
      navFindPath(S, e.pos, target, _pathTmp);
      e.path.length = 0;
      for (var i = 0; i < _pathTmp.length; i++) { e.path.push(_pathTmp[i]); }
      e.pathI = 0;
    }
  }

  function enemyAttack(S, e, dt) {
    var arch = ARCH[e.kind] || ARCH.ganado;
    var target = e.huntingElena && S.elena.alive ? S.elena : S.player;
    var d = distXZ(e.pos, target.pos);
    faceToward(e, target.pos[0], target.pos[2], 5.5, dt);

    if (e.windT > 0) {
      e.windT -= dt;
      e.anim = 'melee';
      if (e.windT <= 0) {
        /* the swing lands */
        if (distXZ(e.pos, target.pos) <= arch.reach + 0.55) {
          var dirx = target.pos[0] - e.pos[0], dirz = target.pos[2] - e.pos[2];
          var dl = Math.sqrt(dirx * dirx + dirz * dirz) || 1;
          if (target === S.player) {
            damage(S, S.player, arch.dmg, 'melee', target.pos, [dirx / dl, 0, dirz / dl]);
          } else {
            damageElena(S, arch.dmg * 0.75, 'melee');
          }
        }
        e.recoverT = arch.attackRec;
      }
      return;
    }
    if (e.recoverT > 0) {
      e.recoverT -= dt;
      if (e.recoverT <= 0) { e.state = 'Circle'; e.stateT = 0; releaseToken(S, e); }
      return;
    }
    /* grab attempt instead of a swing */
    if (arch.grab && d <= (arch.grabRange || 1.2) && rnd(S) < (arch.grabChance || 0.3) * dt * 3) {
      if (target === S.player && S.player.grabbedBy < 0) {
        startPlayerGrab(S, e);
        return;
      }
      if (target === S.elena && S.elena.grabbedBy < 0) {
        startElenaGrab(S, e);
        return;
      }
    }
    if (d <= arch.reach) {
      e.windT = arch.attackWind;
      e.anim = 'melee';
      emit('enemy_attack', { id: e.id, kind: e.kind, pos: vcopy(e.pos) });
    } else if (d > arch.reach + 2.5) {
      e.state = 'Chase'; e.stateT = 0;
    } else {
      /* Inside the commit band but not yet in reach: close the gap. Without
         this the enemy stands still holding an attack token and the fight
         quietly stalls. */
      var cx = target.pos[0] - e.pos[0], cz = target.pos[2] - e.pos[2];
      var cl = Math.sqrt(cx * cx + cz * cz) || 1;
      var closeSpeed = arch.speed * 0.95;
      moveEntity(S, e, cx / cl * closeSpeed * dt, cz / cl * closeSpeed * dt, e.radius, e.height);
      e.speed = closeSpeed;
      e.anim = 'walk';
    }
  }

  function enemyRanged(S, e, dt) {
    var arch = ARCH[e.kind] || ARCH.ganado;
    var target = S.player;
    var d = distXZ(e.pos, target.pos);
    faceToward(e, target.pos[0], target.pos[2], 3.4, dt);
    e.fireCD -= dt;

    /* hold a preferred stand-off band */
    if (d < (arch.minRange || 6)) {
      repath(S, e, target.pos, dt, 0.7);
      var away = [e.pos[0] * 2 - target.pos[0], e.pos[1], e.pos[2] * 2 - target.pos[2]];
      navFindPath(S, e.pos, away, _pathTmp);
      e.path.length = 0;
      for (var i = 0; i < _pathTmp.length; i++) { e.path.push(_pathTmp[i]); }
      e.pathI = 0;
      stepAlongPath(S, e, dt, arch.speed);
      e.anim = 'walk';
      return;
    }
    if (d > (arch.preferredRange || 12) + 4) {
      repath(S, e, target.pos, dt, 0.6);
      stepAlongPath(S, e, dt, arch.speed);
      e.anim = 'walk';
      return;
    }
    e.speed = 0;
    e.anim = 'aim';
    if (e.fireCD <= 0 && canSee(S, e, target.pos)) {
      e.fireCD = arch.ranged ? (arch.burst ? 1.9 : 2.6) : 3;
      e.anim = 'fire';
      _pv[0] = e.pos[0]; _pv[1] = e.pos[1] + e.height * 0.75; _pv[2] = e.pos[2];
      var dx = target.pos[0] - _pv[0], dy = (target.pos[1] + 1.1) - _pv[1], dz = target.pos[2] - _pv[2];
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      spawnProjectile(S, {
        owner: e.id, hostile: true,
        pos: _pv, dir: [dx / l, dy / l, dz / l],
        speed: arch.projSpeed || 20, dmg: arch.dmg,
        kind: e.kind === 'spitter' ? 'acid' : 'bullet',
        arc: arch.projArc || 0
      });
      emit('enemy_fire', { id: e.id, kind: e.kind, pos: vcopy(_pv) });
    }
  }

  function updateEnemy(S, e, dt) {
    var arch = ARCH[e.kind] || ARCH.ganado;
    e.stateT += dt;
    e.animT += dt;
    e.speed = 0;

    if (e.dead) {
      e.corpseT += dt;
      e.anim = 'death';
      return;
    }
    /* poise recovers so a stagger has to be re-earned */
    if (e.poise < e.maxPoise) {
      e.poise = Math.min(e.maxPoise, e.poise + TUNE.poiseRegen * dt);
    }
    if (e.staggered) {
      e.staggerT -= dt;
      e.anim = 'stagger';
      if (e.staggerT <= 0) {
        e.staggered = false;
        e.state = 'Chase'; e.stateT = 0;
        e.poise = e.maxPoise * 0.6;
      }
      return;
    }
    if (e.grabbing) { e.anim = 'melee'; return; }

    var sees = updatePerception(S, e, dt);
    var target = (e.huntingElena && S.elena.alive) ? S.elena : S.player;
    var dist = distXZ(e.pos, target.pos);

    /* boss phase transitions */
    if (arch.boss) {
      var frac = e.hp / e.maxHp;
      var wantPhase = frac < 0.33 ? 2 : (frac < 0.68 ? 1 : 0);
      if (wantPhase > e.phase) {
        e.phase = wantPhase;
        e.state = 'Mutate'; e.stateT = 0;
        e.anim = 'mutate';
        emit('boss_phase', { id: e.id, phase: e.phase });
      }
      if (e.state === 'Mutate') {
        e.anim = 'mutate';
        if (e.stateT > 2.5) { e.state = 'Chase'; e.stateT = 0; }
        return;
      }
    }

    switch (e.state) {
      case 'Ambush':
        e.anim = 'idle';
        if (dist < 8 && sees) {
          e.state = 'Chase'; e.stateT = 0;
          emit('ambush', { id: e.id, pos: vcopy(e.pos) });
        }
        break;

      case 'Idle':
      case 'Patrol':
        e.anim = 'idle';
        /* Sweep the head around instead of staring at one wall forever -
           otherwise an enemy spawned facing away never notices anything and
           the encounter silently never happens. */
        e.scanT = (e.scanT || 0) + dt;
        if (e.scanT > 2.2) {
          e.scanT = 0;
          e.scanTarget = e.yaw + (rnd(S) - 0.5) * 2.4;
        }
        if (e.scanTarget !== undefined) {
          e.yaw = turnToward(e.yaw, e.scanTarget, 1.3 * dt);
        }
        if (e.alert > 0.3) { e.state = 'Chase'; e.stateT = 0; }
        else if (S.time - (e.heardT || -99) < 6) { e.state = 'Investigate'; e.stateT = 0; }
        break;

      case 'Investigate':
        e.anim = 'walk';
        repath(S, e, e.heardPos, dt, 0.8);
        stepAlongPath(S, e, dt, arch.speed * 0.8);
        if (e.alert > 0.3) { e.state = 'Chase'; e.stateT = 0; }
        else if (e.stateT > 10 || distXZ(e.pos, e.heardPos) < 1.5) {
          e.state = 'Idle'; e.stateT = 0; e.heardT = -99;
        }
        break;

      case 'Chase':
        e.anim = dist > 9 ? 'run' : 'walk';
        /* decide who to chase: a capped few peel off toward Elena */
        if (!e.huntingElena && S.elena.alive && rnd(S) < dt * 0.35 &&
            distXZ(e.pos, S.elena.pos) < distXZ(e.pos, S.player.pos) * 1.35) {
          markElenaHunter(S, e);
        }
        repath(S, e, target.pos, dt, 0.5);
        var chaseSpeed = (dist > 7 ? arch.sprint : arch.speed) * S.director.aggression;
        stepAlongPath(S, e, dt, chaseSpeed);
        e.anim = chaseSpeed > arch.speed * 1.3 ? 'run' : 'walk';
        if (arch.ranged) { e.state = 'Ranged'; e.stateT = 0; break; }
        if (dist <= arch.reach + 0.6) {
          if (acquireToken(S, e)) { e.state = 'Attack'; e.stateT = 0; }
          else { e.state = 'Circle'; e.stateT = 0; }
        }
        break;

      case 'Circle':
        /* no token: orbit at threat distance and look for an opening */
        e.anim = 'walk';
        e.circleT += dt;
        var ang = Math.atan2(e.pos[0] - target.pos[0], e.pos[2] - target.pos[2]);
        ang += e.circleDir * dt * 0.8;
        var ring = arch.reach + 2.2;
        var cx = target.pos[0] + Math.sin(ang) * ring;
        var cz = target.pos[2] + Math.cos(ang) * ring;
        var ddx = cx - e.pos[0], ddz = cz - e.pos[2];
        var dl2 = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        moveEntity(S, e, ddx / dl2 * arch.speed * 0.75 * dt, ddz / dl2 * arch.speed * 0.75 * dt,
                   e.radius, e.height);
        e.speed = arch.speed * 0.75;
        faceToward(e, target.pos[0], target.pos[2], 5, dt);
        if (e.circleT > 1.2 && acquireToken(S, e)) {
          e.state = 'Attack'; e.stateT = 0; e.circleT = 0;
        }
        if (dist > arch.reach + 6) { e.state = 'Chase'; e.stateT = 0; }
        break;

      case 'Attack':
        if (!hasToken(S, e) && !acquireToken(S, e)) {
          e.state = 'Circle'; e.stateT = 0; break;
        }
        enemyAttack(S, e, dt);
        break;

      case 'Ranged':
        enemyRanged(S, e, dt);
        if (dist < (arch.minRange || 6) * 0.5) { e.state = 'Chase'; e.stateT = 0; }
        break;

      default:
        e.state = 'Idle'; e.stateT = 0;
        break;
    }
  }

  function updateEnemies(S, dt) {
    pruneTokens(S);
    var i, e;
    for (i = S.enemies.length - 1; i >= 0; i--) {
      e = S.enemies[i];
      updateEnemy(S, e, dt);
      /* retire corpses so the array cannot grow without bound */
      if (e.dead && e.corpseT > 22) {
        releaseToken(S, e);
        unmarkElenaHunter(S, e);
        S.enemies.splice(i, 1);
      }
    }
    /* squad alert decays */
    if (S.squad.hasContact && S.time - S.squad.lastKnownT > 12) {
      S.squad.hasContact = false;
      S.squad.alert = 0;
    }
  }

  /* ======================================================================
     SECTION -- ELENA
     ====================================================================== */
  var FOLLOW_DIST = { close: 1.8, medium: 3.2, far: 5.0 };

  function setBehavior(S, name) {
    var el = S.elena;
    if (el.behavior === name) { return; }
    el.prevBehavior = el.behavior;
    el.behavior = name;
    el.behaviorT = 0;
    el.path.length = 0;
    el.pathI = 0;
    el.repathT = 0;
    emit('elena_behavior', { behavior: name, prev: el.prevBehavior });
  }

  function damageElena(S, amount, type) {
    var el = S.elena;
    if (!el.alive || el.downed) { return 0; }
    amount *= diffOf(S).dmgIn;
    el.hp = Math.max(0, el.hp - amount);
    el.lastHitT = S.time;
    el.hurtT = 0.5;
    el.fear = clamp(el.fear + 0.22, 0, 1);
    emit('damage', { who: 'elena', amount: amount, type: type, hp: el.hp, max: el.maxHp });
    if (el.hp <= 0) { killElena(S, type); }
    return amount;
  }

  function startElenaGrab(S, e) {
    var el = S.elena;
    if (!el.alive || el.grabbedBy >= 0) { return; }
    el.grabbedBy = e.id;
    el.carryT = 0;
    el.carried = true;
    e.grabbing = 'elena';
    e.grabT = 0;
    setBehavior(S, 'Struggle');
    el.fear = 1;
    emit('elena_grabbed', { by: e.id, kind: e.kind, pos: vcopy(el.pos) });
  }

  function releaseElenaGrab(S, e, reason) {
    var el = S.elena;
    if (el.grabbedBy !== (e && e.id)) {
      if (e) { e.grabbing = null; }
      return;
    }
    el.grabbedBy = -1;
    el.carried = false;
    el.carryT = 0;
    if (e) { e.grabbing = null; unmarkElenaHunter(S, e); }
    setBehavior(S, 'Follow');
    emit('elena_rescued', { reason: reason || 'released' });
  }

  /* A point behind and to the side of the player, never in his firing line. */
  function followSlot(S, out) {
    var p = S.player;
    var dist = FOLLOW_DIST[S.elena.followDist] || 3.2;
    var side = S.elena.slotSide || 1;
    var yaw = p.aimYaw !== undefined ? p.aimYaw : p.yaw;
    var bx = -Math.sin(yaw), bz = -Math.cos(yaw);
    var rx = Math.cos(yaw), rz = -Math.sin(yaw);
    out[0] = p.pos[0] + bx * dist + rx * side * 0.9;
    out[1] = p.pos[1];
    out[2] = p.pos[2] + bz * dist + rz * side * 0.9;
    return out;
  }

  /* If she has drifted into the player's aim cone, step out of it. */
  function avoidFiringLine(S, dt) {
    var el = S.elena, p = S.player;
    var dx = el.pos[0] - p.pos[0], dz = el.pos[2] - p.pos[2];
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d > 6 || d < 0.05) { return false; }
    var yaw = p.aimYaw !== undefined ? p.aimYaw : p.yaw;
    var toEl = Math.atan2(dx, dz);
    var off = angleWrap(toEl - yaw);
    var coneHalf = Math.atan2(0.75, Math.max(1, d));
    if (Math.abs(off) > coneHalf) { return false; }
    var push = off >= 0 ? 1 : -1;
    var px = Math.cos(yaw) * push, pz = -Math.sin(yaw) * push;
    moveEntity(S, el, px * 2.4 * dt, pz * 2.4 * dt, el.radius, el.height);
    el.speed = 2.4;
    el.sidestepT = 0.4;
    return true;
  }

  function elenaStress(S, dt) {
    var el = S.elena, p = S.player;
    var st = el.stress;
    /* threat: nearest live enemy */
    var nearest = 1e9, i, e;
    for (i = 0; i < S.enemies.length; i++) {
      e = S.enemies[i];
      if (e.dead) { continue; }
      var dd = distXZ(e.pos, el.pos);
      if (dd < nearest) { nearest = dd; }
    }
    st.threat = nearest < 1e9 ? clamp(1 - nearest / 18, 0, 1) : 0;
    st.gunfire = clamp(st.gunfire - dt * 0.35, 0, 1);
    if (S.time - p.lastFireT < 0.2) { st.gunfire = Math.min(1, st.gunfire + 0.30); }
    st.playerHurt = 1 - (p.health.hp / p.health.max);
    st.dark = el.inDark ? 1 : 0;

    var target = clamp(st.threat * 0.55 + st.gunfire * 0.2 + st.playerHurt * 0.25 +
                       st.dark * 0.15 + (el.grabbedBy >= 0 ? 1 : 0), 0, 1);
    /* proximity to the player is calming - this is the mechanic that teaches
       players to stay close without a tutorial saying so */
    var pd = distXZ(el.pos, p.pos);
    if (pd < 2.5) { target -= 0.20; }
    if (S.flags.safeRoom) { target -= 0.5; }
    target = clamp(target, 0, 1);

    var rate = target > el.fear ? 1.4 : 0.35;
    el.fear += (target - el.fear) * Math.min(1, dt * rate);
    el.fear = clamp(el.fear, 0, 1);
    el.fearSmoothed += (el.fear - el.fearSmoothed) * Math.min(1, dt * 2);

    var tier = el.fear > 0.72 ? 'panic' : (el.fear > 0.38 ? 'tense' : 'calm');
    if (tier !== el.fearTier) {
      el.fearTier = tier;
      emit('elena_fear', { fear: el.fear, tier: tier });
    }
  }

  function updateElena(S, input, dt) {
    var el = S.elena, p = S.player;
    if (!el.alive) { el.anim = 'death'; return; }
    el.behaviorT += dt;
    el.animT += dt;
    el.speed = 0;
    el.barkCD = Math.max(0, el.barkCD - dt);
    el.screamCD = Math.max(0, el.screamCD - dt);
    el.throwCD = Math.max(0, el.throwCD - dt);
    if (el.hurtT > 0) { el.hurtT -= dt; }

    elenaStress(S, dt);

    /* --- commands ------------------------------------------------------ */
    if (input) {
      if (input.cmdFollow) { el.order = 'follow'; setBehavior(S, 'Follow'); }
      else if (input.cmdStay) { el.order = 'stay'; setBehavior(S, 'Stay'); }
      else if (input.cmdHide) { el.order = 'hide'; setBehavior(S, 'Hide'); }
      else if (input.cmdCome) { el.order = 'follow'; setBehavior(S, 'ComeHere'); }
      else if (input.cmdInteract) { setBehavior(S, 'Interact'); }
    }

    /* --- forced states override orders --------------------------------- */
    if (el.grabbedBy >= 0 && el.behavior !== 'Struggle') { setBehavior(S, 'Struggle'); }
    if (el.downed && el.behavior !== 'Downed') { setBehavior(S, 'Downed'); }

    var slot = _pv2;

    switch (el.behavior) {
      case 'Struggle': {
        var carrier = enemyById(S, el.grabbedBy);
        el.anim = 'grabbed';
        if (!carrier || carrier.dead) { releaseElenaGrab(S, carrier, 'carrier_down'); break; }
        el.carryT += dt;
        /* the carrier drags her toward the section edge */
        var ex = carrier.pos[0], ez = carrier.pos[2];
        el.pos[0] = ex + Math.sin(carrier.yaw) * 0.6;
        el.pos[2] = ez + Math.cos(carrier.yaw) * 0.6;
        el.pos[1] = carrier.pos[1];
        if (el.carryT > TUNE.elenaCarryTime) {
          killElena(S, 'taken');
        }
        break;
      }

      case 'Downed':
        el.anim = 'cower';
        el.downT += dt;
        if (distXZ(p.pos, el.pos) < 1.6 && input && input.interact) {
          el.downed = false; el.downT = 0;
          el.hp = Math.max(el.hp, el.maxHp * 0.35);
          el.revives++;
          setBehavior(S, 'Follow');
          emit('elena_revived', {});
        }
        break;

      case 'Stay':
        el.anim = el.fear > 0.6 ? 'cower' : 'idle';
        /* she still cowers if something gets close, but holds position */
        if (el.stress.threat > 0.6) { el.anim = 'cower'; }
        break;

      case 'Hide':
        el.anim = 'hide';
        break;

      case 'ComeHere':
        followSlot(S, slot);
        repath(S, el, p.pos, dt, 0.35);
        stepAlongPath(S, el, dt, 3.4);
        el.anim = 'run';
        if (distXZ(el.pos, p.pos) < 1.6) { setBehavior(S, 'Follow'); }
        break;

      case 'Interact':
        el.anim = 'idle';
        if (el.behaviorT > 1.6) { setBehavior(S, 'Follow'); }
        break;

      case 'TakeCover': {
        el.anim = 'walk';
        if (el.stress.threat < 0.35) { setBehavior(S, 'Follow'); break; }
        /* put the player between her and the threat */
        var bx = p.pos[0] * 2 - S.squad.lastKnown[0];
        var bz = p.pos[2] * 2 - S.squad.lastKnown[2];
        _pv[0] = bx; _pv[1] = p.pos[1]; _pv[2] = bz;
        repath(S, el, _pv, dt, 0.6);
        stepAlongPath(S, el, dt, 3.0);
        if (distXZ(el.pos, _pv) < 1.2) { el.anim = 'cower'; }
        break;
      }

      case 'Follow':
      default: {
        followSlot(S, slot);
        var dToSlot = distXZ(el.pos, slot);
        var dToPlayer = distXZ(el.pos, p.pos);

        /* combat: get behind the player rather than trailing into fire */
        if (el.stress.threat > 0.55 && S.player.inCombat > 0) {
          setBehavior(S, 'TakeCover');
          break;
        }

        /* high fear: hesitate at the threshold of somewhere dark */
        if (el.fear > 0.8 && dToPlayer > 5 && !el.hesitating) {
          el.hesitating = true;
          el.hesitateT = 0;
          vset(el.hesitateAt, el.pos[0], el.pos[1], el.pos[2]);
          emit('elena_hesitate', { pos: vcopy(el.pos) });
        }
        if (el.hesitating) {
          el.hesitateT += dt;
          el.anim = 'cower';
          /* a ComeHere order, or the player getting close, breaks it */
          if (dToPlayer < 3.0 || el.fear < 0.62 || el.hesitateT > 6) {
            el.hesitating = false;
          }
          break;
        }

        if (dToSlot > 0.85) {
          var speed = dToPlayer > 8 ? 4.2 : (dToPlayer > 4 ? 3.2 : 1.9);
          speed *= (1 - el.fear * 0.18);
          repath(S, el, slot, dt, dToPlayer > 6 ? 0.3 : 0.55);
          var moved = stepAlongPath(S, el, dt, speed);
          el.anim = speed > 3.6 ? 'run' : (speed > 2.2 ? 'run' : 'walk');
          if (!moved) { el.anim = 'idle'; }
        } else {
          el.anim = el.fear > 0.7 ? 'cower' : 'idle';
          faceToward(el, p.pos[0], p.pos[2], 4, dt);
        }
        break;
      }
    }

    /* always keep out of the player's line of fire */
    if (el.behavior !== 'Struggle' && el.behavior !== 'Downed') { avoidFiringLine(S, dt); }

    /* --- limited self-defence ------------------------------------------ */
    if (el.behavior !== 'Struggle' && el.alive) {
      /* emergency scream pulls aggro off the player */
      if (el.screamCD <= 0 && p.health.hp / p.health.max < 0.25 && el.stress.threat > 0.7) {
        el.screamCD = 45;
        S.squad.lastKnownT = S.time;
        vset(S.squad.lastKnown, el.pos[0], el.pos[1], el.pos[2]);
        for (var si = 0; si < S.enemies.length; si++) {
          var se = S.enemies[si];
          if (se.dead) { continue; }
          if (distXZ(se.pos, el.pos) < 14) { se.distracted = 4.0; }
        }
        emit('elena_scream', { pos: vcopy(el.pos) });
      }
      /* throw something at a staggered enemy */
      if (el.throwCD <= 0 && el.fear < 0.8) {
        for (var ti = 0; ti < S.enemies.length; ti++) {
          var te = S.enemies[ti];
          if (te.dead || !te.staggered) { continue; }
          if (distXZ(te.pos, el.pos) > 9) { continue; }
          el.throwCD = 8;
          damageEnemy(S, te, 12, 'thrown', te.pos, null, 'torso', 8);
          emit('elena_throw', { target: te.id, pos: vcopy(el.pos) });
          break;
        }
      }
      /* call out an enemy the player cannot see */
      if (S.time - el.lastCallout > 6) {
        for (var ci = 0; ci < S.enemies.length; ci++) {
          var ce = S.enemies[ci];
          if (ce.dead) { continue; }
          if (distXZ(ce.pos, p.pos) > 16) { continue; }
          if (canSee(S, { pos: p.pos, yaw: p.aimYaw || p.yaw, height: 1.7, kind: 'player' }, ce.pos)) { continue; }
          if (!canSee(S, { pos: el.pos, yaw: el.yaw, height: 1.6, kind: 'elena' }, ce.pos)) { continue; }
          el.lastCallout = S.time;
          emit('elena_callout', { target: ce.id, pos: vcopy(ce.pos), kind: ce.kind });
          break;
        }
      }
    }

    /* keep her on the ground and inside the world */
    el.pos[1] = navSampleHeight(S, el.pos[0], el.pos[2]);
    sanitizeVec(el.pos);
  }

  /* ======================================================================
     SECTION -- INVENTORY
     ====================================================================== */
  var Inventory = {
    fits: function (S, item, x, y, rot, ignoreUid) {
      var inv = S.inventory;
      var def = ITEMS[item.item || item.id] || ITEMS[item];
      if (!def) { return false; }
      var w = rot ? def.h : def.w, h = rot ? def.w : def.h;
      if (x < 0 || y < 0 || x + w > inv.w || y + h > inv.h) { return false; }
      for (var i = 0; i < inv.items.length; i++) {
        var o = inv.items[i];
        if (ignoreUid !== undefined && o.uid === ignoreUid) { continue; }
        var od = ITEMS[o.item];
        if (!od) { continue; }
        var ow = o.rot ? od.h : od.w, oh = o.rot ? od.w : od.h;
        if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) { return false; }
      }
      return true;
    },
    findSlot: function (S, itemId) {
      var inv = S.inventory;
      for (var r = 0; r < 2; r++) {
        for (var y = 0; y < inv.h; y++) {
          for (var x = 0; x < inv.w; x++) {
            if (Inventory.fits(S, { item: itemId }, x, y, r === 1)) {
              return { x: x, y: y, rot: r === 1 };
            }
          }
        }
      }
      return null;
    },
    add: function (S, itemId, qty) {
      var def = ITEMS[itemId];
      if (!def) { return false; }
      qty = qty || 1;
      var i, o;
      /* stack first */
      if (def.stack > 1) {
        for (i = 0; i < S.inventory.items.length; i++) {
          o = S.inventory.items[i];
          if (o.item === itemId && o.qty < def.stack) {
            var room = def.stack - o.qty;
            var take = Math.min(room, qty);
            o.qty += take; qty -= take;
            if (qty <= 0) { emit('pickup', { item: itemId, name: def.name, qty: take }); return true; }
          }
        }
      }
      while (qty > 0) {
        var slot = Inventory.findSlot(S, itemId);
        if (!slot) { emit('inventory_full', { item: itemId }); return false; }
        var take2 = Math.min(def.stack || 1, qty);
        S.inventory.items.push({
          uid: S.inventory.nextUid++, item: itemId,
          x: slot.x, y: slot.y, rot: slot.rot, qty: take2
        });
        qty -= take2;
      }
      emit('pickup', { item: itemId, name: def.name, qty: qty });
      return true;
    },
    remove: function (S, uid, qty) {
      var items = S.inventory.items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].uid !== uid) { continue; }
        items[i].qty -= (qty || 1);
        if (items[i].qty <= 0) { items.splice(i, 1); }
        return true;
      }
      return false;
    },
    count: function (S, itemId) {
      var n = 0;
      for (var i = 0; i < S.inventory.items.length; i++) {
        if (S.inventory.items[i].item === itemId) { n += S.inventory.items[i].qty; }
      }
      return n;
    },
    consume: function (S, itemId, qty) {
      qty = qty || 1;
      var items = S.inventory.items;
      for (var i = items.length - 1; i >= 0 && qty > 0; i--) {
        if (items[i].item !== itemId) { continue; }
        var take = Math.min(items[i].qty, qty);
        items[i].qty -= take; qty -= take;
        if (items[i].qty <= 0) { items.splice(i, 1); }
      }
      return qty === 0;
    },
    move: function (S, uid, x, y, rot) {
      var items = S.inventory.items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].uid !== uid) { continue; }
        if (!Inventory.fits(S, items[i], x, y, rot, uid)) { return false; }
        items[i].x = x; items[i].y = y; items[i].rot = !!rot;
        return true;
      }
      return false;
    },
    combine: function (S, uidA, uidB) {
      var a = null, b = null, i;
      for (i = 0; i < S.inventory.items.length; i++) {
        if (S.inventory.items[i].uid === uidA) { a = S.inventory.items[i]; }
        if (S.inventory.items[i].uid === uidB) { b = S.inventory.items[i]; }
      }
      if (!a || !b) { return false; }
      for (i = 0; i < RECIPES.length; i++) {
        var r = RECIPES[i];
        var match = (r.a === a.item && r.b === b.item) || (r.a === b.item && r.b === a.item);
        if (!match) { continue; }
        Inventory.remove(S, a.uid, 1);
        Inventory.remove(S, b.uid, 1);
        Inventory.add(S, r.result, r.qty || 1);
        emit('craft', { result: r.result, qty: r.qty || 1 });
        return true;
      }
      return false;
    },
    sort: function (S) {
      var items = S.inventory.items.slice();
      items.sort(function (p, q) {
        var dp = ITEMS[p.item], dq = ITEMS[q.item];
        return (dq.w * dq.h) - (dp.w * dp.h);
      });
      S.inventory.items.length = 0;
      for (var i = 0; i < items.length; i++) {
        var slot = Inventory.findSlot(S, items[i].item);
        if (slot) {
          items[i].x = slot.x; items[i].y = slot.y; items[i].rot = slot.rot;
          S.inventory.items.push(items[i]);
        } else {
          S.inventory.items.push(items[i]);
        }
      }
      return true;
    },
    expand: function (S) {
      var inv = S.inventory;
      if (inv.w < inv.maxW) { inv.w += 1; }
      else if (inv.h < inv.maxH) { inv.h += 1; }
      else { return false; }
      inv.caseTier++;
      emit('case_upgrade', { w: inv.w, h: inv.h });
      return true;
    }
  };

  /* ======================================================================
     SECTION -- PICKUPS AND INTERACTION
     ====================================================================== */
  function updatePickups(S, dt) {
    for (var i = S.pickups.length - 1; i >= 0; i--) {
      var pk = S.pickups[i];
      pk.t += dt;
      if (distXZ(pk.pos, S.player.pos) < 1.15) {
        var def = ITEMS[pk.item];
        if (def && def.kind === 'ammo') {
          giveAmmo(S, def.ammo || 'pistol', pk.qty);

          S.pickups.splice(i, 1);
        } else if (Inventory.add(S, pk.item, pk.qty)) {
          S.pickups.splice(i, 1);
        }
      } else if (pk.t > 240) {
        S.pickups.splice(i, 1);
      }
    }
  }

  /* ======================================================================
     SECTION -- DIRECTOR
     ====================================================================== */
  function updateDirector(S, dt) {
    var d = S.director;
    d.window += dt;
    if (d.window < 2.5) { return; }
    d.window = 0;

    var p = S.player;
    var acc = S.stats.shotsFired > 0 ? (S.stats.shotsHit || 0) / S.stats.shotsFired : 0.5;
    d.accuracy += (acc - d.accuracy) * 0.3;
    d.healthAvg += ((p.health.hp / p.health.max) - d.healthAvg) * 0.35;
    d.fearAvg += (S.elena.fear - d.fearAvg) * 0.35;

    /* ammo pressure for the weapon the player actually leans on */
    var pw = equippedWeapon(S);
    var ammoType = (pw && WEAPON_AMMO[pw.id]) || 'pistol';
    var reserve = (S.player.ammo && S.player.ammo[ammoType]) || 0;
    d.ammoPressure = clamp(1 - reserve / 60, 0, 1);

    /* one score: high means the player is comfortable */
    var score = d.accuracy * 0.28 + d.healthAvg * 0.42 + (1 - d.ammoPressure) * 0.30;
    d.score += (score - d.score) * 0.4;
    d.heat = clamp(1 - d.score, 0, 1);

    /* reshape the fight rather than just inflating numbers */
    d.aggression = 0.82 + d.score * 0.42;
    d.spawnMul = 0.78 + d.score * 0.5;
    d.tokenBonus = d.score > 0.75 ? 1 : (d.score < 0.3 ? -1 : 0);

    /* bias drops toward whatever the player is short of */
    d.dropBias.ammo = 0.65 + d.ammoPressure * 1.5;
    d.dropBias.heal = 0.55 + (1 - d.healthAvg) * 1.8;
    d.dropBias.resource = 0.8 + d.score * 0.6;
    d.dropBias.treasure = 0.5 + d.score * 1.1;
  }

  /* ======================================================================
     SECTION -- TRIGGERS, OBJECTIVES, SECTIONS
     ====================================================================== */
  function inBox(p, mn, mx) {
    return p[0] >= mn[0] && p[0] <= mx[0] && p[1] >= mn[1] &&
           p[1] <= mx[1] && p[2] >= mn[2] && p[2] <= mx[2];
  }

  function updateTriggers(S, dt) {
    var sec = currentSection(S);
    if (!sec || !sec.triggers) { return; }
    for (var i = 0; i < sec.triggers.length; i++) {
      var t = sec.triggers[i];
      if (t.once && S.flags['__trig_' + t.id]) { continue; }
      if (!inBox(S.player.pos, t.min, t.max)) { continue; }
      S.flags['__trig_' + t.id] = true;
      S.flags[t.id] = true;
      fireTriggerEvent(S, t.event);
    }
  }

  function fireTriggerEvent(S, event) {
    if (!event) { return; }
    if (event.indexOf('objective:') === 0) {
      setObjective(S, event.slice(10));
      return;
    }
    S.flags[event] = true;
    emit('dialogue', { trigger: event });
    emit('trigger', { event: event });
  }

  function setObjective(S, id) {
    if (S.objective === id) { return; }
    S.objective = id;
    S.objectiveHistory.push(id);
    var text = id;
    if (IP.STORY && IP.STORY.objectives && IP.STORY.objectives[id]) {
      text = IP.STORY.objectives[id].text || id;
    }
    emit('objective', { id: id, text: text });
  }

  function changeSection(S, id) {
    if (S.section === id) { return; }
    var prev = S.section;
    S.section = id;
    var lvl = S.level;
    if (lvl) {
      for (var i = 0; i < lvl.sections.length; i++) {
        if (lvl.sections[i].id === id) {
          S.sectionIndex = i;
          S.act = lvl.sections[i].act || S.act;
          break;
        }
      }
    }
    /* clear the old section's population */
    S.enemies.length = 0;
    S.squad.tokens.length = 0;
    S.squad.elenaHunters.length = 0;
    armSpawners(S);
    emit('section_change', { from: prev, to: id });
  }

  /* Walk the player through a door prop into the next section. */
  function updateSectionTransitions(S, dt) {
    var lvl = S.level;
    if (!lvl || !lvl.transitions) { return; }
    var sec = currentSection(S);
    if (!sec || !sec.props) { return; }
    for (var i = 0; i < sec.props.length; i++) {
      var pr = sec.props[i];
      if (!pr.tag || pr.tag.indexOf('to_') !== 0) { continue; }
      if (distXZ(S.player.pos, pr.pos) > 2.2) { continue; }
      var targetId = pr.tag.slice(3);
      /* Elena has to be with you - the escort is the whole point */
      if (S.elena.alive && distXZ(S.elena.pos, S.player.pos) > 8) {
        emit('blocked', { reason: 'elena_far' });
        return;
      }
      changeSection(S, targetId);
      placeAtSectionStart(S, targetId);
      return;
    }
  }

  function placeAtSectionStart(S, id) {
    var lvl = S.level, sec = null, i;
    if (!lvl) { return; }
    for (i = 0; i < lvl.sections.length; i++) {
      if (lvl.sections[i].id === id) { sec = lvl.sections[i]; break; }
    }
    if (!sec) { return; }
    var b = sec.bounds;
    var cx = (b.min[0] + b.max[0]) * 0.5, cz = (b.min[2] + b.max[2]) * 0.5;
    /* find a walkable cell near the centre */
    for (var r = 0; r < 40; r++) {
      for (var a = 0; a < 8; a++) {
        var ang = a / 8 * Math.PI * 2;
        var x = cx + Math.cos(ang) * r * 1.2, z = cz + Math.sin(ang) * r * 1.2;
        if (navIsWalkable(S, x, z)) {
          vset(S.player.pos, x, navSampleHeight(S, x, z), z);
          vset(S.elena.pos, x - 1.2, S.player.pos[1], z - 1.2);
          S.elena.path.length = 0;
          return;
        }
      }
    }
    vset(S.player.pos, cx, 0, cz);
    vset(S.elena.pos, cx - 1.2, 0, cz - 1.2);
  }

  /* ======================================================================
     SECTION -- ENDINGS
     ====================================================================== */
  function evaluateEnding(S, reason) {
    if (reason === 'elena_lost' || !S.elena.alive) {
      return { id: 'elena_lost', rank: 'F', name: 'Asset Lost' };
    }
    if (reason === 'player_lost') {
      return { id: 'kia', rank: 'F', name: 'Killed In Action' };
    }
    var survivors = S.stats.survivors || 0;
    var data = !!S.flags.dataDestroyed;
    var timeLeft = S.extractionClock ? Math.max(0, S.extractionClock.timeLeft) : 0;
    var score = (survivors * 2) + (data ? 3 : 0) + (timeLeft > 60 ? 2 : 0);
    var rank = score >= 7 ? 'S' : (score >= 5 ? 'A' : (score >= 3 ? 'B' : 'C'));
    var id = rank === 'S' ? 'clean_extraction'
           : (data ? 'scorched_earth' : 'bare_extraction');
    var ending = { id: id, rank: rank, name: id, survivors: survivors,
                   dataDestroyed: data, timeLeft: timeLeft };
    if (IP.STORY && IP.STORY.endings) {
      for (var i = 0; i < IP.STORY.endings.length; i++) {
        if (IP.STORY.endings[i].rank === rank) {
          ending.title = IP.STORY.endings[i].title;
          ending.text = IP.STORY.endings[i].text;
          ending.name = IP.STORY.endings[i].name || id;
          break;
        }
      }
    }
    S.ending = ending;
    return ending;
  }

  /* ======================================================================
     SECTION -- SAVE / LOAD
     ====================================================================== */
  var SAVE_KEY = 'islandProtocolSave';
  var SAVE_VERSION = 1;

  function store() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) { return localStorage; }
    } catch (e) { /* blocked by privacy settings */ }
    return null;
  }

  /* `level` and `_rt` hold engine handles and cycles; strip them. */
  function serialize(S) {
    var out = {}, k;
    for (k in S) {
      if (!Object.prototype.hasOwnProperty.call(S, k)) { continue; }
      if (k === 'level' || k === '_rt') { continue; }
      out[k] = S[k];
    }
    return JSON.stringify({ v: SAVE_VERSION, t: Date.now(), s: out });
  }

  var Save = {
    save: function (S) {
      var st = store();
      if (!st) { return false; }
      try {
        st.setItem(SAVE_KEY, serialize(S));
        emit('save', { section: S.section, time: S.time });
        return true;
      } catch (e) { return false; }
    },
    checkpoint: function (S) { return Save.save(S); },
    hasSave: function () {
      var st = store();
      if (!st) { return false; }
      try { return !!st.getItem(SAVE_KEY); } catch (e) { return false; }
    },
    peek: function () {
      var st = store();
      if (!st) { return null; }
      try {
        var raw = st.getItem(SAVE_KEY);
        if (!raw) { return null; }
        var o = JSON.parse(raw);
        return { version: o.v, time: o.t, section: o.s && o.s.section, act: o.s && o.s.act };
      } catch (e) { return null; }
    },
    load: function () {
      var st = store();
      if (!st) { return null; }
      try {
        var raw = st.getItem(SAVE_KEY);
        if (!raw) { return null; }
        var o = JSON.parse(raw);
        if (!o || o.v !== SAVE_VERSION || !o.s) { return null; }
        var S = o.s;
        /* typed arrays do not survive JSON; rebuild the vectors */
        reviveVectors(S);
        S.level = null;
        S._rt = makeRuntime();
        return S;
      } catch (e) { return null; }
    },
    clear: function () {
      var st = store();
      if (!st) { return false; }
      try { st.removeItem(SAVE_KEY); return true; } catch (e) { return false; }
    }
  };

  var VEC_KEYS = ['pos', 'vel', 'lastSeen', 'goal', 'hesitateAt', 'lastKnown', 'dir'];
  function reviveVectors(o, depth) {
    depth = depth || 0;
    if (!o || typeof o !== 'object' || depth > 6) { return o; }
    var k, i;
    if (o.length !== undefined && typeof o.length === 'number' && !(o instanceof Float32Array)) {
      for (i = 0; i < o.length; i++) { reviveVectors(o[i], depth + 1); }
      return o;
    }
    for (k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) { continue; }
      var val = o[k];
      if (!val || typeof val !== 'object') { continue; }
      if (VEC_KEYS.indexOf(k) >= 0 && val.length === 3) {
        o[k] = v3(val[0], val[1], val[2]);
      } else {
        reviveVectors(val, depth + 1);
      }
    }
    return o;
  }

  /* ======================================================================
     SECTION -- MAIN TICK
     ====================================================================== */
  function update(S, input, dt) {
    if (!S || S.paused) { return; }
    dt = dt > 0 ? (dt > 0.1 ? 0.1 : dt) : 1 / 60;
    S.dt = dt;
    S.time += dt;
    S.frame++;

    if (!S._rt) { S._rt = makeRuntime(); }
    if (!S._rt.armed && S.level) {
      armSpawners(S);
      S._rt.armed = true;
      if (!S.introDone) {
        S.introDone = true;
        setObjective(S, 'p_reach_lift');
        emit('dialogue', { trigger: 'game_start' });
      }
    }

    if (S.gameOver) { return; }

    if (S.player.grabbedBy >= 0) { updatePlayerGrabbed(S, input, dt); }
    else { updatePlayer(S, input, dt); }

    updateElena(S, input, dt);
    updateEnemies(S, dt);
    updateSpawners(S, dt);
    updateProjectiles(S, dt);
    updateHazards(S, dt);
    updateEffects(S, dt);
    updateProps(S, dt);
    updatePickups(S, dt);
    updateTriggers(S, dt);
    updateSectionTransitions(S, dt);
    updateDirector(S, dt);

    var ec = S.extractionClock;
    if (ec && ec.active && !ec.expired) {
      ec.timeLeft = Math.max(0, ec.timeLeft - dt);
      if (ec.timeLeft <= 0) {
        ec.expired = true;
        ec.active = false;
        emit('extraction_expired', {});
      }
    }

    /* combat memory drives the music and Elena's posture */
    if (S.player.inCombat > 0) { S.player.inCombat -= dt; }
    S.inCombat = S.player.inCombat > 0;
    S.combat = S.inCombat;
  }

  /* ======================================================================
     PUBLIC API
     ====================================================================== */
  IP.Systems = {
    createWorldState: createWorldState,
    update: update,

    WEAPONS: WEAPONS,
    ITEMS: ITEMS,
    RECIPES: RECIPES,
    UPGRADES: UPGRADES,
    ARCH: ARCH,
    TUNE: TUNE,
    DIFF: DIFF,

    Inventory: Inventory,
    Save: Save,

    Companion: {
      setBehavior: setBehavior,
      command: function (S, cmd) {
        var map = { follow: 'Follow', stay: 'Stay', hide: 'Hide',
                    come: 'ComeHere', interact: 'Interact' };
        if (map[cmd]) { setBehavior(S, map[cmd]); }
      },
      setFollowDistance: function (S, d) {
        if (FOLLOW_DIST[d]) { S.elena.followDist = d; }
      },
      damage: damageElena,
      grab: startElenaGrab,
      release: releaseElenaGrab,
      FOLLOW_DIST: FOLLOW_DIST
    },

    EnemyAI: {
      spawn: spawnEnemy,
      update: updateEnemies,
      canSee: canSee,
      notice: noticePlayer,
      acquireToken: acquireToken,
      releaseToken: releaseToken,
      tokenBudget: tokenBudget,
      activeAttackers: function (S) { return S.squad.tokens.length; }
    },

    damage: damage,
    damageEnemy: damageEnemy,
    fireWeapon: fireWeapon,
    reload: reload,
    melee: melee,
    equipWeapon: equipWeapon,
    cycleWeapon: cycleWeapon,
    giveWeapon: giveWeapon,
    giveAmmo: giveAmmo,
    healPlayer: healPlayer,
    getAimCone: getAimCone,
    enemyById: enemyById,
    setObjective: setObjective,
    changeSection: changeSection,
    evaluateEnding: evaluateEnding,
    healthFraction: function (S) {
      return S && S.player && S.player.health ? S.player.health.hp / S.player.health.max : 1;
    },
    healthSegments: healthSegments,
    equippedStats: equippedStats,
    equippedWeapon: equippedWeapon
  };

})();
if (typeof window !== 'undefined') { window.IP = IP; }
