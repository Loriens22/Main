/* ===== SOLAR SYSTEM + PROCEDURAL EXOSYSTEMS + CUBE-SPHERE QUADTREE TERRAIN ===== */
const AU=1.495978707e11, G=6.67430e-11, G0=9.80665;
let BODIES=[], SUN=null, SYSTEM={id:0,name:'SOL',star:'G2V'};

function mkBody(o){
 const b=Object.assign({kind:'planet',rotPeriod:86400,tilt:0,parent:null,
  a:0,e:0,inc:0,raan:0,argp:0,m0:0,atmo:null,ocean:null,
  pos:v3(),vel:v3(),rot:0,color:[.6,.6,.6],emissive:[0,0,0],mu:0,radius:1e6,soi:Infinity},o);
 if(!b.dna)b.dna=makeDNA(b.seed!==undefined?b.seed:hash3(b.name.length*7,b.radius|0,3)/4294967296*100,
   b.ptype!==undefined?b.ptype:0,b.radius);
 b.dna.radius=b.radius;
 return b;
}
// Rayleigh coefficients scale ~1/lambda^4; tint gives the artistic per-world bias
function atm(h,rho0,sh,ray,mie,tint){return {height:h,rho0:rho0,scaleH:sh,rayleigh:ray,mie:mie,tint:tint};}
const EARTH_RAY=[5.802e-6,13.558e-6,33.1e-6];

