/* ===== WORMHOLE ===== */
const WARPST={state:'idle',t:0,progress:0,target:null,targetSys:null,cool:0,mouth:v3(),open:0};
function startWarp(body,sysId){
 if(SHIP.power<0.12){message('INSUFFICIENT POWER','Wormhole throat needs 12% reactor charge');return;}
 WARPST.state='charging';WARPST.t=0;WARPST.target=body;WARPST.targetSys=sysId;
 qrot(_v0,SHIP.quat,v3(0,0,-1));
 vmad(WARPST.mouth,SHIP.pos,_v0,900);
 message('THROAT FORMING','Exotic-matter aperture stabilising — stand by');
}
function warpUpdate(dt){
 const W=WARPST;
 if(W.state==='idle'){W.open=Math.max(0,W.open-dt*1.6);W.cool=Math.max(0,W.cool-dt);return;}
 W.t+=dt;
 if(W.state==='charging'){
  SHIP.power=sat(SHIP.power-dt*0.06);
  W.open=sat(W.t/2.2);
  if(W.t>2.2){W.state='opening';W.t=0;message('APERTURE OPEN','Einstein ring stable — entering throat');}
 } else if(W.state==='opening'){
  W.open=1;
  qrot(_v0,SHIP.quat,v3(0,0,-1));
  vmad(SHIP.pos,SHIP.pos,_v0,dt*420);
  if(W.t>1.4){W.state='tunnel';W.t=0;}
 } else if(W.state==='tunnel'){
  W.progress=sat(W.t/4.2);
  if(W.t>4.2){
   // arrive on a circular orbit at 2.5 body radii, facing the body
   if(W.targetSys!==null&&W.targetSys!==undefined){
    loadSystem(W.targetSys);worldStep(CTX.t,0);
    W.target=BODIES[Math.min(1,BODIES.length-1)];
   }
   const b=W.target||BODIES[1];
   bodyStateAt(b,CTX.t);
   const r=b.kind==='star'?b.radius*6:b.radius*2.5;
   vset(_v0,r,0,0);vadd(SHIP.pos,b.pos,_v0);
   const vc=Math.sqrt(b.mu/r);
   vset(_v1,0,0,-vc);vadd(SHIP.vel,b.vel,_v1);
   vsub(_v2,b.pos,SHIP.pos);vnorm(_v2,_v2);
   vnorm(_v3,_v0);
   qlook(SHIP.quat,_v2,_v3);
   vset(SHIP.angVel,0,0,0);
   SHIP.hullT=290;
   W.state='exit';W.t=0;W.progress=0;
   message('ARRIVAL — '+b.name,describeDNA(b.dna||makeDNA(1,0,b.radius)));
  }
 } else if(W.state==='exit'){
  W.open=Math.max(0,1-W.t*1.6);
  if(W.t>1.2){W.state='idle';W.cool=6;}
 }
}
const FS_WORM=`
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene;
uniform vec3 uCamR,uCamU,uCamF; uniform float uTanF,uAspect,uTime;
uniform vec3 uMouth; uniform float uThroat,uOpen,uTunnel,uSeed;
uniform int uWhSteps;
vec3 farSky(vec3 rd,float seed){
 vec3 p=rd*54.0; vec3 i=floor(p); vec3 c=vec3(0.0);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
  vec3 g=i+vec3(x,y,z); vec3 h=hash33(g+seed);
  if(h.z<0.90)continue;
  float d=1.0-dot(normalize(g+h),rd);
  if(d>0.0009)continue;
  c+=mix(vec3(1.0,0.7,0.5),vec3(0.7,0.8,1.0),h.x)*exp(-d*20000.0)*(0.4+h.y*1.6);
 }
 c+=vec3(0.05,0.03,0.09)*exp(-abs(rd.y)*3.0);
 return c;
}
void main(){
 vec2 nd=vUV*2.0-1.0;
 vec3 rd=normalize(uCamF+uCamR*nd.x*uTanF*uAspect+uCamU*nd.y*uTanF);
 vec3 scene=texture(uScene,vUV).rgb;
 if(uTunnel>0.001){
  // hyperspace throat: swirling filaments + stretched starlight down a tunnel
  vec2 q=nd*vec2(uAspect,1.0);
  float r=length(q); float a=atan(q.y,q.x);
  float z=uTime*7.0+1.0/max(r,0.06)*2.4;
  float fil=0.0;
  for(int i=0;i<4;i++){
   float fi=float(i);
   fil+=vfbm3(vec3(a*3.0+fi*2.1,z*0.6+fi,fi*7.0),3)/(1.0+fi);
  }
  vec3 tun=mix(vec3(0.25,0.55,1.0),vec3(0.95,0.55,1.0),sat(fil*1.2));
  tun*=pow(sat(1.0-r*0.85),2.2)*3.2*(0.5+fil);
  tun+=vec3(0.7,0.85,1.0)*exp(-r*7.0)*6.0*uTunnel;   // destination light growing at the far end
  float streak=pow(sat(1.0-abs(fract(a*9.0+fil)-0.5)*4.0),8.0);
  tun+=vec3(0.8,0.9,1.0)*streak*sat(r-0.12)*2.0;
  scene=mix(scene,tun,sat(uTunnel*1.4));
  fragColor=vec4(scene,1.0);return;
 }
 if(uOpen<0.001){fragColor=vec4(scene,1.0);return;}
 vec3 ro=vec3(0.0);
 vec3 toM=uMouth-ro; float dM=length(toM);
 float rho=uThroat*uOpen;
 // impact parameter of this ray about the mouth
 vec3 md=toM/max(dM,1e-4);
 float alongd=dot(rd,md);
 vec3 perp=rd-md*alongd;
 float b=length(perp)*dM;
 if(alongd<0.0){fragColor=vec4(scene,1.0);return;}
 float lensR=rho*3.4;
 if(b>lensR*2.4){fragColor=vec4(scene,1.0);return;}
 // Ellis-metric deflection: alpha ~ pi*rho^2/(2 b^2) far from the throat
 float alpha=PI*rho*rho/(2.0*max(b*b,rho*rho*0.02));
 alpha=min(alpha,3.0);
 vec3 pn=length(perp)>1e-6?normalize(perp):uCamR;
 vec3 rdD=normalize(rd-pn*alpha*0.55);
 vec3 col;
 if(b<rho){
  // through the throat: the destination sky, blueshifted
  col=farSky(rdD,uSeed)*vec3(0.85,0.95,1.25)*1.5;
  col+=vec3(0.3,0.5,1.0)*pow(sat(1.0-b/rho),3.0)*0.6;
 } else {
  // lensed near sky, sampled by reprojecting the deflected ray
  vec2 off=vec2(dot(rdD-rd,uCamR),dot(rdD-rd,uCamU))/vec2(uTanF*uAspect,uTanF);
  col=texture(uScene,sat(vUV+off*0.5)).rgb;
  col=mix(col,farSky(rdD,uSeed+3.0)*0.6,sat((lensR-b)/max(lensR-rho,1e-4))*0.35);
 }
 // Einstein ring + photon ring
 float ring=exp(-pow((b-rho)/max(rho*0.09,1e-4),2.0));
 col+=vec3(0.7,0.85,1.0)*ring*3.5*uOpen;
 // accretion / exotic-matter disk with Doppler beaming and lensed far side
 float diskT=dot(normalize(perp+md*0.0001),uCamU);
 float dr=b/max(rho,1e-4);
 if(dr>1.02&&dr<3.4){
  float ang=atan(dot(perp,uCamU),dot(perp,uCamR));
  float turb=vfbm3(vec3(cos(ang)*3.0,sin(ang)*3.0,dr*4.0-uTime*0.8),4);
  float prof=exp(-pow((dr-1.9)/0.8,2.0));
  float beam=0.35+1.65*sat(0.5+0.5*sin(ang));     // approaching side much brighter
  float T=mix(2200.0,11000.0,sat((3.4-dr)/2.4))*mix(0.75,1.35,sat(sin(ang)*0.5+0.5));
  col+=blackbody(T)*prof*(0.6+turb)*beam*2.4*uOpen;
 }
 // exotic filaments crawling over the mouth
 if(b<rho*1.25){
  float f=vfbm3(vec3(rdD*9.0)+vec3(0.0,uTime*0.5,0.0),4);
  col+=vec3(0.5,0.9,1.0)*pow(sat(f*1.5-0.55),2.0)*2.0*uOpen;
 }
 fragColor=vec4(mix(scene,col,sat(uOpen*1.2)),1.0);
}`;

