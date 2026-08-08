/* ===== MATH (Float64 physics vectors, Float32 column-major matrices) ===== */
const TAU=6.283185307179586, DEG=Math.PI/180;
const v3=(x,y,z)=>{const a=new Float64Array(3);a[0]=x||0;a[1]=y||0;a[2]=z||0;return a;};
const vset=(o,x,y,z)=>{o[0]=x;o[1]=y;o[2]=z;return o;};
const vcopy=(o,a)=>{o[0]=a[0];o[1]=a[1];o[2]=a[2];return o;};
const vadd=(o,a,b)=>{o[0]=a[0]+b[0];o[1]=a[1]+b[1];o[2]=a[2]+b[2];return o;};
const vsub=(o,a,b)=>{o[0]=a[0]-b[0];o[1]=a[1]-b[1];o[2]=a[2]-b[2];return o;};
const vscl=(o,a,s)=>{o[0]=a[0]*s;o[1]=a[1]*s;o[2]=a[2]*s;return o;};
const vmad=(o,a,b,s)=>{o[0]=a[0]+b[0]*s;o[1]=a[1]+b[1]*s;o[2]=a[2]+b[2]*s;return o;};
const vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vcross=(o,a,b)=>{const x=a[1]*b[2]-a[2]*b[1],y=a[2]*b[0]-a[0]*b[2],z=a[0]*b[1]-a[1]*b[0];o[0]=x;o[1]=y;o[2]=z;return o;};
const vlen=a=>Math.hypot(a[0],a[1],a[2]);
const vlen2=a=>a[0]*a[0]+a[1]*a[1]+a[2]*a[2];
const vdist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const vnorm=(o,a)=>{const l=Math.hypot(a[0],a[1],a[2]);if(l<1e-30){o[0]=o[1]=o[2]=0;return o;}return vscl(o,a,1/l);};
const vlerp=(o,a,b,t)=>{o[0]=a[0]+(b[0]-a[0])*t;o[1]=a[1]+(b[1]-a[1])*t;o[2]=a[2]+(b[2]-a[2])*t;return o;};
const clamp=(x,a,b)=>x<a?a:x>b?b:x, sat=x=>x<0?0:x>1?1:x, mix=(a,b,t)=>a+(b-a)*t;
const smoothstep=(e0,e1,x)=>{const t=sat((x-e0)/(e1-e0));return t*t*(3-2*t);};

const m4id=o=>{o.fill(0);o[0]=o[5]=o[10]=o[15]=1;return o;};
function m4mul(o,a,b){for(let c=0;c<4;c++){const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
 for(let r=0;r<4;r++)o[c*4+r]=a[r]*b0+a[4+r]*b1+a[8+r]*b2+a[12+r]*b3;}return o;}
function m4persp(o,fovy,asp,near,far){const f=1/Math.tan(fovy/2);o.fill(0);
 o[0]=f/asp;o[5]=f;o[11]=-1;o[10]=(far+near)/(near-far);o[14]=2*far*near/(near-far);return o;}
function m4view(o,q,p){ // inverse of (rot q, translate p) — camera-relative so p is small
 const x=q[0],y=q[1],z=q[2],w=q[3];
 const r=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w), 2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w), 2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y)];
 o[0]=r[0];o[1]=r[3];o[2]=r[6];o[3]=0; o[4]=r[1];o[5]=r[4];o[6]=r[7];o[7]=0;
 o[8]=r[2];o[9]=r[5];o[10]=r[8];o[11]=0;
 o[12]=-(r[0]*p[0]+r[1]*p[1]+r[2]*p[2]);o[13]=-(r[3]*p[0]+r[4]*p[1]+r[5]*p[2]);
 o[14]=-(r[6]*p[0]+r[7]*p[1]+r[8]*p[2]);o[15]=1;return o;}
