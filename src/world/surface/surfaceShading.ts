import * as THREE from 'three';
import { QU } from '../../render/quality';
import type { TerrainShading } from '../terrain/Terrain';
import type { SurfaceGen } from './SurfaceGen';
import { CRATER_D0, CRATER_OCTAVES } from './SurfaceGen';
import type { MaterialLibrary } from '../../render/Materials';

const STYLE_ID: Record<string, number> = { lunar: 0, mercury: 0, rubble: 0, mars: 1, desert: 1, ocean: 1, icy: 2, glacier: 2, europa: 3, io: 4, titan: 5 };

/** Octave index of the smallest crater the CPU height map of a given cell size contains. */
export function resolvedOctave(cell: number) {
  let k = 0;
  while (k < CRATER_OCTAVES - 1 && CRATER_D0 * Math.pow(2, k) < cell * 2.5) k++;
  return k;
}

/**
 * Terrain shading for airless and thin-atmosphere worlds:
 *   • per-pixel normals from the height maps (detail independent of the mesh LOD);
 *   • GPU craters for the octaves below the height-map resolution (same hash as SurfaceGen), faded by footprint;
 *   • regional colour from the orbital albedo map, regolith mottling / immature ejecta / dust / ice by style;
 *   • terrain self-shadowing: a short march toward the Sun through the height maps (crater rims, hills, horizon).
 */
