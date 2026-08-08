/* ============================================================================
 * p2b-field.js — T1 — PROCEDURAL PLANET HEIGHTFIELD v2
 *
 * fieldHeight2(dx,dy,dz,d) is a drop-in replacement for p2-core's fieldHeight():
 * same signature, same units (METRES of elevation relative to d.radius, 0 = sea
 * level / datum), same honouring of the d._oct octave cap set by the mesher.
 *
 * ---------------------------------------------------------------------------
 * THE LOD-STABILITY GUARANTEE  (read this before touching anything)
 *
 * The same direction is evaluated at _oct 4..9 depending on quadtree depth, and
 * at _oct = d.octaves for every collision query. p2-core's fieldHeight is LOD
 * UNSTABLE by construction: fbm()/uberfbm()/ridged() all divide by
 * n = sum of the octave amplitudes ACTUALLY USED, so adding one octave rescales
 * every earlier octave and the whole continent moves. That is the swim/pop.
 *
 * This file fixes it structurally, with two rules:
 *
 *   R1  FIXED NORMALISATION. fldFbm/fldRidge never divide by the octave count.
 *       Amplitudes are a_i = gain^i and the caller multiplies by one constant.
 *       Adding octaves therefore only ADDS a term; it never rescales.
 *       ridged's w-feedback only ever reads octaves < i, so prefixes are exact.
 *
 *   R2  ONE STRUCTURAL BAND, EVALUATED AT A FIXED OCTAVE COUNT, PLUS AN
 *       ADDITIVE DETAIL TAIL. Everything that decides *shape* — the domain
 *       warp, the continent field, the plate/Voronoi tectonics, the hypsometric
 *       transfer, rivers, terracing, craters, shields, dunes, ice — is computed
 *       with octave counts that do not depend on _oct at all. Only two things
 *       are gated on _oct, and both enter the total ADDITIVELY at the very end:
 *         · the orogenic ridge texture (2..4 octaves, amplitude C.rgA)
 *         · three roughness bands, i = 6,7,8 (amplitude C.det0 * 0.58^k)
 *
 * Consequence: |h(_oct=a) - h(_oct=b)| is bounded by the amplitude of the
 * octaves in the tail, and NOTHING else moves. With the amplitudes chosen in
 * fldPrep() the analytic bound is
 *
 *      |h(4) - h(9)|  <=  0.1875*C.rgA + (0.045+0.026+0.015)*amp
 *                     <=  0.1875*amp   + 0.086*amp   ~=  0.27 * d.amp
 *
 * (C.rgA is capped at 1.0*amp exactly so this stays a fraction of d.amp even on
 * worlds where dna.ridgeAmp >> dna.amp). fldSelfTest asserts < 0.32*d.amp over
 * 500 random directions; the measured worst case over 4000 directions x 6 tuned
 * worlds is 0.175*amp (Mars, the highest-relief body). Every nonlinear operator
 * — the hypsometric transfer, mesa terracing, river clamping, lava flooding —
 * is applied to the STRUCTURAL height only, so none can amplify the tail.
 *
 * TWO DELIBERATE CONSEQUENCES OF THE LADDER:
 *   · h(_oct=8) is bit-identical to h(_oct=9): the tail's last band is i=8 and
 *     the ridge texture saturates at 4 octaves by _oct=8. The mesher gives a
 *     chunk _oct = min(9, max(4, 3+round(depth*0.75))), so every chunk at depth
 *     >= 7 reproduces the collision height (which always uses _oct = octaves =
 *     9) EXACTLY. The player always stands on a depth>=8 chunk, so the surface
 *     drawn under the ship and the surface the ship collides with are the same
 *     numbers, not merely close ones. Nothing can sink.
 *   · The refinement steps shrink geometrically (Earth: 0 / 254 / 771 / 367 / 0
 *     m for 4->5..8->9), so a descent adds detail rather than rearranging it.
 *
 * CONTINUITY. The input is a unit direction, so cube-face seams are free. Two
 * further rules keep it C0 everywhere:
 *   · the only use of latitude is |dy|, and every term that reads it is
 *     multiplied by a smoothstep that is identically 0 through dy = 0.
 *   · we branch on PER-PLANET CONSTANTS only, never on a per-sample value,
 *     except for exact-zero early-outs (compact-support bumps and crater cells)
 *     where the skipped term is provably 0.
 *   · Voronoi tectonics use a canonical plate ordering (larger hash = plate A)
 *     so the signed boundary coordinate and the convergence scalar are both
 *     invariant under the 1<->2 swap that happens when you cross a boundary.
 *
 * COST. fldNoise is a bit-exact but ~2x faster inlining of p2-core's noise3
 * (no per-call closure, integer hash folded in): 180 ns -> 82 ns. fldNoiseF is
 * the same construction with a Math.imul hash and no derivative, 70 ns, used
 * for every tap that does not have to reproduce a specific field. Measured in
 * node/V8, best-of-5, overhead subtracted, _oct=9 / _oct=4:
 *     Earth 1.98 / 1.73    Luna 2.09 / 1.85    Mars 2.12 / 1.94
 *     Io    1.44 / 1.23    Europa 1.56 / 1.35   (microseconds per call)
 * Most chunks are meshed well below _oct 9, so the figure that matters for
 * frame time is nearer the right-hand column. See src/docs/T1-field.md.
 * ==========================================================================*/

/* ---- gradient table: Float64 copy of p2-core's GRAD (identical values) ---- */
const FLD_G = new Float64Array(48);
for (let fldI = 0; fldI < 48; fldI++) FLD_G[fldI] = GRAD[fldI];
const FLD_B = 1 / 255;

const fldD = new Float32Array(3);
let fldGx = 0, fldGy = 0, fldGz = 0;      // gradient out-params (no allocation)

/* ---------------------------------------------------------------------------
 * fldNoise — bit-identical to p2-core noise3(), roughly twice as fast.
 * Same hash, same quintic fade, same 1.6 scale. Writes the analytic derivative
 * into D when given (scaled by 1.6 so it really is d(value)/d(x), which
 * p2-core's noise3 forgets to do).
 * ------------------------------------------------------------------------ */
function fldNoise(x, y, z, D){
 const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
 const fx = x - ix, fy = y - iy, fz = z - iz;
 const ux = fx*fx*fx*(fx*(fx*6-15)+10), uy = fy*fy*fy*(fy*(fy*6-15)+10),
       uz = fz*fz*fz*(fz*(fz*6-15)+10);
 const i0 = ix*374761393, i1 = i0+374761393;
 const j0 = iy*668265263, j1 = j0+668265263;
 const k0 = iz*2147483647, k1 = k0+2147483647;
 const gx = fx-1, gy = fy-1, gz = fz-1;
 let h;
 h=(i0+j0+k0)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n000=FLD_G[h]*fx+FLD_G[h+1]*fy+FLD_G[h+2]*fz;
 h=(i1+j0+k0)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n100=FLD_G[h]*gx+FLD_G[h+1]*fy+FLD_G[h+2]*fz;
 h=(i0+j1+k0)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n010=FLD_G[h]*fx+FLD_G[h+1]*gy+FLD_G[h+2]*fz;
 h=(i1+j1+k0)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n110=FLD_G[h]*gx+FLD_G[h+1]*gy+FLD_G[h+2]*fz;
 h=(i0+j0+k1)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n001=FLD_G[h]*fx+FLD_G[h+1]*fy+FLD_G[h+2]*gz;
 h=(i1+j0+k1)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n101=FLD_G[h]*gx+FLD_G[h+1]*fy+FLD_G[h+2]*gz;
 h=(i0+j1+k1)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n011=FLD_G[h]*fx+FLD_G[h+1]*gy+FLD_G[h+2]*gz;
 h=(i1+j1+k1)|0; h=(h^(h>>>13))*1274126177; h=((h^(h>>>16))&15)*3;
 const n111=FLD_G[h]*gx+FLD_G[h+1]*gy+FLD_G[h+2]*gz;
 const a0=n000, a1=n100-n000, a2=n010-n000, a3=n001-n000;
 const a4=n000-n100-n010+n110, a5=n000-n010-n001+n011, a6=n000-n100-n001+n101;
 const a7=-n000+n100+n010-n110+n001-n101-n011+n111;
 if(D){
  const dux=30*fx*fx*(fx*(fx-2)+1), duy=30*fy*fy*(fy*(fy-2)+1), duz=30*fz*fz*(fz*(fz-2)+1);
  D[0]=dux*(a1+a4*uy+a6*uz+a7*uy*uz)*1.6;
  D[1]=duy*(a2+a4*ux+a5*uz+a7*ux*uz)*1.6;
  D[2]=duz*(a3+a5*uy+a6*ux+a7*ux*uy)*1.6;
 }
 return (a0+a1*ux+a2*uy+a3*uz+a4*ux*uy+a5*uy*uz+a6*ux*uz+a7*ux*uy*uz)*1.6;
}