const DBG={noComposite:false,noStars:false,noTerrain:false};
/* ===== SPHERE MESH ===== */
function sphereMesh(seg){
 const P=[],I=[];
 for(let j=0;j<=seg;j++){
  const v=j/seg*Math.PI, sv=Math.sin(v),cv=Math.cos(v);
  for(let i=0;i<=seg*2;i++){
   const u=i/(seg*2)*TAU;
   P.push(Math.cos(u)*sv,cv,Math.sin(u)*sv);
  }
 }
 const W=seg*2+1;
 for(let j=0;j<seg;j++)for(let i=0;i<seg*2;i++){
  const a=j*W+i,b=a+1,c=a+W,d=c+1;
  I.push(a,c,b,b,c,d);
 }
 return {position:new Float32Array(P),index:new Uint32Array(I)};
}
/* ===== PARTICLES ===== */
const PMAX=QUALITY.tier?2400:900;
const PART={n:0,pos:new Float32Array(PMAX*3),vel:new Float32Array(PMAX*3),
 life:new Float32Array(PMAX),max:new Float32Array(PMAX),size:new Float32Array(PMAX),
 col:new Float32Array(PMAX*3),drag:new Float32Array(PMAX),
 vb:null,buf:null,mesh:null};
function partEmit(px,py,pz,vx,vy,vz,life,size,r,g,b,drag){
 if(PART.n>=PMAX)return;
 const i=PART.n++;
 PART.pos[i*3]=px;PART.pos[i*3+1]=py;PART.pos[i*3+2]=pz;
 PART.vel[i*3]=vx;PART.vel[i*3+1]=vy;PART.vel[i*3+2]=vz;
 PART.life[i]=life;PART.max[i]=life;PART.size[i]=size;
 PART.col[i*3]=r;PART.col[i*3+1]=g;PART.col[i*3+2]=b;PART.drag[i]=drag||0;
}
function partUpdate(dt,gravAcc){
 for(let i=0;i<PART.n;i++){
  PART.life[i]-=dt;
  if(PART.life[i]<=0){
   const j=--PART.n;
   if(j!==i){for(let k=0;k<3;k++){PART.pos[i*3+k]=PART.pos[j*3+k];PART.vel[i*3+k]=PART.vel[j*3+k];
    PART.col[i*3+k]=PART.col[j*3+k];}
    PART.life[i]=PART.life[j];PART.max[i]=PART.max[j];PART.size[i]=PART.size[j];PART.drag[i]=PART.drag[j];}
   i--;continue;
  }
  const d=Math.exp(-PART.drag[i]*dt);
  for(let k=0;k<3;k++){
   PART.vel[i*3+k]=PART.vel[i*3+k]*d+gravAcc[k]*dt;
   PART.pos[i*3+k]+=PART.vel[i*3+k]*dt;
  }
 }
}
/* ===== PROGRAMS ===== */
let P_TERR,P_SPH,P_STAR,P_ATMO,P_SHIP,P_BRIGHT,P_BLUR,P_POST,P_PART,P_WORM;
let FB_SCENE,FB_COMP,FB_B1,FB_B2;
let MESH_SPHERE,MESH_SHIP,MESH_COCKPIT,MESH_PART;
const LEAVES=[];
function initGL(){
 P_TERR=prog(VS_TERRAIN,FS_TERRAIN,'terrain');
 P_SPH=prog(VS_SPHERE,FS_SPHERE,'sphere');
 P_STAR=prog(FSQUAD_VS,FS_STARS,'stars');
 P_ATMO=prog(FSQUAD_VS,FS_ATMO,'atmo');
 P_BRIGHT=prog(FSQUAD_VS,FS_BRIGHT,'bright');
 P_BLUR=prog(FSQUAD_VS,FS_BLUR,'blur');
 P_POST=prog(FSQUAD_VS,FS_POST,'post');
 P_PART=prog(VS_PART,FS_PART,'part');
 P_WORM=prog(FSQUAD_VS,FS_WORM,'worm');
 const svs=(typeof GLSL_SHIP_VS!=='undefined')?GLSL_SHIP_VS:GLSL_SHIP_VS_FB;
 const sfs=(typeof GLSL_SHIP_FS!=='undefined')?GLSL_SHIP_FS:GLSL_SHIP_FS_FB;
 P_SHIP=prog(svs,sfs,'ship');
 MESH_SPHERE=mesh(sphereMesh(48));
 MESH_SHIP=mesh((typeof shipBuild==='function')?shipBuild():shipBuildFB());
 MESH_COCKPIT=mesh((typeof shipBuildCockpit==='function')?shipBuildCockpit():shipBuildCockpitFB());
 // particle mesh: 6 verts per quad, attributes refreshed each frame
 const pv=new Float32Array(PMAX*6*3),pn=new Float32Array(PMAX*6*3),
       pu=new Float32Array(PMAX*6*2),pc=new Float32Array(PMAX*6*3);
 MESH_PART={pv:pv,pn:pn,pu:pu,pc:pc,
  vao:gl.createVertexArray(),bp:gl.createBuffer(),bn:gl.createBuffer(),
  bu:gl.createBuffer(),bc:gl.createBuffer()};
 gl.bindVertexArray(MESH_PART.vao);
 const bind=(buf,arr,loc,n)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,0,0);};
 bind(MESH_PART.bp,pv,0,3);bind(MESH_PART.bn,pn,1,3);bind(MESH_PART.bu,pu,2,2);bind(MESH_PART.bc,pc,3,3);
 gl.bindVertexArray(null);
 resize();
}
function resize(){
 const dpr=Math.min(devicePixelRatio||1,QUALITY.tier?2:1.5);
 const w=Math.max(1,Math.floor(innerWidth*dpr*QUALITY.scale));
 const h=Math.max(1,Math.floor(innerHeight*dpr*QUALITY.scale));
 canvas.width=w;canvas.height=h;
 CTX.W=w;CTX.H=h;
 const bw=Math.max(1,w>>2), bh=Math.max(1,h>>2);
 if(!FB_SCENE){FB_SCENE=fbo(w,h,{float:true,depth:true});FB_COMP=fbo(w,h,{float:true});
  FB_B1=fbo(bw,bh,{float:true});FB_B2=fbo(bw,bh,{float:true});}
 else{FB_SCENE.resize(w,h);FB_COMP.resize(w,h);FB_B1.resize(bw,bh);FB_B2.resize(bw,bh);}
}
addEventListener('resize',()=>{if(FB_SCENE)resize();});
/* ===== CAMERA ===== */
const _c0=v3(),_c1=v3(),_c2=v3(),_c3=v3();
function updateCamera(dt){
 if(CTX.view3rd){
  // orbit camera anchored to the ship's own frame
  const off=_c0;
  const cy=Math.cos(CAM.yaw),sy=Math.sin(CAM.yaw),cp=Math.cos(CAM.pitch),sp=Math.sin(CAM.pitch);
  vset(off,sy*cp,sp,cy*cp);
  qrot(_c1,SHIP.quat,off);
  vmad(CTX.camPos,SHIP.pos,_c1,CAM.dist);
  vsub(_c2,SHIP.pos,CTX.camPos);vnorm(_c2,_c2);
  qrot(_c3,SHIP.quat,v3(0,1,0));
  qlook(CTX.camQuat,_c2,_c3);
 } else {
  const L=SHIP.layout||SHIP_LAYOUT_FB;
  const e=L.eye||[0,0.55,-11.2];
  vset(_c0,e[0],e[1],e[2]);
  qrot(_c1,SHIP.quat,_c0);
  vadd(CTX.camPos,SHIP.pos,_c1);
  for(let i=0;i<4;i++)CTX.camQuat[i]=SHIP.quat[i];
 }
 if(CAM.shake>0.002){
  const s=CAM.shake*(CTX.view3rd?0.5:1.0);
  qaxis(_q1,Math.sin(CTX.t*61.0),Math.cos(CTX.t*47.0),Math.sin(CTX.t*83.0),s*0.022);
  qmul(_q2,CTX.camQuat,_q1);qnorm(CTX.camQuat,_q2);
 }
 qrot(CTX.camFwd,CTX.camQuat,v3(0,0,-1));
 qrot(CTX.camUp,CTX.camQuat,v3(0,1,0));
 qrot(CTX.camRight,CTX.camQuat,v3(1,0,0));
 CTX.fov=mix(1.02,1.42,sat(CTX.speed/9000)*0.5+ (WARPST.state==='tunnel'?0.9:0));
}
/* ===== RENDER ===== */
const _r0=v3(),_r1=v3(),_r2=v3(),_rot9=new Float32Array(9),_m4=new Float32Array(16);
function yawMat3(o,ang){const c=Math.cos(ang),s=Math.sin(ang);
 o[0]=c;o[1]=0;o[2]=s; o[3]=0;o[4]=1;o[5]=0; o[6]=-s;o[7]=0;o[8]=c;return o;}
