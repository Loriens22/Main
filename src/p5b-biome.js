/* ===== P1 — SCALE-AWARE BIOME COLOUR + TERRAIN SHADERS =====================
 * Replaces biomeColor() / VS_TERRAIN / FS_TERRAIN.
 *
 * THE BUG: surface colour was evaluated per vertex and Gouraud-interpolated.
 * At coarse quadtree LOD adjacent vertices are hundreds of km apart, while the
 * snow / rock / vegetation thresholds flip over a couple of km of elevation.
 * Neighbouring vertices therefore land on opposite sides of every threshold and
 * the mesh reads as black-and-white salt-and-pepper.
 *
 * THE FIX: nothing about the colour model is allowed to contain detail finer
 * than the vertex spacing. Two rules, applied everywhere:
 *   1. every threshold has a transition HALF-WIDTH that grows with `lodScaleM`,
 *      so a coarse chunk sees a continuous average instead of a hard edge;
 *   2. every noise term is BAND-LIMITED — a frequency above the Nyquist limit
 *      of the vertex grid is faded out rather than sampled.
 * On top of that, coarse chunks blend toward a low-frequency continental
 * palette (ocean / land / ice-cap) so an orbital view reads as a real globe.
 *
 * ---------------------------------------------------------------------------
 * WIRING FOR THE LEAD
 *
 *  biomeColor2(dx,dy,dz, h, slope, d, lodScaleM, out)
 *    Same as biomeColor plus `lodScaleM` = approximate world-space distance in
 *    METRES between adjacent vertices of the chunk being built. In
 *    terrBuildMesh() that is:
 *        const lodScaleM = b.radius * n.size / (CHUNK_N-1) * 1.35;
 *    (the 1.35 accounts for the tan() warp in cubeDir; any value within ~2x is
 *    fine — the response is logarithmic). Passing 0/undefined is safe: it falls
 *    back to radius*0.004.
 *
 *  VS_TERRAIN2 / FS_TERRAIN2 — drop-in for VS_TERRAIN / FS_TERRAIN.
 *    Attribute layout unchanged (0 position, 1 normal, 2 uv, 3 color).
 *    All existing uniforms kept and still required:
 *        uVP uChunkOff uRot uPlanetC uSunDir uSunCol uPlanetR uSkyTint
 *        uTime uAtmoAmt uOceanLvl   (+ uLogFC from GLSL_COMMON)
 *    NOTE: uRot is now read by the FRAGMENT shader too (to un-spin the planet
 *    for the procedural detail). It is the same uniform — no extra work, the
 *    existing gl.uniformMatrix3fv(P_TERR.u.uRot, ...) already covers it.
 *
 *    UNIFORMS ADDED (both OPTIONAL — 0 / unset behaves sensibly):
 *        uniform float uLodScale;   // metres between vertices of the chunk being
 *                                   // drawn. If <=0 the shader derives the pixel
 *                                   // footprint from fwidth() instead, which is
 *                                   // what it uses anyway — setting it only
 *                                   // damps detail on very coarse chunks.
 *                                   //   gl.uniform1f(P_TERR.u.uLodScale, lodScaleM)
 *                                   //   per chunk, guarded as usual.
 *        uniform float uDetailAmt;  // 0..1 global detail strength (quality dial).
 *                                   // If <=0 it is treated as 1.0. Suggested:
 *                                   //   QUALITY.tier===0 ? 0.55 : 1.0
 * ========================================================================= */

/* ---- small scale-aware helpers (top-level so no closure is allocated) ---- */
const BIO_INV_LN2 = 1.4426950408889634;
function bioLog2(x){ return Math.log(x) * BIO_INV_LN2; }

