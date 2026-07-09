import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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
/* Sobel height->normal map: real micro-relief on every surface */
function normalTex(srcTex,strength=1){
  const src=srcTex.image, w=src.width, h=src.height;
  const data=src.getContext('2d').getImageData(0,0,w,h).data;
  const lum=(x,y)=>{x=(x+w)%w; y=(y+h)%h; const i=(y*w+x)*4;
    return (data[i]*0.3+data[i+1]*0.59+data[i+2]*0.11)/255;};
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'), out=g.createImageData(w,h), px=out.data;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const dx=(lum(x+1,y)-lum(x-1,y))*strength;
    const dy=(lum(x,y+1)-lum(x,y-1))*strength;
    const il=1/Math.sqrt(dx*dx+dy*dy+1), i=(y*w+x)*4;
    px[i]=(-dx*il*0.5+0.5)*255; px[i+1]=(dy*il*0.5+0.5)*255; px[i+2]=il*255; px[i+3]=255;
  }
  g.putImageData(out,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8;
  return t;
}
/* seeded value-noise fbm for terrain */
function vhash(ix,iy,seed){
  let n=Math.imul(ix,374761393)+Math.imul(iy,668265263)+seed|0;
  n=Math.imul(n^(n>>>13),1274126177); n^=n>>>16;
  return (n>>>0)/4294967296;
}
function vnoise(x,y,seed){
  const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
  const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
  return vhash(ix,iy,seed)*(1-sx)*(1-sy)+vhash(ix+1,iy,seed)*sx*(1-sy)
        +vhash(ix,iy+1,seed)*(1-sx)*sy+vhash(ix+1,iy+1,seed)*sx*sy;
}
function fbm(x,y,seed){
  return vnoise(x,y,seed)*0.52+vnoise(x*2.1,y*2.1,seed+7)*0.26
        +vnoise(x*4.3,y*4.3,seed+13)*0.14+vnoise(x*8.9,y*8.9,seed+29)*0.08;
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
  g.fillStyle='#c3bcae'; g.fillRect(0,0,w,h);
  noise(g,w,h,2400,['#b8b1a2','#cdc7ba','#b2ab9d'],.7,2.4,.5);
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
const blindT = makeTex(128,256,(g,w,h)=>{
  g.fillStyle='#e9e3d5'; g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=6){
    g.fillStyle='rgba(140,128,104,0.35)'; g.fillRect(0,y,w,2);
    g.fillStyle='rgba(255,255,255,0.25)'; g.fillRect(0,y+2,w,1);
  }
  g.fillStyle='#cfc7b4'; g.fillRect(0,h-10,w,10);
});
const rippleSrcT = makeTex(256,256,(g,w,h)=>{
  g.fillStyle='#808080'; g.fillRect(0,0,w,h);
  noise(g,w,h,2600,['#6a6a6a','#969696','#747474','#8c8c8c'],2,9,.5);
});
const oakT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#a97f4f'; g.fillRect(0,0,w,h);
  const tones=['#b98c58','#9c7344','#c29a66','#8f6a3e','#b28350'];
  for(let i=-4;i<12;i++) for(let j=-2;j<8;j++){
    g.save();
    g.translate(i*76, j*152+(((i%2)+2)%2)*76);
    g.rotate(i%2?Math.PI/4:-Math.PI/4);
    g.fillStyle=tones[(Math.random()*tones.length)|0];
    g.fillRect(-19,-80,38,160);
    g.strokeStyle='rgba(60,40,20,0.5)'; g.lineWidth=2; g.strokeRect(-19,-80,38,160);
    g.restore();
  }
  noise(g,w,h,900,['#00000018','#ffffff10'],.5,2,.5);
});
const tileLT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#d8d6d1'; g.fillRect(0,0,w,h);
  noise(g,w,h,1600,['#cfccc6','#e0dedb','#c9c6c0'],.8,3,.4);
  g.strokeStyle='#b2afaa'; g.lineWidth=3;
  for(let p=0;p<=w;p+=256){ g.beginPath();g.moveTo(p,0);g.lineTo(p,h);g.stroke(); g.beginPath();g.moveTo(0,p);g.lineTo(w,p);g.stroke(); }
});
const quartzT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#f1f0ed'; g.fillRect(0,0,w,h);
  noise(g,w,h,900,['#e8e7e4','#f8f7f5'],.8,3,.5);
  g.strokeStyle='rgba(140,142,150,0.3)';
  for(let i=0;i<14;i++){
    g.lineWidth=0.8+Math.random()*2;
    g.beginPath();
    let x=Math.random()*w, y=Math.random()*h;
    g.moveTo(x,y);
    for(let s2=0;s2<4;s2++){ x+=Math.random()*160-80; y+=Math.random()*120-60; g.lineTo(x,y); }
    g.stroke();
  }
});
const rugT = makeTex(512,512,(g,w,h)=>{
  g.fillStyle='#c9c1b1'; g.fillRect(0,0,w,h);
  noise(g,w,h,3200,['#bfb7a6','#d3ccbd','#b5ad9c'],.6,2,.5);
  g.strokeStyle='#8f8677'; g.lineWidth=14; g.strokeRect(24,24,w-48,h-48);
  g.strokeStyle='rgba(120,112,96,0.35)'; g.lineWidth=2;
  for(let i=-8;i<8;i++){ g.beginPath(); g.moveTo(i*64,0); g.lineTo(i*64+h,h); g.stroke(); }
});
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

const IS_MOBILE=matchMedia('(pointer:coarse)').matches;
const pmrem=new THREE.PMREMGenerator(renderer);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.06;
controls.maxPolarAngle=Math.PI*0.495;
controls.minDistance=6; controls.maxDistance=650;
controls.target.set(0,10,-4);

const sun=new THREE.DirectionalLight(0xfff2dd,3.2);
sun.position.set(140,190,90);
sun.castShadow=true;
sun.shadow.mapSize.set(IS_MOBILE?2048:4096,IS_MOBILE?2048:4096);
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
/* image-based lighting rendered from the actual sky, so glass/metal/water
   reflect the real sun & horizon colors in both lighting modes */
const envScene=new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100,24,12),skyMat));
const envGroundMat=new THREE.MeshBasicMaterial({color:0x7d8a68});
const envGround=new THREE.Mesh(new THREE.CircleGeometry(95,24),envGroundMat);
envGround.rotation.x=-Math.PI/2; envGround.position.y=-1.5;
envScene.add(envGround);
let envRT=null;
function updateEnv(){
  const old=envRT;
  envRT=pmrem.fromScene(envScene,0.09);
  scene.environment=envRT.texture;
  if(old) old.dispose();
}
/* post-processing: HDR render + bloom + tonemap, MSAA target for AA */
const composerRT=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{samples:IS_MOBILE?2:4,type:THREE.HalfFloatType});
const composer=new EffectComposer(renderer,composerRT);
composer.addPass(new RenderPass(scene,camera));
const bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.17,0.5,0.92);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
let useComposer=true;

/* ============================================================ materials */
const uTime={value:0};
function std(o){ return new THREE.MeshStandardMaterial(o); }
const NM={
  stucco:normalTex(stuccoT,1.4), darkP:normalTex(darkPanelT,1.4),
  wood:normalTex(woodHT,1.2), woodV:normalTex(woodVT,1.2),
  brick:normalTex(brickT,2.2), grass:normalTex(grassT,1.6),
  asphalt:normalTex(asphaltT,1.6), pave:normalTex(paveT,1.6),
  stone:normalTex(stoneT,2.6), concrete:normalTex(concreteT,1.2),
  green:normalTex(greenWallT,2.0), ripple:normalTex(rippleSrcT,2.0)
};
const M={
  white:  std({map:stuccoT, normalMap:NM.stucco, normalScale:new THREE.Vector2(.5,.5), roughness:.62, metalness:0}),
  dark:   std({map:darkPanelT, normalMap:NM.darkP, normalScale:new THREE.Vector2(.5,.5), roughness:.5, metalness:.25}),
  anthr:  std({map:anthrT, roughness:.55, metalness:.2}),
  wood:   std({map:woodHT, normalMap:NM.wood, normalScale:new THREE.Vector2(.55,.55), roughness:.58, metalness:0}),
  woodV:  std({map:woodVT, normalMap:NM.woodV, normalScale:new THREE.Vector2(.55,.55), roughness:.58, metalness:0}),
  brick:  std({map:brickT, normalMap:NM.brick, normalScale:new THREE.Vector2(.8,.8), roughness:.78, metalness:0}),
  glass:  std({color:0x2c414e, metalness:.92, roughness:.07, envMapIntensity:2.1, transparent:true, opacity:.56}),
  frame:  std({color:0x191b1e, roughness:.38, metalness:.7}),
  railM:  std({map:railMeshT, transparent:true, alphaTest:.35, side:THREE.DoubleSide, roughness:.5, metalness:.6, color:0xffffff}),
  railS:  std({map:railSlatT, transparent:true, alphaTest:.35, side:THREE.DoubleSide, roughness:.5, metalness:.6, color:0xffffff}),
  glassR: std({color:0x9fbecb, transparent:true, opacity:.2, roughness:.06, metalness:.6, side:THREE.DoubleSide, envMapIntensity:1.1}),
  green:  std({map:greenWallT, normalMap:NM.green, normalScale:new THREE.Vector2(.9,.9), roughness:.92, metalness:0}),
  leafy:  std({map:leafyAlphaT, transparent:true, alphaTest:.4, side:THREE.DoubleSide, roughness:.9}),
  interior:new THREE.MeshBasicMaterial({map:roomAtlasT}),
  blind:  std({map:blindT, roughness:.85}),
  concrete:std({map:concreteT, normalMap:NM.concrete, normalScale:new THREE.Vector2(.45,.45), roughness:.85}),
  stone:  std({map:stoneT, normalMap:NM.stone, normalScale:new THREE.Vector2(1,1), roughness:.9}),
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
  water:  std({color:0x8fc3d4, metalness:.9, roughness:.04, envMapIntensity:1.8, normalMap:NM.ripple, normalScale:new THREE.Vector2(.32,.32)}),
  tire:   std({color:0x141518, roughness:.92}),
  hub:    std({color:0xb9bec2, roughness:.25, metalness:.9}),
  bulb:   new THREE.MeshStandardMaterial({color:0x594a34, emissive:0xffd9a0, emissiveIntensity:0, roughness:.5}),
  legDark:std({color:0x2e3338, roughness:.85}),
  topA:   std({color:0xb2543e, roughness:.85}),
  topB:   std({color:0xd8d2c4, roughness:.85}),
  topC:   std({color:0x5e7d9a, roughness:.85}),
  topD:   std({color:0x5e7157, roughness:.85}),
  skin:   std({color:0xd9b18f, roughness:.7}),
  terrain:std({vertexColors:true, roughness:1, metalness:0}),
  bronze: std({color:0x7a6a4e, metalness:.9, roughness:.32}),
  lampPole:std({color:0x2a2c2e, roughness:.5, metalness:.6}),
  lampHead:new THREE.MeshStandardMaterial({color:0x2a2c2e, emissive:0xffdca0, emissiveIntensity:0, roughness:.4}),
  cove:   new THREE.MeshStandardMaterial({color:0x574a33, emissive:0xffc884, emissiveIntensity:0, roughness:.6}),
  beige:  std({color:0xd9cfc0, roughness:.8}),
  parasol:std({color:0xe7e2d6, roughness:.7, side:THREE.DoubleSide}),
};
/* balanced reflection strengths under the sky IBL */
const ENV_I={white:.4,dark:.5,anthr:.45,wood:.45,woodV:.45,brick:.35,frame:1.0,
  glass:2.2,glassR:1.7,concrete:.35,stone:.35,roofL:.4,roof:.4,hvac:1.1,solar:1.4,
  hedge:.3,leaf:.3,leafD:.3,leafL:.3,green:.3,beige:.4,hub:1.4,tire:.3};
