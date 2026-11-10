import * as THREE from 'three';
import type { MaterialLibrary } from './Materials';
import { SURFACES } from '../data/landing';
import { BODIES, AU } from '../data/bodies';
import { bodyState } from '../space/ephemeris';
import type { V3 } from '../space/kepler';

/**
 * The Solar System for the far (kilometre-scale) render layer.
 *
 * Frame: J2000 equatorial axes in three.js convention (+Y = celestial north, +X = vernal equinox), heliocentric.
 * Every body is a back-faced sphere whose fragments ray-trace the body analytically (perfect limb at any range):
 *   earth  — clouds with cast shadows, ocean glint, city lights (see Globe.ts heritage)
 *   rocky  — lunar-Lambert / Lommel–Seeliger shading with bump from the height map (aux.r)
 *   gas    — banded cloud tops with limb darkening (also Venus, Titan: opaque haze worlds)
 *   star   — the Sun: limb-darkened photosphere with granulation
 * Bodies with atmospheres integrate single scattering (per-body Rayleigh / Mie coefficients and Mie tint).
 * Saturn's rings: radial profile texture, view-angle opacity, lit/unlit-side scattering, planet shadow on the rings,
 * ring shadow on the planet. Bodies farther than SCALED_KM are placed in scaled space (same angular size).
 */
const DEG = Math.PI / 180;
const EPS = 23.4392911 * DEG;
const SCALED_KM = 40000;

export function eclToThree(v: V3): V3 {
  const y = v[1] * Math.cos(EPS) - v[2] * Math.sin(EPS);
  const z = v[1] * Math.sin(EPS) + v[2] * Math.cos(EPS);
  return [v[0], z, -y];
}

/** Heliocentric position/velocity (m, m/s) in the three equatorial frame. */
export function helio(id: string, t: number): { r: V3; v: V3 } {
  const s = bodyState(id, t);
  return { r: eclToThree(s.r), v: eclToThree(s.v) };
}

/** Pole (RA, Dec in deg) and prime meridian W = w0 + wd·days (IAU, approximate). */
const ROT: Record<string, [number, number, number, number]> = {
  sun: [286.13, 63.87, 84.176, 14.1844], mercury: [281.0103, 61.4155, 329.5988, 6.1385108], venus: [272.76, 67.16, 160.2, -1.4813688],
  moon: [269.9949, 66.5392, 38.3213, 13.17635815], mars: [317.269, 54.432, 176.049, 350.891982443], phobos: [317.68, 52.9, 35.06, 1128.844585],
  deimos: [316.65, 53.52, 79.41, 285.161897], jupiter: [268.056595, 64.495303, 284.95, 870.536], io: [268.05, 64.5, 200.39, 203.4889538],
  europa: [268.08, 64.51, 36.022, 101.3747235], ganymede: [268.2, 64.57, 44.064, 50.3176081], callisto: [268.72, 64.83, 259.51, 21.5710715],
  saturn: [40.589, 83.537, 38.9, 810.7939024], mimas: [40.66, 83.52, 333.46, 381.994555], enceladus: [40.66, 83.52, 6.32, 262.7318996],
  dione: [40.66, 83.52, 357.6, 131.5349316], rhea: [40.38, 83.55, 235.16, 79.6900478], titan: [39.4827, 83.4279, 186.5855, 22.5769768],
  iapetus: [318.16, 75.03, 355.2, 4.5379572], uranus: [257.311, -15.175, 203.81, -501.1600928], titania: [257.43, -15.1, 77.74, -41.3514316],
  neptune: [299.36, 43.46, 249.978, 541.1397757], triton: [299.36, 41.17, 296.53, -61.2572637],
};

interface Atmo { km: number; ray: [number, number, number]; mie: number; hr: number; hm: number; tint?: [number, number, number]; sunI?: number }
interface Look { mode: 'earth' | 'rocky' | 'gas' | 'star'; tex: string; aux?: boolean; atmo?: Atmo; bump?: number; limb?: number; rings?: { tex: string; inner: number; outer: number } }