// Band-limit weight: 1 when frequency f is comfortably below the grid Nyquist
// limit fMax, smoothly 0 as f reaches it. This is what stops noise from turning
// into per-vertex hash at coarse LOD.
function bioBand(fMax, f){
 const w = fMax / f - 1;
 if (w <= 0) return 0;
 if (w >= 1) return 1;
 return w * w * (3 - 2 * w);
}
// smoothstep(e-w, e+w, x) — a threshold with an explicit half-width.
function bioStep(x, e, w){
 if (!(w > 1e-9)) return x < e ? 0 : 1;
 let t = (x - e) / (2 * w) + 0.5;
 if (t <= 0) return 0;
 if (t >= 1) return 1;
 return t * t * (3 - 2 * t);
}
// Chroma-only hue rotation (YIQ). Achromatic colours stay achromatic, so snow
// never turns pink; saturated biomes shift enough to make worlds distinct.
const _bioRGB = new Float64Array(3);
function bioHue(r, g, b, ang, satMul, o){
 const c = Math.cos(ang), s = Math.sin(ang);
 const Y = 0.299 * r + 0.587 * g + 0.114 * b;
 const I = 0.596 * r - 0.274 * g - 0.322 * b;
 const Q = 0.211 * r - 0.523 * g + 0.312 * b;
 const I2 = (I * c - Q * s) * satMul, Q2 = (I * s + Q * c) * satMul;
 o[0] = Y + 0.9563 * I2 + 0.6210 * Q2;
 o[1] = Y - 0.2721 * I2 - 0.6474 * Q2;
 o[2] = Y - 1.1070 * I2 + 1.7046 * Q2;
 return o;
}
const BIO_DEFPAL = [[.5,.5,.5],[.5,.5,.5],[.5,.5,.5],[.5,.5,.5],[.5,.5,.5],[.5,.5,.5]];

/* =========================================================================
 * biomeColor2 — allocation free, ~3 noise3 taps, no branching on data that
 * changes per vertex inside the hot loop.
 * ======================================================================= */