function m4model(o,q,p,s){const x=q[0],y=q[1],z=q[2],w=q[3];s=s===undefined?1:s;
 o[0]=(1-2*(y*y+z*z))*s;o[1]=2*(x*y+z*w)*s;o[2]=2*(x*z-y*w)*s;o[3]=0;
 o[4]=2*(x*y-z*w)*s;o[5]=(1-2*(x*x+z*z))*s;o[6]=2*(y*z+x*w)*s;o[7]=0;
 o[8]=2*(x*z+y*w)*s;o[9]=2*(y*z-x*w)*s;o[10]=(1-2*(x*x+y*y))*s;o[11]=0;
 o[12]=p[0];o[13]=p[1];o[14]=p[2];o[15]=1;return o;}
function m3n(o,m){o[0]=m[0];o[1]=m[1];o[2]=m[2];o[3]=m[4];o[4]=m[5];o[5]=m[6];o[6]=m[8];o[7]=m[9];o[8]=m[10];return o;}

const qid=o=>{o[0]=o[1]=o[2]=0;o[3]=1;return o;};
function qmul(o,a,b){const ax=a[0],ay=a[1],az=a[2],aw=a[3],bx=b[0],by=b[1],bz=b[2],bw=b[3];
 o[0]=aw*bx+ax*bw+ay*bz-az*by;o[1]=aw*by-ax*bz+ay*bw+az*bx;
 o[2]=aw*bz+ax*by-ay*bx+az*bw;o[3]=aw*bw-ax*bx-ay*by-az*bz;return o;}
function qaxis(o,ax,ay,az,ang){const l=Math.hypot(ax,ay,az);if(l<1e-30)return qid(o);
 const s=Math.sin(ang/2)/l;o[0]=ax*s;o[1]=ay*s;o[2]=az*s;o[3]=Math.cos(ang/2);return o;}
function qnorm(o,a){const l=Math.hypot(a[0],a[1],a[2],a[3]);if(l<1e-30)return qid(o);
 o[0]=a[0]/l;o[1]=a[1]/l;o[2]=a[2]/l;o[3]=a[3]/l;return o;}
const qconj=(o,a)=>{o[0]=-a[0];o[1]=-a[1];o[2]=-a[2];o[3]=a[3];return o;};
function qrot(o,q,v){const x=q[0],y=q[1],z=q[2],w=q[3],vx=v[0],vy=v[1],vz=v[2];
 const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
 o[0]=vx+w*tx+y*tz-z*ty;o[1]=vy+w*ty+z*tx-x*tz;o[2]=vz+w*tz+x*ty-y*tx;return o;}
function qinvrot(o,q,v){_q0[0]=-q[0];_q0[1]=-q[1];_q0[2]=-q[2];_q0[3]=q[3];return qrot(o,_q0,v);}
function qslerp(o,a,b,t){let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3],s=1;
 if(d<0){d=-d;s=-1;} let ka,kb;
 if(d>0.9995){ka=1-t;kb=t*s;}else{const th=Math.acos(d),si=1/Math.sin(th);
  ka=Math.sin((1-t)*th)*si;kb=Math.sin(t*th)*si*s;}
 o[0]=a[0]*ka+b[0]*kb;o[1]=a[1]*ka+b[1]*kb;o[2]=a[2]*ka+b[2]*kb;o[3]=a[3]*ka+b[3]*kb;return qnorm(o,o);}
function qlook(o,fwd,up){ // -Z looks along fwd
 const f=vnorm(_v0,fwd);let u=vcopy(_v1,up);
 let r=vcross(_v2,u,f); if(vlen2(r)<1e-18){vset(u,f[1],f[2],f[0]);vcross(r,u,f);} vnorm(r,r);
 vcross(u,f,r);
 const m=[r[0],r[1],r[2], u[0],u[1],u[2], -f[0],-f[1],-f[2]];
 const tr=m[0]+m[4]+m[8];
 if(tr>0){const s=Math.sqrt(tr+1)*2;o[3]=.25*s;o[0]=(m[5]-m[7])/s;o[1]=(m[6]-m[2])/s;o[2]=(m[1]-m[3])/s;}
 else if(m[0]>m[4]&&m[0]>m[8]){const s=Math.sqrt(1+m[0]-m[4]-m[8])*2;o[3]=(m[5]-m[7])/s;o[0]=.25*s;o[1]=(m[3]+m[1])/s;o[2]=(m[6]+m[2])/s;}
 else if(m[4]>m[8]){const s=Math.sqrt(1+m[4]-m[0]-m[8])*2;o[3]=(m[6]-m[2])/s;o[0]=(m[3]+m[1])/s;o[1]=.25*s;o[2]=(m[7]+m[5])/s;}
 else{const s=Math.sqrt(1+m[8]-m[0]-m[4])*2;o[3]=(m[1]-m[3])/s;o[0]=(m[6]+m[2])/s;o[1]=(m[7]+m[5])/s;o[2]=.25*s;}
 return qnorm(o,o);}