function render(){
 const asp=CTX.W/CTX.H;
 m4persp(CTX.proj,CTX.fov,asp,NEAR,FAR);
 m4view(CTX.view,CTX.camQuat,v3(0,0,0));
 m4mul(CTX.viewProj,CTX.proj,CTX.view);
 const tanF=Math.tan(CTX.fov*0.5);
 // sun direction and screen position
 if(SUN){vsub(_r0,SUN.pos,CTX.camPos);vnorm(CTX.sunDir,_r0);}
 const setCam=P=>{
  if(P.u.uCamR)gl.uniform3f(P.u.uCamR,CTX.camRight[0],CTX.camRight[1],CTX.camRight[2]);
  if(P.u.uCamU)gl.uniform3f(P.u.uCamU,CTX.camUp[0],CTX.camUp[1],CTX.camUp[2]);
  if(P.u.uCamF)gl.uniform3f(P.u.uCamF,CTX.camFwd[0],CTX.camFwd[1],CTX.camFwd[2]);
  if(P.u.uTanF)gl.uniform1f(P.u.uTanF,tanF);
  if(P.u.uAspect)gl.uniform1f(P.u.uAspect,asp);
  if(P.u.uTime)gl.uniform1f(P.u.uTime,CTX.t);
 };
 FB_SCENE.bind();
 gl.clearColor(0,0,0,1);gl.clearDepth(1);
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.disable(gl.BLEND);
 // --- stars ---
 if(!DBG.noStars){
 gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
 P_STAR.use();setCam(P_STAR);
 if(P_STAR.u.uSeed)gl.uniform1f(P_STAR.u.uSeed,SYSTEM.id*13.7);
 drawQuad();}
 gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);
 gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
 // --- terrain of the dominant body ---
 const B=CTX.body;
 if(B&&B.kind!=='star'&&B.dna&&!DBG.noTerrain){
  terrBudget=QUALITY.tier?6:3;
  terrUpdate(B,CTX.camPos,QUALITY.steps.lod,LEAVES);
  P_TERR.use();
  gl.uniformMatrix4fv(P_TERR.u.uVP,false,CTX.viewProj);
  gl.uniform3f(P_TERR.u.uSunDir,CTX.sunDir[0],CTX.sunDir[1],CTX.sunDir[2]);
  gl.uniform3f(P_TERR.u.uSunCol,1.0,0.97,0.92);
  vsub(_r0,B.pos,CTX.camPos);
  gl.uniform3f(P_TERR.u.uPlanetC,_r0[0],_r0[1],_r0[2]);
  if(P_TERR.u.uPlanetR)gl.uniform1f(P_TERR.u.uPlanetR,B.radius);
  const tint=B.atmo?B.atmo.tint:[0.5,0.6,0.8];
  gl.uniform3f(P_TERR.u.uSkyTint,tint[0],tint[1],tint[2]);
  if(P_TERR.u.uAtmoAmt)gl.uniform1f(P_TERR.u.uAtmoAmt,B.atmo?1:0.12);
  if(P_TERR.u.uOceanLvl)gl.uniform1f(P_TERR.u.uOceanLvl,B.ocean?B.ocean.level:-1e9);
  yawMat3(_rot9,B.rot);
  gl.uniformMatrix3fv(P_TERR.u.uRot,false,_rot9);
  const c=Math.cos(B.rot),s=Math.sin(B.rot);
  for(const n of LEAVES){
   if(!n.mesh)continue;
   // must match uRot = yawMat3(B.rot) applied in the vertex shader
   const ox=n.off[0]*c-n.off[2]*s, oz=n.off[0]*s+n.off[2]*c;
   gl.uniform3f(P_TERR.u.uChunkOff,_r0[0]+ox,_r0[1]+n.off[1],_r0[2]+oz);
   n.mesh.draw();
  }
 }
 // --- other bodies as shaded spheres ---
 P_SPH.use();
 gl.uniformMatrix4fv(P_SPH.u.uVP,false,CTX.viewProj);
 gl.uniform3f(P_SPH.u.uSunCol,1.0,0.97,0.92);
 for(const b of BODIES){
  if(b===B&&b.kind!=='star'&&b.dna)continue;
  vsub(_r0,b.pos,CTX.camPos);
  const d=vlen(_r0);
  if(d>b.radius*90000)continue;
  if(b!==SUN){vsub(_r1,SUN.pos,b.pos);vnorm(_r1,_r1);}else vset(_r1,0,1,0);
  gl.uniform3f(P_SPH.u.uSunDir,_r1[0],_r1[1],_r1[2]);
  gl.uniform3f(P_SPH.u.uOff,_r0[0],_r0[1],_r0[2]);
  gl.uniform1f(P_SPH.u.uScale,b.radius);
  yawMat3(_rot9,b.rot);gl.uniformMatrix3fv(P_SPH.u.uRot,false,_rot9);
  gl.uniform3f(P_SPH.u.uCol,b.color[0],b.color[1],b.color[2]);
  gl.uniform3f(P_SPH.u.uEmis,b.emissive[0],b.emissive[1],b.emissive[2]);
  gl.uniform1f(P_SPH.u.uIsStar,b.kind==='star'?1:0);
  gl.uniform1f(P_SPH.u.uSeed,(b.dna?b.dna.seed:1)*7.3);
  gl.uniform1f(P_SPH.u.uType,b.dna?b.dna.type:0);
  const p=b.dna?b.dna.pal:[[.5,.5,.5],[.4,.4,.4],[.6,.6,.6]];
  gl.uniform3f(P_SPH.u.uPal0,p[0][0],p[0][1],p[0][2]);
  gl.uniform3f(P_SPH.u.uPal1,p[1][0],p[1][1],p[1][2]);
  gl.uniform3f(P_SPH.u.uPal2,p[2][0],p[2][1],p[2][2]);
  gl.uniform1f(P_SPH.u.uAtmoAmt,b.atmo?1:0);
  const t=b.atmo?b.atmo.tint:[0,0,0];
  gl.uniform3f(P_SPH.u.uAtmoTint,t[0],t[1],t[2]);
  MESH_SPHERE.draw();
 }
 // --- ship ---
 P_SHIP.use();
 gl.uniformMatrix4fv(P_SHIP.u.uVP,false,CTX.viewProj);
 vsub(_r0,SHIP.pos,CTX.camPos);
 gl.uniform3f(P_SHIP.u.uOff,_r0[0],_r0[1],_r0[2]);
 const q=SHIP.quat,x=q[0],y=q[1],z=q[2],w=q[3];
 _rot9[0]=1-2*(y*y+z*z);_rot9[1]=2*(x*y+z*w);_rot9[2]=2*(x*z-y*w);
 _rot9[3]=2*(x*y-z*w);_rot9[4]=1-2*(x*x+z*z);_rot9[5]=2*(y*z+x*w);
 _rot9[6]=2*(x*z+y*w);_rot9[7]=2*(y*z-x*w);_rot9[8]=1-2*(x*x+y*y);
 gl.uniformMatrix3fv(P_SHIP.u.uRot,false,_rot9);
 gl.uniform3f(P_SHIP.u.uSunDir,CTX.sunDir[0],CTX.sunDir[1],CTX.sunDir[2]);
 gl.uniform3f(P_SHIP.u.uSunCol,1.0,0.97,0.92);
 if(P_SHIP.u.uGear)gl.uniform1f(P_SHIP.u.uGear,SHIP.gearAnim);
 if(P_SHIP.u.uThrottle)gl.uniform1f(P_SHIP.u.uThrottle,SHIP.throttle);
 if(P_SHIP.u.uReentry)gl.uniform1f(P_SHIP.u.uReentry,CTX.reentryHeat);
 if(P_SHIP.u.uTime)gl.uniform1f(P_SHIP.u.uTime,CTX.t);
 if(B){vsub(_r1,B.pos,SHIP.pos);vnorm(_r1,_r1);
  gl.uniform3f(P_SHIP.u.uPlanetDir,_r1[0],_r1[1],_r1[2]);
  gl.uniform3f(P_SHIP.u.uPlanetCol,B.color[0],B.color[1],B.color[2]);
  const amt=sat(1.4-CTX.altitude/(B.radius*1.2));
  gl.uniform1f(P_SHIP.u.uPlanetAmt,amt);
 } else {gl.uniform3f(P_SHIP.u.uPlanetDir,0,1,0);gl.uniform1f(P_SHIP.u.uPlanetAmt,0);}
 if(P_SHIP.u.uVelDir){vnorm(_r2,SHIP.vel);
  if(B){vsub(_r2,SHIP.vel,B.vel);vnorm(_r2,_r2);}
  gl.uniform3f(P_SHIP.u.uVelDir,_r2[0],_r2[1],_r2[2]);}
 // engine point lights
 if(P_SHIP.u.uNLights){
  const L=SHIP.layout||SHIP_LAYOUT_FB;
  const n=Math.min(L.engines.length,8);
  const lp=new Float32Array(24),lc=new Float32Array(24);
  for(let i=0;i<n;i++){
   const e=L.engines[i];
   vset(_r1,e.pos[0],e.pos[1],e.pos[2]+4.0);
   qrot(_r2,SHIP.quat,_r1);
   lp[i*3]=_r0[0]+_r2[0];lp[i*3+1]=_r0[1]+_r2[1];lp[i*3+2]=_r0[2]+_r2[2];
   const t=SHIP.throttle*6.0;
   lc[i*3]=t*0.55;lc[i*3+1]=t*0.72;lc[i*3+2]=t*1.0;
  }
  gl.uniform1i(P_SHIP.u.uNLights,n);
  gl.uniform3fv(P_SHIP.u.uLightP,lp);gl.uniform3fv(P_SHIP.u.uLightC,lc);
 }
 if(CTX.view3rd)MESH_SHIP.draw();
 else {gl.cullFace(gl.FRONT);MESH_COCKPIT.draw();gl.cullFace(gl.BACK);}
 // --- particles ---
 if(PART.n>0){
  const pv=MESH_PART.pv,pn=MESH_PART.pn,pu=MESH_PART.pu,pc=MESH_PART.pc;
  let k=0;
  for(let i=0;i<PART.n;i++){
   const l=PART.life[i]/PART.max[i];
   for(let c=0;c<6;c++){
    pv[k*3]=PART.pos[i*3]-CTX.camPos[0]+SHIP.pos[0]*0;   // already camera-relative on emit
    pv[k*3]=PART.pos[i*3];pv[k*3+1]=PART.pos[i*3+1];pv[k*3+2]=PART.pos[i*3+2];
    pn[k*3]=PART.vel[i*3];pn[k*3+1]=PART.vel[i*3+1];pn[k*3+2]=PART.vel[i*3+2];
    pu[k*2]=PART.size[i]*(0.35+l*0.9);pu[k*2+1]=l;
    pc[k*3]=PART.col[i*3]*l;pc[k*3+1]=PART.col[i*3+1]*l;pc[k*3+2]=PART.col[i*3+2]*l;
    k++;
   }
  }
  gl.bindVertexArray(MESH_PART.vao);
  const up=(buf,arr,n)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buf);
   gl.bufferSubData(gl.ARRAY_BUFFER,0,arr,0,n*3);};
  gl.bindBuffer(gl.ARRAY_BUFFER,MESH_PART.bp);gl.bufferSubData(gl.ARRAY_BUFFER,0,pv,0,k*3);
  gl.bindBuffer(gl.ARRAY_BUFFER,MESH_PART.bn);gl.bufferSubData(gl.ARRAY_BUFFER,0,pn,0,k*3);
  gl.bindBuffer(gl.ARRAY_BUFFER,MESH_PART.bu);gl.bufferSubData(gl.ARRAY_BUFFER,0,pu,0,k*2);
  gl.bindBuffer(gl.ARRAY_BUFFER,MESH_PART.bc);gl.bufferSubData(gl.ARRAY_BUFFER,0,pc,0,k*3);
  P_PART.use();
  gl.uniformMatrix4fv(P_PART.u.uVP,false,CTX.viewProj);
  gl.uniform3f(P_PART.u.uCamR,CTX.camRight[0],CTX.camRight[1],CTX.camRight[2]);
  gl.uniform3f(P_PART.u.uCamU,CTX.camUp[0],CTX.camUp[1],CTX.camUp[2]);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLES,0,k);
  gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);
 }
 // --- planet composite: ocean + clouds + atmosphere ---
 gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);
 if(DBG.noComposite){
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,CTX.W,CTX.H);
  P_POST.use();bindTex(P_POST,'uScene',FB_SCENE.tex[0],0);
  bindTex(P_POST,'uBloom',FB_SCENE.tex[0],1);
  gl.uniform1f(P_POST.u.uExposure,1);gl.uniform1f(P_POST.u.uBloomAmt,0);
  gl.uniform1f(P_POST.u.uGodray,0);gl.uniform1f(P_POST.u.uGrain,0);
  gl.uniform1f(P_POST.u.uWarp,0);gl.uniform1f(P_POST.u.uHeat,0);
  gl.uniform1f(P_POST.u.uCA,0);gl.uniform1f(P_POST.u.uVignette,0);
  drawQuad();
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.enable(gl.CULL_FACE);CTX.frame++;return;
 }
 FB_COMP.bind();
 P_ATMO.use();setCam(P_ATMO);
 bindTex(P_ATMO,'uScene',FB_SCENE.tex[0],0);
 bindTex(P_ATMO,'uDepth',FB_SCENE.depthTex,1);
 const AB=B&&B.kind!=='star'?B:null;
 if(AB){
  vsub(_r0,AB.pos,CTX.camPos);
  gl.uniform3f(P_ATMO.u.uPlanetC,_r0[0],_r0[1],_r0[2]);
  gl.uniform1f(P_ATMO.u.uPlanetR,AB.radius);
  const at=AB.atmo;
  gl.uniform1f(P_ATMO.u.uAtmoTop,AB.radius+(at?at.height:1));
  gl.uniform3f(P_ATMO.u.uRay,at?at.rayleigh[0]:0,at?at.rayleigh[1]:0,at?at.rayleigh[2]:0);
  gl.uniform1f(P_ATMO.u.uMie,at?at.mie:0);
  gl.uniform1f(P_ATMO.u.uRhoScale,at?1:0);
  gl.uniform1f(P_ATMO.u.uScaleH,at?at.scaleH:8000);
  const t=at?at.tint:[0,0,0];
  gl.uniform3f(P_ATMO.u.uTint,t[0],t[1],t[2]);
  gl.uniform1f(P_ATMO.u.uHasOcean,AB.ocean?1:0);
  gl.uniform1f(P_ATMO.u.uOceanLvl,AB.ocean?AB.ocean.level:0);
  if(AB.ocean){
   gl.uniform3f(P_ATMO.u.uOceanCol,AB.ocean.color[0],AB.ocean.color[1],AB.ocean.color[2]);
   gl.uniform3f(P_ATMO.u.uOceanDeep,AB.ocean.deep[0],AB.ocean.deep[1],AB.ocean.deep[2]);
   gl.uniform1f(P_ATMO.u.uOceanKind,AB.ocean.kind==='lava'?2:(AB.ocean.kind==='methane'?1:0));
  }
  const hasCloud=QUALITY.clouds&&at&&at.height>2e4&&AB.dna&&AB.dna.type!==5?1:0;
  gl.uniform1f(P_ATMO.u.uHasCloud,hasCloud);
  gl.uniform1f(P_ATMO.u.uCloudLo,at?at.height*0.030:0);
  gl.uniform1f(P_ATMO.u.uCloudHi,at?at.height*0.115:1);
  gl.uniform1f(P_ATMO.u.uCloudCov,AB.dna?sat(AB.dna.humidity*0.78):0.35);
 } else {
  gl.uniform1f(P_ATMO.u.uPlanetR,1);gl.uniform1f(P_ATMO.u.uAtmoTop,1);
  gl.uniform3f(P_ATMO.u.uPlanetC,0,-1e12,0);
  gl.uniform1f(P_ATMO.u.uHasOcean,0);gl.uniform1f(P_ATMO.u.uHasCloud,0);
  gl.uniform1f(P_ATMO.u.uRhoScale,0);
 }
 gl.uniform3f(P_ATMO.u.uSunDir,CTX.sunDir[0],CTX.sunDir[1],CTX.sunDir[2]);
 gl.uniform3f(P_ATMO.u.uSunCol,1.0,0.97,0.92);
 gl.uniform1i(P_ATMO.u.uAtmoSteps,QUALITY.steps.atmo);
 gl.uniform1i(P_ATMO.u.uCloudSteps,QUALITY.steps.cloud);
 gl.uniform1i(P_ATMO.u.uCloudLightSteps,QUALITY.steps.cloudLight);
 drawQuad();
 let SRC=FB_COMP.tex[0];
 // --- wormhole ---
 if(WARPST.open>0.001||WARPST.state==='tunnel'){
  FB_SCENE.bind();
  P_WORM.use();setCam(P_WORM);
  bindTex(P_WORM,'uScene',SRC,0);
  vsub(_r0,WARPST.mouth,CTX.camPos);
  gl.uniform3f(P_WORM.u.uMouth,_r0[0],_r0[1],_r0[2]);
  gl.uniform1f(P_WORM.u.uThroat,240);
  gl.uniform1f(P_WORM.u.uOpen,WARPST.open);
  gl.uniform1f(P_WORM.u.uTunnel,WARPST.state==='tunnel'?
   Math.min(1,Math.min(WARPST.t,4.2-WARPST.t)*2.2):0);
  gl.uniform1f(P_WORM.u.uSeed,((WARPST.targetSys||0)*7.3+3.1));
  gl.uniform1i(P_WORM.u.uWhSteps,QUALITY.steps.wh);
  drawQuad();
  SRC=FB_SCENE.tex[0];
 }
 // --- bloom ---
 FB_B1.bind();
 P_BRIGHT.use();bindTex(P_BRIGHT,'uTex',SRC,0);
 gl.uniform1f(P_BRIGHT.u.uThresh,1.15);
 drawQuad();
 for(let i=0;i<(QUALITY.tier?3:2);i++){
  FB_B2.bind();P_BLUR.use();bindTex(P_BLUR,'uTex',FB_B1.tex[0],0);
  gl.uniform2f(P_BLUR.u.uDir,1.4/FB_B1.w,0);drawQuad();
  FB_B1.bind();P_BLUR.use();bindTex(P_BLUR,'uTex',FB_B2.tex[0],0);
  gl.uniform2f(P_BLUR.u.uDir,0,1.4/FB_B1.h);drawQuad();
 }
 // --- final post ---
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 gl.viewport(0,0,CTX.W,CTX.H);
 P_POST.use();
 bindTex(P_POST,'uScene',SRC,0);
 bindTex(P_POST,'uBloom',FB_B1.tex[0],1);
 gl.uniform1f(P_POST.u.uExposure,CTX.exposure);
 gl.uniform1f(P_POST.u.uTime,CTX.t);
 gl.uniform1f(P_POST.u.uBloomAmt,0.85);
 gl.uniform1f(P_POST.u.uVignette,0.42);
 gl.uniform1f(P_POST.u.uCA,0.30+CTX.reentryHeat*2.2+(WARPST.state==='tunnel'?4:0));
 gl.uniform1f(P_POST.u.uGrain,0.020);
 gl.uniform1f(P_POST.u.uWarp,WARPST.state==='tunnel'?0.9:WARPST.open*0.25);
 gl.uniform1f(P_POST.u.uHeat,CTX.reentryHeat*0.8);
 gl.uniform1f(P_POST.u.uGodray,QUALITY.godrays?0.55:0);
 // project the star to screen space for flares and god rays
 let sv=0,su=0.5,svv=0.5;
 if(SUN){
  vsub(_r0,SUN.pos,CTX.camPos);vnorm(_r1,_r0);
  const fz=vdot(_r1,CTX.camFwd);
  if(fz>0.05){
   const rx=vdot(_r1,CTX.camRight)/(fz*tanF*asp), ry=vdot(_r1,CTX.camUp)/(fz*tanF);
   su=rx*0.5+0.5;svv=ry*0.5+0.5;
   sv=sat(1.0-Math.max(Math.abs(rx),Math.abs(ry))*0.6)*sat(fz*3.0);
   if(B&&B.kind!=='star'){ // the planet body occludes the star
    const t=vsub(_r2,B.pos,CTX.camPos);
    const along=vdot(t,_r1);
    if(along>0){
     const perp=Math.sqrt(Math.max(0,vlen2(t)-along*along));
     if(perp<B.radius)sv=0;
    }
   }
  }
 }
 gl.uniform2f(P_POST.u.uSunUV,su,svv);
 gl.uniform1f(P_POST.u.uSunVis,sv);
 gl.uniform3f(P_POST.u.uSunCol,1.0,0.94,0.82);
 drawQuad();
 gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.enable(gl.CULL_FACE);
 CTX.frame++;
}
/* ===== EFFECTS DRIVEN BY SHIP STATE ===== */
const _e0=v3(),_e1=v3(),_e2=v3();
function spawnFX(dt){
 const L=SHIP.layout||SHIP_LAYOUT_FB;
 // engine plume
 if(SHIP.throttle>0.02&&SHIP.fuel>0){
  const n=Math.min(3,Math.ceil(SHIP.throttle*3));
  for(const e of L.engines){
   for(let i=0;i<n;i++){
    vset(_e0,e.pos[0],e.pos[1],e.pos[2]+2.0);
    qrot(_e1,SHIP.quat,_e0);
    vadd(_e1,_e1,SHIP.pos);
    vsub(_e1,_e1,CTX.camPos);
    qrot(_e2,SHIP.quat,v3((Math.random()-.5)*7,(Math.random()-.5)*7,26+Math.random()*46));
    const vac=1-CTX.atmoDensity;
    const spread=1+vac*3.2;                 // underexpanded bell in vacuum
    partEmit(_e1[0],_e1[1],_e1[2],
     _e2[0]*spread,_e2[1]*spread,_e2[2],
     0.55+Math.random()*0.5,2.4+Math.random()*3.2*spread,
     2.2*SHIP.throttle,1.5*SHIP.throttle,1.0*SHIP.throttle,0.6);
   }
  }
 }
 // re-entry plasma trail
 if(CTX.reentryHeat>0.05){
  const n=Math.ceil(CTX.reentryHeat*4);
  for(let i=0;i<n;i++){
   vset(_e0,(Math.random()-.5)*9,(Math.random()-.5)*9,-16+Math.random()*8);
   qrot(_e1,SHIP.quat,_e0);
   vadd(_e1,_e1,SHIP.pos);vsub(_e1,_e1,CTX.camPos);
   vnorm(_e2,SHIP.vel);
   const h=CTX.reentryHeat;
   partEmit(_e1[0],_e1[1],_e1[2],-_e2[0]*260,-_e2[1]*260,-_e2[2]*260,
    0.7+Math.random()*0.8,3.0+Math.random()*5.0,
    2.6*h,1.1*h*h,0.5*h*h*h,0.35);
  }
 }
 // landing dust: ballistic on airless worlds, billowing in atmosphere
 if(CTX.body&&CTX.altitude<180&&SHIP.throttle>0.05){
  const air=CTX.atmoDensity>0.01;
  const n=air?4:3;
  for(let i=0;i<n;i++){
   worldToBodyDir(CTX.body,SHIP.pos,_e0);
   biomeColor(_e0[0],_e0[1],_e0[2],0,0,CTX.body.dna,_bc,0);
   vsub(_e1,SHIP.pos,CTX.camPos);
   const a=Math.random()*TAU, sp=air?(12+Math.random()*24):(30+Math.random()*70);
   vsub(_e2,SHIP.pos,CTX.body.pos);vnorm(_e2,_e2);
   partEmit(_e1[0],_e1[1]-6,_e1[2],
    Math.cos(a)*sp,_e2[1]*sp*0.3,Math.sin(a)*sp,
    air?1.8:2.6,air?5:3,_bc[0]*1.4,_bc[1]*1.3,_bc[2]*1.2,air?0.9:0.02);
  }
 }
 // RCS puffs
 if(SHIP.rcsOn&&vlen(SHIP.rcs)>0.06&&Math.random()<0.7){
  const p=L.rcs[(Math.random()*L.rcs.length)|0];
  vset(_e0,p[0],p[1],p[2]);
  qrot(_e1,SHIP.quat,_e0);vadd(_e1,_e1,SHIP.pos);vsub(_e1,_e1,CTX.camPos);
  qrot(_e2,SHIP.quat,v3((Math.random()-.5)*22,(Math.random()-.5)*22,(Math.random()-.5)*22));
  partEmit(_e1[0],_e1[1],_e1[2],_e2[0],_e2[1],_e2[2],0.30,1.0,0.9,1.0,1.3,2.2);
 }
}
/* ===== BOOT + LOOP ===== */
let lastT=0, fpsAcc=0, fpsN=0, fpsShow=0;
const _g0=v3();
function frame(now){
 requestAnimationFrame(frame);
 const raw=(now-lastT)/1000; lastT=now;
 if(!isFinite(raw)||raw<=0)return;
 let dt=Math.min(raw,1/15);
 fpsAcc+=raw;fpsN++;
 if(fpsAcc>0.5){fpsShow=fpsN/fpsAcc;fpsAcc=0;fpsN=0;
  $('fps').textContent=fpsShow.toFixed(0)+' FPS · '+PART.n+' PT · '+LEAVES.length+' CH · T'+QUALITY.tier;}
 if(CTX.paused)return;
 const warp=(WARPST.state==='idle')?CTX.timeWarp:1;
 const sim=dt*warp;
 CTX.t+=sim;CTX.dt=dt;
 worldStep(CTX.t,sim);
 // sub-step so high warp stays stable
 const steps=clamp(Math.ceil(warp/8),1,8);
 for(let i=0;i<steps;i++)fltUpdate(sim/steps);
 warpUpdate(dt);
 updateCamera(dt);
 vset(_g0,0,0,0);
 if(CTX.body){
  vsub(_g0,CTX.body.pos,SHIP.pos);
  const d=vlen(_g0);vscl(_g0,_g0,CTX.body.mu/(d*d*d));
 }
 spawnFX(dt);
 partUpdate(dt,_g0);
 render();
 updateHUD(dt);
}
function boot(){
 const bar=$('bar').firstElementChild, bm=$('bmsg');
 const steps=[
  ['GENERATING SOLAR SYSTEM',()=>{loadSystem(0);worldStep(0,0);}],
  ['COMPILING SHADERS',()=>{initGL();}],
  ['ASSEMBLING VESSEL',()=>{fltInit();}],
  ['BINDING CONTROLS',()=>{buildHUD();fltBindInput(canvas);bindSticks();}],
  ['ENTERING ORBIT',()=>{}]
 ];
 let i=0;
 const next=()=>{
  if(i>=steps.length){
   $('boot').style.opacity=0;
   setTimeout(()=>{$('boot').style.display='none';},900);
   message('STELLAR EXPANSE',
    'You are in a 420 km orbit over Earth.<br>'+
    (IS_MOBILE?'Right stick to steer · left stick up for throttle · CREATE WORMHOLE to jump'
              :'W/A/S/D pitch &amp; yaw · Q/E roll · Shift/Ctrl throttle · G gear · T SAS · C view · drag to look'));
   lastT=performance.now();requestAnimationFrame(frame);
   return;
  }
  bm.textContent=steps[i][0];
  bar.style.width=((i+1)/steps.length*100)+'%';
  try{steps[i][1]();}catch(err){
   bm.innerHTML='<span style="color:#f66">FAILED: '+steps[i][0]+'</span><br>'+
     '<span style="font-size:9px">'+String(err.message||err).slice(0,400)+'</span>';
   throw err;
  }
  i++;setTimeout(next,40);
 };
 next();
}
window.SEGDBG={DBG:DBG,QUALITY:QUALITY,CTX:CTX,SHIP:SHIP,PART:PART,
 LEAVES:LEAVES,get BODIES(){return BODIES;},startWarp:startWarp,WARPST:WARPST,warpUpdate:warpUpdate};
boot();