function biomeColor2(dx, dy, dz, h, slope, d, lodScaleM, out){
 const R = (d && d.radius > 1) ? d.radius : 6.371e6;
 let L = lodScaleM;
 if (!(L > 0)) L = R * 0.004;      // defensive: caller did not pass one
 if (L < 1) L = 1;

 // 0 = fine chunk (<=60 m between vertices) … 1 = continental chunk (>=490 km)
 const coarse = sat(bioLog2(L / 60) / 13);
 // Nyquist limit of the vertex grid, in cycles per unit direction (~per radian).
 // 0.35 keeps ~2.8 samples per wavelength at the limit.
 const fMax = 0.35 * R / L;

 const pal = (d && d.pal) ? d.pal : BIO_DEFPAL;
 const pr = pal[0], ps = pal[1], pv = pal[2], pa = pal[3], ph = pal[4], pl = pal[5];
 const sd = d.seed * 13.7;
 const lat = dy < 0 ? -dy : dy;

 /* ---- band-limited noise taps -------------------------------------------
  * P  continental provinces  (fixed low frequency, structural)
  * Q  regional patches       (fixed mid frequency, structural, fades first)
  * Dn detail mottle          (frequency TRACKS the LOD so it is always just
  *                            under Nyquist — maximum detail, zero aliasing)
  * Structural decisions may only use P and Q (fixed frequencies fading
  * smoothly). Dn is amplitude-limited modulation only, never a threshold.  */
 const wP = bioBand(fMax, 1.55);
 const P = wP > 0.004 ? noise3(dx * 1.55 + sd, dy * 1.55 + 13.3, dz * 1.55 - 5.1) * wP : 0;
 const wQ = bioBand(fMax, 6.4);
 const Q = wQ > 0.004 ? noise3(dx * 6.4 - sd * 0.37, dy * 6.4 + 41.7, dz * 6.4 + 2.9) * wQ : 0;
 let fD = fMax * 0.42; if (fD < 9) fD = 9; if (fD > 24000) fD = 24000;
 const wD = bioBand(fMax, fD);
 const Dn = wD > 0.004 ? noise3(dx * fD + 7.7, dy * fD - 3.3, dz * fD + 19.1) * wD : 0;

 let cr, cg, cb;

 /* ================= GAS GIANT ================= */
 if (d.type === 5){
  const turb = P * 2.4 + Q * 0.9;
  const band = Math.sin(dy * 17.0 + turb * 2.2) * 0.5 + 0.5;
  const jet = Math.sin(dy * 43.0 + turb * 1.1) * 0.5 + 0.5;
  cr = mix(mix(0.42, 0.92, ph[0]), mix(0.26, 0.70, pl[0]), band);
  cg = mix(mix(0.34, 0.80, ph[1]), mix(0.22, 0.58, pl[1]), band);
  cb = mix(mix(0.22, 0.62, ph[2]), mix(0.20, 0.54, pl[2]), band);
  const zw = sat(jet * 0.8 + 0.1) * 0.35;
  cr = mix(cr, sat(cr * 1.15 + 0.04), zw);
  cg = mix(cg, sat(cg * 1.06 + 0.02), zw);
  cb = mix(cb, sat(cb * 0.94), zw);
  // one great storm oval per world
  const storm = sat(Math.abs(P) * 2.3 - 1.15);
  cr = mix(cr, mix(0.60, 0.96, pa[0]), storm * 0.85);
  cg = mix(cg, mix(0.30, 0.62, pa[1]), storm * 0.85);
  cb = mix(cb, mix(0.14, 0.34, pa[2]), storm * 0.85);
  // polar hoods, blurred by LOD like everything else
  const pol = bioStep(lat, 0.80, 0.14 + 0.20 * coarse);
  cr = mix(cr, cr * 0.70 + 0.10, pol * 0.75);
  cg = mix(cg, cg * 0.74 + 0.11, pol * 0.75);
  cb = mix(cb, cb * 0.86 + 0.14, pol * 0.75);
  const mo5 = Dn * 0.05 + Q * 0.03;
  cr = sat(cr * (1 + mo5)); cg = sat(cg * (1 + mo5)); cb = sat(cb * (1 + mo5));
  bioHue(cr, cg, cb, (d.hue - 0.5) * 0.55, 1.10, _bioRGB);
  out[0] = sat(_bioRGB[0]); out[1] = sat(_bioRGB[1]); out[2] = sat(_bioRGB[2]);
  return out;
 }

 /* ================= SOLID SURFACES ================= */
 const hPos = h > 0 ? h : 0;
 // latitude cooling: |sin(lat)| weighted so mid-latitudes fall off realistically
 const latC = lat * lat * 0.62 + lat * 0.38;
 // lapse rate + latitude + a smooth regional climate wobble
 const t = d.temp - hPos * 0.0065 - latC * 52 + P * 9.0 - Q * 4.0;
 const hum = sat(d.humidity * (0.78 + 0.5 * P) - hPos / 26000 + Q * 0.12);

 /* ---- SCALE-AWARE TRANSITION WIDTHS — the actual fix -------------------- */
 // Unresolved relief inside one cell: horizontal distance x typical slope.
 const hW = clamp(L * 0.22, 20, 4500);            // elevation blur, metres
 const tW = 2.0 + hW * 0.0065 + 7.0 * coarse;     // temperature blur, kelvin
 const sW = 0.09 + 0.40 * coarse;                 // slope blur
 // Slope itself is meaningless once vertices are km apart, so fade its weight.
 const rockAmt = mix(1.0, 0.40, coarse);
 const rocky = bioStep(slope, 0.32, sW) * rockAmt;

 const sea = d.seaLevel || 0;
 const hasSea = (d.type === 1 || d.type === 6);
 const subm = hasSea ? (1 - bioStep(h, sea, hW * 1.2 + 45)) : 0;

 /* ---- bedrock (shared by every rocky type) ---- */
 let br = mix(0.19, 0.42, pr[0]), bg = mix(0.17, 0.36, pr[1]), bb = mix(0.15, 0.31, pr[2]);
 const prov = sat(P * 1.3 + 0.5);
 br = mix(br, mix(0.28, 0.56, ph[0]), prov * 0.5);
 bg = mix(bg, mix(0.25, 0.48, ph[1]), prov * 0.5);
 bb = mix(bb, mix(0.21, 0.42, ph[2]), prov * 0.5);

 if (d.type === 2){
  /* ---- desert: ergs, duricrust, oxide streaks ---- */
  const sr = mix(0.60, 0.86, pa[0]), sg = mix(0.44, 0.68, pa[1]), sb = mix(0.24, 0.44, pa[2]);
  const erg = sat(0.40 + P * 1.0) * clamp(d.dunes, 0, 1);
  cr = mix(sr * 0.78, sr, erg); cg = mix(sg * 0.78, sg, erg); cb = mix(sb * 0.74, sb, erg);
  const ox = sat(Q * 1.4 + 0.15) * 0.5;
  cr = mix(cr, sat(cr * 1.12 + 0.04), ox);
  cg = mix(cg, cg * 0.93, ox);
  cb = mix(cb, cb * 0.82, ox);
  // dark basaltic plains where the province noise dips
  const bas = 1 - bioStep(P, -0.24, 0.14 + 0.30 * coarse);
  cr = mix(cr, br * 0.85, bas * 0.55); cg = mix(cg, bg * 0.85, bas * 0.55); cb = mix(cb, bb * 0.9, bas * 0.55);

 } else if (d.type === 3){
  /* ---- ice world: firn, dirty ice, blue crevasse depth ---- */
  cr = mix(0.72, 0.93, ph[0]); cg = mix(0.79, 0.96, ph[1]); cb = mix(0.86, 1.00, ph[2]);
  const dirt = sat(0.42 - P * 1.2) * (1 - clamp(d.ice, 0, 1) * 0.55);
  cr = mix(cr, br * 1.5, dirt * 0.6); cg = mix(cg, bg * 1.5, dirt * 0.6); cb = mix(cb, bb * 1.5, dirt * 0.6);
  const deepIce = sat(-h / (d.amp * 0.6 + 1)) * 0.55;
  cr = mix(cr, cr * 0.66, deepIce); cg = mix(cg, cg * 0.84, deepIce); cb = mix(cb, sat(cb * 1.03), deepIce);

 } else if (d.type === 4){
  /* ---- volcanic: basalt with sulphur / ash provinces ---- */
  cr = mix(0.10, 0.20, pr[0]); cg = mix(0.08, 0.15, pr[1]); cb = mix(0.07, 0.13, pr[2]);
  const sul = sat(P * 1.5 + 0.20) * sat(d.lava * 1.3);
  cr = mix(cr, mix(0.62, 0.94, pa[0]), sul * 0.6);
  cg = mix(cg, mix(0.46, 0.76, pa[1]), sul * 0.6);
  cb = mix(cb, mix(0.10, 0.28, pa[2]), sul * 0.6);

 } else if (d.type === 0){
  /* ---- airless rock: mare / highland albedo provinces ---- */
  const high = bioStep(P, 0.02, 0.22 + 0.30 * coarse);
  cr = mix(br * 0.62, br * 1.34, high);
  cg = mix(bg * 0.63, bg * 1.32, high);
  cb = mix(bb * 0.66, bb * 1.28, high);
  // fresh ejecta rays brighten the youngest ground
  const ray = sat(Q * 1.6 - 0.35) * (1 - coarse * 0.6);
  cr = mix(cr, sat(cr * 1.45), ray * 0.45);
  cg = mix(cg, sat(cg * 1.45), ray * 0.45);
  cb = mix(cb, sat(cb * 1.42), ray * 0.45);

 } else {
  /* ---- terrestrial / ocean world: a real climate model ---- */
  // vegetation belt: warm enough, not too hot, below the tree line, humid
  const vegT = bioStep(t, 272, tW * 1.7) * (1 - bioStep(t, 320, tW * 2.2));
  const vegA = 1 - bioStep(hPos, 2600 + hW, 700 + hW * 1.2);
  const veg01 = sat(vegT * vegA * clamp(d.vegetation, 0, 1) * sat(hum * 1.7));
  // soil, drifting to sand where it is hot and dry
  let sr = mix(0.28, 0.50, ps[0]), sg = mix(0.21, 0.35, ps[1]), sb = mix(0.12, 0.23, ps[2]);
  const arid = sat((1 - hum) * 1.3 - 0.15) * bioStep(t, 289, tW * 2.4);
  sr = mix(sr, mix(0.62, 0.86, pa[0]), arid * 0.85);
  sg = mix(sg, mix(0.46, 0.68, pa[1]), arid * 0.85);
  sb = mix(sb, mix(0.26, 0.44, pa[2]), arid * 0.85);
  // lush jungle green vs olive scrub, chosen by humidity
  const lush = sat(hum * 1.5 - 0.20);
  const vr = mix(mix(0.26, 0.42, pv[0]), mix(0.04, 0.14, pv[0]), lush);
  const vg = mix(mix(0.27, 0.40, pv[1]), mix(0.18, 0.42, pv[1]), lush);
  const vb = mix(mix(0.11, 0.19, pv[2]), mix(0.03, 0.12, pv[2]), lush);
  cr = mix(sr, vr, veg01); cg = mix(sg, vg, veg01); cb = mix(sb, vb, veg01);
 }

 /* ---- exposed rock on steep ground (width and weight both scale-aware) ---- */
 cr = mix(cr, br * 1.06, rocky); cg = mix(cg, bg * 1.06, rocky); cb = mix(cb, bb * 1.06, rocky);

 /* ---- beach: a thin band, so it must fade out as cells grow ---- */
 if (hasSea){
  const bw = 70 + hW * 1.4;
  const beach = (1 - bioStep(h < sea ? sea - h : h - sea, bw * 0.55, bw * 0.5)) *
                (1 - rocky) * (1 / (1 + hW / 500));
  cr = mix(cr, mix(0.66, 0.88, pa[0]), beach * 0.8);
  cg = mix(cg, mix(0.58, 0.78, pa[1]), beach * 0.8);
  cb = mix(cb, mix(0.42, 0.60, pa[2]), beach * 0.8);
  /* ---- seabed under the ocean shell ---- */
  if (subm > 0.002){
   const dep = sat((sea - h) / (900 + hW * 3));
   const sbr = mix(0.13, 0.028, dep) * mix(0.8, 1.2, pl[0]);
   const sbg = mix(0.17, 0.048, dep) * mix(0.85, 1.15, pl[1]);
   const sbb = mix(0.16, 0.070, dep) * mix(0.85, 1.15, pl[2]);
   cr = mix(cr, sbr, subm); cg = mix(cg, sbg, subm); cb = mix(cb, sbb, subm);
  }
 }

 /* ---- snowline: temperature driven, blurred by tW (this was the worst
        offender — a fixed 18 K ramp is ~2.8 km of elevation, far less than the
        relief inside one coarse cell) ---- */
 const snow = (1 - bioStep(t, 262, tW * 1.7)) * Math.max(clamp(d.ice, 0, 1), 0.22) *
              (1 - rocky * 0.5) * (1 - subm);
 cr = mix(cr, 0.90, snow); cg = mix(cg, 0.93, snow); cb = mix(cb, 0.97, snow);

 /* ---- lava in the low basins ---- */
 if (d.lava > 0.25){
  const lv = (1 - bioStep(h, -d.amp * 0.16, d.amp * 0.30 + hW)) * d.lava *
             (1 - rocky * 0.6) * (1 - bioStep(slope, 0.55, 0.2 + sW));
  cr = mix(cr, 1.0, lv * 0.78); cg = mix(cg, 0.26, lv * 0.78); cb = mix(cb, 0.05, lv * 0.78);
 }

 /* ---- CONTINENTAL PALETTE: at coarse LOD blend to the low-frequency read of
        the world, so from orbit you see ocean / land / ice cap, not noise. ---- */
 if (coarse > 0.02){
  let ar, ag, ab;
  if (d.type === 2){ ar = mix(0.58, 0.82, pa[0]); ag = mix(0.42, 0.63, pa[1]); ab = mix(0.24, 0.42, pa[2]); }
  else if (d.type === 3){ ar = mix(0.74, 0.90, ph[0]); ag = mix(0.80, 0.94, ph[1]); ab = mix(0.86, 0.99, ph[2]); }
  else if (d.type === 4){ ar = mix(0.12, 0.22, pr[0]); ag = mix(0.09, 0.16, pr[1]); ab = mix(0.08, 0.14, pr[2]); }
  else if (d.type === 0){ ar = br; ag = bg; ab = bb; }
  else {
   const veg2 = sat(clamp(d.vegetation, 0, 1) * sat(hum * 1.6) *
                    bioStep(t, 276, 26) * (1 - bioStep(hPos, 3000, 1500)));
   ar = mix(mix(0.34, 0.52, ps[0]), mix(0.07, 0.18, pv[0]), veg2);
   ag = mix(mix(0.26, 0.38, ps[1]), mix(0.20, 0.42, pv[1]), veg2);
   ab = mix(mix(0.15, 0.25, ps[2]), mix(0.05, 0.15, pv[2]), veg2);
  }
  const cap = (1 - bioStep(t, 264, 17)) * Math.max(clamp(d.ice, 0, 1), 0.25);
  ar = mix(ar, 0.90, cap); ag = mix(ag, 0.93, cap); ab = mix(ab, 0.97, cap);
  if (hasSea){
   const dep = sat((sea - h) / 3200);
   ar = mix(ar, mix(0.040, 0.010, dep), subm);
   ag = mix(ag, mix(0.110, 0.032, dep), subm);
   ab = mix(ab, mix(0.175, 0.078, dep), subm);
  }
  const k = coarse * 0.85;
  cr = mix(cr, ar, k); cg = mix(cg, ag, k); cb = mix(cb, ab, k);
 }

 /* ---- multiplicative mottle (keeps dark ground dark), band-limited ---- */
 const mo = Dn * 0.055 + Q * 0.035 * (1 - coarse * 0.7);
 cr = cr * (1 + mo); cg = cg * (1 + mo); cb = cb * (1 + mo);

 /* ---- per-planet identity: hue rotation + saturation ---- */
 const hueAmt = d.type === 1 ? 0.30 : (d.type === 3 ? 0.45 : 0.80);
 bioHue(cr, cg, cb, (d.hue - 0.5) * hueAmt, 1.0 + (pl[1] - 0.5) * 0.30 + 0.12, _bioRGB);
 out[0] = sat(_bioRGB[0]); out[1] = sat(_bioRGB[1]); out[2] = sat(_bioRGB[2]);
 return out;
}

