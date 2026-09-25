// ---------------------------------------------------------------------------
// Gadget recipes, part 4: food and market stalls.
//
// Fruit, vegetables, baked goods, sweets, fast food and drinks at real size
// (so "a giant pineapple" is simply scaled up by the wrapper), plus street
// stalls and carts whose goods and sign follow the prompt ("a hot dog
// stand", "a lemonade stand", "a fruit stall", "a ticket booth"). Food can
// be eaten: three bites and it is gone.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { attachFire } from './furniture.js';
import { hsl } from './common.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
function sound(e, name, opts) { if (G.audio) G.audio.play(name, e.root.position, opts); }
const has = (a, re) => re.test(a.text || '');

// "Take a bite" interaction shared by all food.
function eat(what) {
  return {
    label: () => `Take a bite of the ${what}`,
    action: (e) => {
      sound(e, 'pop');
      e._bites = (e._bites || 0) + 1;
      if (e._bites >= 3) {
        if (G.ui) G.ui.toast(`You finished the ${what}. Delicious!`);
        if (G.registry) G.registry.remove(e.id);
      } else e.root.scale.multiplyScalar(0.86);
    },
  };
}
const food = (name, mass, what = name.toLowerCase()) => ({ name, phys: { mass }, interact: eat(what) });

// Radius of a lathe profile at height y.
function rAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return r0 + (r1 - r0) * ((y - y0) / ((y1 - y0) || 1));
  }
  return 0;
}
// Leaf outline (pointing +Y).
const leaf = (w, h) => [[0, 0], [w * 0.5, h * 0.3], [w * 0.3, h * 0.75], [0, h], [-w * 0.3, h * 0.75], [-w * 0.5, h * 0.3]];
function plate(k, r, y = 0) {
  k.lathe('white', [0, y, 0], [[0, 0], [r * 0.7, 0.002], [r * 0.78, 0.004], [r, 0.018], [r * 0.97, 0.02], [r * 0.75, 0.008], [0, 0.009]], 40);
  return y + 0.009;
}
function sprinkles(k, r, pos, rad, n, y, span = 0) {
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d = span ? r.range(span, rad) : Math.sqrt(r.next()) * rad;
    k.box('#' + new THREE.Color().setHSL(r.next(), 0.8, 0.6).getHexString(), [pos[0] + Math.cos(a) * d, y, pos[2] + Math.sin(a) * d], [0.012, 0.003, 0.003], [0, r.range(0, PI), 0]);
  }
}