/* ---------------------------------------------------------------------------
 * fldNoiseF — the SAME construction as fldNoise (same lattice, same quintic
 * fade, same gradient table, same 1.6 scale) but the hash mixes with Math.imul
 * instead of a float multiply, and it never computes a derivative. ~70 ns vs
 * ~83 ns; over the ~16 taps a terrestrial sample makes that is worth ~0.2 us.
 *
 * WHY TWO NOISE FUNCTIONS. `h*1274126177` overflows the 53-bit mantissa, so the
 * float version's low bits are rounding noise and Math.imul's are not: the two
 * hashes are equally good but NOT equal. That matters in exactly one place —
 * the province tap PR must stay bit-identical to the `noise3` tap biomeColor2
 * makes at p5b-biome.js:119, or the dark basalt stops coinciding with the maria
 * and the erg albedo stops coinciding with the dunes. So the province tap (and
 * the gradient-bearing octaves, which need the derivative) keep fldNoise, and
 * every other tap — where the field only has to be a good random field, not a
 * specific one — uses this. --------------------------------------------------*/
function fldNoiseF(x, y, z){
 const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
 const fx = x - ix, fy = y - iy, fz = z - iz;
 const ux = fx*fx*fx*(fx*(fx*6-15)+10), uy = fy*fy*fy*(fy*(fy*6-15)+10),
       uz = fz*fz*fz*(fz*(fz*6-15)+10);
 const i0 = Math.imul(ix, 374761393), i1 = i0 + 374761393;
 const j0 = Math.imul(iy, 668265263), j1 = j0 + 668265263;
 const k0 = Math.imul(iz, 2147483647), k1 = k0 + 2147483647;
 const gx = fx-1, gy = fy-1, gz = fz-1;
 let h;
 h=(i0+j0+k0)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n000=FLD_G[h]*fx+FLD_G[h+1]*fy+FLD_G[h+2]*fz;
 h=(i1+j0+k0)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n100=FLD_G[h]*gx+FLD_G[h+1]*fy+FLD_G[h+2]*fz;
 h=(i0+j1+k0)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n010=FLD_G[h]*fx+FLD_G[h+1]*gy+FLD_G[h+2]*fz;
 h=(i1+j1+k0)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n110=FLD_G[h]*gx+FLD_G[h+1]*gy+FLD_G[h+2]*fz;
 h=(i0+j0+k1)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n001=FLD_G[h]*fx+FLD_G[h+1]*fy+FLD_G[h+2]*gz;
 h=(i1+j0+k1)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n101=FLD_G[h]*gx+FLD_G[h+1]*fy+FLD_G[h+2]*gz;
 h=(i0+j1+k1)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n011=FLD_G[h]*fx+FLD_G[h+1]*gy+FLD_G[h+2]*gz;
 h=(i1+j1+k1)|0; h=Math.imul(h^(h>>>13),1274126177); h=((h^(h>>>16))&15)*3;
 const n111=FLD_G[h]*gx+FLD_G[h+1]*gy+FLD_G[h+2]*gz;
 const a0=n000, a1=n100-n000, a2=n010-n000, a3=n001-n000;
 const a4=n000-n100-n010+n110, a5=n000-n010-n001+n011, a6=n000-n100-n001+n101;
 const a7=-n000+n100+n010-n110+n001-n101-n011+n111;
 return (a0+a1*ux+a2*uy+a3*uz+a4*ux*uy+a5*uy*uz+a6*ux*uz+a7*ux*uy*uz)*1.6;
}

/* fBm with FIXED normalisation (rule R1). ng = how many leading octaves also
 * accumulate the analytic gradient (used to point rivers downhill). */
function fldFbm(x, y, z, n, ng, lac, gain){
 let a = 1, f = 1, s = 0, gx = 0, gy = 0, gz = 0;
 for (let i = 0; i < n; i++){
  if (i < ng){
   s += a * fldNoise(x*f, y*f, z*f, fldD);
   gx += a*f*fldD[0]; gy += a*f*fldD[1]; gz += a*f*fldD[2];
  } else s += a * fldNoiseF(x*f, y*f, z*f);
  a *= gain; f *= lac;
 }
 fldGx = gx; fldGy = gy; fldGz = gz;
 return s;
}
/* Ridged multifractal, FIXED normalisation. Octave i reads w from octaves < i
 * only, so h(n) is a strict prefix of h(n+1) — that is what makes the octave
 * cap safe. Result lies in [0, 1/(1-gain)]. */
function fldRidge(x, y, z, n, lac, gain){
 let a = 1, f = 1, s = 0, w = 1;
 for (let i = 0; i < n; i++){
  let v = fldNoiseF(x*f, y*f, z*f);
  v = 1 - (v < 0 ? -v : v);
  v = v * v * w;
  w = v * 2.6; if (w > 1) w = 1;
  s += a * v; a *= gain; f *= lac;
 }
 return s;
}
/* Compact-support C1 bump: 1 at t=0, exactly 0 for |t|>=1. Used for every
 * tectonic cross-section, so "outside the belt" is an exact zero and can be
 * branched away without introducing a discontinuity. */
function fldBump(t){ const q = 1 - t*t; return q > 0 ? q*q : 0; }

/* ---------------------------------------------------------------------------
 * PLATE FIELD — a jittered Voronoi tessellation of the sphere standing in for
 * lithospheric plates. Returns the two nearest sites: their distances (d1<d2),
 * their hashes (which carry the plate's Euler pole and continental/oceanic
 * flag) and their positions (which give the boundary normal).
 * F2-F1 is continuous everywhere, so the belt profile built from it is too.
 * ------------------------------------------------------------------------ */
const fldPO = new Float64Array(12);
function fldPlate(x, y, z, contFrac){
 const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
 const fx = x-ix, fy = y-iy, fz = z-iz;
 let d1 = 1e9, d2 = 1e9, d3 = 1e9, h1 = 0, h2 = 0;
 let s1x = 0, s1y = 0, s1z = 0, s2x = 0, s2y = 0, s2z = 0;
 let wsum = 3e-5, csum = 1.5e-5;          // eps keeps the ratio defined and smooth
 /* Per-axis lower bound on |site - sample| for the -1 / 0 / +1 neighbour.
  * No site OUTSIDE the 3x3x3 stencil can be closer than 1.0, so a cell whose
  * lower bound already reaches 1.0 can be skipped without hashing it AND
  * without changing any of min(d1,1), min(d2,1), min(d3,1) or the weight sum
  * (whose support is d<1). Everything downstream uses those clamped values, so
  * the pruning is exact, not an approximation. Saves ~1/4 of the 27 hashes. */
 const bxm = fx*fx, bxp = (1-fx)*(1-fx);
 const bym = fy*fy, byp = (1-fy)*(1-fy);
 const bzm = fz*fz, bzp = (1-fz)*(1-fz);
 const cft = contFrac * 255;
 for (let k = -1; k <= 1; k++){
  const b2k = k < 0 ? bzm : (k > 0 ? bzp : 0);
  if (b2k >= 1) continue;
  const zb = k - fz, zh = (iz+k)*2147483647;
  for (let j = -1; j <= 1; j++){
   const b2j = b2k + (j < 0 ? bym : (j > 0 ? byp : 0));
   if (b2j >= 1) continue;
   const yb = j - fy, yh = zh + (iy+j)*668265263;
   for (let i = -1; i <= 1; i++){
  if (b2j + (i < 0 ? bxm : (i > 0 ? bxp : 0)) >= 1) continue;
  let h = yh + (ix+i)*374761393;
  h = (h ^ (h>>>13)) * 1274126177; h = (h ^ (h>>>16)) >>> 0;
  // site position RELATIVE to the sample; only differences are ever used
  const ax = (i - fx) + (h & 255)*FLD_B;
  const ay = yb + ((h>>>8) & 255)*FLD_B;
  const az = zb + ((h>>>16) & 255)*FLD_B;
  const dd = ax*ax + ay*ay + az*az;
  /* Soft continentality: an inverse-distance-weighted vote over EVERY nearby
   * plate, with compact support at d = 1 (no site outside the 3x3x3 stencil can
   * ever be closer than that, so the sum is not truncated). Unlike "take the
   * nearest plate's flag" this has no identity switch at all, so it is C0
   * across boundaries AND across triple junctions. */
  let t = 1 - dd;
  if (t > 0){
   t *= t; t *= t; t *= t;                                   // (1-d^2)^8
   wsum += t;
   if (((h>>>4) & 255) < cft) csum += t;
  }
  if (dd < d1){ d3=d2; d2=d1; h2=h1; s2x=s1x; s2y=s1y; s2z=s1z;
                d1=dd; h1=h;  s1x=ax;  s1y=ay;  s1z=az; }
  else if (dd < d2){ d3=d2; d2=dd; h2=h; s2x=ax; s2y=ay; s2z=az; }
  else if (dd < d3){ d3=dd; }
 }}}
 fldPO[0]=d1<1?Math.sqrt(d1):1; fldPO[1]=d2<1?Math.sqrt(d2):1;
 fldPO[11]=d3<1?Math.sqrt(d3):1;
 fldPO[2]=h1; fldPO[3]=h2;
 fldPO[4]=s1x; fldPO[5]=s1y; fldPO[6]=s1z; fldPO[7]=s2x; fldPO[8]=s2y; fldPO[9]=s2z;
 fldPO[10]=csum/wsum;
}

