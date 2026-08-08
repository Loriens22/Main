/* ===== FALLBACK PHYSICS: patched-conic gravity + 6-DOF flight model (lead-authored) ===== */
const SHIP={
 pos:v3(),vel:v3(),quat:new Float64Array([0,0,0,1]),angVel:v3(),
 mass:2.4e6,dryMass:9.2e5,throttle:0,rcs:v3(),translate:v3(),
 sas:true,sasMode:'stability',rcsOn:true,gearDown:false,brakes:false,
 fuel:1,oxygen:1,hull:1,power:1,
 maxThrust:2.6e7,isp:{vac:452,sl:328},
 engines:[],rcsPorts:[],gear:[],
 soi:null,orbit:null,landed:false,gearAnim:0,contactPrev:false,
 heat:0,hullT:290,rcsFire:0
};
const _f0=v3(),_f1=v3(),_f2=v3(),_f3=v3(),_f4=v3(),_f5=v3(),_f6=v3(),_f7=v3(),_f8=v3(),_f9=v3();
const _fq0=new Float64Array(4),_fq1=new Float64Array(4),_fq2=new Float64Array(4);
const _fFWD=v3(0,0,-1);          // M2: hoisted — this used to allocate every sub-step

/* M2 FIX: qlook() degenerates when `up` is parallel or anti-parallel to `fwd`: the
   cross product collapses and its fallback axis (fwd.yzx) is itself parallel to fwd
   for any fwd with three equal components, so the quaternion comes out NaN / flipped.
   Orthogonalise `up` against `fwd` first and fall back to a provably independent axis.
   p2-core.js is owned by the lead, so the guard lives at the call sites instead. */
function fltQlookSafe(o,fwd,up){
 vnorm(_f8,fwd);
 if(vlen2(_f8)<0.5)vset(_f8,0,0,-1);                    // fwd was degenerate
 vmad(_f9,up,_f8,-vdot(up,_f8));                        // up, made perpendicular to fwd
 if(vlen2(_f9)<1e-12){
  const ax=Math.abs(_f8[0]),ay=Math.abs(_f8[1]),az=Math.abs(_f8[2]);
  if(ax<=ay&&ax<=az)vset(_f9,1,0,0);else if(ay<=az)vset(_f9,0,1,0);else vset(_f9,0,0,1);
  vmad(_f9,_f9,_f8,-vdot(_f9,_f8));
 }
 vnorm(_f9,_f9);
 return qlook(o,_f8,_f9);
}

/* M2 FIX: KSP-style time-warp ceiling. Warp integrates the flight model with sub-steps
   of tens or hundreds of seconds, which is only valid when gravity is the ONLY force.
   Under thrust, under RCS, inside an atmosphere or close to terrain the integration
   diverges (and at 100000x the ship simply teleports through the planet). */
function fltWarpMax(){
 if(typeof CTX==='undefined'||typeof SHIP==='undefined')return 1;
 if(SHIP.throttle>0.001)return 1;
 if(SHIP.rcsOn&&(Math.abs(SHIP.translate[0])+Math.abs(SHIP.translate[1])+
    Math.abs(SHIP.translate[2]))>0.001)return 1;
 if(SHIP.landed)return 10;                              // surface warp: spring stays stable
 if(CTX.atmoDensity>0.0015)return 1;
 const b=CTX.body;
 if(!b||b.kind==='star')return 100000;
 const a=CTX.altitude;
 if(!isFinite(a))return 100000;
 const f=a/Math.max(b.radius,1);
 if(f<0.004)return 1;
 if(f<0.02)return 5;
 if(f<0.06)return 50;
 if(f<0.25)return 1000;
 if(f<1.5)return 10000;
 return 100000;
}

