// Shop fronts with interiors behind the glass for the real businesses of the line (the ShopSigns list:
// Overture places): an aluminium-framed glazed front under each fascia board with a glass door, and behind the
// glass a room drawn by interior mapping: the view ray is traced into a virtual box (back wall, side walls,
// floor, ceiling) whose faces come from a canvas atlas drawn per kind of shop, chosen from the name (grocery,
// pharmacy, cafe, clothes, bakery, bank / phone shop, salon, any other shop). The room lights up at night;
// the glass reflects the sky at grazing angles. Cafes and bakeries get a striped awning.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const KINDS = ['shop', 'grocery', 'pharmacy', 'cafe', 'clothes', 'bakery', 'office', 'salon'];
const RULES = [
  [/аптек|pharm|apothe|медикамент|sopharma|софарма/i, 'pharmacy'],
  [/кафе|caf[eé]|coffee|бар\b|bar\b|бистро|bistro|ресторант|restaurant|пиц|pizz|механа|кръчма|pub|грил|grill|дюнер|burger|food|храни\b|sushi|суши/i, 'cafe'],
  [/пекарн|хлеб|bakery|bread|закуск|баница|сладкарн|pastry|donut|торт|cake/i, 'bakery'],
  [/билла|billa|lidl|лидл|kaufland|кауфланд|фантастико|fantastico|t market|т маркет|супермаркет|маркет|market|хранителн|магазин за хран|плод|зеленчук|месо|meat|алкохол|alcohol|tabak|тютюн|вино|wine|кв\.? магазин|minimarket|мини маркет|деликатес|delicat/i, 'grocery'],
  [/бутик|boutique|fashion|мода|дрехи|облекл|обувк|shoe|jeans|textil|текстил|бельо|чанти|bag|sport|спорт|детск|kids|optic|оптик/i, 'clothes'],
  [/банк|bank|дск|dsk|оББ|ubb|fibank|пощенска|юробанк|postbank|unicredit|уникредит|обмен|exchange|застрах|insur|vivacom|виваком|a1\b|yettel|теленор|telenor|мтел|mtel|офис|office|нотари|адвокат|агенция|agency|имот|estate|туристическ|travel|western union|easypay|изипей/i, 'office'],
  [/фризьор|салон|salon|beauty|красот|козмет|cosmet|маникюр|nail|spa\b|спа\b|бръснар|barber|hair|коса/i, 'salon'],
];

function kindOf(name) {
  for (const [re, k] of RULES) if (re.test(name)) return k;
  return 'shop';
}

/* ------------------------------------------------------------------ the interior atlas */
// 4 columns (back wall, side wall, floor, ceiling) x 8 rows (KINDS), 256 px tiles
const TILE = 256;

