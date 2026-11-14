import{Bn as e,It as t,Pt as n,fr as r,g as i,l as a,u as o,vt as s}from"./three.core-Dnvxljtg.js";var c=class{content;phase=`calm`;intensity=0;t0=0;dur={build:180,peak:420,clear:200};points;pos;vel;clouds=[];cloudMat;N=5e3;wind=new r(1,0,.35).normalize();warned=!1;rattleT=0;pointsMat;constructor(c){this.content=c;let l=c.zone,u=new o;this.pos=new Float32Array(this.N*3),this.vel=new Float32Array(this.N);for(let e=0;e<this.N;e++)this.pos[e*3]=(Math.random()-.5)*80,this.pos[e*3+1]=Math.random()*18,this.pos[e*3+2]=(Math.random()-.5)*80,this.vel[e]=.6+Math.random()*.8;u.setAttribute(`position`,new a(this.pos,3)),this.pointsMat=new e({transparent:!0,depthWrite:!1,uniforms:{uOpacity:{value:0},uColor:{value:new i(.62,.5,.36)},uScale:{value:300}},vertexShader:`
        uniform float uScale; varying float vFade;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp(uScale / d, 1.0, 10.0);
          vFade = smoothstep(0.5, 3.0, d) * (1.0 - smoothstep(25.0, 45.0, d));
        }`,fragmentShader:`
        uniform float uOpacity; uniform vec3 uColor; varying float vFade;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(uColor, a * uOpacity * vFade);
        }`}),this.points=new t(u,this.pointsMat),this.points.frustumCulled=!1,this.points.renderOrder=10,this.points.userData.owned=!0,l.scene.add(this.points),this.cloudMat=new e({transparent:!0,depthWrite:!1,side:2,uniforms:{tNoise:{value:c.game.materials.tex(`noise`,!1,1)},uTime:{value:0},uOpacity:{value:0},uColor:{value:new i(.55,.45,.33)}},vertexShader:`
        varying vec2 vUv; varying float vDist;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,fragmentShader:`
        uniform sampler2D tNoise; uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv; varying float vDist;
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c);
          float n = texture2D(tNoise, vUv * 0.7 + vec2(uTime * 0.02, uTime * 0.007)).r * 0.6 + texture2D(tNoise, vUv * 1.9 - vec2(uTime * 0.03, 0.0)).g * 0.4;
          float a = smoothstep(0.5, 0.05, r) * smoothstep(0.25, 0.7, n) * uOpacity * smoothstep(4.0, 30.0, vDist);
          gl_FragColor = vec4(uColor * (0.7 + 0.5 * n), a);
        }`});let d=new n(1,1);for(let e=0;e<36;e++){let e=new s(d,this.cloudMat);e.userData.owned=!0,e.userData.off=new r((Math.random()-.5)*300,4+Math.random()*40,(Math.random()-.5)*300);let t=40+Math.random()*80;e.scale.set(t,t*.6,1),e.renderOrder=9,e.frustumCulled=!1,l.scene.add(e),this.clouds.push(e)}let f=c.game.state.farm;f.nextStormT||=c.game.state.clock.earthTime+1500}get game(){return this.content.game}trigger(){this.content.game.state.farm.nextStormT=this.content.game.state.clock.earthTime+5,this.warned=!1}update(e){let t=this.game,n=t.state.farm,i=t.state.clock.earthTime,a=this.content.zone;if(this.phase===`calm`){let e=n.nextStormT-i;e<240&&!this.warned&&(this.warned=!0,t.notify(`Weather service: dust storm approaching from the west. Bring machines in, seal windows.`,`warn`,9)),e<=0&&(this.phase=`building`,this.t0=i,this.content.vehicles?.list?.forEach(e=>{e.driver!==`player`&&e.task.kind!==`parked`&&(e.task=this.content.vehicles.returnTask(e))}))}let o=i-this.t0;this.phase===`building`?(this.intensity=Math.min(1,o/this.dur.build),o>this.dur.build&&(this.phase=`peak`,this.t0=i)):this.phase===`peak`?(this.intensity=.9+.1*Math.sin(o*.3),o>this.dur.peak&&(this.phase=`clearing`,this.t0=i)):this.phase===`clearing`&&(this.intensity=Math.max(0,1-o/this.dur.clear),o>this.dur.clear&&(this.phase=`calm`,this.intensity=0,this.warned=!1,n.nextStormT=i+2400+Math.random()*3600,t.notify(`The storm has passed. Dust settles on everything.`,`info`,6))),n.stormLevel=Math.min(1,Math.max(0,(n.stormLevel??0)+(this.intensity>.5?.01:-6e-4)*(e>0)));let s=this.intensity*this.intensity*(3-2*this.intensity);a.storm=s;let c=this.content.isIndoors();t.renderer.fx.dust=c?s*.08:s*.55;let l=t.camera.position,u=4+s*22;if(this.pointsMat.uniforms.uOpacity.value=c?0:s*.85,this.points.position.set(l.x,0,l.z),s>.01&&!c){let t=this.pos;for(let n=0;n<this.N;n++){let r=n*3;t[r]+=this.wind.x*u*this.vel[n]*e,t[r+2]+=this.wind.z*u*this.vel[n]*e,t[r+1]+=Math.sin((t[r]+n)*.3+a.time*2)*.6*e-.15*e,t[r]>40?t[r]-=80:t[r]<-40&&(t[r]+=80),t[r+2]>40?t[r+2]-=80:t[r+2]<-40&&(t[r+2]+=80);let i=a.height(l.x+t[r],l.z+t[r+2]);t[r+1]<i+.05&&(t[r+1]=i+.05+Math.random()*1.5),t[r+1]>i+20&&(t[r+1]=i+Math.random()*3)}this.points.geometry.getAttribute(`position`).needsUpdate=!0}this.cloudMat.uniforms.uTime.value=a.time,this.cloudMat.uniforms.uOpacity.value=s*.75;for(let t of this.clouds){let n=t.userData.off;n.addScaledVector(this.wind,u*.8*e),n.x>160&&(n.x-=320),n.z>160&&(n.z-=320),n.x<-160&&(n.x+=320),n.z<-160&&(n.z+=320),t.position.set(l.x+n.x,a.height(l.x+n.x,l.z+n.z)+n.y,l.z+n.z),t.lookAt(l),t.visible=s>.02}if(this.rattleT-=e,s>.5&&this.rattleT<=0&&t.audio.ctx){this.rattleT=1.5+Math.random()*4;let e=l.clone().add(new r((Math.random()-.5)*30,2,(Math.random()-.5)*30));Math.random()<.6?t.audio.clank({pos:e,base:200+Math.random()*300,gain:.08*s,decay:.3}):t.audio.burst({pos:e,dur:.4,freq:1200,q:4,gain:.08*s,noise:`pink`})}t.state.flags.stormMood!==s>.4&&(t.state.flags.stormMood=s>.4)}};export{c as Weather};