/* ---------------------------------------------------------------------------
 * CRATERS — superposition (not nearest-only, so overlapping craters read as
 * overlapping craters) of a jittered lattice of impacts.
 *
 * Profile, in units of the crater's own diameter D:
 *   flat/gently-domed floor  ->  steep wall  ->  rim crest  ->  ejecta blanket
 * Depth follows the real lunar scaling: d = min(0.2*D, 1.044*D_km^0.301 km),
 * i.e. simple craters are 1:5 depth-to-diameter and complex ones flatten out
 * (a 200 km basin is ~5 km deep, not 40 km). Rim crest sits at +0.22*depth
 * above the datum, floor at -0.78*depth. Ejecta decays as (1-e)^3 out to
 * 1.5 crater radii and is EXACTLY zero beyond, which is what lets the cell loop
 * skip most of the 27 neighbours: centres are jittered into the middle half of
 * each cell, so a neighbour's centre is never nearer than 0.25 and the reach is
 * 1.5*rcMax = 1.5*0.40 = 0.60 cells. A neighbour can therefore only contribute
 * while fx < 0.60-0.25 = 0.35, which is exactly the threshold used below — at
 * fx = 0.35 the dropped term is rim*q^3 with q = 0, i.e. identically zero.
 * The rcMax = 0.40 that makes this exact is enforced in fldPrep; see the note
 * there before changing either number.
 * ------------------------------------------------------------------------ */
function fldCraters(X, Y, Z, C, k){
 const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
 const fx = X-ix, fy = Y-iy, fz = Z-iz;
 const i0 = fx <= 0.35 ? -1 : 0, i1 = fx >= 0.65 ? 1 : 0;
 const j0 = fy <= 0.35 ? -1 : 0, j1 = fy >= 0.65 ? 1 : 0;
 const k0 = fz <= 0.35 ? -1 : 0, k1 = fz >= 0.65 ? 1 : 0;
 const base = k*16, dens = C.crDens, P = C.crP;
 let acc = 0;
 for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++){
  let h = (ix+ii)*374761393 + (iy+jj)*668265263 + (iz+kk)*2147483647;
  h = (h ^ (h>>>13)) * 1274126177; h = (h ^ (h>>>16)) >>> 0;
  if ((h>>>24)*FLD_B >= dens) continue;              // no impact in this cell
  /* All five profile parameters for this crater size live in ONE stride-5 run
   * of C.crP, so a cell touches a single cache line instead of five arrays. */
  const si = (base + ((h>>>20) & 15)) * 5;
  const rc = P[si];
  const g = (h * 2654435761) >>> 0;                  // decorrelated jitter
  const ax = X - (ix+ii + 0.25 + (g & 255)*FLD_B*0.5);
  const ay = Y - (iy+jj + 0.25 + ((g>>>8) & 255)*FLD_B*0.5);
  const az = Z - (iz+kk + 0.25 + ((g>>>16) & 255)*FLD_B*0.5);
  const dd = ax*ax + ay*ay + az*az;
  const rmax = rc*1.5;
  if (dd >= rmax*rmax) continue;                     // exact zero outside
  const u = Math.sqrt(dd) / rc;
  const dep = P[si+1], rim = P[si+2], brk = P[si+3];
  let f;
  if (u < brk){ const t = u/brk; f = -dep*(1 - 0.22*t*t); }
  else if (u < 1){ const t = (u-brk)/(1-brk); const sm = t*t*(3-2*t);
                   f = -dep*0.78 + (dep*0.78 + rim)*sm; }
  else { const e = (u-1)*2, q = 1-e; f = rim*q*q*q; }
  const pk = P[si+4];
  if (pk > 0 && u < 0.30){ const b = 1 - (u*3.3333333333333335)*(u*3.3333333333333333); f += pk*b*b; }
  // degradation: older craters are shallower and softer
  acc += f * (0.42 + 0.58*(((h>>>12) & 255)*FLD_B));
 }
 return acc;
}

/* VOLCANIC SHIELDS — same lattice trick, convex-flank cone with a summit
 * caldera. Hawaii/Olympus-Mons profile: gentle, wide, flat-topped. */
function fldShields(X, Y, Z, C){
 const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
 const fx = X-ix, fy = Y-iy, fz = Z-iz;
 const i0 = fx <= 0.21 ? -1 : 0, i1 = fx >= 0.79 ? 1 : 0;
 const j0 = fy <= 0.21 ? -1 : 0, j1 = fy >= 0.79 ? 1 : 0;
 const k0 = fz <= 0.21 ? -1 : 0, k1 = fz >= 0.79 ? 1 : 0;
 let acc = 0;
 for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++){
  let h = (ix+ii)*374761393 + (iy+jj)*668265263 + (iz+kk)*2147483647;
  h = (h ^ (h>>>13)) * 1274126177; h = (h ^ (h>>>16)) >>> 0;
  if ((h>>>24)*FLD_B >= C.svDens) continue;
  const rc = 0.20 + 0.26*(((h>>>20) & 15)*0.06666666666666667);
  const g = (h * 2654435761) >>> 0;
  const ax = X - (ix+ii + 0.25 + (g & 255)*FLD_B*0.5);
  const ay = Y - (iy+jj + 0.25 + ((g>>>8) & 255)*FLD_B*0.5);
  const az = Z - (iz+kk + 0.25 + ((g>>>16) & 255)*FLD_B*0.5);
  const dd = ax*ax + ay*ay + az*az;
  if (dd >= rc*rc) continue;
  const u = Math.sqrt(dd)/rc, q = 1-u;
  const H = C.svH * (0.45 + 0.55*(((h>>>12) & 255)*FLD_B));
  // flanks ~ q^2 with a slightly convex shoulder, then subtract the caldera
  acc += H*q*q*(0.55 + 0.45*q);
  if (u < 0.16){ const b = 1 - (u*6.25)*(u*6.25); acc -= H*0.34*b*b; }
 }
 return acc;
}

/* ---------------------------------------------------------------------------
 * fldPrep — per-DNA derived constants, cached on the dna object. Recomputed
 * only if one of the fields the world builder mutates after makeDNA() changed.
 * ------------------------------------------------------------------------ */