export function surfaceShading(gen: SurfaceGen, mats: MaterialLibrary): TerrainShading {
  const id = gen.site.body;
  const day = mats.tex(`planet_${id}`, true, 1);
  day.wrapS = THREE.RepeatWrapping;
  day.wrapT = THREE.ClampToEdgeWrapping;
  day.anisotropy = 8;
  const M = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeBasis(gen.site.east, gen.site.up, gen.site.south));
  const nearCell = gen.near.cell, midCell = gen.mid.cell, farCell = gen.far.cell;
  const uniforms: Record<string, THREE.IUniform> = {
    tSDay: { value: day },
    uSiteRot: { value: M },
    uSR: { value: gen.R },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uTint: { value: new THREE.Vector3(...gen.def.tint) },
    uCrSeed: { value: gen.crater.seed },
    uCrDensity: { value: gen.crater.density },
    uCrDepth: { value: gen.crater.depth },
    uKNear: { value: resolvedOctave(nearCell) },
    uKMid: { value: resolvedOctave(midCell) },
    uKFar: { value: resolvedOctave(farCell) },
    uCells: { value: new THREE.Vector3(nearCell, midCell, farCell) },
    uStyle: { value: STYLE_ID[gen.def.style] ?? 0 },
    uHighland: { value: gen.highland },
    uShadowQ: { value: 1 },
    uQDetail: QU.uQDetail,
  };
  const glsl = /* glsl */ `
  uniform sampler2D tHNear; uniform vec4 uNear; uniform sampler2D tHFar; uniform vec4 uFar; uniform float uBlend;
  uniform sampler2D tHMid; uniform vec4 uMid; uniform float uMidOn; uniform float uMidBlend;
  uniform sampler2D tSDay;
  uniform mat3 uSiteRot;
  uniform float uSR, uCrSeed, uCrDensity, uCrDepth, uHighland, uShadowQ, uQDetail;
  uniform int uKNear, uKMid, uKFar, uStyle;
  uniform vec3 uCells;
  uniform vec3 uSunDir, uTint;
  float tSunVis = 1.0;
  float cFresh = 0.0;
  float cShadow = 1.0;
  vec3 cSun = vec3(0.0, 1.0, 0.0);

  uint sh32(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
  uint sCell(int i, int j, int k){ return sh32((uint(i) * 0x27d4eb2du) ^ (uint(j) * 0x165667b1u) ^ (uint(k + 0x9e37) * 0x61c88647u)); }
  float sHash2(vec2 p){ return float(sCell(int(floor(p.x)), int(floor(p.y)), 977) & 0xffffffu) / 16777216.0; }
  float sNoise(vec2 x){
    vec2 i = floor(x), f = fract(x); vec2 u = f * f * (3.0 - 2.0 * f);
    float a = sHash2(i), b = sHash2(i + vec2(1.0, 0.0)), c = sHash2(i + vec2(0.0, 1.0)), d = sHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float sFbm(vec2 p, float fp, float scale){
    float s = 0.0, a = 0.5, f = 1.0 / scale;
    for (int i = 0; i < 5; i++){ float fade = clamp(1.5 - fp * f * 2.0, 0.0, 1.0); s += a * fade * (sNoise(p * f) - 0.5); f *= 2.07; a *= 0.5; }
    return s;
  }

  // height-map sampling (bilinear on texel centres, as the vertex stage does)
  float sTex(sampler2D t, vec4 u, vec2 xz){
    vec2 p = (xz - u.xy) / u.z * (u.w - 1.0);
    p = clamp(p, vec2(0.0), vec2(u.w - 1.001));
    ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
    float a = texelFetch(t, i, 0).r, b = texelFetch(t, i + ivec2(1, 0), 0).r, c = texelFetch(t, i + ivec2(0, 1), 0).r, d = texelFetch(t, i + ivec2(1, 1), 0).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float nearEdge(vec2 xz){ vec2 r = xz - uNear.xy; return min(min(r.x, uNear.z - r.x), min(r.y, uNear.z - r.y)); }
  float midEdge(vec2 xz){ vec2 r = xz - uMid.xy; return min(min(r.x, uMid.z - r.x), min(r.y, uMid.z - r.y)); }
  float sCoarse(vec2 xz){
    float hf = sTex(tHFar, uFar, xz);
    float e = midEdge(xz);
    if (e <= 0.0) return hf;
    float k = clamp(e / uMidBlend, 0.0, 1.0);
    return mix(hf, sTex(tHMid, uMid, xz), k * k * (3.0 - 2.0 * k));
  }
  float sH(vec2 xz){
    float e = nearEdge(xz);
    float hf = sCoarse(xz);
    if (e <= 0.0) return hf;
    float k = clamp(e / uBlend, 0.0, 1.0);
    return mix(hf, sTex(tHNear, uNear, xz), k * k * (3.0 - 2.0 * k));
  }

  float octDens(int k){ return k < 7 ? 0.75 : k < 10 ? 0.45 : k < 13 ? 0.3 : 0.2; }
  float sm01(float x){ float t = clamp(x, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  // radial profile (h, dh/dq) — identical to SurfaceGen.craterProfile
  vec2 craterProfile(float q, float r, float D, float ageU, float depthK){
    float age = 0.12 + 0.88 * ageU * ageU * ageU;
    float depth = depthK * r * (0.25 + 0.75 * age), rim = 0.1 * r * age;
    float w = 0.12 + 0.28 * (1.0 - age);
    if (q < 1.0){
      float fl = min(0.4, D / 5000.0);
      float t = max(0.0, (q - fl) / (1.0 - fl));
      float s = sm01((q - (1.0 - w)) / w);
      float bowl = -depth * (1.0 - t * t);
      float crest = rim * (1.0 - (1.0 - q) / w) * s;
      float hv = bowl * (1.0 - 0.35 * s * (1.0 - age)) + crest;
      float dB = q > fl ? 2.0 * depth * t / (1.0 - fl) : 0.0;
      float xx = (q - (1.0 - w)) / w;
      float dS = (q > 1.0 - w) ? 6.0 * xx * (1.0 - xx) / w : 0.0;
      float dh = dB * (1.0 - 0.35 * s * (1.0 - age)) + bowl * (-0.35 * dS * (1.0 - age)) + rim * ((1.0 / w) * s + (1.0 - (1.0 - q) / w) * dS);
      return vec2(hv, dh);
    }
    float s = (q - 1.0) / 0.8; float f = (1.0 - s) * (1.0 - s);
    float e = exp(-((q - 1.0) * (q - 1.0)) / (w * w));
    float iq = 1.0 / q;
    float hv = rim * (0.75 * e + 0.25 * iq * iq * iq) * f;
    float de = -2.0 * (q - 1.0) / (w * w) * e;
    float dh = rim * ((0.75 * de - 0.75 * iq * iq * iq * iq) * f + (0.75 * e + 0.25 * iq * iq * iq) * (-2.0 * (1.0 - s) / 0.8));
    return vec2(hv, dh);
  }
  vec3 craterSum(vec2 p, float kRes, float fp){
    vec3 acc = vec3(0.0);
    int k1 = int(ceil(kRes)) - 1;
    float lh = max(length(cSun.xz), 1e-4); vec2 sdir = cSun.xz / lh; float tanE = cSun.y / lh;
    for (int k = k1; k >= 0; k--){
      float D = ${CRATER_D0.toFixed(2)} * exp2(float(k));
      float fade = clamp(D / (fp * 5.0) - 0.6, 0.0, 1.0) * clamp(kRes - float(k), 0.0, 1.0);
      if (fade <= 0.0) break;
      float cell = D * 2.2;
      float dens = uCrDensity * octDens(k);
      vec2 uv = p / cell; vec2 cf = floor(uv); vec2 f = uv - cf;
      ivec2 c = ivec2(cf) + ivec2(f.x < 0.5 ? -1 : 0, f.y < 0.5 ? -1 : 0);
      for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++){
        ivec2 ij = c + ivec2(a, b);
        uint hs = sCell(ij.x, ij.y, k + int(uCrSeed) * 31);
        if (float(hs & 0xffffu) / 65536.0 > dens) continue;
        uint h2 = sh32(hs ^ 0x5bd1e995u);
        float r = D * (0.5 + 0.5 * float(h2 & 0xffffffu) / 16777216.0);
        vec2 cc = (vec2(ij) + 0.3 + 0.4 * vec2(float((hs >> 16u) & 0xffu), float(hs >> 24u)) / 255.0) * cell;
        vec2 d = p - cc; float dl = length(d) + 1e-6; float q = dl / r;
        if (q >= 1.8) continue;
        float ageU = float((h2 >> 24u) & 0xffu) / 255.0;
        vec2 pr = craterProfile(q, r, D, ageU, uCrDepth);
        float g = pr.y / (r * dl);
        acc += fade * vec3(pr.x, g * d.x, g * d.y);
        // analytic shadow of the rim inside the bowl: march-free exit of the sun ray through the rim circle
        if (q < 1.0){
          float b = dot(d, sdir); float rr = r * 1.02;
          float tx = -b + sqrt(max(b * b - dot(d, d) + rr * rr, 0.0));
          float rimH = craterProfile(1.0, r, D, ageU, uCrDepth).x;
          float vis = clamp((pr.x + tx * tanE - rimH) / (0.03 * r + 0.05) + 0.5, 0.0, 1.0);
          cShadow = min(cShadow, mix(1.0, vis, fade));
        }
        float age = ageU * ageU * ageU;
        cFresh = max(cFresh, fade * age * smoothstep(1.8, 0.9, q) * (D > 30.0 ? 1.0 : 0.5));
      }
    }
    return acc;
  }

  // regolith micro-relief: gradient of a few noise octaves from centimetres to metres (fades with footprint)
  vec2 regolithGrad(vec2 p, float fp){
    vec2 g = vec2(0.0); float a = 0.22, sc = 1.8;
    for (int i = 0; i < 5; i++){
      float fade = clamp(sc / (fp * 6.0) - 0.5, 0.0, 1.0);
      if (fade <= 0.0) break;
      float e = sc * 0.12;
      float n0 = sNoise(p / sc + float(i) * 7.1);
      float nx = sNoise((p + vec2(e, 0.0)) / sc + float(i) * 7.1), nz = sNoise((p + vec2(0.0, e)) / sc + float(i) * 7.1);
      g += fade * a * vec2(nx - n0, nz - n0) / e * sc;
      sc *= 0.45; a *= 0.85;
    }
    return g;
  }

  float terrainShadow(vec3 wp, vec3 L, float fp){
    if (L.y < -0.02) return 0.0;
    float lh = max(length(L.xz), 1e-4);
    vec2 dir = L.xz / lh; float tanE = L.y / lh;
    float vis = 1.0;
    // dithered start: turns step banding into fine noise
    float dz = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float d = max(1.5, fp * 1.5) * (0.6 + 0.8 * dz);
    int nS = uQDetail < 0.6 ? 9 : 18; float grow = uQDetail < 0.6 ? 2.96 : 1.72;
    for (int i = 0; i < 18; i++){
      if (i >= nS) break;
      vec2 q = wp.xz + dir * d;
      float hr = wp.y + d * tanE + 0.25 + d * 0.002;
      vis = min(vis, clamp((hr - sH(q)) / (d * 0.012 + 0.4) + 0.5, 0.0, 1.0));
      if (vis <= 0.0) break;
      d *= grow;
    }
    return vis * smoothstep(-0.02, 0.02, L.y);
  }

  TerrainOut terrainShade(vec3 wpos, vec3 nMesh){
    TerrainOut o;
    float fp = max(length(fwidth(wpos)), 0.002);
    // ---- per-pixel normal from the height maps
    float inNear = clamp(nearEdge(wpos.xz) / uBlend, 0.0, 1.0);
    float inMid = clamp(midEdge(wpos.xz) / uMidBlend, 0.0, 1.0);
    float cell = mix(mix(uCells.z, uCells.y, inMid), uCells.x, inNear);
    float e = max(cell * 0.75, fp);
    float hx = sH(wpos.xz + vec2(e, 0.0)) - sH(wpos.xz - vec2(e, 0.0));
    float hz = sH(wpos.xz + vec2(0.0, e)) - sH(wpos.xz - vec2(0.0, e));
    vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));
    // ---- sub-map craters (octaves the CPU map does not contain here)
    float kRes = mix(mix(float(uKFar), float(uKMid), inMid), float(uKNear), inNear);
    cFresh = 0.0;
    cShadow = 1.0;
    cSun = uSunDir;
    float fpD = fp / uQDetail; // low detail: procedural octaves stop at a coarser footprint
    vec3 cr = uCrDensity > 0.01 ? craterSum(wpos.xz, kRes, fpD) : vec3(0.0);
    // ---- fine regolith / ice texture
    float mic = sFbm(wpos.xz, fp, 1.6);
    float mic2 = sFbm(wpos.xz + 31.7, fp, 0.35);
    vec2 g = cr.yz + regolithGrad(wpos.xz, fpD) * (uStyle == 2 || uStyle == 3 ? 0.6 : 1.0);
    n = normalize(n + vec3(-g.x, 0.0, -g.y));
    // ---- colour: regional albedo from the orbital map
    vec3 bf = uSiteRot * (wpos + vec3(0.0, uSR, 0.0));
    vec3 dn = normalize(bf);
    vec2 uv = vec2(atan(-dn.z, dn.x) / 6.2831853 + 0.5, asin(clamp(dn.y, -1.0, 1.0)) / 3.1415927 + 0.5);
    vec3 alb = texture2D(tSDay, uv).rgb * uTint;
    float slope = 1.0 - n.y;
    float big = sFbm(wpos.xz, fp, 140.0), mid = sFbm(wpos.xz + 7.3, fp, 18.0);
    float rough = 0.95;
    if (uStyle == 0){
      // lunar regolith: grey mottling, immature (bright) crater walls/ejecta, brighter steep slopes
      alb *= 0.86 + 0.32 * big + 0.18 * mid + 0.12 * mic;
      alb *= 1.0 + 0.55 * cFresh + 0.6 * smoothstep(0.12, 0.45, slope);
    } else if (uStyle == 1){
      // Mars: dust on highs, dark basaltic sand in lows and dune troughs, scattered dark rocks
      float dust = smoothstep(-0.25, 0.3, big + 0.3 * mid);
      vec3 sand = alb * vec3(0.78, 0.72, 0.7);
      alb = mix(sand, alb * vec3(1.06, 1.0, 0.94), dust) * (0.92 + 0.16 * mic);
      alb = mix(alb, alb * vec3(0.7, 0.62, 0.58), smoothstep(0.3, 0.6, slope));
      alb *= 1.0 + 0.25 * cFresh;
      float pebble = smoothstep(0.74, 0.8, sNoise(wpos.xz * 7.0) * (0.75 + 0.5 * mid + 0.25)) * clamp(1.0 - fp * 6.0, 0.0, 1.0);
      alb = mix(alb, alb * vec3(0.45, 0.4, 0.38), pebble * 0.5);
      rough = 0.9;
    } else if (uStyle == 2 || uStyle == 3){
      // ice: bright, slightly glossy; dirty lag deposits in lows; fractures darker
      alb *= 0.9 + 0.2 * big + 0.1 * mic;
      alb = mix(alb, alb * vec3(0.75, 0.68, 0.62), smoothstep(0.0, 0.3, -big) * 0.4);
      alb *= 1.0 + 0.3 * cFresh;
      rough = mix(0.55, 0.85, smoothstep(-0.1, 0.2, mic2));
    } else if (uStyle == 4){
      // Io: sulphur frosts, dark silicate flows
      alb *= 0.85 + 0.3 * big;
      alb = mix(alb, vec3(0.1, 0.08, 0.06), smoothstep(0.18, 0.3, mid) * 0.7);
    } else {
      // Titan: dark organic sands, pale water-ice pebbles
      alb *= 0.8 + 0.3 * big;
      float peb = smoothstep(0.74, 0.8, sNoise(wpos.xz * 12.0)) * clamp(1.0 - fp * 10.0, 0.0, 1.0);
      alb = mix(alb, vec3(0.62, 0.55, 0.45), peb * 0.35);
    }
    o.albedo = clamp(alb, 0.0, 1.0);
    o.rough = rough;
    o.normal = n;
    o.ao = clamp(1.0 + cr.x * 0.004, 0.55, 1.0);
    tSunVis = min(uShadowQ > 0.5 ? terrainShadow(wpos, uSunDir, fp) : smoothstep(-0.02, 0.02, uSunDir.y), cShadow);
    return o;
  }
  `;
  return { uniforms, glsl };
}

/** Patches the lighting chunk so the directional (Sun) light respects the terrain self-shadow term. */
export function sunShadowPatch(fs: string) {
  const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= tSunVis;',
  );
  return fs.replace('#include <lights_fragment_begin>', chunk);
}
