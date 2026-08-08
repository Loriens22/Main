/* ===== GL ENGINE ===== */
const canvas=document.getElementById('gl');
const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:true,stencil:false,
 powerPreference:'high-performance',preserveDrawingBuffer:false});
if(!gl){document.getElementById('boot').innerHTML='<h1 style="color:#f66">WEBGL2 REQUIRED</h1>'+
 '<p>This browser cannot run Stellar Expanse. Try Chrome, Edge, Firefox or Safari 15+.</p>';throw new Error('no webgl2');}
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
gl.getExtension('EXT_float_blend');

const IS_MOBILE=/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent)||
  (navigator.maxTouchPoints>1&&Math.min(screen.width,screen.height)<900);
const QUALITY={
 mobile:IS_MOBILE,
 tier:IS_MOBILE?0:(window.devicePixelRatio>1.5&&screen.width>=1600?2:1),
 scale:IS_MOBILE?0.62:(window.devicePixelRatio>1.5?0.85:1.0),
 steps:{atmo:8,cloud:16,cloudLight:3,wh:12,lod:15},
 bloom:true,motionBlur:false,godrays:true,clouds:true
};
if(QUALITY.tier===1){QUALITY.steps={atmo:14,cloud:28,cloudLight:4,wh:20,lod:17};QUALITY.motionBlur=true;}
if(QUALITY.tier===2){QUALITY.steps={atmo:22,cloud:44,cloudLight:6,wh:28,lod:19};QUALITY.motionBlur=true;}

const FAR=1e13, NEAR=0.08, LOGFC=2.0/Math.log2(FAR+1.0);

const GLSL_COMMON=`
#define PI 3.141592653589793
#define TAU 6.283185307179686
uniform float uLogFC;
float sat(float x){return clamp(x,0.0,1.0);} vec2 sat(vec2 x){return clamp(x,0.0,1.0);}
vec3 sat(vec3 x){return clamp(x,0.0,1.0);} vec4 sat(vec4 x){return clamp(x,0.0,1.0);}
float remap(float x,float a,float b,float c,float d){return c+(d-c)*clamp((x-a)/(b-a),0.0,1.0);}
float luma(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}
mat3 rotAxis(vec3 ax,float a){float s=sin(a),c=cos(a);float t=1.0-c;
 return mat3(t*ax.x*ax.x+c,t*ax.x*ax.y+s*ax.z,t*ax.x*ax.z-s*ax.y,
             t*ax.x*ax.y-s*ax.z,t*ax.y*ax.y+c,t*ax.y*ax.z+s*ax.x,
             t*ax.x*ax.z+s*ax.y,t*ax.y*ax.z-s*ax.x,t*ax.z*ax.z+c);}
float hash11(float p){p=fract(p*0.1031);p*=p+33.33;p*=p+p;return fract(p);}
vec2 hash21(float p){vec3 p3=fract(vec3(p)*vec3(0.1031,0.1030,0.0973));
 p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
 p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
vec3 hash33(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));
 p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float vnoise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 float n=0.0;
 n+=mix(mix(mix(hash33(i+vec3(0,0,0)).x,hash33(i+vec3(1,0,0)).x,f.x),
            mix(hash33(i+vec3(0,1,0)).x,hash33(i+vec3(1,1,0)).x,f.x),f.y),
        mix(mix(hash33(i+vec3(0,0,1)).x,hash33(i+vec3(1,0,1)).x,f.x),
            mix(hash33(i+vec3(0,1,1)).x,hash33(i+vec3(1,1,1)).x,f.x),f.y),f.z);
 return n;}
float vfbm3(vec3 p,int oct){float a=0.5,s=0.0,n=0.0;
 for(int i=0;i<10;i++){if(i>=oct)break;s+=a*vnoise3(p);n+=a;a*=0.5;p*=2.03;}return s/max(n,1e-4);}
void segLog(inout vec4 cp){cp.z=(log2(max(1e-6,1.0+cp.w))*uLogFC-1.0)*cp.w;}
float segViewDist(float fragZ){return exp2((fragZ*2.0-1.0+1.0)/uLogFC)-1.0;}
vec2 raySphere(vec3 ro,vec3 rd,vec3 c,float r){
 vec3 oc=ro-c;float b=dot(oc,rd);float cc=dot(oc,oc)-r*r;float h=b*b-cc;
 if(h<0.0)return vec2(1.0,-1.0);h=sqrt(h);return vec2(-b-h,-b+h);}
vec3 acesTonemap(vec3 x){const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
 return sat((x*(a*x+b))/(x*(c*x+d)+e));}
vec3 blackbody(float t){ // approximate, t in Kelvin, returns linear rgb (unnormalised)
 float tt=t/100.0;vec3 c;
 c.r = tt<=66.0 ? 1.0 : sat(1.292936*pow(max(tt-60.0,0.0),-0.1332047));
 c.g = tt<=66.0 ? sat(0.3900816*log(max(tt,1.0))-0.6318414)
                : sat(1.129891*pow(max(tt-60.0,0.0),-0.0755148));
 c.b = tt>=66.0 ? 1.0 : (tt<=19.0?0.0:sat(0.5432068*log(max(tt-10.0,1.0))-1.196254));
 return c;}
`;