const _v0=v3(),_v1=v3(),_v2=v3(),_v3=v3(),_v4=v3(),_v5=v3(),_v6=v3(),_v7=v3(),_v8=v3(),_v9=v3();
const _q0=new Float64Array(4),_q1=new Float64Array(4),_q2=new Float64Array(4);

/* ===== NOISE — integer-hash gradient noise with analytic derivatives ===== */
const GRAD=new Float32Array(48);
(function(){let s=1013904223;const r=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296*2-1;};
 for(let i=0;i<16;i++){let x=r(),y=r(),z=r();const l=Math.hypot(x,y,z)||1;
  GRAD[i*3]=x/l;GRAD[i*3+1]=y/l;GRAD[i*3+2]=z/l;}})();
function hash3(i,j,k){let h=i*374761393+j*668265263+k*2147483647;
 h=(h^(h>>>13))*1274126177;return (h^(h>>>16))>>>0;}
// value in [-1,1]; writes derivative into D if provided
const _D=new Float32Array(3);
function noise3(x,y,z,D){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
 const fx=x-ix,fy=y-iy,fz=z-iz;
 const ux=fx*fx*fx*(fx*(fx*6-15)+10), uy=fy*fy*fy*(fy*(fy*6-15)+10), uz=fz*fz*fz*(fz*(fz*6-15)+10);
 const dux=30*fx*fx*(fx*(fx-2)+1), duy=30*fy*fy*(fy*(fy-2)+1), duz=30*fz*fz*(fz*(fz-2)+1);
 let n000,n100,n010,n110,n001,n101,n011,n111;
 const g=(i,j,k,dx,dy,dz)=>{const h=(hash3(i,j,k)&15)*3;return GRAD[h]*dx+GRAD[h+1]*dy+GRAD[h+2]*dz;};
 n000=g(ix,iy,iz,fx,fy,fz);       n100=g(ix+1,iy,iz,fx-1,fy,fz);
 n010=g(ix,iy+1,iz,fx,fy-1,fz);   n110=g(ix+1,iy+1,iz,fx-1,fy-1,fz);
 n001=g(ix,iy,iz+1,fx,fy,fz-1);   n101=g(ix+1,iy,iz+1,fx-1,fy,fz-1);
 n011=g(ix,iy+1,iz+1,fx,fy-1,fz-1);n111=g(ix+1,iy+1,iz+1,fx-1,fy-1,fz-1);
 const k0=n000,k1=n100-n000,k2=n010-n000,k3=n001-n000;
 const k4=n000-n100-n010+n110,k5=n000-n010-n001+n011,k6=n000-n100-n001+n101;
 const k7=-n000+n100+n010-n110+n001-n101-n011+n111;
 const val=k0+k1*ux+k2*uy+k3*uz+k4*ux*uy+k5*uy*uz+k6*ux*uz+k7*ux*uy*uz;
 if(D){D[0]=dux*(k1+k4*uy+k6*uz+k7*uy*uz);D[1]=duy*(k2+k4*ux+k5*uz+k7*ux*uz);
       D[2]=duz*(k3+k5*uy+k6*ux+k7*ux*uy);}
 return val*1.6;
}
function fbm(x,y,z,oct,lac,gain){let a=1,f=1,s=0,n=0;
 for(let i=0;i<oct;i++){s+=a*noise3(x*f,y*f,z*f);n+=a;a*=gain;f*=lac;}return s/n;}
