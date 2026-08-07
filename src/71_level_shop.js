/* =====================================================================
 * 71_level_shop.js — Steve's shop: the playable chapter, and the backing
 * set the shop cutscenes (c1_open, c2_brief, c7_home) are shot in.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var K = SG.kit;
  var util = SG.util;

  /* Interior: 11 m × 8.4 m, 2.9 m to the ceiling tiles.
   * Front (south, z = -4.2) is the glass storefront onto the car park.
   * The counter divides customer side (z < -0.9) from Steve's bench. */
  var X0 = -5.5, X1 = 5.5, Z0 = -4.2, Z1 = 4.2, H = 2.9;

  /* Where the front door actually is, in world x. */
  var DOOR_X = -2.1;

  /* World x -> distance along the south wall, which K.room builds from the
   * +x end. The north wall runs the other way, and happens to use the same
   * conversion because it is the same width. */
  function SX(x) { return X1 - x; }

  /* ------------------------------------------------------------------ */
  /* Shared construction                                                 */
  /* ------------------------------------------------------------------ */

  function buildShop(ctx, opts) {
    opts = opts || {};
    var P = ctx.props;

    /* ---- shell ---- */
    K.room(ctx, {
      name: 'shop',
      x0: X0, x1: X1, z0: Z0, z1: Z1, h: H,
      floorMat: K.M('carpetOffice', { color: 0x4a4b48, roughness: 1 }),
      wallMat: K.M('drywall', { color: 0xcfc9ba, roughness: 0.95 }),
      ceilMat: K.M('ceilingTile', { color: 0xe4e1d7, roughness: 1 }),
      floorTag: 'carpet',
      openings: {
        /* The south wall is built right-to-left (from x=+5.5 to x=-5.5), so a
         * hole's `at` is its distance from the RIGHT end, not a world x.
         * SX() does that conversion, because doing it in my head is exactly
         * how the door hole ended up 4.2 m from the door. */
        s: [
          { at: SX(DOOR_X), w: 1.10, y0: 0, y1: 2.10 },                 /* door */
          { at: SX(-4.20), w: 2.40, y0: 0.55, y1: 2.35, noReveal: true },
          { at: SX(1.40), w: 5.40, y0: 0.55, y1: 2.35, noReveal: true }
        ],
        n: [{ at: SX(-4.50), w: 0.95, y0: 0, y1: 2.05 }]              /* storeroom */
      }
    });
    K.skirting(ctx, X0 + 0.09, X1 - 0.09, Z0 + 0.09, Z1 - 0.09,
      { mat: K.M('rubber', { color: 0x2b2b2c, roughness: 0.9 }) });

    /* Glazing for the shop front. */
    var glassMat = K.M('glass', {
      color: 0xdfeef0, roughness: 0.06, metalness: 0,
      transparent: true, opacity: 0.22
    });
    var glass = new THREE.Group();
    K.box(glass, glassMat, -4.20, 1.45, Z0 + 0.02, 2.40, 1.8, 0.012);
    K.box(glass, glassMat, 1.40, 1.45, Z0 + 0.02, 5.40, 1.8, 0.012);
    glass.traverse(function (o) { if (o.isMesh) { o.castShadow = false; } });
    ctx.add(glass);
    /* Mullions. */
    var mull = new THREE.Group();
    var alu = K.M('aluminium', { color: 0x9aa0a4, roughness: 0.4, metalness: 0.95 });
    [-5.40, -3.00, -1.30, 1.40, 4.10].forEach(function (x) {
      K.box(mull, alu, x, 1.45, Z0 + 0.02, 0.06, 1.86, 0.06);
    });
    /* Head and cill rails, broken around the doorway. */
    [[-4.20, 2.40], [1.40, 5.40]].forEach(function (p) {
      K.box(mull, alu, p[0], 0.53, Z0 + 0.02, p[1], 0.07, 0.07);
      K.box(mull, alu, p[0], 2.38, Z0 + 0.02, p[1], 0.07, 0.07);
    });
    K.freeze(ctx, mull);

    /* ---- lights ---- */
    K.ambient(ctx, { sky: 0xcfe0f0, ground: 0x4a4034, intensity: 0.5 });
    K.lightGrid(ctx, [
      [-3.2, 2.82, -2.4], [0.4, 2.82, -2.4], [3.6, 2.82, -2.4],
      [-3.2, 2.82, 1.2], [0.4, 2.82, 1.2], [3.6, 2.82, 1.2],
      [-1.4, 2.82, 3.4]
    ], { w: 1.22, d: 0.3, real: SG.qpick(1, 2, 3), intensity: 7.5, dist: 8.5 });

    /* Late afternoon sun through the storefront — the shop's whole mood. */
    K.keyLight(ctx, [-6, 6.5, -12], [-1, 1, 1], {
      color: 0xffd9a8, intensity: 2.1, radius: 9, far: 34
    });

    K.motes(ctx, {
      count: SG.qpick(0, 90, 170),
      bounds: { x: 5, y: 2.4, z: 4, cx: -0.5, cy: 1.4, cz: 0 }
    });

    /* ---- the car park outside ---- */
    buildLot(ctx);

    /* ---- counter, customer side ---- */
    var counter = ctx.prop('counterDesk', { w: 3.6 });
    K.at(counter, -2.6, 0, -0.95);
    ctx.box(-2.6, 0.53, -0.95, 3.6, 1.06, 0.62, 0, 'counter');
    P.counter = counter;

    var reg = ctx.prop('cashRegister');
    K.at(reg, -3.9, 1.06, -0.95, -0.3);
    ctx.interact({
      object: reg, label: 'the register', verb: 'Check', radius: 1.5,
      onUse: function () {
        ctx.sfx('cashRegister');
        ctx.say('shop.register');
        ctx.egg('register', 'Cash only');
      }
    });

    /* A gap in the counter run at x ≈ 0 lets the player behind. */
    var chairs = new THREE.Group();
    [[-4.6, -3.3, 0.1], [-3.75, -3.3, 0.1], [-2.9, -3.3, 0.1]].forEach(function (c) {
      var ch = SG.models.waitingChair ? SG.models.waitingChair({}) : null;
      if (ch) { K.at(ch, c[0], 0, c[1], c[2]); chairs.add(ch); }
    });
    ctx.add(chairs);
    ctx.box(-3.75, 0.42, -3.3, 2.6, 0.85, 0.5, 0, 'furniture');

    var plant = ctx.prop('plantPotted', { h: 1.3 });
    K.at(plant, 4.55, 0, -3.4, 0.5);
    ctx.box(4.55, 0.5, -3.4, 0.5, 1.0, 0.5, 0, 'furniture');

    var mag = ctx.prop('binMetal');
    K.at(mag, -5.05, 0, -2.2);

    /* ---- Steve's side: the bench ---- */
    var bench = ctx.prop('benchTable', { w: 3.2, d: 0.78 });
    K.at(bench, -2.2, 0, 3.55);
    ctx.box(-2.2, 0.45, 3.55, 3.2, 0.9, 0.78, 0, 'bench');
    P.bench = bench;

    var mat0 = ctx.prop('antistaticMat');
    K.at(mat0, -2.4, 0.9, 3.5);

    /* Ms. Ellis's machine, opened up on the bench. */
    var tower = ctx.prop('pcTowerOpen', { beige: true });
    K.at(tower, -2.55, 0.9, 3.45, Math.PI * 0.08);
    P.tower = tower;

    var crt = ctx.prop('crtMonitor');
    K.at(crt, -0.75, 0.9, 3.62, -0.34);
    P.crt = crt;

    var kb = ctx.prop('keyboardBeige');
    K.at(kb, -0.85, 0.9, 3.05, -0.3);
    P.keyboard = kb;
    var mouse = ctx.prop('mouseBall');
    K.at(mouse, -0.1, 0.9, 3.02, -0.2);

    var drivers = ctx.prop('screwdriverSet');
    K.at(drivers, -3.6, 0.91, 3.3, 0.4);
    P.drivers = drivers;

    var duck = ctx.prop('rubberDuck');
    K.at(duck, -1.55, 0.9, 3.86, -0.8);
    P.duck = duck;

    var mug = ctx.prop('coffeeMug', { text: "WORLD'S OKAYEST TECH" });
    K.at(mug, -1.2, 0.9, 3.25, 0.9);
    P.mug = mug;

    var lamp = ctx.prop('deskLamp');
    K.at(lamp, -3.95, 0.9, 3.85, 0.7);
    var lampLight = new THREE.PointLight(0xffd9a0, 3.2, 3.2, 2);
    lampLight.position.set(-3.7, 1.55, 3.6);
    ctx.add(lampLight);

    var solder = ctx.prop('solderStation');
    K.at(solder, -0.05, 0.9, 3.85, -0.15);
    var meter = ctx.prop('multimeter');
    K.at(meter, 0.62, 0.9, 3.45, 0.5);

    /* Second bench along the east wall. */
    var bench2 = ctx.prop('benchTable', { w: 2.6, d: 0.7 });
    K.at(bench2, 4.9, 0, 1.6, Math.PI / 2);
    ctx.box(4.9, 0.45, 1.6, 0.7, 0.9, 2.6, 0, 'bench');

    var lap1 = ctx.prop('laptopOld', { open: true });
    K.at(lap1, 4.85, 0.9, 2.35, -Math.PI / 2 + 0.2);
    var lap2 = ctx.prop('laptopModern', { open: false });
    K.at(lap2, 4.85, 0.9, 1.35, -Math.PI / 2 - 0.3);
    var tower2 = ctx.prop('pcTowerGaming');
    K.at(tower2, 4.7, 0, 0.05, -0.4);
    ctx.box(4.7, 0.24, 0.05, 0.24, 0.48, 0.46, 0, 'furniture');
    var printer = ctx.prop('printerOld');
    K.at(printer, 4.8, 0.9, 0.75, -Math.PI / 2);

    /* ---- shelving, west wall ---- */
    var shelfA = ctx.prop('shelfUnit', { w: 1.8, h: 2.1, bays: 4 });
    K.at(shelfA, -5.1, 0, 2.6, Math.PI / 2);
    ctx.box(-5.1, 1.05, 2.6, 0.42, 2.1, 1.8, 0, 'furniture');
    var shelfB = ctx.prop('shelfUnit', { w: 1.6, h: 2.1, bays: 4 });
    K.at(shelfB, -5.1, 0, 0.6, Math.PI / 2);
    ctx.box(-5.1, 1.05, 0.6, 0.42, 2.1, 1.6, 0, 'furniture');

    var bins = new THREE.Group();
    var binPos = [[-4.95, 1.32, 3.1], [-4.95, 1.32, 2.6], [-4.95, 1.32, 2.1],
    [-4.95, 0.92, 3.1], [-4.95, 0.92, 2.6]];
    binPos.forEach(function (b, i) {
      var pb = SG.models.partsBin ? SG.models.partsBin({ label: ['CR2032', 'SATA', 'M.2', 'FANS', 'PSU'][i] }) : null;
      if (pb) { K.at(pb, b[0], b[1], b[2], Math.PI / 2); bins.add(pb); }
    });
    ctx.add(bins);
    P.partsBin = bins.children[0] || bins;

    var boxes = new THREE.Group();
    [[-4.9, 0, 4.0, 0.2], [-4.4, 0, 4.05, -0.35], [-4.65, 0.34, 4.0, 0.9]].forEach(function (b) {
      var cb = SG.models.cardboardBox ? SG.models.cardboardBox({}) : null;
      if (cb) { K.at(cb, b[0], b[1], b[2], b[3]); boxes.add(cb); }
    });
    K.freeze(ctx, boxes);
    ctx.box(-4.7, 0.3, 4.0, 1.2, 0.6, 0.5, 0, 'furniture');

    var chest = ctx.prop('toolChest');
    K.at(chest, -5.05, 0, -0.9, Math.PI / 2);
    ctx.box(-5.05, 0.45, -0.9, 0.45, 0.9, 0.8, 0, 'furniture');
    P.chest = chest;

    var ups = ctx.prop('ups');
    K.at(ups, -4.4, 0, 3.95, 0);

    /* The warm PSU on the shelf where Kernel sleeps. */
    var psu = ctx.prop('psu');
    K.at(psu, -5.0, 1.72, 1.1, Math.PI / 2);
    var catBed = ctx.prop('catBed');
    K.at(catBed, -4.9, 1.78, 0.35);
    P.catBed = catBed;

    /* ---- wall dressing ---- */
    var walls = new THREE.Group();
    var posters = [
      ['posterA', -0.4, 1.75, Z1 - 0.09, Math.PI],
      ['posterB', 2.2, 1.7, Z1 - 0.09, Math.PI],
      ['posterC', X0 + 0.09, 1.72, -2.6, Math.PI / 2]
    ];
    posters.forEach(function (p) {
      var po = SG.models.poster ? SG.models.poster({ which: p[0] }) : null;
      if (po) { K.at(po, p[1], p[2], p[3], p[4]); walls.add(po); }
    });
    var clock = SG.models.clockWall ? SG.models.clockWall({}) : null;
    if (clock) { K.at(clock, 1.1, 2.28, Z1 - 0.1, Math.PI); walls.add(clock); }
    var cal = SG.models.calendar ? SG.models.calendar({}) : null;
    if (cal) { K.at(cal, 3.3, 1.85, Z1 - 0.1, Math.PI); walls.add(cal); }
    ctx.add(walls);
    P.clock = clock;

    var wb = ctx.prop('whiteboard', { w: 1.6, h: 1.0 });
    K.at(wb, 3.05, 1.55, Z1 - 0.1, Math.PI);
    P.whiteboard = wb;

    /* ---- the front door ---- */
    var door = K.door(ctx, {
      pos: [DOOR_X, 0, Z0 + 0.02], yaw: 0, w: 1.06, h: 2.1, swing: -1,
      mat: K.M('glass', {
        color: 0xdfeef0, roughness: 0.08, transparent: true, opacity: 0.3
      }),
      label: 'the front door', sfx: 'doorOpen',
      interact: true, tag: 'door'
    });
    P.door = door;
    /* The chime lives above it and is a character in its own right. */
    var chimeBox = K.box(null, K.M('beigePlastic', { color: 0xd6cdb8, roughness: 0.75 }),
      0, 0, 0, 0.09, 0.05, 0.03);
    chimeBox.position.set(DOOR_X, 2.2, Z0 + 0.1);
    ctx.add(chimeBox);

    /* Storeroom door — always locked, and Steve has a line about it. */
    var back = K.door(ctx, {
      pos: [-4.5, 0, Z1 - 0.02], yaw: Math.PI, w: 0.95, h: 2.05,
      label: 'the storeroom', interact: true,
      onUse: function () {
        ctx.sfx('doorSteel', { vol: 0.5 });
        ctx.say('shop.storeroom');
        ctx.egg('storeroom', 'Not for customers');
      }
    });

    /* ---- retro shelf, the museum ---- */
    var retro = new THREE.Group();
    var retroItems = [
      ['floppyBox', -3.4, 1.9, 4.02, 0.1],
      ['cdSpindle', -2.8, 1.9, 4.02, 0],
      ['tapeDrive', -2.2, 1.9, 4.0, -0.1],
      ['vhsTape', -1.7, 1.9, 4.02, 0.3],
      ['routerBox', -1.2, 1.9, 4.0, 0]
    ];
    var shelfPlank = K.box(retro, K.M('laminate', { color: 0x9c8a72, roughness: 0.6 }),
      -2.4, 1.86, 4.0, 3.0, 0.04, 0.28);
    retroItems.forEach(function (r) {
      var o = SG.models[r[0]] ? SG.models[r[0]]({}) : null;
      if (o) { K.at(o, r[1], r[2], r[3], r[4]); retro.add(o); }
    });
    ctx.add(retro);
    P.floppyBox = retro.children[1] || shelfPlank;

    var coffee = ctx.prop('coffeeMaker');
    K.at(coffee, 3.9, 0.9, 3.9, Math.PI);
    var sideTable = K.box(null, K.M('laminate', { color: 0x8c7a63, roughness: 0.6 }),
      3.9, 0.45, 3.9, 1.0, 0.9, 0.5);
    ctx.add(sideTable);
    ctx.box(3.9, 0.45, 3.9, 1.0, 0.9, 0.5, 0, 'furniture');
    P.coffeeMaker = coffee;

    var drawers = ctx.prop('drawerUnit');
    K.at(drawers, 1.9, 0, 3.9, Math.PI);
    ctx.box(1.9, 0.4, 3.9, 0.5, 0.8, 0.5, 0, 'furniture');
    P.drawers = drawers;

    var cables = ctx.prop('cableCoil');
    K.at(cables, 2.6, 0.02, 4.0, 0.4);

    /* Cable spaghetti under the bench — the detail that says "real shop". */
    if (SG.models.cableRun) {
      var runs = new THREE.Group();
      runs.add(SG.models.cableRun([
        [-3.6, 0.06, 3.9], [-3.0, 0.03, 3.95], [-2.2, 0.05, 3.88],
        [-1.4, 0.02, 3.95], [-0.7, 0.08, 3.8]
      ], { r: 0.011, color: 0x1b1b1e }));
      runs.add(SG.models.cableRun([
        [-2.55, 0.9, 3.2], [-2.3, 0.6, 3.0], [-1.9, 0.2, 3.4], [-1.2, 0.05, 3.9]
      ], { r: 0.008, color: 0x2a2a30 }));
      ctx.add(runs);
    }

    /* ---- the cat ---- */
    var cat = K.npc(ctx, 'cat', [-4.9, 1.82, 0.35], 1.2, { clip: 'catSleep' });
    P.cat = cat;

    ctx.state.flags['shop.catPets'] = ctx.state.flags['shop.catPets'] || 0;

    return P;
  }

  /* ------------------------------------------------------------------ */
  /* The car park                                                        */
  /* ------------------------------------------------------------------ */

  function buildLot(ctx) {
    var P = ctx.props;
    var lot = new THREE.Group();
    lot.name = 'lot';

    var asphalt = new THREE.Mesh(K.unitPlane(),
      K.M('asphalt', { color: 0x3b3d40, roughness: 0.98 }));
    asphalt.scale.set(34, 22, 1);
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(-1, -0.02, -14);
    asphalt.receiveShadow = true;
    lot.add(asphalt);
    ctx.box(-1, -0.18, -14, 34, 0.3, 22, 0, 'gravel');

    /* Parking bays. */
    var paint = new THREE.MeshBasicMaterial({ color: 0xd9d4c2 });
    paint.userData.shared = true;
    for (var i = 0; i < 7; i++) {
      var l = new THREE.Mesh(K.unitPlane(), paint);
      l.scale.set(0.1, 4.8, 1);
      l.rotation.x = -Math.PI / 2;
      l.position.set(-9 + i * 2.6, 0.005, -8.4);
      lot.add(l);
    }

    /* A flush concrete apron between the shopfront and the bays. This used
     * to be a raised kerb running the full width of the frontage — including
     * straight across the doorway, which is not how kerbs work and which
     * stopped you dead on the way to Ms. Ellis's car. */
    var apron = K.box(lot, K.M('concrete', { color: 0x8d8a84, roughness: 0.95 }),
      -1, 0.005, -5.4, 22, 0.01, 1.6);
    apron.castShadow = false;

    /* The shop's own facade, seen from outside through the glass. */
    var facade = new THREE.Group();
    var brick = K.M('brickPainted', { color: 0xa8a094, roughness: 0.95 });
    /* Broken around the shopfront — a solid 13.5 m slab here used to bury the
     * glazing and the door behind it. */
    K.box(facade, brick, -8.6, 1.9, -4.45, 6.2, 3.8, 0.4);
    K.box(facade, brick, 8.6, 1.9, -4.45, 6.2, 3.8, 0.4);
    K.box(facade, brick, 0, 3.15, -4.45, 11.2, 1.3, 0.4);
    K.box(facade, K.M('steelPainted', { color: 0x4d5257, roughness: 0.6, metalness: 0.5 }),
      0, 3.9, -4.6, 14, 0.35, 0.9);
    lot.add(facade);

    if (SG.models.neonSign) {
      var sign = SG.models.neonSign('STEVE\u2019S PC & LAPTOP REPAIR',
        { w: 4.6, h: 0.6, color: 0x39d98a });
      K.at(sign, -1.2, 3.35, -4.85);
      lot.add(sign);
      var glow = new THREE.PointLight(0x39d98a, 2.4, 6, 2);
      glow.position.set(-1.2, 3.2, -5.3);
      lot.add(glow);
      P.sign = sign;
    }

    /* Neighbouring units, deliberately dull. */
    var neigh = new THREE.Group();
    var beige = K.M('brickPainted', { color: 0x9a938a, roughness: 0.95 });
    K.box(neigh, beige, -11.5, 2.1, -4.6, 9, 4.2, 0.5);
    K.box(neigh, beige, 11.5, 2.1, -4.6, 9, 4.2, 0.5);
    K.box(neigh, K.M('glass', {
      color: 0x2b3a3d, roughness: 0.15, transparent: true, opacity: 0.7
    }), -11.5, 1.6, -4.3, 6, 1.8, 0.06);
    lot.add(neigh);
    ctx.box(-11.5, 2.1, -4.6, 9, 4.2, 0.6, 0, 'wall');
    ctx.box(11.5, 2.1, -4.6, 9, 4.2, 0.6, 0, 'wall');

    /* Ms. Ellis's Buick — big, beige, immaculate, twenty-two years old. */
    var buick = SG.models.taxiCar
      ? SG.models.taxiCar({ color: 0xd8d2bd, style: 'sedan', plate: 'ELLIS 1' })
      : null;
    if (buick) {
      K.at(buick, -3.6, 0, -8.5, Math.PI * 0.02);
      lot.add(buick);
      ctx.box(-3.6, 0.75, -8.5, 2.0, 1.5, 4.8, 0, 'car');
      P.buick = buick;
    }

    var other = SG.models.taxiCar ? SG.models.taxiCar({ color: 0x3d4a5c }) : null;
    if (other) {
      K.at(other, 3.6, 0, -8.6, -Math.PI * 0.01);
      lot.add(other);
      ctx.box(3.6, 0.75, -8.6, 2.0, 1.5, 4.8, 0, 'car');
    }

    if (SG.models.streetLamp) {
      [[-9.5, -9.5], [7.5, -9.5]].forEach(function (p) {
        var sl = SG.models.streetLamp({});
        K.at(sl, p[0], 0, p[1]);
        lot.add(sl);
        ctx.box(p[0], 2, p[1], 0.2, 4, 0.2, 0, 'pole');
      });
    }

    /* Far boundary so the player cannot walk to the horizon. */
    ctx.box(-1, 1.5, -24, 40, 3, 0.5, 0, 'wall');
    ctx.box(-19, 1.5, -14, 0.5, 3, 22, 0, 'wall');
    ctx.box(17, 1.5, -14, 0.5, 3, 22, 0, 'wall');

    /* A low hedge to hide the boundary. */
    var hedge = new THREE.Group();
    var green = K.M('hedge', { color: 0x3c5233, roughness: 1 });
    for (var h = 0; h < 22; h++) {
      var b = K.box(hedge, green, -18 + h * 1.7, 0.45, -23.4, 1.75, 0.9, 0.7);
      b.position.y += util.noise2(h * 3.1, 0) * 0.05;
    }
    K.freeze(ctx, hedge);

    ctx.add(lot);

    /* Evening sky. */
    var skyTex = K.T('skyGradient');
    if (skyTex) {
      var sky = new THREE.Mesh(
        new THREE.SphereGeometry(120, 20, 12),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
      );
      sky.name = 'sky';
      ctx.add(sky);
      ctx.scene.background = null;
    } else {
      ctx.scene.background = new THREE.Color('#c2a583');
    }
    ctx.scene.fog = new THREE.FogExp2(0xb99f83, 0.012);
    return lot;
  }

  /* ------------------------------------------------------------------ */
  /* The playable chapter                                                */
  /* ------------------------------------------------------------------ */

  var bios = null;
  var followTimer = 0;

  SG.levels.shop = {
    id: 'shop',
    music: 'shopAmbient',

    build: function (ctx) {
      /* Standing in the walkway past the end of the counter, facing the
       * bench: the spring-arm camera needs 2.6 m of clear floor behind the
       * player, and every other spot in here has furniture in it. */
      ctx.spawn = { pos: [0.5, 0, 1.6], yaw: 0 };
      var P = buildShop(ctx, { playable: true });

      /* Ms. Ellis is waiting at the counter; Oleg is by the door, patient. */
      var ellis = K.npc(ctx, 'msEllis', [-2.4, 0, -1.75], 0, { clip: 'idle' });
      P.ellis = ellis;
      var oleg = K.npc(ctx, 'oleg', [1.2, 0, -3.2], -0.35, { clip: 'idle' });
      P.oleg = oleg;

      ctx.objectives([
        { id: 'driver', text: 'Find your driver set' },
        { id: 'panel', text: 'Open the side panel' },
        { id: 'battery', text: 'Fetch a CR2032 from the bins' },
        { id: 'fit', text: 'Fit the new battery' },
        { id: 'clock', text: 'Boot it and set the clock' },
        { id: 'ellis', text: 'See Ms. Ellis out to her car' },
        { id: 'oleg', text: 'Attend to Mr. Thomas' }
      ]);

      SG.audio.ambience && ctx.sfx && SG.safe('amb', function () {
        SG.audio.ambience('shop');
      });

      wireRepair(ctx, P);
      wireDressing(ctx, P);
      wireEllisAndOleg(ctx, P, ellis, oleg);
      SG.eggs.registerShop && SG.eggs.registerShop(ctx, P);

      /* Steve talks to himself when he's been standing still too long. */
      var idle = 0, idleSaid = 0;
      ctx.every(function (dt) {
        if (!ctx.player || ctx.player.isMoving()) { idle = 0; return; }
        idle += dt;
        if (idle > 26) {
          idle = 0;
          ctx.say('steve.idle.' + (1 + (idleSaid++ % 4)));
        }
      });
    },

    update: function (dt, ctx) {
      followTimer += dt;
      /* Kernel follows once he's decided you're worth following. */
      var cat = ctx.props.cat;
      if (cat && cat.follow && ctx.state.flags['shop.catFollows'] && ctx.player) {
        cat.follow(ctx.player.root);
      }
    },

    dispose: function () {
      bios = null;
      if (SG.audio && SG.audio.ambience) SG.audio.ambience(null);
    }
  };

  /* ---- the repair itself ---- */

  function wireRepair(ctx, P) {
    var parts = (P.tower && P.tower.userData && P.tower.userData.parts) || {};

    /* 1. the driver set */
    K.pickup(ctx, {
      object: P.drivers, label: 'your driver set', item: 'drivers',
      verb: 'Take', hide: false, sfx: 'clipSnap', radius: 2.0,
      onTake: function () {
        ctx.done('driver');
        ctx.say('shop.drivers');
      }
    });

    /* 2. the side panel */
    K.hold(ctx, {
      object: parts.panel || P.tower,
      label: 'the side panel', verb: 'Unscrew', seconds: 2.4,
      radius: 2.3,
      condition: function () { return K.has(ctx, 'drivers') && !ctx.state.flags['shop.panelOff']; },
      sfx: 'screwdriver',
      onStart: function () { ctx.sfx('screwdriver', { vol: 0.7 }); },
      onDone: function () {
        ctx.state.flags['shop.panelOff'] = true;
        if (parts.panel) {
          var t = 0;
          var from = parts.panel.position.clone();
          ctx.every(function (dt) {
            if (t >= 1) return;
            t = Math.min(1, t + dt * 1.6);
            var e = util.ease.outCubic(t);
            parts.panel.position.x = from.x - e * 0.55;
            parts.panel.position.y = from.y - e * 0.9;
            parts.panel.rotation.z = -e * 0.4;
          });
        }
        ctx.sfx('caseOpen');
        ctx.done('panel');
        ctx.say('shop.panel');
      }
    });

    /* 3. the parts bin */
    K.pickup(ctx, {
      object: P.partsBin, label: 'a CR2032 cell', item: 'cr2032',
      verb: 'Take', hide: false, sfx: 'clipSnap', radius: 2.1,
      condition: function () { return ctx.state.flags['shop.panelOff']; },
      onTake: function () {
        ctx.done('battery');
        ctx.say('shop.cell');
      }
    });

    /* 4. fit it */
    K.hold(ctx, {
      object: parts.battery || P.tower,
      label: 'the coin cell', verb: 'Fit', seconds: 1.8, radius: 2.2,
      condition: function () {
        return K.has(ctx, 'cr2032') && !ctx.state.flags['shop.fitted'];
      },
      onDone: function () {
        ctx.state.flags['shop.fitted'] = true;
        ctx.sfx('clipSnap', { vol: 0.9 });
        ctx.done('fit');
        ctx.say('shop.fitted');
        if (bios) bios.setPowered(true);
      }
    });

    /* 5. the BIOS clock */
    bios = makeBios(ctx, P);
  }

  /* The CRT: off, then POST, then a BIOS date field the player sets by
   * pressing a single button. It doubles as an easter egg if you land on the
   * year that made a generation of technicians rich. */
  function makeBios(ctx, P) {
    var screenMesh = (P.crt && P.crt.userData && P.crt.userData.screen) || null;
    var state = {
      powered: false, phase: 'off', post: 0, year: 1998,
      day: 14, month: 3, saved: false, adventure: false, advLine: 0
    };

    var ADVENTURE = [
      '> YOU ARE IN A SMALL REPAIR SHOP.',
      '  A CAT IS ASLEEP ON THE POWER SUPPLY.',
      '> EXITS: FRONT DOOR, STOREROOM.',
      '> THERE IS A SCREWDRIVER HERE.',
      '> TAKE SCREWDRIVER',
      '  TAKEN. YOU FEEL PREPARED.',
      '> LOOK AT CAT',
      '  THE CAT IS NOT INTERESTED IN YOUR QUEST.'
    ];

    function draw(g, w, h, time) {
      K.termStyle(g, w, h, { size: Math.round(h / 18) });
      var lh = Math.round(h / 16);
      var pad = Math.round(w * 0.05);

      if (!state.powered) {
        g.fillStyle = '#050807';
        g.fillRect(0, 0, w, h);
        K.scanlines(g, w, h, 0.06);
        return;
      }

      if (state.phase === 'post') {
        K.termLines(g, [
          'Award Modular BIOS v4.51PG',
          'Copyright (C) 1984-98, Award Software, Inc.',
          '',
          'Pentium II  MMX  350MHz',
          'Memory Test : ' + Math.min(65536, Math.floor(state.post * 26000)) + 'K OK',
          '',
          state.post > 2.2 ? 'CMOS Battery ......... OK' : '',
          state.post > 2.6 ? 'Detecting IDE Primary Master ... WDC AC33100H' : '',
          state.post > 3.0 ? '' : '',
          state.post > 3.0 ? 'Press DEL to enter SETUP' : ''
        ], pad, pad, lh);
      } else if (state.phase === 'setup') {
        g.fillStyle = '#0b1c14';
        g.fillRect(pad * 0.5, pad * 0.5, w - pad, h - pad);
        g.fillStyle = '#39d98a';
        K.termLines(g, [
          'ROM PCI/ISA BIOS  —  STANDARD CMOS SETUP',
          '---------------------------------------------',
          '',
          '  Date (mm:dd:yy)  :  ' + pad2(state.month) + ' : ' + pad2(state.day) +
          ' : ' + state.year,
          '  Time (hh:mm:ss)  :  17 : 41 : 0' + (Math.floor(time) % 10),
          '',
          '  Drive A          :  1.44M, 3.5 in.',
          '  Drive C          :  Auto',
          '',
          '',
          state.saved ? '  SAVE to CMOS and EXIT (Y/N)? Y' : '  \u2191\u2193 change    F10 save & exit'
        ], pad, pad, lh);
        /* Blink the field being edited. */
        if (!state.saved && Math.floor(time * 2) % 2 === 0) {
          g.fillStyle = '#39d98a';
          g.fillRect(pad + lh * 12.9, pad + lh * 3 - 2, lh * 2.6, lh * 0.95);
          g.fillStyle = '#04120b';
          g.fillText(String(state.year), pad + lh * 13, pad + lh * 3);
        }
      } else if (state.phase === 'boot') {
        K.termLines(g, [
          'Starting Windows 98...',
          '',
          state.post > 1.4 ? 'C:\\>' : ''
        ], pad, pad, lh);
        if (state.post > 2.2) {
          g.fillStyle = '#7fd6ae';
          g.fillRect(w * 0.12, h * 0.3, w * 0.76, h * 0.42);
          g.fillStyle = '#0d2f22';
          g.font = Math.round(h / 20) + 'px ui-monospace, monospace';
          g.fillText('Windows 98', w * 0.16, h * 0.36);
          g.fillText('Second Edition', w * 0.16, h * 0.44);
        }
      } else if (state.phase === 'y2k') {
        g.fillStyle = '#12040a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ff6b6b';
        K.termLines(g, [
          'CMOS checksum  ... OK',
          'System date    ... 01 : 01 : 2000',
          '',
          '*** REAL TIME CLOCK ERROR ***',
          '',
          'The century byte is a lie.',
          'Everything you were promised was true.',
          '',
          'Press F1 to continue, DEL to enter SETUP'
        ], pad, pad, lh);
      } else if (state.phase === 'adventure') {
        var shown = ADVENTURE.slice(0, state.advLine + 1);
        K.termLines(g, shown, pad, pad, lh);
        if (Math.floor(time * 2) % 2 === 0) {
          g.fillRect(pad + (shown.length ? 8 : 0), pad + shown.length * lh, lh * 0.5, lh * 0.8);
        }
      }
      K.scanlines(g, w, h, 0.14);
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    var scr = K.screen(ctx, screenMesh, draw, { w: 400, h: 300, hz: 8 });

    var glow = new THREE.PointLight(0x7fd6ae, 0, 2.2, 2);
    glow.position.set(-0.75, 1.25, 3.35);
    ctx.add(glow);

    ctx.every(function (dt) {
      if (!state.powered) return;
      if (state.phase === 'post' || state.phase === 'boot') state.post += dt;
      if (state.phase === 'post' && state.post > 3.6) {
        state.phase = 'setup'; state.post = 0;
      }
      glow.intensity = util.damp(glow.intensity, state.powered ? 1.5 : 0, 3, dt);
    });

    state.setPowered = function (on) {
      if (state.powered === on) return;
      state.powered = on;
      if (on) {
        state.phase = 'post'; state.post = 0;
        ctx.sfx('crtOn');
        setTimeout(function () { ctx.sfx('beepPost'); }, 380);
        setTimeout(function () { ctx.sfx('floppySeek', { vol: 0.5 }); }, 1500);
        setTimeout(function () { ctx.sfx('hddSeek', { vol: 0.6 }); }, 2400);
      } else {
        ctx.sfx('crtOff');
      }
    };

    /* Interact 1 — change the year. */
    ctx.interact({
      object: (P.crt && P.crt.userData && P.crt.userData.screen) || P.crt,
      label: 'the year', verb: 'Change', radius: 2.2,
      condition: function () {
        return state.powered && state.phase === 'setup' && !state.saved;
      },
      onUse: function () {
        state.year++;
        if (state.year > 2002) state.year = 1998;
        ctx.sfx('keyType', { vol: 0.6 });
      }
    });

    /* Interact 2 — save and exit, from the keyboard. */
    ctx.interact({
      object: P.keyboard || P.crt,
      label: 'F10 — save and exit', verb: 'Press', radius: 2.2,
      condition: function () {
        return state.powered && state.phase === 'setup' && !state.saved;
      },
      onUse: function () {
        state.saved = true;
        ctx.sfx('keyType');
        setTimeout(function () {
          if (state.year === 2000) {
            state.phase = 'y2k';
            ctx.sfx('beepError');
            ctx.egg('y2k', 'The century byte');
            ctx.say('shop.y2k');
            setTimeout(function () {
              state.phase = 'boot'; state.post = 0; state.saved = false;
              ctx.done('clock');
            }, 5200);
          } else {
            state.phase = 'boot'; state.post = 0;
            ctx.sfx('beepConfirm');
            ctx.say('shop.clockSet');
            ctx.done('clock');
          }
        }, 900);
      }
    });

    /* Interact 3 — the text adventure, once the machine is booted. */
    ctx.interact({
      object: P.keyboard || P.crt,
      label: 'the keyboard', verb: 'Type on', radius: 2.2,
      condition: function () {
        return state.powered && (state.phase === 'boot' || state.phase === 'adventure') &&
          state.post > 3.2;
      },
      onUse: function () {
        if (state.phase !== 'adventure') {
          state.phase = 'adventure'; state.advLine = 0;
          ctx.egg('adventure', 'A small text adventure');
          ctx.say('shop.adventure');
        } else {
          state.advLine = Math.min(ADVENTURE.length - 1, state.advLine + 1);
        }
        ctx.sfx('keyType', { vol: 0.7, rate: 0.9 + Math.random() * 0.25 });
      }
    });

    state.screen = scr;
    return state;
  }

  /* ---- everything else you can poke ---- */

  function wireDressing(ctx, P) {
    /* The rubber duck: the hint system, and the best joke in the shop. */
    ctx.interact({
      object: P.duck, label: 'the duck', verb: 'Squeeze', radius: 2.1,
      onUse: function () {
        ctx.sfx('uiHover', { rate: 0.6, vol: 0.6 });
        var n = SG.count('duck');
        var pending = null;
        for (var i = 0; i < ctx.objectiveList.length; i++) {
          if (!ctx.objectiveList[i].done) { pending = ctx.objectiveList[i].id; break; }
        }
        ctx.say('shop.duck.' + (pending || 'none'));
        if (n === 1) ctx.egg('duck', 'Rubber duck debugging');
        if (n >= 6) ctx.egg('duckSix', 'The duck is a good listener');
      }
    });

    /* Coffee. Twenty seconds of being slightly too awake. */
    ctx.interact({
      object: P.mug, label: 'your coffee', verb: 'Drink', radius: 2.0,
      onUse: function () {
        ctx.sfx('sipDrink');
        ctx.egg('coffee', "World's okayest tech");
        ctx.say('shop.coffee');
        if (ctx.player && ctx.player.setSpeedScale) {
          ctx.player.setSpeedScale(1.35);
          if (SG.fx && SG.fx.pulse) SG.fx.pulse('ca', 0.5, 700);
          setTimeout(function () {
            if (ctx.player && ctx.player.setSpeedScale) ctx.player.setSpeedScale(1);
          }, 20000);
        }
      }
    });

    /* Kernel. The whole reason Steve keeps the shop. */
    ctx.interact({
      object: P.cat && P.cat.root ? P.cat.root : P.catBed,
      label: 'Kernel', verb: 'Pet', radius: 1.5, offset: 0.15,
      onUse: function () {
        var n = SG.count('cat');
        ctx.sfx(n % 3 === 0 ? 'catMeow' : 'catPurr', { vol: 0.8 });
        if (P.cat && P.cat.play) P.cat.play(n % 4 === 0 ? 'catStretch' : 'catSit');
        if (n === 1) { ctx.egg('cat1', 'Kernel'); ctx.say('shop.cat.1'); }
        if (n === 3) {
          ctx.state.flags['shop.catFollows'] = true;
          ctx.egg('cat3', 'Kernel has decided');
          ctx.say('shop.cat.3');
          ctx.toast('Kernel is following you', 'cat');
        }
        if (n === 10) {
          ctx.egg('cat10', 'Kernel does tech support');
          ctx.say('shop.cat.10');
          if (P.cat && P.cat.play) P.cat.play('catTypeOnKeyboard');
          if (P.cat && P.cat.root) {
            P.cat.root.position.set(-0.85, 0.94, 3.05);
            P.cat.root.rotation.y = -0.3;
          }
        }
      }
    });

    /* The whiteboard. He knew about HALCYON months ago. */
    ctx.interact({
      object: P.whiteboard, label: 'the whiteboard', verb: 'Read', radius: 1.8,
      onUse: function () {
        ctx.say('shop.whiteboard');
        ctx.egg('whiteboard', 'A network diagram, drawn in March');
      }
    });

    /* The floppy box. */
    ctx.interact({
      object: P.floppyBox, label: 'a box of floppies', verb: 'Look through', radius: 1.5,
      onUse: function () {
        ctx.sfx('paperRustle');
        ctx.say('shop.floppy');
        ctx.egg('floppy', 'TAXES_FINAL_final_v3.DOC');
      }
    });

    /* The drawer of names. */
    ctx.interact({
      object: P.drawers, label: 'the bottom drawer', verb: 'Open', radius: 1.5,
      onUse: function () {
        var n = SG.count('drawer');
        ctx.sfx(n === 1 ? 'zipperPull' : 'paperRustle', { vol: 0.7 });
        ctx.say(n === 1 ? 'shop.drawer.1' : 'shop.drawer.2');
        if (n >= 2) ctx.egg('passports', 'Every name he has used');
      }
    });

    /* The sticky note under the keyboard. */
    var note = ctx.prop('stickyNote', { text: 'password' });
    if (note) {
      K.at(note, -0.55, 0.902, 2.86, -0.3);
      note.visible = false;
      ctx.interact({
        object: P.keyboard || note, label: 'under the keyboard', verb: 'Look',
        radius: 1.4,
        condition: function () { return !note.visible; },
        onUse: function () {
          note.visible = true;
          ctx.sfx('paperRustle', { vol: 0.6 });
          ctx.say('shop.stickyNote');
          ctx.egg('sticky', 'Her password');
        }
      });
    }

    ctx.interact({
      object: P.coffeeMaker, label: 'the coffee maker', verb: 'Start', radius: 1.5,
      onUse: function () { ctx.sfx('coffeePour'); ctx.say('shop.coffeeMaker'); }
    });

    ctx.interact({
      object: P.clock || P.whiteboard, label: 'the clock', verb: 'Check', radius: 2.2,
      onUse: function () { ctx.sfx('clockTick'); ctx.say('shop.clock'); }
    });

    ctx.interact({
      object: P.chest, label: 'the tool chest', verb: 'Open', radius: 1.5,
      onUse: function () {
        ctx.sfx('metalClang', { vol: 0.4 });
        ctx.say('shop.toolchest');
        ctx.egg('toolchest', 'The bottom drawer is heavier than it looks');
      }
    });

    /* The Konami code, because of course. */
    var seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft',
      'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    var at = 0;
    var onKey = function (e) {
      if (e.code === seq[at]) {
        at++;
        if (at >= seq.length) {
          at = 0;
          ctx.egg('konami', 'Up up down down');
          ctx.say('shop.konami');
          ctx.scene.traverse(function (o) {
            if (o.isMesh && o.material && !Array.isArray(o.material)) {
              o.material.wireframe = !o.material.wireframe;
            }
          });
        }
      } else { at = (e.code === seq[0]) ? 1 : 0; }
    };
    window.addEventListener('keydown', onKey);
    ctx.every(function () { });
    SG.bus.once('level:done', function () {
      window.removeEventListener('keydown', onKey);
    });
  }

  /* ---- the two people who matter ---- */

  function wireEllisAndOleg(ctx, P, ellis, oleg) {
    var walkedOut = false;

    /* Ms. Ellis waits, then follows you to the door when the machine is done. */
    ctx.interact({
      object: ellis.root, label: 'Ms. Ellis', verb: 'Talk to', radius: 1.9, offset: 1.2,
      onUse: function () {
        var n = SG.count('ellisTalk');
        if (!ctx.state.flags['shop.clockDone']) {
          ctx.say('shop.ellis.wait' + (n > 2 ? '2' : '1'));
        } else {
          ctx.say('shop.ellis.ready');
        }
        ellis.lookAt && ctx.player && ellis.lookAt(ctx.player.root.position);
      }
    });

    SG.bus.on('objective:done', function (o) {
      if (!o || o.id !== 'clock') return;
      ctx.state.flags['shop.clockDone'] = true;
      /* Hold the door for her — and make sure the way out is actually open. */
      if (P.door && P.door.open) P.door.open();
      setTimeout(function () {
        ctx.say('shop.ellis.thanks').then(function () {
          ctx.say('shop.steve.noCharge');
        });
      }, 900);
      /* She makes her own way to the door; you walk her the rest. */
      var target = [-2.1, 0, -3.6];
      ellis.play('walk');
      ctx.every(function (dt) {
        var p = ellis.root.position;
        var dx = target[0] - p.x, dz = target[2] - p.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.2) { ellis.setSpeed(0); ellis.play('idle'); return; }
        var sp = 0.55;
        p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt;
        ellis.root.rotation.y = util.angleDamp(ellis.root.rotation.y,
          Math.atan2(dx, dz), 4, dt);
        ellis.setSpeed(sp);
      });
    });

    /* Walking her out: reach the Buick with her, then come back. */
    ctx.trigger({
      pos: [-3.6, 0, -7.4], radius: 2.4, once: true,
      onEnter: function () {
        if (!ctx.state.flags['shop.clockDone']) return;
        walkedOut = true;
        ctx.done('ellis');
        ctx.sfx('doorClose', { vol: 0.4 });
        ctx.say('shop.ellis.car').then(function () {
          return ctx.say('shop.steve.driveSafe');
        }).then(function () {
          ctx.objective && ctx.toast('Mr. Thomas is waiting', 'objective');
        });
        /* She gets in and the Buick pulls away. */
        ellis.play('walk');
        var t = 0;
        ctx.every(function (dt) {
          t += dt;
          if (t < 3) {
            ellis.root.position.x = util.damp(ellis.root.position.x, -3.9, 1.5, dt);
            ellis.root.position.z = util.damp(ellis.root.position.z, -7.6, 1.5, dt);
          } else if (t < 4) {
            ellis.root.visible = false;
          } else if (P.buick && t < 14) {
            P.buick.position.z -= dt * 1.9;
            P.buick.position.x -= dt * 0.25;
          }
        });
      }
    });

    /* Oleg, patient as furniture, by the door. */
    ctx.interact({
      object: oleg.root, label: 'Mr. Thomas', verb: 'Talk to', radius: 2.0, offset: 1.3,
      onUse: function () {
        if (!walkedOut) {
          ctx.say('shop.oleg.wait');
          oleg.play('nod');
          return;
        }
        ctx.done('oleg');
        ctx.state.flags['shop.done'] = true;
        oleg.play('nod');
        ctx.say('shop.oleg.ready').then(function () {
          return ctx.fade(true, 900);
        }).then(function () {
          ctx.finish();
        });
      }
    });

    ctx.every(function (dt) {
      if (!ctx.player) return;
      /* Both of them track Steve with their eyes. It costs nothing and it
       * makes the room feel occupied. */
      if (ellis.lookAt && ellis.root.visible) ellis.lookAt(ctx.player.root.position);
      if (oleg.lookAt) oleg.lookAt(ctx.player.root.position);
    });
  }

  /* ------------------------------------------------------------------ */
  /* The cutscene set                                                    */
  /* ------------------------------------------------------------------ */

  SG.levels.shop_set = {
    id: 'shop_set',
    music: null,
    build: function (ctx) {
      ctx.spawn = { pos: [-1.0, 0, 1.4], yaw: Math.PI };
      var P = buildShop(ctx, { playable: false });

      /* In the set, Steve is an actor, not the player. */
      P.steve = K.npc(ctx, 'steve', [-2.0, 0, 2.6], Math.PI * 0.95, { clip: 'work' });
      P.ellis = K.npc(ctx, 'msEllis', [-2.4, 0, -1.75], 0, { clip: 'idle' });
      P.oleg = K.npc(ctx, 'oleg', [-2.1, 0, -3.5], 0, { clip: 'idle' });
      P.oleg.root.visible = false;   /* he arrives on cue */

      /* Props the briefing scene needs, hidden until the beat that reveals them. */
      var brief = new THREE.Group();
      var bc = SG.models.briefcase ? SG.models.briefcase({}) : null;
      if (bc) { K.at(bc, -3.0, 1.06, -0.7, 0.2); brief.add(bc); P.briefcase = bc; }
      var ph = SG.models.phoneBurner ? SG.models.phoneBurner({}) : null;
      if (ph) { K.at(ph, -2.55, 1.07, -0.62, -0.5); brief.add(ph); P.phone = ph; }
      var tk = SG.models.ticketFirstClass ? SG.models.ticketFirstClass({}) : null;
      if (tk) { K.at(tk, -2.25, 1.07, -0.78, 0.3); brief.add(tk); P.tickets = tk; }
      var bg = SG.models.badgeLanyard ? SG.models.badgeLanyard({ name: 'T. BECKETT' }) : null;
      if (bg) { K.at(bg, -1.95, 1.07, -0.66, -0.2); brief.add(bg); P.badge = bg; }
      var dos = SG.models.dossierFolder ? SG.models.dossierFolder({}) : null;
      if (dos) { K.at(dos, -3.4, 1.07, -0.8, 0.1); brief.add(dos); P.dossier = dos; }
      brief.visible = false;
      P.briefKit = brief;
      ctx.add(brief);

      if (ctx.player) ctx.player.visible(false);
    },
    update: function () { },
    dispose: function () { }
  };

})(window.SG, window.THREE);