const FSQUAD_VS=`
out vec2 vUV;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}
`;

const _progCache=[];
function compile(type,src,name){
 const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
  const log=gl.getShaderInfoLog(s);
  const lines=src.split('\n');let ctx='';
  const m=/ERROR:\s*\d+:(\d+)/.exec(log||'');
  if(m){const L=+m[1];for(let i=Math.max(0,L-4);i<Math.min(lines.length,L+3);i++)ctx+=(i+1)+': '+lines[i]+'\n';}
  throw new Error('shader ['+name+' '+(type===gl.VERTEX_SHADER?'VS':'FS')+']: '+log+'\n'+ctx);
 }
 return s;
}
function prog(vs,fs,name){
 const head='#version 300 es\nprecision highp float;\nprecision highp int;\n';
 const p=gl.createProgram();
 gl.attachShader(p,compile(gl.VERTEX_SHADER,head+GLSL_COMMON+vs,name));
 gl.attachShader(p,compile(gl.FRAGMENT_SHADER,head+GLSL_COMMON+fs,name));
 gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link ['+name+']: '+gl.getProgramInfoLog(p));
 const u={},a={};
 const nu=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
 for(let i=0;i<nu;i++){const inf=gl.getActiveUniform(p,i);const nm=inf.name.replace(/\[0\]$/,'');
  u[nm]=gl.getUniformLocation(p,inf.name);}
 const na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);
 for(let i=0;i<na;i++){const inf=gl.getActiveAttrib(p,i);a[inf.name]=gl.getAttribLocation(p,inf.name);}
 const o={p:p,u:u,a:a,name:name,use(){gl.useProgram(p);if(u.uLogFC)gl.uniform1f(u.uLogFC,LOGFC);}};
 _progCache.push(o);return o;
}
const ATTRLOC={position:0,normal:1,uv:2,color:3,mat:4,tangent:5};
function mesh(d){
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);
 const bufs=[];
 for(const k in ATTRLOC){
  if(!d[k])continue;
  const b=gl.createBuffer();bufs.push(b);
  gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d[k],gl.STATIC_DRAW);
  const n=k==='position'||k==='normal'?3:(k==='uv'?2:(k==='mat'?1:3));
  gl.enableVertexAttribArray(ATTRLOC[k]);
  gl.vertexAttribPointer(ATTRLOC[k],n,gl.FLOAT,false,0,0);
 }
 let count,ib=null;
 if(d.index){ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.index,gl.STATIC_DRAW);count=d.index.length;}
 else count=d.position.length/3;
 gl.bindVertexArray(null);
 return {vao:vao,count:count,indexed:!!d.index,
  draw(){gl.bindVertexArray(vao);
   if(ib)gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
   else gl.drawArrays(gl.TRIANGLES,0,count);},
  dispose(){gl.deleteVertexArray(vao);bufs.forEach(b=>gl.deleteBuffer(b));if(ib)gl.deleteBuffer(ib);}};
}
function tex2D(w,h,fmt,data,o){
 o=o||{};const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
 const F={rgba16f:[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT],rgba8:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],
  r16f:[gl.R16F,gl.RED,gl.HALF_FLOAT],depth:[gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT]}[fmt];
 gl.texImage2D(gl.TEXTURE_2D,0,F[0],w,h,0,F[1],F[2],data||null);
 const fl=o.nearest?gl.NEAREST:gl.LINEAR;
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,fl);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,fl);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,o.wrap||gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,o.wrap||gl.CLAMP_TO_EDGE);
 gl.bindTexture(gl.TEXTURE_2D,null);return t;
}
function fbo(w,h,o){
 o=o||{};const n=o.n||1;
 const F={fb:gl.createFramebuffer(),tex:[],depthTex:null,w:w,h:h};
 gl.bindFramebuffer(gl.FRAMEBUFFER,F.fb);
 const att=[];
 for(let i=0;i<n;i++){const t=tex2D(w,h,o.float?'rgba16f':'rgba8',null,o);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);
  F.tex.push(t);att.push(gl.COLOR_ATTACHMENT0+i);}
 gl.drawBuffers(att);
 if(o.depth){F.depthTex=tex2D(w,h,'depth',null,{nearest:true});
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,F.depthTex,0);}
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 F.bind=function(){gl.bindFramebuffer(gl.FRAMEBUFFER,F.fb);gl.viewport(0,0,F.w,F.h);};
 F.resize=function(nw,nh){
  if(nw===F.w&&nh===F.h)return;F.w=nw;F.h=nh;
  for(let i=0;i<F.tex.length;i++){gl.bindTexture(gl.TEXTURE_2D,F.tex[i]);
   gl.texImage2D(gl.TEXTURE_2D,0,o.float?gl.RGBA16F:gl.RGBA8,nw,nh,0,gl.RGBA,
    o.float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);}
  if(F.depthTex){gl.bindTexture(gl.TEXTURE_2D,F.depthTex);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,nw,nh,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);}
  gl.bindTexture(gl.TEXTURE_2D,null);};
 return F;
}
let _quadVAO=null;
function drawQuad(){if(!_quadVAO)_quadVAO=gl.createVertexArray();
 gl.bindVertexArray(_quadVAO);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);}
