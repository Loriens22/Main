import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================ utils */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const R = mulberry32(20260705);
const rand=(a=1,b)=> b===undefined ? R()*a : a+R()*(b-a);
const randi=(a,b)=> Math.floor(rand(a,b+1));
const pick=arr=> arr[Math.floor(R()*arr.length)];

function makeTex(w,h,fn,opts={}){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  fn(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8;
  if(!opts.linear) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function noise(g,w,h,n,cols,rmin,rmax,alpha){
  for(let i=0;i<n;i++){
    g.fillStyle=cols[(Math.random()*cols.length)|0];
    g.globalAlpha=alpha*(0.4+Math.random()*0.6);
    const r=rmin+Math.random()*(rmax-rmin);
    g.beginPath(); g.arc(Math.random()*w,Math.random()*h,r,0,7); g.fill();
  }
  g.globalAlpha=1;
}
function scaleUV(g,sx,sy){
  const uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){ uv.setXY(i, uv.getX(i)*sx, uv.getY(i)*sy); }
  return g;
}

/* ============================================================ textures */
const stuccoT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#f3f2ec'; g.fillRect(0,0,w,h);
  noise(g,w,h,2600,['#e8e6df','#faf9f4','#eceae2'],.6,2.4,.35);
  g.strokeStyle='rgba(90,90,88,0.13)'; g.lineWidth=1.6;
  for(let i=0;i<=2;i++){const p=i*w/2; g.beginPath();g.moveTo(p,0);g.lineTo(p,h);g.stroke(); g.beginPath();g.moveTo(0,p);g.lineTo(w,p);g.stroke();}
});
const darkPanelT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#34383c'; g.fillRect(0,0,w,h);
  noise(g,w,h,2200,['#2c3034','#3c4146','#31363a'],.6,2.6,.4);
  g.strokeStyle='rgba(0,0,0,0.25)'; g.lineWidth=1.6;
  for(let i=0;i<=2;i++){const p=i*w/2; g.beginPath();g.moveTo(p,0);g.lineTo(p,h);g.stroke(); g.beginPath();g.moveTo(0,p);g.lineTo(w,p);g.stroke();}
});
const anthrT = makeTex(256,256,(g,w,h)=>{
  g.fillStyle='#2a2d31'; g.fillRect(0,0,w,h);
  noise(g,w,h,900,['#24272a','#33373b'],.6,2.4,.4);
});
function woodTex(vertical){
  return makeTex(512,512,(g,w,h)=>{
    g.fillStyle='#876444'; g.fillRect(0,0,w,h);
    if(vertical){ g.translate(w/2,h/2); g.rotate(Math.PI/2); g.translate(-w/2,-h/2); }
    for(let i=0;i<200;i++){
      const y=Math.random()*h, len=60+Math.random()*450, x=Math.random()*w;
      g.strokeStyle=Math.random()<.5?'rgba(96,68,42,0.5)':'rgba(168,132,92,0.45)';
      g.lineWidth=.6+Math.random()*2.6;
      g.beginPath(); g.moveTo(x-len/2,y);
      g.bezierCurveTo(x-len/6,y+Math.random()*6-3, x+len/6,y+Math.random()*6-3, x+len/2,y);
      g.stroke();
    }
    for(let i=0;i<9;i++){
      const x=Math.random()*w,y=Math.random()*h;
      g.strokeStyle='rgba(80,50,22,0.55)'; g.lineWidth=1.4;
      g.beginPath(); g.ellipse(x,y,3+Math.random()*4,2+Math.random()*2,0,0,7); g.stroke();
    }
    for(let i=0;i<26;i++){
      g.fillStyle='rgba(60,40,20,0.10)';
      g.fillRect(0,Math.random()*h,w,4+Math.random()*16);
    }
  });
}
const woodHT = woodTex(false), woodVT = woodTex(true);
const brickT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#c9b9a4'; g.fillRect(0,0,w,h);
  const bh=h/16, bw=w/6;
  for(let r=0;r<16;r++){
    const off=(r%2)*bw/2;
    for(let cB=-1;cB<7;cB++){
      const cols=['#9c4f2c','#8a4527','#a35a33','#7e3d23','#94502f'];
      g.fillStyle=cols[(Math.random()*cols.length)|0];
      g.fillRect(off+cB*bw+2, r*bh+2, bw-4, bh-4);
    }
  }
  noise(g,w,h,900,['#00000022','#ffffff14'],.5,2,.5);
});
const greenWallT = makeTex(256,512,(g,w,h)=>{
  g.fillStyle='#26401d'; g.fillRect(0,0,w,h);
  noise(g,w,h,5200,['#3f6b2a','#578c37','#2e5321','#6ba03f','#243d19'],1.2,3.6,.85);
});
const leafyAlphaT = makeTex(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let x=4;x<w;x+=7){
    const len=h*(0.3+Math.random()*0.65); let px=x;
    for(let y=0;y<len;y+=6){
      px+=Math.random()*4-2;
      g.fillStyle=['#3f6b2a','#578c37','#2e5321','#69a83e'][(Math.random()*4)|0];
      g.beginPath(); g.arc(px,y,2.4+Math.random()*2.2,0,7); g.fill();
    }
  }
});
const railMeshT = makeTex(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.strokeStyle='#1b1d20'; g.lineWidth=3;
  for(let i=-h;i<w+h;i+=10){
    g.beginPath(); g.moveTo(i,0); g.lineTo(i+h,h); g.stroke();
    g.beginPath(); g.moveTo(i+h,0); g.lineTo(i,h); g.stroke();
  }
  g.strokeStyle='#232629'; g.lineWidth=5;
  g.strokeRect(0,2,w,h-4);
});
const railSlatT = makeTex(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  g.fillStyle='#212428';
  for(let y=4;y<h;y+=16) g.fillRect(0,y,w,8);
});
const grassT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#5b8a33'; g.fillRect(0,0,w,h);
  noise(g,w,h,5200,['#4d7a2a','#699d3c','#548432','#71a845','#436f24'],.8,3,.6);
});
const asphaltT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#3d4045'; g.fillRect(0,0,w,h);
  noise(g,w,h,4200,['#35383c','#46494e','#3a3d41','#505358'],.5,1.8,.55);
});
const paveT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#cfc9bd'; g.fillRect(0,0,w,h);
  noise(g,w,h,2400,['#c4bdb0','#d8d3c8','#bfb9ac'],.7,2.4,.5);
  g.strokeStyle='rgba(80,78,70,0.18)'; g.lineWidth=1.4;
  for(let i=0;i<=4;i++){const p=i*w/4;
    g.beginPath();g.moveTo(p,0);g.lineTo(p,h);g.stroke();
    g.beginPath();g.moveTo(0,p);g.lineTo(w,p);g.stroke();}
});
const concreteT = makeTex(256,256,(g,w,h)=>{
  g.fillStyle='#b6b2a8'; g.fillRect(0,0,w,h);
  noise(g,w,h,1400,['#aca89e','#c0bcb2','#a5a198'],.6,2.2,.5);
});
const stoneT = makeTex(256,256,(g,w,h)=>{
  g.fillStyle='#7c7d7a'; g.fillRect(0,0,w,h);
  for(let i=0;i<420;i++){
    g.fillStyle=['#8f918d','#6d6f6b','#a3a5a0','#5f615d','#b7b9b3'][(Math.random()*5)|0];
    g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,3+Math.random()*7,2+Math.random()*5,Math.random()*3,0,7); g.fill();
    g.strokeStyle='rgba(30,30,30,0.35)'; g.lineWidth=.8; g.stroke();
  }
  g.strokeStyle='rgba(20,22,24,0.8)'; g.lineWidth=2.5;
  for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let y=0;y<=h;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
});
const solarT = makeTex(256,256,(g,w,h)=>{
  g.fillStyle='#0e1e3a'; g.fillRect(0,0,w,h);
  g.strokeStyle='#8aa2c8'; g.lineWidth=2;
  for(let x=0;x<=w;x+=32){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let y=0;y<=h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  g.fillStyle='rgba(255,255,255,0.10)'; g.fillRect(0,0,w/3,h);
});
const winGridT = makeTex(256,512,(g,w,h)=>{
  g.fillStyle='#c9c6be'; g.fillRect(0,0,w,h);
  noise(g,w,h,700,['#bdbab2','#d4d1c9'],.8,2.6,.5);
  for(let y=12;y<h;y+=64) for(let x=10;x<w;x+=52){
    g.fillStyle=Math.random()<.8?'#242b32':'#b9c9d4';
    g.fillRect(x,y,34,40);
    g.fillStyle='rgba(255,255,255,0.25)'; g.fillRect(x,y,34,6);
  }
});
/* interior atlas: 4x4 rooms */
const ATLAS_N=4;
const roomAtlasT = makeTex(1024,1024,(g)=>{
  const S=256;
  for(let ry=0; ry<ATLAS_N; ry++) for(let rx=0; rx<ATLAS_N; rx++){
    const x0=rx*S, y0=ry*S, lit=Math.random()<.55;
    g.save(); g.translate(x0,y0);
    g.fillStyle=['#efe9df','#e6e0d4','#ddd8ce','#e9e4dc'][(Math.random()*4)|0];
    g.fillRect(0,0,S,S);
    g.fillStyle='#a8813f'; g.fillRect(0,S*0.78,S,S*0.22);           // floor
    g.fillStyle='rgba(120,90,50,0.5)';
    for(let i=0;i<7;i++) g.fillRect(0,S*0.78+i*8,S,2);              // planks
    g.fillStyle=['#8b8f94','#b9a98e','#7d8894'][(Math.random()*3)|0];  // sofa / bed
    g.fillRect(S*0.12,S*0.6,S*0.42,S*0.2);
    g.fillRect(S*0.12,S*0.5,S*0.09,S*0.15);
    g.fillStyle='#4c433a'; g.fillRect(S*0.66,S*0.55,S*0.2,S*0.25);  // cabinet
    g.fillStyle=['#b04a3a','#3a6b8c','#c8a24a'][(Math.random()*3)|0]; // art
    g.fillRect(S*0.62,S*0.16,S*0.26,S*0.2);
    g.strokeStyle='#2c2c2c'; g.lineWidth=4; g.strokeRect(S*0.62,S*0.16,S*0.26,S*0.2);
    g.fillStyle='#2f4a26';                                          // plant
    g.beginPath(); g.arc(S*0.08,S*0.55,S*0.07,0,7); g.fill();
    g.strokeStyle='#333'; g.lineWidth=3;                            // pendant
    g.beginPath(); g.moveTo(S*0.35,0); g.lineTo(S*0.35,S*0.14); g.stroke();
    g.fillStyle=lit?'#ffd98a':'#777';
    g.beginPath(); g.arc(S*0.35,S*0.17,9,0,7); g.fill();
    if(lit){
      const gr=g.createRadialGradient(S*0.4,S*0.3,10,S*0.4,S*0.35,S*0.85);
      gr.addColorStop(0,'rgba(255,214,140,0.55)'); gr.addColorStop(1,'rgba(255,190,110,0.05)');
      g.fillStyle=gr; g.fillRect(0,0,S,S);
    } else {
      g.fillStyle='rgba(20,30,45,0.55)'; g.fillRect(0,0,S,S);
    }
    g.restore();
  }
});
roomAtlasT.wrapS=roomAtlasT.wrapT=THREE.ClampToEdgeWrapping;
const cloudT = makeTex(256,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let i=0;i<9;i++){
    const x=w*0.2+Math.random()*w*0.6, y=h*0.35+Math.random()*h*0.3, r=18+Math.random()*30;
    const gr=g.createRadialGradient(x,y,2,x,y,r);
    gr.addColorStop(0,'rgba(255,255,255,0.85)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
});
const glowT = makeTex(128,128,(g,w,h)=>{
  const gr=g.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);
  gr.addColorStop(0,'rgba(255,225,170,0.9)'); gr.addColorStop(1,'rgba(255,225,170,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
});
const rayT = makeTex(256,256,(g,w,h)=>{
  const gr=g.createRadialGradient(w/2,h/2,4,w/2,h/2,w/2);
  gr.addColorStop(0,'rgba(255,235,190,0.55)'); gr.addColorStop(0.5,'rgba(255,220,160,0.16)'); gr.addColorStop(1,'rgba(255,220,160,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
});

/* ============================================================ renderer / scene */
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xdfe9f0,320,1150);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,0.5,2600);
camera.position.set(150,150,185);