function fldPrep(d){
 const C = {};
 C.seed = d.seed; C.radius = d.radius; C.amp = d.amp; C.ridgeAmp = d.ridgeAmp; C.type = d.type;
 const R0 = (d.radius > 1) ? d.radius : 6.371e6;
 const A  = (d.amp > 0) ? d.amp : 4000;
 const RA = (d.ridgeAmp > 0) ? d.ridgeAmp : A;
 const ty = d.type | 0;
 let st = ((Math.floor(d.seed * 1000) * 2654435761) ^ 0x9e3779b9) | 0;
 const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) | 0;
                     return ((st >>> 8) & 0xffffff) / 16777216; };

 C.A = A; C.RA = RA; C.ty = ty;
 C.hasSea = (ty === 1 || ty === 6) ? 1 : 0;
 C.sea = d.seaLevel || 0;

 /* CACHE VALIDITY. The world builder mutates dna fields after makeDNA(), so the
  * guard in fieldHeight2 has to notice ALL of them, not just the obvious ones:
  * p5-world sets temp/humidity/vegetation on procedural planets WITHOUT touching
  * amp, and temp drives the polar-cap and linea constants. Every dna field
  * fldPrep reads is mirrored here and compared on entry — 15 numeric compares,
  * ~15 ns against a ~2000 ns call, in exchange for making a whole class of
  * stale-constant bugs impossible. */
 C.kFreq = d.freq; C.kWarp = d.warp; C.kSea = d.seaLevel;
 C.kCra = d.craters; C.kRiv = d.rivers; C.kDun = d.dunes; C.kIce = d.ice;
 C.kLav = d.lava; C.kVeg = d.vegetation; C.kTmp = d.temp;

 /* seed-decorrelated domain offsets */
 C.s1 = rnd()*211 + 3.7;  C.s2 = rnd()*211 + 57.1; C.s3 = rnd()*211 + 131.3;
 C.s4 = rnd()*211 + 17.9; C.s5 = rnd()*211 + 83.3; C.s6 = rnd()*211 + 149.7;
 C.s7 = rnd()*211 + 41.1; C.s8 = rnd()*211 + 97.7; C.s9 = rnd()*211 + 173.9;
 C.sBio = d.seed * 13.7;                    // matches biomeColor2's province field

 /* NOTE ON FREQUENCIES. Everything below that is applied to px/py/pz is a PLAIN
  * multiplier: px already carries the base frequency C.F, so "13" means 13x the
  * continent frequency, i.e. 13*C.F cycles per radian. Only warpF and the plate
  * / crater / province scales are applied to the raw direction and therefore
  * carry C.F (or an absolute value) themselves. */

 /* --- warp + continents --- */
 C.F     = (d.freq > 0 ? d.freq : 1.6);
 C.warpF = C.F * 2.05;
 C.warpA = (d.warp > 0 ? d.warp : 0.35) * 1.15;
 /* FINE-BAND WARP FRACTION.  The warp is a displacement in continent space, so
  * a band at k times the continent frequency sees k times the phase shift — and,
  * more importantly, k times the phase GRADIENT. With the full warp the local
  * frequency of every band above ~600 km wavelength is modulated by ~66%, which
  * stretches the fine detail into parallel flutes: the whole planet grows a
  * brushed-metal grain (visible as combing in lowlands, worst down-slope).
  * Rigid advection of the crust would be physical; this warp is not rigid, its
  * gradient is what does the damage. So the structural bands (continents,
  * plates) keep the full warp — that is what makes coastlines crinkly — and
  * every band above them is displaced by only this fraction of it, which drops
  * the frequency modulation to ~15%: enough that fine detail still flows around
  * the continents, little enough that it never combs. */
 C.warpQ = 0.22;
 // 6 octaves, Hurst ~0.65 (gain 0.55 at lacunarity 2.05) — the spectral slope
 // real topography actually has. cNorm is picked so sigma(cRaw) ~ 0.21, which
 // is what cBias/contAmp below are calibrated against.
 C.cNorm = 0.58;
 // land fraction: terrestrial ~1/3, ocean worlds nearly drowned, dry worlds all "land"
 C.cBias = (ty === 6) ? -0.30 + rnd()*0.08
         : (ty === 1) ? -0.13 + (rnd()-0.5)*0.09
         : 0.08 + (rnd()-0.5)*0.18;

 /* --- plates ---
  * Plate tectonics needs a convecting mantle under a thin, wet, mobile
  * lithosphere: that is worlds with oceans. Venus and Mars are stagnant-lid
  * worlds and the Moon is a one-plate body — their relief comes from a crustal
  * dichotomy, volcanism and impacts, which is exactly what they get below.
  * Skipping the Voronoi there also buys back ~450 ns on those bodies. */
 C.plates  = (ty === 1 || ty === 6) ? 1 : 0;
 C.plateF  = 1.05 + rnd()*0.45;             // ~14..22 plates over the sphere
 C.plateW  = 0.9;                           // how much of the warp bends boundaries
 /* u = 1 is about 250 km from the boundary on an Earth-sized world; every
  * cross-section width below is quoted in that unit. Calibrated so convergent
  * belts cover ~6% of the surface, which is what Earth's do. */
 C.beltInv = 1 / 0.030;
 C.contAmp = 0.55;                          // plate-scale bias injected into c
 C.contFrac = (ty === 6) ? 0.22 : 0.38;     // fraction of plates that are continental
 C.convK   = 1.45;
 /* stagnant-lid substitute: fold belts / scarps track the steep flanks of the
  * crustal field, which we already have the analytic gradient of (free). */
 C.gbT = 2.0; C.gbK = 0.60;
 C.gbA = C.plates ? 0 : Math.min(RA*0.55, A*0.9);

 /* --- orogenic ridge texture (the only _oct-dependent shape term) --- */
 C.rgF   = 28.0;
 C.rgA   = Math.min(RA * 0.80, A * 1.00);   // capped -> LOD bound stays a fraction of amp
 C.rgNorm = 0.5;                            // 1/(1-gain), gain = 0.5
 C.rgMid = 0.30;                            // centre the ridged field around 0

 /* --- rivers / drainage --- */
 const wet = C.hasSea ? 1 : 0.40;
 C.rivers  = clamp(d.rivers || 0, 0, 1) * wet;
 C.rivF    = 22.0;                          // trunk spacing ~ 140 km on an Earth
 C.rivWarp = 0.35;                          // domain shear along grad(c): channels run downhill
 C.rivW    = 0.085;
 C.rivD    = A * 0.16 * C.rivers;

 /* --- mesas / terraces / canyons --- */
 const arid = (ty === 2) ? 1.0 : (ty === 0) ? 0.65 : (ty === 3) ? 0.30
            : (ty === 4) ? 0.55 : sat(0.55 - (d.vegetation || 0)*0.5);
 C.terr  = arid;
 C.terrS = A * 0.115;                       // bench height

 /* --- craters --- */
 const cr = clamp(d.craters || 0, 0, 1);
 C.crN = cr > 0.05 ? (cr > 0.55 ? 4 : 3) : 0;
 C.crDens = sat(cr * 1.25);
 C.crS = new Float64Array(4); C.crOx = new Float64Array(4);
 /* interleaved [rc, dep, rim, brk, pk] x 64 sizes — see fldCraters */
 C.crP = new Float64Array(64*5);
 let cs = 1.9;
 for (let k = 0; k < 4; k++){
  C.crS[k] = cs; C.crOx[k] = rnd()*97 + k*53.7;
  const cellM = R0 / cs;
  for (let i = 0; i < 16; i++){
   /* CELL-SCAN INVARIANT — do not raise 0.40 without moving the thresholds in
    * fldCraters. Centres are jittered into the middle half of a cell, so the
    * closest a neighbouring cell's centre can sit to this cell is 0.25. The
    * ejecta blanket reaches 1.5*rc, so a neighbour can only ever contribute
    * while fx < 1.5*rcMax - 0.25. fldCraters scans the -1 cell for fx <= 0.35,
    * which is exact iff 1.5*rcMax <= 0.60, i.e. rcMax <= 0.40.
    * (This was 0.46, giving a reach of 0.69 against a bound of 0.60: craters up
    * to ~840 km across were being dropped from the scan mid-blanket, a real C0
    * tear of up to 103 m on Luna. Measured 0.0000 m after this change.) */
   const rc = 0.16 + 0.24*(i/15);
   const Dm = 2*rc*cellM;                                  // crater diameter, metres
   const dep = Math.min(0.2*Dm, 130.8*Math.pow(Dm, 0.301)); // lunar depth scaling
   const si = (k*16 + i) * 5;
   C.crP[si]   = rc;
   C.crP[si+1] = dep*0.78; C.crP[si+2] = dep*0.22;
   C.crP[si+3] = Dm > 2.0e4 ? 0.55 : 0.18;                 // complex craters: flat floor
   C.crP[si+4] = Dm > 3.0e4 ? dep*0.30 : 0;                // and a central peak
  }
  cs *= 3.0;
 }

 /* --- mare / flood basalt --- */
 C.mare = (cr > 0.30 ? 0.85 : 0) + (d.lava > 0.2 ? 0.7 : 0);
 if (C.mare > 1) C.mare = 1;
 C.mareLvl = -0.14 * A;

 /* --- volcanism --- */
 const lv = clamp(d.lava || 0, 0, 1);
 C.lava  = lv;
 C.svS   = 7.5 + rnd()*3.0;
 C.svDens = sat(lv*0.85);
 C.svH   = Math.min(A*1.5, RA*1.1) * sat(lv*1.3);
 C.svOx  = rnd()*77 + 11.3;
 C.lvF   = 55.0;                            // sinuous rilles, ~70 km apart
 C.lvW   = 0.10;
 C.lvD   = A * 0.10 * lv;

 /* --- dunes: linear (seif) ergs run WITH the resultant wind, i.e. along the
    zonal circulation, so the corrugation is a function of |latitude| — which is
    a globally smooth coordinate, unlike longitude. Wavelength ~ 11 km so the
    finest quadtree level can actually resolve it. --- */
 const du = clamp(d.dunes || 0, 0, 1);
 C.dunes = du > 0.18 ? du : 0;
 C.dnK   = R0 / 11000;                      // phase = y*dnK  ->  ~11 km crests
 C.dnWob = 1.7;                             // ridges meander instead of ruling the globe
 C.dnF   = 10.0;
 C.dnH   = Math.min(240, A*0.06) * 1.0;

 /* --- polar caps --- */
 const ic = clamp(d.ice || 0, 0, 1);
 const cold = sat((262 - (d.temp || 260)) / 90);            // 0 warm, 1 frozen solid
 C.iceH = ic > 0.05 ? Math.min(2800*ic, A*0.42 + 700) : 0;
 C.capA = mix(0.86, 0.02, cold*ic);
 C.capB = mix(0.99, 0.30, cold*ic);
 if (C.capB <= C.capA + 0.02) C.capB = C.capA + 0.02;
 /* GLOBAL GLACIATION. `cap` is used twice: as the ice dome's profile and as the
  * roughness damper. On a body that is frozen solid (Europa, Enceladus, Triton,
  * Pluto — cold*ic -> 1) the latitude ramp above bottoms out at ~1 deg, which
  * does NOT mean "ice everywhere": it leaves a ~17 deg equatorial band outside
  * the cap, carrying full roughness while the rest of the globe is damped. That
  * showed up as a hard bright stripe around the equator on every ice moon.
  * A world that cold has a shell over the whole sphere, so blend the cap toward
  * a global 1 as it freezes. Continuity is unaffected: capA >= 0.02 always, so
  * smoothstep(capA,capB,|dy|) is identically 0 (flat, zero slope) through the
  * equator for any gi < 1, and identically 1 when gi == 1. */
 C.capG = sat((cold*ic - 0.72) * 3.6);

 /* --- ice-shell linea / crevasse networks (Europa-style double ridges) --- */
 C.crack = (ty === 3 ? 1.0 : 0.30) * ic * cold;
 C.crF   = 38.0;
 C.crW   = 0.07;
 C.crH   = Math.min(A*0.35, 900) * C.crack;

 /* --- _oct-gated roughness tail: 3 bands continuing the continent ladder past
    its last structural octave — ~74 / 26 / 9.5 km wavelengths on an Earth. --- */
 C.detF = 40.0;
 C.det0 = A * 0.045;

 d._fldc = C;
 return C;
}

