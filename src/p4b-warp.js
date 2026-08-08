/* ============================================================================
   p4b-warp.js — WORMHOLE SET-PIECE + POST-PROCESSING CHAIN
   agent B2 · tags: wh (wormhole/tunnel) · post (post chain) · fx (shader helpers)

   Physics basis: Morris-Thorne traversable wormhole in the "DNEG" parametrisation
   of Kip Thorne / Double Negative, "Gravitational Lensing by Spinning Black Holes
   in Astrophysics, and in the movie Interstellar", Class. Quantum Grav. 32 065001
   (2015), eqs (5)-(9).  See src/docs/warp.md for the full derivation.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   SHARED GLSL — noise / blackbody / elliptic integral.
   Prepended (by string concat) into each of my fullscreen shaders so every
   GLSL_* string below compiles standalone after GLSL_COMMON.
   GLSL_COMMON already gives us: PI TAU sat() luma() raySphere() segLog() uLogFC
   — we deliberately do NOT lean on its hash*/vnoise3 signatures.
--------------------------------------------------------------------------- */
const WH_GLSL_LIB = `
float whH1(float n){ return fract(sin(n*127.1+0.371)*43758.5453123); }
float whH3(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123); }
float whVN(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=whH3(i),               b=whH3(i+vec3(1.0,0.0,0.0));
  float c=whH3(i+vec3(0.0,1.0,0.0)), d=whH3(i+vec3(1.0,1.0,0.0));
  float e=whH3(i+vec3(0.0,0.0,1.0)), g=whH3(i+vec3(1.0,0.0,1.0));
  float h=whH3(i+vec3(0.0,1.0,1.0)), k=whH3(i+vec3(1.0,1.0,1.0));
  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),
             mix(mix(e,g,f.x),mix(h,k,f.x),f.y),f.z)*2.0-1.0;
}
float whFbm(vec3 p, int oct){
  float a=0.5, s=0.0, n=0.0;
  for(int i=0;i<oct;i++){ s+=a*whVN(p); n+=a; p=p*2.03+vec3(11.3,7.1,3.7); a*=0.5; }
  return s/max(n,1e-5);
}
float whRidge(vec3 p, int oct){
  float a=0.5, s=0.0, n=0.0, w=1.0;
  for(int i=0;i<oct;i++){
    float v=1.0-abs(whVN(p)); v*=v; v*=w; w=clamp(v*2.0,0.0,1.0);
    s+=a*v; n+=a; p=p*2.11+vec3(5.7,13.1,2.9); a*=0.5;
  }
  return s/max(n,1e-5);
}
/* 2D curl of a value-noise potential — turbulent filaments without a full 3D curl */
vec2 whCurl2(vec2 p, float z){
  const float e=0.09;
  float n1=whVN(vec3(p+vec2(0.0,e),z)), n2=whVN(vec3(p-vec2(0.0,e),z));
  float n3=whVN(vec3(p+vec2(e,0.0),z)), n4=whVN(vec3(p-vec2(e,0.0),z));
  return vec2(n1-n2, n4-n3)/(2.0*e);
}
/* Planck locus, linear-Rec709, normalised to unit luminance (Helland fit -> linear) */
vec3 whBlackbody(float T){
  float t = clamp(T,900.0,42000.0)/100.0;
  float r,g,b;
  if(t<=66.0){ r=1.0; } else { r=1.292936*pow(max(t-60.0,1e-3),-0.1332047); }
  if(t<=66.0){ g=0.3900816*log(max(t,1.0))-0.6318414; }
  else       { g=1.129891*pow(max(t-60.0,1e-3),-0.0755148); }
  if(t>=66.0){ b=1.0; } else if(t<=19.0){ b=0.0; }
  else       { b=0.5432068*log(max(t-10.0,1e-3))-1.19625; }
  vec3 c = clamp(vec3(r,g,b),0.0,1.0);
  c = c*c*(0.6+0.4*c);                 /* cheap sRGB -> linear */
  return c/max(luma(c),1e-3);
}
/* Complete elliptic integral of the 1st kind, K(k), by arithmetic-geometric mean.
   K(k) = pi / (2 * AGM(1, sqrt(1-k*k))).  Quadratic convergence. */
float whEllipK(float k, int iter){
  k = clamp(abs(k),0.0,0.9999995);
  float a=1.0, b=sqrt(max(1.0-k*k,1e-13));
  for(int i=0;i<iter;i++){ float an=0.5*(a+b); b=sqrt(max(a*b,1e-20)); a=an; }
  return PI/(2.0*max(a,1e-8));
}
/* Doppler / gravitational spectral-shift tint. g>1 = blueshift.
   Approximates moving a Planck spectrum: rough per-channel wavelength response. */
vec3 whShiftRGB(float g){
  g = clamp(g,0.25,4.0);
  vec3 c = vec3(pow(g,-1.35), pow(g,-0.10), pow(g,1.25));
  return c/max(luma(c),1e-3);
}
`;