const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),0.06).texture;

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.06;
controls.maxPolarAngle=Math.PI*0.495;
controls.minDistance=6; controls.maxDistance=650;
controls.target.set(0,10,-4);

const sun=new THREE.DirectionalLight(0xfff2dd,3.2);
sun.position.set(140,190,90);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-190; sun.shadow.camera.right=190;
sun.shadow.camera.top=190; sun.shadow.camera.bottom=-190;
sun.shadow.camera.near=20; sun.shadow.camera.far=700;
sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03;
scene.add(sun); scene.add(sun.target);
const hemi=new THREE.HemisphereLight(0xbcd8f2,0x6d7a58,0.6);
scene.add(hemi);

/* sky dome */
const skyUni={
  cTop:{value:new THREE.Color(0x3877cf)},
  cHor:{value:new THREE.Color(0xdfe9f0)},
  cSun:{value:new THREE.Color(0xfff0d0)},
  sunDir:{value:new THREE.Vector3(1,1,0.6).normalize()},
  haze:{value:0.5}
};
const skyMat=new THREE.ShaderMaterial({
  uniforms:skyUni, side:THREE.BackSide, depthWrite:false, fog:false,
  vertexShader:'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:`varying vec3 vP; uniform vec3 cTop,cHor,cSun,sunDir; uniform float haze;
    void main(){ vec3 d=normalize(vP); float t=clamp(d.y,0.0,1.0);
      vec3 col=mix(cHor,cTop,pow(t,0.55));
      float s=pow(max(dot(d,normalize(sunDir)),0.0),90.0);
      float s2=pow(max(dot(d,normalize(sunDir)),0.0),7.0);
      col+=cSun*(s*1.4+s2*0.38*haze);
      gl_FragColor=vec4(col,1.0); }`
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500,32,18),skyMat));

/* ============================================================ materials */
const uTime={value:0};
function std(o){ return new THREE.MeshStandardMaterial(o); }
const M={
  white:  std({map:stuccoT, roughness:.62, metalness:0}),
  dark:   std({map:darkPanelT, roughness:.5, metalness:.25}),
  anthr:  std({map:anthrT, roughness:.55, metalness:.2}),
  wood:   std({map:woodHT, roughness:.6, metalness:0}),
  woodV:  std({map:woodVT, roughness:.6, metalness:0}),
  brick:  std({map:brickT, roughness:.8, metalness:0}),
  glass:  std({color:0x2c414e, metalness:.92, roughness:.07, envMapIntensity:2.1, transparent:true, opacity:.5}),
  frame:  std({color:0x191b1e, roughness:.38, metalness:.7}),
  railM:  std({map:railMeshT, transparent:true, alphaTest:.35, side:THREE.DoubleSide, roughness:.5, metalness:.6, color:0xffffff}),
  railS:  std({map:railSlatT, transparent:true, alphaTest:.35, side:THREE.DoubleSide, roughness:.5, metalness:.6, color:0xffffff}),
  glassR: std({color:0xa9c8d2, transparent:true, opacity:.3, roughness:.06, metalness:.5, side:THREE.DoubleSide, envMapIntensity:1.4}),
  green:  std({map:greenWallT, roughness:.92, metalness:0}),
  leafy:  std({map:leafyAlphaT, transparent:true, alphaTest:.4, side:THREE.DoubleSide, roughness:.9}),
  interior:new THREE.MeshBasicMaterial({map:roomAtlasT}),
  concrete:std({map:concreteT, roughness:.85}),
  stone:  std({map:stoneT, roughness:.9}),
  roof:   std({color:0x2b2d30, roughness:.95}),
  roofL:  std({color:0x9a9c9a, roughness:.92}),
  hvac:   std({color:0x8e959b, roughness:.4, metalness:.65}),
  solar:  std({map:solarT, roughness:.25, metalness:.55}),
  hedge:  std({color:0x355d26, roughness:.95}),
  trunk:  std({color:0x6a4a2e, roughness:.9}),
  leaf:   std({color:0x4d7a33, roughness:.9}),
  leafD:  std({color:0x38601f, roughness:.95}),
  leafL:  std({color:0x6b9245, roughness:.9}),
  soil:   std({color:0x4c3a28, roughness:1}),
  water:  std({color:0x8fc3d4, metalness:.9, roughness:.04, envMapIntensity:1.8}),
  bronze: std({color:0x7a6a4e, metalness:.9, roughness:.32}),
  lampPole:std({color:0x2a2c2e, roughness:.5, metalness:.6}),
  lampHead:new THREE.MeshStandardMaterial({color:0x2a2c2e, emissive:0xffdca0, emissiveIntensity:0, roughness:.4}),
  cove:   new THREE.MeshStandardMaterial({color:0x574a33, emissive:0xffc884, emissiveIntensity:0, roughness:.6}),
  beige:  std({color:0xd9cfc0, roughness:.8}),
  parasol:std({color:0xe7e2d6, roughness:.7, side:THREE.DoubleSide}),
};
[M.leaf,M.leafD,M.leafL].forEach(mat=>{
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uTime=uTime;
    sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.x += sin(uTime*1.6 + position.y*0.5 + position.z*0.35)*0.07;
       transformed.z += cos(uTime*1.2 + position.x*0.4)*0.05;`);
  };
});
const NO_CAST=new Set(['glass','glassR','railM','railS','leafy','interior','water','cove']);