function buildSol(){
 const B=[];
 const sun=mkBody({id:0,name:'SOL',kind:'star',radius:6.957e8,mu:1.32712440018e20,
  rotPeriod:2.192832e6,color:[1,.95,.85],emissive:[1,.93,.78],ptype:4,seed:1});
 B.push(sun);
 const P=(n,r,mu,a,e,inc,rp,tilt,col,type,seed,at,oc)=>mkBody({name:n,radius:r,mu:mu,parent:sun,
  a:a,e:e,inc:inc*DEG,raan:hash3(n.length,7,1)%360*DEG,argp:hash3(n.length,9,2)%360*DEG,
  m0:hash3(n.length,11,3)%360*DEG,rotPeriod:rp,tilt:tilt*DEG,color:col,ptype:type,seed:seed,
  atmo:at||null,ocean:oc||null});
 B.push(P('MERCURY',2.4397e6,2.2032e13,0.387*AU,0.2056,7.0,5.067e6,0.03,[.55,.5,.46],0,7));
 B.push(P('VENUS',6.0518e6,3.24859e14,0.723*AU,0.0068,3.39,-2.0997e7,177.4,[.85,.72,.45],2,13,
  atm(2.5e5,65.0,15900,[3.0e-6,6.0e-6,9.0e-6],9.0e-6,[1.0,.85,.55])));
 const earth=P('EARTH',6.371e6,3.986004418e14,1.0*AU,0.0167,0.0,86164.1,23.44,[.25,.42,.62],1,42,
  atm(1.0e5,1.225,8500,EARTH_RAY,3.996e-6,[.55,.72,1.0]),
  {level:0,color:[.045,.13,.19],deep:[.004,.02,.05],kind:'water'});
 earth.dna.vegetation=0.9;earth.dna.rivers=0.85;earth.dna.humidity=0.7;earth.dna.temp=288;
 earth.dna.amp=6200;earth.dna.ridgeAmp=7400;earth.dna.craters=0.02;earth.dna.ice=0.5;
 B.push(earth);
 const moon=mkBody({name:'LUNA',radius:1.7374e6,mu:4.9048e12,parent:earth,a:3.844e8,e:0.0549,
  inc:5.145*DEG,rotPeriod:2.3606e6,color:[.52,.5,.48],ptype:0,seed:88,kind:'moon'});
 moon.dna.craters=1.0;moon.dna.amp=2400;moon.dna.ridgeAmp=3200;moon.dna.rivers=0;moon.dna.temp=250;
 B.push(moon);
 const mars=P('MARS',3.3895e6,4.282837e13,1.524*AU,0.0934,1.85,88642,25.19,[.72,.42,.28],2,17,
  atm(6.0e4,0.020,11100,[19.918e-6,13.57e-6,5.75e-6],5.0e-6,[1.0,.72,.48]));
 mars.dna.dunes=0.9;mars.dna.craters=0.55;mars.dna.amp=9000;mars.dna.ridgeAmp=9500;
 mars.dna.ice=0.35;mars.dna.temp=210;mars.dna.rivers=0.25;
 B.push(mars);
 const jup=P('JUPITER',6.9911e7,1.26686534e17,5.203*AU,0.0484,1.30,35730,3.13,[.82,.72,.58],5,5,
  atm(1.0e6,0.16,27000,[4.0e-6,7.0e-6,12.0e-6],7.0e-6,[.95,.82,.66]));
 B.push(jup);
 const io=mkBody({name:'IO',radius:1.8216e6,mu:5.96e12,parent:jup,a:4.217e8,e:0.0041,
  rotPeriod:1.5285e5,color:[.92,.82,.42],ptype:4,seed:31,kind:'moon'});
 io.dna.lava=1.0;io.dna.craters=0.05;io.dna.amp=3000;io.dna.temp=130;
 B.push(io);
 const eur=mkBody({name:'EUROPA',radius:1.5608e6,mu:3.2e12,parent:jup,a:6.711e8,e:0.009,
  rotPeriod:3.0685e5,color:[.85,.82,.78],ptype:3,seed:33,kind:'moon',
  ocean:{level:0,color:[.05,.14,.2],deep:[.01,.03,.07],kind:'water'}});
 eur.dna.ice=1.0;eur.dna.amp=600;eur.dna.ridgeAmp=400;eur.dna.craters=0.15;eur.dna.temp=102;
 B.push(eur);
 const gan=mkBody({name:'GANYMEDE',radius:2.6341e6,mu:9.887e12,parent:jup,a:1.0704e9,e:0.0013,
  rotPeriod:6.1804e5,color:[.6,.58,.55],ptype:3,seed:35,kind:'moon'});
 gan.dna.ice=0.8;gan.dna.craters=0.8;gan.dna.amp=1800;gan.dna.temp=110;
 B.push(gan);
 const cal=mkBody({name:'CALLISTO',radius:2.4103e6,mu:7.179e12,parent:jup,a:1.8827e9,e:0.0074,
  rotPeriod:1.4417e6,color:[.42,.4,.38],ptype:0,seed:37,kind:'moon'});
 cal.dna.craters=1.0;cal.dna.amp=2200;cal.dna.temp=134;
 B.push(cal);
 const sat=P('SATURN',5.8232e7,3.7931187e16,9.537*AU,0.0542,2.49,38362,26.73,[.88,.8,.62],5,9,
  atm(9.0e5,0.19,35000,[3.6e-6,6.5e-6,10.0e-6],6.0e-6,[.98,.88,.68]));
 sat.rings={inner:7.4e7,outer:1.4e8};
 B.push(sat);
 const titan=mkBody({name:'TITAN',radius:2.5747e6,mu:8.978e12,parent:sat,a:1.2218e9,e:0.0288,
  rotPeriod:1.3782e6,color:[.78,.6,.32],ptype:6,seed:39,kind:'moon',
  atmo:atm(6.0e5,5.3,21000,[8.0e-6,11.0e-6,14.0e-6],1.4e-5,[1.0,.72,.35]),
  ocean:{level:0,color:[.09,.07,.04],deep:[.03,.02,.01],kind:'methane'}});
 titan.dna.temp=94;titan.dna.rivers=0.9;titan.dna.amp=900;titan.dna.ridgeAmp=700;titan.dna.dunes=0.8;
 B.push(titan);
 const enc=mkBody({name:'ENCELADUS',radius:2.521e5,mu:7.21e9,parent:sat,a:2.3802e8,e:0.0047,
  rotPeriod:1.1809e5,color:[.95,.96,.98],ptype:3,seed:41,kind:'moon'});
 enc.dna.ice=1.0;enc.dna.amp=400;enc.dna.craters=0.4;enc.dna.temp=75;
 B.push(enc);
 const ura=P('URANUS',2.5362e7,5.793939e15,19.19*AU,0.0472,0.77,-62064,97.77,[.6,.85,.88],5,11,
  atm(6.0e5,0.42,27700,[6.0e-6,12.0e-6,16.0e-6],4.0e-6,[.6,.9,.95]));
 B.push(ura);
 const nep=P('NEPTUNE',2.4622e7,6.836529e15,30.07*AU,0.0086,1.77,57996,28.32,[.3,.45,.85],5,15,
  atm(6.0e5,0.45,19700,[7.0e-6,14.0e-6,22.0e-6],4.0e-6,[.35,.5,.95]));
 B.push(nep);
 const tri=mkBody({name:'TRITON',radius:1.3534e6,mu:1.083e12,parent:nep,a:3.5476e8,e:0.000016,
  inc:157*DEG,rotPeriod:-5.0768e5,color:[.82,.8,.76],ptype:3,seed:43,kind:'moon',
  atmo:atm(4.0e4,0.00002,20000,[12e-6,14e-6,18e-6],3e-6,[.8,.85,1.0])});
 tri.dna.ice=1.0;tri.dna.amp=700;tri.dna.temp=38;
 B.push(tri);
 const plu=P('PLUTO',1.1883e6,8.71e11,39.48*AU,0.2488,17.16,-5.5165e5,122.5,[.75,.68,.6],3,19,
  atm(1.5e4,1e-5,50000,[10e-6,13e-6,17e-6],2e-6,[.9,.75,.6]));
 plu.dna.ice=0.9;plu.dna.temp=44;plu.dna.amp=2600;
 B.push(plu);
 return B;
}
const STAR_NAMES=['KEPLER','GLIESE','TRAPPIST','PROXIMA','WOLF','ROSS','LALANDE','TAU CETI','VEGA',
 'ALTAIR','ARCTURUS','RIGEL','MIRA','ALGOL','DENEB','ANTARES','SPICA','POLLUX','CASTOR','MIZAR',
 'ALCOR','THUBAN','ELTANIN','KOCHAB','ALPHERATZ','MIRACH','HAMAL','MENKAR','ACAMAR','ZAURAK'];