function bindTex(P,name,tex,unit){
 if(!P.u[name])return;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);
 gl.uniform1i(P.u[name],unit);}

/* ===== SHARED FRAME STATE ===== */
const CTX={
 t:0,dt:0,frame:0,W:1,H:1,
 view:new Float32Array(16),proj:new Float32Array(16),viewProj:new Float32Array(16),
 prevViewProj:new Float32Array(16),invViewProj:new Float32Array(16),
 camPos:v3(),camQuat:new Float64Array([0,0,0,1]),
 camFwd:v3(0,0,-1),camUp:v3(0,1,0),camRight:v3(1,0,0),
 fov:1.0,exposure:1.0,
 sunDir:v3(0,0,1),sunColor:new Float32Array([1,.97,.92]),sunIntensity:1,
 sunScreen:new Float32Array([0,0,-1]),
 body:null,altitude:Infinity,atmoDensity:0,speed:0,phase:'space',reentryHeat:0,
 paused:false,quality:QUALITY,timeWarp:1,view3rd:true
};
function m4inv(o,m){
 const a00=m[0],a01=m[1],a02=m[2],a03=m[3],a10=m[4],a11=m[5],a12=m[6],a13=m[7],
  a20=m[8],a21=m[9],a22=m[10],a23=m[11],a30=m[12],a31=m[13],a32=m[14],a33=m[15];
 const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,
  b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,
  b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
 let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
 if(!det)return m4id(o);det=1/det;
 o[0]=(a11*b11-a12*b10+a13*b09)*det;o[1]=(a02*b10-a01*b11-a03*b09)*det;
 o[2]=(a31*b05-a32*b04+a33*b03)*det;o[3]=(a22*b04-a21*b05-a23*b03)*det;
 o[4]=(a12*b08-a10*b11-a13*b07)*det;o[5]=(a00*b11-a02*b08+a03*b07)*det;
 o[6]=(a32*b02-a30*b05-a33*b01)*det;o[7]=(a20*b05-a22*b02+a23*b01)*det;
 o[8]=(a10*b10-a11*b08+a13*b06)*det;o[9]=(a01*b08-a00*b10-a03*b06)*det;
 o[10]=(a30*b04-a31*b02+a33*b00)*det;o[11]=(a21*b02-a20*b04-a23*b00)*det;
 o[12]=(a11*b07-a10*b09-a12*b06)*det;o[13]=(a00*b09-a01*b07+a02*b06)*det;
 o[14]=(a31*b01-a30*b03-a32*b00)*det;o[15]=(a20*b03-a21*b01+a22*b00)*det;return o;
}