/* ============================================================ geometry bucket */
class Bucket{
  constructor(){ this.m={}; }
  geo(key,g){ (this.m[key]??=[]).push(g); return g; }
  box(key,w,h,d,x,y,z,ry=0,uv=null){
    const g=new THREE.BoxGeometry(w,h,d);
    if(uv) scaleUV(g,uv[0],uv[1]);
    if(ry) g.rotateY(ry);
    g.translate(x,y,z);
    return this.geo(key,g);
  }
  cyl(key,rt,rb,h,seg,x,y,z){
    const g=new THREE.CylinderGeometry(rt,rb,h,seg);
    g.translate(x,y,z);
    return this.geo(key,g);
  }
  build(target){
    const grp=target||new THREE.Group();
    for(const k in this.m){
      const g=BGU.mergeGeometries(this.m[k],false);
      const mesh=new THREE.Mesh(g,M[k]);
      mesh.castShadow=!NO_CAST.has(k);
      mesh.receiveShadow=true;
      grp.add(mesh);
    }
    return grp;
  }
}
/* face-local helpers: local x along facade, +z outward */
function faceXform(g,frame,fx,fy,fz){
  g.rotateY(frame.ry);
  const c=Math.cos(frame.ry), s=Math.sin(frame.ry);
  g.translate(fx*c+fz*s, fy, -fx*s+fz*c);
  return g;
}
function fBox(B,key,frame,w,h,d,fx,fy,fz,uv=null){
  const g=new THREE.BoxGeometry(w,h,d);
  if(uv) scaleUV(g,uv[0],uv[1]);
  return B.geo(key,faceXform(g,frame,fx,fy,fz));
}
function fPlane(B,key,frame,w,h,fx,fy,fz,uv=null){
  const g=new THREE.PlaneGeometry(w,h);
  if(uv) scaleUV(g,uv[0],uv[1]);
  return B.geo(key,faceXform(g,frame,fx,fy,fz));
}
function fRoomPlane(B,frame,w,h,fx,fy,fz){
  const g=new THREE.PlaneGeometry(w,h);
  const cx=randi(0,ATLAS_N-1), cy=randi(0,ATLAS_N-1), uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){
    uv.setXY(i,(cx+uv.getX(i))/ATLAS_N,(cy+uv.getY(i))/ATLAS_N);
  }
  return B.geo('interior',faceXform(g,frame,fx,fy,fz));
}

