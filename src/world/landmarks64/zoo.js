// The western entrance of the Sofia Zoo (ул. „Сребърна“ 1), beside the Зоопарка terminus of line 64
// (stops 2764 / 0749). The zoo's own site calls this gate the Western entrance - reached from the
// Vitosha metro station - and its main entrance is on Simeonovsko shose; the ticket offices of both
// open 9:30-18:00. OSM maps a guardhouse (pack 14980) standing in the zoo fence line here: it is
// rebuilt as the entrance pavilion - ticket office, a covered turnstile passage, a staff room -
// under a flat roof carrying the name board. The pavilion's design and colours are NOT verified.
import { MeshBuilder } from '../LandmarkGeometry.js';
import { done, signMat, fitText, rrect, barFence } from './common.js';
import { baseMats, barFenceMat } from './mats.js';
import { tree, treeMats, bench } from './props.js';
import { plasterMat } from '../LandmarkInstitutionsKit.js';

function zooMats(M) {
  baseMats(M);
  treeMats(M);
  plasterMat(M, 'zooPlaster', '#d9c49a', 0.12);
  barFenceMat(M, 'zooGate', { color: '#2b4a33', bars: 22, rails: [0.08, 0.5, 0.94], panelFrame: true });
  signMat(M, 'zooSign', 1024, 192, (g, w, h) => {
    g.fillStyle = '#1f5a35'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e9d58a'; g.lineWidth = 5; rrect(g, 8, 8, w - 16, h - 16, 16); g.stroke();
    g.fillStyle = '#ffffff';
    fitText(g, 'СОФИЙСКИ ЗООПАРК', w / 2, h * 0.42, w * 0.66, 92, 800);
    g.fillStyle = '#e9d58a';
    fitText(g, 'ЗАПАДЕН ВХОД · ул. „Сребърна“ 1', w / 2, h * 0.8, w * 0.6, 34, 600);
    // two silhouettes framing the name: a giraffe (left) and an elephant (right)
    g.fillStyle = '#e9d58a';
    giraffe(g, 92, h - 22, 1.0);
    elephant(g, w - 128, h - 24, 1.0);
  }, { rough: 0.5 });
  signMat(M, 'zooKasa', 256, 64, (g, w, h) => {
    g.fillStyle = '#1f5a35'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; fitText(g, 'КАСА · БИЛЕТИ', w / 2, h / 2, w * 0.9, 34, 700);
  });
  signMat(M, 'zooHours', 256, 320, (g, w, h) => {
    g.fillStyle = '#f4efe1'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f5a35'; g.fillRect(0, 0, w, 64);
    g.fillStyle = '#ffffff'; fitText(g, 'СОФИЙСКИ ЗООПАРК', w / 2, 32, w * 0.9, 26, 800);
    g.fillStyle = '#23302a';
    fitText(g, 'Работно време на касите', w / 2, 104, w * 0.9, 20, 700);
    fitText(g, '9:30 – 18:00', w / 2, 146, w * 0.8, 40, 800);
    g.fillStyle = '#56645b';
    fitText(g, 'Западен вход', w / 2, 200, w * 0.8, 20, 600);
    fitText(g, 'Централен вход –', w / 2, 236, w * 0.86, 18, 500);
    fitText(g, 'бул. „Симеоновско шосе“', w / 2, 260, w * 0.86, 18, 500);
    g.fillStyle = '#1f5a35'; g.fillRect(0, h - 10, w, 10);
  }, { glow: false });
}

function giraffe(g, x, y, s) {
  g.beginPath();
  g.moveTo(x - 30 * s, y);
  g.lineTo(x - 26 * s, y - 52 * s); g.lineTo(x - 20 * s, y - 56 * s); // hind leg, rump
  g.lineTo(x + 10 * s, y - 64 * s); // back
  g.lineTo(x + 26 * s, y - 128 * s); // neck
  g.lineTo(x + 30 * s, y - 140 * s); g.lineTo(x + 44 * s, y - 136 * s); g.lineTo(x + 44 * s, y - 130 * s); // head
  g.lineTo(x + 32 * s, y - 124 * s);
  g.lineTo(x + 20 * s, y - 60 * s); // throat, chest
  g.lineTo(x + 16 * s, y); g.lineTo(x + 10 * s, y); g.lineTo(x + 8 * s, y - 40 * s); // front leg
  g.lineTo(x - 16 * s, y - 42 * s); g.lineTo(x - 22 * s, y); // belly, hind leg
  g.closePath(); g.fill();
}