export const FOOD = {
  // ================= Fruit & vegetables =================
  pineapple(k, a, r) {
    const prof = [[0, 0], [0.055, 0.004], [0.085, 0.035], [0.096, 0.1], [0.088, 0.165], [0.066, 0.205], [0.03, 0.22], [0, 0.222]];
    k.lathe('p:' + k.color('#b8862a'), [0, 0, 0], prof, 28);
    // Diamond-patterned eyes spiralling round the fruit.
    for (let i = 0; i < 10; i++) for (let j = 0; j < 12; j++) {
      const y = 0.018 + i * 0.019, ang = (j / 12) * TAU + i * 0.26, rr = rAt(prof, y);
      k.ball('p:#7a5418', [Math.sin(ang) * rr, y, Math.cos(ang) * rr], 0.011, [1, 0.8, 0.55], 6, [0, ang, 0]);
      k.ball('p:#e0b050', [Math.sin(ang) * (rr + 0.004), y + 0.003, Math.cos(ang) * (rr + 0.004)], 0.003, null, 4);
    }
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * TAU * 2.2, tilt = 0.25 + (i / 18) * 0.5, h = 0.18 - i * 0.004;
      k.ext(i % 2 ? 'p:#3a7a2a' : 'p:#2a6a22', leaf(0.028, h), 0.004, [0, 0.212, 0], [-tilt, ang, 0]);
    }
    return food('Pineapple', 1.5);
  },
  banana(k, a, r) {
    const n = has(a, /\bbunch\b/) ? 5 : 1;
    const col = 'p:' + k.color('#f2d23a');
    for (let b = 0; b < n; b++) {
      const R = 0.14, rot = (b - (n - 1) / 2) * 0.22;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, th = -0.75 + t * 1.5;
        const x = Math.sin(th) * R, z = R - Math.cos(th) * R, y = 0.02 + (1 - Math.cos(th)) * 0.12 + b * 0.012;
        pts.push([x * Math.cos(rot) - z * Math.sin(rot), y, x * Math.sin(rot) + z * Math.cos(rot)]);
      }
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12, t1 = (i + 1) / 12;
        const rr = (t) => 0.004 + 0.016 * Math.pow(Math.sin(PI * t), 0.6);
        k.seg(i === 0 || i === 11 ? 'p:#4a3a1a' : col, pts[i], pts[i + 1], rr(t0), rr(t1), 7);
      }
    }
    return food(n > 1 ? 'Bunch of bananas' : 'Banana', 0.2 * n);
  },
  apple(k, a, r) {
    const col = k.color(has(a, /green/) ? '#6ab02a' : r.pick(['#c81a1a', '#b81c24', '#d83a1a', '#e8c020']));
    k.lathe('g:' + col, [0, 0, 0], [[0, 0.008], [0.025, 0], [0.042, 0.015], [0.048, 0.045], [0.043, 0.075], [0.022, 0.088], [0.004, 0.082], [0, 0.078]], 24);
    k.seg('p:#4a2a10', [0, 0.078, 0], [0.004, 0.105, 0.002], 0.0025, 0.002, 5);
    k.ext('p:#3a8a2a', leaf(0.022, 0.04), 0.002, [0.004, 0.098, 0], [0, 0.4, -0.9]);
    return food('Apple', 0.2);
  },
  orange(k, a, r) {
    const kind = has(a, /lemon/) ? 'lemon' : has(a, /lime/) ? 'lime' : has(a, /grapefruit/) ? 'grapefruit' : has(a, /peach|apricot/) ? 'peach' : has(a, /plum/) ? 'plum' : has(a, /coconut/) ? 'coconut' : 'orange';
    const C = { orange: '#f08a1a', lemon: '#f2dc3a', lime: '#6ac02a', grapefruit: '#f0a04a', peach: '#f8a878', plum: '#6a2a5a', coconut: '#6a4a2a' }[kind];
    const R = kind === 'grapefruit' ? 0.065 : kind === 'coconut' ? 0.07 : kind === 'lemon' || kind === 'lime' ? 0.035 : 0.042;
    const scl = kind === 'lemon' || kind === 'lime' ? [1, 1, 1.3] : kind === 'coconut' ? [1, 1.05, 1.1] : [1, 0.95, 1];
    k.ball((kind === 'coconut' ? 'fur' : 'p:') + (kind === 'coconut' ? '' : k.color(C)), [0, R * scl[1], 0], R, scl, 22);
    if (kind === 'coconut') { k.m('fur', 'fur', { color: C }); for (const s of [-1, 0, 1]) k.ball('p:#2a1a0a', [s * R * 0.25, R * 1.55, R * 0.62], R * 0.09, null, 6); }
    if (kind === 'lemon' || kind === 'lime') for (const s of [-1, 1]) k.ball('p:' + C, [0, R, s * R * 1.28], R * 0.18, null, 8);
    if (kind === 'peach') k.seg('p:#4a2a10', [0, R * 1.9, 0], [0.003, R * 2.2, 0], 0.003, 0.002, 5);
    else if (kind !== 'coconut') k.ball('p:#4a6a1a', [0, R * 1.9, 0], R * 0.1, [1, 0.4, 1], 8);
    return food(kind[0].toUpperCase() + kind.slice(1), 0.25, kind);
  },
  pear(k, a) {
    k.lathe('p:' + k.color('#b8c83a'), [0, 0, 0], [[0, 0.004], [0.03, 0], [0.045, 0.025], [0.042, 0.055], [0.024, 0.085], [0.02, 0.11], [0.012, 0.125], [0, 0.128]], 22);
    k.seg('p:#4a2a10', [0, 0.125, 0], [0.006, 0.15, 0], 0.003, 0.002, 5);
    return food('Pear', 0.2);
  },
  cherries(k) {
    for (const s of [-1, 1]) { k.ball('g:#9a0a1a', [s * 0.016, 0.013, 0], 0.013, null, 14); k.tube('p:#4a6a1a', [[s * 0.016, 0.024, 0], [s * 0.01, 0.05, 0], [0, 0.075, 0.004]], 0.0014, 10, false, 5); }
    return food('Cherries', 0.02, 'cherries');
  },
  grapes(k, a, r) {
    const col = k.color(has(a, /green|white/) ? '#a8c85a' : '#5a2a6a');
    for (let row = 0; row < 7; row++) {
      const n = Math.max(1, 7 - row), rad = 0.01 + (7 - row) * 0.006;
      for (let i = 0; i < n; i++) { const an = (i / n) * TAU + row; k.ball('g:' + col, [Math.cos(an) * rad, 0.012 + (6 - row) * 0.016 + 0.005, Math.sin(an) * rad], 0.011, null, 10); }
    }
    k.seg('p:#5a4a2a', [0, 0.11, 0], [0.005, 0.14, 0.004], 0.003, 0.002, 5);
    k.ext('p:#4a8a2a', leaf(0.05, 0.05), 0.002, [0.006, 0.125, 0], [0.2, 0.5, -0.8]);
    return food('Bunch of grapes', 0.5, 'grapes');
  },
  strawberry(k, a, r) {
    const prof = [[0, 0], [0.012, 0.006], [0.024, 0.022], [0.028, 0.04], [0.022, 0.052], [0, 0.056]];
    k.lathe('g:' + k.color('#d81a2a'), [0, 0, 0], prof, 18);
    for (let i = 0; i < 40; i++) { const y = 0.006 + r.next() * 0.042, an = r.range(0, TAU), rr = rAt(prof, y); k.ball('p:#f0d060', [Math.sin(an) * rr, y, Math.cos(an) * rr], 0.0016, [1, 1.4, 1], 4); }
    for (let i = 0; i < 6; i++) k.ext('p:#3a8a2a', leaf(0.012, 0.022), 0.0015, [0, 0.053, 0], [-1.2, (i / 6) * TAU, 0]);
    k.seg('p:#3a7a2a', [0, 0.054, 0], [0, 0.068, 0], 0.0018, 0.0014, 5);
    return food('Strawberry', 0.03);
  },
  watermelon(k, a, r) {
    const R = 0.18;
    k.ball('p:#2e7a22', [0, R * 0.85, 0], R, [1, 0.85, 1.25], 28);
    for (let i = 0; i < 10; i++) k.ball('p:#1a4a12', [0, R * 0.85, 0], R * 1.012, [0.11, 0.85, 1.25], 24, [0, (i / 10) * PI, 0]);
    // A slice beside it.
    const sx = R * 1.6;
    k.cyl('p:#2e7a22', [sx, 0, 0.1], 0.13, 0.036, [HALF, 0, 0], { arcStart: HALF, arc: PI, segs: 24 });
    k.cyl('p:#f0f0d8', [sx, 0, 0.1], 0.122, 0.038, [HALF, 0, 0], { arcStart: HALF, arc: PI, segs: 24 });
    k.cyl('p:#e8323a', [sx, 0, 0.1], 0.112, 0.04, [HALF, 0, 0], { arcStart: HALF, arc: PI, segs: 24 });
    for (let i = 0; i < 12; i++) { const an = r.range(0.3, PI - 0.3), d = r.range(0.04, 0.09); for (const s of [-1, 1]) k.ball('p:#141414', [sx + Math.cos(an) * d, Math.sin(an) * d, 0.1 + s * 0.02], 0.004, [0.7, 1, 0.4], 5); }
    return food('Watermelon', 5);
  },
  pumpkin(k, a, r) {
    const carved = has(a, /jack|carved|halloween|spooky|lantern/);
    const R = 0.16, col = k.color('#e8741a');
    for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU; k.ball('p:' + col, [Math.sin(an) * R * 0.42, R * 0.78, Math.cos(an) * R * 0.42], R * 0.62, [0.62, 1.25, 1], 16, [0, an, 0]); }
    k.seg('p:#5a6a2a', [0, R * 1.45, 0], [0.02, R * 1.85, 0.01], 0.018, 0.012, 7);
    if (carved) {
      const z = R * 1.02;
      for (const s of [-1, 1]) k.ext('e:#ffb030', [[-0.025, 0], [0.025, 0], [0, 0.035]], 0.02, [s * 0.05, R * 0.92, z], null);
      k.ext('e:#ffb030', [[-0.07, 0.01], [-0.035, -0.005], [-0.02, 0.012], [0, -0.008], [0.02, 0.012], [0.035, -0.005], [0.07, 0.01], [0.05, -0.035], [-0.05, -0.035]], 0.02, [0, R * 0.62, z * 0.98], null);
      k.light([0, R * 0.8, R * 0.3], '#ff9a30', 1.5, 5, false, true);
      k.glow('#ff9a30', [0, R * 0.8, R * 0.9], 0.5, 0.5);
    }
    return { name: carved ? 'Jack-o\'-lantern' : 'Pumpkin', phys: { mass: 6 }, interact: carved ? null : eat('pumpkin') };
  },
  carrot(k, a) {
    k.cone('p:' + k.color('#f07a1a'), [0, 0.022, 0.08], 0.022, 0.2, [HALF, 0, 0], 12);
    for (let i = 0; i < 5; i++) k.seg('p:#3a8a2a', [0, 0.022, -0.02], [(i - 2) * 0.02, 0.06 + (i % 2) * 0.02, -0.1], 0.003, 0.0015, 4);
    return food('Carrot', 0.1);
  },
  corn(k, a, r) {
    k.ball('p:' + k.color('#f2c830'), [0, 0.035, 0], 0.035, [1, 1, 3.2], 16);
    for (let i = 0; i < 60; i++) { const an = r.range(-PI * 0.8, PI * 0.8), z = r.range(-0.09, 0.09), rr = 0.035 * Math.sqrt(Math.max(0, 1 - (z / 0.112) ** 2)); k.ball('p:#f8d848', [Math.sin(an) * rr, 0.035 + Math.cos(an) * rr, z], 0.006, null, 5); }
    for (const s of [-1, 1]) k.ext('p:#8ab04a', leaf(0.07, 0.22), 0.002, [s * 0.03, 0.012, 0.1], [-HALF + 0.1, s * 0.25, 0]);
    return food('Corn on the cob', 0.3, 'corn');
  },
  mushroomFood(k, a) {
    k.cyl('p:#f0e6d0', [0, 0.02, 0], 0.012, 0.04, null, { rTop: 0.014 });
    k.dome('p:' + k.color('#c8a880'), [0, 0.035, 0], 0.03, null, { scl: [1, 0.65, 1] });
    return food('Mushroom', 0.05);
  },

  // ================= Bakery =================
  bread(k, a, r) {
    if (has(a, /baguette|french bread/)) {
      k.seg('p:#c8843a', [-0.3, 0.03, 0], [0.3, 0.03, 0], 0.03, 0.03, 16);
      for (const s of [-1, 1]) k.ball('p:#c8843a', [s * 0.3, 0.03, 0], 0.03, [1.3, 1, 1], 12);
      for (let i = 0; i < 5; i++) k.box('p:#f0d8a0', [-0.22 + i * 0.11, 0.058, 0], [0.06, 0.004, 0.012], [0, 0.6, 0]);
      return food('Baguette', 0.3);
    }
    k.rbox('p:#b8743a', [0, 0.04, 0], [0.26, 0.08, 0.13], 0.03);
    k.ball('p:#a8642a', [0, 0.075, 0], 0.07, [1.8, 0.55, 0.95], 18);
    for (let i = 0; i < 4; i++) k.box('p:#e8c890', [-0.08 + i * 0.055, 0.112, 0], [0.012, 0.004, 0.08], [0, 0.4, 0]);
    return food('Loaf of bread', 0.5, 'bread');
  },
  croissant(k) {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, an = -1.2 + t * 2.4, rr = 0.018 + 0.02 * Math.sin(PI * t);
      k.ball(i % 2 ? 'p:#c87a2a' : 'p:#d8963a', [Math.sin(an) * 0.075, rr * 0.8, Math.cos(an) * 0.075 - 0.05], rr, [1, 0.8, 1.1], 12, [0, an, 0]);
    }
    return food('Croissant', 0.08);
  },
  cake(k, a, r) {
    const wedding = has(a, /wedding/), cheese = has(a, /cheese ?cake/), choc = has(a, /chocolate/);
    const col = k.color(wedding ? '#f8f4ec' : choc ? '#5a3020' : cheese ? '#f4e6c0' : r.pick(['#f4c8d8', '#f4ecd8', '#f8f0e0', '#c8e8f0']));
    let y = plate(k, wedding ? 0.32 : 0.22);
    const tiers = wedding ? [[0.26, 0.16], [0.19, 0.14], [0.12, 0.12]] : cheese ? [[0.17, 0.08]] : [[0.16, 0.12], [0.11, 0.1]];
    for (const [rr, h] of tiers) {
      k.cyl('p:' + col, [0, y + h / 2, 0], rr, h, null, { segs: 40 });
      for (let i = 0; i < 24; i++) { const an = (i / 24) * TAU; k.ball('p:' + (wedding ? '#ffffff' : k.color2('#ffffff')), [Math.sin(an) * rr, y + h, Math.cos(an) * rr], 0.012 + rr * 0.03, null, 8); }
      y += h;
    }
    if (cheese) k.cyl('g:#c81a2a', [0, y + 0.005, 0], 0.16, 0.01, null, { segs: 32 });
    if (wedding) { for (const s of [-1, 1]) { k.ball('p:#f0f0f0', [s * 0.025, y + 0.06, 0], 0.018, [1, 1.6, 1]); k.ball('p:#f0dcc8', [s * 0.025, y + 0.1, 0], 0.012); } }
    else if (!cheese) {
      const n = has(a, /birthday/) || !choc ? 5 : 0;
      for (let i = 0; i < n; i++) { const an = (i / n) * TAU; k.cyl('p:' + hsl(i / n, 0.7, 0.62), [Math.sin(an) * 0.06, y + 0.03, Math.cos(an) * 0.06], 0.005, 0.06, null, { segs: 6 }); attachFire(k.group, [Math.sin(an) * 0.06, y + 0.07, Math.cos(an) * 0.06], 0.05); }
      for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + 0.5; k.ball('g:#c81a2a', [Math.sin(an) * 0.09, y + 0.01, Math.cos(an) * 0.09], 0.012); }
    }
    return food(wedding ? 'Wedding cake' : cheese ? 'Cheesecake' : choc ? 'Chocolate cake' : 'Birthday cake', 2, 'cake');
  },
  cupcake(k, a, r) {
    const wrap = k.color2(r.pick(['#f08ab0', '#8ac8f0', '#f0d060', '#b08af0']));
    for (let i = 0; i < 16; i++) k.cyl('p:' + (i % 2 ? wrap : '#' + new THREE.Color(wrap).multiplyScalar(0.85).getHexString()), [0, 0.022, 0], 0.028, 0.044, null, { rTop: 0.036, arcStart: (i / 16) * TAU, arc: TAU / 16, segs: 2 });
    const f = k.color(r.pick(['#f8e8f0', '#f8c8d8', '#6a3a2a', '#c8f0d8']));
    for (let i = 0; i < 4; i++) k.torus('p:' + f, [0, 0.05 + i * 0.012, 0], 0.03 - i * 0.007, 0.012 - i * 0.002, [HALF, 0, 0], TAU, 20);
    k.cone('p:' + f, [0, 0.1, 0], 0.01, 0.02);
    k.ball('g:#c81a2a', [0, 0.112, 0], 0.01);
    sprinkles(k, r, [0, 0, 0], 0.03, 16, 0.078, 0.01);
    return food('Cupcake', 0.1);
  },
  donut(k, a, r) {
    k.torus('p:#d8a060', [0, 0.03, 0], 0.055, 0.03, [HALF, 0, 0], TAU, 32);
    k.torus('g:' + k.color(r.pick(['#f080b0', '#6a3a2a', '#f8f0e0', '#8ac8f0'])), [0, 0.04, 0], 0.055, 0.028, [HALF, 0, 0], TAU, 32);
    for (let i = 0; i < 24; i++) { const an = r.range(0, TAU), d = r.range(0.035, 0.075); k.box('#' + new THREE.Color().setHSL(r.next(), 0.8, 0.6).getHexString(), [Math.cos(an) * d, 0.066, Math.sin(an) * d], [0.012, 0.003, 0.003], [0, r.range(0, PI), 0]); }
    return food('Donut', 0.07);
  },
  cookie(k, a, r) {
    k.cyl('p:#c8903a', [0, 0.006, 0], 0.05, 0.012, null, { segs: 24 });
    for (let i = 0; i < 9; i++) { const an = r.range(0, TAU), d = r.next() * 0.04; k.ball('p:#3a2010', [Math.cos(an) * d, 0.012, Math.sin(an) * d], 0.006, [1, 0.6, 1], 6); }
    return food('Cookie', 0.03);
  },
  pie(k, a, r) {
    k.lathe('p:#e8e0d0', [0, 0, 0], [[0, 0], [0.13, 0], [0.15, 0.035], [0.14, 0.036], [0.12, 0.004], [0, 0.004]], 32);
    k.dome('p:#d89a4a', [0, 0.03, 0], 0.13, null, { scl: [1, 0.18, 1] });
    for (let i = -3; i <= 3; i++) {
      const len = 0.25 * Math.sqrt(1 - (i / 4) ** 2);
      k.box('p:#c8843a', [i * 0.035, 0.05, 0], [0.016, 0.006, len]);
      k.box('p:#c8843a', [0, 0.053, i * 0.035], [len, 0.006, 0.016]);
    }
    k.torus('p:#c8843a', [0, 0.035, 0], 0.138, 0.012, [HALF, 0, 0], TAU, 36);
    return food('Pie', 1);
  },
  pancakes(k, a, r) {
    let y = plate(k, 0.14);
    for (let i = 0; i < 6; i++) { k.cyl('p:#d8a050', [r.range(-0.004, 0.004), y + 0.008, r.range(-0.004, 0.004)], 0.09, 0.016, null, { segs: 28 }); y += 0.016; }
    k.cyl('g:#a8601a', [0, y + 0.002, 0], 0.085, 0.004, null, { segs: 28 });
    k.rbox('p:#f8e8a0', [0, y + 0.014, 0], [0.03, 0.02, 0.03], 0.004);
    for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; k.seg('g:#a8601a', [Math.cos(an) * 0.085, y, Math.sin(an) * 0.085], [Math.cos(an) * 0.092, y - 0.04, Math.sin(an) * 0.092], 0.006, 0.004, 6); }
    return food('Stack of pancakes', 0.6, 'pancakes');
  },

  // ================= Meals & fast food =================
  pizza(k, a, r) {
    const main = { arc: TAU * 7 / 8, segs: 40 };
    k.cyl('p:#d89a50', [0, 0.01, 0], 0.2, 0.02, null, main);
    k.torus('p:#c8843a', [0, 0.02, 0], 0.19, 0.012, [HALF, 0, 0], TAU * 7 / 8, 40);
    k.cyl('p:#c83a1a', [0, 0.022, 0], 0.18, 0.005, null, main);
    k.cyl('p:#f4d880', [0, 0.026, 0], 0.175, 0.004, null, main);
    const sa = TAU * 7 / 8, sc = sa + TAU / 16, off = [Math.sin(sc) * 0.05, 0, Math.cos(sc) * 0.05];
    k.cyl('p:#d89a50', [off[0], 0.01, off[2]], 0.2, 0.02, null, { arcStart: sa, arc: TAU / 8, segs: 6 });
    k.cyl('p:#f4d880', [off[0], 0.026, off[2]], 0.175, 0.012, null, { arcStart: sa, arc: TAU / 8, segs: 6 });
    const top = has(a, /margherita|cheese/) ? null : has(a, /mushroom/) ? 'p:#c8b090' : has(a, /veg|pepper/) ? 'p:#3a8a2a' : 'p:#a02a1a';
    if (top) for (let i = 0; i < 12; i++) { const an = r.range(0, sa - 0.1), d = r.range(0.03, 0.15); k.cyl(top, [Math.sin(an) * d, 0.03, Math.cos(an) * d], 0.02, 0.006, null, { segs: 12 }); }
    for (let i = 0; i < 6; i++) { const an = r.range(0, sa), d = r.range(0.02, 0.15); k.ext('p:#2a7a2a', leaf(0.014, 0.022), 0.001, [Math.sin(an) * d, 0.034, Math.cos(an) * d], [-HALF, an, 0]); }
    return food('Pizza', 0.8);
  },
  burger(k, a, r) {
    const layers = [['p:#c8883a', 0.03, 0.1], ['p:#5a3018', 0.028, 0.106], ['p:#f0c020', 0.006, 0.112], ['p:#40a030', 0.01, 0.114], ['p:#c83a2a', 0.012, 0.096]];
    let y = 0;
    if (has(a, /double|big|giant|mega/)) layers.splice(2, 0, ['p:#5a3018', 0.028, 0.106], ['p:#f0c020', 0.006, 0.112]);
    for (const [c, th, rr] of layers) { k.cyl(c, [0, y + th / 2, 0], rr, th, null, { segs: 28 }); y += th; }
    k.dome('p:#c8883a', [0, y, 0], 0.102, null, { scl: [1, 0.6, 1] });
    for (let i = 0; i < 16; i++) { const an = r.range(0, TAU), el = r.range(0.25, 1.2); k.ball('p:#f8f0d8', [Math.cos(an) * Math.cos(el) * 0.1, y + Math.sin(el) * 0.061, Math.sin(an) * Math.cos(el) * 0.1], 0.004, [1.6, 0.6, 1], 5, [0, an, 0]); }
    return food('Burger', 0.3);
  },
  hotdog(k, a, r) {
    for (const s of [-1, 1]) k.ball('p:#d89a50', [0, 0.03, s * 0.02], 0.03, [3.2, 1, 0.9], 16);
    k.seg('p:#a0401a', [-0.09, 0.05, 0], [0.09, 0.05, 0], 0.017, 0.017, 12);
    for (const s of [-1, 1]) k.ball('p:#a0401a', [s * 0.09, 0.05, 0], 0.017, null, 10);
    const pts = []; for (let i = 0; i <= 16; i++) pts.push([-0.08 + i * 0.01, 0.068, (i % 2 ? 1 : -1) * 0.008]);
    k.tube('p:#f0c010', pts, 0.003, 48, false, 5);
    return food('Hot dog', 0.15);
  },
  sandwich(k, a, r) {
    let y = 0;
    const L = [['p:#e8c890', 0.016, 0.12], ['p:#58b040', 0.006, 0.13], ['p:#f0a0a0', 0.01, 0.118], ['p:#f2c830', 0.004, 0.124], ['p:#d83a2a', 0.008, 0.1], ['p:#e8c890', 0.016, 0.12]];
    for (const [c, th, s] of L) { k.rbox(c, [0, y + th / 2, 0], [s, th, s], Math.min(0.006, th / 2 - 0.0005), [0, r.range(-0.08, 0.08), 0]); y += th; }
    k.rbox('p:#c8904a', [0, 0.008, 0], [0.122, 0.014, 0.122], 0.006);
    k.rbox('p:#c8904a', [0, y - 0.008, 0], [0.122, 0.014, 0.122], 0.006);
    k.seg('lightWood', [0, y - 0.01, 0], [0, y + 0.05, 0], 0.002, 0.0015, 5);
    return food('Sandwich', 0.2);
  },
  taco(k, a, r) {
    k.top.mats.shell = G.materials.get('plastic', { color: '#e0b050', side: THREE.DoubleSide });
    k.cyl('shell', [0, 0.062, 0], 0.06, 0.14, [0, 0, HALF], { arcStart: PI, arc: PI, open: true, segs: 20 });
    k.ball('p:#6a3a1a', [0, 0.05, 0], 0.06, [1.1, 0.5, 0.6], 14);
    for (let i = 0; i < 26; i++) {
      const x = r.range(-0.06, 0.06), z = r.range(-0.035, 0.035), c = r.pick(['p:#58b040', 'p:#58b040', 'p:#d83a2a', 'p:#f2c830', 'p:#f8f4e8']);
      k.box(c, [x, 0.088 + r.range(0, 0.012), z], [0.012, 0.006, 0.01], [r.range(0, 1), r.range(0, PI), 0]);
    }
    return food('Taco', 0.15);
  },
  sushi(k, a, r) {
    k.rbox('w:#c8a068', [0, 0.012, 0], [0.4, 0.024, 0.16], 0.006);
    for (let i = 0; i < 3; i++) {
      const x = -0.13 + i * 0.07;
      k.rbox('white', [x, 0.04, -0.02], [0.06, 0.03, 0.034], 0.012);
      k.rbox('g:' + ['#f07a4a', '#d8323a', '#f8e0c0'][i], [x, 0.058, -0.02], [0.068, 0.01, 0.04], 0.004);
    }
    for (let i = 0; i < 4; i++) {
      const x = 0.07 + (i % 2) * 0.05, z = i < 2 ? -0.03 : 0.03;
      k.cyl('g:#1a2a1a', [x, 0.04, z], 0.022, 0.032, null, { segs: 16 });
      k.cyl('white', [x, 0.057, z], 0.019, 0.002, null, { segs: 16 });
      k.cyl('p:#f07a4a', [x, 0.058, z], 0.008, 0.002, null, { segs: 10 });
    }
    for (const s of [-1, 1]) k.seg('darkWood', [-0.16, 0.03, 0.06 + s * 0.008], [0.12, 0.03, 0.06 + s * 0.004], 0.004, 0.002, 6);
    return food('Sushi platter', 0.8, 'sushi');
  },
  ramen(k, a, r) {
    k.lathe('g:#c81a1a', [0, 0, 0], [[0, 0], [0.04, 0], [0.042, 0.008], [0.1, 0.05], [0.11, 0.095], [0.104, 0.095], [0.094, 0.052], [0, 0.012]], 32);
    k.disc('p:#c8903a', [0, 0.08, 0], 0.1, [-HALF, 0, 0]);
    for (let n = 0; n < 8; n++) { const pts = []; for (let i = 0; i <= 10; i++) pts.push([-0.07 + i * 0.014, 0.084, -0.04 + n * 0.011 + Math.sin(i * 1.3 + n) * 0.006]); k.tube('p:#f0d890', pts, 0.003, 30, false, 5); }
    for (const s of [-1, 1]) { k.dome('white', [s * 0.035, 0.08, 0.035], 0.02, null, { scl: [1, 0.6, 1.3] }); k.disc('p:#f0a020', [s * 0.035, 0.093, 0.035], 0.01, [-HALF, 0, 0]); }
    k.disc('p:#2a4a1a', [0.04, 0.085, -0.03], 0.03, [-HALF, 0, 0.3]);
    for (const s of [-1, 1]) k.seg('lightWood', [-0.13, 0.1, s * 0.01], [0.12, 0.13, s * 0.012], 0.004, 0.002, 6);
    return food('Bowl of ramen', 0.8, 'ramen');
  },
  fries(k, a, r) {
    k.ext('p:#d8201a', [[-0.05, 0], [0.05, 0], [0.065, 0.12], [-0.065, 0.12]], 0.04, [0, 0, 0], null, 0.004);
    k.label('M', [0, 0.06, 0.025], 0.04, 0.04, null, { fg: '#f8c820' });
    for (let i = 0; i < 26; i++) k.box('p:#f2c848', [r.range(-0.05, 0.05), 0.13 + r.range(-0.02, 0.03), r.range(-0.015, 0.015)], [0.008, 0.09, 0.008], [r.range(-0.2, 0.2), 0, r.range(-0.25, 0.25)]);
    return food('French fries', 0.15, 'fries');
  },
  turkey(k, a, r) {
    const y = plate(k, 0.3);
    k.ball('g:#a8581a', [0, y + 0.1, 0], 0.13, [1, 0.72, 1.2], 22);
    for (const s of [-1, 1]) { k.seg('g:#a8581a', [s * 0.09, y + 0.07, 0.06], [s * 0.1, y + 0.12, 0.2], 0.045, 0.02, 10); k.ball('bone', [s * 0.1, y + 0.125, 0.215], 0.014); }
    for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; k.ball('p:' + r.pick(['#3a8a2a', '#e87a1a', '#c81a1a']), [Math.sin(an) * 0.22, y + 0.02, Math.cos(an) * 0.22], 0.025, null, 8); }
    return food(has(a, /chicken/) ? 'Roast chicken' : 'Roast turkey', 4, 'roast');
  },
  egg(k, a, r) {
    if (has(a, /fried/)) {
      k.ball('white', [0, 0.004, 0], 0.07, [1, 0.08, 0.85], 20);
      k.dome('g:#f0a010', [0.01, 0.006, 0], 0.022, null, { scl: [1, 0.7, 1] });
      return food('Fried egg', 0.05);
    }
    const col = has(a, /easter|painted/) ? k.color(r.pick(['#f08ab0', '#8ac8f0', '#f0d060', '#a8e08a'])) : k.color(has(a, /brown/) ? '#d8a878' : '#f4efe4');
    k.lathe('g:' + col, [0, 0, 0], [[0, 0], [0.018, 0.003], [0.027, 0.016], [0.028, 0.03], [0.022, 0.05], [0.012, 0.06], [0, 0.063]], 24);
    if (has(a, /easter|painted/)) for (let i = 0; i < 3; i++) k.torus('g:' + hsl(r.next(), 0.7, 0.55), [0, 0.018 + i * 0.013, 0], rAt([[0.027, 0.016], [0.028, 0.03], [0.022, 0.05]], 0.018 + i * 0.013) + 0.0005, 0.0025, [HALF, 0, 0], TAU, 24);
    return food(has(a, /easter/) ? 'Easter egg' : 'Egg', 0.06, 'egg');
  },
  cheese(k, a, r) {
    const wheel = has(a, /wheel|round/);
    const col = k.color('#f2c83a');
    if (wheel) k.cyl('p:' + col, [0, 0.06, 0], 0.18, 0.12, null, { arc: TAU * 0.85, segs: 36 });
    else k.cyl('p:' + col, [0, 0.05, 0], 0.16, 0.1, null, { arc: PI / 4, segs: 6 });
    for (let i = 0; i < (wheel ? 14 : 7); i++) {
      const an = wheel ? r.range(0, TAU * 0.85) : r.range(0.1, PI / 4 - 0.1), d = wheel ? 0.18 : r.range(0.03, 0.15);
      const top = r.chance(0.5);
      k.ball('p:#c89a20', top ? [Math.sin(an) * d * r.range(0.3, 0.9), wheel ? 0.12 : 0.1, Math.cos(an) * d * r.range(0.3, 0.9)] : [Math.sin(an) * d, r.range(0.02, 0.09), Math.cos(an) * d], r.range(0.008, 0.016), [1, top ? 0.3 : 1, 1], 8);
    }
    return food(wheel ? 'Cheese wheel' : 'Cheese', wheel ? 3 : 0.4, 'cheese');
  },
  iceCream(k, a, r) {
    k.cone('p:#d8a060', [0, 0.075, 0], 0.036, 0.15, [PI, 0, 0], 20);
    for (let i = 0; i < 6; i++) k.torus('p:#b88040', [0, 0.03 + i * 0.02, 0], 0.008 + i * 0.0048, 0.0015, [HALF, 0, 0], TAU, 16);
    const flavors = ['#f8c8d8', '#f8f0d8', '#6a3a22', '#b8f0c8', '#f8e080'];
    const n = has(a, /triple|three/) ? 3 : has(a, /double|two/) ? 2 : 2;
    for (let i = 0; i < n; i++) {
      const col = i === 0 ? k.color(r.pick(flavors)) : r.pick(flavors), y = 0.165 + i * 0.05;
      k.ball('p:' + col, [0, y, 0], 0.04 - i * 0.004, [1, 0.9, 1], 18);
      k.torus('p:' + col, [0, y - 0.022, 0], 0.036 - i * 0.004, 0.009, [HALF, 0, 0], TAU, 18);
    }
    k.ball('g:#c81a2a', [0, 0.165 + n * 0.05 - 0.01, 0], 0.012);
    return food('Ice cream cone', 0.15, 'ice cream');
  },
  milkshake(k, a, r) {
    const col = k.color(has(a, /chocolate/) ? '#6a3a22' : has(a, /vanilla/) ? '#f8f0d8' : has(a, /mint/) ? '#b8f0c8' : '#f8b8c8');
    k.lathe('glass', [0, 0, 0], [[0, 0], [0.03, 0], [0.012, 0.01], [0.01, 0.05], [0.035, 0.07], [0.045, 0.2], [0.043, 0.2], [0.033, 0.072], [0, 0.072]], 28);
    k.lathe('p:' + col, [0, 0, 0], [[0, 0.073], [0.032, 0.074], [0.041, 0.19], [0, 0.19]], 24);
    for (let i = 0; i < 4; i++) k.torus('white', [0, 0.2 + i * 0.013, 0], 0.036 - i * 0.009, 0.013 - i * 0.002, [HALF, 0, 0], TAU, 20);
    k.ball('g:#c81a2a', [0, 0.25, 0], 0.012);
    for (let i = 0; i < 8; i++) k.seg(i % 2 ? 'white' : 'g:#e02a3a', [0.012 + i * 0.002, 0.12 + i * 0.022, 0], [0.014 + i * 0.002, 0.142 + i * 0.022, 0], 0.004, 0.004, 8);
    return food('Milkshake', 0.4);
  },
  popcorn(k, a, r) {
    for (let i = 0; i < 12; i++) k.cyl(i % 2 ? 'p:#f0f0ec' : 'p:#d81a1a', [0, 0.09, 0], 0.06, 0.18, null, { rTop: 0.08, arcStart: (i / 12) * TAU, arc: TAU / 12, segs: 2, open: true });
    for (let i = 0; i < 70; i++) { const an = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.075; k.ball(r.chance(0.8) ? 'p:#f8f0d0' : 'p:#f0d070', [Math.cos(an) * d, 0.18 + (1 - d / 0.08) * 0.04 + r.range(0, 0.012), Math.sin(an) * d], r.range(0.009, 0.013), null, 6); }
    return food('Popcorn', 0.2);
  },
  soda(k, a, r) {
    const col = k.color(r.pick(['#d81a1a', '#1a4ad8', '#2a9a3a', '#f0a010']));
    k.cyl('c:' + col, [0, 0.062, 0], 0.033, 0.11, null, { segs: 24 });
    k.cyl('chrome', [0, 0.005, 0], 0.03, 0.01, null, { rTop: 0.033, segs: 24 });
    k.cyl('chrome', [0, 0.121, 0], 0.03, 0.008, null, { rTop: 0.026, segs: 24 });
    k.label(has(a, /cola|coke/) ? 'COLA' : 'SODA', [0, 0.065, 0.034], 0.05, 0.02, null, { fg: '#ffffff' });
    return food('Soda can', 0.35, 'soda');
  },
  lollipop(k, a, r) {
    k.seg('white', [0, 0, 0], [0, 0.2, 0], 0.004, 0.004, 8);
    const c1 = k.color('#e8307a'), c2 = k.color2('#f8f0f0');
    k.cyl('g:' + c1, [0, 0.25, 0], 0.055, 0.014, [HALF, 0, 0], { segs: 32 });
    for (const side of [-1, 1]) { const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, an = t * TAU * 3.5, rr = 0.004 + t * 0.048; pts.push([Math.cos(an) * rr, 0.25 + Math.sin(an) * rr, side * 0.0072]); } k.tube('g:' + c2, pts, 0.0035, 120, false, 5); }
    k.ext('fabric', [[0, 0], [0.02, 0.012], [0.02, -0.012]], 0.001, [0, 0.19, 0], [0, 0, HALF]);
    return food('Lollipop', 0.05);
  },
  candyCane(k) {
    const pts = [];
    for (let i = 0; i <= 14; i++) pts.push(new THREE.Vector3(0, i / 14 * 0.7, 0));
    for (let i = 1; i <= 12; i++) { const an = (i / 12) * PI; pts.push(new THREE.Vector3(0.1 - Math.cos(an) * 0.1, 0.7 + Math.sin(an) * 0.1, 0)); }
    for (let i = 0; i < pts.length - 1; i++) k.seg(i % 2 ? 'g:#f8f4f0' : 'g:#d81a1a', pts[i], pts[i + 1], 0.025, 0.025, 12);
    k.ball('g:#d81a1a', [0.2, 0.7, 0], 0.025);
    return { name: 'Candy cane', phys: { mass: 0.8 }, interact: eat('candy cane') };
  },
  chocolate(k, a, r) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.rbox('g:#4a2414', [-0.06 + i * 0.04, 0.012, -0.018 + j * 0.036], [0.036, 0.012, 0.032], 0.004);
    k.box('g:#3a1a0e', [0, 0.004, 0], [0.16, 0.008, 0.072]);
    k.box('chrome', [0.05, 0.011, 0], [0.07, 0.016, 0.076]);
    k.box('p:' + k.color('#6a1a8a'), [0.06, 0.013, 0], [0.06, 0.02, 0.078]);
    return food('Chocolate bar', 0.1, 'chocolate');
  },
  candy(k, a, r) {
    const col = k.color(r.pick(['#e8307a', '#f0a020', '#30a0e8', '#8ae030']));
    k.ball('g:' + col, [0, 0.02, 0], 0.02, [1.3, 1, 1], 16);
    for (const s of [-1, 1]) k.cone('g:' + col, [s * 0.036, 0.02, 0], 0.014, 0.022, [0, 0, s * HALF], 8);
    return food('Candy', 0.01);
  },
  gummyBear(k, a, r) {
    const col = k.color(r.pick(['#e8202a', '#f0a020', '#30c050', '#f8e020', '#e0f0f0']));
    k.m('gum', 'glass', { color: col, opacity: 0.8 });
    k.ball('gum', [0, 0.018, 0], 0.016, [1, 1.2, 0.8]);
    k.ball('gum', [0, 0.042, 0], 0.012);
    for (const s of [-1, 1]) { k.ball('gum', [s * 0.009, 0.053, 0], 0.005); k.ball('gum', [s * 0.014, 0.024, 0.004], 0.006, [1, 1.3, 1]); k.ball('gum', [s * 0.009, 0.005, 0.004], 0.007, [1, 0.8, 1.2]); }
    return food('Gummy bear', 0.01);
  },
  cottonCandy(k, a, r) {
    k.seg('white', [0, 0, 0], [0, 0.3, 0], 0.005, 0.005, 6);
    const col = k.color('#f8a8d0');
    for (let i = 0; i < 9; i++) k.ball('p:' + col, [r.range(-0.05, 0.05), 0.33 + r.range(-0.03, 0.08), r.range(-0.05, 0.05)], r.range(0.05, 0.07), null, 12);
    return food('Cotton candy', 0.05);
  },

  // ================= Stalls & carts =================
  stall(k, a, r, item) {
    const t = a.text || '';
    const kind = /hot ?dog/.test(t) ? 'hotdog' : /lemonade|juice/.test(t) ? 'lemonade' : /ice ?cream|gelato/.test(t) ? 'icecream' : /ticket|box office/.test(t) ? 'ticket' : /coffee/.test(t) ? 'coffee' : /flower/.test(t) ? 'flowers' : /taco|burrito/.test(t) ? 'taco' : /kebab|shawarma|burger|food/.test(t) ? 'food' : /newspaper|news|magazine/.test(t) ? 'news' : /souvenir|gift/.test(t) ? 'souvenir' : 'fruit';
    const SIGN = { hotdog: 'HOT DOGS', lemonade: 'LEMONADE', icecream: 'ICE CREAM', ticket: 'TICKETS', coffee: 'COFFEE', flowers: 'FLOWERS', taco: 'TACOS', food: 'STREET FOOD', news: 'NEWS', souvenir: 'SOUVENIRS', fruit: 'FRESH FRUIT' };
    const col = k.color(r.pick(['#d8302a', '#2a7ad8', '#2a9a4a', '#e8a020', '#8a3ab0']));
    if (kind === 'hotdog' || kind === 'icecream') {
      // A cart with an umbrella.
      k.rbox('m:' + (kind === 'icecream' ? '#f0f4f8' : col), [0, 0.75, 0], [1.4, 0.7, 0.75], 0.05);
      k.box('chrome', [0, 1.12, 0], [1.44, 0.04, 0.78]);
      for (const s of [-1, 1]) { k.torus('tire', [s * 0.5, 0.28, 0.4], 0.24, 0.04, [0, HALF, 0], TAU, 24); k.cyl('chrome', [s * 0.5, 0.28, 0.4], 0.03, 0.06, [0, 0, HALF]); }
      k.seg('chrome', [-0.7, 0.9, 0], [-1.0, 0.95, 0], 0.02, 0.02, 8);
      k.seg('chrome', [0, 1.12, 0], [0, 2.1, 0], 0.02, 0.02, 8);
      for (let i = 0; i < 8; i++) k.cyl(i % 2 ? 'f:#f8f4ec' : 'f:' + col, [0, 2.15, 0], 1.0, 0.3, null, { rTop: 0.03, arcStart: (i / 8) * TAU, arc: TAU / 8, segs: 3, open: true });
      k.disc('f:#f8f4ec', [0, 2.0, 0], 1.0, [HALF, 0, 0], 0, 16);
      if (kind === 'hotdog') {
        k.box('steel', [0.25, 1.16, 0], [0.5, 0.04, 0.4]);
        for (let i = 0; i < 5; i++) k.seg('p:#a0401a', [0.07, 1.2, -0.15 + i * 0.075], [0.43, 1.2, -0.15 + i * 0.075], 0.017, 0.017, 8);
        for (let i = 0; i < 2; i++) k.cyl(i ? 'g:#f0c010' : 'g:#d81a1a', [-0.4 + i * 0.12, 1.22, 0.2], 0.03, 0.16, null, { segs: 12 });
      } else {
        for (let i = 0; i < 6; i++) { const x = -0.5 + (i % 3) * 0.35, z = i < 3 ? -0.15 : 0.15; k.cyl('steel', [x, 1.16, z], 0.12, 0.04, null, { segs: 16 }); k.dome('p:' + ['#f8c8d8', '#f8f0d8', '#6a3a22', '#b8f0c8', '#f8e080', '#c8a0e8'][i], [x, 1.18, z], 0.1, null, { scl: [1, 0.4, 1] }); }
      }
      k.label(SIGN[kind], [0, 0.8, 0.38], 1.1, 0.32, null, { fg: '#ffffff', bg: kind === 'icecream' ? '#e8609a' : '#c81a1a', font: 'Arial, sans-serif' });
      k.collide([-0.72, 0, -0.4], [0.72, 1.14, 0.4]);
      return { name: kind === 'hotdog' ? 'Hot dog cart' : 'Ice cream cart', static: true };
    }
    // Wooden stall with a striped awning.
    const W = 2.2, D = 0.9, H = 1.0;
    k.box('w:#a8744a', [0, H / 2, 0], [W, H, D]);
    k.box('w:#c8945a', [0, H + 0.02, 0.05], [W + 0.1, 0.04, D + 0.2]);
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) k.box('w:#7a5030', [x, 1.2, z], [0.08, 2.4, 0.08]);
    for (let i = 0; i < 10; i++) k.box(i % 2 ? 'f:#f8f4ec' : 'f:' + col, [-W / 2 + (i + 0.5) * W / 10, 2.45, 0.05], [W / 10, 0.02, D + 0.7], [-0.28, 0, 0]);
    for (let i = 0; i < 10; i++) k.cyl(i % 2 ? 'f:#f8f4ec' : 'f:' + col, [-W / 2 + (i + 0.5) * W / 10, 2.26, D / 2 + 0.4], W / 20, 0.02, [HALF, 0, 0], { arcStart: HALF, arc: PI, segs: 8 });
    k.box('w:#e8d8b0', [0, 2.75, -D / 2 + 0.05], [W * 0.8, 0.45, 0.05]);
    k.label(SIGN[kind], [0, 2.75, -D / 2 + 0.08], W * 0.75, 0.38, null, { fg: '#4a2a10', font: 'Georgia, serif' });
    if (kind === 'ticket' || kind === 'news' || kind === 'coffee') {
      // Booth: closed walls with a service window.
      k.box('w:#a8744a', [0, 1.7, -D / 2], [W, 1.4, 0.05]);
      for (const s of [-1, 1]) k.box('w:#a8744a', [s * W / 2, 1.7, 0], [0.05, 1.4, D]);
      k.box('glass', [0, 1.6, D / 2], [W * 0.8, 1.0, 0.02]);
      if (kind === 'coffee') { k.rbox('steel', [0.5, 1.25, 0.1], [0.4, 0.45, 0.35], 0.03); for (let i = 0; i < 4; i++) k.cyl('white', [-0.6 + i * 0.12, 1.08, 0.3], 0.03, 0.1, null, { rTop: 0.04, segs: 10 }); }
      if (kind === 'ticket') { k.cyl('p:#e8c040', [0.6, 1.1, 0.3], 0.06, 0.1, [0, 0, HALF]); k.label('ADMIT ONE', [0, 1.3, D / 2 + 0.02], 0.8, 0.18, null, { fg: '#c81a1a', bg: '#f8f0d8' }); }
      if (kind === 'news') for (let i = 0; i < 8; i++) k.box('paper', [-0.9 + i * 0.25, 1.06, 0.2], [0.2, 0.02, 0.28], [0, r.range(-0.1, 0.1), 0]);
    } else if (kind === 'lemonade') {
      k.lathe('glass', [0.3, H + 0.04, 0.1], [[0, 0], [0.08, 0], [0.09, 0.22], [0.07, 0.25], [0, 0.25]], 20);
      k.lathe('p:#f8e040', [0.3, H + 0.04, 0.1], [[0, 0.005], [0.075, 0.005], [0.085, 0.18], [0, 0.18]], 16);
      for (let i = 0; i < 6; i++) k.cyl('glass', [-0.6 + i * 0.13, H + 0.1, 0.25], 0.03, 0.12, null, { segs: 10 });
      for (let i = 0; i < 8; i++) k.ball('g:#f8e040', [-0.2 + (i % 4) * 0.08, H + 0.08, -0.15 + Math.floor(i / 4) * 0.08], 0.035, [1, 1, 1.3]);
      k.label('50¢', [0, 0.6, D / 2 + 0.01], 0.5, 0.3, null, { fg: '#2a6a1a', bg: '#f8f0d8' });
    } else if (kind === 'flowers') {
      for (let i = 0; i < 6; i++) { const x = -0.8 + i * 0.32; k.cyl('p:#5a6a7a', [x, H + 0.12, 0], 0.1, 0.22, null, { segs: 12 }); for (let j = 0; j < 7; j++) k.ball('p:' + hsl((i * 0.17 + j * 0.02) % 1, 0.7, 0.6), [x + r.range(-0.08, 0.08), H + 0.3 + r.range(0, 0.12), r.range(-0.08, 0.08)], 0.035, null, 8); }
    } else if (kind === 'taco' || kind === 'food') {
      k.box('steel', [0, H + 0.06, 0], [1.2, 0.08, 0.5]);
      for (let i = 0; i < 5; i++) k.ball('p:' + r.pick(['#6a3a1a', '#e0b050', '#58b040', '#d83a2a']), [-0.45 + i * 0.22, H + 0.14, 0], 0.07, [1, 0.5, 1], 10);
      k.glow('#fff0d0', [0, H + 0.4, 0], 0.8, 0.3);
    } else if (kind === 'souvenir') {
      for (let i = 0; i < 12; i++) k.ball('g:' + hsl(r.next(), 0.6, 0.55), [-0.9 + (i % 6) * 0.36, H + 0.08 + Math.floor(i / 6) * 0.1, -0.1 + Math.floor(i / 6) * 0.2], 0.06, null, 8);
    } else {
      // Fruit crates.
      const fruits = ['#d81a1a', '#f08a1a', '#f2d23a', '#6ab02a', '#5a2a6a', '#e8323a'];
      for (let i = 0; i < 5; i++) {
        const x = -0.84 + i * 0.42;
        k.box('w:#c8a068', [x, H + 0.07, 0.1], [0.38, 0.14, 0.5], [-0.2, 0, 0]);
        const fc = fruits[i % fruits.length];
        for (let j = 0; j < 14; j++) k.ball('g:' + fc, [x + ((j % 4) - 1.5) * 0.08, H + 0.17 + Math.floor(j / 4) * 0.012 - (j % 2) * 0.01, 0.1 + (Math.floor(j / 4) - 1.5) * 0.1], 0.042, null, 10);
      }
    }
    k.collide([-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
    const NAME = { lemonade: 'Lemonade stand', ticket: 'Ticket booth', coffee: 'Coffee kiosk', flowers: 'Flower stall', taco: 'Taco stand', food: 'Food stall', news: 'Newsstand', souvenir: 'Souvenir stall', fruit: 'Market stall' };
    return { name: NAME[kind], static: true };
  },
};