/* ============================================================ building generator */
const FH=3.2;               // floor height
function buildWing(o){
  const B=new Bucket();
  const {L,D,floors}=o;
  const GH=o.groundH??4.0;                    // ground floor height
  const topY=GH+(floors-1)*FH;
  const wingR=mulberry32(o.seed);
  const wr=(a=1,b)=> b===undefined ? wingR()*a : a+wingR()*(b-a);
  const wi=(a,b)=> Math.floor(wr(a,b+1));
  const MW=3.3;
  const frames=[
    {ry:0,        len:L, dist:D/2, long:true },
    {ry:Math.PI,  len:L, dist:D/2, long:true },
    {ry:Math.PI/2,len:D, dist:L/2, long:false},
    {ry:-Math.PI/2,len:D,dist:L/2, long:false},
  ];
  /* core body per floor */
  for(let f=0;f<floors;f++){
    const y0=f===0?0:GH+(f-1)*FH;
    const h=f===0?GH:FH;
    B.box(o.brickStyle?'brick':'anthr',L,h,D,0,y0+h/2,0,0,[L/2.6,h/2.6]);
  }
  /* wrap-around white slab bands (skip for brick style except top) */
  const bandKeys=o.brickStyle?[floors]:Array.from({length:floors+1},(_,i)=>i);
  for(const f of bandKeys){
    if(f===0) continue;
    const y=f===floors?GH+(floors-1)*FH:(f===1?GH:GH+(f-1)*FH);
    B.box('white',L+0.7,0.82,D+0.7,0,y+0.12,0,0,[(L+0.7)/2.4,0.6]);
  }
  /* parapet + roof: penthouse wings get a walkable light-membrane terrace deck
     at penthouse floor level; plain wings get a classic parapet + dark roof */
  if(o.penthouse){
    B.box('roofL',L+0.3,0.16,D+0.3,0,topY+0.1,0);
  } else {
    B.box(o.brickStyle?'brick':'white',L+0.5,0.9,D+0.5,0,topY+FH+0.35,0,0,[(L+0.5)/2.4,0.6]);
    B.box('roofL',L-0.5,0.14,D-0.5,0,topY+FH+0.75,0);
  }

  for(const fr of frames){
    const n=Math.max(2,Math.floor((fr.len-1.4)/MW));
    const x0=-((n-1)*MW)/2;
    /* column archetypes for vertical alignment */
    const colType=[];
    for(let cI=0;cI<n;cI++){
      const t=wingR();
      colType.push(fr.long ? (t<.42?'win':t<.78?'bal':'solid') : (t<.74?'win':'solid'));
    }
    /* green vertical strips at 1-3 column boundaries on long faces */
    if(fr.long && !o.brickStyle){
      const nStrips=wi(2,3);
      for(let sI=0;sI<nStrips;sI++){
        const cI=wi(1,n-2);
        fBox(B,'green',fr,0.85,(floors-1)*FH-0.4,0.26,x0+cI*MW-MW/2,GH+((floors-1)*FH-0.4)/2,fr.dist+0.15,[1,(floors-1)*FH/3]);
        colType[cI]= colType[cI]==='bal'?'win':colType[cI];
      }
    }
    /* white interlocking jog-frames per floor (long faces) */
    if(fr.long && !o.brickStyle){
      for(let f=1;f<floors;f++){
        const y0=GH+(f-1)*FH;
        const nj=wi(2,3);
        for(let j=0;j<nj;j++){
          const a=wi(0,n-4), span=wi(2,4);
          const cxJ=x0+(a+span/2-0.5)*MW, wJ=span*MW;
          fBox(B,'white',fr,wJ,0.66,0.6,cxJ,y0+FH-0.02,fr.dist+0.16,[wJ/2.4,0.5]);
          fBox(B,'white',fr,0.62,FH+0.7,0.55,cxJ-wJ/2,y0+FH/2,fr.dist+0.13,[0.4,FH/2.4]);
          fBox(B,'white',fr,0.62,FH+0.7,0.55,cxJ+wJ/2,y0+FH/2,fr.dist+0.13,[0.4,FH/2.4]);
        }
        /* frequent 2-floor white piers for the interlocking look */
        if(wingR()<.75 && f<floors-1){
          const cI=wi(1,n-2);
          fBox(B,'white',fr,0.72,FH*2,0.5,x0+cI*MW+MW/2,y0+FH,fr.dist+0.1,[0.5,FH*2/2.4]);
        }
      }
    }
    /* brick piers for brick-style block */
    if(o.brickStyle){
      for(let cI=0;cI<=n;cI++){
        if(wingR()<.72) fBox(B,'brick',fr,1.1,topY+FH,0.3,x0+cI*MW-MW/2,(topY+FH)/2,fr.dist+0.1,[1.1/1.6,(topY+FH)/1.6]);
      }
    }
    /* modules per floor */
    for(let f=0;f<floors;f++){
      const y0=f===0?0:GH+(f-1)*FH;
      const h=f===0?GH:FH;
      const isTop=f===floors-1;
      for(let cI=0;cI<n;cI++){
        const cx=x0+cI*MW;
        let type=colType[cI];
        if(f===0) type = fr.long ? 'ground' : (type==='bal'?'win':type);
        if(isTop && o.penthouse) continue;              // handled by penthouse pass
        if(type==='solid'){
          if(!o.brickStyle){
            if(wingR()<.55)
              fBox(B,'white',fr,MW+0.1,h+0.1,0.26,cx,y0+h/2,fr.dist+0.08,[MW/2.4,h/2.4]);
            else if(wingR()<.6)
              fBox(B,'dark',fr,MW-0.5,h-0.9,0.16,cx,y0+h/2,fr.dist+0.02,[1,1]);
          }
          continue;
        }
        if(type==='ground'){
          /* handled below in ground pass */
          continue;
        }
        const gw=MW-0.7, gh=h-0.85;
        const gy=y0+0.55+gh/2;
        /* interior + glass + frame */
        fRoomPlane(B,fr,gw,gh,cx,gy,fr.dist-0.55);
        fPlane(B,'glass',fr,gw,gh,cx,gy,fr.dist+0.02);
        const fw=0.09;
        fBox(B,'frame',fr,gw+0.16,fw,0.12,cx,gy+gh/2,fr.dist+0.03);
        fBox(B,'frame',fr,gw+0.16,fw,0.12,cx,gy-gh/2,fr.dist+0.03);
        fBox(B,'frame',fr,fw,gh+0.1,0.12,cx-gw/2,gy,fr.dist+0.03);
        fBox(B,'frame',fr,fw,gh+0.1,0.12,cx+gw/2,gy,fr.dist+0.03);
        fBox(B,'frame',fr,0.06,gh,0.1,cx+gw*0.18,gy,fr.dist+0.03);
        if(type==='bal' && f>0){
          const bd=1.9;
          fBox(B,'white',fr,MW+0.15,0.2,bd,cx,y0+0.42,fr.dist+bd/2,[MW/2.4,bd/2.4]);
          const railKey=wingR()<.5?'railM':'railS';
          fPlane(B,railKey,fr,MW+0.1,1.06,cx,y0+1.08,fr.dist+bd-0.06,[(MW+0.1)/1.1,1]);
          const gs=new THREE.PlaneGeometry(bd-0.15,1.06);
          scaleUV(gs,bd/1.1,1);
          gs.rotateY(Math.PI/2);
          B.geo(railKey,faceXform(gs,fr,cx-MW/2-0.02,y0+1.08,fr.dist+bd/2));
          const gs2=new THREE.PlaneGeometry(bd-0.15,1.06);
          scaleUV(gs2,bd/1.1,1);
          gs2.rotateY(Math.PI/2);
          B.geo(railKey,faceXform(gs2,fr,cx+MW/2+0.02,y0+1.08,fr.dist+bd/2));
          fBox(B,'frame',fr,MW+0.16,0.07,0.07,cx,y0+1.63,fr.dist+bd-0.06);
          /* planter + cascading greenery */
          if(wingR()<.5){
            fBox(B,'frame',fr,1.1,0.34,0.32,cx-MW/4,y0+0.69,fr.dist+bd-0.28);
            fBox(B,'green',fr,1.05,0.2,0.3,cx-MW/4,y0+0.95,fr.dist+bd-0.28,[1,0.3]);
            fPlane(B,'leafy',fr,1.05,1.3,cx-MW/4,y0+0.35,fr.dist+bd+0.01,[1.4,1.4]);
          }
          /* balcony furniture */
          if(wingR()<.4){
            fBox(B,'beige',fr,1.4,0.42,0.6,cx+MW/5,y0+0.73,fr.dist+0.75);
            fBox(B,'beige',fr,1.4,0.5,0.14,cx+MW/5,y0+1.0,fr.dist+0.42);
          }
          if(wingR()<.3){
            B.geo('trunk',faceXform(new THREE.CylinderGeometry(0.16,0.2,0.35,8).translate(0,0,0),fr,cx-MW/3,y0+0.7,fr.dist+0.6));
            B.geo('leafD',faceXform(new THREE.IcosahedronGeometry(0.34,1).translate(0,0,0),fr,cx-MW/3,y0+1.25,fr.dist+0.6));
          }
        }
      }
      /* cove light strip under slab (visible at dusk) */
      if(fr.long && f>0 && wingR()<.35)
        fBox(B,'cove',fr,MW*wi(2,4),0.07,0.07,x0+wi(1,n-2)*MW,y0+0.06,fr.dist+0.25);
    }
    /* ground floor treatment on long faces */
    if(fr.long){
      const nGL=Math.max(2,Math.floor((fr.len-1.4)/MW));
      const gx0=-((nGL-1)*MW)/2;
      const lobbies=new Set([wi(1,nGL-4)]);
      lobbies.add(nGL-3);
      for(let cI=0;cI<nGL;cI++){
        const cx=gx0+cI*MW;
        if(lobbies.has(cI)){
          /* wooden entrance portal + tall glass lobby (2 modules wide) */
          fBox(B,'wood',fr,MW*2+0.6,0.45,0.9,cx+MW/2,GH-0.45,fr.dist+0.35,[MW/1.6,0.5]);
          fBox(B,'wood',fr,0.45,GH-0.6,0.9,cx-MW+0.05,GH/2-0.3,fr.dist+0.35,[0.5,GH/2.4]);
          fBox(B,'wood',fr,0.45,GH-0.6,0.9,cx+MW*2-0.05,GH/2-0.3,fr.dist+0.35,[0.5,GH/2.4]);
          fPlane(B,'glass',fr,MW*2-0.5,GH-1.1,cx+MW/2,(GH-0.7)/2+0.15,fr.dist+0.05);
          fBox(B,'frame',fr,MW*2-0.4,0.1,0.1,cx+MW/2,GH-0.75,fr.dist+0.08);
          fBox(B,'frame',fr,0.08,GH-1.1,0.1,cx+MW/2,(GH-0.7)/2+0.15,fr.dist+0.08);
          fBox(B,'concrete',fr,MW*2+1,0.16,1.6,cx+MW/2,0.08,fr.dist+0.8,[MW/1.4,1]);
          cI++; continue;
        }
        /* ground apartments: window + stone base */
        const gw=MW-0.8, gh=GH-1.5;
        fRoomPlane(B,fr,gw,gh,cx,0.9+gh/2,fr.dist-0.55);
        fPlane(B,'glass',fr,gw,gh,cx,0.9+gh/2,fr.dist+0.02);
        fBox(B,'frame',fr,gw+0.14,0.09,0.12,cx,0.9+gh,fr.dist+0.03);
        fBox(B,'frame',fr,gw+0.14,0.09,0.12,cx,0.9,fr.dist+0.03);
        fBox(B,'frame',fr,0.09,gh+0.1,0.12,cx-gw/2,0.9+gh/2,fr.dist+0.03);
        fBox(B,'frame',fr,0.09,gh+0.1,0.12,cx+gw/2,0.9+gh/2,fr.dist+0.03);
        fBox(B,'stone',fr,MW,0.95,0.24,cx,0.48,fr.dist+0.05,[MW/1.4,0.55]);
      }
    }
  }
  /* ---------- penthouse level */
  if(o.penthouse){
    const y0=topY, setback=2.3;
    const pw=L-setback*2, pd=D-setback;
    B.box('anthr',pw,FH+0.4,pd,0,y0+(FH+0.4)/2,0,0,[pw/2.6,FH/2.6]);
    /* continuous penthouse glazing band */
    for(const fr of frames.slice(0,2)){
      const gw2=pw-2, gh2=FH-1.15;
      fRoomPlane(B,fr,gw2/2,gh2,-gw2/4,y0+0.6+gh2/2,pd/2-0.5);
      fRoomPlane(B,fr,gw2/2,gh2,gw2/4,y0+0.6+gh2/2,pd/2-0.5);
      fPlane(B,'glass',fr,gw2,gh2,0,y0+0.6+gh2/2,pd/2+0.03);
      fBox(B,'frame',fr,gw2,0.1,0.12,0,y0+0.6,pd/2+0.04);
      fBox(B,'frame',fr,gw2,0.1,0.12,0,y0+0.6+gh2,pd/2+0.04);
      for(let mI=-2;mI<=2;mI++) fBox(B,'frame',fr,0.07,gh2,0.1,mI*gw2/5,y0+0.6+gh2/2,pd/2+0.04);
    }
    /* penthouse fascia + light roof + skylights */
    B.box('white',pw+0.7,0.55,pd+0.7,0,y0+FH+0.28,0,0,[(pw+0.7)/2.4,0.5]);
    B.box('roofL',pw+0.3,0.14,pd+0.3,0,y0+FH+0.6,0);
    for(let i=0;i<2;i++) B.box('white',1.5,0.45,1.5,wr(-pw/3,pw/3),y0+FH+0.85,wr(-pd/4,pd/4));
    /* glass rail around main terrace edge */
    for(const fr of frames.slice(0,2)){
      fPlane(B,'glassR',fr,fr.len-1,1.05,0,y0+0.72,fr.dist+0.12);
      fBox(B,'frame',fr,fr.len-1,0.06,0.06,0,y0+1.27,fr.dist+0.12);
    }
    /* wooden cantilevered boxes */
    const nBox=wi(1,2);
    for(let bI=0;bI<nBox;bI++){
      const fr=frames[bI%2];
      const bw=wr(9,14), bx=wr(-(L/2-bw/2-2),(L/2-bw/2-2));
      const bh=FH+0.7, bd=D*0.62;
      const prot=1.4;
      const bz=fr.dist-bd/2+prot;
      fBox(B,'wood',fr,bw,bh,bd,bx,y0+bh/2+0.15,bz,[bw/3,bh/3]);
      /* opening: dark inset + glass + glass rail, wooden soffit reveal */
      const ow=bw-2.2, oh=bh-1.5;
      fBox(B,'anthr',fr,ow,oh,0.4,bx,y0+0.6+oh/2,fr.dist+prot-0.45,[ow/2.6,oh/2.6]);
      fRoomPlane(B,fr,ow-0.6,oh-0.5,bx,y0+0.65+oh/2,fr.dist+prot-0.5);
      fPlane(B,'glass',fr,ow-0.4,oh-0.4,bx,y0+0.65+oh/2,fr.dist+prot-0.35);
      fPlane(B,'glassR',fr,ow-0.5,1.0,bx,y0+1.15,fr.dist+prot+0.02);
      fBox(B,'frame',fr,ow-0.5,0.06,0.06,bx,y0+1.67,fr.dist+prot+0.02);
      /* green accent inside the box */
      fBox(B,'green',fr,0.8,oh-0.6,0.18,bx-ow/2+0.7,y0+0.65+oh/2,fr.dist+prot-0.4,[1,oh/3]);
      /* cove under soffit */
      fBox(B,'cove',fr,bw-1,0.08,0.08,bx,y0+0.28,fr.dist+prot-0.2);
    }
    /* terrace furniture: loungers + parasol */
    for(let i=0;i<2;i++){
      const tx=wr(-L/3,L/3), tz=(i? -1:1)*(D/2-setback-1.2);
      B.box('beige',1.85,0.32,0.65,tx,y0+0.32,tz);
      B.box('beige',0.6,0.55,0.65,tx-0.62,y0+0.55,tz);
      B.cyl('lampPole',0.04,0.04,2.1,6,tx+1.4,y0+1.2,tz);
      B.geo('parasol',new THREE.ConeGeometry(1.25,0.45,8).translate(tx+1.4,y0+2.3,tz));
    }
  }
  /* ---------- rooftop equipment */
  const roofTop=o.penthouse?topY+FH+0.67:topY+FH+0.82;
  const eqXm=o.penthouse?L/2-3.4:L/2-3, eqZm=o.penthouse?(D-2.3)/2-1.4:D/2-2;
  const nH=wi(2,4);
  for(let i=0;i<nH;i++){
    const hx=wr(-eqXm,eqXm), hz=wr(-eqZm,eqZm);
    B.box('hvac',1.7,1.0,1.2,hx,roofTop+0.5,hz);
    B.box('frame',1.5,0.08,1.0,hx,roofTop+1.05,hz);
  }
  for(let i=0;i<wi(2,3);i++)
    B.cyl('frame',0.22,0.26,1.4,8,wr(-eqXm,eqXm),roofTop+0.7,wr(-eqZm,eqZm));
  if(o.solar){
    for(let r2=0;r2<2;r2++) for(let i=0;i<5;i++){
      const g=new THREE.BoxGeometry(1.7,0.06,1.1);
      g.rotateX(-0.5);
      g.translate(-eqXm+1+i*2.1,roofTop+0.3,-eqZm+0.6+r2*2.1);
      B.geo('solar',g);
    }
  }
  if(o.greenRoof) B.box('green',wr(5,8),0.12,3,wr(-L/4,L/4),roofTop+0.08,2,0,[2,1]);

  const grp=B.build();
  grp.position.set(o.x,0,o.z);
  if(o.ry) grp.rotation.y=o.ry;
  return grp;
}

