/* ===== BASELINE SHADERS (lead-owned; agent libraries layer on top where compatible) ===== */

const VS_TERRAIN=`
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
layout(location=3) in vec3 color;
uniform mat4 uVP; uniform vec3 uChunkOff; uniform mat3 uRot; uniform vec3 uPlanetC;
out vec3 vN; out vec3 vC; out vec3 vP; out float vH;
void main(){
 vec3 lp=uRot*position;
 vec3 wp=lp+uChunkOff;
 vN=normalize(uRot*normal); vC=color; vP=wp;
 vH=length(wp-uPlanetC);
 vec4 cp=uVP*vec4(wp,1.0); segLog(cp); gl_Position=cp;
}`;
const FS_TERRAIN=`
in vec3 vN; in vec3 vC; in vec3 vP; in float vH;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uPlanetC; uniform float uPlanetR;
uniform vec3 uSkyTint; uniform float uTime; uniform float uAtmoAmt; uniform float uOceanLvl;
out vec4 fragColor;
void main(){
 vec3 up=normalize(vP-uPlanetC);
 vec3 N=normalize(vN);
 float d=length(vP);
 // sub-metre detail normal, faded by distance so it never aliases
 float det=sat(1.0-d/2600.0);
 if(det>0.001){
  vec3 q=(vP-uPlanetC)*0.35;
  float e=0.55;
  float n0=vfbm3(q,3);
  vec3 gd=vec3(vfbm3(q+vec3(e,0,0),3)-n0,vfbm3(q+vec3(0,e,0),3)-n0,vfbm3(q+vec3(0,0,e),3)-n0);
  N=normalize(N+ (gd-dot(gd,N)*N)*det*2.2);
 }
 float ndl=dot(N,uSunDir);
 // soft terminator: a hard lambert reads as CG, a wrapped one reads as a real planet
 float diff=sat((ndl+0.06)/1.06);
 float sh=sat(dot(up,uSunDir)*6.0+0.35);   // self-shadow the far side
 diff*=sh;
 vec3 alb=vC;
 // ambient: sky dome above + bounce from the ground
 float skyv=sat(dot(N,up)*0.5+0.5);
 vec3 amb=uSkyTint*uAtmoAmt*0.22*skyv + alb*0.045;
 // very cheap specular for wet/icy ground
 vec3 V=normalize(-vP);
 vec3 H=normalize(V+uSunDir);
 float spec=pow(sat(dot(N,H)),28.0)*0.05*sat(luma(alb)-0.5);
 vec3 c=alb*(diff*uSunCol+amb)+spec*uSunCol*diff;
 fragColor=vec4(c,1.0);
}`;