/* ===========================================================================
 * fieldHeight2 — metres of elevation above the datum for a unit direction.
 * ========================================================================= */
function fieldHeight2(x, y, z, d){
 let C = d._fldc;
 if (C === undefined || C.seed !== d.seed || C.radius !== d.radius ||
     C.amp !== d.amp || C.ridgeAmp !== d.ridgeAmp || C.type !== d.type ||
     C.kFreq !== d.freq || C.kWarp !== d.warp || C.kSea !== d.seaLevel ||
     C.kCra !== d.craters || C.kRiv !== d.rivers || C.kDun !== d.dunes ||
     C.kIce !== d.ice || C.kLav !== d.lava || C.kVeg !== d.vegetation ||
     C.kTmp !== d.temp) C = fldPrep(d);

 let oct = d._oct | 0; if (!oct) oct = d.octaves | 0; if (!oct) oct = 9;
 if (oct < 2) oct = 2; else if (oct > 12) oct = 12;

 const A = C.A, RA = C.RA, F = C.F;

 /* ---- gas giants have no surface: keep the mesh spherical ---- */
 if (C.ty === 5){
  return (fldNoiseF(x*2.0 + C.s1, y*13.0, z*2.0)*0.7 +
          fldNoiseF(x*5.3, y*31.0 + C.s2, z*5.3)*0.3) * A * 0.02;
 }

 /* ================= 1. DOMAIN WARP (fixed, _oct independent) =============
  * Three independent value-noise channels displace the sampling position. This
  * is what turns concentric noise blobs into peninsulas, bays, gulfs and swept
  * fold belts. (A one-tap DERIVATIVE warp was tried here and rejected: a warp
  * that is the gradient of a scalar is curl-free, and combing an fBm along its
  * own flow lines gives the whole planet a brushed-metal grain.) */
 const wf = C.warpF, wa = C.warpA;
 const wx = fldNoiseF(x*wf + C.s1, y*wf, z*wf) * wa;
 const wy = fldNoiseF(x*wf, y*wf + C.s2, z*wf) * wa;
 const wz = fldNoiseF(x*wf, y*wf, z*wf + C.s3) * wa;
 const px = x*F + wx, py = y*F + wy, pz = z*F + wz;
 /* Reduced-warp coordinate for every band above the continent/plate structure.
  * Same field, same registration, 1/5th of the phase gradient — see C.warpQ. */
 const qw = C.warpQ;
 const qx = x*F + wx*qw, qy = y*F + wy*qw, qz = z*F + wz*qw;

 /* province field — deliberately the SAME low-frequency noise biomeColor2 reads
  * for its albedo provinces, so mare basalt is both dark and low, and the mesa
  * country and the oxide streaks are the same country. One tap, four jobs. */
 const PR = fldNoise(x*1.55 + C.sBio, y*1.55 + 13.3, z*1.55 - 5.1);

 /* ================= 2. CONTINENTS (FIXED 5 octaves) ======================
  * Fixed normalisation + fixed octave count => bit-identical at every _oct.
  * The leading 3 octaves also hand back an analytic gradient, which becomes
  * the regional downhill direction used to orient the drainage network. */
 const cRaw = fldFbm(px, py, pz, 6, 3, 2.05, 0.55) * C.cNorm;
 const ggx = fldGx, ggy = fldGy, ggz = fldGz;

 /* ================= 3. PLATE TECTONICS ===================================
  * Jittered Voronoi = plates. Each plate carries an Euler pole (hash bits) so
  * its surface velocity is omega x r, a smooth field. Convergence across a
  * boundary is dot(v1-v2, n12), which is invariant when 1 and 2 swap — that is
  * exactly what happens when you cross the boundary, so the belt is single
  * valued. Plate A is canonically the one with the larger hash, giving a SIGNED
  * across-strike coordinate u so an arc can sit on one side and a trench on the
  * other without a seam down the middle. */
 let oro = 0, beltEnv = 0, pcont = 0.5;
 if (C.plates){
  const PF = C.plateF, pw = C.plateW;
  fldPlate(x*PF + wx*pw, y*PF + wy*pw, z*PF + wz*pw, C.contFrac);
  const d1 = fldPO[0], d2 = fldPO[1];
  const h1 = fldPO[2], h2 = fldPO[3];
  const aIs1 = h1 > h2;
  const hA = aIs1 ? h1 : h2, hB = aIs1 ? h2 : h1;
  const sgn = aIs1 ? 1 : -1;
  const edge = d2 - d1;                          // 0 on the boundary, grows inward
  const u = sgn * edge * C.beltInv;              // signed across-strike coordinate

  const cfA = ((hA>>>4) & 255)*FLD_B < C.contFrac ? 1 : 0;
  const cfB = ((hB>>>4) & 255)*FLD_B < C.contFrac ? 1 : 0;

  /* surface velocity of each plate at this point, v = omega x r */
  const p1x = ((h1>>>2)&255)*FLD_B - 0.5, p1y = ((h1>>>10)&255)*FLD_B - 0.5,
        p1z = ((h1>>>18)&255)*FLD_B - 0.5;
  const p2x = ((h2>>>2)&255)*FLD_B - 0.5, p2y = ((h2>>>10)&255)*FLD_B - 0.5,
        p2z = ((h2>>>18)&255)*FLD_B - 0.5;
  const rvx = (p1y*z - p1z*y) - (p2y*z - p2z*y);
  const rvy = (p1z*x - p1x*z) - (p2z*x - p2x*z);
  const rvz = (p1x*y - p1y*x) - (p2x*y - p2y*x);
  let nx = fldPO[7]-fldPO[4], ny = fldPO[8]-fldPO[5], nz = fldPO[9]-fldPO[6];
  const nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  const conv = (rvx*nx + rvy*ny + rvz*nz) * C.convK;
  // most real boundaries are transform or only weakly convergent; bias the
  // response so only the genuinely converging ones grow a cordillera
  const convP = sat(conv*1.7 - 0.30), divP = sat(-conv*1.7 - 0.20);

  const cf = (cfA + cfB) * 0.5;                  // 1 = continent/continent
  const uc = (cfA >= cfB) ? u : -u;              // uc > 0 = the continental side

  /* convergent margins */
  const plateau = fldBump(u * 0.24) * cf * cf;                   // Tibet, ~1000 km
  const cord    = fldBump((uc - 0.55) * 0.80);                   // Andes / Cascades
  const trench  = fldBump((uc + 0.55) * 1.60) * (1 - cf);        // Mariana
  /* divergent margins */
  const mor     = fldBump(u * 0.28) * (1 - cf);                  // mid-ocean ridge swell
  const axial   = fldBump(u * 2.60) * (1 - cf);                  // its axial rift valley
  const rift    = fldBump(u * 1.40) * cf;                        // East African rift
  const shoul   = (fldBump((u - 0.85)*1.40) + fldBump((u + 0.85)*1.40)) * cf;

  /* Triple-junction fade. Which plate is "the second nearest" is ambiguous
   * where d2 == d3, and every term above depends on that identity. Multiplying
   * the whole belt by a factor that vanishes exactly on the d2 == d3 locus makes
   * the ambiguity unobservable: the jump is multiplied by zero. Real triple
   * junctions are structurally messy gaps in the belt anyway. */
  const jf = smoothstep(0, 0.06, fldPO[11] - d2);

  oro = (convP * (0.74*plateau + 0.68*cord*(1 - cf*0.30) - 0.60*trench)
       + divP  * (0.40*mor - 0.13*axial - 0.40*rift + 0.15*shoul)) * jf;
  beltEnv = sat((oro < 0 ? -oro : oro) * 2.2);

  /* continentality bias: continents genuinely ride on continental plates. The
   * contrast curve sharpens the soft vote into a real craton with a finite
   * passive margin instead of a 1000 km ramp. */
  pcont = smoothstep(0.26, 0.74, fldPO[10]);
 } else if (C.gbA > 0){
  /* Stagnant-lid world: no plate boundaries, so fold belts and scarps follow
   * the steep flanks of the crustal thickness field. |grad(c)| is already in
   * hand from the fBm, so this costs nothing. */
  const gm = Math.sqrt(ggx*ggx + ggy*ggy + ggz*ggz) * C.cNorm;
  beltEnv = sat((gm - C.gbT) * C.gbK);
  oro = beltEnv * 0.55;
 }

 /* ================= 4. HYPSOMETRY =========================================
  * Earth's hypsometric curve is bimodal — abyssal plain near -4 km, land near
  * +0.3 km, joined by a narrow continental slope and a very flat shelf. A plain
  * fBm is unimodal, so it is pushed through this transfer instead of being used
  * as elevation directly. The steep segment around c=0 is what makes coastlines
  * crinkly: a tiny change in c becomes a large change in height. */
 const cc = cRaw + (pcont - 0.5)*C.contAmp + C.cBias;
 let h;
 if (C.hasSea){
  let e = -0.70;                                            // abyssal plain
  e += (-0.022 - e) * smoothstep(-0.62, -0.10, cc);         // continental slope -> shelf
  e += (0.0    - e) * smoothstep(-0.105, -0.004, cc);       // shelf break -> shoreline
  e += (0.34   - e) * smoothstep(-0.004, 0.60, cc);         // coastal plain -> interior
  h = e * A;
 } else {
  h = A * (cc*0.85 + 0.35*cc*cc*cc);
 }

 /* ================= 5. OROGENIC MASS ====================================== */
 h += oro * (C.plates ? RA : C.gbA);

 /* ================= 6. IMPACT CRATERS ===================================== */
 for (let k = 0; k < C.crN; k++){
  const cs = C.crS[k], ox = C.crOx[k];
  h += fldCraters(x*cs + ox, y*cs + ox*0.37, z*cs - ox*0.61, C, k);
 }

 /* ================= 7. MARE / FLOOD BASALT ================================
  * Runs AFTER craters, because that is the order it happened: basin first,
  * then the lava that ponded in it. Uses the same province field biomeColor2
  * reads, so the dark ground and the flat low ground are the same ground. */
 if (C.mare > 0){
  const m = sat((-PR - 0.02) * 2.2) * C.mare;
  const lvl = C.mareLvl;
  if (h < lvl) h += (lvl - h) * m * 0.92;                   // flooding: fill, never cut
 }

 /* ================= 8. VOLCANIC SHIELDS + LAVA CHANNELS =================== */
 if (C.lava > 0.05){
  const vs = C.svS, ox = C.svOx;
  h += fldShields(x*vs + ox, y*vs + ox*0.41, z*vs - ox*0.29, C);
  let n = fldNoiseF(qx*C.lvF + C.s9, qy*C.lvF, qz*C.lvF); if (n < 0) n = -n;
  h -= (1 - smoothstep(0, C.lvW, n)) * C.lvD;               // sinuous rilles
 }

 /* ================= 9. DRAINAGE NETWORKS ==================================
  * The channel network is the zero set of |noise|, which on a 2-sphere is a set
  * of curves — a network, not blobs. The trick that makes it read as DRAINAGE
  * rather than as random cracks is shearing the noise domain along grad(c):
  * the network is stretched in the direction of regional slope, so channels run
  * downhill and merge into the same basins the continent field already has.
  * Carving is clamped so a river can never cut below its own base level. */
 const landM = C.hasSea ? sat((h - C.sea) / (0.05*A)) : 1;
 if (C.rivers > 0.02){
  const rf = C.rivF, rw = C.rivWarp;
  const kx = qx*rf + ggx*rw + C.s4, ky = qy*rf + ggy*rw, kz = qz*rf + ggz*rw;
  /* A ridged MULTIFRACTAL, not |noise|: the w-feedback means octave k only has
   * amplitude where octave k-1 already had a sheet, so the fine channels hang
   * off the coarse ones instead of running parallel to them. That hierarchical
   * gating is what makes it read as a dendritic drainage network with trunks
   * and tributaries rather than as a comb of unrelated cracks. */
  const rg = fldRidge(kx, ky, kz, 3, 2.6, 0.58) * 0.42;   // ~0..1
  const trunk = sat((rg - 0.60) * 4.0);                   // incised channel
  const vall  = sat((rg - 0.26) * 1.7);                   // the valley it sits in
  let cut = (trunk*0.62 + vall*0.30) * C.rivD * landM;
  if (C.hasSea){ const lim = (h - C.sea)*0.85; if (cut > lim) cut = lim > 0 ? lim : 0; }
  h -= cut;
 }

 /* ================= 10. MESAS, BENCHES, CANYON TERRACING ==================
  * Quantising elevation to a bench height with a soft riser gives flat-topped
  * mesas separated by cliffs — the layered-sediment look. Because it is applied
  * only to the structural height, its ~2.5x derivative amplification can never
  * act on the _oct-dependent tail. */
 if (C.terr > 0.03){
  const tm = sat(PR*1.7 + 0.30) * C.terr * 0.62;
  const S = C.terrS, q = h / S, qi = Math.floor(q);
  h += ((qi + smoothstep(0.30, 0.70, q - qi))*S - h) * tm;
 }

 /* ================= 11. DUNE FIELDS ======================================= */
 if (C.dunes > 0){
  const df = C.dnF;
  const dn = fldNoiseF(qx*df + C.s6, qy*df, qz*df);
  const ph = y*C.dnK + dn*C.dnWob;
  const t = ph - Math.floor(ph);
  // asymmetric cross-section: long windward stoss slope, short slip face
  const prof = t < 0.75 ? (t*1.3333333333333333)*(t*1.3333333333333333) : (1-t)*4;
  const erg = sat(0.42 + PR*1.35) * C.dunes * landM *
              sat(1 - (h < 0 ? -h : h)/(0.34*A));
  h += prof * C.dnH * erg;
 }

 /* ================= 12. POLAR CAPS AND ICE-SHELL LINEA ====================
  * cap is a smoothstep of |dy| that is identically 0 through the equator, so
  * the |dy| kink never reaches the output. cp = 1-(1-cap)^2 gives the concave
  * ice-sheet dome profile with zero slope at the margin. */
 const lat = y < 0 ? -y : y;
 let cap = smoothstep(C.capA, C.capB, lat);
 if (C.capG > 0) cap += (1 - cap) * C.capG;      // frozen solid -> shell is global
 if (C.iceH > 0){
  // grounded ice only: a cap over deep water is a floating shelf and adds no
  // elevation, so fade the dome out as the bed drops away
  const q = 1 - cap * sat(1 + h/(0.35*A));
  h += (1 - q*q) * C.iceH;
 }
 if (C.crH > 0){
  const cf2 = C.crF;
  let n = fldNoiseF(qx*cf2 + C.s7, qy*cf2, qz*cf2); if (n < 0) n = -n;
  const core = 1 - smoothstep(0, C.crW, n);
  const flank = (1 - smoothstep(C.crW, C.crW*3.2, n)) - core;
  h += (flank*0.95 - core*0.75) * C.crH;       // double ridge with a medial trough
 }

 /* ================= 13. _OCT-GATED ROUGHNESS TAIL =========================
  * Everything above is identical at every _oct. Everything below is additive
  * and geometrically decaying, which is the whole LOD guarantee. */
 if (beltEnv > 0){                              // exact zero outside every belt
  const nR = 2 + (oct > 6 ? (oct > 7 ? 2 : 1) : 0);
  const rf = C.rgF;
  h += (fldRidge(qx*rf + C.s4, qy*rf, qz*rf, nR, 2.4, 0.5)*C.rgNorm - C.rgMid)
       * C.rgA * beltEnv;
 }
 const rough = (C.hasSea ? mix(0.55, 1.0, landM) : 1.0) * (1 - cap*0.55);
 let da = C.det0, f = C.detF, off = C.s8;
 for (let i = 6; i <= 8; i++){
  if (oct < i) break;
  h += fldNoiseF(qx*f + off, qy*f, qz*f) * da * rough;
  da *= 0.58; f *= 2.8; off += 31.7;
 }

 return h;
}