/* ============================================================ brick tower */
function buildTower(o){
  const B=new Bucket();
  const {W,Dp,floors}=o;
  const H=floors*FH+0.6;
  B.box('brick',W,H,Dp,0,H/2,0,0,[W/1.8,H/1.8]);
  const frames=[
    {ry:0,len:W,dist:Dp/2},{ry:Math.PI,len:W,dist:Dp/2},
    {ry:Math.PI/2,len:Dp,dist:W/2},{ry:-Math.PI/2,len:Dp,dist:W/2}
  ];
  const tR=mulberry32(o.seed); const tr=(a,b)=>a+tR()*(b-a); const ti=(a,b)=>Math.floor(tr(a,b+1));
  for(const fr of frames){
    const n=Math.floor((fr.len-1)/3.1), x0=-((n-1)*3.1)/2;
    for(let f=0;f<floors;f++){
      const y0=f*FH;
      for(let cI=0;cI<n;cI++){
        const cx=x0+cI*3.1, t=tR();
        if(t<.42){
          const gw=1.5, gh=FH-0.9;
          fRoomPlane(B,fr,gw,gh,cx,y0+0.55+gh/2,fr.dist-0.4);
          fPlane(B,'glass',fr,gw,gh,cx,y0+0.55+gh/2,fr.dist+0.03);
          fBox(B,'frame',fr,gw+0.14,0.08,0.1,cx,y0+0.55,fr.dist+0.04);
          fBox(B,'frame',fr,gw+0.14,0.08,0.1,cx,y0+0.55+gh,fr.dist+0.04);
          fBox(B,'frame',fr,0.08,gh,0.1,cx-gw/2,y0+0.55+gh/2,fr.dist+0.04);
          fBox(B,'frame',fr,0.08,gh,0.1,cx+gw/2,y0+0.55+gh/2,fr.dist+0.04);
        } else if(t<.58){
          fBox(B,'woodV',fr,1.5,FH-0.9,0.14,cx,y0+0.55+(FH-0.9)/2,fr.dist+0.05,[1,2]); // louvres
        } else if(t<.66){
          fBox(B,'green',fr,0.7,FH-0.9,0.16,cx,y0+0.55+(FH-0.9)/2,fr.dist+0.06,[1,1.4]);
        }
      }
      if(f>0 && tR()<.3){ // recessed loggia band
        fBox(B,'anthr',fr,fr.len*0.5,0.16,1.2,tr(-fr.len/5,fr.len/5),y0+0.3,fr.dist-0.7,[3,0.3]);
        fPlane(B,'railM',fr,fr.len*0.5,1.0,tr(-fr.len/5,fr.len/5),y0+0.9,fr.dist-0.15,[fr.len*0.5/1.1,1]);
      }
    }
  }
  /* wooden crown box */
  const cw=W+2.4, ch=FH+1.1, cd=Dp*0.72;
  B.box('wood',cw,ch,cd,0,H+ch/2-0.6,0,0,[cw/3,ch/3]);
  B.box('anthr',cw-2.6,ch-1.4,cd+0.4,0,H+ch/2-0.55,0,0,[3,1]);
  const gg=new THREE.PlaneGeometry(cw-3,ch-1.6);
  gg.translate(0,H+ch/2-0.55,cd/2+0.21);
  B.geo('glass',gg);
  const gr=new THREE.PlaneGeometry(cw-3,1.0);
  gr.translate(0,H+0.5,cd/2+0.26);
  B.geo('glassR',gr);
  B.box('roof',cw-0.6,0.15,cd-0.6,0,H+ch-0.55,0);
  B.box('hvac',1.6,0.9,1.1,ti(-3,3),H+ch,0);
  const grp=B.build();
  grp.position.set(o.x,0,o.z);
  if(o.ry) grp.rotation.y=o.ry;
  return grp;
}

/* ============================================================ assemble complex */
const cityG=new THREE.Group(); scene.add(cityG);
cityG.add(buildWing({L:52,D:15,floors:7,x:-31.5,z:-6,ry:Math.PI/2,seed:11,penthouse:true,solar:true,groundH:4}));
cityG.add(buildWing({L:48,D:15,floors:6,x:0,z:-35.5,ry:0,seed:22,penthouse:true,greenRoof:true,groundH:4}));
cityG.add(buildWing({L:52,D:15,floors:7,x:31.5,z:-6,ry:Math.PI/2,seed:33,penthouse:true,solar:true,groundH:4}));
cityG.add(buildTower({W:16,Dp:16,floors:9,x:34,z:-43,ry:0,seed:44}));
cityG.add(buildWing({L:26,D:15,floors:7,x:-64,z:-43,ry:0,seed:55,brickStyle:true,groundH:4}));