function orbFromState(pos,vel,mu,bodyPos,bodyVel){
 const r=_f0, v=_f1;
 vsub(r,pos,bodyPos); vsub(v,vel,bodyVel);
 const R=vlen(r), V=vlen(v);
 if(R<1e-6||!isFinite(R))return null;
 const h=vcross(_f2,r,v), H=vlen(h);
 const energy=V*V/2-mu/R;
 const a=Math.abs(energy)<1e-12?Infinity:-mu/(2*energy);
 // eccentricity vector e = (v x h)/mu - r/|r|
 const evec=_f3;
 vcross(evec,v,h);
 vscl(evec,evec,1/mu);
 vmad(evec,evec,r,-1/R);
 const e=vlen(evec);
 const rp=(isFinite(a))?a*(1-e):(H*H/mu)/(1+e);
 const ra=(e<1&&isFinite(a))?a*(1+e):Infinity;
 const period=(e<1&&isFinite(a)&&a>0)?TAU*Math.sqrt(a*a*a/mu):Infinity;
 const inc=Math.acos(clamp(h[1]/Math.max(H,1e-12),-1,1));
 return {a:a,e:e,rp:rp,ra:ra,period:period,h:H,energy:energy,inc:inc,mu:mu,r:R,v:V};
}
function fltInit(){
 const L=(typeof SHIP_LAYOUT!=='undefined')?SHIP_LAYOUT:SHIP_LAYOUT_FB;
 SHIP.layout=L;
 SHIP.mass=L.mass;SHIP.dryMass=L.dryMass;
 SHIP.engines=L.engines.map(e=>({posLocal:e.pos,r:e.r,throttle01:0,temp01:0}));
 SHIP.rcsPorts=L.rcs.map(p=>({posLocal:p,fire01:0}));
 SHIP.gear=L.gear.map(p=>({posLocal:p,compression01:0,contact:false,dustRate:0}));
 SHIP.inertia=L.inertia;
 // start in a 420 km circular orbit over Earth, prograde, nose on the horizon
 const earth=BODIES.find(b=>b.name==='EARTH')||BODIES[1];
 bodyStateAt(earth,0);
 const r=earth.radius+4.2e5;
 vset(_f0,r,0,0);
 vadd(SHIP.pos,earth.pos,_f0);
 const vc=Math.sqrt(earth.mu/r);
 vset(_f1,0,0,-vc);
 vadd(SHIP.vel,earth.vel,_f1);
 vnorm(_f2,_f1);
 vnorm(_f3,_f0);
 fltQlookSafe(SHIP.quat,_f2,_f3);   // M2: gimbal-safe
 SHIP.soi=earth;
}
function fltDominant(pos){
 let best=null,bestPull=0;
 for(const b of BODIES){
  const d2=Math.max((pos[0]-b.pos[0])**2+(pos[1]-b.pos[1])**2+(pos[2]-b.pos[2])**2,1);
  if(b.parent&&Math.sqrt(d2)>b.soi)continue;
  const pull=b.mu/d2;
  if(pull>bestPull){bestPull=pull;best=b;}
 }
 return best;
}
function fltGravity(pos,out){
 vset(out,0,0,0);
 for(const b of BODIES){
  const dx=b.pos[0]-pos[0],dy=b.pos[1]-pos[1],dz=b.pos[2]-pos[2];
  const d2=dx*dx+dy*dy+dz*dz;
  if(d2<1)continue;
  const d=Math.sqrt(d2);
  const g=b.mu/(d2*d);
  out[0]+=dx*g;out[1]+=dy*g;out[2]+=dz*g;
 }
 return out;
}
function fltAirDensity(b,alt){
 if(!b||!b.atmo||alt>b.atmo.height)return 0;
 return b.atmo.rho0*Math.exp(-Math.max(alt,0)/b.atmo.scaleH);
}
const KEYS={};
function fltBindInput(cv){
 addEventListener('keydown',e=>{
  KEYS[e.code]=1;
  if(e.code==='KeyT'){SHIP.sas=!SHIP.sas;$('b_sas').classList.toggle('on',SHIP.sas);}
  if(e.code==='KeyR'){SHIP.rcsOn=!SHIP.rcsOn;$('b_rcs').classList.toggle('on',SHIP.rcsOn);}
  if(e.code==='KeyG'){SHIP.gearDown=!SHIP.gearDown;$('b_gear').classList.toggle('on',SHIP.gearDown);
   message(SHIP.gearDown?'GEAR DOWN':'GEAR UP');}
  if(e.code==='KeyC'){CTX.view3rd=!CTX.view3rd;}
  if(e.code==='KeyX')SHIP.throttle=0;
  if(e.code==='KeyZ')SHIP.throttle=1;
  if(e.code==='Period')setWarp(1);
  if(e.code==='Comma')setWarp(-1);
  if(e.code==='KeyM'){UI.mapOpen=!UI.mapOpen;}
  // M2: SHIP.brakes existed but nothing could ever toggle it
  if(e.code==='KeyB'){SHIP.brakes=!SHIP.brakes;message(SHIP.brakes?'BRAKES ON':'BRAKES OFF');}
  if(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','Space','ShiftLeft','ControlLeft'].includes(e.code))
   e.preventDefault();
 });
 addEventListener('keyup',e=>{KEYS[e.code]=0;});
 // M2: a key held while the tab loses focus never sees its keyup — the ship then
 // rotates forever with no way to stop it. Flush the whole map on blur.
 addEventListener('blur',()=>{for(const k in KEYS)KEYS[k]=0;});
 // mouse-look for the camera orbit
 let drag=false,lx=0,ly=0;
 cv.addEventListener('pointerdown',e=>{
  if(typeof mobAxes!=='undefined'&&mobAxes.active)return;   // M2: touch scheme owns the camera
  drag=true;lx=e.clientX;ly=e.clientY;});
 addEventListener('pointerup',()=>{drag=false;});
 addEventListener('pointercancel',()=>{drag=false;});       // M2: was a stuck-drag path
 addEventListener('pointermove',e=>{
  if(!drag)return;
  CAM.yaw-=(e.clientX-lx)*0.005;CAM.pitch=clamp(CAM.pitch+(e.clientY-ly)*0.005,-1.4,1.4);
  lx=e.clientX;ly=e.clientY;});
 cv.addEventListener('wheel',e=>{CAM.dist=clamp(CAM.dist*(1+Math.sign(e.deltaY)*0.12),12,900);
  e.preventDefault();},{passive:false});
}
const CAM={yaw:0.6,pitch:0.44,dist:82,shake:0};  // framed so the planet is in shot on load
function fltUpdate(dt){
 const K=n=>KEYS[n]?1:0;
 // --- attitude command ---
 let cp=K('KeyS')-K('KeyW'), cy=K('KeyD')-K('KeyA'), cr=K('KeyE')-K('KeyQ');
 // M2: the p13 touch scheme replaces the legacy TOUCH sticks whenever it is active
 const mob=(typeof mobAxes!=='undefined'&&mobAxes.active)?mobAxes:null;
 if(mob){cp+=mob.pitch;cy+=mob.yaw;cr+=mob.roll;}
 else if(IS_MOBILE){cp+=-TOUCH.ry;cy+=TOUCH.rx;}
 const ex=x=>Math.sign(x)*Math.pow(Math.abs(clamp(x,-1,1)),1.7);
 SHIP.rcs[0]=ex(cp);SHIP.rcs[1]=ex(cy);SHIP.rcs[2]=ex(cr);
 // --- throttle ---
 let th=SHIP.throttle;
 th+=(K('ShiftLeft')-K('ControlLeft'))*dt*0.55;
 // with a real throttle slider (p13) the left stick no longer ramps the throttle
 if(!mob&&IS_MOBILE)th+=TOUCH.ly*dt*0.9;
 SHIP.throttle=sat(th);
 // --- translation RCS ---
 SHIP.translate[0]=K('KeyL')-K('KeyJ');
 SHIP.translate[1]=K('KeyI')-K('KeyK');
 SHIP.translate[2]=K('KeyH')-K('KeyN');
 if(mob){SHIP.translate[0]+=mob.tx;SHIP.translate[1]+=mob.ty;}
 else if(IS_MOBILE){SHIP.translate[0]+=TOUCH.lx;}
 for(let i=0;i<3;i++)SHIP.translate[i]=clamp(SHIP.translate[i],-1,1);

 const body=fltDominant(SHIP.pos);
 SHIP.soi=body;
 let alt=Infinity, rho=0, gh=0;
 if(body){
  const rr=vdist(SHIP.pos,body.pos);
  // M2 PERF: fieldHeight() is the most expensive call in the whole sim loop and it ran
  // once per physics sub-step (up to 16x per frame under warp). Above a few times the
  // planet's total relief the terrain offset is irrelevant to altitude, so use the datum.
  const relief=body.dna?(body.dna.amp+body.dna.ridgeAmp):0;
  if(body.dna&&rr-body.radius<Math.max(6e4,relief*4)){
   worldToBodyDir(body,SHIP.pos,_f6);
   gh=worldGroundHeight(body,_f6);
  } else gh=body.radius+(body.ocean?Math.max(0,body.ocean.level):0);
  alt=rr-gh;
  rho=fltAirDensity(body,rr-body.radius);
 }
 // --- forces ---
 const acc=_f0;
 fltGravity(SHIP.pos,acc);
 // thrust
 const fwd=_f1; qrot(fwd,SHIP.quat,_fFWD);
 vnorm(fwd,fwd);
 const pAmb=body&&body.atmo?sat(rho/body.atmo.rho0):0;
 const isp=mix(SHIP.isp.vac,SHIP.isp.sl,pAmb);
 let T=SHIP.maxThrust*SHIP.throttle*mix(1.0,0.86,pAmb);
 if(SHIP.fuel<=0){T=0;SHIP.throttle=0;}
 if(T>0){
  vmad(acc,acc,fwd,T/SHIP.mass);
  const mdot=T/(isp*G0);
  const wet=SHIP.mass-SHIP.dryMass;
  SHIP.fuel=sat(SHIP.fuel-mdot*dt/Math.max(wet,1));
  SHIP.mass=SHIP.dryMass+ (SHIP.layout.mass-SHIP.dryMass)*SHIP.fuel;
 }
 // RCS translation
 if(SHIP.rcsOn){
  // M2: dropped a dead scratch write and a per-sub-step Float64Array allocation
  vset(_f2,SHIP.translate[0],SHIP.translate[1],-SHIP.translate[2]);
  qrot(_f3,SHIP.quat,_f2);
  vmad(acc,acc,_f3,26000/SHIP.mass);
 }
 // aerodynamics
 let vrelLen=0;
 if(body){
  vsub(_f4,SHIP.vel,body.vel);
  // subtract the surface rotation velocity so drag is relative to the moving air
  vsub(_f5,SHIP.pos,body.pos);
  const w=body.rotPeriod?TAU/body.rotPeriod:0;
  // surface (air) velocity: omega x r, with omega about +Y
  _f7[0]=w*_f5[2];_f7[1]=0;_f7[2]=-w*_f5[0];
  vsub(_f4,_f4,_f7);
  vrelLen=vlen(_f4);
  if(rho>1e-9&&vrelLen>0.5){
   vnorm(_f5,_f4);
   const A=48, Cd0=0.62;
   const mach=vrelLen/Math.max(280,1);
   const Cd=Cd0*(1+1.35*Math.exp(-Math.pow((mach-1.05)/0.42,2)))*(mach>1?0.72+0.5/mach:1);
   const q=0.5*rho*vrelLen*vrelLen;
   const drag=q*Cd*A;
   vmad(acc,acc,_f5,-drag/SHIP.mass);
   // body lift from angle of attack
   const aoa=Math.acos(clamp(-vdot(_f5,fwd),-1,1));
   const stall=smoothstep(0.35,0.62,aoa);
   const Cl=Math.sin(2*aoa)*0.9*(1-stall*0.8);
   vcross(_f6,_f5,fwd);
   if(vlen(_f6)>1e-6){vnorm(_f6,_f6);vcross(_f7,_f6,_f5);vnorm(_f7,_f7);
    vmad(acc,acc,_f7,q*Cl*A*0.5/SHIP.mass);}
   // weathercock: aerodynamic restoring moment into the airflow
   vcross(_f6,fwd,_f5);
   const wc=q*A*2.2e-6/Math.max(SHIP.inertia[0],1);
   SHIP.angVel[0]+=_f6[0]*wc*dt*60;SHIP.angVel[1]+=_f6[1]*wc*dt*60;SHIP.angVel[2]+=_f6[2]*wc*dt*60;
   // Sutton-Graves stagnation heating: q = k*sqrt(rho/Rn)*v^3
   const qdot=1.7415e-4*Math.sqrt(rho/1.8)*Math.pow(vrelLen,3);
   // M2 FIX: explicit Euler on this stiff linear ODE diverges once dt > 1/0.11 s, which
   // happens on the very first warp sub-step — hullT oscillated to +/-1e30 and then
   // silently destroyed the hull. Use the closed-form solution; unconditionally stable.
   const eqT=290+qdot*0.00021/0.11;
   SHIP.hullT=eqT+(SHIP.hullT-eqT)*Math.exp(-0.11*dt);
   if(SHIP.hullT>1850)SHIP.hull=sat(SHIP.hull-(SHIP.hullT-1850)*2e-6*dt);
  } else {
   SHIP.hullT=290+(SHIP.hullT-290)*Math.exp(-0.05*dt);   // M2: same fix, cooling branch
  }
 }
 CTX.reentryHeat=sat((SHIP.hullT-620)/1500);
 // --- integrate translation (semi-implicit Euler; stable and cheap) ---
 vmad(SHIP.vel,SHIP.vel,acc,dt);
 vmad(SHIP.pos,SHIP.pos,SHIP.vel,dt);

 // --- attitude ---
 const torque=_f2;
 vset(torque,SHIP.rcs[0]*1.0,SHIP.rcs[1]*1.0,SHIP.rcs[2]*0.75);
 const auth=0.55*(SHIP.rcsOn?1:0.45);
 if(SHIP.sas&&vlen(SHIP.rcs)<0.02){
  // rate damping: kill residual angular velocity
  vscl(_f3,SHIP.angVel,-2.4);
  vadd(torque,torque,_f3);
 }
 SHIP.angVel[0]+=torque[0]*auth*dt;
 SHIP.angVel[1]+=torque[1]*auth*dt;
 SHIP.angVel[2]+=torque[2]*auth*dt;
 const damp=Math.exp(-0.55*dt);
 vscl(SHIP.angVel,SHIP.angVel,damp);
 const av=vlen(SHIP.angVel);
 if(av>1e-9){
  qaxis(_fq0,SHIP.angVel[0],SHIP.angVel[1],SHIP.angVel[2],av*dt);
  // body-frame rate -> world rotation
  qmul(_fq1,SHIP.quat,_fq0);
  qnorm(SHIP.quat,_fq1);
 }
 // --- gear + ground contact ---
 SHIP.gearAnim+=((SHIP.gearDown?1:0)-SHIP.gearAnim)*Math.min(1,dt*1.6);
 SHIP.landed=false;
 if(body&&alt<260){
  const clr=SHIP.gearDown?5.4:3.4;
  const pen=clr-alt;
  if(pen>0){
   vsub(_f3,SHIP.pos,body.pos);vnorm(_f3,_f3);          // local up
   // spring-damper suspension along the local up
   vsub(_f4,SHIP.vel,body.vel);
   const vn=vdot(_f4,_f3);
   const k=Math.min(pen/clr,1);
   // M2 FIX: the damper only acted while moving downward (min(vn,0)), so the spring
   // released its full energy on the way back up and the ship bounced/jittered for
   // ever instead of settling. Damp both directions, clamped at zero so the ground
   // can only ever push (a unilateral contact never pulls the ship down).
   const springA=Math.max(0,k*38.0 - vn*3.2);
   vmad(SHIP.vel,SHIP.vel,_f3,springA*dt);
   // M2 FIX: relaxing only 55% of the penetration is fine for a gentle touchdown, but a
   // fast descent puts the hull tens of metres under the mesh in one step and it then
   // sinks. Below the surface, push out completely and cancel the inward velocity.
   if(alt<0){
    vmad(SHIP.pos,SHIP.pos,_f3,-alt+0.2);
    if(vn<0)vmad(SHIP.vel,SHIP.vel,_f3,-vn);
   } else vmad(SHIP.pos,SHIP.pos,_f3,pen*0.55);
   // friction: bleed off the tangential component
   const vt=_f5;
   vmad(vt,_f4,_f3,-vn);
   const mu=SHIP.brakes?4.5:1.9;
   vmad(SHIP.vel,SHIP.vel,vt,-Math.min(1,mu*dt));
   // M2 FIX: impact damage was applied on EVERY sub-step while penetrating, so one
   // hard landing chewed through the hull in a handful of frames. Once per touchdown.
   if(!SHIP.contactPrev){
    if(Math.abs(vn)>34&&SHIP.gearDown===false)SHIP.hull=sat(SHIP.hull-0.16);
    if(Math.abs(vn)>68)SHIP.hull=sat(SHIP.hull-0.28);
   }
   SHIP.contactPrev=true;
   SHIP.landed=vlen(vt)<3.5&&Math.abs(vn)<2.5;
   for(let i=0;i<SHIP.gear.length;i++){
    SHIP.gear[i].compression01=sat(k);SHIP.gear[i].contact=true;
    SHIP.gear[i].dustRate=sat(k*2)*(1-sat(vlen(vt)/30));
   }
   CAM.shake=Math.max(CAM.shake,Math.min(1,Math.abs(vn)/22));
  } else {SHIP.contactPrev=false;
   for(const g of SHIP.gear){g.contact=false;g.compression01=0;g.dustRate=0;}}
 } else SHIP.contactPrev=false;
 // --- resources ---
 const rs=SUN?vdist(SHIP.pos,SUN.pos):1e12;
 const solar=sat((AU/Math.max(rs,1))**2*0.9);
 // M2 FIX: with solar alone the reactor flat-lines beyond ~2 AU and never recovers —
 // startWarp() needs 12% charge, so the player is stranded with no path back. Model an
 // RTG that trickles all the time and steps up when the bus is low (load shedding), so
 // power always converges to a usable ~35% given time, but thrusting still costs.
 const rtg=SHIP.power<0.35?0.0125:0.0035;
 SHIP.power=sat(SHIP.power+(solar*0.032+rtg-0.010-SHIP.throttle*0.012)*dt);
 SHIP.oxygen=sat(SHIP.oxygen-dt*7e-6);
 if(SHIP.power<=0.001)SHIP.oxygen=sat(SHIP.oxygen-dt*3e-5);
 // --- frame state ---
 CTX.body=body;CTX.altitude=alt;
 CTX.atmoDensity=body&&body.atmo?sat(rho/body.atmo.rho0):0;
 CTX.speed=vrelLen;
 SHIP.orbit=body?orbFromState(SHIP.pos,SHIP.vel,body.mu,body.pos,body.vel):null;
 if(WARPST.state!=='idle')CTX.phase='warp';
 else if(SHIP.landed)CTX.phase='landed';
 else if(CTX.reentryHeat>0.12)CTX.phase='reentry';
 else if(CTX.atmoDensity>0.004)CTX.phase='atmo';
 else if(body&&alt<body.soi*0.5&&SHIP.orbit&&SHIP.orbit.e<1)CTX.phase='orbit';
 else CTX.phase='space';
 CAM.shake*=Math.exp(-3.0*dt);
 CAM.shake=Math.max(CAM.shake,CTX.reentryHeat*0.55+SHIP.throttle*CTX.atmoDensity*0.3);
}