/* ===========================================================================
 * fldSelfTest
 * ========================================================================= */
const FLD_LODFRAC = 0.32;     // asserted |h(_oct=4) - h(_oct=9)| bound, x d.amp

function fldSelfTest(){
 try{
  if (typeof makeDNA !== 'function') return {ok:false, why:'makeDNA missing'};
  const now = (typeof performance !== 'undefined' && performance.now)
              ? () => performance.now() : () => Date.now();

  /* worlds under test: every archetype plus the tuned solar-system bodies */
  const W = [];
  for (let t = 0; t < 7; t++){
   const dd = makeDNA(t*5.3 + 1.7, t, t === 5 ? 7e7 : 4.2e6);
   W.push(dd);
  }
  const earth = makeDNA(42, 1, 6.371e6);
  earth.vegetation=0.9; earth.rivers=0.85; earth.humidity=0.7; earth.temp=288;
  earth.amp=6200; earth.ridgeAmp=7400; earth.craters=0.02; earth.ice=0.5;
  W.push(earth);
  const luna = makeDNA(88, 0, 1.7374e6);
  luna.craters=1; luna.amp=2400; luna.ridgeAmp=3200; luna.rivers=0; luna.temp=250;
  W.push(luna);
  const mars = makeDNA(17, 2, 3.3895e6);
  mars.dunes=0.9; mars.craters=0.55; mars.amp=9000; mars.ridgeAmp=9500;
  mars.ice=0.35; mars.temp=210; mars.rivers=0.25;
  W.push(mars);
  const eur = makeDNA(33, 3, 1.5608e6);
  eur.ice=1; eur.amp=600; eur.ridgeAmp=400; eur.craters=0.15; eur.temp=102;
  W.push(eur);
  const titan = makeDNA(39, 6, 2.5747e6);
  titan.temp=94; titan.rivers=0.9; titan.amp=900; titan.ridgeAmp=700; titan.dunes=0.8;
  W.push(titan);
  const io = makeDNA(31, 4, 1.8216e6);
  io.lava=1; io.craters=0.05; io.amp=3000; io.temp=130;
  W.push(io);

  /* deterministic PRNG shared by the sampling sections below */
  let rs = 123456789;
  const rr = () => { rs = (Math.imul(rs, 1664525) + 1013904223) | 0;
                     return ((rs >>> 8) & 0xffffff) / 16777216; };

  /* ---- 1. DETERMINISM + BOUNDEDNESS -------------------------------------- */
  let maxAbs = 0;
  for (const dd of W){
   const lim = (dd.amp + dd.ridgeAmp) * 14 + 2e5;
   for (let i = 0; i < 400; i++){
    const a = i*0.617, b = Math.sin(i*1.31)*1.5;
    const cb = Math.cos(b);
    const ux = Math.cos(a)*cb, uy = Math.sin(b), uz = Math.sin(a)*cb;
    const l = Math.hypot(ux, uy, uz) || 1;
    const X = ux/l, Y = uy/l, Z = uz/l;
    dd._oct = 4 + (i % 6);
    const h0 = fieldHeight2(X, Y, Z, dd);
    const h1 = fieldHeight2(X, Y, Z, dd);
    if (h0 !== h1) return {ok:false, why:'non-deterministic on type '+dd.type+' ('+h0+' vs '+h1+')'};
    if (!isFinite(h0)) return {ok:false, why:'non-finite height on type '+dd.type+' at oct '+dd._oct};
    const ab = h0 < 0 ? -h0 : h0;
    if (ab > lim) return {ok:false, why:'unbounded height '+h0.toFixed(0)+' m on type '+dd.type+
                                        ' (limit '+lim.toFixed(0)+')'};
    if (ab > maxAbs) maxAbs = ab;
   }
   dd._oct = dd.octaves;
  }
  /* poles and the equator explicitly — |dy| is the one non-smooth input */
  for (const dd of W){
   dd._oct = 9;
   for (const P of [[0,1,0],[0,-1,0],[1,0,0],[0,0,1],[0,1e-9,1]]){
    const l = Math.hypot(P[0],P[1],P[2]);
    const v = fieldHeight2(P[0]/l, P[1]/l, P[2]/l, dd);
    if (!isFinite(v)) return {ok:false, why:'non-finite at pole/axis on type '+dd.type};
   }
  }

  /* ---- 2. CONTINUITY along dense great-circle arcs ----------------------- */
  /* A 240 km arc at 4000 samples => 60 m between samples. Anything beyond a
     ~4:1 slope over that distance (or 2.5% of the world's relief, whichever is
     larger) means the field tore. */
  let worstSlope = 0, worstWorld = '';
  for (const dd of W){
   if (dd.type === 5) continue;
   dd._oct = 9;
   const R = dd.radius;
   for (let arc = 0; arc < 4; arc++){
    // arc 3 deliberately runs over the north pole
    const ax = Math.cos(arc*1.7)*0.8, ay = arc === 3 ? 0.02 : Math.sin(arc*2.3)*0.9,
          az = Math.sin(arc*1.1)*0.7;
    let al = Math.hypot(ax, ay, az) || 1;
    let bx = ax/al, by = ay/al, bz = az/al;
    // an orthogonal direction to sweep along
    let tx = -bz, ty = 0, tz = bx;
    if (tx*tx + tz*tz < 1e-12){ tx = 1; ty = 0; tz = 0; }
    const tl = Math.hypot(tx, ty, tz); tx/=tl; ty/=tl; tz/=tl;
    if (arc === 3){ tx = 0; ty = 1; tz = 0;
      const dp = bx*tx + by*ty + bz*tz; tx -= dp*bx; ty -= dp*by; tz -= dp*bz;
      const l2 = Math.hypot(tx,ty,tz); tx/=l2; ty/=l2; tz/=l2; }
    const N = 4000, span = 240000 / R;                  // 240 km of arc
    const step = span / N, ds = step * R;               // metres between samples
    const bound = Math.max(ds*4, (dd.amp + dd.ridgeAmp)*0.025);
    let prev = 0;
    for (let i = 0; i <= N; i++){
     const th = -span*0.5 + i*step, ct = Math.cos(th), stt = Math.sin(th);
     const X = bx*ct + tx*stt, Y = by*ct + ty*stt, Z = bz*ct + tz*stt;
     const hh = fieldHeight2(X, Y, Z, dd);
     if (i > 0){
      const jump = Math.abs(hh - prev);
      if (jump > worstSlope){ worstSlope = jump; worstWorld = 'type'+dd.type; }
      if (jump > bound)
       return {ok:false, why:'discontinuity: '+jump.toFixed(1)+' m step over '+ds.toFixed(1)+
                             ' m on type '+dd.type+' arc '+arc+' (bound '+bound.toFixed(1)+' m)'};
     }
     prev = hh;
    }
   }
  }

  /* ---- 2b. LATTICE CELL-SCAN CONTINUITY ----------------------------------
   * The crater and shield loops skip neighbouring cells using a fixed threshold
   * on the cell-local coordinate. That is only legitimate while the skipped
   * cell's contribution is identically zero, which is a statement about the
   * jitter range, the max feature radius and the threshold TOGETHER — get any
   * one of the three wrong and you get a hard cliff along a lattice plane.
   *
   * Arc sampling does not reliably catch this: it needs the biggest feature
   * size AND a centre sitting on the near edge of its cell, so it hides at
   * ~1e-5 of directions. (It was real — a 103 m tear on Luna — until rcMax was
   * brought down to 0.40.) So probe the thresholds directly, straddling each
   * one by 1e-9 of a cell, where any surviving jump is a pure discontinuity. */
  {
   let worstCell = 0, worstCellW = '';
   for (const dd of W){
    if (dd.type === 5) continue;
    dd._oct = 9;
    fieldHeight2(1, 0, 0, dd);                    // make sure _fldc exists
    const C = dd._fldc;
    if (!C || !C.crN) continue;
    const E = 1e-9;
    for (let n = 0; n < 900; n++){
     const ix = (rr()*997)|0, iy = (rr()*997)|0, iz = (rr()*997)|0;
     const fy = rr(), fz = rr();
     for (let k = 0; k < C.crN; k++){
      for (let ti = 0; ti < 2; ti++){
       const thr = ti ? 0.65 : 0.35;
       const a = fldCraters(ix+thr-E, iy+fy, iz+fz, C, k);
       const b = fldCraters(ix+thr+E, iy+fy, iz+fz, C, k);
       const j = a > b ? a-b : b-a;
       if (j > worstCell){ worstCell = j; worstCellW = 'type'+dd.type; }
      }
     }
    }
    dd._oct = dd.octaves;
   }
   /* 1 cm: far below the 1e-9-cell probe offset times any plausible slope, and
    * ~4 orders of magnitude under the tear this is guarding against. */
   if (worstCell > 0.01)
    return {ok:false, why:'crater cell-scan discontinuity: '+worstCell.toFixed(4)+
                          ' m across a lattice threshold on '+worstCellW};
  }

  /* ---- 3. LOD STABILITY -------------------------------------------------- */
  let worstLod = 0, worstLodW = '', worstFrac = 0;
  for (const dd of W){
   if (dd.type === 5) continue;
   for (let i = 0; i < 500; i++){
    const u = rr()*2 - 1, ph = rr()*6.283185307179586;
    const s = Math.sqrt(Math.max(0, 1 - u*u));
    const X = s*Math.cos(ph), Y = u, Z = s*Math.sin(ph);
    dd._oct = 4; const h4 = fieldHeight2(X, Y, Z, dd);
    dd._oct = 9; const h9 = fieldHeight2(X, Y, Z, dd);
    const df = Math.abs(h4 - h9);
    const fr = df / dd.amp;
    if (fr > worstFrac){ worstFrac = fr; worstLod = df; worstLodW = 'type'+dd.type; }
   }
   dd._oct = dd.octaves;
  }
  if (worstFrac > FLD_LODFRAC)
   return {ok:false, why:'LOD instability: |h(4)-h(9)| = '+worstLod.toFixed(0)+' m = '+
                         worstFrac.toFixed(3)+' x amp on '+worstLodW+
                         ' (bound '+FLD_LODFRAC+')'};

  /* ---- 4. TIMING: 20000 calls at _oct = 9 --------------------------------
   * The sample directions are precomputed into arrays: four trig calls per
   * iteration inside the timed region cost ~0.15 us and would inflate the
   * reported figure by ~10%. The residual array-read + loop overhead is then
   * measured on its own and subtracted, so the number really is time in
   * fieldHeight2. Reported as the best of 3 runs — on a machine with other load
   * the mean measures the noise, not the function. */
  const NT = 20000;
  const DX = new Float64Array(NT), DY = new Float64Array(NT), DZ = new Float64Array(NT);
  for (let i = 0; i < NT; i++){
   const a = i*0.011, b = i*0.0071, cb = Math.cos(b);
   DX[i] = Math.cos(a)*cb; DY[i] = Math.sin(b); DZ[i] = Math.sin(a)*cb;
  }
  let sink = 0;
  const timeOne = (dd) => {
   dd._oct = 9;
   for (let i = 0; i < NT; i++) sink += fieldHeight2(DX[i], DY[i], DZ[i], dd);  // JIT warmup
   let best = Infinity;
   for (let r = 0; r < 3; r++){
    const t0 = now();
    for (let i = 0; i < NT; i++) sink += fieldHeight2(DX[i], DY[i], DZ[i], dd);
    const el = (now() - t0) * 1000 / NT;
    if (el < best) best = el;
   }
   return best;
  };
  // loop + array-read overhead, measured the same way and subtracted
  let ovh = Infinity;
  for (let i = 0; i < NT; i++) sink += DX[i] + DY[i] + DZ[i];
  for (let r = 0; r < 3; r++){
   const t0 = now();
   for (let i = 0; i < NT; i++) sink += DX[i] + DY[i] + DZ[i];
   const el = (now() - t0) * 1000 / NT;
   if (el < ovh) ovh = el;
  }
  let usEarth = timeOne(earth) - ovh; if (usEarth < 0) usEarth = 0;
  let usLuna  = timeOne(luna)  - ovh; if (usLuna  < 0) usLuna  = 0;
  if (!isFinite(sink)) return {ok:false, why:'timing loop produced a non-finite sum'};

  return {ok:true,
          usPerCall: +usEarth.toFixed(3),
          usPerCallCratered: +usLuna.toFixed(3),
          maxLodDeltaFracAmp: +worstFrac.toFixed(4),
          maxLodDeltaM: +worstLod.toFixed(0),
          worstLodWorld: worstLodW,
          maxAdjacentStepM: +worstSlope.toFixed(1),
          worstStepWorld: worstWorld,
          maxAbsHeightM: +maxAbs.toFixed(0)};
 } catch(e){
  return {ok:false, why:(e && (e.stack||e.message)) || String(e)};
 }
}
