import{Bn as e,Gn as t,H as n,It as r,Pt as i,fr as a,ht as o,l as s,u as c,vt as l}from"./three.core-Dnvxljtg.js";import{bt as u}from"./index-CNHvrhQ0.js";function d(e,t,n=2){let r=(e,t,r)=>{let i=Number(e.toFixed(n)),a=i===0?0:i;return`${Math.abs(a).toFixed(n)}°${a>=0?t:r}`};return`${r(e,`N`,`S`)} ${r(t,`E`,`W`)}`}var f=class{group=new n;constructor(n=14e3,i=7){let u=i,d=()=>(u=u*16807%2147483647)/2147483647,f=o.degToRad(192.86),p=o.degToRad(27.13),m=new a(Math.cos(p)*Math.cos(f),Math.sin(p),-Math.cos(p)*Math.sin(f)).normalize(),h=new Float32Array(n*3),g=new Float32Array(n*3),_=new Float32Array(n),v=new a;for(let e=0;e<n;e++){for(let t=0;t<6&&(v.set(d()*2-1,d()*2-1,d()*2-1),!(!(v.lengthSq()>1||v.lengthSq()<1e-4)&&(v.normalize(),Math.abs(v.dot(m))<.25+d()*.75||e%3==0)));t++);h.set([v.x*1e5,v.y*1e5,v.z*1e5],e*3);let t=d()**9,n=d(),r=n<.15?[1,.72,.5]:n<.35?[1,.9,.78]:n<.8?[.95,.97,1]:[.72,.82,1],i=.25+t*3.5;g.set([r[0]*i,r[1]*i,r[2]*i],e*3),_[e]=1.2+t*3.2}let y=new c;y.setAttribute(`position`,new s(h,3)),y.setAttribute(`color`,new s(g,3)),y.setAttribute(`size`,new s(_,1));let b=new e({transparent:!0,depthWrite:!1,depthTest:!1,blending:2,uniforms:{uScale:{value:1},uVis:{value:1}},vertexShader:`
        attribute vec3 color; attribute float size; varying vec3 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uScale; }`,fragmentShader:`
        varying vec3 vC; uniform float uVis;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float a = exp(-r * 3.5); gl_FragColor = vec4(vC * a * uVis, 1.0); }`}),x=new r(y,b);x.frustumCulled=!1,x.renderOrder=0,x.userData.owned=!0,this.group.add(x);let S=new e({side:1,transparent:!0,depthWrite:!1,depthTest:!1,blending:2,uniforms:{uPole:{value:m},uVis:{value:1}},vertexShader:`varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`
        varying vec3 vD; uniform vec3 uPole; uniform float uVis;
        float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          float b = dot(vD, uPole);
          float band = exp(-b * b * 28.0);
          float n = n3(vD * 6.0) * 0.5 + n3(vD * 13.0) * 0.3 + n3(vD * 29.0) * 0.2;
          float dust = smoothstep(0.45, 0.75, n3(vD * 9.0 + 3.1)) * exp(-b * b * 300.0);
          vec3 c = vec3(0.55, 0.58, 0.7) * band * (0.35 + 0.9 * n) * (1.0 - 0.7 * dust);
          gl_FragColor = vec4(c * 0.05 * uVis, 1.0);
        }`}),C=new l(new t(2e5,48,24),S);C.frustumCulled=!1,C.renderOrder=-1,C.userData.owned=!0,this.group.add(C)}setVisibility(e){this.group.traverse(t=>{let n=t.material;n?.uniforms?.uVis&&(n.uniforms.uVis.value=e)})}},p=class{mesh;constructor(){let t=new e({transparent:!0,depthWrite:!1,depthTest:!1,blending:2,uniforms:{},vertexShader:`varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }`,fragmentShader:`
        varying vec2 vU;
        void main(){ float r = length(vU); float disc = smoothstep(0.042, 0.034, r); float halo = (exp(-r * 9.0) * 0.6 + exp(-r * 3.0) * 0.08) * smoothstep(1.0, 0.55, r);
          vec3 c = vec3(1.0, 0.97, 0.92) * (disc * 60.0 + halo * 3.0); gl_FragColor = vec4(c, 1.0); }`});this.mesh=new l(new i(13e3,13e3),t),this.mesh.frustumCulled=!1,this.mesh.renderOrder=5,this.mesh.userData.owned=!0}update(e){this.mesh.position.copy(e).normalize().multiplyScalar(5e4)}},m=`
  float gsHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float gsNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(gsHash(i), gsHash(i + vec3(1,0,0)), f.x), mix(gsHash(i + vec3(0,1,0)), gsHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(gsHash(i + vec3(0,0,1)), gsHash(i + vec3(1,0,1)), f.x), mix(gsHash(i + vec3(0,1,1)), gsHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  // the Gargantua galaxy: denser, bluer star field, a broad band with dust lanes, magenta–blue nebulae
  vec3 otherSky(vec3 d){
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; k++){
      vec3 p = d * (150.0 + float(k) * 230.0);
      vec3 i = floor(p);
      float h = gsHash(i + float(k) * 7.0);
      float s = step(0.955, h) * pow(fract(h * 113.0), 4.0);
      vec3 f = fract(p) - 0.5;
      vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.7), fract(h * 57.0));
      col += tint * s * exp(-dot(f, f) * 32.0) * 8.0;
    }
    vec3 bandN = normalize(vec3(0.35, 0.82, 0.45));
    float lat = dot(d, bandN);
    float band = exp(-lat * lat * 12.0);
    float neb = gsNoise(d * 5.0) * 0.6 + gsNoise(d * 13.0) * 0.4;
    float dust = smoothstep(0.45, 0.7, gsNoise(d * 9.0 + 3.0)) * exp(-lat * lat * 60.0);
    col += mix(vec3(0.22, 0.28, 0.62), vec3(0.68, 0.42, 0.6), neb) * band * (0.2 + 0.8 * neb) * 0.6 * (1.0 - 0.75 * dust);
    col += vec3(0.5, 0.48, 0.6) * pow(gsNoise(d * 40.0), 6.0) * band * 0.8;
    return col;
  }
`,h=class{mesh;mat;constructor(){this.mat=new e({side:1,depthTest:!1,depthWrite:!1,uniforms:{uK:{value:1}},vertexShader:`varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`precision highp float; uniform float uK; varying vec3 vD; ${m}
        void main(){ gl_FragColor = vec4(otherSky(normalize(vD)) * uK, 1.0); }`}),this.mesh=new l(new t(25e4,64,32),this.mat),this.mesh.renderOrder=0,this.mesh.frustumCulled=!1,this.mesh.userData.owned=!0}},g=4e4,_=class{rsKm;mesh;mat;inner=2.2;outer=10;bound=40;angular=0;constructor(n,r){this.rsKm=n,this.mat=new e({side:1,depthTest:!1,depthWrite:!1,uniforms:{uCam:{value:new a(100,0,0)},uN:{value:r.clone().normalize()},uIn:{value:this.inner},uOut:{value:this.outer},uBound:{value:this.bound},uTime:{value:0},uK:{value:1},uDisk:{value:1},uQGarg:u.uQGarg},vertexShader:`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,fragmentShader:`
        precision highp float;
        uniform vec3 uCam, uN; uniform float uIn, uOut, uBound, uTime, uK, uDisk, uQGarg; varying vec3 vW;
        ${m}
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          float a = gsHash(vec3(i, 1.0)), b = gsHash(vec3(i + vec2(1.0, 0.0), 1.0)), c = gsHash(vec3(i + vec2(0.0, 1.0), 1.0)), d = gsHash(vec3(i + vec2(1.0, 1.0), 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
        vec3 ramp(float t){
          // emitted colour vs (redshifted) temperature: deep orange → gold → white → faintly blue-white
          vec3 c = mix(vec3(0.9, 0.28, 0.05), vec3(1.0, 0.62, 0.28), smoothstep(0.1, 0.5, t));
          c = mix(c, vec3(1.0, 0.9, 0.78), smoothstep(0.45, 0.95, t));
          return mix(c, vec3(0.88, 0.93, 1.0), smoothstep(1.0, 1.6, t));
        }
        vec4 disk(vec3 xi, vec3 v){
          float r = length(xi);
          vec3 e1 = normalize(cross(uN, vec3(0.31, 0.57, 0.76))); vec3 e2 = cross(uN, e1);
          float ang = atan(dot(xi, e2), dot(xi, e1));
          float om = 2.0 * pow(r, -1.5);
          float a2 = ang + om * uTime;
          // sheared turbulence: streaks stretched along the orbit, clumps and gaps, no regular banding
          vec2 q = vec2(r * 3.2 + 0.8 * n2(vec2(r * 1.3, a2 * 1.5)), a2 * 2.2);
          float tex = 0.35 + 0.65 * (n2(q * vec2(1.0, 2.0)) * 0.5 + n2(q * vec2(3.1, 7.0) + 5.0) * 0.3 + n2(q * vec2(9.0, 22.0) + 11.0) * 0.2);
          float rings = 0.82 + 0.18 * n2(vec2(r * 6.0, a2 * 0.7 + 3.0));
          float x = uIn / r;
          float T = pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) / 0.488;
          float beta = clamp(sqrt(0.5 / r), 0.0, 0.62);
          vec3 vd = normalize(cross(uN, xi));
          float cosT = dot(vd, -v);
          float gam = inversesqrt(1.0 - beta * beta);
          float D = 1.0 / (gam * (1.0 - beta * cosT));
          float g = D * sqrt(max(1.0 - 1.0 / r, 0.04));
          float I = 2.4 * T * T * T * T * pow(g, 2.2) * tex * rings;
          float edge = smoothstep(uIn, uIn * 1.08, r) * (1.0 - smoothstep(uOut * 0.55, uOut, r));
          float a = clamp(edge * (0.55 + 0.45 * tex) * 1.2, 0.0, 1.0);
          return vec4(ramp(T * g) * I, a);
        }
        void main(){
          vec3 rd = normalize(vW);                 // far camera at the origin
          vec3 x = uCam; vec3 v = rd;
          float b0 = dot(x, v); float c0 = dot(x, x) - uBound * uBound;
          if (c0 > 0.0){
            float hh = b0 * b0 - c0;
            if (hh < 0.0 || b0 > 0.0){ gl_FragColor = vec4(otherSky(rd) * uK, 1.0); return; }
            x += v * (-b0 - sqrt(hh));
          }
          vec3 hv = cross(x, v); float h2 = dot(hv, hv);
          vec3 col = vec3(0.0); float acc = 0.0; bool cap = false;
          // fewer steps at low quality: longer steps far from the hole only — near the photon sphere a long step
          // jumps a grazing ray straight through the horizon and the shadow balloons
          int nSteps = int(260.0 * uQGarg); float kStep = 260.0 / float(nSteps);
          for (int i = 0; i < 260; i++){
            if (i >= nSteps) break;
            float r = length(x);
            float dt = clamp(0.045 * r * mix(1.0, kStep, smoothstep(5.0, 14.0, r)), 0.008, 1.6 * kStep);
            vec3 a = -1.5 * h2 * x / (r * r * r * r * r);
            vec3 v2 = normalize(v + a * dt);
            vec3 xn = x + v2 * dt;
            float s0 = dot(x, uN), s1 = dot(xn, uN);
            if (uDisk > 0.5 && s0 * s1 < 0.0){
              vec3 xi = mix(x, xn, s0 / (s0 - s1));
              float ri = length(xi);
              if (ri > uIn && ri < uOut){
                vec4 dc = disk(xi, v2);
                col += (1.0 - acc) * dc.rgb * dc.a;
                acc += (1.0 - acc) * dc.a;
                if (acc > 0.985) break;
              }
            }
            x = xn; v = v2;
            if (dot(x, x) < 1.0){ cap = true; break; }
            if (dot(x, x) > uBound * uBound && dot(x, v) > 0.0) break;
          }
          vec3 bg = cap ? vec3(0.0) : otherSky(normalize(v));
          gl_FragColor = vec4((col + (1.0 - acc) * bg) * uK, 1.0);
        }`}),this.mesh=new l(new t(1,64,32),this.mat),this.mesh.frustumCulled=!1,this.mesh.renderOrder=5,this.mesh.userData.owned=!0}update(e,t,n=1){let r=this.mat.uniforms,i=this.rsKm*1e3;r.uCam.value.copy(e).multiplyScalar(-1/i),r.uTime.value=t,r.uK.value=n;let a=e.length()/1e3,o=this.bound*this.rsKm;if(a<o*1.05)this.mesh.position.set(0,0,0),this.mesh.scale.setScalar(1e5);else{let t=g/a;this.mesh.position.copy(e).multiplyScalar(t/1e3),this.mesh.scale.setScalar(o*t)}this.angular=Math.atan(2.6*i/Math.max(e.length(),i))}};export{d as a,p as i,_ as n,f as r,h as t};