function drawAtlas() {
  const c = document.createElement('canvas');
  c.width = TILE * 4;
  c.height = TILE * KINDS.length;
  const g = c.getContext('2d');
  const rnd = mulberry32(2024);
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  KINDS.forEach((kind, row) => {
    const y0 = row * TILE;
    const tile = (col, fn) => { g.save(); g.translate(col * TILE, y0); g.beginPath(); g.rect(0, 0, TILE, TILE); g.clip(); fn(); g.restore(); };
    const wallCol = { shop: '#e9e6df', grocery: '#eef0ea', pharmacy: '#f4f7f5', cafe: '#8a5a3c', clothes: '#efe9e2', bakery: '#e8d8bd', office: '#e7ecf2', salon: '#f3e6ea' }[kind];
    const floorCol = { shop: '#bdb6aa', grocery: '#cfcbc2', pharmacy: '#dfe3e0', cafe: '#6b4a32', clothes: '#a99886', bakery: '#c9b79a', office: '#9aa3ab', salon: '#e3d7da' }[kind];
    // shelves full of products (rows of small coloured boxes)
    const shelves = (x0, x1, yTop, rows, pal, dense = 1) => {
      for (let r = 0; r < rows; r++) {
        const y = yTop + r * 34;
        g.fillStyle = '#9a9690'; g.fillRect(x0, y + 26, x1 - x0, 4);
        for (let x = x0 + 2; x < x1 - 6; x += R(6, 12) / dense) {
          const w = R(5, 10), h = R(12, 24);
          g.fillStyle = pick(pal);
          g.fillRect(x, y + 26 - h, w, h);
        }
      }
    };
    const PROD = ['#c8322d', '#f0c419', '#2e7d32', '#1565c0', '#f57c00', '#ffffff', '#7b1fa2', '#e91e63', '#4e342e', '#00897b'];
    // ---- back wall
    tile(0, () => {
      g.fillStyle = wallCol; g.fillRect(0, 0, TILE, TILE);
      if (kind === 'grocery') {
        shelves(6, 250, 40, 6, PROD, 1.6);
        g.fillStyle = '#d9e6ec'; g.fillRect(170, 30, 80, 200); // fridge
        for (let y = 40; y < 220; y += 30) { g.fillStyle = pick(PROD); g.fillRect(176, y, 68, 18); }
        g.strokeStyle = '#8fa4ae'; g.lineWidth = 3; g.strokeRect(170, 30, 80, 200);
      } else if (kind === 'pharmacy') {
        shelves(10, 246, 40, 5, ['#ffffff', '#e3f2fd', '#e8f5e9', '#fff3e0', '#d32f2f', '#1976d2', '#43a047'], 1.8);
        g.fillStyle = '#2e7d32'; g.fillRect(108, 6, 40, 12); g.fillRect(122, -8, 12, 40); // green cross
        g.fillStyle = '#ffffff'; g.fillRect(20, 205, 216, 51); // counter
        g.fillStyle = '#43a047'; g.fillRect(20, 205, 216, 8);
      } else if (kind === 'cafe') {
        g.fillStyle = '#5b3a24'; g.fillRect(0, 150, TILE, 106); // bar counter
        g.fillStyle = '#c99a5b'; g.fillRect(0, 146, TILE, 8);
        for (let r = 0; r < 3; r++) for (let x = 14; x < 240; x += 13) { // bottles on shelves
          g.fillStyle = pick(['#2e7d32', '#6d4c41', '#c62828', '#f9a825', '#e0e0e0']);
          g.fillRect(x, 30 + r * 36, 6, 22); g.fillRect(x + 2, 24 + r * 36, 2, 8);
        }
        for (let r = 0; r < 3; r++) { g.fillStyle = '#3e2a1c'; g.fillRect(8, 54 + r * 36, 240, 3); }
        g.fillStyle = '#d7ccc8'; g.fillRect(190, 110, 40, 36); // coffee machine
        g.fillStyle = '#212121'; g.fillRect(196, 118, 28, 10);
      } else if (kind === 'clothes') {
        for (let rack = 0; rack < 2; rack++) {
          const y = 40 + rack * 100;
          g.fillStyle = '#9e9e9e'; g.fillRect(10, y, 236, 3);
          for (let x = 14; x < 240; x += R(9, 14)) { g.fillStyle = pick(['#263238', '#c62828', '#f5f5f5', '#5d4037', '#1e88e5', '#8e24aa', '#ffb300', '#546e7a']); g.fillRect(x, y + 3, R(8, 12), R(50, 80)); }
        }
        g.fillStyle = '#cfd8dc'; g.fillRect(100, 10, 56, 26); // mirror light
      } else if (kind === 'bakery') {
        g.fillStyle = '#efe5d2'; g.fillRect(0, 0, TILE, 150);
        for (let r = 0; r < 3; r++) for (let x = 16; x < 240; x += 22) { // bread on racks
          g.fillStyle = pick(['#b5793e', '#c98a48', '#8d5a2b', '#d9a35f']);
          g.beginPath(); g.ellipse(x, 40 + r * 40, 9, 6, 0, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#ffffff'; g.fillRect(10, 170, 236, 86); // display counter
        g.fillStyle = 'rgba(160,200,220,0.5)'; g.fillRect(14, 172, 228, 34);
        for (let x = 22; x < 236; x += 20) { g.fillStyle = pick(['#f8bbd0', '#ffe082', '#bcaaa4', '#a1887f']); g.fillRect(x, 192, 14, 10); }
      } else if (kind === 'office') {
        g.fillStyle = '#1e5aa8'; g.fillRect(0, 20, TILE, 40); // corporate band
        g.fillStyle = '#ffffff'; g.fillRect(30, 30, 100, 20);
        g.fillStyle = '#90a4ae'; g.fillRect(150, 80, 80, 110); // poster
        g.fillStyle = '#ffffff'; g.fillRect(20, 190, 216, 66); // desks
        g.fillStyle = '#37474f'; g.fillRect(40, 168, 40, 26); g.fillRect(150, 168, 40, 26); // screens
      } else if (kind === 'salon') {
        for (let x = 10; x < 246; x += 80) { g.fillStyle = '#cfd8dc'; g.fillRect(x, 40, 64, 110); g.fillStyle = '#eceff1'; g.fillRect(x + 4, 44, 56, 102); } // mirrors
        g.fillStyle = '#ffffff'; g.fillRect(0, 160, TILE, 20);
        for (let x = 30; x < 246; x += 80) { g.fillStyle = '#212121'; g.fillRect(x, 180, 30, 50); } // chairs
      } else {
        shelves(8, 248, 40, 5, PROD);
        g.fillStyle = '#ffffff'; g.fillRect(150, 190, 100, 66); g.fillStyle = '#b0bec5'; g.fillRect(150, 190, 100, 6); // counter
      }
      // skirting and a shadow at the floor line
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 248, TILE, 8);
    });
    // ---- side walls
    tile(1, () => {
      g.fillStyle = wallCol; g.fillRect(0, 0, TILE, TILE);
      if (kind === 'grocery' || kind === 'shop') shelves(0, TILE, 40, 6, PROD, kind === 'grocery' ? 1.6 : 1);
      else if (kind === 'pharmacy') shelves(0, TILE, 40, 5, ['#ffffff', '#e3f2fd', '#e8f5e9', '#fff3e0', '#d32f2f', '#1976d2'], 1.8);
      else if (kind === 'clothes') {
        g.fillStyle = '#9e9e9e'; g.fillRect(0, 50, TILE, 3);
        for (let x = 4; x < TILE; x += R(8, 12)) { g.fillStyle = pick(['#263238', '#c62828', '#f5f5f5', '#1e88e5', '#8e24aa', '#ffb300']); g.fillRect(x, 53, R(7, 10), R(60, 90)); }
      } else if (kind === 'cafe') {
        g.fillStyle = '#a1887f'; g.fillRect(0, 120, TILE, 4);
        for (let x = 20; x < TILE; x += 70) { g.fillStyle = '#d7ccc8'; g.fillRect(x, 40, 40, 50); g.fillStyle = '#795548'; g.fillRect(x + 4, 44, 32, 42); } // pictures
        for (let x = 10; x < TILE; x += 60) { g.fillStyle = '#4e342e'; g.fillRect(x, 170, 44, 6); g.fillRect(x + 20, 176, 4, 60); } // tables
      } else if (kind === 'bakery') { for (let x = 10; x < TILE; x += 40) { g.fillStyle = '#d7a86e'; g.fillRect(x, 60, 30, 120); } }
      else if (kind === 'office') { g.fillStyle = '#cfd8dc'; g.fillRect(30, 60, 90, 120); g.fillStyle = '#1e5aa8'; g.fillRect(150, 60, 70, 90); }
      else { g.fillStyle = '#e0e0e0'; g.fillRect(20, 50, 210, 130); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 248, TILE, 8);
    });
    // ---- floor (tiles or boards)
    tile(2, () => {
      g.fillStyle = floorCol; g.fillRect(0, 0, TILE, TILE);
      const wood = kind === 'cafe' || kind === 'clothes';
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 2;
      if (wood) for (let y = 0; y < TILE; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(TILE, y); g.stroke(); }
      else for (let k = 0; k <= TILE; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, TILE); g.moveTo(0, k); g.lineTo(TILE, k); g.stroke(); }
      if (kind === 'cafe') for (let x = 30; x < TILE; x += 90) for (let y = 40; y < TILE; y += 110) { g.fillStyle = 'rgba(40,25,15,0.55)'; g.beginPath(); g.ellipse(x, y, 26, 26, 0, 0, Math.PI * 2); g.fill(); }
      if (kind === 'grocery' || kind === 'shop') for (let y = 30; y < TILE; y += 120) { g.fillStyle = 'rgba(120,110,100,0.55)'; g.fillRect(40, y, 176, 40); } // gondolas from above
    });
    // ---- ceiling with lamps
    tile(3, () => {
      g.fillStyle = kind === 'cafe' ? '#3e2a1c' : '#f2f2ef'; g.fillRect(0, 0, TILE, TILE);
      g.strokeStyle = 'rgba(0,0,0,0.08)'; for (let k = 0; k <= TILE; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, TILE); g.moveTo(0, k); g.lineTo(TILE, k); g.stroke(); }
      if (kind === 'cafe') for (let x = 40; x < TILE; x += 70) for (let y = 40; y < TILE; y += 90) { g.fillStyle = '#ffe0a3'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
      else for (let y = 32; y < TILE; y += 96) { g.fillStyle = '#ffffff'; g.fillRect(28, y, 200, 14); g.fillStyle = 'rgba(255,255,240,0.9)'; g.fillRect(30, y + 2, 196, 10); }
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ material */
function roomMaterial(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uAtlas: { value: atlas },
      uLight: { value: 0.48 }, // interior brightness: darker than the street by day, lit at night
      uSky: { value: new THREE.Color(0.62, 0.72, 0.82) },
      uKinds: { value: KINDS.length },
    }]),
    vertexShader: /* glsl */ `
      attribute vec4 aRoom;   // kind, depth, width, height
      varying vec3 vLocal;    // fragment on the glass in the window frame (x along, y up from the sill, z out)
      varying vec3 vCam;
      varying vec4 vRoom;
      #include <fog_pars_vertex>
      void main() {
        vRoom = aRoom;
        vec3 local = vec3(position.x * aRoom.z, position.y * aRoom.w, 0.0);
        vec4 world = modelMatrix * instanceMatrix * vec4(local, 1.0);
        mat3 R = mat3(modelMatrix * instanceMatrix);
        vec3 o = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vCam = transpose(R) * (cameraPosition - o);
        vLocal = local;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uLight;
      uniform vec3 uSky;
      uniform float uKinds;
      varying vec3 vLocal;
      varying vec3 vCam;
      varying vec4 vRoom;
      #include <fog_pars_fragment>
      vec3 face(float col, vec2 fuv) {
        vec2 uv = vec2((col + clamp(fuv.x, 0.002, 0.998)) / 4.0, 1.0 - (vRoom.x + 1.0 - clamp(fuv.y, 0.002, 0.998)) / uKinds);
        return texture2D(uAtlas, uv).rgb;
      }
      void main() {
        float W = vRoom.z, H = vRoom.w, D = vRoom.y;
        vec3 o = vLocal;
        vec3 d = normalize(vLocal - vCam);
        if (d.z > -1e-4) d.z = -1e-4;
        // the room: x in [-W/2, W/2], y in [0, H], z in [-D, 0]
        float tx = ((d.x > 0.0 ? W * 0.5 : -W * 0.5) - o.x) / d.x;
        float ty = ((d.y > 0.0 ? H : 0.0) - o.y) / d.y;
        float tz = (-D - o.z) / d.z;
        float t = min(tz, min(abs(d.x) > 1e-5 ? tx : 1e9, abs(d.y) > 1e-5 ? ty : 1e9));
        vec3 p = o + d * t;
        vec3 c;
        if (t == tz) c = face(0.0, vec2(p.x / W + 0.5, p.y / H));
        else if (t == tx) c = face(1.0, vec2((d.x > 0.0 ? -p.z : -p.z) / D, p.y / H));
        else if (d.y < 0.0) c = face(2.0, vec2(p.x / W + 0.5, -p.z / D));
        else c = face(3.0, vec2(p.x / W + 0.5, -p.z / D));
        // the room darkens towards its back and its corners
        float depthK = 1.0 - 0.35 * clamp(-p.z / D, 0.0, 1.0);
        vec3 col = c * uLight * depthK;
        // the glass: a little tint and the sky at grazing angles; the aluminium frame and the door
        float fres = pow(1.0 - clamp(-d.z, 0.0, 1.0), 3.0);
        col = mix(col * 0.92, uSky, 0.1 + 0.6 * fres);
        float fx = min(vLocal.x + W * 0.5, W * 0.5 - vLocal.x), fy = min(vLocal.y, H - vLocal.y);
        float frame = step(min(fx, fy), 0.06);
        float doorX = -W * 0.5 + 1.1;
        float door = step(abs(vLocal.x - doorX), 0.03) + step(abs(vLocal.y - 2.2), 0.03) * step(vLocal.x, doorX);
        float mull = W > 3.2 ? step(abs(vLocal.x - (doorX + (W * 0.5 - doorX) * 0.5)), 0.03) : 0.0;
        col = mix(col, vec3(0.16, 0.17, 0.18), clamp(frame + door + mull, 0.0, 1.0));
        float handle = step(abs(vLocal.x - (doorX - 0.12)), 0.015) * step(abs(vLocal.y - 1.05), 0.2);
        col = mix(col, vec3(0.75), handle);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

/* ------------------------------------------------------------------ builder */
export class ShopFronts {
  constructor({ world, signs, quality }) {
    this.world = world;
    this.signs = signs || [];
    this.quality = quality;
    this.material = null;
    this.awningMat = null;
  }

  build() {
    const list = this.signs.filter((s) => !s.kiosk && s.b && s.w > 1.2);
    if (!list.length) return [];
    this.material = roomMaterial(drawAtlas());
    this.material.uniforms.uSky.value.setRGB(0.62, 0.72, 0.82);
    const tiles = new Map();
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // x across, y up from the sill
    const awnings = new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const s of list) {
      const b = s.b;
      let base = b._base;
      if (base == null) {
        let sum = 0;
        for (let i = 0; i < b.pts.length; i += 2) sum += this.world.hf.heightAt(b.pts[i], b.pts[i + 1]);
        base = b._base = sum / (b.pts.length / 2);
      }
      if (b.h < 3.6) continue;
      const W = Math.min(7.5, Math.max(2.4, s.w + 0.6)), H = 2.75;
      const kind = KINDS.indexOf(kindOf(s.text));
      const key = `${Math.floor(s.x / 256)},${Math.floor(s.z / 256)}`;
      let t = tiles.get(key);
      if (!t) tiles.set(key, (t = []));
      // the glass a hair proud of the wall, the room behind it 3.5-5 m deep
      const yaw = Math.atan2(s.nx, s.nz);
      q.setFromAxisAngle(up, yaw);
      m.compose(new THREE.Vector3(s.x + s.nx * 0.015, base + 0.24, s.z + s.nz * 0.015), q, new THREE.Vector3(1, 1, 1));
      t.push({ m: m.clone(), room: [kind, 3.5 + (Math.abs(Math.sin(s.x * 12.9 + s.z * 7.1)) * 1.5), W, H] });
      // cafes and bakeries: a striped awning over the front
      if (KINDS[kind] === 'cafe' || KINDS[kind] === 'bakery') {
        let a = awnings.get(key);
        if (!a) awnings.set(key, (a = []));
        a.push({ x: s.x, z: s.z, nx: s.nx, nz: s.nz, w: W + 0.4, y: base + 3.05 });
      }
    }
    const out = [];
    for (const [key, items] of tiles) {
      const geo = quad.clone();
      const room = new Float32Array(items.length * 4);
      items.forEach((it, i) => room.set(it.room, 4 * i));
      geo.setAttribute('aRoom', new THREE.InstancedBufferAttribute(room, 4));
      const im = new THREE.InstancedMesh(geo, this.material, items.length);
      items.forEach((it, i) => im.setMatrixAt(i, it.m));
      im.computeBoundingSphere();
      im.name = `shops:${key}`;
      const g = new THREE.Group();
      g.name = `shops:${key}`;
      g.add(im);
      out.push(g);
    }
    if (awnings.size) {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 8;
      const cg = canvas.getContext('2d');
      for (let i = 0; i < 8; i++) { cg.fillStyle = i % 2 ? '#f3efe6' : '#b3261e'; cg.fillRect(i * 8, 0, 8, 8); }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      this.awningMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
      for (const [key, list2] of awnings) {
        const pos = [], uv = [];
        for (const a of list2) {
          const tx = a.nz, tz = -a.nx, hw = a.w / 2, out1 = 1.3;
          const A = [a.x - tx * hw, a.y, a.z - tz * hw], B = [a.x + tx * hw, a.y, a.z + tz * hw];
          const C2 = [B[0] + a.nx * out1, a.y - 0.55, B[2] + a.nz * out1], D2 = [A[0] + a.nx * out1, a.y - 0.55, A[2] + a.nz * out1];
          pos.push(...A, ...B, ...C2, ...A, ...C2, ...D2);
          const r = a.w / 0.5;
          uv.push(0, 1, r, 1, r, 0, 0, 1, r, 0, 0, 0);
          // the valance hanging from the front edge
          const E = [D2[0], D2[1] - 0.22, D2[2]], F = [C2[0], C2[1] - 0.22, C2[2]];
          pos.push(...D2, ...C2, ...F, ...D2, ...F, ...E);
          uv.push(0, 1, r, 1, r, 0, 0, 1, r, 0, 0, 0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, this.awningMat);
        mesh.name = `shops:${key}`;
        mesh.castShadow = true;
        const g = new THREE.Group();
        g.name = `shops:${key}`;
        g.add(mesh);
        out.push(g);
      }
    }
    return out;
  }

  /** Night: the shops are lit (and the glass reflects less of the dark sky). */
  setNight(v) {
    if (!this.material) return;
    this.material.uniforms.uLight.value = 0.48 + v * 0.62;
    this.material.uniforms.uSky.value.setRGB(0.62 * (1 - v) + 0.05 * v, 0.72 * (1 - v) + 0.06 * v, 0.82 * (1 - v) + 0.09 * v);
  }
}

export { kindOf, KINDS };