function elephant(g, x, y, s) {
  g.beginPath(); g.ellipse(x, y - 52 * s, 44 * s, 30 * s, 0, 0, Math.PI * 2); g.fill(); // body
  g.beginPath(); g.ellipse(x + 46 * s, y - 62 * s, 20 * s, 22 * s, 0, 0, Math.PI * 2); g.fill(); // head
  g.beginPath(); g.ellipse(x + 34 * s, y - 62 * s, 14 * s, 20 * s, 0.2, 0, Math.PI * 2); g.fill(); // ear
  g.fillRect(x + 56 * s, y - 60 * s, 9 * s, 46 * s); // trunk
  for (const lx of [-32, -14, 10, 26]) g.fillRect(x + lx * s, y - 30 * s, 13 * s, 30 * s); // legs
}

export function buildZooEntrance({ world, M, y, replaced }) {
  const part = replaced.find((r) => /^Zoo west entrance/.test(r.entry.note));
  if (!part) return null;
  zooMats(M);
  const b = new MeshBuilder();
  // footprint corners (pack 14980): north, east, south, west
  const N1 = [-1963.8, 1083.6], E1 = [-1959.9, 1087.7], W1 = [-1971.8, 1091.2];
  const cx = part.cx, cz = part.cz;
  const ux = (W1[0] - N1[0]) / 11.03, uz = (W1[1] - N1[1]) / 11.03; // long axis, towards the street end
  const vx = (E1[0] - N1[0]) / 5.66, vz = (E1[1] - N1[1]) / 5.66; // short axis, into the zoo
  const yaw = Math.atan2(-vx, -vz); // local +z = the street face (north-west), local +x = u
  void ux; void uz;
  let gy = Infinity;
  for (const [x, z] of [N1, E1, W1, [-1967.9, 1095.3]]) gy = Math.min(gy, y(x, z));
  b.push(cx, gy, cz, yaw);
  pavilion(b);
  b.pop();
  // exit gate between the pavilion's south-west end and the fence (the OSM fence piece there is masked)
  const ga = [-1969.85, 1093.25], gb = [-1972.5, 1095.8];
  barFence(b, 'zooGate', [ga[0], ga[1], gb[0], gb[1]], { h: 2.0, y: (x, z) => y(x, z) - 0.05, tw: 2.4, step: 1.3 });
  for (const [x, z] of [ga, gb]) b.box('l64steelDark', x, y(x, z) - 0.1, z, 0.16, 2.3, 0.16, 0, {});
  // the hours board, benches and two plane trees on the forecourt towards the stop
  const bx = cx + -vx * 5.5 + ux * 4.0, bz = cz + -vz * 5.5 + uz * 4.0;
  b.push(bx, y(bx, bz), bz, yaw);
  b.box('l64steelDark', -0.55, 0, 0, 0.08, 2.4, 0.08, 0, {});
  b.box('l64steelDark', 0.55, 0, 0, 0.08, 2.4, 0.08, 0, {});
  b.box('l64steelDark', 0, 0.85, -0.02, 1.2, 1.5, 0.05, 0, {});
  b.quad('zooHours', [-0.56, 0.9, 0.01], [0.56, 0.9, 0.01], [0.56, 2.3, 0.01], [-0.56, 2.3, 0.01]);
  b.pop();
  for (const [k, s] of [[-2.5, 1.0], [6.5, 1.0]]) {
    const x = cx + -vx * 8 + ux * k, z = cz + -vz * 8 + uz * k;
    bench(b, x, y(x, z), z, yaw + Math.PI);
    void s;
  }
  for (const [k, d, s] of [[-7.5, 9.5, 1.25], [10.5, 7.0, 1.15]]) {
    const x = cx + -vx * d + ux * k, z = cz + -vz * d + uz * k;
    tree(b, x, y(x, z), z, s, 'l64leaf');
  }
  return done(b, M, cx, cz);
}