const VS_SPHERE=`
layout(location=0) in vec3 position;
uniform mat4 uVP; uniform vec3 uOff; uniform float uScale; uniform mat3 uRot;
out vec3 vD; out vec3 vP;
void main(){
 vD=normalize(position);
 vec3 wp=uRot*position*uScale+uOff;
 vP=wp;
 vec4 cp=uVP*vec4(wp,1.0); segLog(cp); gl_Position=cp;
}`;
const FS_SPHERE=`
in vec3 vD; in vec3 vP;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uOff; uniform float uScale;
uniform vec3 uCol; uniform vec3 uEmis; uniform float uIsStar; uniform float uSeed;
uniform float uType; uniform vec3 uPal0,uPal1,uPal2; uniform float uTime; uniform float uAtmoAmt;
uniform vec3 uAtmoTint;
out vec4 fragColor;
void main(){
 vec3 N=normalize(vD);
 if(uIsStar>0.5){
  // photosphere: granulation + limb darkening + faint spots
  vec3 q=N*7.0+vec3(uTime*0.006);
  float gran=vfbm3(q*3.0,4)*0.5+vfbm3(q*11.0,3)*0.25;
  float spot=sat(vfbm3(N*4.0+11.0,4)*1.7-0.72);
  vec3 V=normalize(-vP);
  float mu=sat(dot(N,V));
  float limb=0.42+0.58*pow(mu,0.55);            // Eddington-ish limb darkening
  vec3 c=uEmis*(1.0+gran*0.35)*limb;
  c=mix(c,c*0.45,spot);
  fragColor=vec4(c*7.5,1.0);return;
 }
 vec3 q=N*3.2+uSeed;
 float n=vfbm3(q,5);
 vec3 alb;
 if(uType>4.5&&uType<5.5){                       // gas giant banding
  float band=sin(N.y*20.0+vfbm3(q*2.0,4)*4.0)*0.5+0.5;
  float storm=sat(vfbm3(N*6.0+uSeed*3.0,4)*2.2-1.0);
  alb=mix(uPal0,uPal1,band);
  alb=mix(alb,uPal2,storm*0.8);
 } else {
  float cont=vfbm3(q,5)*0.5+0.5;
  alb=mix(uPal0,uPal1,sat(cont*1.6-0.25));
  alb=mix(alb,uPal2,sat(vfbm3(q*2.7+3.0,4)*1.4));
  float ice=sat((abs(N.y)-0.68)*4.0);
  alb=mix(alb,vec3(0.92,0.95,1.0),ice*0.85);
 }
 alb*=uCol*1.5;
 float ndl=dot(N,uSunDir);
 float diff=sat((ndl+0.05)/1.05);
 // atmospheric rim: bright forward-scattering limb even at a distance
 vec3 V=normalize(-vP);
 float rim=pow(1.0-sat(dot(N,V)),3.0);
 vec3 c=alb*diff*uSunCol + uAtmoTint*rim*uAtmoAmt*sat(ndl+0.3)*1.6;
 c+=alb*0.02;
 fragColor=vec4(c,1.0);
}`;

const FS_STARS=`
in vec2 vUV; out vec4 fragColor;
uniform vec3 uCamR,uCamU,uCamF; uniform float uTanF, uAspect; uniform float uSeed;
// Cell-based starfield. The falloff MUST be expressed in units of the cell's angular
// size, otherwise each "star" becomes a blob a whole cell wide and the sky turns to soup.
vec3 starLayer(vec3 rd,float cells,float thresh,float bright){
 vec3 p=rd*cells;
 vec3 i=floor(p);
 vec3 c=vec3(0.0);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
  vec3 g=i+vec3(x,y,z);
  vec3 h=hash33(g+uSeed);
  if(h.z<thresh)continue;
  vec3 sp=normalize(g+h);
  float s=length(sp-rd)*cells;          // angular distance measured in cell widths
  if(s>0.45)continue;
  float m=exp(-s*s*190.0);              // a point a few percent of a cell across
  float mag=h.y*h.y*h.y;                // magnitude distribution: many faint, few bright
  // stellar colour from a crude temperature draw
  vec3 col=mix(vec3(1.0,0.64,0.42),vec3(0.68,0.79,1.0),h.x);
  col=mix(vec3(1.0,0.96,0.90),col,0.75);
  c+=col*m*bright*(0.18+mag*4.5);
 }
 return c;
}
void main(){
 vec2 nd=vUV*2.0-1.0;
 vec3 rd=normalize(uCamF+uCamR*nd.x*uTanF*uAspect+uCamU*nd.y*uTanF);
 vec3 c=starLayer(rd,120.0,0.930,1.0)+starLayer(rd,300.0,0.962,0.55)
       +starLayer(rd,700.0,0.984,0.30);
 // galactic plane: a soft glow with darker dust lanes cutting across it
 float gal=exp(-abs(dot(rd,normalize(vec3(0.36,0.30,-0.88))))*9.0);
 float dust=vfbm3(rd*7.0,5);
 float lane=sat(1.0-smoothstep(0.42,0.62,dust)*1.1);
 c+=vec3(0.055,0.065,0.105)*gal*lane*(0.5+dust*0.7);
 c+=vec3(0.085,0.070,0.055)*gal*lane*sat(dust-0.55)*0.9;
 c+=vec3(0.0030,0.0042,0.0080);
 fragColor=vec4(c,1.0);
}`;