/* =========================================================================
 * VS_TERRAIN2 — same attributes/uniforms as VS_TERRAIN; adds vL (chunk-local
 * position, full float32 precision) so the fragment shader can key sub-metre
 * detail off something that is not 6.4e6 metres from the origin.
 * ======================================================================= */
const VS_TERRAIN2 = `
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
layout(location=3) in vec3 color;
uniform mat4 uVP; uniform vec3 uChunkOff; uniform mat3 uRot; uniform vec3 uPlanetC;
out vec3 vN; out vec3 vC; out vec3 vP; out float vH; out vec3 vL; out vec2 vT;
void main(){
 vec3 wp=uRot*position+uChunkOff;
 vN=normalize(uRot*normal); vC=color; vP=wp; vT=uv;
 vH=length(wp-uPlanetC);
 vL=position;                       // chunk-local: small, so precision survives
 gl_Position=uVP*vec4(wp,1.0); segLog(gl_Position);
}`;

/* =========================================================================
 * FS_TERRAIN2
 *   - triplanar strata + two band-limited procedural detail octaves, each
 *     faded against the pixel footprint (fwidth) so nothing ever aliases
 *   - slope/rock blending done PER PIXEL, not per vertex
 *   - wrapped terminator, cavity AO proxy, ice/snow subsurface term
 * ======================================================================= */
