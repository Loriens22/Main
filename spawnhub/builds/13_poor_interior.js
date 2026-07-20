/* =========================================================================
 * POOR COMPLEX — P4 INTERIORS (order 13)
 * Furnishes the shell built by 10_poor_shell.js (order 10):
 *   footprint x64..88 / z178..214, interior x65..87 / z179..213,
 *   floor plates y37/42/47/52/57 -> rooms walk at y34 (ground), 38/43/48/53.
 * Program:
 *   - C ground hall (x65..83, z199..213): communal lobby + LIBRARY corner
 *     at z209..213 (2-high bookshelf walls, lectern, red carpet) glowing
 *     through the colonnade like the reference shot.
 *   - Section A (z179..188): ground workshop + one cozy apartment per level
 *     (y38/43/48/53).
 *   - Section C (z199..213): two apartments per level (y38/43/48), spruce
 *     partition at z206 with a door gap (partition stops at x86 so the
 *     z205-206 front window column stays clear).
 *   - Section B (z191..196): elevator landings lit with lanterns + runners.
 *     (Never touches the stair block x66..71 or elevator x81..84/z192..195.)
 *   - Basement (walk y29, x67..85 / z192..211): barrel+chest rows, cobwebs,
 *     mushrooms, soul lanterns; x<=76 / z<=197 kept clear for P1's stair.
 * Every room gets a real light source; wool pelmets hang over the windows.
 * Exterior walls are never altered — only hung on from inside.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('poor_interior', 13, [52, 168, 100, 232], function (W, B) {

    /* ------------------------------ helpers ------------------------------ */
    function h(x, z) { // deterministic hash 0..1
      let n = (x * 374761393 + z * 668265263) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) % 1000 / 1000;
    }
    const lan   = (x, y, z) => W.set(x, y, z, B.LANTERN);
    const hang  = (x, y, z) => W.set(x, y, z, B.LANTERN_HANGING);
    const twall = (x, y, z, d) => W.set(x, y, z, B['TORCH_WALL_' + d]);
    const paint = (x, y, z, d, big) => W.set(x, y, z, B[(big ? 'PAINTING2_' : 'PAINTING1_') + d]);
    const frame = (x, y, z, it, d) => W.set(x, y, z, B['FRAME_' + it + '_' + d]);
    const rug   = (x1, z1, x2, z2, y, col) => W.fill(x1, y, z1, x2, y, z2, B['CARPET_' + col]);
    // wool pelmet strip hung on the inside of the front wall (x=88)
    const pelmet = (y, z1, z2, col) => W.fill(87, y, z1, 87, y, z2, B['WOOL_' + col]);

    /* One cozy apartment. Bounds are the interior air rect, fy = walk level
     * (room air is fy..fy+3, plate above at fy+4). West wall (x64) is always
     * exterior; z1/z2 rows keep x73..78 free so partition door gaps at x~75
     * stay walkable. */
    function apartment(o) {
      const x1 = o.x1, x2 = o.x2, z1 = o.z1, z2 = o.z2, fy = o.fy;
      const cx = (x1 + x2) >> 1, cz = (z1 + z2) >> 1, topY = fy + 3;
      // sleeping corner against the west wall (NW)
      W.bed(x1, fy, z1 + 1, o.bed, 'E');
      W.set(x1, fy, z1, B.CHEST);
      W.set(x1, fy, z1 + 3, B.BARREL);              // nightstand
      lan(x1, fy + 1, z1 + 3);                      // reading lamp on it
      twall(x1, fy + 2, z1 + 1, 'W');               // torch over the bed
      // kitchenette along the z1 wall, west of the door-clear zone
      W.set(x1 + 3, fy, z1, o.smoker ? B.SMOKER : B.FURNACE);
      W.set(x1 + 4, fy, z1, B.BARREL);
      W.set(x1 + 5, fy, z1, B.CAULDRON);
      W.slab(x1 + 6, fy, z1, 'SPRUCE_PLANKS', true); // counter top
      // rug + dining set in the middle of the room
      rug(cx - 1, cz - 1, cx + 1, cz + 1, fy, o.rug);
      W.table(cx, fy, cz);
      W.chair(cx - 1, fy, cz, o.wood, 'W');
      W.chair(cx + 1, fy, cz, o.wood, 'E');
      hang(cx, topY, cz);                           // main ceiling lantern
      if (o.hang2) hang(o.hang2[0], topY, o.hang2[1]); // extra light (big rooms)
      // wall deco + plant
      paint(x1, fy + 2, cz, 'W', h(x1, fy) > 0.5);  // painting on west wall
      if (o.frameZ) frame(x2, fy + 2, o.frameZ, o.frameItem || 'MAP', 'E');
      W.set(x2, fy, z2, B[o.plant]);                // potted plant by the window
      // occasional variety pieces
      if (o.jukebox) W.set(x2, fy, z1, B.JUKEBOX);
      if (o.shelves) W.fill(x1, fy, z2 - 1, x1, fy + 1, z2, B.BOOKSHELF);
      if (o.armor)   W.set(x2 - 1, fy, z2 - 1, B.ARMOR_STAND);
      if (o.pelmet)  pelmet(o.pelmet[0], o.pelmet[1], o.pelmet[2], o.pelmet[3]);
    }

    /* =====================================================================
     * SECTION A — z179..188 (one apartment per level + ground workshop)
     * Front windows: purple z181-182 (y44-45, y54-55), clear z185-186
     * (y39-40, y49-50) -> pelmets sized per level.
     * ===================================================================== */
    (function sectionA() {
      // ---- ground workshop / communal store room (walk y34, air 34..36)
      W.set(66, 34, 179, B.CRAFTING_TABLE);
      W.set(67, 34, 179, B.CRAFTING_TABLE);
      W.set(65, 34, 181, B.CAULDRON);
      W.set(65, 34, 182, B.COMPOSTER);
      W.set(65, 34, 184, B.BARREL); W.set(65, 35, 184, B.BARREL);
      W.set(65, 34, 185, B.BARREL);
      W.set(65, 34, 186, B.CHEST);
      W.set(87, 34, 179, B.CHEST); W.set(87, 34, 180, B.CHEST);
      W.set(87, 35, 179, B.BARREL);
      W.set(87, 34, 186, B.ARMOR_STAND);
      W.table(76, 34, 183);
      W.chair(75, 34, 183, 'SPRUCE_PLANKS', 'W');
      W.chair(77, 34, 183, 'SPRUCE_PLANKS', 'E');
      W.set(70, 34, 187, B.HAY_BALE);
      W.set(71, 34, 187, B.PUMPKIN);
      twall(65, 36, 180, 'W'); twall(65, 36, 187, 'W');
      hang(70, 36, 183); hang(81, 36, 184);
      paint(65, 35, 183, 'W', true);
      frame(87, 36, 183, 'PICK', 'E');
      // ---- the four apartments above
      const A = [
        { fy: 38, bed: 'RED',    rug: 'RED',      wood: 'SPRUCE_PLANKS', smoker: false,
          plant: 'POTTED_FERN',      jukebox: true,                 frameZ: 183, frameItem: 'SWORD',
          pelmet: [41, 184, 187, 'RED'] },
        { fy: 43, bed: 'CYAN',   rug: 'LIGHTBLUE', wood: 'OAK_PLANKS',   smoker: true,
          plant: 'POTTED_TULIP_RED', shelves: true, armor: true,    frameZ: 183, frameItem: 'MAP',
          pelmet: [46, 180, 183, 'PURPLE'] },
        { fy: 48, bed: 'LIME',   rug: 'GREEN',    wood: 'SPRUCE_PLANKS', smoker: false,
          plant: 'POTTED_BAMBOO',    shelves: true,                 frameZ: 183, frameItem: 'BOOK',
          pelmet: [51, 184, 187, 'WHITE'] },
        { fy: 53, bed: 'PURPLE', rug: 'PURPLE',   wood: 'DARK_OAK_PLANKS', smoker: true,
          plant: 'POTTED_AZALEA',    jukebox: true, armor: true,    frameZ: 183, frameItem: 'ARMOR',
          pelmet: [56, 180, 183, 'MAGENTA'] },
      ];
      for (const o of A) {
        o.x1 = 65; o.x2 = 87; o.z1 = 179; o.z2 = 188;
        o.hang2 = [82, 183];              // second lantern — these rooms are 23 wide
        apartment(o);
      }
    })();

    /* =====================================================================
     * SECTION C — ground hall + library, then 2 apartments per level.
     * Ground hall interior x65..83 (gallery + x84 wall are P1's), z199..213.
     * ===================================================================== */
    (function groundHall() {
      // crafting corner against the B/C partition (z198), clear of the x~75 gap
      W.set(66, 34, 199, B.CRAFTING_TABLE);
      W.set(67, 34, 199, B.CRAFTING_TABLE);
      W.set(69, 34, 199, B.ANVIL);
      W.set(70, 34, 199, B.CHEST);
      // smelting row against the west wall
      W.set(65, 34, 200, B.FURNACE);
      W.set(65, 34, 201, B.BLAST_FURNACE);
      W.set(65, 34, 202, B.SMOKER);
      W.set(65, 34, 204, B.BARREL); W.set(65, 35, 204, B.BARREL);
      W.set(65, 34, 205, B.CHEST);
      // two table+chair sets on a worn brown rug
      rug(71, 202, 73, 204, 34, 'BROWN');
      W.table(72, 34, 203);
      W.chair(71, 34, 203, 'SPRUCE_PLANKS', 'W');
      W.chair(73, 34, 203, 'SPRUCE_PLANKS', 'E');
      W.table(78, 34, 204);
      W.chair(78, 34, 203, 'OAK_PLANKS', 'N');
      W.chair(78, 34, 205, 'OAK_PLANKS', 'S');
      // deco + plants
      paint(65, 35, 207, 'W', true);
      paint(69, 35, 199, 'N', false);
      W.set(65, 34, 208, B.POTTED_CORNFLOWER);
      W.set(83, 34, 199, B.POTTED_DANDELION);
      // light: hanging lanterns under the y37 plate + wall torches
      hang(68, 36, 201); hang(76, 36, 200); hang(80, 36, 204); hang(70, 36, 206);
      twall(65, 36, 199, 'W'); twall(66, 36, 213, 'S');
    })();

    (function library() {                // z209..213 — the reference's glow
      // 2-high shelf walls: along the south wall and the west wall
      W.fill(67, 34, 213, 77, 35, 213, B.BOOKSHELF);
      W.fill(65, 34, 209, 65, 35, 212, B.BOOKSHELF);
      // red carpet reading floor
      rug(66, 209, 76, 212, 34, 'RED');
      W.set(70, 34, 211, B.LECTERN);
      W.table(74, 34, 210);
      W.chair(75, 34, 210, 'DARK_OAK_PLANKS', 'E');
      W.chair(73, 34, 210, 'DARK_OAK_PLANKS', 'W');
      // warm light spilling out: lanterns on shelf tops + hanging
      lan(65, 36, 211); lan(71, 36, 213); lan(77, 36, 213);
      hang(75, 36, 212); hang(68, 36, 210);
      frame(69, 36, 213, 'BOOK', 'S');
      frame(73, 36, 213, 'MAP', 'S');
      W.set(66, 34, 213, B.POTTED_FERN);
      W.set(80, 34, 212, B.POTTED_TULIP_PINK);
    })();

    /* ---- C upper levels: partition at z206 (stops at x86 to keep the
     *      z205-206 window column clear) + two apartments per level ---- */
    (function cApartments() {
      const north = [
        { fy: 38, bed: 'YELLOW', rug: 'YELLOW',    wood: 'SPRUCE_PLANKS', smoker: true,
          plant: 'POTTED_POPPY',       jukebox: true,               frameZ: 203, frameItem: 'POTION' },
        { fy: 43, bed: 'WHITE',  rug: 'LIGHTGRAY', wood: 'OAK_PLANKS',    smoker: false,
          plant: 'POTTED_OXEYE_DAISY', shelves: true,               frameZ: 203, frameItem: 'SWORD' },
        { fy: 48, bed: 'ORANGE', rug: 'ORANGE',    wood: 'SPRUCE_PLANKS', smoker: true,
          plant: 'POTTED_CACTUS',      armor: true,                 frameZ: 203, frameItem: 'PICK' },
      ];
      const south = [
        { fy: 38, bed: 'BLUE',  rug: 'BLUE',  wood: 'DARK_OAK_PLANKS', smoker: false,
          plant: 'POTTED_ALLIUM',      shelves: true,               frameZ: 208, frameItem: 'MAP' },
        { fy: 43, bed: 'PINK',  rug: 'PINK',  wood: 'BIRCH_PLANKS',    smoker: true,
          plant: 'POTTED_TULIP_WHITE', jukebox: true,               frameZ: 208, frameItem: 'BOOK' },
        { fy: 48, bed: 'GREEN', rug: 'LIME',  wood: 'SPRUCE_PLANKS',   smoker: false,
          plant: 'POTTED_AZALEA',      armor: true,                 frameZ: 208, frameItem: 'ARMOR' },
      ];
      const pelmetCols = ['ORANGE', 'LIGHTGRAY', 'CYAN'];
      for (let i = 0; i < 3; i++) {
        const fy = 38 + i * 5;
        // spruce partition wall with a door + two little interior windows
        W.fill(65, fy, 206, 86, fy + 3, 206, B.SPRUCE_PLANKS);
        W.clear(75, fy, 206, 75, fy + 1, 206);
        W.door(75, fy, 206, 'SPRUCE_DOOR', 'S');
        W.set(70, fy + 1, 206, B.GLASS_PANE);
        W.set(80, fy + 1, 206, B.GLASS_PANE);
        twall(70, fy + 2, 205, 'S');            // lamps on the partition faces
        twall(80, fy + 2, 207, 'N');
        // the two apartments
        const n = north[i]; n.x1 = 65; n.x2 = 87; n.z1 = 199; n.z2 = 205; apartment(n);
        const s = south[i]; s.x1 = 65; s.x2 = 87; s.z1 = 207; s.z2 = 213; apartment(s);
        // wool pelmets over the three front window bays of this level
        const col = pelmetCols[i], py = fy + 3;
        pelmet(py, 199, 202, col);
        pelmet(py, 204, 207, col);
        pelmet(py, 209, 212, col);
      }
    })();

    /* =====================================================================
     * SECTION B — elevator landings (z191..196). Stairs live at x66..71,
     * the glassed elevator at x81..84/z192..195: only the x72..80 landing
     * strip is furnished. Torches sit on the section partitions.
     * ===================================================================== */
    (function landings() {
      for (const fy of [34, 38, 43, 48, 53]) {
        rug(75, 193, 80, 194, fy, 'GRAY');       // runner to the shaft opening
        hang(74, fy + 3, 193);
        hang(79, fy + 3, 195);
        twall(73, fy + 2, 191, 'N');
        twall(73, fy + 2, 196, 'S');
      }
      // ground entrance nook by the front door (x=88, z=195)
      rug(85, 194, 87, 196, 34, 'GRAY');
      hang(86, 36, 192); hang(86, 36, 196);
      W.set(85, 34, 191, B.BARREL);
      W.set(86, 34, 191, B.POTTED_FERN);
    })();

    /* =====================================================================
     * BASEMENT — shell floor y28, walk y29, air 29..31, ceiling y32.
     * Interior x67..85 / z192..211; x<=76 & z<=197 left clear for the stair.
     * ===================================================================== */
    (function basement() {
      const clear = (x, z) => (x <= 76 && z <= 197);
      // storage rows: west wall (under C), east wall, south wall
      for (let z = 199; z <= 210; z++) {
        const r = h(67, z);
        if (r < 0.45) { W.set(67, 29, z, B.BARREL); if (r < 0.2) W.set(67, 30, z, B.BARREL); }
        else if (r < 0.8) W.set(67, 29, z, B.CHEST);
      }
      for (let z = 193; z <= 209; z++) {
        if (clear(85, z)) continue;
        const r = h(85, z);
        if (r < 0.4) { W.set(85, 29, z, B.CHEST); if (r < 0.15) W.set(85, 30, z, B.BARREL); }
        else if (r < 0.78) W.set(85, 29, z, B.BARREL);
      }
      for (let x = 69; x <= 83; x++) {
        const r = h(x, 211);
        if (r < 0.5) { W.set(x, 29, 211, B.BARREL); if (r < 0.22) W.set(x, 30, 211, B.BARREL); }
        else if (r < 0.75) W.set(x, 29, 211, B.CHEST);
      }
      // two free-standing crate aisles in the middle
      for (let x = 72; x <= 78; x++) {
        if (h(x, 203) < 0.75) W.set(x, 29, 203, h(x, 1) < 0.5 ? B.BARREL : B.CHEST);
        if (h(x, 207) < 0.75) W.set(x, 29, 207, h(x, 2) < 0.5 ? B.CHEST : B.BARREL);
      }
      W.set(78, 30, 203, B.BARREL); W.set(74, 30, 207, B.BARREL);
      // cobwebs in ceiling corners + over the clutter
      for (let z = 192; z <= 211; z++) for (let x = 67; x <= 85; x++) {
        if (clear(x, z)) continue;
        const r = h(x * 3, z * 7);
        if (r < 0.055 && W.get(x, 31, z) === 0) W.set(x, 31, z, B.COBWEB);
        else if (r > 0.94 && W.get(x, 29, z) === 0)
          W.set(x, 29, z, r > 0.97 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN);
      }
      W.set(67, 31, 192, B.COBWEB); W.set(85, 31, 211, B.COBWEB);
      W.set(67, 31, 211, B.COBWEB); W.set(84, 31, 193, B.COBWEB);
      W.set(67, 30, 199, B.COBWEB);
      // soul lanterns — dim blue storage-cellar mood
      const souls = [[70, 200], [78, 199], [74, 205], [82, 203], [70, 209], [80, 210], [84, 196]];
      for (const [x, z] of souls) W.set(x, 31, z, B.SOUL_LANTERN_HANGING);
      W.set(80, 29, 201, B.SOUL_LANTERN);
      lan(77, 29, 197);                      // one warm lantern at the stair foot
    })();
  });
})();