/* --- planet composite: ocean + volumetric cloud shell + atmospheric scattering --- */
const FS_ATMO=`
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene, uDepth;
uniform vec3 uCamR,uCamU,uCamF; uniform float uTanF,uAspect,uTime;
uniform vec3 uPlanetC; uniform float uPlanetR,uAtmoTop;
uniform vec3 uSunDir,uSunCol;
uniform vec3 uRay; uniform float uMie, uRhoScale, uScaleH;
uniform vec3 uTint;
uniform float uHasOcean, uOceanLvl; uniform vec3 uOceanCol, uOceanDeep;
uniform float uOceanKind;
uniform float uHasCloud, uCloudLo, uCloudHi, uCloudCov;
uniform int uAtmoSteps, uCloudSteps, uCloudLightSteps;
uniform float uExposure;

float densR(float h){return exp(-max(h,0.0)/uScaleH);}
float densM(float h){return exp(-max(h,0.0)/(uScaleH*0.16));}
float densO(float h){return max(0.0,1.0-abs(h-25000.0)/18000.0);}   // ozone layer

// optical depth from point p toward the sun (short march; cheap but banding-free enough)
vec3 sunOptical(vec3 p){
 vec2 t=raySphere(p,uSunDir,uPlanetC,uAtmoTop);
 if(t.y<0.0)return vec3(0.0);
 vec2 g=raySphere(p,uSunDir,uPlanetC,uPlanetR);
 if(g.x>0.0&&g.x<t.y)return vec3(1e9);       // occluded by the planet body
 int N=4;
 float seg=t.y/float(N);
 float odR=0.0,odM=0.0,odO=0.0;
 for(int i=0;i<8;i++){ if(i>=N)break;
  vec3 s=p+uSunDir*(seg*(float(i)+0.5));
  float h=length(s-uPlanetC)-uPlanetR;
  odR+=densR(h);odM+=densM(h);odO+=densO(h);
 }
 odR*=seg;odM*=seg;odO*=seg;
 return uRay*odR*uRhoScale + vec3(uMie)*odM*1.1*uRhoScale + uRay*0.28*odO*uRhoScale*0.0006;
}
vec3 transmit(vec3 od){return exp(-od);}

// --- Gerstner ocean ---
vec3 oceanNormal(vec3 P,vec3 up,float dist,out float foam){
 vec3 t1=normalize(cross(up,abs(up.y)<0.9?vec3(0,1,0):vec3(1,0,0)));
 vec3 t2=cross(up,t1);
 float x=dot(P,t1),y=dot(P,t2);
 float dx=0.0,dy=0.0,jac=0.0;
 float amp=1.6,len=42.0,ph=0.0;
 float fade=sat(1.0-dist/9000.0);
 int N=6;
 for(int i=0;i<8;i++){ if(i>=N)break;
  float a=float(i)*2.4+uTime*0.02;
  vec2 dir=vec2(cos(a),sin(a));
  float k=TAU/len;
  float sp=sqrt(9.8/k);
  float th=k*(dir.x*x+dir.y*y)-sp*uTime*k*0.55;
  float c=cos(th),s=sin(th);
  float aa=amp*fade;
  dx+=dir.x*c*aa*k; dy+=dir.y*c*aa*k;
  jac+=aa*k*s;
  amp*=0.68; len*=0.53;
 }
 foam=sat(-jac*0.9-0.05);
 vec3 n=normalize(up - t1*dx - t2*dy);
 return n;
}
vec3 skyColour(vec3 ro,vec3 rd);

void main(){
 vec2 nd=vUV*2.0-1.0;
 vec3 rd=normalize(uCamF+uCamR*nd.x*uTanF*uAspect+uCamU*nd.y*uTanF);
 vec3 ro=vec3(0.0);
 vec3 scene=texture(uScene,vUV).rgb;
 float dz=texture(uDepth,vUV).r;
 float sceneDist=(dz>=0.9999)?1e12:segViewDist(dz);

 float camH=length(ro-uPlanetC)-uPlanetR;

 // ---------- ocean ----------
 if(uHasOcean>0.5){
  vec2 to=raySphere(ro,rd,uPlanetC,uPlanetR+uOceanLvl);
  float th=(to.x>0.0)?to.x:((to.y>0.0&&camH<uOceanLvl)?0.0:-1.0);
  if(to.x<=to.y&&th>=0.0&&th<sceneDist){
   vec3 P=ro+rd*max(th,0.0);
   vec3 up=normalize(P-uPlanetC);
   float dist=length(P-ro);
   float foam;
   vec3 N=oceanNormal(P,up,dist,foam);
   vec3 V=-rd;
   float fres=0.02+0.98*pow(1.0-sat(dot(N,V)),5.0);
   vec3 R=reflect(rd,N);
   vec3 sky=skyColour(P+up*2.0,R);
   float ndl=sat(dot(N,uSunDir));
   vec3 Hv=normalize(V+uSunDir);
   float rough=mix(0.035,0.16,sat(dist/4000.0));
   float a=rough*rough;
   float nh=sat(dot(N,Hv));
   float dGGX=a*a/(PI*pow(nh*nh*(a*a-1.0)+1.0,2.0));
   vec3 spec=uSunCol*dGGX*fres*8.0*sat(dot(up,uSunDir)*4.0);
   vec3 deep=uOceanDeep, shallow=uOceanCol;
   float sss=pow(sat(dot(V,-uSunDir)*0.5+0.5),3.0)*sat(foam*2.0+0.25);
   vec3 water=mix(deep,shallow,sat(ndl*0.9+0.1));
   if(uOceanKind>1.5){                       // lava: emissive, crust cracked along the Jacobian
    water=uOceanCol*(1.0+foam*6.0);
    water+=blackbody(1400.0+foam*1600.0)*(0.5+foam*3.0);
    spec*=0.15;fres*=0.3;
   } else {
    water+=vec3(0.02,0.16,0.13)*sss*1.4;
   }
   vec3 col=mix(water*(ndl*uSunCol*0.55+uTint*0.25),sky,fres)+spec;
   col=mix(col,vec3(0.86,0.92,0.96)*(ndl*0.8+0.2),sat(foam)*0.85);
   scene=col;
   sceneDist=dist;
  }
 }

 // ---------- volumetric cloud shell ----------
 if(uHasCloud>0.5&&uCloudCov>0.01){
  vec2 tc=raySphere(ro,rd,uPlanetC,uPlanetR+uCloudHi);
  vec2 tl=raySphere(ro,rd,uPlanetC,uPlanetR+uCloudLo);
  float t0,t1;
  bool hit=false;
  if(camH<uCloudLo){ if(tl.y>0.0){t0=tl.y;t1=tc.y;hit=tc.x<=tc.y;} }
  else if(camH<uCloudHi){ t0=0.0; t1=(tl.x>0.0)?tl.x:tc.y; hit=true; }
  else { if(tc.x<=tc.y&&tc.y>0.0){ t0=max(tc.x,0.0); t1=(tl.x>0.0)?tl.x:tc.y; hit=true; } }
  if(hit&&t1>t0){
   t1=min(t1,min(sceneDist,t0+260000.0));
   int NS=uCloudSteps;
   float seg=(t1-t0)/float(NS);
   float dith=hash21(vUV.x*3011.0+vUV.y*7919.0+float(int(uTime*60.0))).x;
   float T=1.0; vec3 acc=vec3(0.0);
   float cosT=dot(rd,uSunDir);
   // dual-lobe Henyey-Greenstein, correctly normalised by 1/4pi
   float hg1=(1.0-0.64)/(4.0*PI*pow(max(1.0+0.64-1.6*cosT,1e-3),1.5));
   float hg2=(1.0-0.04)/(4.0*PI*pow(max(1.0+0.04+0.4*cosT,1e-3),1.5));
   float phase=mix(hg2,hg1,0.62);
   for(int i=0;i<64;i++){ if(i>=NS)break;
    float t=t0+seg*(float(i)+dith);
    vec3 P=ro+rd*t;
    vec3 up=normalize(P-uPlanetC);
    float h=length(P-uPlanetC)-uPlanetR;
    float hf=sat((h-uCloudLo)/max(uCloudHi-uCloudLo,1.0));
    // vertical profile: dense base, eroded anvil top
    float prof=sat(hf*4.0)*sat((1.0-hf)*2.6);
    vec3 q=up*24.0+vec3(uTime*0.004,0.0,uTime*0.003);
    float base=vfbm3(q,4);
    // weather map gates where cloud can exist at all, so the sky stays mostly open
    float weather=smoothstep(0.42,0.86,vfbm3(up*2.2+7.0,3));
    float cov=uCloudCov*weather;
    float thr=1.0-cov*0.62;
    float dens=smoothstep(thr,thr+0.20,base)*prof;
    if(dens<=0.004)continue;
    dens*=1.0-smoothstep(0.40,0.88,vfbm3(q*5.0,3))*0.6;    // erosion carves the cauliflower edges
    if(dens<=0.004)continue;
    // light march toward the sun
    float lt=0.0;
    int LS=uCloudLightSteps;
    float lseg=(uCloudHi-uCloudLo)/float(LS)*1.6;
    for(int j=0;j<8;j++){ if(j>=LS)break;
     vec3 LP=P+uSunDir*(lseg*(float(j)+0.5));
     float lh=length(LP-uPlanetC)-uPlanetR;
     float lhf=sat((lh-uCloudLo)/max(uCloudHi-uCloudLo,1.0));
     float lp=sat(lhf*4.0)*sat((1.0-lhf)*2.6);
     vec3 lq=normalize(LP-uPlanetC)*24.0+vec3(uTime*0.004,0.0,uTime*0.003);
     lt+=sat((vfbm3(lq,3)-(1.0-cov))*2.6)*lp;
    }
    lt*=lseg*0.0016;
    float sun=exp(-lt*1.6);
    float powder=1.0-exp(-dens*seg*0.012);       // Beer's-powder dark edge
    vec3 lum=uSunCol*sun*min(phase,5.5)*2.6*powder + uTint*0.30*(0.25+0.75*hf);
    float sig=dens*seg*0.0016;
    float Ti=exp(-sig);
    acc+=T*(1.0-Ti)*lum;
    T*=Ti;
    if(T<0.012)break;
   }
   scene=scene*T+acc;
   if(T<0.7)sceneDist=min(sceneDist,mix(t1,t0,T));
  }
 }

 // ---------- atmospheric scattering ----------
 vec2 ta=raySphere(ro,rd,uPlanetC,uAtmoTop);
 if(ta.x<=ta.y&&ta.y>0.0){
  float t0=max(ta.x,0.0), t1=min(ta.y,sceneDist);
  if(t1>t0){
   int NS=uAtmoSteps;
   float seg=(t1-t0)/float(NS);
   float dith=hash21(vUV.x*1237.0+vUV.y*4519.0).x;
   float mu=dot(rd,uSunDir);
   float phR=3.0/(16.0*PI)*(1.0+mu*mu);
   float g=0.76;
   float phM=3.0/(8.0*PI)*((1.0-g*g)*(1.0+mu*mu))/((2.0+g*g)*pow(1.0+g*g-2.0*g*mu,1.5));
   vec3 sumR=vec3(0.0),sumM=vec3(0.0);
   float odR=0.0,odM=0.0,odO=0.0;
   for(int i=0;i<32;i++){ if(i>=NS)break;
    float t=t0+seg*(float(i)+dith);
    vec3 P=ro+rd*t;
    float h=length(P-uPlanetC)-uPlanetR;
    float dR=densR(h)*seg, dM=densM(h)*seg, dO=densO(h)*seg;
    odR+=dR;odM+=dM;odO+=dO;
    vec3 odView=uRay*odR*uRhoScale+vec3(uMie)*odM*1.1*uRhoScale+uRay*0.28*odO*uRhoScale*0.0006;
    vec3 tr=transmit(odView+sunOptical(P));
    sumR+=tr*dR;sumM+=tr*dM;
   }
   vec3 inscat=(uRay*uRhoScale*sumR*phR+vec3(uMie)*uRhoScale*sumM*phM)*uSunCol*22.0;
   vec3 odTotal=uRay*odR*uRhoScale+vec3(uMie)*odM*1.1*uRhoScale;
   vec3 tr=transmit(odTotal);
   // night side never goes pure black: airglow + starlight scattering
   vec3 airglow=uTint*0.0016*sat(1.0-abs(dot(normalize(ro-uPlanetC),uSunDir))*1.4);
   scene=scene*tr+inscat+airglow*(1.0-tr);
  }
 }
 fragColor=vec4(scene,1.0);
}
vec3 skyColour(vec3 ro,vec3 rd){
 vec2 ta=raySphere(ro,rd,uPlanetC,uAtmoTop);
 if(ta.y<0.0)return vec3(0.002,0.003,0.006);
 float t0=max(ta.x,0.0),t1=ta.y;
 float mu=dot(rd,uSunDir);
 float phR=3.0/(16.0*PI)*(1.0+mu*mu);
 int N=4; float seg=(t1-t0)/float(N);
 vec3 sum=vec3(0.0); float odR=0.0;
 for(int i=0;i<4;i++){
  vec3 P=ro+rd*(t0+seg*(float(i)+0.5));
  float h=length(P-uPlanetC)-uPlanetR;
  float dR=densR(h)*seg; odR+=dR;
  sum+=transmit(uRay*odR*uRhoScale+sunOptical(P))*dR;
 }
 return uRay*uRhoScale*sum*phR*uSunCol*22.0+vec3(0.002,0.003,0.007);
}`;