const LOOKS: Record<string, Look> = {
  sun: { mode: 'star', tex: '' },
  mercury: { mode: 'rocky', tex: 'planet_mercury', aux: true, bump: 0.7 },
  venus: { mode: 'gas', tex: 'planet_venus', limb: 0.35, atmo: { km: 250, ray: [3e-3, 2.6e-3, 1.4e-3], mie: 0.012, hr: 16, hm: 9, tint: [1, 0.86, 0.6], sunI: 9 } },
  earth: { mode: 'earth', tex: 'earth_day', atmo: { km: 100, ray: [5.8e-3, 13.5e-3, 33.1e-3], mie: 2.2e-3, hr: 8, hm: 1.2, sunI: 11 } },
  moon: { mode: 'rocky', tex: 'planet_moon', aux: true, bump: 0.55 },
  mars: { mode: 'rocky', tex: 'planet_mars', aux: true, bump: 1.1, atmo: { km: 90, ray: [1.0e-3, 1.4e-3, 2.4e-3], mie: 1.0e-3, hr: 11, hm: 6, tint: [1, 0.75, 0.55], sunI: 8 } },
  phobos: { mode: 'rocky', tex: 'planet_phobos', aux: true, bump: 1.5 },
  deimos: { mode: 'rocky', tex: 'planet_deimos', aux: true, bump: 1.5 },
  jupiter: { mode: 'gas', tex: 'planet_jupiter', limb: 0.55, atmo: { km: 1500, ray: [1.2e-4, 1.6e-4, 2.4e-4], mie: 2e-4, hr: 60, hm: 30, tint: [1, 0.92, 0.82], sunI: 7 } },
  io: { mode: 'rocky', tex: 'planet_io', aux: true, bump: 0.8 },
  europa: { mode: 'rocky', tex: 'planet_europa', aux: true, bump: 0.8 },
  ganymede: { mode: 'rocky', tex: 'planet_ganymede', aux: true, bump: 1.0 },
  callisto: { mode: 'rocky', tex: 'planet_callisto', aux: true, bump: 1.2 },
  saturn: { mode: 'gas', tex: 'planet_saturn', limb: 0.5, atmo: { km: 1500, ray: [1.0e-4, 1.3e-4, 1.9e-4], mie: 2e-4, hr: 80, hm: 40, tint: [1, 0.94, 0.8], sunI: 7 }, rings: { tex: 'saturn_rings_rgba', inner: 66900, outer: 141000 } },
  mimas: { mode: 'rocky', tex: 'planet_mimas', aux: true, bump: 1.3 },
  enceladus: { mode: 'rocky', tex: 'planet_enceladus', aux: true, bump: 0.8 },
  dione: { mode: 'rocky', tex: 'planet_dione', aux: true, bump: 1.1 },
  rhea: { mode: 'rocky', tex: 'planet_rhea', aux: true, bump: 1.1 },
  titan: { mode: 'gas', tex: 'planet_titan', limb: 0.25, atmo: { km: 600, ray: [2e-4, 1.6e-4, 0.8e-4], mie: 4e-3, hr: 40, hm: 45, tint: [1, 0.62, 0.28], sunI: 9 } },
  iapetus: { mode: 'rocky', tex: 'planet_iapetus', aux: true, bump: 1.1 },
  uranus: { mode: 'gas', tex: 'planet_uranus', limb: 0.45, atmo: { km: 1000, ray: [1.5e-4, 3.0e-4, 3.6e-4], mie: 1e-4, hr: 50, hm: 25, tint: [0.8, 1, 1], sunI: 7 } },
  titania: { mode: 'rocky', tex: 'planet_titania', aux: true, bump: 1.1 },
  neptune: { mode: 'gas', tex: 'planet_neptune', limb: 0.45, atmo: { km: 1000, ray: [1.2e-4, 2.4e-4, 4.6e-4], mie: 1e-4, hr: 50, hm: 25, tint: [0.7, 0.85, 1], sunI: 7 } },
  triton: { mode: 'rocky', tex: 'planet_triton', aux: true, bump: 0.9 },
};