/* ============================================================ site & courtyard */
const site=new Bucket();
{
  const groundT=makeTex(1024,1024,(g,w,h)=>{
    g.fillStyle='#75885d'; g.fillRect(0,0,w,h);
    for(let i=0;i<90;i++){
      g.fillStyle=['#6d8054','#7e9163','#65784e','#8a9a6e','#71835a','#939a70'][(Math.random()*6)|0];
      g.globalAlpha=0.25+Math.random()*0.3;
      g.beginPath();
      g.ellipse(Math.random()*w,Math.random()*h,40+Math.random()*130,30+Math.random()*90,Math.random()*3,0,7);
      g.fill();
    }
    g.globalAlpha=1;
    noise(g,w,h,5000,['#67794f','#7d8f62','#5f7148'],.8,3,.5);
  });
  const g=new THREE.PlaneGeometry(1800,1800);
  g.rotateX(-Math.PI/2); g.translate(0,-0.08,0);
  scaleUV(g,9,9);
  const ground=new THREE.Mesh(g,std({map:groundT,roughness:1}));
  ground.receiveShadow=true; scene.add(ground);
}
/* side streets + rear service road to embed the block in a street grid */
{
  const sideM=std({map:asphaltT,roughness:.95});
  sideM.map=asphaltT.clone(); sideM.map.repeat.set(2,36); sideM.map.needsUpdate=true;
  for(const sx of [-95,95]){
    const g=new THREE.PlaneGeometry(11,300);
    g.rotateX(-Math.PI/2); g.translate(sx,0.005,-95);
    const m=new THREE.Mesh(g,sideM); m.receiveShadow=true; scene.add(m);
    for(const e of [-6.2,6.2]){
      const pg=new THREE.PlaneGeometry(3,300);
      pg.rotateX(-Math.PI/2); pg.translate(sx+e,0.012,-95);
      scaleUV(pg,1,70);
      const pm=new THREE.Mesh(pg,std({map:paveT,roughness:.9})); pm.receiveShadow=true; scene.add(pm);
    }
  }
  const g2=new THREE.PlaneGeometry(200,10);
  g2.rotateX(-Math.PI/2); g2.translate(0,0.005,-72);
  const back=new THREE.Mesh(g2,sideM); back.receiveShadow=true; scene.add(back);
}
/* courtyard painted plane + path curve */
const CTX={x0:-23,z0:-27,w:46,d:46};   // courtyard world rect (x -23..23, z -27..19)
const pathPts=[[0,18],[3,12],[-4,5],[2,-3],[9,-8],[3,-14],[-6,-18],[-13,-12],[-15,-2],[-9,6]];
const courtT=makeTex(1024,1024,(g,w,h)=>{
  const px=(X,Z)=>[(X-CTX.x0)/CTX.w*w,(Z-CTX.z0)/CTX.d*h];
  g.fillStyle='#5b8a33'; g.fillRect(0,0,w,h);
  noise(g,w,h,9000,['#4d7a2a','#699d3c','#548432','#71a845','#436f24'],1,4,.6);
  /* plaza south strip */
  g.fillStyle='#cfc9bd'; g.fillRect(0,(17-CTX.z0)/CTX.d*h,w,h);
  g.strokeStyle='rgba(90,88,80,0.4)'; g.lineWidth=2;
  for(let x=0;x<w;x+=48){g.beginPath();g.moveTo(x,(17-CTX.z0)/CTX.d*h);g.lineTo(x,h);g.stroke();}
  /* winding path */
  g.strokeStyle='#d9d3c6'; g.lineWidth=54; g.lineCap='round'; g.lineJoin='round';
  g.beginPath();
  const p0=px(pathPts[0][0],pathPts[0][1]); g.moveTo(p0[0],p0[1]);
  for(let i=1;i<pathPts.length-1;i++){
    const a=px(pathPts[i][0],pathPts[i][1]), b=px(pathPts[i+1][0],pathPts[i+1][1]);
    g.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);
  }
  g.stroke();
  g.strokeStyle='rgba(120,116,105,0.5)'; g.lineWidth=60; g.globalAlpha=.25; g.stroke(); g.globalAlpha=1;
  /* pond plaza circle */
  const pc=px(6,-10);
  g.fillStyle='#cfc9bd'; g.beginPath(); g.arc(pc[0],pc[1],80,0,7); g.fill();
  /* flowerbeds hugging the path */
  for(let i=0;i<12;i++){
    const p=pathPts[i%pathPts.length];
    const c=px(p[0]+Math.random()*5-2.5,p[1]+Math.random()*5-2.5);
    g.fillStyle='#5d4c34';
    g.beginPath(); g.ellipse(c[0],c[1],10+Math.random()*12,7+Math.random()*8,Math.random()*3,0,7); g.fill();
    for(let k=0;k<8;k++){
      g.fillStyle=['#c94a6a','#e0d24e','#b364c9','#d8622e','#e8e4da'][(Math.random()*5)|0];
      g.beginPath(); g.arc(c[0]+Math.random()*16-8,c[1]+Math.random()*10-5,1.6,0,7); g.fill();
    }
  }
  /* playground surface */
  const pg=px(15,8);
  g.fillStyle='#d8b56e'; g.beginPath(); g.ellipse(pg[0],pg[1],70,52,0,0,7); g.fill();
});
courtT.wrapS=courtT.wrapT=THREE.ClampToEdgeWrapping;
{
  const g=new THREE.PlaneGeometry(CTX.w,CTX.d);
  g.rotateX(-Math.PI/2);
  g.translate(CTX.x0+CTX.w/2,0.02,CTX.z0+CTX.d/2);
  const m=new THREE.Mesh(g,std({map:courtT,roughness:.95}));
  m.receiveShadow=true; scene.add(m);
}
/* south plaza between complex and boulevard */
{
  const g=new THREE.PlaneGeometry(150,22);
  g.rotateX(-Math.PI/2); g.translate(0,0.015,30);
  scaleUV(g,150/4,22/4);
  const m=new THREE.Mesh(g,std({map:paveT,roughness:.9}));
  m.receiveShadow=true; scene.add(m);
}
/* water feature */
site.cyl('concrete',3.1,3.3,0.5,32,6,0.25,-10);
{
  const g=new THREE.CylinderGeometry(2.85,2.85,0.1,32);
  g.translate(6,0.52,-10);
  site.geo('water',g);
}
/* sculpture */
{
  site.box('concrete',1.6,0.9,1.6,-3,0.45,14);
  const g=new THREE.TorusKnotGeometry(0.75,0.22,72,10);
  g.rotateX(0.4); g.translate(-3,2.15,14);
  site.geo('bronze',g);
}
/* benches along path */
const benchAt=(x,z,ry)=>{
  const g1=new THREE.BoxGeometry(2.1,0.1,0.55); g1.rotateY(ry); g1.translate(x,0.48,z); site.geo('wood',g1);
  const g2=new THREE.BoxGeometry(2.1,0.1,0.45); g2.rotateX(-0.32); g2.rotateY(ry); g2.translate(x-Math.sin(ry)*0.32,0.78,z-Math.cos(ry)*0.32); site.geo('wood',g2);
  for(const s of [-0.85,0.85]){
    const g3=new THREE.BoxGeometry(0.1,0.46,0.5); g3.rotateY(ry); g3.translate(x+Math.cos(ry)*s,0.24,z-Math.sin(ry)*s); site.geo('frame',g3);
  }
};
benchAt(4.4,10,0.5); benchAt(-6.5,3.5,-0.4); benchAt(10.5,-7,1.2); benchAt(-1,-15.5,0.1); benchAt(-14,-7,1.5); benchAt(9,-1.5,2.2);
/* sculptural stone seating cubes near pond */
for(const [sx,sz] of [[3.2,-13.4],[9.2,-13],[10.2,-7.2],[2.4,-6.6]]) site.box('stone',1.15,0.55,1.15,sx,0.28,sz,rand(0,3),[1,0.5]);
/* gabion cubes + hedges along wing ground floors (courtyard side) */
for(let i=0;i<7;i++){
  const z=-24+i*6.6;
  site.box('stone',1.15,1.15,1.15,-22.6,0.58,z,0,[1,1]);
  site.box('hedge',1,0.62,4.6,-22.7,0.31,z+3.3);
  site.box('stone',1.15,1.15,1.15,22.6,0.58,z,0,[1,1]);
  site.box('hedge',1,0.62,4.6,22.7,0.31,z+3.3);
}
for(let i=0;i<6;i++){
  const x=-18+i*7.2;
  site.box('stone',1.15,1.15,1.15,x,0.58,-26.6,0,[1,1]);
  site.box('hedge',4.8,0.62,1,x+3.6,0.31,-26.7);
}
/* geometric concrete planters with ornamental grasses on plaza */
for(let i=0;i<6;i++){
  const x=-55+i*22;
  site.box('concrete',2.2,0.75,2.2,x,0.38,33,0,[1.6,0.6]);
  site.box('soil',1.9,0.1,1.9,x,0.78,33);
  for(let k=0;k<5;k++){
    const g=new THREE.ConeGeometry(0.16,rand(0.7,1.15),5);
    g.translate(x+rand(-0.6,0.6),1.15,33+rand(-0.6,0.6));
    site.geo('leafD',g);
  }
}
/* low retaining walls with planting, plaza edge */
site.box('concrete',60,0.55,0.5,-40,0.28,24.6,0,[26,0.5]);
site.box('hedge',60,0.5,0.4,-40,0.75,24.6);
site.box('concrete',60,0.55,0.5,40,0.28,24.6,0,[26,0.5]);
site.box('hedge',60,0.5,0.4,40,0.75,24.6);
/* playground (NE courtyard) */
{
  const px0=15,pz0=8;
  for(const [dx,dz] of [[-1.5,-1],[1.5,-1],[-1.5,1],[1.5,1]]) site.cyl('wood',0.09,0.09,2.1,6,px0+dx,1.05,pz0+dz);
  site.box('wood',3.4,0.16,0.16,px0,2.15,pz0-1);
  for(const sw of [-0.8,0.8]){
    site.cyl('frame',0.02,0.02,1.35,4,px0+sw,1.45,pz0-1);
    site.box('wood',0.5,0.06,0.24,px0+sw,0.75,pz0-1);
  }
  const slide=new THREE.BoxGeometry(0.6,0.08,2.6);
  slide.rotateX(0.6); slide.translate(px0-1.5,1.2,pz0+2.1);
  site.geo('hvac',slide);
  site.box('wood',1.2,1.7,1.2,px0-1.5,0.85,pz0+1);
}
/* parking ramp (east side, off boulevard) */
{
  const rx=52,rz=30;
  const fl=new THREE.BoxGeometry(6,0.2,14);
  fl.rotateX(-0.18); fl.translate(rx,-1.1,rz);
  site.geo('concrete',fl);
  site.box('concrete',0.4,1.7,14,rx-3.2,0.4,rz,0,[6,1]);
  site.box('concrete',0.4,1.7,14,rx+3.2,0.4,rz,0,[6,1]);
  const gate=new THREE.PlaneGeometry(5.6,1.6);
  scaleUV(gate,5,1.4); gate.translate(rx,-1.4,rz-6.8);
  site.geo('railS',gate);
  site.box('frame',6.4,0.25,0.25,rx,0.1,rz-6.9);
}

/* ============================================================ boulevard */
{
  const road=new THREE.PlaneGeometry(360,24);
  road.rotateX(-Math.PI/2); road.translate(0,0.01,57);
  scaleUV(road,360/7,24/7);
  const m=new THREE.Mesh(road,std({map:asphaltT,roughness:.95}));
  m.receiveShadow=true; scene.add(m);
  /* lane markings via canvas overlay strip */
  const markT=makeTex(2048,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle='rgba(230,230,225,0.9)';
    for(let x=0;x<w;x+=60){ g.fillRect(x,h*0.26,34,3); g.fillRect(x,h*0.74,34,3); }
    g.fillStyle='rgba(240,240,235,0.95)';
    g.fillRect(0,h*0.485,w,4);
    /* crosswalk at center */
    for(let i=-7;i<=7;i++) g.fillRect(w/2+i*22-6,6,12,h-12);
  });
  markT.wrapS=markT.wrapT=THREE.ClampToEdgeWrapping;
  const mk=new THREE.PlaneGeometry(360,24);
  mk.rotateX(-Math.PI/2); mk.translate(0,0.03,57);
  scene.add(new THREE.Mesh(mk,new THREE.MeshBasicMaterial({map:markT,transparent:true,depthWrite:false})));
  /* sidewalks + curbs */
  for(const [zc,wd] of [[43,6],[72,6]]){
    const sw=new THREE.PlaneGeometry(360,wd);
    sw.rotateX(-Math.PI/2); sw.translate(0,0.02,zc);
    scaleUV(sw,360/4,wd/4);
    const m2=new THREE.Mesh(sw,std({map:paveT,roughness:.9}));
    m2.receiveShadow=true; scene.add(m2);
  }
  site.box('concrete',360,0.24,0.4,0,0.12,45.8,0,[160,0.3]);
  site.box('concrete',360,0.24,0.4,0,0.12,68.8,0,[160,0.3]);
  /* median */
  site.box('concrete',360,0.3,2.4,0,0.15,57,0,[160,1]);
  const medG=new THREE.PlaneGeometry(358,1.8);
  medG.rotateX(-Math.PI/2); medG.translate(0,0.32,57);
  scaleUV(medG,90,1);
  site.geo('hedge',medG);
}