const FS_TERRAIN2 = `
in vec3 vN; in vec3 vC; in vec3 vP; in float vH; in vec3 vL; in vec2 vT;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uPlanetC; uniform float uPlanetR;
uniform vec3 uSkyTint; uniform float uTime; uniform float uAtmoAmt; uniform float uOceanLvl;
uniform mat3 uRot;                 // shared with the VS — used to un-spin the planet
uniform float uLodScale;           // OPTIONAL (see header). <=0 -> derived from fwidth
uniform float uDetailAmt;          // OPTIONAL global detail scale. <=0 -> 1.0
out vec4 fragColor;

// Triplanar sedimentary strata: the noise domain is squashed along each
// projection axis, so each plane contributes bedding planes instead of blobs.
float bioStrata(vec3 p,vec3 n,float f,int oct){
 vec3 w=abs(n); w*=w; w/=max(w.x+w.y+w.z,1e-5);
 float a=vfbm3(vec3(p.yz*f,p.x*f*0.15),oct);
 float b=vfbm3(vec3(p.zx*f,p.y*f*0.15)+19.7,oct);
 float c=vfbm3(vec3(p.xy*f,p.z*f*0.15)+53.3,oct);
 return a*w.x+b*w.y+c*w.z;
}

void main(){
 vec3 up=normalize(vP-uPlanetC);
 vec3 Ng=normalize(vN);
 vec3 N=Ng;
 // planet-FIXED position: un-spin so the detail does not swim as the world turns
 vec3 dpl=(vP-uPlanetC)*uRot;
 // tangent frame on the sphere, then the same frame expressed planet-locally
 vec3 T=normalize(cross(abs(up.y)<0.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0),up));
 vec3 B=cross(up,T);
 vec3 Tl=T*uRot, Bl=B*uRot;

 // world metres covered by one pixel — the anti-aliasing budget for detail
 float px=max(length(fwidth(vP)),1e-3);
 float detAmt=uDetailAmt>0.0?uDetailAmt:1.0;
 if(uLodScale>0.0) detAmt*=sat(600.0/uLodScale);   // never detail a continental chunk

 float cav=0.0;                                    // <0 in creases, >0 on crests

 // ---- band A: ~700 m relief, alive from a few km up ----
 float wA=sat(700.0/(px*5.0)-1.0)*detAmt;
 if(wA>0.01){
  vec3 q=dpl*(1.0/700.0);
  float e=0.22;
  float n0=vfbm3(q,3);
  float gu=(vfbm3(q+Tl*e,3)-n0)/e, gv=(vfbm3(q+Bl*e,3)-n0)/e;
  N=normalize(N-(T*gu+B*gv)*wA*0.50);
  cav+=(n0-0.5)*wA;
 }
 // ---- band B: ~12 m grain, only once you are close; keyed off vL so the
 //      coordinate is small and float32 precision holds at 6.4e6 m radius ----
 float wB=sat(12.0/(px*5.0)-1.0)*detAmt;
 if(wB>0.01){
  vec3 q=vL*(1.0/12.0);
  float e=0.30;
  float n0=vfbm3(q,2);
  float gu=(vfbm3(q+Tl*e,2)-n0)/e, gv=(vfbm3(q+Bl*e,2)-n0)/e;
  N=normalize(N-(T*gu+B*gv)*wB*0.80);
  cav+=(n0-0.5)*wB*0.9;
 }

 vec3 alb=vC;
 // ---- per-pixel slope: high-frequency variation belongs HERE, not in vC ----
 float slope=1.0-sat(dot(N,up));
 float rockW=smoothstep(0.14,0.50,slope);
 // rock colour derived from the vertex albedo, so it stays per-planet correct
 float lc=luma(alb);
 vec3 rockC=mix(vec3(lc),alb,0.42)*mix(0.60,0.98,sat(cav*2.0+0.5));
 float wS=sat(140.0/(px*5.0)-1.0)*detAmt*rockW;
 if(wS>0.03){
  float st=bioStrata(dpl,Ng,1.0/48.0,2);
  rockC*=mix(0.74,1.26,st);
 }
 alb=mix(alb,rockC,rockW*0.85);
 alb*=1.0+cav*0.30;

 // submerged ground: the ocean shell may not cover it at every angle
 float below=(uOceanLvl>-1.0e8)?((uPlanetR+uOceanLvl)-vH):-1.0;
 float sub=sat(below/80.0);
 alb=mix(alb,alb*vec3(0.34,0.62,0.82)*0.8,sub*0.85);
 alb=sat(alb);

 // ---- snow / ice detection straight from the albedo: bright and blue-biased ----
 float icy=sat((luma(alb)-0.58)*2.6)*sat((alb.b-alb.r)*4.0+0.35);

 // ---- lighting ----
 float ndl=dot(N,uSunDir);
 float diff=sat((ndl+0.08)/1.08);              // soft wrapped terminator
 float sh=sat(dot(up,uSunDir)*6.0+0.35);       // far side self-shadow
 diff*=sh;
 // cheap AO proxy: faces tilted off the local up, plus concave detail
 float ao=mix(0.52,1.0,sat(dot(N,up)*0.5+0.5));
 ao*=1.0-0.30*sat(-cav*3.0);
 // sky dome above + bounce from the ground
 float skyv=sat(dot(N,up)*0.5+0.5);
 vec3 amb=uSkyTint*uAtmoAmt*0.20*skyv*ao+alb*0.05*ao;
 // GGX-ish specular; ice and wet ground are much smoother than regolith
 vec3 V=normalize(-vP);
 vec3 Hh=normalize(V+uSunDir);
 float rough=mix(0.62,0.18,icy);
 float a2=rough*rough; a2*=a2;
 float nh=sat(dot(N,Hh));
 float dg=a2/(PI*pow(nh*nh*(a2-1.0)+1.0,2.0));
 float fres=0.04+0.22*pow(1.0-sat(dot(N,V)),5.0);
 vec3 spec=uSunCol*min(dg,60.0)*fres*diff*mix(0.5,3.0,icy);
 // subsurface: snow and ice glow, strongest looking toward the sun
 float back=pow(sat(dot(V,-uSunDir)),2.5);
 vec3 sss=alb*uSunCol*icy*(back*0.30+sat(ndl*0.5+0.5)*0.10)*sh;
 // molten ground emits (detected from a strongly red-dominant albedo)
 float lavaW=sat((alb.r-alb.g*1.9-0.12)*2.2);
 vec3 emis=vec3(1.0,0.30,0.06)*lavaW*lavaW*1.6;

 vec3 c=alb*(diff*uSunCol*ao+amb)+spec+sss+emis;
 fragColor=vec4(c,1.0);
}`;