/** Pavilion in its local frame: x along the long side (+x = street end), z across (+z = street face). */
function pavilion(b) {
  const L = 11.0, D = 5.6, H = 3.1;
  const x0 = -L / 2, x1 = L / 2, z0 = -D / 2, z1 = D / 2;
  // plinth slab and paving of the passage
  b.box('l64granite', 0, -0.4, 0, L + 0.4, 0.5, D + 0.4, 0, { tw: 2, th: 2 });
  // ticket office (street end) and staff room (zoo end): plastered boxes, the passage between them
  const pA = 1.9, pB = -1.7; // passage between x = pB and x = pA
  for (const [a, c] of [[pA, x1], [x0, pB]]) {
    const w = c - a, mx = (a + c) / 2;
    b.box('zooPlaster', mx, 0.1, 0, w, H - 0.1, D, 0, { tw: 4, th: 4, top: false });
    // timber battens on the street face
    for (let k = 0; k < Math.floor(w / 0.35); k++) b.box('l64wood', a + 0.2 + k * 0.35, 1.9, z1 + 0.03, 0.12, H - 1.95, 0.05, 0, {});
    b.box('l64granite', mx, 0.1, z1 + 0.03, w, 0.45, 0.06, 0, { tw: 2, th: 2 });
  }
  // ticket windows with a counter and the КАСА sign on the street face
  for (const x of [2.85, 4.55]) {
    b.box('l64black', x, 0.95, z1 + 0.02, 1.0, 0.9, 0.04, 0, {});
    b.quad('glassL64', [x - 0.46, 0.99, z1 + 0.06], [x + 0.46, 0.99, z1 + 0.06], [x + 0.46, 1.81, z1 + 0.06], [x - 0.46, 1.81, z1 + 0.06]);
    b.box('l64steel', x, 0.92, z1 + 0.18, 1.1, 0.05, 0.32, 0, {});
    b.quad('zooKasa', [x - 0.5, 1.92, z1 + 0.09], [x + 0.5, 1.92, z1 + 0.09], [x + 0.5, 2.17, z1 + 0.09], [x - 0.5, 2.17, z1 + 0.09]);
  }
  // staff room: a window on the street side, a door to the zoo side
  b.box('l64black', (x0 + pB) / 2, 1.0, z1 + 0.02, 1.6, 1.1, 0.04, 0, {});
  b.quad('glassL64', [(x0 + pB) / 2 - 0.75, 1.04, z1 + 0.06], [(x0 + pB) / 2 + 0.75, 1.04, z1 + 0.06], [(x0 + pB) / 2 + 0.75, 2.06, z1 + 0.06], [(x0 + pB) / 2 - 0.75, 2.06, z1 + 0.06]);
  b.box('doorDark', (x0 + pB) / 2, 0.1, z0 - 0.03, 1.0, 2.2, 0.06, 0, {});
  // turnstiles in the passage: three posts with arms, and steel rails dividing the lanes
  for (let i = 0; i < 4; i++) {
    const x = pB + 0.25 + (i * (pA - pB - 0.5)) / 3;
    b.box('l64steel', x, 0.1, 0.0, 0.08, 1.0, 1.6, 0, {});
    if (i < 3) {
      const tx = x + (pA - pB - 0.5) / 6;
      b.cyl('l64steel', tx - 0.4, 0.1, 0.0, 0.11, 0.11, 0.95, 10);
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;
        b.box('l64steel', tx - 0.4 + Math.cos(a) * 0.28, 0.82 + Math.sin(a) * 0.12, 0.0, 0.5, 0.04, 0.04, a * 0.2, {});
      }
    }
  }
  // roof slab with a deep canopy over the street face, fascia, lights
  b.box('l64offwhite', 0, H, 0.8, L + 1.2, 0.32, D + 2.2, 0, { tw: 2, th: 2, bottom: true });
  b.box('l64steelDark', 0, H - 0.02, z1 + 1.88, L + 1.25, 0.36, 0.08, 0, {});
  for (const x of [-4, -1.2, 1.2, 4]) b.box('l64glow', x, H - 0.03, z1 + 0.9, 0.9, 0.03, 0.25, 0, {});
  // the name board on the roof edge, facing the street, with posts behind it
  const sw = 9.0, sh = sw * 0.1875;
  b.box('l64steelDark', 0, H + 0.32, z1 + 1.55, sw + 0.3, sh + 0.25, 0.14, 0, {});
  b.quad('zooSign', [-sw / 2, H + 0.44, z1 + 1.63], [sw / 2, H + 0.44, z1 + 1.63], [sw / 2, H + 0.44 + sh, z1 + 1.63], [-sw / 2, H + 0.44 + sh, z1 + 1.63]);
  for (const x of [-3.2, 0, 3.2]) b.box('l64steelDark', x, H + 0.32, z1 + 1.3, 0.1, sh + 0.1, 0.4, 0, {});
}