const VERT = /* glsl */ `
  varying vec3 vL;
  void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDay, tAux, tRing;
  uniform int uMode;            // 0 earth, 1 rocky, 2 gas, 3 star
  uniform bool uHasAtmo, uHasAux, uHasRing;
  uniform vec3 uSun, uCam, uPole, uRay, uTint;
  uniform mat3 uRot;
  uniform float uS, uR, uRa, uHr, uHm, uMie, uSunI, uSunL, uLights, uBump, uLimb, uRingIn, uRingOut, uTime, uCrK;
  uniform vec2 uTexel;
  varying vec3 vL;
  const float PI = 3.14159265;

  vec2 sphere(vec3 ro, vec3 rd, float r){
    float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h); return vec2(-b - h, -b + h);
  }
  vec2 lonlatUV(vec3 n){
    vec3 e = uRot * n;
    return vec2(atan(-e.z, e.x) / (2.0 * PI) + 0.5, asin(clamp(e.y, -1.0, 1.0)) / PI + 0.5);
  }
  vec4 samp(sampler2D t, vec2 uv){
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5); dy.x -= floor(dy.x + 0.5);
    return textureGrad(t, uv, dx, dy);
  }
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float detail(vec3 p, float scale, float px, int oct){
    float a = 0.5, s = 0.0, f = 1.0 / scale;
    for (int i = 0; i < 6; i++){ if (i >= oct) break; float fade = clamp(1.6 - px * f * 3.0, 0.0, 1.0); s += a * fade * (vnoise(p * f) - 0.5); f *= 2.63; a *= 0.56; }
    return 0.5 + s;
  }
  // ---- sub-texel crater field in body-fixed 3D cells (km), same profile as the surface zone's craters
  uint oh32(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
  uint oCell(ivec3 c, int k){ return oh32((uint(c.x) * 0x27d4eb2du) ^ (uint(c.y) * 0x165667b1u) ^ (uint(c.z) * 0x9e3779b9u) ^ (uint(k + 101) * 0x61c88647u)); }
  float osm(float x){ float t = clamp(x, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  vec2 oProfile(float q, float r, float Dm, float ageU){
    float age = 0.12 + 0.88 * ageU * ageU * ageU;
    float depth = 0.3 * r * (0.25 + 0.75 * age), rim = 0.08 * r * age;
    float w = 0.12 + 0.28 * (1.0 - age);
    if (q < 1.0){
      float fl = min(0.4, Dm / 5000.0); float t = max(0.0, (q - fl) / (1.0 - fl));
      float s = osm((q - (1.0 - w)) / w); float bowl = -depth * (1.0 - t * t);
      float xx = (q - (1.0 - w)) / w; float dS = (q > 1.0 - w) ? 6.0 * xx * (1.0 - xx) / w : 0.0;
      float hv = bowl * (1.0 - 0.35 * s * (1.0 - age)) + rim * (1.0 - (1.0 - q) / w) * s;
      float dB = q > fl ? 2.0 * depth * t / (1.0 - fl) : 0.0;
      float dh = dB * (1.0 - 0.35 * s * (1.0 - age)) + bowl * (-0.35 * dS * (1.0 - age)) + rim * ((1.0 / w) * s + (1.0 - (1.0 - q) / w) * dS);
      return vec2(hv, dh);
    }
    float s = (q - 1.0) / 0.8; float f = (1.0 - s) * (1.0 - s);
    float e = exp(-((q - 1.0) * (q - 1.0)) / (w * w)); float iq = 1.0 / q;
    float hv = rim * (0.75 * e + 0.25 * iq * iq * iq) * f;
    float de = -2.0 * (q - 1.0) / (w * w) * e;
    float dh = rim * ((0.75 * de - 0.75 * iq * iq * iq * iq) * f + (0.75 * e + 0.25 * iq * iq * iq) * (-2.0 * (1.0 - s) / 0.8));
    return vec2(hv, dh);
  }
  float ocShadow = 1.0; float ocFresh = 0.0;
  // returns the tangent slope vector (body-fixed); pb on the sphere (km), sunB body-fixed unit
  vec3 orbCraters(vec3 pb, float R, float px, vec3 sunB){
    vec3 g = vec3(0.0);
    vec3 nb = normalize(pb);
    vec3 st = sunB - nb * dot(sunB, nb); float sl = length(st);
    vec3 sd = sl > 1e-5 ? st / sl : vec3(0.0); float tanE = dot(sunB, nb) / max(sl, 1e-5);
    for (int k = 5; k >= 0; k--){
      float D = 0.25 * exp2(float(k));
      float fade = clamp(D / (px * 5.0) - 0.6, 0.0, 1.0);
      if (fade <= 0.0) break;
      float cell = D * 2.2;
      vec3 u = pb / cell; vec3 cf = floor(u); vec3 f = u - cf;
      ivec3 base = ivec3(cf) + ivec3(f.x < 0.5 ? -1 : 0, f.y < 0.5 ? -1 : 0, f.z < 0.5 ? -1 : 0);
      float dens = uCrK * (k < 3 ? 0.36 : 0.26);
      for (int a = 0; a < 8; a++){
        ivec3 ij = base + ivec3(a & 1, (a >> 1) & 1, (a >> 2) & 1);
        uint hs = oCell(ij, k);
        if (float(hs & 0xffffu) / 65536.0 > dens) continue;
        uint h2 = oh32(hs ^ 0x5bd1e995u);
        vec3 jit = vec3(float((hs >> 16u) & 0xffu), float(hs >> 24u), float(h2 & 0xffu)) / 255.0;
        vec3 c3 = (vec3(ij) + 0.3 + 0.4 * jit) * cell;
        // one layer of cells: only those whose centre lies within half a cell of the surface
        if (abs(length(c3) - R) > cell * 0.5) continue;
        vec3 cc = normalize(c3) * R;
        vec3 d = pb - cc; d -= nb * dot(d, nb);
        float r = D * (0.5 + 0.5 * float((h2 >> 8u) & 0xffffu) / 65536.0);
        float dl = length(d) + 1e-7; float q = dl / r;
        if (q >= 1.8) continue;
        float ageU = float(h2 >> 24u) / 255.0;
        vec2 pr = oProfile(q, r, D * 1000.0, ageU);
        g += fade * (pr.y / (r * dl)) * d;
        if (q < 1.0 && sl > 1e-5){
          float b = dot(d, sd); float rr = r * 1.02;
          float tx = -b + sqrt(max(b * b - dot(d, d) + rr * rr, 0.0));
          float rimH = oProfile(1.0, r, D * 1000.0, ageU).x;
          float vis = clamp((pr.x + tx * tanE - rimH) / (0.07 * r + 1e-4) + 0.5, 0.0, 1.0);
          ocShadow = min(ocShadow, mix(1.0, vis, fade));
        }
        ocFresh = max(ocFresh, fade * ageU * ageU * ageU * smoothstep(1.8, 0.9, q));
      }
    }
    return g;
  }

  // optical depth toward the sun (scaled units in, km out)
  vec2 sunDepth(vec3 p){
    vec2 s = sphere(p, uSun, uRa);
    float L = max(s.y, 0.0); float ds = L / 4.0; vec2 od = vec2(0.0);
    for (int i = 0; i < 4; i++){
      vec3 q = p + uSun * (ds * (float(i) + 0.5));
      float h = (length(q) - uR) / uS;
      if (h < 0.0) return vec2(1e4);
      od += vec2(exp(-h / uHr), exp(-h / uHm)) * ds / uS;
    }
    return od;
  }
  vec3 transmit(vec2 od){ return exp(-(uRay * od.x + uMie * 1.1 * od.y)); }
  float ringOpacity(float r){ return texture2D(tRing, vec2((r / uS - uRingIn) / (uRingOut - uRingIn), 0.5)).a; }

  void main(){
    vec3 ro = uCam;
    vec3 rd = normalize(vL * uS - uCam);
    vec2 tp = sphere(ro, rd, uR);
    bool hitP = tp.x > 0.0 && tp.x < 1e8;
    vec3 col = vec3(0.0); float alpha = 0.0;
    vec3 inscat = vec3(0.0); vec3 Tview = vec3(1.0);
    if (uHasAtmo){
      vec2 ta = sphere(ro, rd, uRa);
      float t0 = max(ta.x, 0.0);
      float t1 = hitP ? tp.x : ta.y;
      if (t1 > t0){
        const int N = 12;
        float ds = (t1 - t0) / float(N);
        vec2 odV = vec2(0.0);
        vec3 sumR = vec3(0.0), sumM = vec3(0.0);
        for (int i = 0; i < N; i++){
          vec3 p = ro + rd * (t0 + ds * (float(i) + 0.5));
          float h = (length(p) - uR) / uS;
          vec2 d = vec2(exp(-h / uHr), exp(-h / uHm)) * ds / uS;
          odV += d;
          vec3 T = transmit(odV + sunDepth(p));
          sumR += T * d.x; sumM += T * d.y;
        }
        float mu = dot(rd, uSun);
        float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        float g = 0.76;
        float pm = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
        inscat = uSunI * uSunL * (sumR * uRay * pr + sumM * uMie * pm * uTint);
        Tview = transmit(odV);
        alpha = clamp(max(max(inscat.r, inscat.g), inscat.b) * 1.5, 0.0, 1.0);
        col = inscat;
      }
    }
    if (!hitP){
      if (alpha <= 0.0) discard;
      gl_FragColor = vec4(col, alpha);
      return;
    }
    vec3 p = ro + rd * tp.x;
    vec3 n = normalize(p);
    vec3 v = -rd;
    float ndv = max(dot(n, v), 0.0);
    if (uMode == 3){
      // the Sun: limb darkening (u ≈ 0.6) and fine granulation
      float g1 = vnoise(n * 900.0 + uTime * 0.05) * 0.5 + vnoise(n * 2400.0) * 0.5;
      float I = (1.0 - 0.6 * (1.0 - pow(ndv, 0.5))) * (0.92 + 0.12 * g1);
      gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * I * 60.0, 1.0);
      return;
    }
    vec2 uv = lonlatUV(n);
    vec3 alb = samp(tDay, uv).rgb;
    vec4 aux = uHasAux ? samp(tAux, uv) : vec4(0.5, 0.0, 0.0, 0.0);
    float px = max(length(fwidth(p)) / uS, 0.01);
    // bump from the height map (rocky): tangent-space slopes from neighbouring texels
    if (uMode == 1 && uBump > 0.0){
      float hE = samp(tAux, uv + vec2(uTexel.x, 0.0)).r - samp(tAux, uv - vec2(uTexel.x, 0.0)).r;
      float hN = samp(tAux, uv + vec2(0.0, uTexel.y)).r - samp(tAux, uv - vec2(0.0, uTexel.y)).r;
      vec3 pole = uPole;
      vec3 east = normalize(cross(pole, n) + vec3(1e-6));
      vec3 north = cross(n, east);
      float k = uBump * 6.0;
      n = normalize(n - (east * hE + north * hN) * k);
      // sub-texel relief: gradient of a procedural height field (hills, small craters' rims), faded by footprint
      vec3 pk = p / uS;
      float e = max(px * 1.5, 0.05);
      float h0 = detail(pk, 25.0, px, 6);
      float dhE = detail(pk + east * e, 25.0, px, 6) - h0;
      float dhN = detail(pk + north * e, 25.0, px, 6) - h0;
      float relief = uBump * clamp(4.0 / (px + 0.5), 0.0, 1.0);
      n = normalize(n - (east * dhE + north * dhN) / e * relief * 2.5);
      // sub-texel albedo: regolith mottling and fresh bright ejecta specks
      float m1 = detail(pk + 17.0, 12.0, px, 6);
      alb *= 0.82 + 0.36 * m1;
      alb *= 1.0 + 0.25 * smoothstep(0.72, 0.8, detail(pk * 1.7 + 3.0, 4.0, px, 4));
      // procedural craters below the map resolution (0.25–8 km), with bowl shadows and immature bright ejecta
      if (uCrK > 0.0 && px < 3.0){
        vec3 nb = uRot * normalize(p);
        vec3 gb = orbCraters(nb * (uR / uS), uR / uS, px, uRot * uSun);
        n = normalize(n - transpose(uRot) * gb);
        alb *= 1.0 + 0.45 * ocFresh;
      }
    }
    float ndl = dot(n, uSun);
    vec3 sunT = uHasAtmo ? transmit(sunDepth(p + normalize(p) * 0.05 * uS)) : vec3(1.0);
    vec3 sunL = sunT * uSunL * ocShadow;
    // ring shadow on the planet
    if (uHasRing){
      float dn = dot(uSun, uPole);
      if (abs(dn) > 1e-4){
        float tr = -dot(p, uPole) / dn;
        if (tr > 0.0){
          float rr = length(p + uSun * tr) / uS;
          if (rr > uRingIn && rr < uRingOut) sunL *= 1.0 - 0.9 * ringOpacity(rr * uS);
        }
      }
    }
    vec3 surf;
    if (uMode == 0){
      float land = 1.0 - aux.g;
      float dn = detail(p / uS, 45.0, px, 6);
      alb *= mix(1.0, 0.72 + 0.56 * dn, land);
      float cn = detail(p / uS + 71.0, 60.0, px, 6);
      float edge = 4.0 * aux.r * (1.0 - aux.r);
      float cloud = clamp(aux.r * 1.15 + (cn - 0.5) * 1.6 * (0.35 + edge), 0.0, 1.0);
      float cu = smoothstep(0.63, 0.74, detail(p / uS * 2.0 + 5.0, 14.0, px, 5)) * (1.0 - aux.r) * 0.55;
      cloud = max(cloud, cu * smoothstep(0.2, 0.9, aux.g + 0.3));
      cloud = smoothstep(0.08, 0.9, cloud);
      vec3 st = uSun - n * dot(uSun, n);
      float shadow = 1.0 - 0.6 * samp(tAux, lonlatUV(normalize(n + st * 0.0016))).r;
      float lit = max(ndl, 0.0);
      vec3 hv = normalize(v + uSun);
      float water = aux.g * (1.0 - cloud);
      float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      float spec = (pow(max(dot(n, hv), 0.0), 220.0) * 6.0 + pow(max(dot(n, hv), 0.0), 18.0) * 0.12) * (0.3 + fres) * step(0.0, ndl);
      surf = (alb * lit * shadow * (1.0 - cloud) + vec3(0.92, 0.93, 0.95) * cloud * (0.15 + 0.85 * lit)) * sunL + vec3(spec * water) * sunL;
      surf += alb * vec3(0.10, 0.16, 0.28) * smoothstep(-0.15, 0.35, ndl) * 0.25 * uSunL;
      float night = 1.0 - smoothstep(-0.12, 0.06, ndl);
      surf += vec3(1.0, 0.68, 0.36) * pow(aux.b, 1.4) * night * (1.0 - 0.75 * cloud) * uLights;
    } else if (uMode == 1){
      // lunar-Lambert: Lommel–Seeliger blended with Lambert (airless regolith barely darkens toward the limb)
      float mu0 = max(ndl, 0.0);
      float ls = 2.0 * mu0 / (mu0 + max(ndv, 0.05));
      float f = mix(mu0, ls * 0.5, 0.55);
      surf = alb * f * sunL;
      surf += vec3(1.0, 0.55, 0.2) * aux.b * 2.5 * (1.0 - smoothstep(-0.1, 0.1, ndl));   // Io's hot spots on the night side
    } else {
      // gas/haze worlds: limb darkening, soft terminator
      float lit = smoothstep(-0.08, 0.25, ndl) * max(ndl, 0.0) * 0.6 + max(ndl, 0.0) * 0.4;
      float limb = mix(1.0 - uLimb, 1.0, pow(ndv, 0.6));
      alb *= 0.94 + 0.12 * detail(p / uS, 3000.0, px, 4);
      surf = alb * lit * limb * sunL;
    }
    col = surf * Tview + inscat;
    gl_FragColor = vec4(col, 1.0);
  }`;

