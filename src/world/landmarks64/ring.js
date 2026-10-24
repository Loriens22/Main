// The Sofia Ring Road (Околовръстен път) where line 64 crosses it at bul. Cherni vrah (stops 1176 /
// 1177): an overhead sign gantry over each carriageway ~135 m before the junction, facing the
// oncoming traffic, with blue direction boards (Bulgarian practice off the motorways). Carriageway
// lines are the OSM ones (pack roads 7029 westbound, 7040 eastbound); the destinations follow the
// geography (Boyana / Pernik to the west, Simeonovo / Mladost to the east, the centre north along
// Cherni vrah, Dragalevtsi south) - the real boards' wording is NOT verified.
import { MeshBuilder } from '../LandmarkGeometry.js';
import { done, signMat, fitText } from './common.js';
import { baseMats } from './mats.js';

function arrow(g, x, y, s, dir) {
  g.save();
  g.translate(x, y);
  g.rotate(dir);
  g.beginPath();
  g.moveTo(0, -s); g.lineTo(s * 0.62, -s * 0.2); g.lineTo(s * 0.22, -s * 0.2); g.lineTo(s * 0.22, s); g.lineTo(-s * 0.22, s); g.lineTo(-s * 0.22, -s * 0.2); g.lineTo(-s * 0.62, -s * 0.2);
  g.closePath(); g.fill();
  g.restore();
}

/** Blue direction board: [left, ahead, right] destinations as [Cyrillic, Latin]. */
function board(M, key, dests) {
  signMat(M, key, 1024, 320, (g, w, h) => {
    g.fillStyle = '#1950a6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#ffffff';
    const cols = [w * 0.17, w * 0.5, w * 0.83];
    const dirs = [-Math.PI / 2, 0, Math.PI / 2];
    dests.forEach((d, i) => {
      if (!d) return;
      arrow(g, cols[i], 80, 46, dirs[i]);
      fitText(g, d[0], cols[i], 178, w * 0.3, 54, 700, 'Arial, "DejaVu Sans", sans-serif');
      fitText(g, d[1], cols[i], 236, w * 0.3, 36, 500, 'Arial, "DejaVu Sans", sans-serif');
      if (d[2]) fitText(g, d[2], cols[i], 284, w * 0.3, 32, 600, 'Arial, "DejaVu Sans", sans-serif');
    });
    // dividers
    g.fillRect(w / 3 - 2, 40, 4, h - 80); g.fillRect((2 * w) / 3 - 2, 40, 4, h - 80);
  });
}

/** Gantry at (x, z) across a carriageway: tx, tz = travel direction of the traffic it faces. */
function gantry(b, y, x, z, tx, tz, span, signKey) {
  const yaw = Math.atan2(-tx, -tz); // local +z faces the oncoming traffic, local +x across the road
  const gy = y(x, z);
  b.push(x, gy, z, yaw);
  const H = 6.3;
  for (const s of [-1, 1]) {
    const px = s * span / 2;
    b.box('l64granite', px, -0.4, 0, 1.1, 0.7, 1.1, 0, { tw: 2, th: 2 });
    b.cyl('galv', px, 0.3, 0, 0.2, 0.18, H + 1.3, 12);
  }
  // box truss: two chords front and back, verticals and diagonals
  for (const [yy, zz] of [[H, 0.35], [H, -0.35], [H + 1.1, 0.35], [H + 1.1, -0.35]]) b.box('galv', 0, yy, zz, span + 0.4, 0.09, 0.09, 0, {});
  const n = Math.round(span / 1.6);
  for (let i = 0; i <= n; i++) {
    const xx = -span / 2 + (i * span) / n;
    for (const zz of [0.35, -0.35]) b.box('galv', xx, H, zz, 0.06, 1.15, 0.06, 0, {});
    b.box('galv', xx, H + 0.53, 0, 0.05, 0.05, 0.7, 0, {});
  }
  // the board hangs in front of the truss over the middle of the carriageway
  const sw = 8.2, sh = sw * 0.3125;
  b.box('l64steelDark', 0, H + 0.55 - sh / 2, 0.52, sw + 0.15, sh + 0.15, 0.12, 0, {});
  b.quad(signKey, [-sw / 2, H + 0.55 - sh / 2 + 0.07, 0.59], [sw / 2, H + 0.55 - sh / 2 + 0.07, 0.59], [sw / 2, H + 0.55 + sh / 2 + 0.07, 0.59], [-sw / 2, H + 0.55 + sh / 2 + 0.07, 0.59]);
  b.pop();
}

export function buildRingGantries({ M, y }) {
  baseMats(M);
  board(M, 'ringWest', [['Драгалевци', 'Dragalevtsi'], ['Бояна · Перник', 'Boyana · Pernik', 'Околовръстен път'], ['Център', 'Centre', 'бул. Черни връх']]);
  board(M, 'ringEast', [['Център', 'Centre', 'бул. Черни връх'], ['Симеоново · Младост', 'Simeonovo · Mladost', 'Околовръстен път'], ['Драгалевци', 'Dragalevtsi']]);
  const b = new MeshBuilder();
  // the carriageways are 13.7 m apart (10.5 / 11 m wide): the median-side posts stand on the ~3 m median
  // westbound carriageway (north), approaching from the east
  gantry(b, y, -3122.7, 3095.4, -0.877, -0.481, 13.2, 'ringWest');
  // eastbound carriageway (south), approaching from the west
  gantry(b, y, -3365.4, 2976.8, 0.873, 0.488, 13.4, 'ringEast');
  return done(b, M, -3244, 3036);
}
