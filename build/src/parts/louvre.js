// ---------------------------------------------------------------------------
// parts/louvre.js — warm teak timber elements for the luxury facade.
//   createWoodLouvre  : slatted timber sun-screen (angled slats, dark recess)
//   createWoodCladding: horizontal plank rainscreen for the cantilevered boxes
// Units: METRES, +Y up. Facade-mounted: centred on X, base y=0, mounting plane
// z=0, slats/planks project toward +Z. InstancedMesh keeps the many parts cheap.
// ---------------------------------------------------------------------------
import { THREE, bevelBox, mat, palette, shadows } from './kit.js';

// A handful of warm teak base tones; each instance gets a deterministic nudge
// in saturation/lightness so no two slats or planks read identically.
const TEAK = [0x9a6238, 0xa86c3c, 0x8a5730, 0xb0743f, 0x855230, 0x9c6134];

function toneAt(i) {
  const c = new THREE.Color(TEAK[i % TEAK.length]);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // deterministic pseudo-random in [-0.5, 0.5]
  const j = (((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
  const k = (((i * 40503 + 17) >>> 0) % 1000) / 1000 - 0.5;
  c.setHSL(
    hsl.h + j * 0.012,
    THREE.MathUtils.clamp(hsl.s * (1 + k * 0.10), 0, 1),
    THREE.MathUtils.clamp(hsl.l * (1 + j * 0.14), 0, 1)
  );
  return c;
}

// ---------------------------------------------------------------------------
// createWoodLouvre(width, height, orientation)
//   orientation 'v' -> vertical slats spanning the height (arrayed across X)
//   orientation 'h' -> horizontal slats spanning the width (arrayed up Y)
// ---------------------------------------------------------------------------
export function createWoodLouvre(width = 1.2, height = 3.0, orientation = 'v') {
  const g = new THREE.Group();
  const pal = palette();

  const fw = 0.05;   // frame border thickness
  const fd = 0.10;   // frame depth (out along +Z)
  const iw = width - 2 * fw;   // inner opening width
  const ih = height - 2 * fw;  // inner opening height
  const cz = fd / 2;           // depth centre of frame / slats

  // --- slim timber frame (four bars) ---
  const frameMat = mat(0x5f3d24, { roughness: 0.5, envMapIntensity: 0.5 });
  const addBar = (w, h, x, y) => {
    const mesh = new THREE.Mesh(bevelBox(w, h, fd, 0.008, 1), frameMat);
    mesh.position.set(x, y, cz);
    g.add(mesh);
  };
  addBar(width, fw, 0, height - fw / 2);          // top
  addBar(width, fw, 0, fw / 2);                   // bottom
  addBar(fw, ih, -(width - fw) / 2, height / 2);  // left
  addBar(fw, ih, (width - fw) / 2, height / 2);   // right

  // --- dark recessed back panel so the gaps read as deep shadow ---
  const back = new THREE.Mesh(bevelBox(iw, ih, 0.02, 0.004, 1),
    mat(0x121214, { roughness: 0.85, metalness: 0.1, envMapIntensity: 0.3 }));
  back.position.set(0, height / 2, 0.012);
  g.add(back);

  // --- angled slats via InstancedMesh ---
  const tilt = THREE.MathUtils.degToRad(20);
  const thin = 0.03;      // slat thickness
  const depth = 0.075;    // how far it projects
  const slatMat = mat(0xffffff, { roughness: 0.5, envMapIntensity: 0.55 });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  if (orientation === 'h') {
    const len = iw - 0.006;
    const pitch = 0.085;
    const usable = ih - thin;
    const n = Math.max(3, Math.floor(usable / pitch) + 1);
    const geo = bevelBox(len, thin, depth, 0.006, 1);
    const im = new THREE.InstancedMesh(geo, slatMat, n);
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const y = fw + thin / 2 + t * usable;
      m4.compose(new THREE.Vector3(0, y, cz), q, one);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, toneAt(i));
    }
    g.add(im);
  } else {
    const len = ih - 0.006;
    const pitch = 0.078;
    const usable = iw - thin;
    const n = Math.max(3, Math.floor(usable / pitch) + 1);
    const geo = bevelBox(thin, len, depth, 0.006, 1);
    const im = new THREE.InstancedMesh(geo, slatMat, n);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tilt);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const x = -usable / 2 + t * usable;
      m4.compose(new THREE.Vector3(x, height / 2, cz), q, one);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, toneAt(i));
    }
    g.add(im);
  }

  shadows(g);
  return g;
}

// ---------------------------------------------------------------------------
// createWoodCladding(width, height)
//   Horizontal timber plank rainscreen. Real planks stacked with reveal grooves
//   between them, tiny per-plank z-offsets for relief, dark backing behind so
//   the grooves read as crisp shadow lines. Warm teak, plank-to-plank tone shift.
// ---------------------------------------------------------------------------
export function createWoodCladding(width = 3.4, height = 3.2) {
  const g = new THREE.Group();

  // dark backing board — visible through the reveal grooves
  const back = new THREE.Mesh(bevelBox(width, height, 0.03, 0.006, 1),
    mat(0x211711, { roughness: 0.85, envMapIntensity: 0.3 }));
  back.position.set(0, height / 2, 0.015);
  g.add(back);

  const plankH = 0.17;   // plank face height
  const reveal = 0.014;  // shadow-gap groove between planks
  const plankD = 0.045;  // plank depth (projection)
  const pitch = plankH + reveal;
  const n = Math.max(3, Math.floor((height - plankH) / pitch) + 1);

  const total = n * plankH + (n - 1) * reveal;
  const y0 = (height - total) / 2;              // vertically centre the stack
  const backFront = 0.015 + 0.015;              // front face of backing board

  const geo = bevelBox(width, plankH, plankD, 0.008, 1);
  const im = new THREE.InstancedMesh(geo,
    mat(0xffffff, { roughness: 0.5, envMapIntensity: 0.5 }), n);
  const m4 = new THREE.Matrix4();

  for (let i = 0; i < n; i++) {
    const y = y0 + plankH / 2 + i * pitch;
    const zoff = ((i % 3) - 1) * 0.006;         // subtle in/out relief
    const z = backFront + plankD / 2 + zoff;
    m4.makeTranslation(0, y, z);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, toneAt(i));
  }
  g.add(im);

  shadows(g);
  return g;
}
