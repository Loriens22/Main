/* ===== FALLBACK SHIP: procedural "Vagrant-class" explorer (lead-authored) ===== */
function MB(){
 return {P:[],N:[],C:[],M:[],I:[],base:0,
  v(x,y,z,nx,ny,nz,c,m){this.P.push(x,y,z);this.N.push(nx,ny,nz);
   this.C.push(c[0],c[1],c[2]);this.M.push(m);return this.P.length/3-1;},
  tri(a,b,c){this.I.push(a,b,c);},
  quad(a,b,c,d){this.I.push(a,b,c,a,c,d);}};
}
// tapered tube along Z from z0 (radius r0) to z1 (radius r1)
function mbTube(B,z0,r0,z1,r1,seg,col,mat,ox,oy,flat){
 ox=ox||0;oy=oy||0;
 const ring=[];
 for(let k=0;k<2;k++){
  const z=k?z1:z0, r=k?r1:r0, row=[];
  for(let i=0;i<seg;i++){
   const a=i/seg*TAU;
   const cs=Math.cos(a),sn=Math.sin(a);
   const rr=flat?r*(1-0.22*Math.abs(sn)):r;
   row.push(B.v(ox+cs*rr,oy+sn*rr,z,cs,sn,0,col,mat));
  }
  ring.push(row);
 }
 for(let i=0;i<seg;i++){const j=(i+1)%seg;B.quad(ring[0][i],ring[0][j],ring[1][j],ring[1][i]);}
 return ring;
}
function mbDisc(B,z,r,seg,nz,col,mat,ox,oy){
 ox=ox||0;oy=oy||0;
 const c=B.v(ox,oy,z,0,0,nz,col,mat),rr=[];
 for(let i=0;i<seg;i++){const a=i/seg*TAU;rr.push(B.v(ox+Math.cos(a)*r,oy+Math.sin(a)*r,z,0,0,nz,col,mat));}
 for(let i=0;i<seg;i++){const j=(i+1)%seg;if(nz>0)B.tri(c,rr[i],rr[j]);else B.tri(c,rr[j],rr[i]);}
}
function mbBox(B,x,y,z,sx,sy,sz,col,mat){
 const F=[[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]];
 for(const n of F){
  const u=Math.abs(n[0])>0.5?[0,1,0]:[1,0,0];
  const w=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
  const c=[x+n[0]*sx,y+n[1]*sy,z+n[2]*sz];
  const a=[u[0]*sx,u[1]*sy,u[2]*sz], b=[w[0]*sx,w[1]*sy,w[2]*sz];
  const i0=B.v(c[0]-a[0]-b[0],c[1]-a[1]-b[1],c[2]-a[2]-b[2],n[0],n[1],n[2],col,mat);
  const i1=B.v(c[0]+a[0]-b[0],c[1]+a[1]-b[1],c[2]+a[2]-b[2],n[0],n[1],n[2],col,mat);
  const i2=B.v(c[0]+a[0]+b[0],c[1]+a[1]+b[1],c[2]+a[2]+b[2],n[0],n[1],n[2],col,mat);
  const i3=B.v(c[0]-a[0]+b[0],c[1]-a[1]+b[1],c[2]-a[2]+b[2],n[0],n[1],n[2],col,mat);
  B.quad(i0,i1,i2,i3);
 }
}
// MAT: 0 painted hull, 1 bare metal, 2 composite, 3 gold MLI, 4 radiator, 5 soot nozzle,
//      6 glass, 7 emissive
const C_HULL=[.80,.81,.83], C_MET=[.62,.63,.66], C_CMP=[.13,.14,.16], C_MLI=[.86,.68,.24],
      C_RAD=[.90,.91,.93], C_SOOT=[.10,.09,.09], C_GLASS=[.05,.09,.13], C_EM=[.35,.85,1.0];