/* ---------------------------------------------------------------------------
   GLSL_WORMHOLE — the mouth. Fullscreen pass over the already-rendered HDR
   scene colour. Deflects every view ray through the DNEG effective potential,
   samples the near sky by screen-space reprojection and the far sky
   procedurally, and integrates the exotic accretion disk along the bent path.
--------------------------------------------------------------------------- */
const GLSL_WORMHOLE = WH_GLSL_LIB + `
in vec2 vUV; out vec4 fragColor;

uniform sampler2D uWhScene;      /* unit 0 — HDR scene colour, pre-wormhole      */
uniform mat4  uWhInvVP;          /* inverse camera-relative view-projection      */
uniform mat4  uWhVP;             /* camera-relative view-projection (reproject)  */
uniform vec3  uWhCenter;         /* mouth centre, camera-relative metres         */

/* --- metric parameters (metres; uWhMass is the geometric mass GM/c^2) --- */
uniform float uWhRho;            /* throat radius  rho                           */
uniform float uWhLenA;           /* cylinder half-length  a                      */
uniform float uWhMass;           /* lensing mass M  (lensing width W = 1.42953 M)*/
uniform int   uWhSteps;          /* deflection quadrature steps; <=0 = analytic  */
uniform int   uWhAgm;            /* AGM iterations for K(k)                      */
uniform float uWhIntU;           /* quadrature upper bound in the u substitution */
uniform float uWhSweepMax;       /* clamp on total swept angle (anti-aliasing)   */
uniform float uWhSweepFade;      /* sweep at which we fade to ring colour        */

/* --- animation --- */
uniform float uWhOpen, uWhWobble, uWhTime, uWhSeed, uWhFarSeed, uWhVis;
uniform vec3  uWhTearAxis;
uniform int   uWhOct;

/* --- accretion / exotic-matter disk --- */
uniform vec3  uWhDiskN, uWhDiskU;
uniform float uWhDiskR0, uWhDiskR1, uWhDiskT0, uWhDiskSpin;
uniform float uWhDiskOpacity, uWhDiskGain, uWhDiskThick, uWhBeam;
uniform int   uWhDiskImages;

/* --- destination sky --- */
uniform vec3  uWhStarDir, uWhStarCol, uWhPlanetDir, uWhPlanetCol, uWhPlanetLit, uWhNebCol;
uniform float uWhStarAng, uWhStarInt, uWhPlanetAng, uWhShift;

/* --- highlights --- */
uniform float uWhRing, uWhRingW, uWhEin, uWhEinW, uWhFilament, uWhFall, uWhFar;

/* ===================== 1. DEFLECTION ===================================== */
/* DNEG radial profile r(l):  r=rho for |l|<=a, else
   r = rho + M*( x*atan(x) - 0.5*ln(1+x^2) ),  x = 2(|l|-a)/(pi M).          */
float whRadius(float l){
  float al = abs(l);
  if(al <= uWhLenA) return uWhRho;
  float M = max(uWhMass, 1e-3);
  float x = 2.0*(al-uWhLenA)/(PI*M);
  return uWhRho + M*(x*atan(x) - 0.5*log(1.0+x*x));
}
/* dr/dl expressed directly in r. Exact endpoints of the DNEG profile:
   ->0 like sqrt(r-rho) at the throat, ->1 at infinity. kappa = pi^2 M/(4 rho)
   reproduces DNEG's near-throat slope; kappa==1 is exactly Ellis.           */
float whDrDl(float r, float rho, float kap){
  float q = max(r*r - rho*rho, 0.0);
  return sqrt(q/max(q + kap*rho*rho, 1e-9));
}
/* Total angle swept by a photon of impact parameter b, infinity to infinity.
   through=1 when the ray crosses the throat into the far universe (b<rho).   */
float whSweep(float b, float rho, out float through){
  float bb  = max(b, 1e-4);
  float rr  = max(rho, 1e-4);
  through   = (bb < rr) ? 1.0 : 0.0;
  float sw;

  if(uWhSteps <= 0){
    /* tier 0 — closed form. Ellis is exactly 2K(rho/b) / 2(b/rho)K(b/rho). */
    if(through < 0.5){
      sw = 2.0*whEllipK(rr/bb, uWhAgm);
    }else{
      float k = bb/rr;
      sw = 2.0*k*whEllipK(k, uWhAgm)
         + 2.0*uWhLenA*bb/(rr*sqrt(max(rr*rr-bb*bb,1e-4)));
    }
    sw += 4.0*uWhMass*bb/(bb*bb + rr*rr + 1e-4);   /* weak-field mass term */
    return min(sw, uWhSweepMax);
  }

  /* tier 1/2 — fixed-step midpoint quadrature of the true DNEG profile,
     in a substitution that removes the turning-point singularity.          */
  float kap = max(PI*PI*uWhMass/(4.0*rr), 1e-3);
  float U   = max(uWhIntU, 1.0);
  float h   = U/float(uWhSteps);
  float acc = 0.0;

  if(through < 0.5){
    /* r = b cosh u  =>  dphi = du / ( (dr/dl) cosh u ) */
    for(int i=0;i<uWhSteps;i++){
      float u  = (float(i)+0.5)*h;
      float ch = cosh(u);
      float r  = bb*ch;
      acc += h/(max(whDrDl(r,rr,kap),1e-6)*ch);
    }
    sw = 2.0*acc + 4.0*exp(-U);                    /* + analytic tail */
  }else{
    /* r = rho cosh u  (no turning point; add the exact cylinder term) */
    for(int i=0;i<uWhSteps;i++){
      float u  = (float(i)+0.5)*h;
      float sh = sinh(u), ch = cosh(u);
      float r  = rr*ch;
      float num = sqrt(rr*rr*sh*sh + kap*rr*rr);
      float den = rr*ch*sqrt(max(r*r-bb*bb,1e-9));
      acc += h*bb*num/den;
    }
    sw = 2.0*acc + 4.0*bb/rr*exp(-U)
       + 2.0*uWhLenA*bb/(rr*sqrt(max(rr*rr-bb*bb,1e-4)));
  }
  return min(sw, uWhSweepMax);
}
/* Trajectory radius as a function of swept angle. Exact in the flat limit
   (sweep=pi -> r=b/sin phi), exact at periapsis, and correctly "parks" the
   photon at r=rmin through the (sweep-pi) of winding near the photon sphere. */
float whTrajR(float phi, float rmin, float sweep){
  float wind = max(sweep - PI, 0.0);
  float p = phi - clamp(phi - PI*0.5, 0.0, wind);
  return rmin/max(sin(p), 1e-4);
}
float whTrajDR(float phi, float rmin, float sweep){
  float wind = max(sweep - PI, 0.0);
  float p = phi - clamp(phi - PI*0.5, 0.0, wind);
  float dp = (phi > PI*0.5 && phi < PI*0.5 + wind) ? 0.0 : 1.0;
  float s = max(sin(p), 1e-4);
  return -rmin*cos(p)/(s*s)*dp;
}

/* ===================== 2. SKIES ========================================== */
float whStarLayer(vec3 d, float scale, float seed, float thr, out float tint){
  vec3 p = d*scale;
  vec3 i = floor(p), f = fract(p) - 0.5;
  float h = whH3(i + seed);
  tint = whH3(i + seed + 9.13);
  if(h < thr) return 0.0;
  vec3 o = vec3(whH3(i+seed+1.7), whH3(i+seed+3.3), whH3(i+seed+5.1)) - 0.5;
  float dd = length(f - o*0.72);
  float m = (h-thr)/max(1.0-thr,1e-3);
  return pow(sat(1.0 - dd*3.1), 22.0)*(0.10 + m*m*3.4);
}
vec3 whStarfield(vec3 d, float seed, float gain){
  float t1, t2;
  float s1 = whStarLayer(d, 190.0, seed,        0.972, t1);
  float s2 = whStarLayer(d, 520.0, seed+41.7,   0.988, t2);
  vec3 c1 = whBlackbody(mix(2900.0, 13000.0, t1*t1));
  vec3 c2 = whBlackbody(mix(3400.0, 9500.0,  t2));
  return (c1*s1 + c2*s2*0.55)*gain;
}
vec3 whNebula(vec3 d, float seed, vec3 tint){
  float n = whFbm(d*2.1 + seed*3.1, uWhOct)*0.5 + 0.5;
  float m = whRidge(d*3.7 + seed*1.7, max(uWhOct-1,1));
  return tint*(pow(n, 3.0)*0.85 + pow(m, 2.4)*0.35);
}
/* Destination universe — generated entirely in-shader (no cubemap bake pass). */
vec3 whFarSky(vec3 d){
  vec3 col = whStarfield(d, uWhFarSeed, 1.0) + whNebula(d, uWhFarSeed, uWhNebCol);
  /* destination star */
  float ca = clamp(dot(d, uWhStarDir), -1.0, 1.0);
  float ang = acos(ca);
  float disc = 1.0 - smoothstep(uWhStarAng*0.88, uWhStarAng*1.12, ang);
  float glow = uWhStarInt*0.05/(1.0 + pow(ang/max(uWhStarAng,1e-4), 2.1));
  col += uWhStarCol*(disc*uWhStarInt*22.0 + glow);
  /* destination planet, as a lit disc with a terminator and a limb */
  vec3 pc = uWhPlanetDir;
  vec3 tv = d - pc*dot(d, pc);
  float s = length(tv)/max(uWhPlanetAng, 1e-5);
  if(s < 1.0){
    vec3 n = normalize(tv/max(uWhPlanetAng,1e-5) + pc*sqrt(max(1.0-s*s,0.0)));
    float ndl = dot(n, uWhPlanetLit);
    float lit = sat(ndl*1.05 + 0.05);
    float band = whFbm(n*3.4 + uWhFarSeed, uWhOct)*0.5 + 0.5;
    vec3 surf = uWhPlanetCol*mix(0.72, 1.28, band);
    float limb = pow(s, 6.0);
    vec3 pcol = surf*lit + uWhStarCol*limb*sat(ndl+0.35)*0.55;
    col = mix(col, pcol*1.4, sat(1.0 - smoothstep(0.965, 1.0, s)));
  }
  return col*whShiftRGB(uWhShift)*uWhShift;
}
/* Near universe — screen-space reprojection of the already-rendered frame,
   with a procedural starfield filling anything that reprojects off-screen.  */
vec3 whNearSky(vec3 d){
  vec3 proc = whStarfield(d, uWhSeed, 0.9) + whNebula(d, uWhSeed, uWhNebCol*0.35);
  vec4 cp = uWhVP*vec4(d, 0.0);
  if(cp.w <= 1e-6) return proc;
  vec2 nuv = cp.xy/cp.w*0.5 + 0.5;
  vec2 e = sat(min(nuv, vec2(1.0)-nuv)*10.0);
  float valid = min(e.x, e.y);
  vec3 scn = texture(uWhScene, clamp(nuv, vec2(0.001), vec2(0.999))).rgb;
  return mix(proc, scn + proc*0.25, valid);
}

/* ===================== 3. ACCRETION / EXOTIC-MATTER DISK ================= */
/* Shakura-Sunyaev thin-disk temperature profile, with the zero-torque inner
   boundary that produces the dark inner edge. */
float whDiskTemp(float r){
  float x = uWhDiskR0/max(r, 1e-3);
  return uWhDiskT0*pow(x, 0.75)*pow(max(1.0 - sqrt(x), 0.0), 0.25);
}
vec3 whDisk(vec3 e1, vec3 e2, float rmin, float sweep, float through, inout float trans){
  vec3 col = vec3(0.0);
  float A = dot(e1, uWhDiskN), B = dot(e2, uWhDiskN);
  /* A cos(phi) + B sin(phi) == 0  ->  phi = atan(-A, B) + k*pi */
  float p0 = atan(-A, B);
  p0 = p0 - PI*floor(p0/PI);          /* fold into (0, pi] */
  if(p0 <= 1e-4) p0 += PI;
  float lastPhi = (through > 0.5) ? sweep*0.5 : sweep;
  vec3 dv = normalize(cross(uWhDiskN, uWhDiskU));

  for(int k=0;k<uWhDiskImages;k++){
    float phi = p0 + float(k)*PI;
    if(phi >= lastPhi) break;
    float r = whTrajR(phi, rmin, sweep);
    if(r < uWhDiskR0 || r > uWhDiskR1) continue;

    float cp = cos(phi), sp = sin(phi);
    vec3 ph = e1*cp + e2*sp;                  /* radial unit at the crossing  */
    vec3 th = -e1*sp + e2*cp;                 /* tangential unit              */
    float dr = whTrajDR(phi, rmin, sweep);
    vec3 pd = normalize(ph*dr + th*r);        /* photon direction there       */
    vec3 toObs = -pd;                         /* emitter -> observer          */

    /* Keplerian circular flow, prograde about the disk normal */
    float beta = clamp(sqrt(max(uWhMass,1e-3)/r), 0.0, 0.85);
    vec3 vhat = normalize(cross(uWhDiskN, ph));
    float gam = 1.0/sqrt(max(1.0 - beta*beta, 1e-4));
    float dop = 1.0/max(gam*(1.0 - beta*dot(vhat, toObs)), 1e-3);   /* delta  */
    /* gravitational shift from the Morris-Thorne redshift function
       Phi(l) = -M/(r+M)  (DNEG chose Phi=0; we keep a small, real one)      */
    float gsh = exp(-uWhMass/(r + max(uWhMass,1e-3)));
    float shift = dop*gsh;

    /* azimuth in the disk frame + Keplerian shear for the filaments */
    float az = atan(dot(ph, dv), dot(ph, uWhDiskU));
    float rn = r/max(uWhDiskR0,1e-3);
    float om = pow(rn, -1.5)*uWhDiskSpin;
    float as = az - uWhTime*om;
    vec2 q = vec2(cos(as), sin(as))*rn*1.9;
    float dens;
    if(uWhDiskImages > 1){
      vec2 c = whCurl2(q*1.15, uWhTime*0.05 + rn);
      dens = whFbm(vec3(q*3.0 + c*0.55, uWhTime*0.04), uWhOct)*0.5 + 0.5;
      dens *= 0.55 + 0.75*whRidge(vec3(q*6.5, uWhTime*0.07), max(uWhOct-1,1));
    }else{
      dens = whVN(vec3(q*3.0, uWhTime*0.04))*0.5 + 0.62;
    }
    /* radial envelope: bright ring inside, exponential outer taper */
    float env = sat((r-uWhDiskR0)/(0.22*(uWhDiskR1-uWhDiskR0)))
              * exp(-2.1*(r-uWhDiskR0)/(uWhDiskR1-uWhDiskR0));
    /* grazing incidence lengthens the path through the slab */
    float graze = 1.0/max(abs(dot(pd, uWhDiskN)), uWhDiskThick);

    float T = whDiskTemp(r)*shift;                     /* observed temperature */
    vec3  em = whBlackbody(T)*pow(shift, uWhBeam);     /* relativistic beaming */
    float alpha = sat(dens*env*graze*uWhDiskOpacity);
    col   += trans*alpha*em*uWhDiskGain*env*(0.35 + 0.9*dens);
    trans *= (1.0 - alpha*0.92);
  }
  return col;
}

/* ===================== 4. APERTURE / OPENING ============================= */
float whAperture(vec3 dm){
  float o = sat(uWhOpen);
  float tear = pow(o, 0.42);
  /* early on the mouth is a slit that tears open along uWhTearAxis */
  float y = abs(dot(dm, uWhTearAxis));
  float slit = mix(max(1.0 - y*(1.0-o)*2.05, 0.0), 1.0, sat(o*1.9));
  float wob = 1.0 + uWhWobble*0.30*whFbm(dm*3.2 + uWhTime*0.6, max(uWhOct-1,1));
  return max(tear*slit*wob, 0.004);
}

/* ===================== 5. MAIN =========================================== */
void main(){
  vec3 base = texture(uWhScene, vUV).rgb;

  vec4 h = uWhInvVP*vec4(vUV*2.0-1.0, 1.0, 1.0);
  vec3 rd = normalize(h.xyz/h.w);
  vec3 P  = -uWhCenter;                 /* camera position relative to mouth  */
  float d = length(P);

  if(d < 1e-3 || uWhVis <= 0.0){ fragColor = vec4(base,1.0); return; }

  vec3 e1 = P/d;
  float cps = dot(rd, e1);
  vec3 tv = rd - e1*cps;
  float sps = length(tv);
  vec3 e2 = (sps > 1e-6) ? tv/sps : normalize(cross(e1, vec3(0.0,1.0,0.0)) + vec3(1e-4));
  float b = d*sps;
  float psi = atan(sps, cps);

  /* mouth-space direction of closest approach — drives the wobble/tear */
  float tca = max(-dot(P, rd), 0.0);
  vec3 dm = normalize(P + rd*tca + vec3(1e-6));
  float rho = max(uWhRho*whAperture(dm), 1e-3);

  if(b > rho*uWhFar && cps > 0.0){ fragColor = vec4(base,1.0); return; }

  float through;
  float sweep = whSweep(b, rho, through);
  /* only rays travelling inward can reach the throat */
  if(cps > 0.0) through = 0.0;

  /* fraction of the total bending that still lies ahead of the observer */
  float w = 0.5*(1.0 - cps);
  float alpha = sweep - PI;
  float PHI = psi + alpha*w;

  vec3 sky;
  float ali = sat((sweep - uWhSweepFade)/max(uWhSweepFade,1e-3));
  if(through > 0.5){
    float TH = sweep*w*2.0;
    vec3 fd = -(e1*cos(TH) + e2*sin(TH));
    sky = whFarSky(fd);
  }else{
    vec3 nd = e1*cos(PHI) + e2*sin(PHI);
    sky = whNearSky(nd);
  }
  /* near the photon sphere the mapping aliases violently — fade to ring hue */
  vec3 ringCol = vec3(0.62,0.82,1.0);
  sky = mix(sky, ringCol*luma(sky)*1.6, ali*0.85);

  /* disk, integrated along the bent path, front to back */
  float trans = 1.0;
  vec3 col = whDisk(e1, e2, max(b, rho), sweep, through, trans);
  col += sky*trans;

  /* photon ring: divergent winding right at b = rho */
  float ph = uWhRing*exp(-abs(b/rho - 1.0)/max(uWhRingW,1e-4));
  col += ringCol*ph*sat(uWhOpen*1.4);
  /* Einstein ring: sources directly behind reimage where sweep crosses 2pi */
  float ex = (sweep - TAU)/max(uWhEinW,1e-3);
  float e3 = (sweep - 3.0*PI)/max(uWhEinW,1e-3);
  col += ringCol*uWhEin*(exp(-ex*ex) + 0.45*exp(-e3*e3));

  /* exotic-energy filaments arcing over the mouth */
  if(uWhFilament > 0.0){
    float band = sat(1.0 - abs(b/rho - 1.35)/0.85);
    vec3 fq = dm*4.0 + vec3(0.0, uWhTime*0.35, uWhTime*0.11);
    float fil = pow(whRidge(fq, uWhOct), 3.0);
    col += mix(vec3(0.55,0.25,1.0), vec3(0.35,0.95,1.0), sat(fil*1.6))
         * fil*band*uWhFilament*sat(uWhOpen*2.0);
  }
  /* tear rim while opening */
  float rim = uWhRing*2.2*(1.0-sat(uWhOpen))*exp(-abs(b/rho-1.0)*5.0);
  col += vec3(0.85,0.72,1.0)*rim;

  /* lensing influence mask: unity inside the mouth, power falloff outside */
  float inside = 1.0 - step(rho, b);
  float outside = pow(sat(rho/max(b,1e-3)), uWhFall);
  float mask = sat(max(inside, outside))*uWhVis;

  fragColor = vec4(mix(base, col, mask), 1.0);
}
`;