/* ============================================================ street lamps */
const lampGlows=[];
function lamp(x,z,h=6){
  site.cyl('lampPole',0.09,0.13,h,8,x,h/2,z);
  site.box('lampPole',1.5,0.1,0.22,x+0.65,h,z);
  site.box('lampHead',0.55,0.14,0.26,x+1.25,h-0.05,z);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,transparent:true,opacity:0,depthWrite:false}));
  s.position.set(x+1.25,h-0.1,z); s.scale.set(3,3,1);
  scene.add(s); lampGlows.push(s);
}
for(let x=-150;x<=150;x+=30){ lamp(x,46.8); lamp(x+15,67.8); }
for(const [bx,bz] of [[-18,20],[18,20],[0,16],[10,-2],[-12,-2],[4,-20],[16,4]]){
  site.cyl('lampPole',0.06,0.08,1.1,6,bx,0.55,bz);
  site.box('lampHead',0.16,0.1,0.16,bx,1.15,bz);
}

/* ============================================================ trees */
const trees=new Bucket();
function tree(x,z,s=1,staked=false,dark=false){
  const th=rand(1.6,2.4)*s;
  trees.cyl('trunk',0.07*s,0.11*s,th,6,x,th/2,z);
  const key=dark?'leafD':pick(['leaf','leaf','leafL','leafD']);
  const n=randi(2,3);
  for(let i=0;i<n;i++){
    const g=new THREE.IcosahedronGeometry(rand(0.55,0.95)*s,1);
    g.scale(1,rand(0.8,1.15),1);
    g.translate(x+rand(-0.3,0.3)*s,th+rand(-0.15,0.6)*s+i*0.45*s,z+rand(-0.3,0.3)*s);
    trees.geo(key,g);
  }
  if(staked){
    for(const a of [0.7,2.8,4.9]){
      trees.cyl('wood',0.03,0.03,1.6,4,x+Math.cos(a)*0.35,0.8,z+Math.sin(a)*0.35);
    }
  }
}
for(const p of pathPts) if(R()<.85) tree(p[0]+rand(-3,3),p[1]+rand(-3,3),rand(0.7,1),true);
tree(-17,12,0.8,true); tree(18,-15,0.9,true); tree(-8,-9,0.75,true); tree(12,13,0.85,true);
for(let x=-150;x<=150;x+=17){ if(Math.abs(x)>8) tree(x+rand(-2,2),42.5,rand(1.2,1.7)); tree(x+8+rand(-2,2),71.5,rand(1.2,1.7)); }
for(let x=-140;x<=140;x+=40) tree(x,57,rand(0.9,1.2));
for(let i=0;i<26;i++) tree(rand(-120,120),rand(78,95),rand(1.3,2),false,R()<.5);
for(let i=0;i<30;i++) tree(rand(-160,-95),rand(-80,30),rand(1.4,2.2),false,R()<.5);
for(let i=0;i<30;i++) tree(rand(95,170),rand(-90,30),rand(1.4,2.2),false,R()<.5);
for(let i=0;i<40;i++) tree(rand(-130,130),rand(-140,-75),rand(1.5,2.4),false,R()<.6);

/* ============================================================ cars */
function makeCar(color,suv){
  const g=new THREE.Group();
  const bodyM=std({color,roughness:.25,metalness:.7,envMapIntensity:1.2});
  const glassM=M.glass;
  const h=suv?0.85:0.62, len=suv?4.6:4.3;
  const body=new THREE.Mesh(new THREE.BoxGeometry(len,h,1.85),bodyM);
  body.position.y=0.55+h/2; body.castShadow=true; g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(len*0.52,suv?0.62:0.5,1.7),glassM);
  cab.position.set(-len*0.05,0.55+h+(suv?0.3:0.24),0); g.add(cab);
  const wheelG=new THREE.CylinderGeometry(0.36,0.36,0.28,12); wheelG.rotateX(Math.PI/2);
  const wheelM=std({color:0x1a1a1c,roughness:.8});
  for(const [wx,wz] of [[-len*0.32,-0.85],[-len*0.32,0.85],[len*0.32,-0.85],[len*0.32,0.85]]){
    const w=new THREE.Mesh(wheelG,wheelM); w.position.set(wx,0.36,wz); g.add(w);
  }
  return g;
}
const carCols=[0xf2f2f0,0xc8ccce,0x9aa0a4,0x3a3d42,0xe8e6e0,0x7c8288,0xf5f4ef,0x23262a];
for(let x=-66;x<=66;x+=7.3){
  if(Math.abs(x)<7) continue;
  const c=makeCar(pick(carCols),R()<.6);
  c.position.set(x,0,47.9); c.rotation.y=x<0?0:Math.PI;
  scene.add(c);
}
for(let i=0;i<5;i++){
  const c=makeCar(pick(carCols),R()<.5);
  c.position.set(-40+i*17,0,66.9); c.rotation.y=Math.PI;
  scene.add(c);
}
const movers=[];
for(let i=0;i<4;i++){
  const c=makeCar(pick(carCols),R()<.5);
  const east=i<2;
  c.position.set(rand(-160,160),0,east?52.4:62.2);
  c.rotation.y=east?Math.PI:0;
  c.userData={v:east?rand(9,13):-rand(9,13)};
  scene.add(c); movers.push(c);
}

/* ============================================================ people */
function person(cols){
  const g=new THREE.Group();
  const legM=std({color:cols[0],roughness:.8}), topM=std({color:cols[1],roughness:.8});
  const skin=std({color:pick([0xd9b18f,0xb98a62,0x8a5f42,0xe8c4a2]),roughness:.7});
  const legs=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.11,0.8,8),legM); legs.position.y=0.4; g.add(legs);
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.14,0.62,8),topM); torso.position.y=1.1; g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.135,10,8),skin); head.position.y=1.58; g.add(head);
  g.traverse(o2=>{o2.castShadow=true;});
  return g;
}
const pplCols=[[0x2c3440,0xc0533a],[0x3c3c3c,0xe4e0d6],[0x51422e,0x7c9bb5],[0x232629,0xd4a45a],[0x394a5e,0x4e6e52],[0x4a4a52,0xc9c4ba]];
for(const [px2,pz2] of [[2,15],[-7,4.2],[10.8,-6],[5,-13.6],[-13,-6.5],[18,31],[-30,31.5],[45,43.5],[-60,43.2],[24,71.5]]){
  const p=person(pick(pplCols)); p.position.set(px2,0.02,pz2); p.rotation.y=rand(0,6.28); scene.add(p);
}
const walkCurve=new THREE.CatmullRomCurve3(pathPts.map(p=>new THREE.Vector3(p[0],0.02,p[1])),true);
const walkers=[];
for(let i=0;i<3;i++){
  const p=person(pick(pplCols)); p.userData={t:i/3,speed:0.011+i*0.003};
  scene.add(p); walkers.push(p);
}
const strollers=[];
for(let i=0;i<2;i++){
  const p=person(pick(pplCols));
  p.position.set(-80+i*40,0.02,43.5); p.userData={v:i?1.3:-1.3};
  scene.add(p); strollers.push(p);
}

/* ============================================================ background: mountains, forest, city, cranes */
function ridge(z,h,col,wd=1600,seedR=1){
  const rr=mulberry32(seedR*997);
  const shape=new THREE.Shape();
  shape.moveTo(-wd/2,-4);
  const n=60;
  for(let i=0;i<=n;i++){
    const x=-wd/2+i*wd/n, u=i/n;
    const y=h*(0.5
      +0.26*Math.sin(u*5.2+seedR)
      +0.14*Math.sin(u*11.7+seedR*2.3)
      +0.06*Math.sin(u*23.0+seedR*4.1)
      +0.05*(rr()-0.5));
    shape.lineTo(x,Math.max(y,h*0.12));
  }
  shape.lineTo(wd/2,-4);
  const geo=new THREE.ShapeGeometry(shape);
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:col,fog:true}));
  mesh.position.z=z;
  return mesh;
}
const mFar=ridge(-820,330,0x93a7b5,2600,3); scene.add(mFar);
const mMid=ridge(-600,260,0x6b8574,2200,5); scene.add(mMid);
const mNear=ridge(-400,160,0x4e6a51,1800,8); scene.add(mNear);
const mWest=ridge(-520,210,0x5b7a64,1800,11); mWest.rotation.y=Math.PI/2.3; mWest.position.set(-540,0,-80); scene.add(mWest);

/* distant city buildings */
const cityFar=new Bucket();
const bgBoxes=[];
function bgBuilding(x,z,w,h,d,style){
  const mat= style===0? std({map:winGridT,roughness:.7})
           : style===1? std({map:brickT,roughness:.85})
           : std({map:winGridT,roughness:.7,color:0xd9cfc0});
  mat.map=mat.map.clone(); mat.map.needsUpdate=true;
  if(style===1) mat.map.repeat.set(Math.max(1,w/3.6),Math.max(1,h/4));
  else mat.map.repeat.set(Math.max(1,w/11),Math.max(1,h/26));
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,h/2,z); m.castShadow=false; m.receiveShadow=false;
  scene.add(m); bgBoxes.push(m);
  if(style===0){
    const cap=new THREE.Mesh(new THREE.BoxGeometry(w+0.5,1.2,d+0.5),M.white);
    cap.position.set(x,h+0.6,z); scene.add(cap);
  }
}
bgBuilding(-150,120,26,44,20,0); bgBuilding(-108,132,22,30,18,1); bgBuilding(-60,124,30,26,20,2);
bgBuilding(-6,138,24,52,20,0);  bgBuilding(48,126,26,32,18,1);   bgBuilding(100,132,28,40,20,0);
bgBuilding(150,120,24,28,18,2); bgBuilding(200,140,30,56,22,0);
bgBuilding(-190,-120,28,62,24,0); bgBuilding(-230,-60,24,40,20,1);
bgBuilding(180,-130,26,70,22,0);  bgBuilding(225,-70,24,46,20,2);
bgBuilding(120,-190,30,38,24,1);  bgBuilding(-140,-200,32,44,26,2);