for(const k in ENV_I) if(M[k]) M[k].envMapIntensity=ENV_I[k];
[M.leaf,M.leafD,M.leafL].forEach(mat=>{
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uTime=uTime;
    sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.x += sin(uTime*1.6 + position.y*0.5 + position.z*0.35)*0.07;
       transformed.z += cos(uTime*1.2 + position.x*0.4)*0.05;`);
  };
});
/* interior fit-out materials */
M.oak=std({map:oakT, normalMap:normalTex(oakT,1.2), normalScale:new THREE.Vector2(.5,.5), roughness:.5});
M.oakD=std({color:0x4e3a28, roughness:.45});
M.tileL=std({map:tileLT, normalMap:normalTex(tileLT,1.0), normalScale:new THREE.Vector2(.4,.4), roughness:.32});
M.quartz=std({map:quartzT, roughness:.18});
M.rug=std({map:rugT, roughness:1});
M.sofaF=std({color:0xb6aea0, roughness:.95});
M.mirror=std({color:0xdfe8ec, metalness:1, roughness:.04, envMapIntensity:2.6});
M.steel=std({color:0x9aa0a5, metalness:.95, roughness:.3, envMapIntensity:1.6});
M.tv=std({color:0x0b0d10, metalness:.6, roughness:.15, envMapIntensity:1.8});
M.sanitary=std({color:0xf3f5f5, roughness:.22});
const NO_CAST=new Set(['glass','glassR','railM','railS','leafy','interior','water','cove','blind','bulb']);

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
  /* ==================== REAL RC FLAT-SLAB CONSTRUCTION ====================
     Researched typology: reinforced-concrete flat-slab frame; balconies are
     LOGGIAS — voids recessed ~1.9m INTO the facade line, bounded on 2-3
     sides ("sheltered outdoor rooms"), deck integrated into the slab,
     balustrade only on the open side. White frames = slab edge aprons +
     structural wing walls wrapping the voids. */
  const totH=GH+(floors-1)*FH;
  const LD=1.85;                                   // loggia recess depth
  /* shared module helpers ------------------------------------------------ */
  function winModule(fr,cx,y0,h,mw){
    const gw=mw-0.7, gh=h-0.85, gy=y0+0.55+gh/2;
    fBox(B,'anthr',fr,0.12,gh+0.24,0.4,cx-gw/2-0.1,gy,fr.dist-0.06);
    fBox(B,'anthr',fr,0.12,gh+0.24,0.4,cx+gw/2+0.1,gy,fr.dist-0.06);
    fBox(B,'anthr',fr,gw+0.34,0.12,0.4,cx,gy+gh/2+0.1,fr.dist-0.06);
    fRoomPlane(B,fr,gw,gh,cx,gy,fr.dist-0.6);
    if(wingR()<.38){
      const hf=wr(0.25,0.7);
      fPlane(B,'blind',fr,gw-0.08,gh*hf,cx,gy+gh/2-gh*hf/2,fr.dist-0.3,[1,hf*2]);
    }
    fPlane(B,'glass',fr,gw,gh,cx,gy,fr.dist-0.16);
    const fw=0.08;
    fBox(B,'frame',fr,gw+0.16,fw,0.14,cx,gy+gh/2,fr.dist-0.12);
    fBox(B,'frame',fr,gw+0.16,fw,0.14,cx,gy-gh/2,fr.dist-0.12);
    fBox(B,'frame',fr,fw,gh+0.1,0.14,cx-gw/2,gy,fr.dist-0.12);
    fBox(B,'frame',fr,fw,gh+0.1,0.14,cx+gw/2,gy,fr.dist-0.12);
    fBox(B,'frame',fr,0.055,gh,0.12,cx+gw*0.18,gy,fr.dist-0.12);
    fBox(B,'white',fr,gw+0.4,0.09,0.34,cx,gy-gh/2-0.09,fr.dist+0.05,[gw/2.4,0.1]);
  }
  function railRun(fr,cx,w,y0,zR,glassVariant){
    if(glassVariant){
      fBox(B,'glassR',fr,w+0.02,0.95,0.03,cx,y0+0.72,zR);
      fBox(B,'frame',fr,w+0.06,0.055,0.06,cx,y0+1.22,zR);
    } else {
      for(let k=0;k<6;k++) fBox(B,'frame',fr,w+0.04,0.032,0.032,cx,y0+0.42+k*0.145,zR);
      fBox(B,'frame',fr,w+0.06,0.05,0.055,cx,y0+1.2,zR);
      for(const px3 of [-w/2,0,w/2]) fBox(B,'frame',fr,0.045,1.0,0.045,cx+px3,y0+0.72,zR);
    }
  }

  if(o.brickStyle){
    /* masonry-clad block: load-bearing look, punched openings, louvres */
    for(let f=0;f<floors;f++){
      const y0=f===0?0:GH+(f-1)*FH, h=f===0?GH:FH;
      B.box('brick',L,h,D,0,y0+h/2,0,0,[L/2.6,h/2.6]);
    }
    B.box('white',L+0.7,0.5,D+0.7,0,topY-0.08,0,0,[(L+0.7)/2.4,0.5]);
    for(const fr of frames){
      const n=Math.max(2,Math.floor((fr.len-1.4)/MW)), x0=-((n-1)*MW)/2;
      for(let cI=0;cI<=n;cI++)
        if(wingR()<.72) fBox(B,'brick',fr,1.1,totH+FH,0.3,x0+cI*MW-MW/2,(totH+FH)/2,fr.dist+0.1,[1.1/1.6,(totH+FH)/1.6]);
      for(let f=0;f<floors;f++){
        const y0=f===0?0:GH+(f-1)*FH, h=f===0?GH:FH;
        for(let cI=0;cI<n;cI++){
          const cx=x0+cI*MW, t=wingR();
          if(t<.5) winModule(fr,cx,y0,h,MW);
          else if(t<.62) fBox(B,'woodV',fr,1.5,h-0.9,0.14,cx,y0+0.55+(h-0.9)/2,fr.dist+0.05,[1,2]);
        }
      }
    }
  } else {
  /* ---- structural core (interior mass behind the loggia zone) ---- */
  if(o.showcase){
    B.box('anthr',L-0.8,totH-GH,D-5.0,0,GH+(totH-GH)/2,0,0,[L/2.6,(totH-GH)/2.6]);
    B.box('anthr',(L-25)/2,GH,D-1.0,-(25+(L-25)/2)/2,GH/2,0,0,[4,GH/2.6]);
    B.box('anthr',(L-25)/2,GH,D-1.0,(25+(L-25)/2)/2,GH/2,0,0,[4,GH/2.6]);
  } else {
    B.box('anthr',L-0.8,totH-GH,D-5.0,0,GH+(totH-GH)/2,0,0,[L/2.6,(totH-GH)/2.6]);
    B.box('anthr',L,GH,D-1.2,0,GH/2,0,0,[L/2.6,GH/2.6]);
  }
  /* stone plinth */
  B.box('stone',L+0.3,0.55,D+0.3,0,0.28,0,0,[L/1.4,0.5]);
  /* ---- floor slabs with white edge aprons + drip shadows ---- */
  for(let f=1;f<=floors;f++){
    const y=f===1?GH:GH+(f-1)*FH;
    B.box('anthr',L+0.04,0.3,D+0.04,0,y-0.15,0);
    B.box('white',L+0.7,0.5,D+0.7,0,y-0.08,0,0,[(L+0.7)/2.4,0.5]);
    B.box('anthr',L+0.74,0.05,D+0.74,0,y-0.36,0);
  }
  /* ---- long faces: per-module deep facade system ---- */
  for(const fr of frames.slice(0,2)){
    const n=Math.max(2,Math.floor((fr.len-1.4)/MW)), x0=-((n-1)*MW)/2;
    /* column archetypes (vertically coherent) */
    const colType=[];
    for(let cI=0;cI<n;cI++){
      const t=wingR();
      colType.push(t<.36?'loggia':t<.64?'win':t<.76?'bay':'solid');
    }
    /* full-height structural white piers at 2-3 module boundaries */
    for(let k=0,kn=wi(2,3);k<kn;k++){
      const bx=x0+wi(1,n-1)*MW-MW/2;
      fBox(B,'white',fr,0.5,totH-GH+0.4,0.5,bx,GH+(totH-GH)/2,fr.dist+0.1,[0.4,(totH-GH)/2.4]);
    }
    /* green vertical strips on 1-2 boundaries */
    for(let k=0,kn=wi(1,2);k<kn;k++){
      const bx=x0+wi(1,n-1)*MW-MW/2;
      fBox(B,'green',fr,0.8,totH-GH-0.6,0.24,bx,GH+(totH-GH)/2-0.2,fr.dist+0.14,[1,(totH-GH)/3]);
    }
    /* interlocking highlight frames at slab lines */
    for(let f=1;f<floors;f++){
      const y=GH+(f-1)*FH;
      for(let j=0,nj=wi(1,2);j<nj;j++){
        const a=wi(0,Math.max(0,n-4)), span=wi(2,4);
        const cxJ=x0+(a+span/2-0.5)*MW, wJ=span*MW;
        fBox(B,'white',fr,wJ,0.6,0.62,cxJ,y+FH-0.08,fr.dist+0.2,[wJ/2.4,0.5]);
        fBox(B,'white',fr,0.6,FH+0.55,0.58,cxJ-wJ/2,y+FH/2-0.08,fr.dist+0.17,[0.4,FH/2.4]);
        fBox(B,'white',fr,0.6,FH+0.55,0.58,cxJ+wJ/2,y+FH/2-0.08,fr.dist+0.17,[0.4,FH/2.4]);
      }
    }
    /* upper floors */
    for(let f=1;f<floors;f++){
      if(f===floors-1 && o.penthouse) continue;
      const y0=GH+(f-1)*FH, h=FH;
      /* per-floor effective row (staggered from archetype) */
      const row=colType.map(t2=>{
        const r3=wingR();
        if(r3<.14) return t2==='loggia'?'win':t2==='win'?'loggia':t2;
        return t2;
      });
      for(let cI=0;cI<n;cI++){
        const cx=x0+cI*MW, type=row[cI];
        if(type==='solid'){
          if(wingR()<.6) fBox(B,'white',fr,MW+0.08,h-0.28,0.28,cx,y0+h/2-0.03,fr.dist-0.1,[MW/2.4,h/2.4]);
          else fBox(B,'dark',fr,MW+0.08,h-0.28,0.26,cx,y0+h/2-0.03,fr.dist-0.11,[MW/2.4,h/2.4]);
          continue;
        }
        if(type==='win'){
          fBox(B,'anthr',fr,MW+0.06,h-0.28,0.3,cx,y0+h/2-0.03,fr.dist-0.15,[MW/2.6,h/2.6]);
          winModule(fr,cx,y0,h,MW);
          continue;
        }
        if(type==='bay'){
          /* cantilevered glazed bay: protrudes 0.85m past the slab edge */
          const prot=0.85, bw=MW-0.12;
          fBox(B,'white',fr,bw,0.26,prot+0.5,cx,y0+0.16,fr.dist+prot-(prot+0.5)/2+0.05,[bw/2.4,0.3]);
          fBox(B,'white',fr,bw,0.26,prot+0.5,cx,y0+h-0.42,fr.dist+prot-(prot+0.5)/2+0.05,[bw/2.4,0.3]);
          const gh2=h-0.95;
          fRoomPlane(B,fr,bw-0.9,gh2,cx,y0+0.3+gh2/2,fr.dist+0.12);
          fPlane(B,'glass',fr,bw-0.7,gh2,cx,y0+0.3+gh2/2,fr.dist+prot);
          fBox(B,'glass',fr,0.04,gh2,prot-0.2,cx-bw/2+0.32,y0+0.3+gh2/2,fr.dist+prot/2-0.05);
          fBox(B,'glass',fr,0.04,gh2,prot-0.2,cx+bw/2-0.32,y0+0.3+gh2/2,fr.dist+prot/2-0.05);
          fBox(B,'frame',fr,0.08,gh2+0.1,0.08,cx-bw/2+0.32,y0+0.3+gh2/2,fr.dist+prot);
          fBox(B,'frame',fr,0.08,gh2+0.1,0.08,cx+bw/2-0.32,y0+0.3+gh2/2,fr.dist+prot);
          fBox(B,'frame',fr,bw-0.6,0.07,0.08,cx,y0+0.32,fr.dist+prot);
          fBox(B,'frame',fr,bw-0.6,0.07,0.08,cx,y0+0.28+gh2,fr.dist+prot);
          continue;
        }
        /* ---- LOGGIA: real 1.85m-deep sheltered outdoor room ---- */
        const zB=fr.dist-LD;
        /* rear glazed wall (sliding door) */
        fBox(B,'anthr',fr,MW+0.12,h-0.28,0.22,cx,y0+h/2-0.03,zB-0.14,[MW/2.6,h/2.6]);
        const gw=MW-0.75, gh=h-0.62, gy=y0+0.14+gh/2;
        fRoomPlane(B,fr,gw,gh,cx,gy,zB-0.5);
        if(wingR()<.3){
          const hf=wr(0.3,0.7);
          fPlane(B,'blind',fr,gw-0.08,gh*hf,cx,gy+gh/2-gh*hf/2,zB-0.28,[1,hf*2]);
        }
        fPlane(B,'glass',fr,gw,gh,cx,gy,zB+0.02);
        fBox(B,'frame',fr,gw+0.14,0.08,0.12,cx,gy+gh/2,zB+0.04);
        fBox(B,'frame',fr,gw+0.14,0.1,0.12,cx,gy-gh/2,zB+0.04);
        fBox(B,'frame',fr,0.08,gh,0.12,cx-gw/2,gy,zB+0.04);
        fBox(B,'frame',fr,0.08,gh,0.12,cx+gw/2,gy,zB+0.04);
        fBox(B,'frame',fr,0.06,gh,0.1,cx,gy,zB+0.04);
        /* deck + soffit ceiling of the void */
        fBox(B,'tileL',fr,MW+0.1,0.07,LD-0.02,cx,y0+0.055,fr.dist-LD/2-0.02,[MW/1.2,LD/1.2]);
        const soffit=wingR()<.55?'wood':'white';
        fBox(B,soffit,fr,MW+0.1,0.09,LD+0.05,cx,y0+h-0.35,fr.dist-LD/2,[MW/2.4,LD/2.4]);
        if(wingR()<.4) fBox(B,'cove',fr,MW-0.6,0.05,0.05,cx,y0+h-0.42,fr.dist-0.35);
        /* structural wing walls where the void meets a different module */
        const leftW = cI===0 || row[cI-1]!=='loggia';
        const rightW= cI===n-1 || row[cI+1]!=='loggia';
        if(leftW){
          fBox(B,'white',fr,0.24,h-0.26,LD+0.3,cx-MW/2-0.04,y0+h/2-0.02,fr.dist+0.13-(LD+0.3)/2,[0.3,h/2.4]);
          if(wingR()<.3) fBox(B,'green',fr,0.07,h-0.75,LD-0.5,cx-MW/2+0.1,y0+h/2-0.1,fr.dist-LD/2,[LD/1.4,h/2.6]);
        }
        if(rightW)
          fBox(B,'white',fr,0.24,h-0.26,LD+0.3,cx+MW/2+0.04,y0+h/2-0.02,fr.dist+0.13-(LD+0.3)/2,[0.3,h/2.4]);
        /* balustrade on the open side only (per research) */
        railRun(fr,cx,MW,y0,fr.dist+0.02,wingR()<.35);
        /* life inside the void */
        if(wingR()<.42){
          fBox(B,'beige',fr,1.35,0.4,0.62,cx+MW/5,y0+0.32,fr.dist-1.2);
          fBox(B,'beige',fr,1.35,0.45,0.14,cx+MW/5,y0+0.6,fr.dist-1.5);
        }
        if(wingR()<.3){
          B.geo('trunk',faceXform(new THREE.CylinderGeometry(0.14,0.18,0.32,8),fr,cx-MW/3,y0+0.28,fr.dist-0.6));
          B.geo('leafD',faceXform(new THREE.IcosahedronGeometry(0.32,1),fr,cx-MW/3,y0+0.8,fr.dist-0.6));
        }
        if(wingR()<.4){
          fBox(B,'frame',fr,1.0,0.32,0.3,cx-MW/4,y0+0.28,fr.dist-0.22);
          fBox(B,'green',fr,0.95,0.18,0.28,cx-MW/4,y0+0.52,fr.dist-0.22,[1,0.3]);
          fPlane(B,'leafy',fr,0.95,1.1,cx-MW/4,y0-0.12,fr.dist+0.06,[1.3,1.2]);
        }
      }
    }
    /* ---- ground floor on long faces ---- */
    {
      const nGL=Math.max(2,Math.floor((fr.len-1.4)/MW));
      const gx0=-((nGL-1)*MW)/2;
      const lobbies=new Set(o.showcase?[]:[wi(1,Math.max(1,nGL-4)),nGL-3]);
      for(let cI=0;cI<nGL;cI++){
        const cx=gx0+cI*MW;
        if(o.showcase && Math.abs(cx)<13.2) continue;      // showcase zone: real interior
        if(lobbies.has(cI) && cI<nGL-1){
          fBox(B,'wood',fr,MW*2+0.6,0.45,0.9,cx+MW/2,GH-0.45,fr.dist+0.35,[MW/1.6,0.5]);
          fBox(B,'wood',fr,0.45,GH-0.6,0.9,cx-MW+0.05,GH/2-0.3,fr.dist+0.35,[0.5,GH/2.4]);
          fBox(B,'wood',fr,0.45,GH-0.6,0.9,cx+MW*2-0.05,GH/2-0.3,fr.dist+0.35,[0.5,GH/2.4]);
          fPlane(B,'glass',fr,MW*2-0.5,GH-1.1,cx+MW/2,(GH-0.7)/2+0.15,fr.dist+0.05);
          fBox(B,'frame',fr,MW*2-0.4,0.1,0.1,cx+MW/2,GH-0.75,fr.dist+0.08);
          fBox(B,'frame',fr,0.08,GH-1.1,0.1,cx+MW/2,(GH-0.7)/2+0.15,fr.dist+0.08);
          fBox(B,'concrete',fr,MW*2+1,0.16,1.6,cx+MW/2,0.08,fr.dist+0.8,[MW/1.4,1]);
          cI++; continue;
        }
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
  /* ---- short end faces: solid walls with punched windows ---- */
  for(const fr of frames.slice(2)){
    const nE=Math.max(1,Math.floor((fr.len-2)/MW)), xE0=-((nE-1)*MW)/2;
    for(let f=0;f<floors;f++){
      if(f===floors-1 && o.penthouse) continue;
      const y0=f===0?0:GH+(f-1)*FH, h=f===0?GH:FH;
      fBox(B,'anthr',fr,fr.len-0.3,h-0.28,0.35,0,y0+h/2-0.02,fr.dist-0.18,[fr.len/2.6,h/2.6]);
      for(let cI=0;cI<nE;cI++)
        if(wingR()<.6) winModule(fr,xE0+cI*MW,y0,h,Math.min(MW,fr.len/nE));
    }
  }
  if(o.showcase) buildShowcase(B,o,wr,wi);
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
  if(o.showcase) showcaseLights.forEach(l=>grp.add(l));
  grp.position.set(o.x,0,o.z);
  if(o.ry) grp.rotation.y=o.ry;
  return grp;
}

/* ============================================================ showcase interior
   Fully modeled, enterable ground floor of the north wing (local coords,
   wing sits at world x=0,z=-35.5, ry=0): glass lobby with reception,
   mailboxes and elevators + furnished 1-bed show apartment. */
const showcaseLights=[];
function buildShowcase(B,o,wr,wi){
  const GH=o.groundH??4.0, H=GH-0.3;
  /* floors */
  B.box('tileL',6.4,0.1,14.8,0,0.05,0,0,[5,11]);
  B.box('oak',9.3,0.1,14.8,7.85,0.05,0,0,[13,21]);
  B.box('tileL',2.9,0.12,7.7,11.05,0.055,-3.45,0,[2.2,6]);
  B.box('concrete',26,0.08,2.4,0,0.04,8.6,0,[10,1]);
  /* left rental unit: massed + glazed front */
  B.box('anthr',9.3,H,14.2,-7.85,H/2,0,0,[4,2]);
  {
    const g=new THREE.PlaneGeometry(8.9,H-0.9); g.translate(-7.85,H/2-0.2,7.51);
    B.geo('glass',g);
  }
  for(let i=0;i<5;i++) B.box('frame',0.07,H-0.9,0.1,-11.6+i*1.9,H/2-0.2,7.52);
  /* ceiling + cove */
  B.box('white',25,0.12,14.9,0,GH-0.34,0,0,[10,6]);
  B.box('cove',5.9,0.06,0.06,6.4,GH-0.42,7.0);
  B.box('cove',5.9,0.06,0.06,6.4,GH-0.42,-6.9);
  /* perimeter + zone walls */
  B.box('white',25,H,0.3,0,H/2,-7.3,0,[10,1.6]);
  B.box('anthr',25.2,H,0.12,0,H/2,-7.49,0,[10,1.6]);
  B.box('white',0.3,H,14.8,-12.5,H/2,0,0,[6,1.6]);
  B.box('white',0.3,H,14.8,12.5,H/2,0,0,[6,1.6]);
  B.box('white',0.24,H,14.8,-3.2,H/2,0,0,[6,1.6]);
  /* w1 lobby|apartment with door gap z 2.2..3.2 */
  B.box('white',0.12,H,9.5,3.2,H/2,-2.55);
  B.box('white',0.12,H,4.3,3.2,H/2,5.35);
  {
    const g=new THREE.BoxGeometry(0.05,2.15,0.95); g.rotateY(1.0); g.translate(3.05,1.08,2.55);
    B.geo('oakD',g);
  }
  /* w2 living|bed/bath with two door gaps */
  B.box('white',0.12,H,2.8,9.6,H/2,-5.9);
  B.box('white',0.12,H,9.0,9.6,H/2,0.9);
  B.box('white',0.12,H,1.2,9.6,H/2,6.9);
  {
    const g=new THREE.BoxGeometry(0.05,2.15,0.9); g.rotateY(-0.9); g.translate(9.7,1.08,5.75);
    B.geo('oakD',g);
  }
  /* w3 bed|bath */
  B.box('white',2.9,H,0.12,11.05,H/2,0.4);
  /* ---------- lobby front: wood portal + glass with open door ---------- */
  B.box('wood',0.42,GH-0.4,0.75,-3.35,GH/2-0.2,7.4,0,[0.5,2.4]);
  B.box('wood',0.42,GH-0.4,0.75,3.35,GH/2-0.2,7.4,0,[0.5,2.4]);
  B.box('wood',7.1,0.5,0.75,0,GH-0.5,7.4,0,[4,0.4]);
  for(const [xa,xb] of [[-3.05,-0.85],[0.85,3.05]]){
    const w=xb-xa, cx=(xa+xb)/2;
    const g=new THREE.PlaneGeometry(w,GH-1.3); g.translate(cx,(GH-1.3)/2+0.12,7.5);
    B.geo('glass',g);
    B.box('frame',0.07,GH-1.3,0.1,xa,(GH-1.3)/2+0.12,7.5);
    B.box('frame',0.07,GH-1.3,0.1,xb,(GH-1.3)/2+0.12,7.5);
  }
  {
    const g=new THREE.PlaneGeometry(1.7,GH-1.3-2.3); g.translate(0,2.3+(GH-1.3-2.3)/2+0.12,7.5);
    B.geo('glass',g);
  }
  B.box('frame',1.9,0.09,0.12,0,2.38,7.5);
  B.box('frame',7.0,0.1,0.12,0,GH-1.15,7.5);
  B.box('frame',7.0,0.08,0.12,0,0.1,7.5);
  {
    const g=new THREE.BoxGeometry(0.9,2.2,0.05); g.rotateY(1.15); g.translate(-1.15,1.22,7.2);
    B.geo('glass',g);
    const f2=new THREE.BoxGeometry(0.08,2.2,0.09); f2.rotateY(1.15); f2.translate(-1.55,1.22,7.05);
    B.geo('frame',f2);
  }
  /* ---------- apartment front: French glazing with open slider ---------- */
  for(const [xa,xb] of [[3.5,4.95],[6.3,9.55],[9.55,12.35]]){
    const w=xb-xa, cx=(xa+xb)/2;
    const g=new THREE.PlaneGeometry(w,GH-1.0); g.translate(cx,(GH-1.0)/2+0.12,7.5);
    B.geo('glass',g);
  }
  for(const mx of [3.45,4.95,6.3,7.9,9.55,11.0,12.35])
    B.box('frame',0.07,GH-1.0,0.12,mx,(GH-1.0)/2+0.12,7.5);
  B.box('frame',9.1,0.1,0.12,7.9,GH-0.85,7.5);
  B.box('frame',9.1,0.09,0.12,7.9,0.1,7.5);
  {
    const g=new THREE.PlaneGeometry(1.3,GH-1.15); g.translate(6.95,(GH-1.15)/2+0.12,7.66);
    B.geo('glass',g);
    B.box('frame',1.36,0.07,0.09,6.95,GH-1.0,7.66);
    B.box('frame',1.36,0.07,0.09,6.95,0.14,7.66);
  }
  /* ---------- lobby fit-out ---------- */
  B.box('oakD',2.4,1.0,0.65,1.0,0.55,-3.0);
  B.box('quartz',2.55,0.07,0.78,1.0,1.08,-3.0,0,[2,0.6]);
  for(let r2=0;r2<4;r2++) for(let c2=0;c2<5;c2++)
    B.box('steel',0.02,0.3,0.34,-3.06,0.95+r2*0.34,0.4+c2*0.38);
  for(const ex of [-1.15,1.15]){
    B.box('steel',1.05,2.3,0.1,ex,1.2,-7.2);
    B.box('frame',1.2,0.08,0.14,ex,2.4,-7.18);
    B.box('frame',0.08,2.35,0.14,ex-0.6,1.2,-7.18);
    B.box('frame',0.08,2.35,0.14,ex+0.6,1.2,-7.18);
  }
  B.box('bulb',0.5,0.06,0.04,0,2.62,-7.17);
  B.box('beige',1.8,0.4,0.55,-1.7,0.32,2.5);
  {
    const g=new THREE.PlaneGeometry(2.2,6.2); g.rotateX(-Math.PI/2); g.rotateY(0); g.translate(0,0.115,1.2);
    scaleUV(g,1,2.6); B.geo('rug',g);
  }
  {
    const g=new THREE.PlaneGeometry(4.2,2.4); g.rotateY(Math.PI/2); g.translate(-3.11,1.7,1.2);
    B.geo('mirror',g);
  }
  for(let i=0;i<3;i++){
    B.cyl('frame',0.008,0.008,0.7,4,-0.8+i*1.4,GH-0.7,-1.0);
    B.geo('bulb',new THREE.SphereGeometry(0.09,8,6).translate(-0.8+i*1.4,GH-1.1,-1.0));
  }
  /* ---------- living / kitchen ---------- */
  {
    const g=new THREE.PlaneGeometry(3.8,2.8); g.rotateX(-Math.PI/2); g.translate(6.3,0.115,3.0);
    B.geo('rug',g);
  }
  B.box('sofaF',0.95,0.4,2.6,7.5,0.32,3.0);
  B.box('sofaF',0.28,0.62,2.6,7.95,0.75,3.0);
  B.box('sofaF',0.95,0.42,0.9,6.6,0.32,1.75);
  for(let i=0;i<3;i++) B.geo('sofaF',new THREE.SphereGeometry(0.22,8,6).scale(1,0.55,1).translate(7.45,0.62,2.2+i*0.8));
  B.cyl('oakD',0.5,0.55,0.3,18,6.2,0.27,3.0);
  B.cyl('glassR',0.58,0.58,0.03,18,6.2,0.45,3.0);
  B.box('oakD',0.4,0.5,2.2,3.48,0.37,3.0);
  B.box('tv',0.06,1.0,1.7,3.34,1.55,3.0);
  /* kitchen run + island */
  B.box('oakD',5.2,0.9,0.62,6.4,0.57,-6.9);
  B.box('quartz',5.3,0.06,0.7,6.4,1.05,-6.88,0,[4,0.6]);
  B.box('wood',5.2,0.75,0.35,6.4,2.35,-7.05,0,[4,0.6]);
  B.box('quartz',5.2,0.6,0.05,6.4,1.55,-7.2,0,[4,0.5]);
  B.box('steel',0.9,0.5,0.5,6.4,2.35,-6.85);
  B.cyl('steel',0.02,0.02,0.35,6,5.2,1.25,-6.9);
  B.box('quartz',2.5,0.95,1.15,6.4,0.58,-4.5,0,[2,0.8]);
  for(let i=0;i<3;i++){
    B.cyl('frame',0.008,0.008,1.1,4,5.6+i*0.8,GH-0.95,-4.5);
    B.geo('bulb',new THREE.SphereGeometry(0.08,8,6).translate(5.6+i*0.8,GH-1.55,-4.5));
    B.cyl('frame',0.03,0.03,0.62,6,5.6+i*0.8,0.32,-3.5);
    B.cyl('oakD',0.19,0.19,0.06,10,5.6+i*0.8,0.66,-3.5);
  }
  /* dining */
  B.box('oak',1.75,0.07,0.95,8.3,0.74,-1.5,0,[1.4,0.8]);
  for(const [lx2,lz2] of [[-0.78,-0.38],[0.78,-0.38],[-0.78,0.38],[0.78,0.38]])
    B.box('oakD',0.07,0.72,0.07,8.3+lx2,0.37,-1.5+lz2);
  for(const [cx2,cz2,ry2] of [[7.4,-1.15,1.57],[7.4,-1.85,1.57],[9.2,-1.15,-1.57],[9.2,-1.85,-1.57]]){
    B.box('legDark',0.42,0.06,0.42,cx2,0.47,cz2);
    const bk=new THREE.BoxGeometry(0.06,0.55,0.42); bk.rotateY(ry2>0?0:0);
    bk.translate(cx2+(ry2>0?-0.18:0.18),0.78,cz2);
    B.geo('legDark',bk);
    for(const dy of [[-0.15,-0.15],[0.15,-0.15],[-0.15,0.15],[0.15,0.15]])
      B.box('legDark',0.05,0.45,0.05,cx2+dy[0],0.22,cz2+dy[1]);
  }
  /* plants, art, lamp, curtains */
  for(const [px2,pz2] of [[3.75,6.85],[9.15,6.95]]){
    B.cyl('anthr',0.22,0.18,0.42,10,px2,0.21,pz2);
    B.geo('leaf',foliageBlob(0.4,1,px2*7).translate(px2,0.95,pz2));
  }
  B.box('frame',0.05,1.15,1.65,9.52,1.95,2.6);
  {
    const g=new THREE.PlaneGeometry(1.5,1.0); g.rotateY(-Math.PI/2); g.translate(9.49,1.95,2.6);
    B.geo('topA',g);
  }
  B.box('frame',0.05,0.95,1.25,3.28,1.9,5.5);
  {
    const g=new THREE.PlaneGeometry(1.1,0.8); g.rotateY(Math.PI/2); g.translate(3.31,1.9,5.5);
    B.geo('topC',g);
  }
  B.cyl('frame',0.02,0.03,1.55,6,8.9,0.78,5.9);
  B.geo('beige',new THREE.ConeGeometry(0.28,0.4,10).translate(8.9,1.75,5.9));
  fCurtain(B,4.1,GH,7.28); fCurtain(B,9.1,GH,7.28);
  /* ---------- bedroom ---------- */
  B.box('sofaF',1.85,1.05,0.12,11.05,0.75,0.55);
  B.box('oak',1.75,0.3,2.05,11.05,0.26,1.75,0,[1.4,1.6]);
  B.box('beige',1.65,0.22,1.95,11.05,0.52,1.75);
  for(const py of [-0.42,0.42]){
    const g=new THREE.CapsuleGeometry(0.13,0.42,3,8); g.rotateZ(Math.PI/2);
    g.translate(11.05+py,0.72,0.95); B.geo('sanitary',g);
  }
  B.box('topC',1.65,0.06,0.62,11.05,0.66,2.45);
  for(const nx of [9.95,12.15]){
    B.box('oakD',0.42,0.45,0.4,nx,0.34,0.75);
    B.geo('bulb',new THREE.SphereGeometry(0.07,8,6).translate(nx,0.72,0.75));
  }
  B.box('oak',0.55,2.3,2.2,9.95,1.15,4.8,0,[1.6,1.8]);
  /* ---------- bathroom ---------- */
  B.box('sanitary',1.6,0.52,0.78,11.55,0.32,-6.65);
  B.box('anthr',1.4,0.06,0.58,11.55,0.56,-6.65);
  B.cyl('steel',0.015,0.015,0.5,6,10.85,0.75,-6.65);
  B.box('oakD',1.3,0.5,0.5,10.35,0.7,-7.0);
  B.box('sanitary',1.1,0.12,0.42,10.35,1.0,-7.0);
  {
    const g=new THREE.PlaneGeometry(1.15,0.85); g.translate(10.35,1.75,-7.22);
    B.geo('mirror',g);
  }
  B.box('glassR',0.9,2.1,0.05,11.9,1.15,-1.3);
  B.box('glassR',0.05,2.1,1.0,11.45,1.15,-0.85);
  B.cyl('steel',0.1,0.1,0.02,10,12.1,2.35,-0.8);
  B.cyl('steel',0.012,0.012,0.5,6,12.2,2.2,-0.55);
  /* ---------- interior lights ---------- */
  const mk=(x,y,z,i,d)=>{const l=new THREE.PointLight(0xffe0b0,i,d,1.7); l.position.set(x,y,z); showcaseLights.push(l);};
  mk(0,3.1,0,26,14); mk(6.4,2.95,0.6,30,14); mk(6.0,2.6,-5.2,14,8);
  mk(11.05,2.5,3.6,12,8); mk(11.05,2.5,-4.2,9,7);
}
function fCurtain(B,x,GH,z){
  const g=new THREE.PlaneGeometry(0.8,GH-1.35);
  scaleUV(g,1.6,1);
  g.translate(x,(GH-1.35)/2+0.12,z);
  B.geo('blind',g);
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
      if(f>0 && tR()<.3){ // recessed loggia with real bar railing
        const lx=tr(-fr.len/5,fr.len/5), lw=fr.len*0.5;
        fBox(B,'anthr',fr,lw,0.16,1.2,lx,y0+0.3,fr.dist-0.7,[3,0.3]);
        for(let k=0;k<5;k++) fBox(B,'frame',fr,lw,0.03,0.03,lx,y0+0.5+k*0.16,fr.dist-0.15);
        fBox(B,'frame',fr,lw,0.05,0.05,lx,y0+1.32,fr.dist-0.15);
        for(let k=-2;k<=2;k++) fBox(B,'frame',fr,0.04,0.95,0.04,lx+k*lw/4,y0+0.85,fr.dist-0.15);
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
cityG.add(buildWing({L:48,D:15,floors:6,x:0,z:-35.5,ry:0,seed:22,penthouse:true,greenRoof:true,groundH:4,showcase:true}));
cityG.add(buildWing({L:52,D:15,floors:7,x:31.5,z:-6,ry:Math.PI/2,seed:33,penthouse:true,solar:true,groundH:4}));
cityG.add(buildTower({W:16,Dp:16,floors:9,x:34,z:-43,ry:0,seed:44}));
cityG.add(buildWing({L:26,D:15,floors:7,x:-64,z:-43,ry:0,seed:55,brickStyle:true,groundH:4}));
/* fully detailed neighbours across the boulevard (photo 5 street canyon) */
cityG.add(buildWing({L:42,D:14,floors:6,x:-70,z:112,ry:0,seed:66,penthouse:true,groundH:4}));
cityG.add(buildWing({L:38,D:14,floors:5,x:70,z:110,ry:0,seed:77,brickStyle:true,groundH:4}));

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
/* water feature with a real ballistic fountain */
site.cyl('concrete',3.1,3.3,0.5,32,6,0.25,-10);
{
  const g=new THREE.CylinderGeometry(2.85,2.85,0.1,32);
  g.translate(6,0.52,-10);
  site.geo('water',g);
}
site.cyl('frame',0.06,0.09,0.35,8,6,0.72,-10);
const FN=130, fPos=new Float32Array(FN*3), fVel=new Float32Array(FN*3);
function fReset(i){
  fPos[i*3]=6+rand(-0.05,0.05); fPos[i*3+1]=0.9; fPos[i*3+2]=-10+rand(-0.05,0.05);
  const a=rand(0,6.28), r0=rand(0.15,0.55);
  fVel[i*3]=Math.cos(a)*r0; fVel[i*3+1]=rand(2.6,3.6); fVel[i*3+2]=Math.sin(a)*r0;
}
for(let i=0;i<FN;i++){ fReset(i); fPos[i*3+1]=rand(0.6,2.2); }
const fGeo=new THREE.BufferGeometry();
fGeo.setAttribute('position',new THREE.BufferAttribute(fPos,3));
const fountain=new THREE.Points(fGeo,new THREE.PointsMaterial({
  color:0xd8eef8, size:0.09, transparent:true, opacity:.8, depthWrite:false}));
scene.add(fountain);
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
    /* crosswalk at center (~5m wide) */
    for(let i=-1;i<=1;i++) g.fillRect(w/2+i*10-3,6,6,h-12);
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
const lampGlows=[], poolGeos=[];
function lightPool(x,z,r){
  const g=new THREE.PlaneGeometry(r*2,r*2);
  g.rotateX(-Math.PI/2); g.translate(x,0.06,z);
  poolGeos.push(g);
}
function lamp(x,z,h=6){
  site.cyl('lampPole',0.09,0.13,h,8,x,h/2,z);
  site.box('lampPole',1.5,0.1,0.22,x+0.65,h,z);
  site.box('lampHead',0.55,0.14,0.26,x+1.25,h-0.05,z);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,transparent:true,opacity:0,depthWrite:false}));
  s.position.set(x+1.25,h-0.1,z); s.scale.set(3,3,1);
  scene.add(s); lampGlows.push(s);
  lightPool(x+1.25,z,3.4);
}
for(let x=-150;x<=150;x+=30){ lamp(x,46.8); lamp(x+15,67.8); }
for(const [bx,bz] of [[-18,20],[18,20],[0,16],[10,-2],[-12,-2],[4,-20],[16,4]]){
  site.cyl('lampPole',0.06,0.08,1.1,6,bx,0.55,bz);
  site.box('lampHead',0.16,0.1,0.16,bx,1.15,bz);
  lightPool(bx,bz,1.4);
}
const poolMat=new THREE.MeshBasicMaterial({map:glowT,transparent:true,opacity:0,
  blending:THREE.AdditiveBlending,depthWrite:false,color:0xffc888});
const poolMesh=new THREE.Mesh(BGU.mergeGeometries(poolGeos,false),poolMat);
scene.add(poolMesh);
/* pergola with string lights on the south plaza */
{
  const px0=-14,pz0=30;
  for(const [dx,dz] of [[-2,-1.6],[2,-1.6],[-2,1.6],[2,1.6]])
    site.box('wood',0.14,2.6,0.14,px0+dx,1.3,pz0+dz,0,[0.2,2]);
  site.box('wood',4.6,0.12,0.16,px0,2.66,pz0-1.6,0,[3,0.2]);
  site.box('wood',4.6,0.12,0.16,px0,2.66,pz0+1.6,0,[3,0.2]);
  for(let i=0;i<7;i++) site.box('wood',0.1,0.08,3.6,px0-1.95+i*0.65,2.74,pz0,0,[0.2,2.4]);
  for(let sI=0;sI<2;sI++) for(let i=0;i<=12;i++){
    const t2=i/12;
    const bx=px0-2+t2*4, by=2.5-0.28*Math.sin(Math.PI*t2), bz=pz0-1.6+sI*3.2;
    site.geo('bulb',new THREE.SphereGeometry(0.045,6,5).translate(bx,by,bz));
  }
  benchAt(px0,pz0+0.4,0);
}

/* ============================================================ trees */
const trees=new Bucket();
/* organic canopy: icosahedron displaced by seeded noise, smooth normals */
function foliageBlob(r,detail,seed){
  const g=new THREE.IcosahedronGeometry(r,detail);
  const p=g.attributes.position, v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);
    const n=v.clone().normalize();
    const d=1+0.34*(fbm(n.x*2.3+seed,n.y*1.9+n.z*2.7+seed,seed|0)-0.5)*2;
    v.copy(n.multiplyScalar(r*d));
    p.setXYZ(i,v.x,v.y*0.92,v.z);
  }
  g.computeVertexNormals();
  return g;
}
function tree(x,z,s=1,staked=false,dark=false,hero=false){
  const th=rand(1.7,2.5)*s, seed=R()*100;
  /* tapered trunk with a slight lean + branch stubs */
  const lean=rand(-0.07,0.07);
  const tg=new THREE.CylinderGeometry(0.05*s,0.12*s,th,7);
  tg.rotateZ(lean); tg.translate(x,th/2,z);
  trees.geo('trunk',tg);
  for(let bI=0;bI<2+(hero?2:0);bI++){
    const a=rand(0,6.28), tilt=rand(0.5,1.0);
    const bg=new THREE.CylinderGeometry(0.02*s,0.045*s,th*0.55,5);
    bg.rotateZ(tilt); bg.rotateY(a);
    bg.translate(x+Math.cos(a)*0.28*s,th*0.9,z-Math.sin(a)*0.28*s);
    trees.geo('trunk',bg);
  }
  const key=dark?'leafD':pick(['leaf','leaf','leafL','leafD']);
  const n=hero?randi(4,5):randi(3,4), det=hero?2:1;
  for(let i=0;i<n;i++){
    const g=foliageBlob(rand(0.5,0.85)*s,det,seed+i*7.3);
    g.translate(x+rand(-0.45,0.45)*s,th+rand(0,0.5)*s+i*0.35*s,z+rand(-0.45,0.45)*s);
    trees.geo(i===0?key:pick([key,'leaf','leafL']),g);
  }
  if(staked){
    for(const a of [0.7,2.8,4.9]){
      const sg=new THREE.CylinderGeometry(0.025,0.025,1.6,4);
      sg.rotateX(0.06); sg.translate(x+Math.cos(a)*0.35,0.8,z+Math.sin(a)*0.35);
      trees.geo('wood',sg);
    }
  }
}
for(const p of pathPts) if(R()<.85) tree(p[0]+rand(-3,3),p[1]+rand(-3,3),rand(0.7,1),true);
tree(-17,12,0.8,true); tree(18,-15,0.9,true); tree(-8,-9,0.75,true); tree(12,13,0.85,true);
for(let x=-150;x<=150;x+=17){ if(Math.abs(x)>8) tree(x+rand(-2,2),42.5,rand(1.2,1.7),false,false,Math.abs(x)<60); tree(x+8+rand(-2,2),71.5,rand(1.2,1.7),false,false,Math.abs(x)<60); }
for(let x=-140;x<=140;x+=40) tree(x,57,rand(0.9,1.2));
for(let i=0;i<26;i++) tree(rand(-120,120),rand(78,95),rand(1.3,2),false,R()<.5);
for(let i=0;i<30;i++) tree(rand(-160,-95),rand(-80,30),rand(1.4,2.2),false,R()<.5);
for(let i=0;i<30;i++) tree(rand(95,170),rand(-90,30),rand(1.4,2.2),false,R()<.5);
for(let i=0;i<40;i++) tree(rand(-130,130),rand(-140,-75),rand(1.5,2.4),false,R()<.6);

/* ============================================================ cars
   sculpted bodies: side profile extruded with bevels — hood, windshield
   rake, roof, trunk — plus glass canopy and real wheels with hubs */
M.carW=std({color:0xf1f2ef,roughness:.24,metalness:.75,envMapIntensity:1.3});
M.carS=std({color:0xc4c9cc,roughness:.24,metalness:.8,envMapIntensity:1.3});
M.carG=std({color:0x6f767c,roughness:.26,metalness:.8,envMapIntensity:1.3});
M.carB=std({color:0x22262b,roughness:.3,metalness:.75,envMapIntensity:1.3});
function carGeos(suv){
  const prof= suv
    ? [[-2.25,0.34],[-2.25,0.8],[-1.95,0.92],[-1.08,1.0],[-0.72,1.44],[0.66,1.47],[1.16,1.04],[2.06,0.95],[2.25,0.82],[2.25,0.36]]
    : [[-2.15,0.32],[-2.15,0.64],[-1.88,0.74],[-1.02,0.8],[-0.62,1.19],[0.58,1.23],[1.05,0.84],[1.95,0.76],[2.15,0.64],[2.15,0.32]];
  const s=new THREE.Shape();
  s.moveTo(prof[0][0],prof[0][1]);
  for(let i=1;i<prof.length;i++) s.lineTo(prof[i][0],prof[i][1]);
  s.closePath();
  const body=new THREE.ExtrudeGeometry(s,{depth:1.6,bevelEnabled:true,bevelSize:0.09,bevelThickness:0.06,bevelSegments:2});
  body.translate(0,0,-0.8);
  const cp= suv
    ? [[-1.0,0.98],[-0.66,1.38],[0.6,1.41],[1.08,1.02]]
    : [[-0.94,0.78],[-0.56,1.14],[0.5,1.17],[0.97,0.82]];
  const s2=new THREE.Shape();
  s2.moveTo(cp[0][0],cp[0][1]);
  for(let i=1;i<cp.length;i++) s2.lineTo(cp[i][0],cp[i][1]);
  s2.closePath();
  const glass=new THREE.ExtrudeGeometry(s2,{depth:1.46,bevelEnabled:true,bevelSize:0.04,bevelThickness:0.03,bevelSegments:1});
  glass.translate(0,0,-0.73);
  const wr2=suv?0.37:0.33;
  const wheel=new THREE.CylinderGeometry(wr2,wr2,0.24,16); wheel.rotateX(Math.PI/2);
  const hub=new THREE.CylinderGeometry(wr2*0.45,wr2*0.45,0.26,10); hub.rotateX(Math.PI/2);
  return {body,glass,wheel,hub,wy:wr2,wx:1.42,wr:wr2};
}
const GEO_SEDAN=carGeos(false), GEO_SUV=carGeos(true);
const carsBk=new Bucket();
const carKeys=['carW','carW','carS','carG','carB'];
function parkCar(x,z,ry){
  const g=R()<.6?GEO_SUV:GEO_SEDAN, key=pick(carKeys);
  const m=new THREE.Matrix4().makeRotationY(ry).setPosition(x,0,z);
  carsBk.geo(key,g.body.clone().applyMatrix4(m));
  carsBk.geo('glass',g.glass.clone().applyMatrix4(m));
  for(const [dx,dz] of [[-g.wx,-0.82],[-g.wx,0.82],[g.wx,-0.82],[g.wx,0.82]]){
    const wm=new THREE.Matrix4().makeRotationY(ry);
    const off=new THREE.Vector3(dx,g.wy,dz).applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
    wm.setPosition(x+off.x,g.wy,z+off.z);
    carsBk.geo('tire',g.wheel.clone().applyMatrix4(wm));
    carsBk.geo('hub',g.hub.clone().applyMatrix4(wm));
  }
}
for(let x=-66;x<=66;x+=7.3){ if(Math.abs(x)>=7) parkCar(x,47.9,x<0?0:Math.PI); }
for(let i=0;i<5;i++) parkCar(-40+i*17,66.9,Math.PI);
scene.add(carsBk.build());
const movers=[];
for(let i=0;i<4;i++){
  const g=R()<.5?GEO_SUV:GEO_SEDAN, key=pick(carKeys);
  const c=new THREE.Group();
  const bm=new THREE.Mesh(g.body,M[key]); bm.castShadow=true; c.add(bm);
  c.add(new THREE.Mesh(g.glass,M.glass));
  c.userData.wheels=[];
  for(const [dx,dz] of [[-g.wx,-0.82],[-g.wx,0.82],[g.wx,-0.82],[g.wx,0.82]]){
    const wg=new THREE.Group(); wg.position.set(dx,g.wy,dz);
    wg.add(new THREE.Mesh(g.wheel,M.tire));
    wg.add(new THREE.Mesh(g.hub,M.hub));
    c.add(wg); c.userData.wheels.push(wg);
  }
  const east=i<2;
  c.position.set(rand(-160,160),0,east?52.4:62.2);
  c.rotation.y=east?Math.PI:0;
  c.userData.v=east?rand(9,13):-rand(9,13);
  c.userData.wr=g.wr;
  scene.add(c); movers.push(c);
}

/* ============================================================ people
   articulated figures: leg/arm capsules, torso, head + hair cap */
const topKeys=['topA','topB','topC','topD'];
function personParts(){
  const parts=[];
  const legL=new THREE.CapsuleGeometry(0.055,0.5,3,8);
  parts.push(['legDark',legL.clone().translate(-0.09,0.42,0)]);
  parts.push(['legDark',legL.clone().translate(0.09,0.42,0)]);
  const topKey=pick(topKeys);
  parts.push([topKey,new THREE.CapsuleGeometry(0.135,0.42,4,10).translate(0,1.02,0)]);
  const arm=new THREE.CapsuleGeometry(0.042,0.46,3,8);
  parts.push([topKey,arm.clone().rotateZ(0.16).translate(-0.24,1.02,0)]);
  parts.push([topKey,arm.clone().rotateZ(-0.16).translate(0.24,1.02,0)]);
  parts.push(['skin',new THREE.SphereGeometry(0.115,12,10).translate(0,1.56,0)]);
  parts.push(['legDark',new THREE.SphereGeometry(0.12,12,8).scale(1,0.72,1).translate(0,1.62,-0.015)]);
  return parts;
}
const pplBk=new Bucket();
for(const [px2,pz2] of [[2,15],[-7,4.2],[10.8,-6],[5,-13.6],[-13,-6.5],[18,31],[-30,31.5],[45,43.5],[-60,43.2],[24,71.5]]){
  const m=new THREE.Matrix4().makeRotationY(rand(0,6.28)).setPosition(px2,0.02,pz2);
  for(const [k,g] of personParts()) pplBk.geo(k,g.applyMatrix4(m));
}
scene.add(pplBk.build());
function person(){
  const g=new THREE.Group();
  for(const [k,geo] of personParts()){
    const mesh=new THREE.Mesh(geo,M[k]); mesh.castShadow=true; g.add(mesh);
  }
  return g;
}
const walkCurve=new THREE.CatmullRomCurve3(pathPts.map(p=>new THREE.Vector3(p[0],0.02,p[1])),true);
const walkers=[];
for(let i=0;i<3;i++){
  const p=person(); p.userData={t:i/3,speed:0.011+i*0.003};
  scene.add(p); walkers.push(p);
}
const strollers=[];
for(let i=0;i<2;i++){
  const p=person();
  p.position.set(-80+i*40,0.02,43.5); p.userData={v:i?1.3:-1.3};
  scene.add(p); strollers.push(p);
}

/* ============================================================ background: mountains, forest, city, cranes */
/* true 3D mountain terrain: noise-displaced mesh with altitude-based
   vertex colors (meadow -> forest -> rock), hazed by real fog */
function terrainPatch(w,d,segX,segZ,cx,cz,heightFn,seed){
  const g=new THREE.PlaneGeometry(w,d,segX,segZ);
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  const cols=new Float32Array(p.count*3);
  const cMeadow=new THREE.Color(0x77895c), cForest=new THREE.Color(0x3e5c3c),
        cRock=new THREE.Color(0x8d918e), cHigh=new THREE.Color(0xa8b3b9), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)+cx, z=p.getZ(i)+cz;
    const base=heightFn(x,z);
    const n=fbm(x*0.0021,z*0.0021,seed);
    const y=base*(0.45+1.1*n);
    p.setY(i,y);
    const t=THREE.MathUtils.clamp(y/300,0,1);
    const forest=fbm(x*0.008,z*0.008,seed+31);
    if(t<0.28) tmp.copy(cMeadow).lerp(cForest,THREE.MathUtils.smoothstep(forest,0.35,0.6));
    else if(t<0.62) tmp.copy(cForest).lerp(cRock,THREE.MathUtils.smoothstep(t,0.4,0.62));
    else tmp.copy(cRock).lerp(cHigh,THREE.MathUtils.smoothstep(t,0.62,0.95));
    tmp.offsetHSL(0,0,(fbm(x*0.02,z*0.02,seed+57)-0.5)*0.06);
    cols[i*3]=tmp.r; cols[i*3+1]=tmp.g; cols[i*3+2]=tmp.b;
  }
  g.setAttribute('color',new THREE.BufferAttribute(cols,3));
  g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,M.terrain);
  mesh.position.set(cx,-0.5,cz);
  return mesh;
}
/* north massif (Vitosha-style) */
scene.add(terrainPatch(3800,1400,150,60,0,-980,(x,z)=>{
  const t=THREE.MathUtils.clamp((-z-260)/850,0,1);
  return Math.pow(t,1.5)*340*(0.7+0.3*Math.sin(x*0.0011+1.2));
},5));
/* west ridge */
scene.add(terrainPatch(1400,2400,60,100,-1050,-300,(x,z)=>{
  const t=THREE.MathUtils.clamp((-x-380)/700,0,1);
  return Math.pow(t,1.5)*300*(0.75+0.25*Math.sin(z*0.0014));
},11));

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
bgBuilding(-150,120,26,44,20,0); bgBuilding(-108,132,22,30,18,1); bgBuilding(-30,142,30,26,20,2);
bgBuilding(-6,138,24,52,20,0);  bgBuilding(35,144,26,32,18,1);   bgBuilding(115,136,28,40,20,0);
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
    sunPos:[140,190,90], sunCol:0xfff2dd, sunInt:3.2, hemiInt:0.42,
    skyTop:0x3877cf, skyHor:0xd6e5f0, skySun:0xfff0d0, haze:0.45,
    fog:0xd6e5f0, fogNear:460, fogFar:1650, exposure:1.02,
    lamps:0, interiors:[0.78,0.78,0.8], rays:0.045, cove:0,
    bulbs:0, pool:0, envGround:0x7d8a68
  },
  golden:{
    sunPos:[-190,58,105], sunCol:0xffb066, sunInt:2.6, hemiInt:0.4,
    skyTop:0x3a5788, skyHor:0xe8a978, skySun:0xffcf90, haze:0.55,
    fog:0xdcab8b, fogNear:380, fogFar:1450, exposure:1.06,
    lamps:1, interiors:[1.5,1.32,1.05], rays:0.11, cove:2.2,
    bulbs:2.6, pool:0.5, envGround:0x746a54
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
  M.bulb.emissiveIntensity=p.bulbs;
  poolMat.opacity=p.pool;
  envGroundMat.color.setHex(p.envGround);
  for(const s of lampGlows) s.material.opacity=p.lamps*0.75;
  for(const r2 of rays) r2.material.opacity=p.rays;
  placeRays();
  updateEnv();
  document.getElementById('tglSun').textContent = name==='day' ? 'Golden hour' : 'Midday sun';
}
applyPreset('day');

/* ============================================================ walk mode */
const WALK_IN=[[-3.05,3.05,-42.5,-28.15],[-0.8,0.8,-28.5,-26.4],[3.35,9.45,-42.5,-28.15],
  [2.9,3.6,-33.4,-32.2],[4.95,6.3,-28.5,-26.4],[9.75,12.35,-35.0,-28.3],
  [9.3,9.9,-30.3,-29.0],[9.75,12.35,-42.5,-35.9],[9.3,9.9,-40.2,-38.9]];
const WALK_BLOCK=[[-39.8,-23.2,-32.8,20.6],[23.2,39.8,-32.8,20.6],[-24.6,24.6,-43.8,-27.85],[25.2,42.8,-51.8,-34.2]];
const inBox=(b,x,z)=>x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3];
function walkAllowed(x,z){
  for(const b of WALK_IN) if(inBox(b,x,z)) return true;
  if(x<-140||x>140||z<-26.6||z>74) return false;
  for(const b of WALK_BLOCK) if(inBox(b,x,z)) return false;
  if((x-6)*(x-6)+(z+10)*(z+10)<11.6) return false;
  return true;
}
let walk=false,yaw=0,pitch=0;
const walkInput={f:0,s:0};
function setWalk(on,pos,y0){
  walk=on;
  controls.enabled=!on;
  const dp=document.getElementById('dpad'); if(dp) dp.style.display=on?'flex':'none';
  const wb=document.getElementById('tglWalk'); if(wb) wb.classList.toggle('on',on);
  if(on){
    camTween=null;
    if(pos) camera.position.copy(pos);
    camera.position.y=1.68;
    if(y0!==undefined) yaw=y0;
    else yaw=Math.atan2(-(controls.target.x-camera.position.x),-(controls.target.z-camera.position.z));
    pitch=0;
  } else {
    controls.target.set(
      camera.position.x-Math.sin(yaw)*8, camera.position.y,
      camera.position.z-Math.cos(yaw)*8);
  }
}
addEventListener('keydown',e=>{ if(!walk)return;
  if(e.code==='KeyW'||e.code==='ArrowUp')walkInput.f=1;
  if(e.code==='KeyS'||e.code==='ArrowDown')walkInput.f=-1;
  if(e.code==='KeyA'||e.code==='ArrowLeft')walkInput.s=-1;
  if(e.code==='KeyD'||e.code==='ArrowRight')walkInput.s=1;});
addEventListener('keyup',e=>{
  if(['KeyW','ArrowUp','KeyS','ArrowDown'].includes(e.code))walkInput.f=0;
  if(['KeyA','ArrowLeft','KeyD','ArrowRight'].includes(e.code))walkInput.s=0;});
let lookId=null,lookX=0,lookY=0;
canvas.addEventListener('pointerdown',e=>{ if(!walk)return; lookId=e.pointerId; lookX=e.clientX; lookY=e.clientY;});
addEventListener('pointermove',e=>{ if(!walk||e.pointerId!==lookId)return;
  yaw-=(e.clientX-lookX)*0.0042; pitch-=(e.clientY-lookY)*0.0042;
  pitch=Math.max(-1.25,Math.min(1.25,pitch)); lookX=e.clientX; lookY=e.clientY;});
addEventListener('pointerup',e=>{ if(e.pointerId===lookId)lookId=null;});
function bindHold(id,val){
  const el=document.getElementById(id); if(!el)return;
  const dn=e=>{e.preventDefault(); walkInput.f=val;};
  const up=()=>{ if(walkInput.f===val) walkInput.f=0; };
  el.addEventListener('pointerdown',dn);
  el.addEventListener('pointerup',up);
  el.addEventListener('pointerleave',up);
  el.addEventListener('pointercancel',up);
}
bindHold('padF',1); bindHold('padB',-1);
const walkBtn=document.getElementById('tglWalk');
if(walkBtn) walkBtn.addEventListener('click',()=>{
  if(!walk){
    const p=camera.position.clone();
    if(!walkAllowed(p.x,p.z)) p.set(0,1.68,10);
    setWalk(true,p);
  } else setWalk(false);
});

const VIEWS={
  aerial:    {pos:[148,142,178], tgt:[0,8,-6]},
  courtyard: {pos:[11,2.4,15],   tgt:[-8,8,-16]},
  facade:    {pos:[-8,5,28],     tgt:[-30,15,-12]},
  boulevard: {pos:[-58,3.5,70],  tgt:[24,18,10]},
  penthouse: {pos:[64,31,34],    tgt:[28,23,-10]}
};
let camTween=null;
function setView(name,instant){
  if(name==='interior'){
    setWalk(true,new THREE.Vector3(6.4,1.68,-30.6),0);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view==='interior'));
    return;
  }
  if(walk) setWalk(false);
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
  composer.setSize(innerWidth,innerHeight);
});
const fxBtn=document.getElementById('tglFx');
if(fxBtn){
  fxBtn.classList.add('on');
  fxBtn.addEventListener('click',()=>{
    useComposer=!useComposer;
    fxBtn.classList.toggle('on',useComposer);
  });
}
const clock=new THREE.Clock();
let firstFrame=false;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05), t=clock.elapsedTime;
  uTime.value=t;
  if(walk){
    const fv=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const rv=new THREE.Vector3().crossVectors(fv,new THREE.Vector3(0,1,0));
    const sp=3.1*dt;
    const nx=camera.position.x+(fv.x*walkInput.f+rv.x*walkInput.s)*sp;
    const nz=camera.position.z+(fv.z*walkInput.f+rv.z*walkInput.s)*sp;
    if(walkAllowed(nx,nz)){ camera.position.x=nx; camera.position.z=nz; }
    else if(walkAllowed(nx,camera.position.z)) camera.position.x=nx;
    else if(walkAllowed(camera.position.x,nz)) camera.position.z=nz;
    camera.position.y=1.68;
    camera.lookAt(camera.position.x-Math.sin(yaw)*Math.cos(pitch),
                  camera.position.y+Math.sin(pitch),
                  camera.position.z-Math.cos(yaw)*Math.cos(pitch));
  } else {
    if(camTween){
      camTween.t+=dt*0.9;
      const k=camTween.t>=1?1:1-Math.pow(1-camTween.t,3);
      camera.position.lerpVectors(camTween.p0,camTween.p1,k);
      controls.target.lerpVectors(camTween.t0,camTween.t1,k);
      if(camTween.t>=1) camTween=null;
    }
    controls.update();
  }
  for(const c of movers){
    c.position.x+=c.userData.v*dt;
    if(c.position.x>175) c.position.x=-175;
    if(c.position.x<-175) c.position.x=175;
    for(const wg of c.userData.wheels) wg.rotation.z-=(c.userData.v*dt)/c.userData.wr;
  }
  /* fountain: ballistic droplets */
  for(let i=0;i<FN;i++){
    fVel[i*3+1]-=9.8*dt;
    fPos[i*3]+=fVel[i*3]*dt; fPos[i*3+1]+=fVel[i*3+1]*dt; fPos[i*3+2]+=fVel[i*3+2]*dt;
    if(fPos[i*3+1]<0.58) fReset(i);
  }
  fGeo.attributes.position.needsUpdate=true;
  NM.ripple.offset.set(t*0.013,t*0.009);
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
  if(useComposer) composer.render(); else renderer.render(scene,camera);
  if(!firstFrame){
    firstFrame=true;
    const l=document.getElementById('load');
    l.style.opacity='0';
    setTimeout(()=>l.remove(),600);
    window.__READY=true;
  }
}
animate();