function shipBuildFB(){
 const B=MB();
 // --- primary hull: nose -18 .. tail +14 ---
 mbTube(B,-18.0,0.9,-14.0,2.2,20,C_HULL,0,0,0,true);
 mbTube(B,-14.0,2.2,-6.0,2.9,20,C_HULL,0,0,0,true);
 mbTube(B,-6.0,2.9,2.0,3.1,20,C_HULL,0,0,0,true);
 mbTube(B,2.0,3.1,9.0,2.7,20,C_CMP,2,0,0,true);
 mbTube(B,9.0,2.7,13.0,2.35,20,C_MET,1);
 mbDisc(B,-18.0,0.9,20,-1,C_MET,1);
 // --- canopy: faceted, sits on the dorsal spine forward ---
 mbTube(B,-16.2,1.15,-11.0,1.85,10,C_GLASS,6,0,1.35);
 mbDisc(B,-16.2,1.15,10,-1,C_GLASS,6,0,1.35);
 mbBox(B,0,1.5,-13.0,1.95,0.16,3.1,C_MET,1);
 // --- dorsal spine + truss members ---
 mbBox(B,0,3.35,0.5,0.55,0.5,7.5,C_MET,1);
 for(let i=0;i<9;i++){const z=-5.5+i*1.6;
  mbBox(B,0,3.35,z,1.35,0.13,0.13,C_MET,1);
  mbBox(B,(i%2?1:-1)*0.9,3.35,z+0.8,0.09,0.42,0.75,C_MET,1);}
 // --- propellant tanks: MLI-wrapped, domed ends ---
 for(const sx of[-1,1]){
  mbTube(B,-2.0,1.5,7.0,1.5,14,C_MLI,3,sx*4.3,-0.4);
  mbDisc(B,7.0,1.5,14,1,C_MLI,3,sx*4.3,-0.4);
  mbDisc(B,-2.0,1.5,14,-1,C_MLI,3,sx*4.3,-0.4);
  for(let i=0;i<5;i++)mbTube(B,-1.5+i*1.9,1.56,-1.3+i*1.9,1.56,14,C_MET,1,sx*4.3,-0.4);
  mbBox(B,sx*2.6,-0.4,2.5,1.2,0.22,0.22,C_MET,1);
 }
 // --- radiator wings ---
 for(const sx of[-1,1]){
  mbBox(B,sx*8.6,0.6,3.0,4.6,0.10,4.4,C_RAD,4);
  for(let i=0;i<7;i++)mbBox(B,sx*(4.4+i*1.4),0.6,3.0,0.05,0.13,4.35,C_MET,1);
  mbBox(B,sx*4.2,0.6,3.0,0.5,0.34,0.7,C_MET,1);
 }
 // --- high-gain dish + sensor mast ---
 mbBox(B,-2.2,4.2,-4.0,0.12,0.85,0.12,C_MET,1);
 mbTube(B,-4.6,0.15,-4.05,1.7,16,C_HULL,0,-2.2,5.1);
 mbDisc(B,-4.05,1.7,16,1,C_HULL,0,-2.2,5.1);
 mbBox(B,2.4,4.3,-3.2,0.09,1.0,0.09,C_MET,1);
 mbBox(B,2.4,5.3,-3.2,0.28,0.16,0.28,C_CMP,2);
 // --- engine cluster: 3 bells, lathe profile (throat -> expansion -> lip) ---
 const bells=[[0,-0.2],[-2.5,1.3],[2.5,1.3]];
 for(const e of bells){
  mbTube(B,13.0,0.75,14.2,0.55,16,C_MET,1,e[0],e[1]);
  mbTube(B,14.2,0.55,15.4,1.05,16,C_SOOT,5,e[0],e[1]);
  mbTube(B,15.4,1.05,17.0,1.75,16,C_SOOT,5,e[0],e[1]);
  for(let i=0;i<6;i++)mbTube(B,14.4+i*0.42,0.62+i*0.20,14.5+i*0.42,0.64+i*0.20,16,C_MET,1,e[0],e[1]);
  mbDisc(B,17.0,1.75,16,1,C_SOOT,5,e[0],e[1]);
 }
 // --- RCS quads at the extremities (max moment arm) ---
 const rcsP=[[-2.6,2.4,-15.2],[2.6,2.4,-15.2],[-2.6,-2.4,-15.2],[2.6,-2.4,-15.2],
             [-3.2,2.9,10.5],[3.2,2.9,10.5],[-3.2,-2.9,10.5],[3.2,-2.9,10.5]];
 for(const p of rcsP){
  mbBox(B,p[0],p[1],p[2],0.36,0.36,0.5,C_CMP,2);
  mbBox(B,p[0]*1.16,p[1]*1.1,p[2],0.14,0.14,0.2,C_MET,1);
 }
 // --- landing legs ---
 const legs=[[-3.4,-2.2,-6.5],[3.4,-2.2,-6.5],[-3.6,-2.2,6.5],[3.6,-2.2,6.5]];
 for(const l of legs){
  const sx=Math.sign(l[0]);
  mbBox(B,l[0],l[1],l[2],0.34,0.42,0.55,C_MET,1);
  mbBox(B,l[0]+sx*1.15,l[1]-1.5,l[2],0.16,1.55,0.16,C_MET,1);
  mbBox(B,l[0]+sx*0.6,l[1]-0.9,l[2],0.62,0.10,0.10,C_MET,1);
  mbTube(B,-0.28,0.62,0.10,0.62,10,C_MET,1,l[0]+sx*1.15,l[1]-3.05);
  mbDisc(B,-0.28,0.62,10,-1,C_CMP,2,l[0]+sx*1.15,l[1]-3.05);
 }
 // --- greebles: panels, hatches, handrails at human scale ---
 let gs=7;const R=()=>{gs=(gs*1664525+1013904223)>>>0;return gs/4294967296;};
 for(let i=0;i<130;i++){
  const z=-16+R()*29, a=R()*TAU, r=2.4+R()*0.6;
  const s=0.10+R()*0.36;
  mbBox(B,Math.cos(a)*r,Math.sin(a)*r*0.82,z,s,s*0.6,s*(0.7+R()*1.8),
   R()<0.22?C_MLI:(R()<0.5?C_CMP:C_MET),R()<0.22?3:(R()<0.5?2:1));
 }
 for(let i=0;i<14;i++)mbBox(B,-2.9,1.1+((i%2)?0.5:0),-12+i*1.5,0.05,0.05,0.32,C_MET,1);
 mbBox(B,0,-3.2,-2.0,1.1,0.14,1.1,C_MET,1);            // docking port
 mbTube(B,-3.4,0.7,-2.9,0.7,12,C_MET,1,0,-3.3);
 // --- emissive strips + nav lights ---
 for(let i=0;i<11;i++)mbBox(B,-3.05,0.2,-11+i*2.0,0.04,0.10,0.65,C_EM,7);
 for(let i=0;i<11;i++)mbBox(B,3.05,0.2,-11+i*2.0,0.04,0.10,0.65,C_EM,7);
 mbBox(B,-9.0,0.8,3.0,0.22,0.22,0.22,[1,.12,.12],7);   // port red
 mbBox(B,9.0,0.8,3.0,0.22,0.22,0.22,[.12,1,.2],7);     // starboard green
 mbBox(B,0,4.0,4.5,0.2,0.2,0.2,[1,1,1],7);             // strobe
 return {position:new Float32Array(B.P),normal:new Float32Array(B.N),
  color:new Float32Array(B.C),mat:new Float32Array(B.M),index:new Uint32Array(B.I)};
}
function shipBuildCockpitFB(){
 const B=MB();
 const D=[.09,.10,.12];
 mbBox(B,0,0.30,-12.2,1.5,0.55,0.9,D,2);              // instrument coaming
 mbBox(B,0,0.62,-12.6,1.25,0.42,0.06,[.02,.05,.07],6);// MFD glass
 for(const sx of[-1,1]){
  mbBox(B,sx*1.35,0.55,-11.6,0.16,0.5,1.1,D,2);
  for(let i=0;i<6;i++)mbBox(B,sx*1.22,0.75-i*0.14,-11.9+i*0.06,0.05,0.045,0.05,
   i%2?[.9,.35,.1]:[.2,.9,.5],7);
 }
 mbBox(B,0,1.62,-12.0,1.6,0.10,1.4,D,2);              // glareshield
 for(const sx of[-1,1]){
  mbBox(B,sx*1.45,1.05,-13.4,0.09,1.0,0.09,[.35,.36,.38],1);
  mbBox(B,sx*1.30,1.05,-10.6,0.09,1.0,0.09,[.35,.36,.38],1);
 }
 mbBox(B,0,1.95,-11.0,1.5,0.08,2.2,[.35,.36,.38],1);
 mbBox(B,0,-0.35,-10.2,0.62,0.14,0.7,D,2);            // seat pan
 mbBox(B,0,0.35,-9.6,0.62,0.75,0.12,D,2);             // seat back
 mbBox(B,0,1.0,-11.4,0.9,0.03,0.9,[.03,.9,1.0],7);    // interior glow panel
 return {position:new Float32Array(B.P),normal:new Float32Array(B.N),
  color:new Float32Array(B.C),mat:new Float32Array(B.M),index:new Uint32Array(B.I)};
}
const SHIP_LAYOUT_FB={
 eye:[0,0.55,-11.2],
 engines:[{pos:[0,-0.2,17.0],r:1.75},{pos:[-2.5,1.3,17.0],r:1.75},{pos:[2.5,1.3,17.0],r:1.75}],
 rcs:[[-2.6,2.4,-15.2],[2.6,2.4,-15.2],[-2.6,-2.4,-15.2],[2.6,-2.4,-15.2],
      [-3.2,2.9,10.5],[3.2,2.9,10.5],[-3.2,-2.9,10.5],[3.2,-2.9,10.5]],
 gear:[[-4.55,-5.25,-6.5],[4.55,-5.25,-6.5],[-4.75,-5.25,6.5],[4.75,-5.25,6.5]],
 lights:[[-9.0,0.8,3.0,1,.1,.1],[9.0,0.8,3.0,.1,1,.2],[0,4.0,4.5,1,1,1]],
 mass:2.4e6,dryMass:9.2e5,inertia:[9.0e7,9.6e7,2.4e7],length:35
};
const GLSL_SHIP_VS_FB=`
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=3) in vec3 color;
layout(location=4) in float mat;
uniform mat4 uVP; uniform mat3 uRot; uniform vec3 uOff; uniform float uGear;
out vec3 vN,vC,vP,vL; out float vM;
void main(){
 vec3 lp=position;
 if(mat<0.5||true){}
 // landing-gear extension: the leg group slides down when deployed
 if(lp.y<-3.0){ lp.y-=(1.0-uGear)*2.6; }
 vec3 wp=uRot*lp+uOff;
 vN=normalize(uRot*normal); vC=color; vP=wp; vL=lp; vM=mat;
 vec4 cp=uVP*vec4(wp,1.0); segLog(cp); gl_Position=cp;
}`;
const GLSL_SHIP_FS_FB=`
in vec3 vN,vC,vP,vL; in float vM; out vec4 fragColor;
uniform vec3 uSunDir,uSunCol,uPlanetDir,uPlanetCol;
uniform float uPlanetAmt,uTime,uReentry,uThrottle,uStrobe;
uniform vec3 uVelDir;
uniform int uNLights; uniform vec3 uLightP[8]; uniform vec3 uLightC[8];
float panelLines(vec3 p){
 vec3 g=abs(fract(p*0.55)-0.5);
 float l=min(min(g.x,g.y),g.z);
 float m=1.0-sat(l*22.0);
 vec3 g2=abs(fract(p*0.12)-0.5);
 float l2=min(min(g2.x,g2.y),g2.z);
 return max(m*0.55,(1.0-sat(l2*30.0))*0.9);
}
void main(){
 vec3 N=normalize(vN);
 vec3 V=normalize(-vP);
 int m=int(vM+0.5);
 vec3 alb=vC; float rough=0.45, metal=0.0, emis=0.0;
 if(m==1){metal=1.0;rough=0.28;}
 else if(m==2){rough=0.62;}
 else if(m==3){metal=0.92;rough=0.34;
  // MLI crinkle: high-frequency normal break-up is what reads as "real spacecraft"
  vec3 q=vL*7.0;
  float n0=vfbm3(q,3);
  vec3 gd=vec3(vfbm3(q+vec3(0.3,0,0),3)-n0,vfbm3(q+vec3(0,0.3,0),3)-n0,vfbm3(q+vec3(0,0,0.3),3)-n0);
  N=normalize(N+(gd-dot(gd,N)*N)*2.6);
  alb*=0.85+0.3*n0;}
 else if(m==4){rough=0.35;metal=0.05;}
 else if(m==5){rough=0.82;metal=0.6;
  float soot=sat((vL.z-13.0)/4.0);
  alb=mix(alb,vec3(0.03,0.028,0.026),soot);}
 else if(m==6){metal=0.0;rough=0.06;alb=vec3(0.02,0.04,0.06);}
 else if(m==7){emis=1.0;}
 // panel lines + crevice dirt
 if(m<=2||m==4){
  float pl=panelLines(vL);
  alb*=1.0-pl*0.30;
  N=normalize(N+vec3(0.0,pl*0.05,0.0));
  float dirt=sat(vfbm3(vL*0.9,4)*1.6-0.5);
  alb*=1.0-dirt*0.20;
 }
 if(emis>0.5){
  float s=1.0;
  if(abs(vL.y-4.0)<0.3&&abs(vL.z-4.5)<0.3)s=step(0.94,fract(uTime*0.7));
  fragColor=vec4(alb*6.0*s,1.0);return;
 }
 vec3 F0=mix(vec3(0.04),alb,metal);
 vec3 diff=alb*(1.0-metal);
 float ndl=sat(dot(N,uSunDir));
 vec3 H=normalize(V+uSunDir);
 float a=max(rough*rough,0.002);
 float nh=sat(dot(N,H)), nv=sat(dot(N,V)), vh=sat(dot(V,H));
 float D=a*a/(PI*pow(nh*nh*(a*a-1.0)+1.0,2.0));
 float k=a*0.5;
 float Gv=nv/(nv*(1.0-k)+k), Gl=ndl/(ndl*(1.0-k)+k);
 vec3 F=F0+(1.0-F0)*pow(1.0-vh,5.0);
 vec3 spec=D*Gv*Gl*F/max(4.0*nv*ndl+0.001,0.001);
 vec3 c=(diff/PI+spec)*uSunCol*ndl*3.0;
 // planetshine: a big body below visibly bounces light onto the hull
 float pl2=sat(dot(N,uPlanetDir)*0.5+0.5);
 c+=diff*uPlanetCol*uPlanetAmt*pl2*0.55;
 c+=diff*0.012;
 // engine / RCS point lights
 for(int i=0;i<8;i++){
  if(i>=uNLights)break;
  vec3 d=uLightP[i]-vP; float dd=dot(d,d);
  vec3 L=d*inversesqrt(max(dd,1e-6));
  c+=diff*uLightC[i]*sat(dot(N,L))/(1.0+dd*0.010);
 }
 // re-entry: windward leading edges glow blackbody and cool with a gradient
 if(uReentry>0.001){
  float wind=sat(dot(N,-uVelDir));
  float heat=uReentry*pow(wind,1.6);
  float T=520.0+heat*2100.0;
  c+=blackbody(T)*heat*heat*7.0;
 }
 fragColor=vec4(c,1.0);
}`;