const SYSTEM_COUNT=4096;   // procedurally reachable systems
function systemName(id){if(id===0)return 'SOL';
 const h=hash3(id,777,13);return STAR_NAMES[h%STAR_NAMES.length]+'-'+(100+(h>>>7)%900);}
function buildSystem(id){
 if(id===0)return buildSol();
 let s=id*2654435761>>>0;const R=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
 const cls=R();
 const starR=mix(3e8,1.6e9,cls*cls), starMu=1.32712e20*mix(0.25,3.2,cls);
 const temp=mix(2800,9200,cls);
 const bb=[Math.min(1,Math.max(.35,1.4-cls*.5)),Math.min(1,.6+cls*.4),Math.min(1,.25+cls*.85)];
 const sun=mkBody({id:0,name:systemName(id),kind:'star',radius:starR,mu:starMu,
  rotPeriod:2.5e6,color:bb,emissive:bb,ptype:4,seed:id*3+1});
 const B=[sun];
 const n=2+Math.floor(R()*7);
 let a=mix(0.18,0.55,R())*AU;
 for(let i=0;i<n;i++){
  const t=R();
  const flux=starMu/1.327e20/((a/AU)*(a/AU));
  let type;
  if(a/AU>3.2&&t>0.35)type=5;                       // gas giant far out
  else if(flux>3.5)type=4;                          // scorched -> volcanic
  else if(flux<0.22)type=3;                         // frozen
  else if(t<0.30)type=1;                            // terrestrial in the belt
  else if(t<0.55)type=6;                            // ocean world
  else if(t<0.78)type=2;                            // desert
  else type=0;                                      // airless rock
  const rad=type===5?mix(2.4e7,8.5e7,R()):mix(1.6e6,9.5e6,R());
  const dens=type===5?1300:mix(3000,5800,R());
  const mu=G*(4/3*Math.PI*rad*rad*rad*dens);
  const seed=id*100+i*7+3;
  const eqT=278*Math.pow(flux,0.25);
  let at=null,oc=null;
  if(type===1||type===6){
   at=atm(mix(7e4,1.6e5,R()),mix(0.5,2.6,R()),mix(6500,11000,R()),
    [EARTH_RAY[0]*mix(.4,2.4,R()),EARTH_RAY[1]*mix(.5,1.8,R()),EARTH_RAY[2]*mix(.5,1.6,R())],
    mix(2e-6,9e-6,R()),[mix(.3,1,R()),mix(.4,1,R()),mix(.4,1,R())]);
   oc={level:0,color:[mix(.02,.12,R()),mix(.06,.2,R()),mix(.08,.24,R())],
       deep:[.005,.015,.04],kind:eqT>360?'lava':(eqT<120?'methane':'water')};
  } else if(type===2){at=atm(4e4,mix(.01,.4,R()),9000,[12e-6,10e-6,6e-6],5e-6,[1,.75,.5]);}
  else if(type===4){at=atm(8e4,mix(.2,3,R()),9000,[9e-6,6e-6,4e-6],1.4e-5,[1,.45,.2]);oc=
   {level:0,color:[.5,.12,.02],deep:[.2,.03,0],kind:'lava'};}
  else if(type===5){at=atm(mix(4e5,1.1e6,R()),0.2,28000,[4e-6,7e-6,12e-6],7e-6,
   [mix(.5,1,R()),mix(.5,1,R()),mix(.4,1,R())]);}
  const p=mkBody({name:sun.name+' '+'IVXLCDM'.slice(0,0)+romanish(i+1),radius:rad,mu:mu,parent:sun,
   a:a,e:R()*0.09,inc:(R()-0.5)*8*DEG,raan:R()*TAU,argp:R()*TAU,m0:R()*TAU,
   rotPeriod:mix(2e4,2.4e5,R())*(R()<0.12?-1:1),tilt:R()*45*DEG,
   color:[mix(.3,.9,R()),mix(.3,.9,R()),mix(.3,.9,R())],ptype:type,seed:seed,atmo:at,ocean:oc});
  p.dna.temp=eqT; p.dna.humidity=type===6?0.95:(type===1?mix(.3,.9,R()):R()*.3);
  if(type===1)p.dna.vegetation=mix(.3,1,R());
  B.push(p);
  const nm=type===5?Math.floor(R()*4):(R()<0.4?1:0);
  for(let m=0;m<nm;m++){
   const mr=mix(2e5,2.2e6,R());
   const md=G*(4/3*Math.PI*mr*mr*mr*3200);
   const mo=mkBody({name:p.name+' '+String.fromCharCode(97+m),radius:mr,mu:md,parent:p,
    a:rad*mix(3,22,R()),e:R()*0.02,inc:(R()-0.5)*0.3,rotPeriod:mix(5e4,6e5,R()),
    color:[mix(.35,.8,R()),mix(.35,.8,R()),mix(.35,.8,R())],
    ptype:R()<0.5?0:3,seed:seed*3+m,kind:'moon'});
   mo.dna.temp=eqT;B.push(mo);
  }
  a*=mix(1.45,2.3,R());
 }
 return B;
}
function romanish(n){const r=['I','II','III','IV','V','VI','VII','VIII','IX','X'];return r[n-1]||('P'+n);}
function loadSystem(id){
 BODIES=buildSystem(id);SUN=BODIES[0];SYSTEM={id:id,name:BODIES[0].name};
 for(const b of BODIES){
  b.soi=b.parent?b.a*Math.pow(b.mu/b.parent.mu,0.4):Infinity;
  b.rot=0;
 }
 terrClearAll();
 return BODIES;
}
/* --- ephemeris: simple Keplerian propagation about the parent --- */
function bodyStateAt(b,t){
 if(!b.parent){vset(b.pos,0,0,0);vset(b.vel,0,0,0);return;}
 bodyStateAt(b.parent,t);
 const mu=b.parent.mu, a=b.a, e=b.e;
 const n=Math.sqrt(mu/(a*a*a));
 let M=b.m0+n*t; M=M%TAU; if(M<0)M+=TAU;
 let E=M+e*Math.sin(M);
 for(let i=0;i<8;i++){const f=E-e*Math.sin(E)-M,fp=1-e*Math.cos(E);const d=f/fp;E-=d;if(Math.abs(d)<1e-12)break;}
 const cE=Math.cos(E),sE=Math.sin(E),sq=Math.sqrt(1-e*e);
 const xp=a*(cE-e), yp=a*sq*sE;
 const rr=a*(1-e*cE), edot=Math.sqrt(mu/(a*a*a))/(1-e*cE);
 const vxp=-a*sE*edot, vyp=a*sq*cE*edot;
 const co=Math.cos(b.argp),so=Math.sin(b.argp),ci=Math.cos(b.inc),si=Math.sin(b.inc),
  cr=Math.cos(b.raan),sr=Math.sin(b.raan);
 const R11=cr*co-sr*so*ci, R12=-cr*so-sr*co*ci;
 const R21=sr*co+cr*so*ci, R22=-sr*so+cr*co*ci;
 const R31=so*si,          R32=co*si;
 b.pos[0]=b.parent.pos[0]+R11*xp+R12*yp;
 b.pos[1]=b.parent.pos[1]+R31*xp+R32*yp;
 b.pos[2]=b.parent.pos[2]+R21*xp+R22*yp;
 b.vel[0]=b.parent.vel[0]+R11*vxp+R12*vyp;
 b.vel[1]=b.parent.vel[1]+R31*vxp+R32*vyp;
 b.vel[2]=b.parent.vel[2]+R21*vxp+R22*vyp;
}
function worldStep(t,dt){
 for(const b of BODIES){bodyStateAt(b,t);b.rot=(b.rotPeriod?TAU*t/b.rotPeriod:0)%TAU;}
}
// planet-fixed direction from an absolute world position (undoes spin + axial tilt)
const _wg0=v3(),_wg1=v3();
function worldToBodyDir(b,worldPos,out){
 vsub(_wg0,worldPos,b.pos);vnorm(_wg0,_wg0);
 const c=Math.cos(-b.rot),s=Math.sin(-b.rot);
 const x=_wg0[0]*c-_wg0[2]*s, z=_wg0[0]*s+_wg0[2]*c;
 out[0]=x;out[1]=_wg0[1];out[2]=z;return out;
}
function bodyDirToWorld(b,dir,out){
 const c=Math.cos(b.rot),s=Math.sin(b.rot);
 out[0]=dir[0]*c-dir[2]*s;out[1]=dir[1];out[2]=dir[0]*s+dir[2]*c;return out;
}
function worldGroundHeight(b,dir){
 if(!b.dna)return b.radius;
 const d=b.dna;const so=d._oct;d._oct=d.octaves;
 const h=fieldHeight(dir[0],dir[1],dir[2],d);d._oct=so;
 return b.radius+(b.ocean?Math.max(h,b.ocean.level):h);
}
function worldAltitude(b,worldPos){
 worldToBodyDir(b,worldPos,_wg1);
 return vdist(worldPos,b.pos)-worldGroundHeight(b,_wg1);
}
/* ===== BIOME COLOUR ===== */
const _bc=[0,0,0];
// lodM = world-space spacing between adjacent vertices, in metres. Every biome threshold
// widens with it: at coarse LOD a hard snowline would flip on/off between neighbouring
// vertices hundreds of km apart and Gouraud-interpolate into salt-and-pepper speckle.
function biomeColor(dx,dy,dz,h,slope,d,out,lodM){
 const soft=sat((lodM||0)/26000);                     // 0 = fine detail, 1 = whole-continent
 const lat=Math.abs(dy);
 const t=d.temp-Math.max(0,h)*0.0065*1.0-lat*45;      // lapse rate + latitude cooling
 const dry=1-d.humidity;
 let r,g,b;
 const rock=d.pal[0],soil=d.pal[1],veg=d.pal[2],sand=d.pal[3],hi=d.pal[4],lo=d.pal[5];
 const hueShift=d.hue;
 if(d.type===5){ // gas giant: latitude bands
  const band=Math.sin(dy*22+noise3(dx*3,dy*9,dz*3)*2.2)*0.5+0.5;
  r=mix(d.pal[0][0]*.6+.4,d.pal[4][0]*.5+.5,band);
  g=mix(d.pal[1][1]*.5+.45,d.pal[4][1]*.5+.45,band);
  b=mix(d.pal[2][2]*.4+.35,d.pal[5][2]*.5+.4,band);
 } else {
  // slope is meaningless at coarse LOD, so fade the rock-by-slope term out with it
  const rocky=smoothstep(0.30,0.62+soft*0.9,slope)*(1-soft*0.8);
  let base0,base1,base2;
  if(d.type===4&&h<d.amp*0.2){ base0=0.16;base1=0.09;base2=0.07; }
  else if(d.type===2){ base0=mix(0.62,0.78,sand[0]);base1=mix(0.42,0.55,sand[1]);base2=mix(0.24,0.32,sand[2]); }
  else if(d.type===3){ base0=0.78;base1=0.82;base2=0.86; }
  else { // terrestrial-ish: vegetation belt by temperature and altitude
   const veg01=sat((t-268)/26)*sat(1-Math.max(0,h)/3500)*d.vegetation*sat(d.humidity*1.6);
   base0=mix(mix(0.34,0.42,soil[0]),mix(0.06,0.22,veg[0]),veg01);
   base1=mix(mix(0.28,0.36,soil[1]),mix(0.20,0.42,veg[1]),veg01);
   base2=mix(mix(0.20,0.26,soil[2]),mix(0.05,0.16,veg[2]),veg01);
  }
  // exposed rock on steep ground
  base0=mix(base0,mix(0.26,0.44,rock[0]),rocky);
  base1=mix(base1,mix(0.24,0.40,rock[1]),rocky);
  base2=mix(base2,mix(0.22,0.36,rock[2]),rocky);
  // beaches at the waterline — a ~95 m band is invisible at coarse LOD, so fade it out
  if((d.type===1||d.type===6)&&soft<0.9){
   const beach=sat(1-Math.abs(h-0)/95)*(1-rocky)*(1-soft);
   base0=mix(base0,0.74,beach*0.85);base1=mix(base1,0.66,beach*0.85);base2=mix(base2,0.48,beach*0.85);
  }
  // snowline: temperature + latitude driven, transition widened by LOD scale
  const snowW=18+soft*140;
  const snow=sat((262+snowW*0.35-t)/snowW)*(1-rocky*0.55)*Math.max(d.ice,0.25);
  base0=mix(base0,0.90,snow);base1=mix(base1,0.93,snow);base2=mix(base2,0.97,snow);
  // lava glow in the low volcanic basins
  if(d.lava>0.3){const lv=sat((-h)/(d.amp*0.5))*d.lava*sat(1-slope*1.5);
   base0=mix(base0,1.0,lv*0.8);base1=mix(base1,0.28,lv*0.8);base2=mix(base2,0.04,lv*0.8);}
  r=base0;g=base1;b=base2;
 }
 // at coarse LOD, blend toward a smooth continental average so the globe reads cleanly
 // from orbit instead of dissolving into per-vertex noise
 if(soft>0.01&&d.type!==5){
  const land=smoothstep(-1200,2600,h);
  const cap=smoothstep(0.60,0.90,lat)*Math.max(d.ice,0.15);
  const veg=sat((d.temp-258)/40)*d.vegetation*sat(d.humidity*1.5)*(1-cap);
  let cr=mix(mix(0.30,0.46,d.pal[1][0]),mix(0.10,0.26,d.pal[2][0]),veg);
  let cg=mix(mix(0.26,0.38,d.pal[1][1]),mix(0.22,0.44,d.pal[2][1]),veg);
  let cb=mix(mix(0.20,0.30,d.pal[1][2]),mix(0.08,0.20,d.pal[2][2]),veg);
  cr=mix(cr*0.72,cr,land);cg=mix(cg*0.72,cg,land);cb=mix(cb*0.78,cb,land);
  cr=mix(cr,0.90,cap);cg=mix(cg,0.93,cap);cb=mix(cb,0.97,cap);
  r=mix(r,cr,soft);g=mix(g,cg,soft);b=mix(b,cb,soft);
 }
 // per-planet hue rotation keeps every world distinct
 const l=(r+g+b)/3, hs=(hueShift-0.5)*0.34;
 out[0]=sat(mix(l,r,1.12)+hs*0.5);out[1]=sat(mix(l,g,1.12));out[2]=sat(mix(l,b,1.12)-hs*0.5);
 // fine mottling — only meaningful when vertices are close together
 const m=noise3(dx*180,dy*180,dz*180)*0.045*(1-soft);
 out[0]=sat(out[0]+m);out[1]=sat(out[1]+m);out[2]=sat(out[2]+m);
 return out;
}
/* ===== CUBE-SPHERE QUADTREE TERRAIN ===== */
const CHUNK_N=17;                       // vertices per side of a chunk
const FACE_AXES=[
 [[0,0,-1],[0,1,0],[1,0,0]], [[0,0,1],[0,1,0],[-1,0,0]],
 [[1,0,0],[0,0,1],[0,1,0]],  [[1,0,0],[0,0,-1],[0,-1,0]],
 [[1,0,0],[0,1,0],[0,0,1]],  [[-1,0,0],[0,1,0],[0,0,-1]]];