/* --- post chain --- */
const FS_BRIGHT=`
in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex; uniform float uThresh;
void main(){vec3 c=texture(uTex,vUV).rgb;float l=luma(c);
 float k=sat((l-uThresh)/max(uThresh,0.001));fragColor=vec4(c*k,1.0);}`;
const FS_BLUR=`
in vec2 vUV; out vec4 fragColor; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
 vec3 c=texture(uTex,vUV).rgb*0.227027;
 c+=texture(uTex,vUV+uDir*1.3846).rgb*0.316216;
 c+=texture(uTex,vUV-uDir*1.3846).rgb*0.316216;
 c+=texture(uTex,vUV+uDir*3.2308).rgb*0.070270;
 c+=texture(uTex,vUV-uDir*3.2308).rgb*0.070270;
 fragColor=vec4(c,1.0);}`;
const FS_POST=`
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene,uBloom,uDepth;
uniform float uExposure,uTime,uBloomAmt,uVignette,uCA,uGrain,uWarp,uHeat,uGodray;
uniform vec2 uSunUV; uniform vec3 uSunCol; uniform float uSunVis;
void main(){
 vec2 uv=vUV;
 // warp/re-entry screen distortion
 if(uWarp>0.001){
  vec2 d=uv-0.5;float r=length(d);
  uv=0.5+d*(1.0-uWarp*0.35*r*r)+d/max(r,1e-4)*sin(r*38.0-uTime*7.0)*uWarp*0.006;
 }
 if(uHeat>0.001){
  float n=vfbm3(vec3(uv*34.0,uTime*1.7),3)-0.5;
  uv+=vec2(n,vfbm3(vec3(uv.yx*31.0,uTime*1.9),3)-0.5)*uHeat*0.010;
 }
 vec2 d=uv-0.5; float r2=dot(d,d);
 float ca=uCA*(0.0016+r2*0.010);
 vec3 c;
 c.r=texture(uScene,uv+d*ca).r;
 c.g=texture(uScene,uv).g;
 c.b=texture(uScene,uv-d*ca).b;
 vec3 bl=texture(uBloom,uv).rgb;
 c+=bl*uBloomAmt;
 // volumetric god rays: radial occlusion march from the star's screen position
 if(uGodray>0.001&&uSunVis>0.001){
  vec2 dv=(uSunUV-uv)*0.32;
  float il=1.0; vec3 g=vec3(0.0);
  vec2 p=uv;
  for(int i=0;i<12;i++){
   p+=dv/12.0;
   vec3 s=texture(uBloom,p).rgb;
   g+=s*il; il*=0.90;
  }
  c+=g*(1.0/12.0)*uGodray*uSunVis*uSunCol*2.2;
  // anamorphic streak + ghosts
  float dd=length((uv-uSunUV)*vec2(1.0,2.6));
  c+=uSunCol*exp(-dd*11.0)*uSunVis*0.5;
  float dh=length((uv-uSunUV)*vec2(0.16,4.0));
  c+=uSunCol*exp(-dh*8.0)*uSunVis*0.34;
  for(int i=1;i<4;i++){
   vec2 gp=uv+(uSunUV-uv)*(1.0+float(i)*0.62);
   float gd=length(gp-uSunUV);
   c+=uSunCol*exp(-gd*22.0)*uSunVis*0.06/float(i);
  }
 }
 c*=uExposure;
 c=acesTonemap(c);
 // filmic grade: lift / gamma / gain, slight teal shadows and warm highlights
 c=pow(max(c,0.0),vec3(0.95,0.98,1.02));
 c=mix(c,c*vec3(0.94,1.0,1.06),0.35);
 c+=vec3(-0.004,0.0,0.010)*(1.0-luma(c));
 float vig=1.0-uVignette*r2*1.5;
 c*=sat(vig);
 float gr=(hash22(uv*vec2(1920.0,1080.0)+uTime*37.0).x-0.5)*uGrain;
 c+=gr;
 fragColor=vec4(max(c,0.0),1.0);
}`;