// derivative-damped "uber" fBm: accumulated slope suppresses later octaves (NMS-style relief)
function uberfbm(x,y,z,oct,lac,gain,damp){
 let a=1,f=1,s=0,n=0,dx=0,dy=0,dz=0;
 for(let i=0;i<oct;i++){
  const v=noise3(x*f,y*f,z*f,_D);
  const d=1/(1+damp*(dx*dx+dy*dy+dz*dz));
  s+=a*v*d;n+=a;
  dx+=_D[0]*f*a;dy+=_D[1]*f*a;dz+=_D[2]*f*a;
  a*=gain;f*=lac;}
 return s/n;}
function ridged(x,y,z,oct,lac,gain){let a=1,f=1,s=0,n=0,w=1;
 for(let i=0;i<oct;i++){let v=1-Math.abs(noise3(x*f,y*f,z*f));v*=v;v*=w;
  w=clamp(v*2,0,1);s+=a*v;n+=a;a*=gain;f*=lac;}return s/n*2-1;}
function worley(x,y,z){ // F1 distance, cell size 1
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let m=9;
 for(let k=-1;k<=1;k++)for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
  const h=hash3(ix+i,iy+j,iz+k);
  const px=ix+i+((h&255)/255),py=iy+j+(((h>>>8)&255)/255),pz=iz+k+(((h>>>16)&255)/255);
  const d=(px-x)*(px-x)+(py-y)*(py-y)+(pz-z)*(pz-z);if(d<m)m=d;}
 return Math.sqrt(m);}