/* =========================================================================
 * bioSelfTest — the important assertion is #2: adjacent vertices of a COARSE
 * chunk must not alternate. That is the speckle, expressed as a number.
 * ======================================================================= */
function bioSelfTest(){
 try{
  const out = [0,0,0];
  /* 1. finite and in range for every planet type at every LOD */
  for (let ty = 0; ty < 7; ty++){
   const d = makeDNA(ty * 7.3 + 1.1, ty, ty === 5 ? 7e7 : 5e6);
   for (let li = 0; li < 9; li++){
    const L = 20 * Math.pow(4, li);
    for (let s = 0; s < 16; s++){
     const a = s * 0.71, b2 = s * 1.317;
     const dx = Math.cos(a) * Math.cos(b2), dy = Math.sin(b2), dz = Math.sin(a) * Math.cos(b2);
     const h = fieldHeight(dx, dy, dz, d);
     biomeColor2(dx, dy, dz, h, (s % 6) * 0.17, d, L, out);
     for (let k = 0; k < 3; k++)
      if (!(out[k] >= 0) || !(out[k] <= 1))
       return {ok:false, why:'biomeColor2 out of range: type '+ty+' L='+L+' -> '+out.join(',')};
    }
   }
  }
  /* 2. SPECKLE TEST — walk a great circle at the vertex spacing of a coarse
     chunk and measure how much the colour can change between neighbours. */
  let worstL = 0, worst = 0, worstMean = 0;
  for (const L of [400000, 100000, 25000]){
   for (const ty of [0,1,2,3,4]){
    const d = makeDNA(ty * 3.7 + 2.3, ty, 6.0e6);
    const so = d._oct;
    d._oct = Math.max(4, Math.min(d.octaves, 4 + Math.round(bioLog2(6.0e6 / L))));
    const step = L / 6.0e6;
    let pr0 = 0, pg0 = 0, pb0 = 0, mx = 0, sum = 0, n = 0;
    for (let i = 0; i < 220; i++){
     const ang = 0.37 + i * step;
     const dx = Math.cos(ang) * 0.83, dy = Math.sin(ang), dz = Math.cos(ang) * 0.55;
     const l = Math.hypot(dx, dy, dz);
     const ux = dx / l, uy = dy / l, uz = dz / l;
     const h0 = fieldHeight(ux, uy, uz, d);
     const h1 = fieldHeight(ux + uz * step, uy, uz - ux * step, d);
     const g = (h1 - h0) / L;
     const slope = 1 - 1 / Math.sqrt(1 + g * g);
     biomeColor2(ux, uy, uz, h0, slope, d, L, out);
     if (i > 0){
      const dd = Math.max(Math.abs(out[0]-pr0), Math.abs(out[1]-pg0), Math.abs(out[2]-pb0));
      if (dd > mx) mx = dd;
      sum += dd; n++;
     }
     pr0 = out[0]; pg0 = out[1]; pb0 = out[2];
    }
    d._oct = so;
    const mean = sum / Math.max(n,1);
    if (mx > worst){ worst = mx; worstL = L; }
    if (mean > worstMean) worstMean = mean;
   }
  }
  if (worst > 0.30)
   return {ok:false, why:'speckle: adjacent-vertex colour jump '+worst.toFixed(3)+' at lodScale '+worstL};
  if (worstMean > 0.07)
   return {ok:false, why:'speckle: mean adjacent-vertex colour jump '+worstMean.toFixed(4)};
  /* 3. shaders compile (only if the GL engine is present) */
  if (typeof prog === 'function' && typeof gl !== 'undefined' && gl){
   try{ prog(VS_TERRAIN2, FS_TERRAIN2, 'p1-terrain2'); }
   catch(e){ return {ok:false, why:'shader: '+e.message}; }
  }
  return {ok:true, maxJump:+worst.toFixed(4), meanJump:+worstMean.toFixed(4)};
 } catch(e){
  return {ok:false, why:(e && e.message) || String(e)};
 }
}
