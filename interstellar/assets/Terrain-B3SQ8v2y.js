import{J as e,_t as t,fr as n,j as r,l as i,pr as a,q as o,s,vt as c,wt as l,z as u}from"./three.core-Dnvxljtg.js";var d=32,f=`
attribute vec4 aNode;   // x0, z0, size, level
attribute vec2 aMorph;  // morph start, morph end
uniform sampler2D tHNear; uniform vec4 uNear;
uniform sampler2D tHFar; uniform vec4 uFar; uniform float uFarOn; uniform float uBlend;
uniform sampler2D tHMid; uniform vec4 uMid; uniform float uMidOn; uniform float uMidBlend;
varying vec3 vTWorld; varying vec3 vTNormal;
float tSample(sampler2D t, vec4 u, vec2 xz){
  vec2 p = (xz - u.xy) / u.z * (u.w - 1.0);
  p = clamp(p, vec2(0.0), vec2(u.w - 1.001));
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
  float a = texelFetch(t, i, 0).r; float b = texelFetch(t, i + ivec2(1,0), 0).r;
  float c = texelFetch(t, i + ivec2(0,1), 0).r; float d = texelFetch(t, i + ivec2(1,1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float tCoarse(vec2 xz){
  float hf = tSample(tHFar, uFar, xz);
  if (uMidOn < 0.5) return hf;
  vec2 r = xz - uMid.xy;
  float e = min(min(r.x, uMid.z - r.x), min(r.y, uMid.z - r.y));
  if (e <= 0.0) return hf;
  float t = clamp(e / uMidBlend, 0.0, 1.0);
  return mix(hf, tSample(tHMid, uMid, xz), t * t * (3.0 - 2.0 * t));
}
float tHeight(vec2 xz){
  vec2 r = xz - uNear.xy;
  float e = min(min(r.x, uNear.z - r.x), min(r.y, uNear.z - r.y));
  if (uFarOn < 0.5) return tSample(tHNear, uNear, xz);
  float hf = tCoarse(xz);
  if (e <= 0.0) return hf;
  float hn = tSample(tHNear, uNear, xz);
  float t = clamp(e / uBlend, 0.0, 1.0);
  return mix(hf, hn, t * t * (3.0 - 2.0 * t));
}
`,p=`
varying vec3 vTWorld; varying vec3 vTNormal;
struct TerrainOut { vec3 albedo; float rough; vec3 normal; float ao; };
`,m=class{opts;mesh;material;geo;aNode;aMorph;ranges=[];levels;leaf;count=0;max;frustum=new u;box=new s;camPos=new n;uniforms;detailBias=1;constructor(t){this.opts=t,this.leaf=t.leafSize??64,this.levels=Math.max(1,Math.round(Math.log2(t.rootSize/this.leaf))+1);let n=t.lodBase??90;for(let e=0;e<this.levels;e++)this.ranges.push(n*2**e);this.max=t.maxInstances??1200;let s=new e,u=new Float32Array(3267);for(let e=0;e<33;e++)for(let t=0;t<33;t++){let n=(e*33+t)*3;u[n]=t,u[n+1]=0,u[n+2]=e}let m=[];for(let e=0;e<d;e++)for(let t=0;t<d;t++){let n=e*33+t,r=n+1,i=n+33,a=i+1;(t+e)%2==0?m.push(n,i,r,r,i,a):m.push(n,i,a,n,a,r)}s.setAttribute(`position`,new i(u,3)),s.setAttribute(`normal`,new i(new Float32Array(3267),3)),s.setAttribute(`uv`,new i(new Float32Array(2178),2)),s.setIndex(m),this.aNode=new o(new Float32Array(this.max*4),4),this.aMorph=new o(new Float32Array(this.max*2),2),this.aNode.setUsage(r),this.aMorph.setUsage(r),s.setAttribute(`aNode`,this.aNode),s.setAttribute(`aMorph`,this.aMorph),s.instanceCount=0,this.geo=s;let h=t.field;this.uniforms={tHNear:{value:h.near.texture()},uNear:{value:new a(h.near.minX,h.near.minZ,h.near.size,h.near.res)},tHFar:{value:h.far?h.far.texture():h.near.texture()},uFar:{value:h.far?new a(h.far.minX,h.far.minZ,h.far.size,h.far.res):new a(h.near.minX,h.near.minZ,h.near.size,h.near.res)},uFarOn:{value:+!!h.far},uBlend:{value:h.blend},tHMid:{value:h.mid?h.mid.texture():h.near.texture()},uMid:{value:h.mid?new a(h.mid.minX,h.mid.minZ,h.mid.size,h.mid.res):new a(0,0,1,2)},uMidOn:{value:+!!h.mid},uMidBlend:{value:h.midBlend},uHole:{value:new a(0,0,0,0)},...t.shading.uniforms};let g=new l({color:16777215,roughness:.9,metalness:0});g.onBeforeCompile=e=>{Object.assign(e.uniforms,this.uniforms),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
`+f).replace(`#include <beginnormal_vertex>`,`
          vec2 gIdx = position.xz;
          float nSize = aNode.z;
          vec2 wxz = aNode.xy + gIdx / ${d}.0 * nSize;
          float h0 = tHeight(wxz);
          float dist = distance(cameraPosition, vec3(wxz.x, h0, wxz.y));
          float morphK = clamp((dist - aMorph.x) / (aMorph.y - aMorph.x), 0.0, 1.0);
          vec2 fr = fract(gIdx * 0.5) * 2.0;
          gIdx -= fr * morphK;
          wxz = aNode.xy + gIdx / ${d}.0 * nSize;
          float hgt = tHeight(wxz);
          float e = max(nSize / ${d}.0, 1.0);
          vec3 objectNormal = normalize(vec3(tHeight(wxz - vec2(e, 0.0)) - tHeight(wxz + vec2(e, 0.0)), 2.0 * e, tHeight(wxz - vec2(0.0, e)) - tHeight(wxz + vec2(0.0, e))));
          vTWorld = vec3(wxz.x, hgt, wxz.y);
          vTNormal = objectNormal;
          `).replace(`#include <begin_vertex>`,`vec3 transformed = vTWorld;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform vec4 uHole;
`+p+t.shading.glsl).replace(`#include <clipping_planes_fragment>`,`if (uHole.z > 0.0 && distance(vTWorld.xz, uHole.xy) < uHole.z) discard;
#include <clipping_planes_fragment>`).replace(`#include <map_fragment>`,`#include <map_fragment>
TerrainOut T = terrainShade(vTWorld, normalize(vTNormal));
diffuseColor.rgb = T.albedo;`).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
roughnessFactor = T.rough;`).replace(`#include <normal_fragment_maps>`,`#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(T.normal, 0.0)).xyz);`).replace(`#include <aomap_fragment>`,`#include <aomap_fragment>
reflectedLight.indirectDiffuse *= T.ao;`),t.fragmentPatch&&(e.fragmentShader=t.fragmentPatch(e.fragmentShader))},g.customProgramCacheKey=()=>`terrain-cdlod`+(t.cacheKey??``),this.material=g,this.mesh=new c(s,g),this.mesh.frustumCulled=!1,this.mesh.receiveShadow=!0,this.mesh.castShadow=!1,this.mesh.userData.owned=!0}height(e,t){return this.opts.field.height(e,t)}update(e){e.updateMatrixWorld();let n=new t().multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse);this.frustum.setFromProjectionMatrix(n),e.getWorldPosition(this.camPos),this.count=0;let r=this.opts.rootSize,[i,a]=this.opts.rootCenter;this.select(i-r/2,a-r/2,r,this.levels-1),this.geo.instanceCount=this.count,this.aNode.needsUpdate=!0,this.aMorph.needsUpdate=!0,this.aNode.addUpdateRange(0,this.count*4),this.aMorph.addUpdateRange(0,this.count*2)}nodeBox(e,t,n){let r=this.opts.field,i=1/0,a=-1/0;for(let o=0;o<=2;o++)for(let s=0;s<=2;s++){let c=r.height(e+n*s/2,t+n*o/2);i=Math.min(i,c),a=Math.max(a,c)}let o=Math.min(250,20+n*.08);return this.box.min.set(e,i-o,t),this.box.max.set(e+n,a+o,t+n),this.box}range(e){return this.ranges[e]*this.detailBias}select(e,t,n,r){let i=this.nodeBox(e,t,n),a=r===this.levels-1?1/0:this.range(r);if(i.distanceToPoint(this.camPos)>a)return!1;if(!this.frustum.intersectsBox(i))return!0;if(r===0||i.distanceToPoint(this.camPos)>this.range(r-1))return this.add(e,t,n,r),!0;let o=n/2,s=[[e,t],[e+o,t],[e,t+o],[e+o,t+o]];for(let[e,t]of s)this.select(e,t,o,r-1)||this.add(e,t,o,r-1,!0);return!0}add(e,t,n,r,i=!1){if(this.count>=this.max)return;let a=this.count++,o=this.aNode.array;o[a*4]=e,o[a*4+1]=t,o[a*4+2]=n,o[a*4+3]=r;let s=this.aMorph.array,c=this.range(r);s[a*2]=c*.72,s[a*2+1]=c*.98}dispose(){this.geo.dispose(),this.material.dispose()}};export{m as t};