/* ===== PLANET FIELD — canonical CPU heightfield (drives mesh + collision) ===== */
function makeDNA(seed,type,radius){
 const R=(n)=>{const h=hash3(Math.floor(seed*1000),n*7919,4177);return (h>>>8)/16777216;};
 const P=[];for(let i=0;i<6;i++)P.push([R(20+i*3),R(21+i*3),R(22+i*3)]);
 return {seed:seed,radius:radius,type:type,
  amp:mix(2000,14000,R(1)),ridgeAmp:mix(2500,11000,R(2)),warp:mix(.15,.6,R(3)),
  freq:mix(1.1,2.6,R(4)),octaves:9,seaLevel:0,
  craters:type===0||type===6?mix(.4,1,R(5)):R(5)*.15,
  rivers:type===1?mix(.4,1,R(6)):R(6)*.25,
  dunes:type===2?mix(.5,1,R(7)):R(7)*.2,
  ice:type===3?mix(.6,1,R(8)):R(8)*.35,
  lava:type===4?mix(.5,1,R(9)):0,
  vegetation:type===1?mix(.35,1,R(10)):0,
  temp:mix(160,330,R(11)),humidity:R(12),hue:R(13),pal:P,_oct:9};
}
// elevation in metres relative to dna.radius
function fieldHeight(x,y,z,d){
 const oct=d._oct||d.octaves, f=d.freq, w=d.warp, s=d.seed*13.7;
 // domain warp
 const wx=noise3(x*f*2.1+s,y*f*2.1,z*f*2.1)*w;
 const wy=noise3(x*f*2.1,y*f*2.1+s+17,z*f*2.1)*w;
 const wz=noise3(x*f*2.1,y*f*2.1,z*f*2.1+s+41)*w;
 const px=x*f+wx+s, py=y*f+wy, pz=z*f+wz;
 // continents (uber fbm, damped so plains stay flat and ranges stay coherent)
 let cont=uberfbm(px,py,pz,Math.min(oct,7),2.03,.5,2.2);
 let h=cont*d.amp;
 // orogenic ridges — only where continental gradient is high (believable mountain belts)
 const belt=sat(Math.abs(cont)*1.7+.15);
 if(oct>4){
  const r=ridged(px*2.7+11,py*2.7,pz*2.7,Math.min(oct-3,6),2.11,.55);
  h+=(r*.5+.5)*d.ridgeAmp*belt*belt;
 }
 // canyons / mesas: terrace the elevation where a mask says so
 if(oct>5&&d.rivers>0.05){
  const m=sat(noise3(px*3.3+61,py*3.3,pz*3.3)*1.5+.2)*d.rivers;
  const step=d.amp*.28;
  h=mix(h,Math.round(h/step)*step,m*.55);
  // river carving: converging warped gradient
  const rv=1-Math.abs(noise3(px*5.1+91,py*5.1,pz*5.1));
  h-=Math.pow(sat(rv-.72)*3.5,2)*d.amp*.5*d.rivers*sat(1-Math.abs(cont)*1.4);
 }
 // dunes
 if(d.dunes>.05&&oct>6){
  const du=ridged(px*13+7,py*3.1,pz*13,3,2.2,.5);
  h+=du*220*d.dunes*sat(1-Math.abs(cont)*2);
 }
 // impact craters (Worley cells, rim+bowl profile, crater depth ~ 0.2 D)
 if(d.craters>.05){
  let cs=1.9, amp=1;
  for(let i=0;i<3;i++){
   const wv=worley(px*cs+i*31.7,py*cs,pz*cs);
   const rr=sat(1-wv*2.2);
   if(rr>0){const prof=rr<0.72? -Math.sqrt(sat(1-(rr/0.72)*(rr/0.72)))*0.8 : (rr-0.72)/0.28*1.4;
    h+=prof*d.amp*0.42*d.craters*amp;}
   cs*=2.7;amp*=.42;}
 }
 // volcanic shields
 if(d.lava>.05){const vc=sat(noise3(px*1.7+301,py*1.7,pz*1.7)*1.4);
  h+=Math.pow(vc,4)*d.amp*1.6*d.lava;}
 // polar caps raise slightly (ice accumulation)
 if(d.ice>.05){const lat=Math.abs(y);h+=smoothstep(.72,.97,lat)*600*d.ice;}
 // fine detail
 if(oct>7)h+=fbm(px*36,py*36,pz*36,3,2.1,.5)*d.amp*.012;
 return h;
}
function fieldNormal(x,y,z,d,out,eps){
 // gradient on the sphere tangent plane
 let tx,ty,tz;
 if(Math.abs(y)<0.99){tx=-z;ty=0;tz=x;}else{tx=1;ty=0;tz=0;}
 const tl=Math.hypot(tx,ty,tz);tx/=tl;ty/=tl;tz/=tl;
 const bx=y*tz-z*ty,by=z*tx-x*tz,bz=x*ty-y*tx;
 const e=eps;
 const h0=fieldHeight(x,y,z,d);
 const hx=fieldHeight(x+tx*e,y+ty*e,z+tz*e,d);
 const hy=fieldHeight(x+bx*e,y+by*e,z+bz*e,d);
 const sx=(hx-h0)/(e*d.radius), sy=(hy-h0)/(e*d.radius);
 // n = normalize(up - t*sx - b*sy)
 let nx=x-tx*sx-bx*sy, ny=y-ty*sx-by*sy, nz=z-tz*sx-bz*sy;
 const l=Math.hypot(nx,ny,nz)||1;out[0]=nx/l;out[1]=ny/l;out[2]=nz/l;return out;
}
function describeDNA(d){
 const T=['Airless rocky body','Temperate terrestrial world','Arid desert world','Frozen ice world',
          'Volcanic world','Gas giant','Ocean world'][d.type]||'Unknown';
 const t=d.temp-273.15;
 const f=[];
 if(d.vegetation>.5)f.push('dense biosphere');else if(d.vegetation>.15)f.push('sparse flora');
 if(d.craters>.5)f.push('heavy bombardment');
 if(d.rivers>.4)f.push('fluvial erosion');
 if(d.lava>.4)f.push('active volcanism');
 if(d.ice>.5)f.push('extensive glaciation');
 if(d.dunes>.5)f.push('great ergs');
 return T+' — '+(f.length?f.join(', '):'geologically quiescent')+
   ' · mean '+t.toFixed(0)+'°C · relief '+((d.amp+d.ridgeAmp)/1000).toFixed(1)+' km';
}