const RING_VERT = /* glsl */ `
  varying vec3 vP;
  void main(){ vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`;
const RING_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tRing;
  uniform vec3 uCenter, uSun, uPole;
  uniform float uS, uR, uIn, uOut, uSunL;
  varying vec3 vP;
  vec2 sphere(vec3 ro, vec3 rd, float r){ float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float h = b * b - c; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
  void main(){
    vec3 q = vP - uCenter;               // ring point relative to the planet (scaled units)
    float r = length(q) / uS;
    if (r < uIn || r > uOut) discard;
    vec4 tex = texture2D(tRing, vec2((r - uIn) / (uOut - uIn), 0.5));
    // hidden behind the planet along the view ray?
    vec3 cam = -uCenter;                 // camera at the far-layer origin
    vec3 rd = normalize(q - cam);
    vec2 hp = sphere(cam, rd, uR);
    if (hp.x > 0.0 && hp.x < length(q - cam)) discard;
    // planet shadow on the rings
    vec2 hs = sphere(q, uSun, uR);
    float shadow = (hs.x > 0.0 && hs.x < 1e8) ? 0.05 : 1.0;
    float cv = abs(dot(rd, uPole));
    float op = 1.0 - pow(max(1.0 - tex.a, 0.0), 1.0 / max(cv, 0.04));
    bool sameSide = dot(cam - q, uPole) * dot(uSun, uPole) > 0.0;
    float elev = abs(dot(uSun, uPole));
    vec3 c = tex.rgb * (sameSide ? (0.25 + 0.75 * sqrt(elev)) : (1.0 - tex.a) * 1.3 * (0.3 + 0.7 * sqrt(elev)));
    c *= shadow * uSunL;
    gl_FragColor = vec4(c * op, op);
  }`;

interface BodyRt {
  id: string;
  look: Look;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  ring?: THREE.Mesh;
  ringMat?: THREE.ShaderMaterial;
  radiusKm: number;
  dist: number;
}

export class SolarSystem {
  readonly group = new THREE.Group();
  readonly bodies: BodyRt[] = [];
  /** star-like point markers for bodies too small to resolve (planets in the night sky) */
  private markers!: THREE.Points;
  private markerIds: string[] = [];
  private stateCache = new Map<string, { r: V3; v: V3 }>();
  private t = 0;

  constructor(mats: MaterialLibrary, ids: string[] = Object.keys(LOOKS)) {
    const blank = new THREE.DataTexture(new Uint8Array([128, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    const noRing = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    noRing.needsUpdate = true;
    for (const id of ids) {
      const look = LOOKS[id];
      const def = BODIES[id];
      if (!look || !def) continue;
      const R = def.radius / 1000;
      const atm = look.atmo;
      const Ra = R + (atm ? atm.km : R * 0.002);
      const day = look.tex ? mats.tex(look.tex, true, 1) : blank;
      const aux = id === 'earth' ? mats.tex('earth_aux', false, 1) : look.aux ? mats.tex(`${look.tex}_aux`, false, 1) : blank;
      for (const t of [day, aux]) {
        if (t === blank) continue;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 8;
      }
      aux.colorSpace = THREE.NoColorSpace;
      const ringTex = look.rings ? mats.tex(look.rings.tex, false, 1) : noRing;
      if (look.rings) {
        ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;
        ringTex.colorSpace = THREE.SRGBColorSpace;
      }
      const texel = id === 'earth' ? new THREE.Vector2(1 / 4096, 1 / 2048) : look.mode === 'rocky' && ['moon', 'mercury', 'mars'].includes(id) ? new THREE.Vector2(1 / 2048, 1 / 1024) : new THREE.Vector2(1 / 1024, 1 / 512);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          tDay: { value: day }, tAux: { value: aux }, tRing: { value: ringTex },
          uMode: { value: { earth: 0, rocky: 1, gas: 2, star: 3 }[look.mode] },
          uHasAtmo: { value: !!atm }, uHasAux: { value: id === 'earth' || !!look.aux }, uHasRing: { value: !!look.rings },
          uSun: { value: new THREE.Vector3(1, 0, 0) }, uCam: { value: new THREE.Vector3() }, uPole: { value: new THREE.Vector3(0, 1, 0) },
          uRay: { value: new THREE.Vector3(...(atm?.ray ?? [0, 0, 0])) }, uTint: { value: new THREE.Vector3(...(atm?.tint ?? [1, 1, 1])) },
          uRot: { value: new THREE.Matrix3() },
          uS: { value: 1 }, uR: { value: R }, uRa: { value: Ra }, uHr: { value: atm?.hr ?? 8 }, uHm: { value: atm?.hm ?? 1.2 }, uMie: { value: atm?.mie ?? 0 },
          uSunI: { value: atm?.sunI ?? 10 }, uSunL: { value: 1 }, uLights: { value: 0.9 }, uBump: { value: look.bump ?? 0 }, uLimb: { value: look.limb ?? 0.4 },
          uRingIn: { value: look.rings?.inner ?? 0 }, uRingOut: { value: look.rings?.outer ?? 1 }, uTime: { value: 0 }, uTexel: { value: texel },
          uCrK: { value: look.mode === 'rocky' ? (SURFACES[id]?.craters ?? 0.6) * (id === 'moon' || id === 'mercury' ? 1.15 : 1) : 0 },
        },
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(Ra, look.mode === 'star' ? 48 : 64, 32), mat);
      mesh.frustumCulled = false;
      mesh.userData.owned = true;
      mesh.name = `body_${id}`;
      this.group.add(mesh);
      const rt: BodyRt = { id, look, mesh, mat, radiusKm: R, dist: 1 };
      if (look.rings) {
        const rg = new THREE.RingGeometry(look.rings.inner, look.rings.outer, 256, 1);
        const rm = new THREE.ShaderMaterial({
          vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: false,
          blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
          uniforms: { tRing: { value: ringTex }, uCenter: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3() }, uPole: { value: new THREE.Vector3() },
            uS: { value: 1 }, uR: { value: R }, uIn: { value: look.rings.inner }, uOut: { value: look.rings.outer }, uSunL: { value: 1 } },
        });
        const ring = new THREE.Mesh(rg, rm);
        ring.frustumCulled = false;
        ring.userData.owned = true;
        this.group.add(ring);
        rt.ring = ring;
        rt.ringMat = rm;
      }
      this.bodies.push(rt);
    }
    this.markerIds = this.bodies.filter((b) => b.look.mode !== 'star').map((b) => b.id);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.markerIds.length * 3), 3));
    mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.markerIds.length * 3), 3));
    const mm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 3.0; }`,
      fragmentShader: /* glsl */ `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d, d) * 14.0); if (dot(vC, vC) < 1e-6) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    });
    this.markers = new THREE.Points(mg, mm);
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 2;
    this.markers.userData.owned = true;
    this.group.add(this.markers);
  }

  /** Update the point markers: visible while a body is smaller than ~1.5 px, brightness from its reflected light. */
  private updateMarkers(pxPerRad: number) {
    const pos = this.markers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colA = this.markers.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.markerIds.forEach((id, i) => {
      const b = this.bodies.find((x) => x.id === id)!;
      const px = (b.radiusKm / b.dist) * pxPerRad;
      const p = b.mesh.position.clone().normalize().multiplyScalar(30000);
      pos.setXYZ(i, p.x, p.y, p.z);
      const c = BODIES[id].color;
      const sunL = b.mat.uniforms.uSunL.value as number;
      // reflected brightness ∝ (R/d)² · flux, compressed like a magnitude scale
      const lum = Math.pow((b.radiusKm / b.dist) ** 2 * sunL * 2e9, 0.35);
      const k = px < 1.5 ? THREE.MathUtils.clamp(lum, 0, 2.5) * THREE.MathUtils.smoothstep(px, 1.5, 0.6) : 0;
      colA.setXYZ(i, c[0] * k, c[1] * k, c[2] * k);
    });
    pos.needsUpdate = true;
    colA.needsUpdate = true;
  }

  private state(id: string) {
    let s = this.stateCache.get(id);
    if (!s) {
      s = helio(id, this.t);
      this.stateCache.set(id, s);
    }
    return s;
  }

  /** Game-scaled solar flux factor at a heliocentric distance (physical 1/r² softened for readable images). */
  static flux(rMeters: number) {
    return Math.pow(AU / Math.max(rMeters, 1e9), 0.7);
  }

  /** Body-fixed rotation: three equatorial → three body-fixed (x = prime meridian, y = north pole, −z = 90° E). */
  static bodyFrame(id: string, t: number, gmstAngle?: number, lockDir?: THREE.Vector3): { rot: THREE.Matrix3; pole: THREE.Vector3 } {
    if (id === 'earth' && gmstAngle !== undefined) {
      const c = Math.cos(gmstAngle), s = Math.sin(gmstAngle);
      return { rot: new THREE.Matrix3().set(c, 0, -s, 0, 1, 0, s, 0, c), pole: new THREE.Vector3(0, 1, 0) };
    }
    const r = ROT[id] ?? [0, 90, 0, 360 / ((BODIES[id]?.rotation ?? 86400) / 86400)];
    const ra = r[0] * DEG, de = r[1] * DEG;
    const W = (r[2] + r[3] * (t / 86400)) * DEG;
    // standard (x, y, z) → three (x, z, −y)
    const std = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
    const pole = std(Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de));
    const node = std(-Math.sin(ra), Math.cos(ra), 0); // ascending node of the body equator on the celestial equator
    const q = new THREE.Vector3().crossVectors(pole, node); // 90° along the body equator from the node (toward +rotation)
    let xm = node.clone().multiplyScalar(Math.cos(W)).add(q.clone().multiplyScalar(Math.sin(W)));
    if (lockDir) {
      // tidally locked: the prime meridian faces the parent planet
      const d = lockDir.clone().addScaledVector(pole, -lockDir.dot(pole));
      if (d.lengthSq() > 1e-12) xm = d.normalize();
    }
    const ym = new THREE.Vector3().crossVectors(pole, xm); // 90° E on the equator
    // rows: body-fixed three axes x = xm, y = pole, z = −ym
    const rot = new THREE.Matrix3().set(xm.x, xm.y, xm.z, pole.x, pole.y, pole.z, -ym.x, -ym.y, -ym.z);
    return { rot, pole };
  }

  /**
   * @param t Earth time (s since J2000)
   * @param cam heliocentric camera position (m, three equatorial)
   * @param gmstAngle Earth rotation angle (keeps the Earth consistent with the orbital frame)
   */
  update(t: number, cam: V3, gmstAngle: number, time = 0, pxPerRad = 900) {
    this.t = t;
    this.stateCache.clear();
    for (const b of this.bodies) {
      const s = this.state(b.id);
      const rel = new THREE.Vector3((s.r[0] - cam[0]) / 1000, (s.r[1] - cam[1]) / 1000, (s.r[2] - cam[2]) / 1000);
      const dist = rel.length();
      b.dist = dist;
      const sc = dist > SCALED_KM ? SCALED_KM / dist : 1;
      b.mesh.position.copy(rel).multiplyScalar(sc);
      b.mesh.scale.setScalar(sc);
      const u = b.mat.uniforms;
      u.uS.value = sc;
      u.uR.value = b.radiusKm * sc;
      u.uRa.value = (b.radiusKm + (b.look.atmo ? b.look.atmo.km : b.radiusKm * 0.002)) * sc;
      (u.uCam.value as THREE.Vector3).copy(b.mesh.position).negate();
      const toSun = new THREE.Vector3(-s.r[0], -s.r[1], -s.r[2]);
      const dSun = toSun.length();
      (u.uSun.value as THREE.Vector3).copy(toSun.normalize());
      u.uSunL.value = SolarSystem.flux(dSun);
      u.uTime.value = time;
      const parent = BODIES[b.id]?.parent;
      let lock: THREE.Vector3 | undefined;
      if (parent && parent !== 'sun' && BODIES[b.id].circ) {
        const ps = this.state(parent);
        lock = new THREE.Vector3(ps.r[0] - s.r[0], ps.r[1] - s.r[1], ps.r[2] - s.r[2]).normalize();
      }
      const f = SolarSystem.bodyFrame(b.id, t, gmstAngle, lock);
      (u.uRot.value as THREE.Matrix3).copy(f.rot);
      (u.uPole.value as THREE.Vector3).copy(f.pole);
      if (b.ring && b.ringMat) {
        b.ring.position.copy(b.mesh.position);
        b.ring.scale.setScalar(sc);
        b.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.pole);
        const ru = b.ringMat.uniforms;
        (ru.uCenter.value as THREE.Vector3).copy(b.mesh.position);
        (ru.uSun.value as THREE.Vector3).copy(u.uSun.value);
        (ru.uPole.value as THREE.Vector3).copy(f.pole);
        ru.uS.value = sc;
        ru.uR.value = b.radiusKm * sc;
        ru.uSunL.value = u.uSunL.value;
      }
    }
    this.updateMarkers(pxPerRad);
    // painter's order: farthest first, a body's rings right after it
    const sorted = [...this.bodies].sort((a, b) => b.dist - a.dist);
    sorted.forEach((b, i) => {
      b.mesh.renderOrder = 10 + i * 2;
      if (b.ring) b.ring.renderOrder = 11 + i * 2;
    });
  }

  /** Heliocentric state of a body at the last update time. */
  helioOf(id: string) {
    return this.state(id);
  }
}

/**
 * The Anomaly: a spherical wormhole mouth (~2 km across) rendered as a gravitational lens.
 *   b < R  — the view through the throat: another galaxy (dense stars, a galactic band, a warm distant glow);
 *   b ≥ R  — our sky, deflected by α ∝ R/b and sampled from a periodic cube capture of the far layer,
 *            with a bright Einstein ring hugging the rim. Fades out by b ≈ 7 R.
 */
export class WormholeLens {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  readonly cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  readonly cubeCam = new THREE.CubeCamera(1, 3e5, this.cubeRT);
  private captureT = 0;
  readonly radiusKm = 1.0;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tSky: { value: this.cubeRT.texture }, uC: { value: new THREE.Vector3() }, uR: { value: 1 }, uTime: { value: 0 }, uHave: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform samplerCube tSky; uniform vec3 uC; uniform float uR, uTime, uHave; varying vec3 vW;
        float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
        vec3 otherSky(vec3 d){
          vec3 col = vec3(0.0);
          for (int k = 0; k < 2; k++){
            vec3 p = d * (180.0 + float(k) * 260.0);
            vec3 i = floor(p);
            float h = hash3(i + float(k) * 7.0);
            float s = step(0.965, h) * pow(fract(h * 113.0), 5.0);
            vec3 f = fract(p) - 0.5;
            col += vec3(0.9, 0.92, 1.0) * s * exp(-dot(f, f) * 30.0) * 9.0;
          }
          vec3 bandN = normalize(vec3(0.35, 0.82, 0.45));
          float band = exp(-pow(dot(d, bandN), 2.0) * 14.0);
          float neb = vnoise(d * 5.0) * 0.6 + vnoise(d * 13.0) * 0.4;
          col += mix(vec3(0.25, 0.3, 0.65), vec3(0.7, 0.45, 0.6), neb) * band * (0.2 + 0.8 * neb) * 0.7;
          // Gargantua's accretion glow, far beyond the mouth
          vec3 gd = normalize(vec3(-0.45, 0.15, 0.88));
          float g = max(dot(d, gd), 0.0);
          col += vec3(1.0, 0.7, 0.4) * (pow(g, 80.0) * 1.2 + pow(g, 10.0) * 0.04);
          return col;
        }
        void main(){
          vec3 rd = normalize(vW);                     // camera at the far-layer origin
          float tc = dot(uC, rd);
          if (tc <= 0.0) discard;
          vec3 perp = uC - rd * tc;                    // from the ray's closest point to the centre
          float b = length(perp);
          float x = b / uR;
          vec3 axis = normalize(cross(rd, uC) + vec3(1e-7));
          vec3 col; float a;
          if (x < 1.0){
            // through the throat: the far side, wrapped (strongest distortion near the rim)
            float ang = (1.0 - x) * 2.6 + pow(x, 6.0) * 2.4;
            vec3 d2 = rd * cos(ang) + cross(axis, rd) * sin(ang) + axis * dot(axis, rd) * (1.0 - cos(ang));
            col = otherSky(normalize(d2));
            col += vec3(1.0, 0.95, 0.9) * exp(-pow((1.0 - x) / 0.018, 2.0)) * 1.1;   // inner Einstein ring
            a = 1.0;
          } else {
            // lensed exterior: light bent around the mouth
            float alpha = 1.1 / pow(x, 1.3);
            vec3 d2 = rd * cos(alpha) - cross(axis, rd) * sin(alpha) + axis * dot(axis, rd) * (1.0 - cos(alpha));
            col = uHave > 0.5 ? textureCube(tSky, normalize(d2), 1.5).rgb * 0.6 : vec3(0.0);
            col += vec3(0.95, 0.95, 1.0) * exp(-pow((x - 1.0) / 0.025, 2.0)) * 0.9;      // outer ring
            a = 1.0 - smoothstep(1.4, 2.6, x);
            col *= a;
          }
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(8, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 900;
    this.mesh.userData.owned = true;
  }

  /** Position the lens (km, relative to the far camera) and refresh the sky capture every few seconds. */
  update(rel: THREE.Vector3, renderer: THREE.WebGLRenderer, scene: THREE.Scene, dt: number) {
    const dist = rel.length();
    const sc = dist > SCALED_KM ? SCALED_KM / dist : 1;
    this.mesh.position.copy(rel).multiplyScalar(sc);
    this.mesh.scale.setScalar(sc * this.radiusKm);
    const u = this.mat.uniforms;
    (u.uC.value as THREE.Vector3).copy(this.mesh.position);
    u.uR.value = this.radiusKm * sc;
    u.uTime.value += dt;
    this.mesh.visible = dist < 5e6;
    this.captureT -= dt;
    if (this.mesh.visible && dist < 2e4 && this.captureT <= 0) {
      this.captureT = 6;
      this.mesh.visible = false;
      this.cubeCam.position.set(0, 0, 0);
      this.cubeCam.update(renderer, scene);
      this.mesh.visible = true;
      u.uHave.value = 1;
    }
  }
}