/* --- particles: velocity-stretched soft additive billboards --- */
const VS_PART=`
layout(location=0) in vec3 position;   // world (camera-relative) centre
layout(location=1) in vec3 normal;     // xyz = velocity
layout(location=2) in vec2 uv;         // x = size, y = life01
layout(location=3) in vec3 color;
uniform mat4 uVP; uniform vec3 uCamR,uCamU;
out vec3 vC; out vec2 vQ; out float vL;
void main(){
 int corner=gl_VertexID%6;
 vec2 q=vec2(0.0);
 if(corner==0)q=vec2(-1,-1); else if(corner==1)q=vec2(1,-1); else if(corner==2)q=vec2(-1,1);
 else if(corner==3)q=vec2(1,-1); else if(corner==4)q=vec2(1,1); else q=vec2(-1,1);
 vQ=q; vC=color; vL=uv.y;
 float s=uv.x;
 vec3 R=uCamR,U=uCamU;
 float sp=length(normal);
 if(sp>1.0){ // stretch along velocity
  vec3 vd=normal/sp;
  vec3 side=normalize(cross(vd,normalize(position-vec3(0.0))+vec3(1e-6)));
  R=side; U=vd*min(1.0+sp*0.02,6.0);
 }
 vec3 wp=position+R*q.x*s+U*q.y*s;
 vec4 cp=uVP*vec4(wp,1.0); segLog(cp); gl_Position=cp;
}`;
const FS_PART=`
in vec3 vC; in vec2 vQ; in float vL; out vec4 fragColor;
void main(){
 float d=dot(vQ,vQ);
 if(d>1.0)discard;
 float a=pow(1.0-d,1.6);
 fragColor=vec4(vC*a,a);
}`;