function cubeDir(face,u,v,out){          // u,v in [-1,1]; tangent warp for even vertex density
 const A=FACE_AXES[face];
 const tu=Math.tan(u*0.7853981633974483), tv=Math.tan(v*0.7853981633974483);
 let x=A[0][0]*tu+A[1][0]*tv+A[2][0], y=A[0][1]*tu+A[1][1]*tv+A[2][1], z=A[0][2]*tu+A[1][2]*tv+A[2][2];
 const l=Math.hypot(x,y,z);out[0]=x/l;out[1]=y/l;out[2]=z/l;return out;
}
const terrCache=new Map();               // body.name -> {roots[6], leaves[]}
let terrBudget=0;
function terrClearAll(){for(const[,T]of terrCache)terrDisposeTree(T);terrCache.clear();}
function terrDisposeTree(T){const rec=n=>{if(n.mesh){n.mesh.dispose();n.mesh=null;}
 if(n.kids)n.kids.forEach(rec);};T.roots.forEach(rec);}
function terrNode(face,u0,v0,size,depth){
 return {face:face,u0:u0,v0:v0,size:size,depth:depth,kids:null,mesh:null,
  ctr:v3(),ctrH:0,radius:0,pending:false};
}
function terrGetTree(b){
 let T=terrCache.get(b.name);
 if(!T){T={roots:[],body:b};
  for(let f=0;f<6;f++){const n=terrNode(f,-1,-1,2,0);terrInitNode(n,b);T.roots.push(n);}
  terrCache.set(b.name,T);}
 return T;
}
const _tc=v3();
function terrInitNode(n,b){
 cubeDir(n.face,n.u0+n.size*0.5,n.v0+n.size*0.5,_tc);
 vcopy(n.ctr,_tc);
 const d=b.dna;const so=d._oct;d._oct=Math.min(d.octaves,4+n.depth);
 n.ctrH=fieldHeight(_tc[0],_tc[1],_tc[2],d);d._oct=so;
 // world-space half-extent of this node
 n.radius=b.radius*n.size*0.9;
}
function terrBuildMesh(n,b){
 const N=CHUNK_N, G=N+2;                       // 1-vertex overlap ring for seamless normals
 const step=n.size/(N-1);
 const H=new Float32Array(G*G);
 const d=b.dna;const so=d._oct;
 d._oct=Math.min(d.octaves,Math.max(4,3+Math.round(n.depth*0.75)));
 const dir=_v8, tmp=_v9;
 for(let j=0;j<G;j++)for(let i=0;i<G;i++){
  const u=n.u0+(i-1)*step, v=n.v0+(j-1)*step;
  cubeDir(n.face,u,v,dir);
  H[j*G+i]=fieldHeight(dir[0],dir[1],dir[2],d);
 }
 d._oct=so;
 // world-space spacing between adjacent vertices of this chunk (drives biome softening)
 const lodM=b.radius*n.size*0.7853981634/(N-1);
 const seaClamp=b.ocean?b.ocean.level:-Infinity;
 const skirt=b.radius*n.size*0.06+40;
 const NV=N*N+4*N;                              // grid + skirt ring
 const pos=new Float32Array(NV*3), nrm=new Float32Array(NV*3), col=new Float32Array(NV*3),
       uvs=new Float32Array(NV*2);
 const cx=n.ctr[0]*(b.radius+n.ctrH), cy=n.ctr[1]*(b.radius+n.ctrH), cz=n.ctr[2]*(b.radius+n.ctrH);
 let k=0;
 const tanU=v3(),tanV=v3(),nn=v3();
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const gi=i+1,gj=j+1;
  const u=n.u0+i*step, v=n.v0+j*step;
  cubeDir(n.face,u,v,dir);
  const h=H[gj*G+gi];
  const r=b.radius+h;
  pos[k*3]=dir[0]*r-cx;pos[k*3+1]=dir[1]*r-cy;pos[k*3+2]=dir[2]*r-cz;
  // normal from neighbouring grid heights (continuous across chunk borders)
  cubeDir(n.face,u+step,v,tanU);cubeDir(n.face,u-step,v,tmp);
  const hu=H[gj*G+gi+1], hd=H[gj*G+gi-1];
  const dux=tanU[0]*(b.radius+hu)-tmp[0]*(b.radius+hd);
  const duy=tanU[1]*(b.radius+hu)-tmp[1]*(b.radius+hd);
  const duz=tanU[2]*(b.radius+hu)-tmp[2]*(b.radius+hd);
  cubeDir(n.face,u,v+step,tanV);cubeDir(n.face,u,v-step,tmp);
  const hv=H[(gj+1)*G+gi], hw=H[(gj-1)*G+gi];
  const dvx=tanV[0]*(b.radius+hv)-tmp[0]*(b.radius+hw);
  const dvy=tanV[1]*(b.radius+hv)-tmp[1]*(b.radius+hw);
  const dvz=tanV[2]*(b.radius+hv)-tmp[2]*(b.radius+hw);
  let nx=duy*dvz-duz*dvy, ny=duz*dvx-dux*dvz, nz=dux*dvy-duy*dvx;
  const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
  if(nx*dir[0]+ny*dir[1]+nz*dir[2]<0){nx=-nx;ny=-ny;nz=-nz;}
  nrm[k*3]=nx;nrm[k*3+1]=ny;nrm[k*3+2]=nz;
  const slope=1-sat(nx*dir[0]+ny*dir[1]+nz*dir[2]);
  biomeColor(dir[0],dir[1],dir[2],h,slope,d,_bc,lodM);
  col[k*3]=_bc[0];col[k*3+1]=_bc[1];col[k*3+2]=_bc[2];
  uvs[k*2]=i/(N-1);uvs[k*2+1]=j/(N-1);
  k++;
 }
 // skirt vertices: drop the border ring downward to hide LOD cracks
 const border=[];
 for(let i=0;i<N;i++)border.push(i);                       // bottom row j=0
 for(let j=1;j<N;j++)border.push(j*N+(N-1));               // right col
 for(let i=N-2;i>=0;i--)border.push((N-1)*N+i);            // top row
 for(let j=N-2;j>=1;j--)border.push(j*N);                  // left col
 const skirtStart=k;
 for(let s=0;s<border.length;s++){
  const bi=border[s];
  const px=pos[bi*3]+cx, py=pos[bi*3+1]+cy, pz=pos[bi*3+2]+cz;
  const l=Math.hypot(px,py,pz)||1;
  pos[k*3]=px-px/l*skirt-cx;pos[k*3+1]=py-py/l*skirt-cy;pos[k*3+2]=pz-pz/l*skirt-cz;
  nrm[k*3]=nrm[bi*3];nrm[k*3+1]=nrm[bi*3+1];nrm[k*3+2]=nrm[bi*3+2];
  col[k*3]=col[bi*3]*0.8;col[k*3+1]=col[bi*3+1]*0.8;col[k*3+2]=col[bi*3+2]*0.8;
  uvs[k*2]=uvs[bi*2];uvs[k*2+1]=uvs[bi*2+1];
  k++;
 }
 const tri=(N-1)*(N-1)*2+border.length*2;
 const idx=new Uint32Array(tri*3);
 let m=0;
 for(let j=0;j<N-1;j++)for(let i=0;i<N-1;i++){
  const a=j*N+i,b2=a+1,c=a+N,e=c+1;
  idx[m++]=a;idx[m++]=c;idx[m++]=b2;
  idx[m++]=b2;idx[m++]=c;idx[m++]=e;
 }
 for(let s=0;s<border.length;s++){
  const a=border[s], b2=border[(s+1)%border.length];
  const sa=skirtStart+s, sb=skirtStart+((s+1)%border.length);
  idx[m++]=a;idx[m++]=sa;idx[m++]=b2;
  idx[m++]=b2;idx[m++]=sa;idx[m++]=sb;
 }
 n.mesh=mesh({position:pos,normal:nrm,color:col,uv:uvs,index:idx.subarray(0,m)});
 n.off=v3(cx,cy,cz);
 n.maxH=n.ctrH;
}
const _tp=v3(),_tq=v3();
function terrUpdate(b,camPos,maxDepth,out){
 const T=terrGetTree(b);
 // camera position in the planet's rotating frame
 vsub(_tp,camPos,b.pos);
 const c=Math.cos(-b.rot),s=Math.sin(-b.rot);
 const lx=_tp[0]*c-_tp[2]*s, lz=_tp[0]*s+_tp[2]*c;
 vset(_tq,lx,_tp[1],lz);
 out.length=0;
 for(const r of T.roots)terrVisit(r,b,_tq,maxDepth,out);
 return out;
}
function terrVisit(n,b,camLocal,maxDepth,out){
 const px=n.ctr[0]*(b.radius+n.ctrH),py=n.ctr[1]*(b.radius+n.ctrH),pz=n.ctr[2]*(b.radius+n.ctrH);
 const dx=camLocal[0]-px,dy=camLocal[1]-py,dz=camLocal[2]-pz;
 const dist=Math.hypot(dx,dy,dz);
 const nodeSize=b.radius*n.size;
 // horizon cull: skip nodes on the far side once we are close to the surface
 const camR=Math.hypot(camLocal[0],camLocal[1],camLocal[2]);
 if(n.depth>2&&camR<b.radius*1.35){
  const cosA=(camLocal[0]*n.ctr[0]+camLocal[1]*n.ctr[1]+camLocal[2]*n.ctr[2])/camR;
  const horiz=Math.sqrt(Math.max(0,1-(b.radius/camR)*(b.radius/camR)));
  if(cosA<horiz-0.35-n.size)return;
 }
 const want=dist<nodeSize*2.2 && n.depth<maxDepth;
 if(want){
  if(!n.kids){
   n.kids=[];const h=n.size*0.5;
   for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const k=terrNode(n.face,n.u0+i*h,n.v0+j*h,h,n.depth+1);terrInitNode(k,b);n.kids.push(k);}
  }
  let ready=true;
  for(const k of n.kids)if(!k.mesh&&!(k.kids&&k.kids.length)){ready=false;break;}
  // draw children only once they all have geometry, else keep drawing this node
  if(ready||n.depth===0){for(const k of n.kids)terrVisit(k,b,camLocal,maxDepth,out);return;}
 } else if(n.kids&&dist>nodeSize*3.2){
  const rec=k=>{if(k.mesh){k.mesh.dispose();k.mesh=null;}if(k.kids){k.kids.forEach(rec);k.kids=null;}};
  n.kids.forEach(rec);n.kids=null;
 }
 if(!n.mesh){
  if(terrBudget>0){terrBudget--;terrBuildMesh(n,b);}
  else return;
 }
 out.push(n);
}
