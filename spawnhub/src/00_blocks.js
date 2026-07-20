/* =========================================================================
 * SpawnHub voxel engine — block & tile registry (procedural vanilla-style)
 * Everything lives on globalThis.SpawnHub so concatenated files share it.
 * ========================================================================= */
(function () {
  const SH = (globalThis.SpawnHub = globalThis.SpawnHub || {});

  /* ---------------- tiny seeded rng ---------------- */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hash2(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  SH.mulberry = mulberry; SH.strSeed = strSeed; SH.hash2 = hash2;

  /* ---------------- tile registry ----------------
   * A tile is a 16x16 RGBA painter. Painters run in the browser when the
   * atlas is built; in node (smoke test) they never run.               */
  const TILES = (SH.TILES = {});           // name -> painter(t)
  const TILE_INDEX = (SH.TILE_INDEX = {}); // name -> atlas slot (assigned later)
  function TILE(name, fn) { TILES[name] = fn; return name; }
  SH.TILE = TILE;

  /* Painter context factory (used by engine when building the atlas).
   * data: Uint8ClampedArray of the whole atlas, tx/ty tile origin.      */
  SH.makePainterCtx = function (data, W, tx, ty, name) {
    const rand = mulberry(strSeed(name));
    const seed = strSeed(name);
    function px(x, y, c) {
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      const i = ((ty + y) * W + tx + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c.length > 3 ? c[3] : 255;
    }
    function jit(c, j, r) { const d = (r - 0.5) * 2 * j; return [c[0] + d, c[1] + d, c[2] + d, c.length > 3 ? c[3] : 255]; }
    const t = {
      rand, seed, px,
      shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f, c.length > 3 ? c[3] : 255]; },
      fill(c, j) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, jit(c, j || 0, hash2(x, y, seed))); },
      rect(x0, y0, w, h, c, j) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, jit(c, j || 0, hash2(x, y, seed ^ 999))); },
      clearRect(x0, y0, w, h) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, [0, 0, 0, 0]); },
      cell(c, j, cs) { // cellular blobs (cobble-ish)
        cs = cs || 4;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const cxx = Math.floor(x / cs), cyy = Math.floor(y / cs);
          const v = hash2(cxx, cyy, seed) * 0.8 + hash2(x, y, seed ^ 7) * 0.2;
          const f = 1 - j + v * j * 2;
          const edge = (x % cs === 0 || y % cs === 0) ? 0.78 : 1;
          px(x, y, t.shade(c, f * edge));
        }
      },
      hline(y, c) { for (let x = 0; x < 16; x++) px(x, y, c); },
      vline(x, c) { for (let y = 0; y < 16; y++) px(x, y, c); },
      border(c) { t.hline(0, c); t.hline(15, c); t.vline(0, c); t.vline(15, c); },
      speck(n, c) { for (let i = 0; i < n; i++) px((rand() * 16) | 0, (rand() * 16) | 0, c); },
    };
    return t;
  };

  /* ---------------- generic painters ---------------- */
  function noiseT(name, c, j) { return TILE(name, t => t.fill(c, j == null ? 10 : j)); }
  function stoneBricksT(name, base, mortar, opts) {
    opts = opts || {};
    return TILE(name, t => {
      t.fill(base, 8);
      for (const y of [0, 8]) t.hline(y === 0 ? 7 : 15, mortar);
      t.hline(7, mortar); t.hline(15, mortar);
      // vertical joints offset per row
      for (let x of [7, 15]) for (let y = 0; y < 8; y++) t.px(x, y, mortar);
      for (let x of [3, 11]) for (let y = 8; y < 16; y++) t.px(x, y, mortar);
      if (opts.cracked) { for (let i = 0, x = 2, y = 1; i < 9; i++) { t.px(x, y, t.shade(base, 0.55)); x += (t.rand() * 2) | 0; y += 1 + ((t.rand() * 1.4) | 0); } }
      if (opts.moss) { t.speck(26, [96, 128, 60]); t.speck(12, [72, 105, 45]); }
    });
  }
  function planksT(name, base, dark) {
    return TILE(name, t => {
      t.fill(base, 9);
      for (const y of [3, 7, 11, 15]) t.hline(y, dark);
      t.px(4, 1, dark); t.px(12, 5, dark); t.px(2, 9, dark); t.px(10, 13, dark);
    });
  }
  function logSideT(name, bark, groove) {
    return TILE(name, t => { t.fill(bark, 12); for (const x of [2, 5, 9, 13]) for (let y = 0; y < 16; y++) if (hash2(x, y, t.seed) > 0.25) t.px(x, y, groove); });
  }
  function logTopT(name, bark, inner) {
    return TILE(name, t => {
      t.fill(bark, 8);
      t.rect(2, 2, 12, 12, inner, 8);
      t.rect(4, 4, 8, 8, t.shade(inner, 0.9), 8);
      t.rect(6, 6, 4, 4, t.shade(inner, 1.08), 6);
    });
  }
  function leavesT(name, base, holes) {
    return TILE(name, t => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = hash2(x, y, t.seed);
        if (v < (holes == null ? 0.16 : holes)) t.px(x, y, [0, 0, 0, 0]);
        else t.px(x, y, t.shade(base, 0.75 + v * 0.5));
      }
    });
  }
  function woolT(name, c) { return TILE(name, t => { t.fill(c, 7); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) t.px(x + ((y / 4) % 2) * 2, y, t.shade(c, 0.9)); }); }
  function concreteT(name, c) { return noiseT(name, c, 4); }
  function terracottaT(name, c) { return TILE(name, t => { t.fill(c, 6); t.speck(20, t.shade(c, 0.88)); t.speck(10, t.shade(c, 1.1)); }); }
  function glassT(name, tint, alpha, frame) {
    return TILE(name, t => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.px(x, y, [tint[0], tint[1], tint[2], alpha]);
      const fc = frame || [220, 230, 235, 255];
      t.border(fc);
      t.px(3, 2, [255, 255, 255, Math.min(255, alpha + 90)]); t.px(4, 3, [255, 255, 255, Math.min(255, alpha + 70)]); t.px(2, 3, [255, 255, 255, Math.min(255, alpha + 60)]);
    });
  }

  /* ---------------- concrete tile set ---------------- */
  // stone family
  noiseT('stone', [126, 126, 126], 9);
  TILE('smooth_stone', t => { t.fill([158, 158, 158], 4); t.hline(15, [120, 120, 120]); });
  TILE('cobble', t => t.cell([122, 122, 122], 0.5, 4));
  TILE('mossy_cobble', t => { t.cell([116, 121, 110], 0.5, 4); t.speck(34, [92, 122, 60]); t.speck(14, [70, 100, 46]); });
  stoneBricksT('stone_bricks', [122, 122, 122], [88, 88, 88]);
  stoneBricksT('stone_bricks_mossy', [118, 122, 112], [84, 96, 74], { moss: true });
  stoneBricksT('stone_bricks_cracked', [120, 120, 120], [86, 86, 86], { cracked: true });
  TILE('chiseled_stone', t => { t.fill([124, 124, 124], 6); t.border([90, 90, 90]); t.rect(3, 3, 10, 10, [134, 134, 134], 5); t.rect(5, 5, 6, 6, [110, 110, 110], 5); });
  noiseT('andesite', [136, 138, 133], 8);
  TILE('polished_andesite', t => { t.fill([132, 135, 129], 4); t.border([110, 112, 108]); });
  noiseT('diorite', [188, 184, 182], 12);
  noiseT('granite', [149, 103, 85], 10);
  noiseT('tuff', [108, 110, 100], 8);
  TILE('gravel', t => t.cell([131, 127, 126], 0.55, 3));
  noiseT('deepslate', [80, 80, 84], 8);
  TILE('deepslate_cobbled', t => t.cell([77, 77, 80], 0.5, 4));
  stoneBricksT('deepslate_bricks', [70, 70, 74], [50, 50, 54]);
  TILE('deepslate_tiles', t => {
    t.fill([64, 64, 68], 7);
    for (const y of [3, 7, 11, 15]) t.hline(y, [46, 46, 50]);
    for (let r = 0; r < 4; r++) for (const x of [(r % 2) * 4 + 3, (r % 2) * 4 + 11]) for (let y = r * 4; y < r * 4 + 4; y++) t.px((x) % 16, y, [46, 46, 50]);
  });
  TILE('polished_deepslate', t => { t.fill([74, 74, 78], 4); t.border([56, 56, 60]); });
  TILE('blackstone', t => t.cell([38, 34, 40], 0.5, 4));
  noiseT('obsidian', [22, 16, 34], 6);
  TILE('crying_obsidian', t => { t.fill([26, 16, 44], 6); t.speck(16, [130, 60, 220]); t.speck(8, [180, 110, 255]); });
  noiseT('bedrock', [70, 70, 70], 28);

  // dirt/grass family
  noiseT('dirt', [134, 96, 67], 12);
  TILE('coarse_dirt', t => { t.fill([128, 92, 64], 12); t.speck(24, [100, 100, 100]); });
  TILE('grass_top', t => { t.fill([102, 148, 66], 12); t.speck(24, [88, 132, 58]); t.speck(12, [122, 168, 80]); });
  TILE('grass_side', t => {
    t.fill([134, 96, 67], 12);
    for (let x = 0; x < 16; x++) { const d = 2 + ((hash2(x, 0, 5) * 3) | 0); for (let y = 0; y < d; y++) t.px(x, y, t.shade([102, 148, 66], 0.85 + hash2(x, y, 9) * 0.3)); }
  });
  TILE('dirt_path_top', t => { t.fill([148, 122, 65], 10); t.speck(18, [128, 104, 52]); });
  TILE('dirt_path_side', t => { t.fill([134, 96, 67], 12); for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) t.px(x, y, t.shade([148, 122, 65], 0.9 + hash2(x, y, 3) * 0.2)); });
  TILE('podzol_top', t => { t.fill([106, 75, 40], 10); t.speck(26, [84, 58, 30]); });
  TILE('mycelium_top', t => { t.fill([120, 105, 112], 10); t.speck(20, [140, 125, 132]); });
  TILE('moss', t => { t.fill([89, 126, 55], 10); t.speck(20, [72, 108, 44]); });
  noiseT('sand', [219, 208, 160], 10);
  TILE('sandstone', t => { t.fill([216, 205, 158], 6); t.hline(0, [200, 188, 140]); t.hline(15, [196, 184, 136]); });
  TILE('mud_bricks', t => { t.fill([150, 116, 88], 8); t.hline(7, [116, 88, 66]); t.hline(15, [116, 88, 66]); for (let x of [7, 15]) for (let y = 0; y < 8; y++) t.px(x, y, [116, 88, 66]); for (let x of [3, 11]) for (let y = 8; y < 16; y++) t.px(x, y, [116, 88, 66]); });
  TILE('clay', t => t.fill([160, 166, 178], 6));
  TILE('snow', t => t.fill([240, 246, 250], 4));

  // wood family
  planksT('oak_planks', [162, 130, 78], [124, 98, 56]);
  planksT('spruce_planks', [114, 84, 48], [86, 62, 34]);
  planksT('birch_planks', [196, 179, 123], [160, 144, 94]);
  planksT('dark_oak_planks', [66, 43, 20], [46, 30, 14]);
  planksT('acacia_planks', [168, 90, 50], [130, 66, 36]);
  planksT('crimson_planks', [101, 48, 70], [77, 34, 55]);
  planksT('warped_planks', [43, 104, 99], [30, 78, 76]);
  logSideT('oak_log', [101, 79, 49], [77, 59, 35]);
  logTopT('oak_log_top', [101, 79, 49], [178, 142, 90]);
  logSideT('birch_log', [216, 215, 210], [180, 178, 168]);
  logTopT('birch_log_top', [216, 215, 210], [196, 179, 123]);
  TILE('birch_log_marks', t => { t.fill([218, 217, 212], 8); for (let i = 0; i < 7; i++) { const x = (t.rand() * 13) | 0, y = (t.rand() * 15) | 0; t.rect(x, y, 2 + ((t.rand() * 2) | 0), 1, [40, 40, 38], 10); } });
  logSideT('spruce_log', [58, 37, 16], [42, 26, 12]);
  logTopT('spruce_log_top', [58, 37, 16], [114, 84, 48]);
  logSideT('dark_oak_log', [40, 26, 12], [28, 18, 8]);
  logTopT('dark_oak_log_top', [40, 26, 12], [66, 43, 20]);
  logSideT('stripped_oak', [178, 142, 90], [150, 118, 72]);
  logTopT('stripped_oak_top', [178, 142, 90], [188, 152, 98]);
  logSideT('stripped_spruce', [130, 96, 54], [108, 78, 44]);
  logTopT('stripped_spruce_top', [130, 96, 54], [140, 104, 60]);
  leavesT('oak_leaves', [58, 95, 34]);
  leavesT('birch_leaves', [92, 120, 62]);
  leavesT('spruce_leaves', [45, 72, 45]);
  leavesT('dark_oak_leaves', [50, 82, 30]);
  leavesT('azalea_leaves', [70, 110, 45], 0.1);
  TILE('flowering_azalea', t => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = hash2(x, y, t.seed); if (v < 0.1) t.px(x, y, [0, 0, 0, 0]); else if (v > 0.86) t.px(x, y, [214, 130, 190]); else t.px(x, y, t.shade([70, 110, 45], 0.75 + v * 0.5)); } });
  TILE('mangrove_leaves', t => leavesT('mangrove_leaves_x', [48, 88, 28])); // unused fallback

  // quartz / modern
  TILE('quartz', t => { t.fill([235, 231, 224], 4); t.speck(8, [222, 217, 208]); });
  TILE('smooth_quartz', t => t.fill([238, 234, 228], 3));
  TILE('quartz_pillar', t => { t.fill([234, 230, 223], 3); t.vline(1, [214, 209, 200]); t.vline(7, [214, 209, 200]); t.vline(14, [214, 209, 200]); });
  TILE('quartz_pillar_top', t => { t.fill([234, 230, 223], 3); t.border([214, 209, 200]); t.rect(4, 4, 8, 8, [226, 221, 213], 3); });
  TILE('quartz_bricks', t => { t.fill([233, 229, 222], 4); t.hline(7, [212, 207, 198]); t.hline(15, [212, 207, 198]); for (let x of [7, 15]) for (let y = 0; y < 8; y++) t.px(x, y, [212, 207, 198]); for (let x of [3, 11]) for (let y = 8; y < 16; y++) t.px(x, y, [212, 207, 198]); });
  TILE('chiseled_quartz', t => { t.fill([233, 229, 222], 3); t.border([210, 205, 196]); t.rect(3, 3, 10, 10, [240, 236, 230], 3); t.rect(6, 6, 4, 4, [216, 211, 202], 3); });
  concreteT('concrete_white', [207, 213, 214]);
  concreteT('concrete_lightgray', [155, 155, 148]);
  concreteT('concrete_gray', [84, 90, 95]);
  concreteT('concrete_black', [25, 27, 32]);
  concreteT('concrete_cyan', [21, 137, 145]);
  concreteT('concrete_blue', [44, 46, 143]);
  concreteT('concrete_lightblue', [35, 137, 198]);
  concreteT('concrete_green', [73, 91, 36]);
  concreteT('concrete_lime', [94, 168, 24]);
  concreteT('concrete_yellow', [240, 175, 21]);
  concreteT('concrete_orange', [224, 97, 0]);
  concreteT('concrete_red', [142, 32, 32]);
  concreteT('concrete_pink', [213, 101, 142]);
  concreteT('concrete_purple', [100, 31, 156]);
  concreteT('concrete_brown', [96, 59, 31]);
  terracottaT('terracotta', [152, 94, 67]);
  terracottaT('terracotta_white', [209, 178, 161]);
  terracottaT('terracotta_yellow', [186, 133, 35]);
  terracottaT('terracotta_cyan', [86, 91, 91]);
  terracottaT('terracotta_red', [143, 61, 46]);
  terracottaT('terracotta_orange', [161, 83, 37]);
  terracottaT('terracotta_lime', [103, 117, 52]);
  terracottaT('terracotta_gray', [57, 42, 35]);
  terracottaT('terracotta_lightgray', [135, 106, 97]);
  terracottaT('terracotta_black', [37, 22, 16]);
  terracottaT('terracotta_purple', [118, 70, 86]);
  terracottaT('terracotta_pink', [161, 78, 78]);
  terracottaT('terracotta_brown', [77, 51, 35]);
  terracottaT('terracotta_blue', [74, 59, 91]);

  // wool + carpets share tiles
  woolT('wool_white', [233, 236, 236]);
  woolT('wool_lightgray', [142, 142, 134]);
  woolT('wool_gray', [62, 68, 71]);
  woolT('wool_black', [20, 21, 25]);
  woolT('wool_red', [160, 39, 34]);
  woolT('wool_orange', [240, 118, 19]);
  woolT('wool_yellow', [248, 197, 39]);
  woolT('wool_lime', [112, 185, 25]);
  woolT('wool_green', [84, 109, 27]);
  woolT('wool_cyan', [21, 137, 145]);
  woolT('wool_lightblue', [58, 175, 217]);
  woolT('wool_blue', [53, 57, 157]);
  woolT('wool_purple', [121, 42, 172]);
  woolT('wool_magenta', [189, 68, 179]);
  woolT('wool_pink', [237, 141, 172]);
  woolT('wool_brown', [114, 71, 40]);

  // metals & ores
  TILE('iron_block', t => { t.fill([220, 220, 220], 4); t.border([180, 180, 185]); });
  TILE('gold_block', t => { t.fill([246, 208, 61], 6); t.border([214, 168, 40]); t.px(4, 4, [255, 240, 150]); });
  TILE('emerald_block', t => { t.fill([42, 176, 96], 6); t.border([26, 130, 66]); });
  TILE('diamond_block', t => { t.fill([98, 219, 214], 5); t.border([70, 180, 176]); });
  TILE('copper_oxidized', t => { t.fill([82, 162, 132], 7); t.speck(14, [60, 140, 110]); });
  TILE('copper_oxidized_cut', t => { t.fill([84, 164, 134], 5); t.hline(7, [58, 132, 104]); t.hline(15, [58, 132, 104]); for (let x of [7, 15]) t.vline(x, [58, 132, 104]); t.px(1, 1, [110, 190, 160]); t.px(9, 9, [110, 190, 160]); });
  TILE('copper_block', t => { t.fill([192, 108, 80], 7); t.speck(10, [214, 130, 100]); });
  TILE('prismarine_bricks', t => { t.fill([90, 168, 152], 6); t.hline(5, [64, 130, 118]); t.hline(10, [64, 130, 118]); t.hline(15, [64, 130, 118]); for (let x of [5, 10, 15]) t.vline(x, [64, 130, 118]); });
  TILE('dark_prismarine', t => { t.fill([48, 92, 78], 6); t.border([34, 68, 58]); });

  // light sources
  TILE('glowstone', t => { t.fill([252, 220, 130], 16); t.speck(16, [255, 244, 190]); t.speck(10, [220, 170, 80]); });
  TILE('sea_lantern', t => { t.fill([210, 235, 228], 8); t.border([160, 200, 190]); t.rect(5, 5, 6, 6, [240, 252, 248], 4); });
  TILE('shroomlight', t => { t.fill([245, 150, 74], 10); t.speck(14, [255, 200, 120]); });
  TILE('redstone_lamp_on', t => { t.fill([230, 160, 80], 10); t.border([120, 70, 30]); t.rect(4, 4, 8, 8, [255, 210, 120], 8); });
  TILE('jack_o_lantern', t => { t.fill([226, 138, 30], 8); t.rect(3, 4, 3, 3, [255, 220, 90]); t.rect(10, 4, 3, 3, [255, 220, 90]); t.rect(4, 9, 8, 4, [255, 220, 90]); t.px(7, 9, [226, 138, 30]); t.px(9, 10, [226, 138, 30]); });
  TILE('pumpkin_side', t => { t.fill([214, 126, 24], 8); for (const x of [2, 6, 10, 14]) t.vline(x, [180, 100, 18]); });
  TILE('pumpkin_top', t => { t.fill([200, 118, 22], 8); t.rect(6, 6, 3, 3, [90, 110, 40], 8); });
  TILE('melon_side', t => { t.fill([94, 146, 40], 8); for (const x of [3, 7, 11]) t.vline(x, [140, 180, 70]); });
  TILE('lantern_tex', t => { t.fill([50, 52, 62], 0); t.rect(3, 4, 10, 10, [80, 84, 96], 8); t.rect(5, 6, 6, 6, [255, 200, 100], 12); t.rect(6, 2, 4, 2, [60, 62, 72], 4); });
  TILE('soul_lantern_tex', t => { t.fill([50, 52, 62], 0); t.rect(3, 4, 10, 10, [80, 84, 96], 8); t.rect(5, 6, 6, 6, [120, 220, 230], 12); t.rect(6, 2, 4, 2, [60, 62, 72], 4); });
  TILE('torch_tex', t => { t.clearRect(0, 0, 16, 16); t.rect(7, 6, 2, 10, [110, 86, 50]); t.rect(7, 4, 2, 2, [255, 210, 90]); t.px(7, 3, [255, 240, 160]); t.px(8, 3, [255, 160, 60]); });
  TILE('soul_torch_tex', t => { t.clearRect(0, 0, 16, 16); t.rect(7, 6, 2, 10, [90, 76, 60]); t.rect(7, 4, 2, 2, [110, 220, 230]); t.px(7, 3, [180, 250, 255]); });
  TILE('end_rod', t => { t.fill([240, 230, 210], 6); });
  TILE('fire_tex', t => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = hash2(x, y, t.seed); const h = 1 - y / 16;
      if (v < h * 0.9) t.px(x, y, v < h * 0.35 ? [255, 235, 130] : (v < h * 0.6 ? [255, 160, 40] : [230, 90, 20]));
      else t.px(x, y, [0, 0, 0, 0]);
    }
  });
  TILE('lava', t => { t.fill([207, 79, 12], 14); t.speck(22, [255, 160, 40]); t.speck(12, [255, 220, 100]); });
  TILE('water', t => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = hash2(x, y, t.seed); t.px(x, y, [40 + v * 18, 84 + v * 24, 190 + v * 30, 178]); } });
  TILE('nether_portal', t => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = hash2(x, y, t.seed); t.px(x, y, [96 + v * 60, 20 + v * 30, 160 + v * 70, 200]); } });
  TILE('honey_block', t => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.px(x, y, [248, 178, 42, 210]); t.border([230, 150, 20, 230]); t.rect(4, 4, 8, 8, [255, 200, 80, 220], 6); });
  TILE('honeycomb', t => {
    t.fill([238, 150, 34], 6);
    const hex = [[2, 2], [9, 2], [5, 7], [12, 7], [2, 12], [9, 12]];
    for (const [hx, hy] of hex) { t.rect(hx, hy, 4, 4, [252, 190, 70], 6); t.rect(hx + 1, hy + 1, 2, 2, [200, 120, 24], 5); }
  });
  TILE('bee_nest_front', t => { t.fill([196, 150, 86], 8); t.hline(3, [160, 118, 62]); t.hline(9, [160, 118, 62]); t.rect(6, 10, 4, 4, [60, 44, 24]); });
  TILE('bee_nest_top', t => { t.fill([206, 160, 92], 8); t.border([170, 128, 70]); });

  // functional blocks
  TILE('crafting_top', t => { t.fill([146, 116, 70], 8); t.border([96, 74, 44]); t.rect(3, 3, 4, 4, [120, 94, 56], 6); t.rect(9, 3, 4, 4, [120, 94, 56], 6); t.rect(3, 9, 4, 4, [120, 94, 56], 6); t.rect(9, 9, 4, 4, [120, 94, 56], 6); });
  TILE('crafting_side', t => { t.fill([156, 124, 76], 8); t.rect(2, 2, 5, 5, [190, 170, 140], 6); t.rect(9, 2, 5, 5, [130, 100, 60], 6); t.rect(2, 9, 12, 5, [110, 86, 52], 8); });
  TILE('furnace_side', t => { t.fill([120, 120, 120], 8); t.border([80, 80, 80]); });
  TILE('furnace_front', t => { t.fill([118, 118, 118], 8); t.border([80, 80, 80]); t.rect(4, 2, 8, 5, [70, 70, 70], 6); t.rect(4, 9, 8, 5, [40, 40, 40]); t.rect(5, 10, 6, 3, [255, 170, 60], 20); });
  TILE('blast_front', t => { t.fill([96, 96, 100], 6); t.border([60, 60, 64]); t.rect(3, 2, 10, 4, [140, 140, 145], 6); t.rect(4, 9, 8, 4, [30, 30, 30]); t.rect(5, 10, 6, 2, [255, 150, 50], 20); });
  TILE('smoker_front', t => { t.fill([104, 88, 62], 8); t.border([70, 58, 40]); t.rect(4, 9, 8, 4, [35, 30, 24]); t.rect(5, 10, 6, 2, [255, 170, 60], 20); });
  TILE('bookshelf', t => {
    t.fill([162, 130, 78], 8);
    const cols = [[178, 60, 50], [70, 110, 170], [90, 140, 70], [200, 170, 70], [140, 80, 150], [200, 200, 200]];
    for (const row of [1, 9]) { let x = 1; while (x < 15) { const w = 1 + ((hash2(x, row, t.seed) * 2) | 0); const c = cols[(hash2(x, row + 3, t.seed) * cols.length) | 0]; t.rect(x, row + (hash2(x, row + 7, t.seed) > .7 ? 1 : 0), w, 5, c, 10); x += w; } t.hline(row - 1 < 0 ? 0 : row - 1, [110, 86, 52]); t.hline(row + 6, [110, 86, 52]); }
  });
  TILE('barrel_side', t => { t.fill([130, 98, 58], 8); t.hline(2, [90, 66, 38]); t.hline(13, [90, 66, 38]); t.hline(7, [160, 160, 165]); });
  TILE('barrel_top', t => { t.fill([120, 92, 54], 8); t.border([90, 66, 38]); t.rect(4, 4, 8, 8, [146, 112, 66], 8); });
  TILE('chest_side', t => { t.fill([158, 116, 58], 8); t.border([100, 72, 38]); t.hline(6, [100, 72, 38]); });
  TILE('chest_front', t => { t.fill([158, 116, 58], 8); t.border([100, 72, 38]); t.hline(6, [100, 72, 38]); t.rect(7, 5, 2, 4, [140, 140, 145]); });
  TILE('chest_top', t => { t.fill([150, 110, 54], 8); t.border([100, 72, 38]); });
  TILE('ender_chest_side', t => { t.fill([28, 40, 44], 6); t.border([16, 24, 26]); t.hline(6, [16, 24, 26]); t.rect(7, 5, 2, 3, [90, 220, 190]); });
  TILE('jukebox_side', t => { t.fill([104, 68, 40], 8); t.border([70, 46, 28]); t.rect(3, 3, 10, 10, [80, 52, 32], 8); });
  TILE('jukebox_top', t => { t.fill([104, 68, 40], 8); t.rect(4, 4, 8, 8, [30, 30, 34]); t.rect(7, 7, 2, 2, [180, 180, 190]); });
  TILE('note_block', t => { t.fill([96, 62, 38], 8); t.border([64, 42, 26]); t.rect(6, 5, 4, 6, [220, 60, 60], 10); });
  TILE('anvil_tex', t => { t.fill([64, 64, 68], 6); t.border([44, 44, 48]); });
  TILE('cauldron_side', t => { t.fill([58, 58, 62], 6); t.rect(2, 3, 12, 10, [40, 40, 44], 6); });
  TILE('cauldron_top', t => { t.fill([58, 58, 62], 6); t.rect(2, 2, 12, 12, [46, 90, 180], 12); });
  TILE('composter_side', t => { t.fill([120, 88, 50], 9); for (const x of [0, 4, 8, 12]) t.vline(x, [90, 64, 38]); });
  TILE('composter_top', t => { t.fill([90, 66, 40], 8); t.rect(2, 2, 12, 12, [80, 110, 40], 14); });
  TILE('hay_side', t => { t.fill([212, 172, 52], 10); for (const y of [0, 5, 10, 15]) t.hline(y, [180, 140, 36]); for (const x of [3, 8, 13]) t.vline(x, [196, 156, 44]); });
  TILE('hay_top', t => { t.fill([200, 160, 44], 10); t.rect(4, 4, 8, 8, [220, 184, 66], 10); });
  TILE('target_side', t => { t.fill([226, 218, 202], 6); t.rect(4, 4, 8, 8, [210, 60, 50], 6); t.rect(6, 6, 4, 4, [226, 218, 202], 4); });
  TILE('tnt_side', t => { t.fill([190, 48, 34], 8); t.hline(0, [150, 36, 26]); t.rect(0, 5, 16, 6, [226, 218, 202]); t.rect(3, 6, 10, 4, [40, 40, 40, 0]); /* label */ for (let x = 3; x < 13; x += 4) t.rect(x, 6, 2, 4, [60, 60, 60]); });
  TILE('lodestone_side', t => { t.fill([120, 122, 128], 6); t.border([88, 90, 96]); });
  TILE('lectern_side', t => { t.fill([150, 118, 72], 8); t.border([110, 86, 52]); });
  TILE('enchant_side', t => { t.fill([40, 36, 44], 6); t.border([28, 24, 30]); t.rect(3, 3, 10, 10, [70, 40, 60], 8); t.speck(6, [200, 120, 220]); });
  TILE('enchant_top', t => { t.fill([30, 28, 34], 6); t.rect(3, 4, 10, 8, [180, 40, 50], 8); t.rect(4, 5, 8, 6, [210, 60, 60], 8); t.rect(6, 6, 4, 4, [240, 240, 240], 6); });
  TILE('brewing_base', t => { t.fill([120, 120, 124], 6); t.speck(10, [200, 170, 60]); });
  TILE('observer_front', t => { t.fill([90, 90, 94], 6); t.rect(2, 3, 12, 4, [50, 50, 54]); t.rect(4, 10, 8, 3, [180, 60, 50]); });
  TILE('observer_side', t => { t.fill([84, 84, 88], 6); t.hline(0, [60, 60, 64]); t.hline(15, [60, 60, 64]); });
  TILE('piston_front', t => { t.fill([150, 120, 76], 8); t.border([110, 86, 52]); });
  TILE('piston_side', t => { t.fill([110, 110, 114], 6); t.rect(0, 0, 16, 5, [150, 120, 76], 8); });
  TILE('iron_door_tex', t => { t.fill([200, 200, 204], 5); t.border([150, 150, 156]); t.rect(3, 3, 10, 4, [170, 170, 176], 5); t.rect(3, 9, 10, 4, [170, 170, 176], 5); });
  TILE('oak_door_tex', t => { t.fill([150, 118, 68], 8); t.border([104, 78, 46]); t.rect(3, 2, 4, 5, [80, 60, 100, 140]); t.rect(9, 2, 4, 5, [80, 60, 100, 140]); t.rect(3, 9, 10, 5, [124, 96, 56], 8); });
  TILE('dark_door_tex', t => { t.fill([66, 43, 20], 8); t.border([40, 26, 12]); t.rect(3, 2, 10, 5, [90, 62, 30], 8); t.rect(3, 9, 10, 5, [52, 34, 16], 8); });
  TILE('trapdoor_tex', t => { t.fill([150, 118, 68], 8); t.border([104, 78, 46]); t.rect(4, 4, 8, 8, [124, 96, 56], 8); });
  TILE('ladder_tex', t => { t.clearRect(0, 0, 16, 16); t.rect(2, 0, 2, 16, [140, 108, 62]); t.rect(12, 0, 2, 16, [140, 108, 62]); for (const y of [2, 6, 10, 14]) t.rect(4, y, 8, 2, [160, 126, 74]); });
  TILE('rail_tex', t => { t.clearRect(0, 0, 16, 16); for (const y of [1, 5, 9, 13]) t.rect(1, y, 14, 2, [120, 92, 56]); t.rect(3, 0, 2, 16, [160, 160, 168]); t.rect(11, 0, 2, 16, [160, 160, 168]); });
  TILE('scaffold_side', t => { t.clearRect(0, 0, 16, 16); t.rect(0, 0, 2, 16, [196, 168, 98]); t.rect(14, 0, 2, 16, [196, 168, 98]); t.rect(0, 0, 16, 2, [196, 168, 98]); t.rect(0, 14, 16, 2, [180, 152, 86]); t.px(4, 8, [196, 168, 98]); t.px(8, 6, [196, 168, 98]); t.px(11, 10, [196, 168, 98]); });
  TILE('sign_tex', t => { t.fill([170, 136, 82], 6); t.border([124, 96, 56]); for (const y of [4, 7, 10]) t.rect(3, y, 10, 1, [70, 55, 35]); });
  TILE('painting1', t => { t.fill([120, 96, 60], 4); t.rect(1, 1, 14, 14, [70, 110, 160], 8); t.rect(2, 8, 12, 6, [70, 130, 70], 10); t.rect(10, 3, 3, 3, [250, 240, 180]); });
  TILE('painting2', t => { t.fill([120, 96, 60], 4); t.rect(1, 1, 14, 14, [30, 30, 40], 6); t.rect(3, 5, 4, 8, [200, 60, 50], 8); t.rect(8, 4, 5, 9, [220, 180, 60], 8); });
  TILE('item_sword', t => { t.clearRect(0, 0, 16, 16); for (let i = 0; i < 8; i++) t.px(4 + i, 11 - i, [130, 200, 230]); for (let i = 0; i < 7; i++) t.px(5 + i, 11 - i, [90, 160, 200]); t.rect(3, 11, 3, 1, [110, 84, 48]); t.px(4, 12, [110, 84, 48]); });
  TILE('item_pick', t => { t.clearRect(0, 0, 16, 16); for (let i = 0; i < 8; i++) t.px(4 + i, 11 - i, [140, 110, 70]); t.rect(3, 3, 9, 2, [90, 200, 190]); t.px(3, 5, [90, 200, 190]); t.px(11, 5, [90, 200, 190]); });
  TILE('item_potion', t => { t.clearRect(0, 0, 16, 16); t.rect(6, 3, 4, 2, [180, 180, 190]); t.rect(5, 5, 6, 8, [230, 70, 120, 220]); t.rect(4, 7, 8, 6, [230, 70, 120, 220]); t.px(6, 6, [255, 160, 190]); });
  TILE('item_book', t => { t.clearRect(0, 0, 16, 16); t.rect(3, 3, 10, 10, [140, 40, 130]); t.rect(4, 4, 8, 8, [180, 70, 170]); t.rect(6, 3, 1, 10, [230, 210, 120]); });
  TILE('item_map', t => { t.fill([196, 176, 128], 8); t.rect(3, 3, 6, 5, [110, 160, 80], 10); t.rect(9, 8, 4, 5, [70, 110, 180], 10); t.px(7, 9, [200, 50, 40]); });
  TILE('item_armor', t => { t.clearRect(0, 0, 16, 16); t.rect(4, 4, 8, 3, [120, 210, 220]); t.rect(3, 5, 3, 7, [120, 210, 220]); t.rect(10, 5, 3, 7, [120, 210, 220]); t.rect(6, 7, 4, 6, [100, 180, 195]); });
  TILE('frame_bg', t => { t.fill([146, 116, 70], 6); t.border([104, 82, 48]); t.rect(2, 2, 12, 12, [120, 96, 60], 6); });
  TILE('bulletin', t => { t.fill([120, 92, 56], 6); t.rect(1, 1, 6, 7, [230, 226, 210]); t.rect(8, 2, 7, 5, [226, 210, 170]); t.rect(2, 9, 5, 6, [210, 220, 230]); t.rect(9, 8, 6, 7, [235, 220, 200]); t.px(3, 2, [40, 40, 40]); t.px(10, 3, [40, 40, 40]); t.px(4, 11, [40, 40, 40]); t.px(11, 10, [40, 40, 40]); });

  // plants (cross tiles)
  TILE('tall_grass', t => { t.clearRect(0, 0, 16, 16); for (let i = 0; i < 10; i++) { const x = 1 + ((t.rand() * 14) | 0); const h = 5 + ((t.rand() * 9) | 0); for (let y = 0; y < h; y++) t.px(x + ((y > h - 3 && t.rand() > .6) ? 1 : 0), 15 - y, t.shade([106, 156, 66], 0.8 + t.rand() * 0.4)); } });
  TILE('fern', t => { t.clearRect(0, 0, 16, 16); for (let y = 0; y < 12; y++) { t.px(8, 15 - y, [70, 120, 50]); if (y % 2 === 0) { for (let d = 1; d < 4 - y / 4; d++) { t.px(8 - d, 15 - y, [86, 140, 60]); t.px(8 + d, 15 - y, [86, 140, 60]); } } } });
  function flowerT(name, petal, center) {
    return TILE(name, t => {
      t.clearRect(0, 0, 16, 16);
      for (let y = 0; y < 7; y++) t.px(8, 15 - y, [70, 130, 50]);
      t.px(7, 10, [70, 130, 50]); t.px(6, 11, [90, 150, 60]);
      t.rect(6, 3, 4, 4, petal); t.px(6, 3, [0, 0, 0, 0]); t.px(9, 3, [0, 0, 0, 0]); t.px(6, 6, [0, 0, 0, 0]); t.px(9, 6, [0, 0, 0, 0]);
      t.px(5, 4, petal); t.px(10, 4, petal); t.px(7, 2, petal); t.px(8, 2, petal);
      if (center) { t.px(7, 4, center); t.px(8, 4, center); }
    });
  }
  flowerT('poppy', [214, 64, 46], [40, 40, 40]);
  flowerT('dandelion', [252, 216, 96], [230, 180, 40]);
  flowerT('tulip_red', [226, 96, 76], [240, 200, 120]);
  flowerT('tulip_white', [235, 235, 230], [220, 200, 140]);
  flowerT('tulip_pink', [235, 156, 196], [240, 210, 150]);
  flowerT('cornflower', [86, 118, 230], [60, 80, 180]);
  flowerT('oxeye', [240, 240, 235], [230, 200, 90]);
  flowerT('allium', [200, 130, 220], [180, 100, 200]);
  flowerT('lily_valley', [235, 240, 240], [140, 180, 120]);
  TILE('rose_bush', t => { t.clearRect(0, 0, 16, 16); for (let i = 0; i < 8; i++) { const x = 2 + ((t.rand() * 12) | 0), y = 2 + ((t.rand() * 10) | 0); t.rect(x, y, 2, 2, [200, 40, 40]); } for (let y = 8; y < 16; y++) for (let x = 2; x < 14; x++) if (hash2(x, y, t.seed) > .5) t.px(x, y, [50, 100, 40]); });
  TILE('sweet_berry', t => { t.clearRect(0, 0, 16, 16); for (let y = 2; y < 16; y++) for (let x = 2; x < 14; x++) if (hash2(x, y, t.seed) > .55) t.px(x, y, [56, 110, 46]); t.speck(8, [190, 40, 40]); });
  TILE('wheat', t => { t.clearRect(0, 0, 16, 16); for (const x of [2, 5, 8, 11, 14]) { for (let y = 2; y < 16; y++) t.px(x, y, [193, 168, 87]); t.px(x - 1, 2, [212, 190, 106]); t.px(x, 1, [212, 190, 106]); t.px(x + (x % 2 ? 1 : -1), 4, [212, 190, 106]); } });
  TILE('wheat_young', t => { t.clearRect(0, 0, 16, 16); for (const x of [3, 7, 11, 14]) for (let y = 9; y < 16; y++) t.px(x, y, [80, 170, 60]); });
  TILE('carrots', t => { t.clearRect(0, 0, 16, 16); for (const x of [3, 7, 11]) { for (let y = 9; y < 16; y++) t.px(x, y, [60, 140, 46]); t.px(x - 1, 10, [70, 160, 55]); t.px(x + 1, 11, [70, 160, 55]); } });
  TILE('potatoes', t => { t.clearRect(0, 0, 16, 16); for (const x of [3, 8, 12]) { for (let y = 10; y < 16; y++) t.px(x, y, [66, 130, 50]); t.px(x + 1, 11, [80, 150, 60]); } });
  TILE('beets', t => { t.clearRect(0, 0, 16, 16); for (const x of [4, 8, 12]) { for (let y = 10; y < 16; y++) t.px(x, y, [120, 40, 50]); t.px(x - 1, 11, [70, 140, 60]); } });
  TILE('sugar_cane', t => { t.clearRect(0, 0, 16, 16); for (const x of [3, 8, 13]) { for (let y = 0; y < 16; y++) t.px(x, y, [120, 190, 110]); t.px(x, 4, [90, 160, 90]); t.px(x, 10, [90, 160, 90]); } });
  TILE('bamboo_tex', t => { t.clearRect(0, 0, 16, 16); t.rect(6, 0, 3, 16, [110, 168, 50]); t.hline(3, [86, 140, 40]); t.hline(9, [86, 140, 40]); t.px(9, 5, [90, 150, 45]); t.px(10, 4, [90, 150, 45]); });
  TILE('mushroom_red', t => { t.clearRect(0, 0, 16, 16); t.rect(5, 4, 6, 4, [200, 50, 40]); t.px(6, 5, [240, 230, 220]); t.px(9, 6, [240, 230, 220]); t.rect(7, 8, 2, 6, [220, 208, 190]); });
  TILE('mushroom_brown', t => { t.clearRect(0, 0, 16, 16); t.rect(5, 5, 6, 3, [150, 110, 80]); t.rect(7, 8, 2, 6, [214, 200, 180]); });
  TILE('dead_bush', t => { t.clearRect(0, 0, 16, 16); for (let y = 6; y < 16; y++) t.px(8, y, [130, 96, 50]); t.px(6, 8, [130, 96, 50]); t.px(7, 7, [130, 96, 50]); t.px(10, 9, [130, 96, 50]); t.px(11, 8, [130, 96, 50]); t.px(5, 10, [130, 96, 50]); });
  TILE('vine_tex', t => { t.clearRect(0, 0, 16, 16); for (let x = 0; x < 16; x += 3) { let yy = 0; while (yy < 16) { if (hash2(x, yy, t.seed) > 0.2) t.px(x + ((yy / 4) | 0) % 2, yy, t.shade([60, 110, 40], 0.8 + hash2(x, yy, 5) * 0.4)); yy++; } } t.speck(6, [80, 140, 55]); });
  TILE('lilypad', t => { t.clearRect(0, 0, 16, 16); t.rect(2, 3, 11, 10, [40, 120, 40], 10); t.rect(3, 4, 9, 8, [50, 140, 50], 10); t.clearRect(8, 3, 5, 4); t.rect(10, 4, 2, 2, [50, 140, 50]); });
  TILE('seagrass', t => { t.clearRect(0, 0, 16, 16); for (const x of [4, 8, 12]) for (let y = 4; y < 16; y++) t.px(x + ((y % 4) > 1 ? 1 : 0), y, [60, 150, 70, 220]); });
  TILE('cobweb', t => { t.clearRect(0, 0, 16, 16); for (let i = 0; i < 16; i++) { t.px(i, i, [230, 230, 230, 180]); t.px(15 - i, i, [230, 230, 230, 180]); t.px(8, i, [230, 230, 230, 140]); t.px(i, 8, [230, 230, 230, 140]); } });
  TILE('chain_tex', t => { t.clearRect(0, 0, 16, 16); for (let y = 0; y < 16; y++) { t.px(7, y, [70, 74, 88]); t.px(8, y, [96, 100, 116]); } });
  TILE('ball_tex', t => { t.fill([235, 235, 235], 5); t.rect(2, 2, 4, 4, [30, 30, 30]); t.rect(10, 4, 4, 4, [30, 30, 30]); t.rect(5, 10, 4, 4, [30, 30, 30]); });
  TILE('cake_side', t => { t.fill([236, 230, 222], 4); t.rect(0, 9, 16, 7, [150, 100, 70], 6); t.speck(6, [200, 60, 70]); });
  TILE('cake_top', t => { t.fill([240, 236, 230], 4); t.speck(8, [200, 60, 70]); });
  TILE('bed_head_top', t => { t.fill([220, 222, 228], 5); t.hline(15, [180, 182, 188]); t.rect(2, 2, 12, 8, [240, 242, 246], 4); });
  function bedFootT(name, c) { return TILE(name, t => { t.fill(c, 6); t.hline(0, t.shade(c, 1.15)); t.border(t.shade(c, 0.85)); }); }
  bedFootT('bed_red', [160, 40, 40]); bedFootT('bed_blue', [50, 60, 150]); bedFootT('bed_cyan', [30, 130, 140]);
  bedFootT('bed_lime', [110, 180, 40]); bedFootT('bed_yellow', [235, 195, 50]); bedFootT('bed_purple', [120, 50, 165]);
  bedFootT('bed_white', [225, 228, 232]); bedFootT('bed_orange', [230, 120, 30]); bedFootT('bed_pink', [230, 145, 170]);
  bedFootT('bed_green', [90, 115, 35]); bedFootT('bed_black', [35, 36, 42]); bedFootT('bed_lightblue', [70, 170, 215]);
  TILE('bed_side_wood', t => { t.fill([150, 118, 68], 6); t.hline(0, [172, 138, 84]); t.hline(15, [104, 78, 46]); });

  // glass
  glassT('glass', [205, 225, 232], 70);
  glassT('glass_white', [240, 244, 248], 120);
  glassT('glass_blue', [70, 90, 210], 130);
  glassT('glass_lightblue', [110, 180, 235], 120);
  glassT('glass_cyan', [50, 160, 170], 130);
  glassT('glass_purple', [140, 70, 200], 140);
  glassT('glass_magenta', [200, 80, 200], 140);
  glassT('glass_lime', [130, 210, 60], 130);
  glassT('glass_yellow', [235, 210, 70], 130);
  glassT('glass_red', [200, 60, 55], 140);
  glassT('glass_orange', [230, 140, 40], 140);
  glassT('glass_black', [30, 30, 36], 170);
  glassT('glass_tinted', [40, 36, 48], 190, [60, 55, 70, 255]);
  TILE('iron_bars_tex', t => { t.clearRect(0, 0, 16, 16); for (const x of [1, 7, 13]) t.vline(x, [120, 124, 130]); t.hline(0, [140, 144, 150]); t.hline(8, [110, 114, 120]); t.hline(15, [140, 144, 150]); });

  // moon (special 32x32 handled by engine via 4 tiles? keep 16 and scale)
  TILE('moon', t => { t.fill([228, 230, 224], 5); t.speck(14, [200, 202, 198]); t.rect(3, 4, 4, 4, [206, 208, 202], 5); t.rect(10, 9, 3, 3, [210, 212, 206], 5); t.border([214, 216, 210]); });

  /* ---------------- block registry ---------------- */
  const BLOCKS = (SH.BLOCKS = [null]); // id -> def, id 0 = air
  const BY_NAME = (SH.BLOCK_BY_NAME = {});
  // def: {name, shape, tex:{top,bottom,n,s,e,w} tile names, light, opaque(full light blocker), solidFull, cull:'opaque'|'cutout'|'trans', data}
  function defBlock(name, o) {
    if (BY_NAME[name] != null) return BY_NAME[name];
    const id = BLOCKS.length;
    const tex = o.tex || {};
    const all = tex.all || 'stone';
    const def = {
      id, name,
      shape: o.shape || 'cube',
      tex: { top: tex.top || all, bottom: tex.bottom || tex.top || all, side: tex.side || all, front: tex.front || tex.side || all },
      light: o.light || 0,
      opaque: o.opaque !== undefined ? o.opaque : (o.shape || 'cube') === 'cube' && (o.cull || 'opaque') === 'opaque',
      cull: o.cull || 'opaque',
      data: o.data || null,
      tint: o.tint || null,
    };
    BLOCKS.push(def); BY_NAME[name] = id;
    return id;
  }
  SH.defBlock = defBlock;

  const cube = (name, tiles, o) => defBlock(name, Object.assign({ tex: typeof tiles === 'string' ? { all: tiles } : tiles }, o || {}));

  /* ---- core cubes ---- */
  cube('STONE', 'stone'); cube('SMOOTH_STONE', 'smooth_stone'); cube('COBBLESTONE', 'cobble'); cube('MOSSY_COBBLESTONE', 'mossy_cobble');
  cube('STONE_BRICKS', 'stone_bricks'); cube('MOSSY_STONE_BRICKS', 'stone_bricks_mossy'); cube('CRACKED_STONE_BRICKS', 'stone_bricks_cracked');
  cube('CHISELED_STONE_BRICKS', 'chiseled_stone');
  cube('ANDESITE', 'andesite'); cube('POLISHED_ANDESITE', 'polished_andesite'); cube('DIORITE', 'diorite'); cube('GRANITE', 'granite'); cube('TUFF', 'tuff');
  cube('GRAVEL', 'gravel');
  cube('DEEPSLATE', 'deepslate'); cube('COBBLED_DEEPSLATE', 'deepslate_cobbled'); cube('DEEPSLATE_BRICKS', 'deepslate_bricks');
  cube('DEEPSLATE_TILES', 'deepslate_tiles'); cube('POLISHED_DEEPSLATE', 'polished_deepslate'); cube('BLACKSTONE', 'blackstone');
  cube('OBSIDIAN', 'obsidian'); cube('CRYING_OBSIDIAN', 'crying_obsidian', { light: 8 }); cube('BEDROCK', 'bedrock');
  cube('DIRT', 'dirt'); cube('COARSE_DIRT', 'coarse_dirt');
  cube('GRASS', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' });
  cube('DIRT_PATH', { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt_path_side' });
  cube('PODZOL', { top: 'podzol_top', bottom: 'dirt', side: 'grass_side' });
  cube('MOSS_BLOCK', 'moss');
  cube('SAND', 'sand'); cube('SANDSTONE', { top: 'sandstone', side: 'sandstone' }); cube('SMOOTH_SANDSTONE', 'sandstone');
  cube('MUD_BRICKS', 'mud_bricks'); cube('CLAY', 'clay'); cube('SNOW_BLOCK', 'snow');
  cube('BRICKS', TILE('bricks', t => { t.fill([150, 97, 83], 8); t.hline(3, [108, 66, 58]); t.hline(7, [108, 66, 58]); t.hline(11, [108, 66, 58]); t.hline(15, [108, 66, 58]); for (let r = 0; r < 4; r++) for (const x of [(r % 2) ? 4 : 9]) for (let y = r * 4; y < r * 4 + 3; y++) t.px(x, y, [108, 66, 58]); }));

  cube('OAK_PLANKS', 'oak_planks'); cube('SPRUCE_PLANKS', 'spruce_planks'); cube('BIRCH_PLANKS', 'birch_planks');
  cube('DARK_OAK_PLANKS', 'dark_oak_planks'); cube('ACACIA_PLANKS', 'acacia_planks'); cube('CRIMSON_PLANKS', 'crimson_planks'); cube('WARPED_PLANKS', 'warped_planks');
  cube('OAK_LOG', { top: 'oak_log_top', side: 'oak_log' });
  cube('BIRCH_LOG', { top: 'birch_log_top', side: 'birch_log_marks' });
  cube('SPRUCE_LOG', { top: 'spruce_log_top', side: 'spruce_log' });
  cube('DARK_OAK_LOG', { top: 'dark_oak_log_top', side: 'dark_oak_log' });
  cube('STRIPPED_OAK_LOG', { top: 'stripped_oak_top', side: 'stripped_oak' });
  cube('STRIPPED_SPRUCE_LOG', { top: 'stripped_spruce_top', side: 'stripped_spruce' });
  cube('OAK_LEAVES', 'oak_leaves', { cull: 'cutout', opaque: false });
  cube('BIRCH_LEAVES', 'birch_leaves', { cull: 'cutout', opaque: false });
  cube('SPRUCE_LEAVES', 'spruce_leaves', { cull: 'cutout', opaque: false });
  cube('DARK_OAK_LEAVES', 'dark_oak_leaves', { cull: 'cutout', opaque: false });
  cube('AZALEA_LEAVES', 'azalea_leaves', { cull: 'cutout', opaque: false });
  cube('FLOWERING_AZALEA_LEAVES', 'flowering_azalea', { cull: 'cutout', opaque: false });

  cube('QUARTZ_BLOCK', 'quartz'); cube('SMOOTH_QUARTZ', 'smooth_quartz');
  cube('QUARTZ_PILLAR', { top: 'quartz_pillar_top', side: 'quartz_pillar' });
  cube('QUARTZ_BRICKS', 'quartz_bricks'); cube('CHISELED_QUARTZ', 'chiseled_quartz');
  for (const c of ['WHITE', 'LIGHTGRAY', 'GRAY', 'BLACK', 'CYAN', 'BLUE', 'LIGHTBLUE', 'GREEN', 'LIME', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE', 'BROWN'])
    cube('CONCRETE_' + c, 'concrete_' + c.toLowerCase());
  cube('TERRACOTTA', 'terracotta');
  for (const c of ['WHITE', 'YELLOW', 'CYAN', 'RED', 'ORANGE', 'LIME', 'GRAY', 'LIGHTGRAY', 'BLACK', 'PURPLE', 'PINK', 'BROWN', 'BLUE'])
    cube('TERRACOTTA_' + c, 'terracotta_' + c.toLowerCase());
  for (const c of ['WHITE', 'LIGHTGRAY', 'GRAY', 'BLACK', 'RED', 'ORANGE', 'YELLOW', 'LIME', 'GREEN', 'CYAN', 'LIGHTBLUE', 'BLUE', 'PURPLE', 'MAGENTA', 'PINK', 'BROWN'])
    cube('WOOL_' + c, 'wool_' + c.toLowerCase());

  cube('IRON_BLOCK', 'iron_block'); cube('GOLD_BLOCK', 'gold_block'); cube('EMERALD_BLOCK', 'emerald_block'); cube('DIAMOND_BLOCK', 'diamond_block');
  cube('COPPER_BLOCK', 'copper_block'); cube('OXIDIZED_COPPER', 'copper_oxidized'); cube('OXIDIZED_CUT_COPPER', 'copper_oxidized_cut');
  cube('PRISMARINE_BRICKS', 'prismarine_bricks'); cube('DARK_PRISMARINE', 'dark_prismarine');

  cube('GLOWSTONE', 'glowstone', { light: 15 });
  cube('SEA_LANTERN', 'sea_lantern', { light: 15 });
  cube('SHROOMLIGHT', 'shroomlight', { light: 14 });
  cube('REDSTONE_LAMP', 'redstone_lamp_on', { light: 15 });
  cube('JACK_O_LANTERN', { top: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_o_lantern' }, { light: 15 });
  cube('PUMPKIN', { top: 'pumpkin_top', side: 'pumpkin_side' });
  cube('MELON', { top: 'melon_side', side: 'melon_side' });
  cube('HONEYCOMB_BLOCK', 'honeycomb');
  cube('HONEY_BLOCK', 'honey_block', { cull: 'trans', opaque: false });
  cube('BEE_NEST', { top: 'bee_nest_top', side: 'bee_nest_top', front: 'bee_nest_front' });
  cube('HAY_BALE', { top: 'hay_top', side: 'hay_side' });
  cube('BOOKSHELF', { top: 'oak_planks', side: 'bookshelf' });
  cube('CRAFTING_TABLE', { top: 'crafting_top', bottom: 'oak_planks', side: 'crafting_side' });
  cube('FURNACE', { top: 'furnace_side', side: 'furnace_side', front: 'furnace_front' }, { light: 6 });
  cube('BLAST_FURNACE', { top: 'observer_side', side: 'furnace_side', front: 'blast_front' }, { light: 6 });
  cube('SMOKER', { top: 'smoker_front', side: 'smoker_front', front: 'smoker_front' }, { light: 6 });
  cube('BARREL', { top: 'barrel_top', side: 'barrel_side' });
  cube('CHEST', { top: 'chest_top', side: 'chest_side', front: 'chest_front' });
  cube('ENDER_CHEST', 'ender_chest_side', { light: 5 });
  cube('JUKEBOX', { top: 'jukebox_top', side: 'jukebox_side' });
  cube('NOTE_BLOCK', 'note_block');
  cube('CAULDRON', { top: 'cauldron_top', side: 'cauldron_side' });
  cube('COMPOSTER', { top: 'composter_top', side: 'composter_side' });
  cube('TARGET', 'target_side');
  cube('TNT', 'tnt_side');
  cube('LODESTONE', 'lodestone_side');
  cube('OBSERVER', { top: 'observer_side', side: 'observer_side', front: 'observer_front' });
  cube('PISTON', { top: 'piston_front', side: 'piston_side', bottom: 'observer_side' });
  cube('SCAFFOLDING', 'scaffold_side', { cull: 'cutout', opaque: false });
  cube('COBWEB', 'cobweb', { cull: 'cutout', opaque: false, shape: 'cross' });
  cube('BULLETIN', { top: 'dark_oak_planks', side: 'bulletin' });
  cube('END_PORTAL_FRAME', { top: 'copper_oxidized_cut', side: 'sandstone' });
  cube('NETHERRACK', TILE('netherrack', t => { t.fill([112, 50, 50], 12); t.speck(16, [140, 60, 60]); }));

  cube('GLASS', 'glass', { cull: 'trans', opaque: false });
  cube('TINTED_GLASS', 'glass_tinted', { cull: 'trans', opaque: false });
  for (const c of ['WHITE', 'BLUE', 'LIGHTBLUE', 'CYAN', 'PURPLE', 'MAGENTA', 'LIME', 'YELLOW', 'RED', 'ORANGE', 'BLACK'])
    cube('GLASS_' + c, 'glass_' + c.toLowerCase(), { cull: 'trans', opaque: false });

  cube('WATER', 'water', { cull: 'trans', opaque: false, shape: 'water' });
  cube('LAVA', 'lava', { light: 15, cull: 'opaque', opaque: false, shape: 'water' });
  cube('NETHER_PORTAL', 'nether_portal', { light: 11, cull: 'trans', opaque: false });

  /* ---- non-cube shapes ---- */
  const nc = (name, shape, tiles, o) => defBlock(name, Object.assign({ shape, tex: typeof tiles === 'string' ? { all: tiles } : tiles, opaque: false, cull: 'cutout' }, o || {}));
  nc('TORCH', 'torch', 'torch_tex', { light: 14 });
  nc('SOUL_TORCH', 'torch', 'soul_torch_tex', { light: 10 });
  nc('LANTERN', 'lantern', 'lantern_tex', { light: 15 });
  nc('SOUL_LANTERN', 'lantern', 'soul_lantern_tex', { light: 10 });
  nc('LANTERN_HANGING', 'lantern_hang', 'lantern_tex', { light: 15 });
  nc('SOUL_LANTERN_HANGING', 'lantern_hang', 'soul_lantern_tex', { light: 10 });
  nc('END_ROD', 'chain', 'end_rod', { light: 14 });
  nc('CHAIN', 'chain', 'chain_tex');
  nc('CAMPFIRE', 'campfire', { top: 'fire_tex', side: 'spruce_log' }, { light: 14, data: { smoke: true } });
  nc('FIRE', 'cross', 'fire_tex', { light: 14 });
  nc('IRON_BARS', 'pane', 'iron_bars_tex');
  nc('GLASS_PANE', 'pane', 'glass', { cull: 'trans' });
  for (const c of ['WHITE', 'BLUE', 'LIGHTBLUE', 'CYAN', 'PURPLE', 'MAGENTA', 'LIME', 'YELLOW', 'RED', 'ORANGE', 'BLACK'])
    nc('PANE_' + c, 'pane', 'glass_' + c.toLowerCase(), { cull: 'trans' });
  nc('LILY_PAD', 'flat', 'lilypad');
  nc('RAIL_X', 'rail', 'rail_tex', { data: { rot: 1 } });
  nc('RAIL_Z', 'rail', 'rail_tex', { data: { rot: 0 } });
  nc('PRESSURE_PLATE_OAK', 'plate', 'oak_planks');
  nc('PRESSURE_PLATE_STONE', 'plate', 'smooth_stone');
  nc('BALL', 'ball', 'ball_tex');
  nc('CAKE', 'cake', { top: 'cake_top', side: 'cake_side' });
  nc('ANVIL', 'anvil', 'anvil_tex');
  nc('LECTERN', 'lectern', { top: 'lectern_side', side: 'lectern_side' });
  nc('BREWING_STAND', 'brewing', { top: 'brewing_base', side: 'brewing_base' }, { light: 2 });
  nc('ENCHANTING_TABLE', 'enchant', { top: 'enchant_top', side: 'enchant_side' }, { light: 7 });
  nc('SIGN', 'sign', 'sign_tex');
  nc('BAMBOO', 'bamboo', 'bamboo_tex');
  nc('ARMOR_STAND', 'armor_stand', { top: 'smooth_stone', side: 'stripped_oak' });
  nc('BELL', 'bell', 'gold_block');
  nc('FLOWER_POT', 'pot', 'terracotta');
  nc('DRIPSTONE', 'cone', TILE('dripstone', t => t.fill([134, 107, 92], 10)));

  // wall-mounted things need a direction: N=-Z S=+Z W=-X E=+X
  for (const d of ['N', 'S', 'E', 'W']) {
    nc('LADDER_' + d, 'wallflat', 'ladder_tex', { data: { dir: d } });
    nc('VINE_' + d, 'wallflat', 'vine_tex', { data: { dir: d } });
    nc('SIGN_WALL_' + d, 'wallsign', 'sign_tex', { data: { dir: d } });
    nc('PAINTING1_' + d, 'wallflat', 'painting1', { data: { dir: d } });
    nc('PAINTING2_' + d, 'wallflat', 'painting2', { data: { dir: d } });
    nc('TORCH_WALL_' + d, 'walltorch', 'torch_tex', { light: 14, data: { dir: d } });
    for (const it of ['SWORD', 'PICK', 'POTION', 'BOOK', 'MAP', 'ARMOR'])
      nc('FRAME_' + it + '_' + d, 'frame', { top: 'frame_bg', side: 'item_' + it.toLowerCase() }, { data: { dir: d } });
  }
  // doors: thin panel; DOOR_x on west edge of cell etc.
  for (const [nm, tex] of [['OAK_DOOR', 'oak_door_tex'], ['DARK_DOOR', 'dark_door_tex'], ['IRON_DOOR', 'iron_door_tex'], ['SPRUCE_DOOR', 'oak_door_tex']])
    for (const d of ['N', 'S', 'E', 'W']) nc(nm + '_' + d, 'door', tex, { data: { dir: d } });
  for (const d of ['B', 'T']) nc('TRAPDOOR_' + d, d === 'B' ? 'trapdoor_b' : 'trapdoor_t', 'trapdoor_tex');

  // plants (cross)
  const plant = (name, tile) => nc(name, 'cross', tile);
  plant('TALL_GRASS', 'tall_grass'); plant('FERN', 'fern'); plant('POPPY', 'poppy'); plant('DANDELION', 'dandelion');
  plant('TULIP_RED', 'tulip_red'); plant('TULIP_WHITE', 'tulip_white'); plant('TULIP_PINK', 'tulip_pink');
  plant('CORNFLOWER', 'cornflower'); plant('OXEYE_DAISY', 'oxeye'); plant('ALLIUM', 'allium'); plant('LILY_OF_VALLEY', 'lily_valley');
  plant('ROSE_BUSH', 'rose_bush'); plant('SWEET_BERRY_BUSH', 'sweet_berry');
  plant('WHEAT', 'wheat'); plant('WHEAT_YOUNG', 'wheat_young'); plant('CARROTS', 'carrots'); plant('POTATOES', 'potatoes'); plant('BEETROOTS', 'beets');
  plant('SUGAR_CANE', 'sugar_cane'); plant('MUSHROOM_RED', 'mushroom_red'); plant('MUSHROOM_BROWN', 'mushroom_brown');
  plant('DEAD_BUSH', 'dead_bush'); plant('SEAGRASS', 'seagrass');

  // beds
  for (const c of ['RED', 'BLUE', 'CYAN', 'LIME', 'YELLOW', 'PURPLE', 'WHITE', 'ORANGE', 'PINK', 'GREEN', 'BLACK', 'LIGHTBLUE']) {
    nc('BED_' + c + '_HEAD', 'bed', { top: 'bed_head_top', side: 'bed_side_wood' });
    nc('BED_' + c + '_FOOT', 'bed', { top: 'bed_' + c.toLowerCase(), side: 'bed_side_wood' });
  }
  // carpets
  for (const c of ['WHITE', 'LIGHTGRAY', 'GRAY', 'BLACK', 'RED', 'ORANGE', 'YELLOW', 'LIME', 'GREEN', 'CYAN', 'LIGHTBLUE', 'BLUE', 'PURPLE', 'MAGENTA', 'PINK', 'BROWN'])
    nc('CARPET_' + c, 'carpet', 'wool_' + c.toLowerCase());
  // potted plants
  for (const p of ['TULIP_RED', 'TULIP_WHITE', 'TULIP_PINK', 'POPPY', 'DANDELION', 'FERN', 'CORNFLOWER', 'ALLIUM', 'OXEYE_DAISY'])
    nc('POTTED_' + p, 'potted', { top: 'terracotta', side: BLOCKS[BY_NAME[p]].tex.side });
  nc('POTTED_CACTUS', 'potted', { top: 'terracotta', side: TILE('cactus_mini', t => { t.clearRect(0, 0, 16, 16); t.rect(7, 4, 3, 11, [80, 140, 60]); t.rect(4, 7, 3, 2, [80, 140, 60]); t.rect(5, 5, 1, 3, [80, 140, 60]); t.px(11, 8, [80, 140, 60]); t.px(11, 6, [80, 140, 60]); }) });
  nc('POTTED_BAMBOO', 'potted', { top: 'terracotta', side: 'bamboo_tex' });
  nc('POTTED_AZALEA', 'potted', { top: 'terracotta', side: 'flowering_azalea' });

  /* ---------------- dynamic variants: stairs / slabs / fences ---------------- */
  function texOf(matName) {
    const id = BY_NAME[matName];
    if (id == null) return { all: 'stone' };
    const t = BLOCKS[id].tex;
    return { top: t.top, bottom: t.bottom, side: t.side };
  }
  const B = (SH.B = new Proxy({}, {
    get(_, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'stair') return (mat, dir, flip) => {
        const nm = 'STAIR$' + mat + '$' + dir + (flip ? '$F' : '');
        if (BY_NAME[nm] != null) return BY_NAME[nm];
        return defBlock(nm, { shape: flip ? 'stair_f' : 'stair', tex: texOf(mat), opaque: false, cull: 'cutout', data: { dir } });
      };
      if (key === 'slab') return (mat, top) => {
        const nm = 'SLAB$' + mat + (top ? '$T' : '');
        if (BY_NAME[nm] != null) return BY_NAME[nm];
        return defBlock(nm, { shape: top ? 'slab_t' : 'slab', tex: texOf(mat), opaque: false, cull: 'cutout' });
      };
      if (key === 'fence') return (mat) => {
        const nm = 'FENCE$' + mat;
        if (BY_NAME[nm] != null) return BY_NAME[nm];
        return defBlock(nm, { shape: 'fence', tex: texOf(mat), opaque: false, cull: 'cutout' });
      };
      if (key === 'wall') return (mat) => {
        const nm = 'WALL$' + mat;
        if (BY_NAME[nm] != null) return BY_NAME[nm];
        return defBlock(nm, { shape: 'wallblock', tex: texOf(mat), opaque: false, cull: 'cutout' });
      };
      if (key === 'pillar') return (mat) => { // 12/16 centered column, full height
        const nm = 'PILLAR$' + mat;
        if (BY_NAME[nm] != null) return BY_NAME[nm];
        return defBlock(nm, { shape: 'pillarblock', tex: texOf(mat), opaque: false, cull: 'cutout' });
      };
      const id = BY_NAME[key];
      if (id == null) {
        if (!SH._warned) SH._warned = {};
        if (!SH._warned[key]) { SH._warned[key] = 1; (SH.warnings = SH.warnings || []).push('Unknown block: ' + key); }
        return BY_NAME['STONE'];
      }
      return id;
    }
  }));
})();
