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

  function levelBoxes(S) {
    if (S.level && S.level.collision && S.level.collision.boxes) {
      return S.level.collision.boxes;
    }
    return EMPTY_ARR;
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

/* __APPEND__ */