/* construction cranes */
function crane(x,z,ry,col=0xd9a021){
  const g=new THREE.Group();
  const mat=std({color:col,roughness:.5,metalness:.4});
  const mast=new THREE.Mesh(new THREE.BoxGeometry(1.6,64,1.6),mat); mast.position.y=32; g.add(mast);
  const jib=new THREE.Mesh(new THREE.BoxGeometry(46,1.3,1.3),mat); jib.position.set(15,64,0); g.add(jib);
  const cJib=new THREE.Mesh(new THREE.BoxGeometry(12,1.3,1.3),mat); cJib.position.set(-12,64,0); g.add(cJib);
  const cw=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.4,2),M.concrete); cw.position.set(-16,62.5,0); g.add(cw);
  const top=new THREE.Mesh(new THREE.BoxGeometry(1,8,1),mat); top.position.set(0,68,0); g.add(top);
  const lineM=new THREE.LineBasicMaterial({color:0x333333});
  const pts=[new THREE.Vector3(0,72,0),new THREE.Vector3(34,64.7,0),new THREE.Vector3(0,72,0),new THREE.Vector3(-16,64.7,0)];
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineM));
  const cable=[new THREE.Vector3(28,64,0),new THREE.Vector3(28,34,0)];
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cable),lineM));
  const hook=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.2,1.6),M.concrete); hook.position.set(28,33,0); g.add(hook);
  g.position.set(x,0,z); g.rotation.y=ry;
  g.traverse(o2=>{if(o2.isMesh)o2.castShadow=true;});
  return g;
}
scene.add(crane(-170,-150,0.5));
scene.add(crane(215,-170,2.4,0x9aa0a6));

/* ============================================================ clouds, god rays, birds */
const clouds=[];
for(let i=0;i<12;i++){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudT,transparent:true,opacity:rand(.35,.7),depthWrite:false,fog:false}));
  s.position.set(rand(-900,900),rand(150,300),rand(-700,300));
  const sc=rand(90,220); s.scale.set(sc,sc*0.42,1);
  s.userData={v:rand(1.2,3)};
  scene.add(s); clouds.push(s);
}
const rays=[];
for(let i=0;i<3;i++){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:rayT,transparent:true,opacity:0.05,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  scene.add(s); rays.push(s);
}
function placeRays(){
  const dir=sun.position.clone().normalize();
  for(let i=0;i<3;i++){
    const t=[0.42,0.6,0.78][i];
    rays[i].position.copy(dir.clone().multiplyScalar(340*t));
    rays[i].position.y=Math.max(rays[i].position.y,40);
    const sc=[420,300,190][i];
    rays[i].scale.set(sc,sc,1);
  }
}
placeRays();
const birdG=new THREE.Group(); scene.add(birdG);
const birdMat=new THREE.MeshBasicMaterial({color:0x2a2d31,side:THREE.DoubleSide});
const birds=[];
for(let i=0;i<7;i++){
  const b=new THREE.Group();
  const wingGeo=new THREE.PlaneGeometry(1.4,0.4);
  const w1=new THREE.Mesh(wingGeo,birdMat); w1.position.x=-0.65; b.add(w1);
  const w2=new THREE.Mesh(wingGeo,birdMat); w2.position.x=0.65; b.add(w2);
  b.userData={a:rand(0,6.28),r:rand(35,75),h:rand(55,85),v:rand(.1,.22),f:rand(4,7)};
  birdG.add(b); birds.push(b);
}

scene.add(site.build());
scene.add(trees.build());

/* ============================================================ presets & views */
const PRESETS={
  day:{
    sunPos:[140,190,90], sunCol:0xfff2dd, sunInt:3.2, hemiInt:0.6,
    skyTop:0x3877cf, skyHor:0xdfe9f0, skySun:0xfff0d0, haze:0.45,
    fog:0xdfe9f0, fogNear:320, fogFar:1150, exposure:1.05,
    lamps:0, interiors:[0.96,0.96,0.98], rays:0.045, cove:0
  },
  golden:{
    sunPos:[-190,58,105], sunCol:0xffb066, sunInt:2.6, hemiInt:0.47,
    skyTop:0x3a5788, skyHor:0xe8a978, skySun:0xffcf90, haze:0.55,
    fog:0xdcab8b, fogNear:280, fogFar:1050, exposure:1.08,
    lamps:1, interiors:[1.5,1.32,1.05], rays:0.11, cove:2.2
  }
};
let mode='day';
function applyPreset(name){
  mode=name;
  const p=PRESETS[name];
  sun.position.set(...p.sunPos);
  sun.color.setHex(p.sunCol); sun.intensity=p.sunInt;
  hemi.intensity=p.hemiInt;
  skyUni.cTop.value.setHex(p.skyTop);
  skyUni.cHor.value.setHex(p.skyHor);
  skyUni.cSun.value.setHex(p.skySun);
  skyUni.haze.value=p.haze;
  skyUni.sunDir.value.copy(sun.position).normalize();
  scene.fog.color.setHex(p.fog); scene.fog.near=p.fogNear; scene.fog.far=p.fogFar;
  renderer.toneMappingExposure=p.exposure;
  M.interior.color.setRGB(...p.interiors);
  M.lampHead.emissiveIntensity=p.lamps*2.4;
  M.cove.emissiveIntensity=p.cove;
  for(const s of lampGlows) s.material.opacity=p.lamps*0.75;
  for(const r2 of rays) r2.material.opacity=p.rays;
  placeRays();
  document.getElementById('tglSun').textContent = name==='day' ? 'Golden hour' : 'Midday sun';
}
applyPreset('day');

const VIEWS={
  aerial:    {pos:[148,142,178], tgt:[0,8,-6]},
  courtyard: {pos:[11,2.4,15],   tgt:[-8,8,-16]},
  facade:    {pos:[-8,5,28],     tgt:[-30,15,-12]},
  boulevard: {pos:[-58,3.5,70],  tgt:[24,18,10]},
  penthouse: {pos:[64,31,34],    tgt:[28,23,-10]}
};
let camTween=null;
function setView(name,instant){
  const v=VIEWS[name]; if(!v) return;
  if(instant){
    camTween=null;
    camera.position.set(...v.pos);
    controls.target.set(...v.tgt);
  } else {
    camTween={
      p0:camera.position.clone(), p1:new THREE.Vector3(...v.pos),
      t0:controls.target.clone(), t1:new THREE.Vector3(...v.tgt),
      t:0
    };
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===name));
}
window.__setView=setView;
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.getElementById('tglSun').addEventListener('click',()=>applyPreset(mode==='day'?'golden':'day'));
const orbitBtn=document.getElementById('tglOrbit');
orbitBtn.addEventListener('click',()=>{
  controls.autoRotate=!controls.autoRotate;
  controls.autoRotateSpeed=0.7;
  orbitBtn.classList.toggle('on',controls.autoRotate);
});

/* ============================================================ loop */
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
const clock=new THREE.Clock();
let firstFrame=false;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05), t=clock.elapsedTime;
  uTime.value=t;
  if(camTween){
    camTween.t+=dt*0.9;
    const k=camTween.t>=1?1:1-Math.pow(1-camTween.t,3);
    camera.position.lerpVectors(camTween.p0,camTween.p1,k);
    controls.target.lerpVectors(camTween.t0,camTween.t1,k);
    if(camTween.t>=1) camTween=null;
  }
  controls.update();
  for(const c of movers){
    c.position.x+=c.userData.v*dt;
    if(c.position.x>175) c.position.x=-175;
    if(c.position.x<-175) c.position.x=175;
  }
  for(const w of walkers){
    w.userData.t=(w.userData.t+w.userData.speed*dt)%1;
    const p=walkCurve.getPointAt(w.userData.t);
    const p2=walkCurve.getPointAt((w.userData.t+0.004)%1);
    w.position.copy(p);
    w.lookAt(p2.x,p.y,p2.z);
  }
  for(const s2 of strollers){
    s2.position.x+=s2.userData.v*dt;
    if(s2.position.x>110) s2.userData.v=-Math.abs(s2.userData.v);
    if(s2.position.x<-110) s2.userData.v=Math.abs(s2.userData.v);
    s2.rotation.y=s2.userData.v>0?Math.PI/2:-Math.PI/2;
  }
  for(const cl of clouds){
    cl.position.x+=cl.userData.v*dt;
    if(cl.position.x>950) cl.position.x=-950;
  }
  for(const b of birds){
    const u=b.userData; u.a+=u.v*dt*3;
    b.position.set(Math.cos(u.a)*u.r,u.h+Math.sin(t*0.7+u.r)*2,-30+Math.sin(u.a)*u.r);
    b.rotation.y=-u.a;
    const flap=Math.sin(t*u.f)*0.7;
    b.children[0].rotation.z=flap;
    b.children[1].rotation.z=-flap;
  }
  renderer.render(scene,camera);
  if(!firstFrame){
    firstFrame=true;
    const l=document.getElementById('load');
    l.style.opacity='0';
    setTimeout(()=>l.remove(),600);
    window.__READY=true;
  }
}
animate();
