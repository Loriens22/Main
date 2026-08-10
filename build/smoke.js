#!/usr/bin/env node
/* Headless integration harness.
   Mocks DOM + WebGL2 + WebAudio + localStorage, loads every src module in
   bundle order, boots IP.Game, and runs N frames with synthetic input.
   This is the only way to catch cross-module breakage before shipping.

   Usage: node build/smoke.js [frames] [--verbose] [--quality N]           */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var ORDER = ['10_core.js', '20_render.js', '30_geometry.js', '40_actors.js',
             '50_systems.js', '60_ui.js', '70_story.js', '80_main.js'];

var FRAMES = parseInt(process.argv[2], 10) || 300;
var VERBOSE = process.argv.indexOf('--verbose') >= 0;
var qi = process.argv.indexOf('--quality');
var FORCE_Q = qi >= 0 ? parseInt(process.argv[qi + 1], 10) : null;

var warnings = [];
var glCalls = 0, glErrors = [];

/* ------------------------------------------------------------------ DOM -- */
function makeClassList() {
  var set = {};
  return {
    add: function () { for (var i = 0; i < arguments.length; i++) { set[arguments[i]] = 1; } },
    remove: function () { for (var i = 0; i < arguments.length; i++) { delete set[arguments[i]]; } },
    toggle: function (c, f) { if (f === undefined) { f = !set[c]; } if (f) { set[c] = 1; } else { delete set[c]; } return f; },
    contains: function (c) { return !!set[c]; },
    get length() { return Object.keys(set).length; }
  };
}

function makeStyle() {
  var s = {};
  Object.defineProperty(s, 'setProperty', { value: function (k, v) { s[k] = v; }, enumerable: false });
  Object.defineProperty(s, 'removeProperty', { value: function (k) { delete s[k]; }, enumerable: false });
  Object.defineProperty(s, 'getPropertyValue', { value: function (k) { return s[k] || ''; }, enumerable: false });
  return s;
}

var allElements = [];
function makeEl(tag) {
  var el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    children: [], childNodes: [], parentNode: null,
    style: makeStyle(), classList: makeClassList(),
    dataset: {}, attributes: {},
    id: '', className: '', textContent: '', innerHTML: '', value: '',
    width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
    offsetWidth: 1280, offsetHeight: 720, scrollTop: 0, checked: false,
    _listeners: {}
  };
  el.appendChild = function (c) {
    if (!c) { return c; }
    if (c.parentNode) { c.parentNode.removeChild(c); }
    c.parentNode = el; el.children.push(c); el.childNodes.push(c); return c;
  };
  el.append = function () { for (var i = 0; i < arguments.length; i++) { el.appendChild(arguments[i]); } };
  el.removeChild = function (c) {
    var i = el.children.indexOf(c);
    if (i >= 0) { el.children.splice(i, 1); el.childNodes.splice(i, 1); c.parentNode = null; }
    return c;
  };
  el.remove = function () { if (el.parentNode) { el.parentNode.removeChild(el); } };
  el.insertBefore = function (c, ref) {
    var i = el.children.indexOf(ref);
    if (i < 0) { return el.appendChild(c); }
    el.children.splice(i, 0, c); el.childNodes.splice(i, 0, c); c.parentNode = el; return c;
  };
  el.replaceChildren = function () {
    el.children.length = 0; el.childNodes.length = 0;
    for (var i = 0; i < arguments.length; i++) { el.appendChild(arguments[i]); }
  };
  el.setAttribute = function (k, v) { el.attributes[k] = String(v); if (k === 'id') { el.id = String(v); } };
  el.getAttribute = function (k) { return el.attributes[k] === undefined ? null : el.attributes[k]; };
  el.removeAttribute = function (k) { delete el.attributes[k]; };
  el.hasAttribute = function (k) { return el.attributes[k] !== undefined; };
  el.addEventListener = function (t, fn) { (el._listeners[t] || (el._listeners[t] = [])).push(fn); };
  el.removeEventListener = function (t, fn) {
    var a = el._listeners[t]; if (!a) { return; }
    var i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1); }
  };
  el.dispatchEvent = function (ev) {
    ev = ev || {}; ev.target = ev.target || el; ev.currentTarget = el;
    ev.preventDefault = ev.preventDefault || function () {};
    ev.stopPropagation = ev.stopPropagation || function () {};
    var a = el._listeners[ev.type] || [];
    for (var i = 0; i < a.length; i++) { try { a[i](ev); } catch (e) { warnings.push('listener ' + ev.type + ': ' + e.message); } }
    return true;
  };
  el.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: el.clientWidth, bottom: el.clientHeight,
             width: el.clientWidth, height: el.clientHeight, x: 0, y: 0 };
  };
  el.querySelector = function (sel) { return queryIn(el, sel, true); };
  el.querySelectorAll = function (sel) { return queryIn(el, sel, false) || []; };
  el.closest = function () { return null; };
  el.focus = function () {}; el.blur = function () {}; el.click = function () { el.dispatchEvent({ type: 'click' }); };
  el.setPointerCapture = function () {}; el.releasePointerCapture = function () {};
  el.requestPointerLock = function () { doc.pointerLockElement = el; };
  el.requestFullscreen = function () { return Promise.resolve(); };
  el.getContext = function (kind, attrs) {
    if (kind === 'webgl2') { return makeGL(); }
    if (kind === 'webgl' || kind === 'experimental-webgl') { return makeGL(); }
    if (kind === '2d') { return make2D(); }
    return null;
  };
  el.toDataURL = function () { return 'data:image/png;base64,'; };
  el.play = function () { return Promise.resolve(); };
  allElements.push(el);
  return el;
}

function matches(el, sel) {
  sel = String(sel).trim();
  if (sel[0] === '#') { return el.id === sel.slice(1); }
  if (sel[0] === '.') { return el.classList.contains(sel.slice(1)) || (' ' + el.className + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0; }
  if (sel.indexOf('[') === 0) {
    var m = /^\[([^\]=]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel);
    if (m) { return m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2]; }
  }
  return el.tagName === sel.toUpperCase();
}
function queryIn(root, sel, single) {
  var parts = String(sel).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var out = [];
  (function walk(n) {
    for (var i = 0; i < n.children.length; i++) {
      var c = n.children[i];
      for (var p = 0; p < parts.length; p++) {
        var last = parts[p].split(/\s+/).pop();
        if (matches(c, last)) { out.push(c); break; }
      }
      walk(c);
    }
  })(root);
  return single ? (out[0] || null) : out;
}

/* --------------------------------------------------------------- WebGL -- */
var GL_CONSTANTS = {};
(function () {
  /* Enough real enum values that shader/state code behaves sanely. */
  var names = ['DEPTH_BUFFER_BIT:256','STENCIL_BUFFER_BIT:1024','COLOR_BUFFER_BIT:16384',
    'POINTS:0','LINES:1','TRIANGLES:4','TRIANGLE_STRIP:5','TRIANGLE_FAN:6',
    'ZERO:0','ONE:1','SRC_COLOR:768','ONE_MINUS_SRC_COLOR:769','SRC_ALPHA:770',
    'ONE_MINUS_SRC_ALPHA:771','DST_ALPHA:772','ONE_MINUS_DST_ALPHA:773','DST_COLOR:774',
    'FUNC_ADD:32774','BLEND:3042','DEPTH_TEST:2929','CULL_FACE:2884','SCISSOR_TEST:3089',
    'FRONT:1028','BACK:1029','FRONT_AND_BACK:1032','CW:2304','CCW:2305',
    'NEVER:512','LESS:513','EQUAL:514','LEQUAL:515','GREATER:516','GEQUAL:518','ALWAYS:519',
    'ARRAY_BUFFER:34962','ELEMENT_ARRAY_BUFFER:34963','UNIFORM_BUFFER:35345',
    'STATIC_DRAW:35044','DYNAMIC_DRAW:35048','STREAM_DRAW:35040',
    'BYTE:5120','UNSIGNED_BYTE:5121','SHORT:5122','UNSIGNED_SHORT:5123',
    'INT:5124','UNSIGNED_INT:5125','FLOAT:5126','HALF_FLOAT:5131',
    'TEXTURE_2D:3553','TEXTURE_2D_ARRAY:35866','TEXTURE_CUBE_MAP:34067','TEXTURE_3D:32879',
    'TEXTURE0:33984','TEXTURE_MIN_FILTER:10241','TEXTURE_MAG_FILTER:10240',
    'TEXTURE_WRAP_S:10242','TEXTURE_WRAP_T:10243','TEXTURE_WRAP_R:32882',
    'NEAREST:9728','LINEAR:9729','NEAREST_MIPMAP_NEAREST:9984','LINEAR_MIPMAP_NEAREST:9985',
    'NEAREST_MIPMAP_LINEAR:9986','LINEAR_MIPMAP_LINEAR:9987',
    'REPEAT:10497','CLAMP_TO_EDGE:33071','MIRRORED_REPEAT:33648',
    'RGB:6407','RGBA:6408','RED:6403','RG:33319','DEPTH_COMPONENT:6402',
    'RGBA8:32856','RGB8:32849','RGBA16F:34842','RGB16F:34843','RGBA32F:34836','R11F_G11F_B10F:35898',
    'RG16F:33327','R16F:33325','R8:33321','RG8:33323','SRGB8_ALPHA8:35907',
    'DEPTH_COMPONENT16:33189','DEPTH_COMPONENT24:33190','DEPTH_COMPONENT32F:36012',
    'DEPTH24_STENCIL8:35056','DEPTH_ATTACHMENT:36096','COLOR_ATTACHMENT0:36064',
    'FRAMEBUFFER:36160','RENDERBUFFER:36161','FRAMEBUFFER_COMPLETE:36053',
    'VERTEX_SHADER:35633','FRAGMENT_SHADER:35632','COMPILE_STATUS:35713','LINK_STATUS:35714',
    'ACTIVE_UNIFORMS:35718','ACTIVE_ATTRIBUTES:35721','MAX_TEXTURE_SIZE:3379',
    'MAX_TEXTURE_IMAGE_UNITS:34930','MAX_VERTEX_UNIFORM_VECTORS:36347',
    'MAX_UNIFORM_BLOCK_SIZE:35376','MAX_ARRAY_TEXTURE_LAYERS:35071',
    'MAX_SAMPLES:36183','MAX_RENDERBUFFER_SIZE:34024','MAX_VIEWPORT_DIMS:3386',
    'UNPACK_FLIP_Y_WEBGL:37440','UNPACK_ALIGNMENT:3317','NO_ERROR:0','INVALID_ENUM:1280',
    'VENDOR:7936','RENDERER:7937','VERSION:7938','SHADING_LANGUAGE_VERSION:35724',
    'READ_FRAMEBUFFER:36008','DRAW_FRAMEBUFFER:36009','COLOR_ATTACHMENT1:36065',
    'COLOR_ATTACHMENT2:36066','COLOR_ATTACHMENT3:36067','NONE:0','TEXTURE_COMPARE_MODE:34892',
    'TEXTURE_COMPARE_FUNC:34893','COMPARE_REF_TO_TEXTURE:34894','TEXTURE_BASE_LEVEL:33084',
    'TEXTURE_MAX_LEVEL:33085','POLYGON_OFFSET_FILL:32823','DEPTH_WRITEMASK:2930',
    'TEXTURE_CUBE_MAP_POSITIVE_X:34069','MAX_CUBE_MAP_TEXTURE_SIZE:34076',
    'MAX_COLOR_ATTACHMENTS:36063','MAX_DRAW_BUFFERS:34852','SAMPLES:32937','MAX_3D_TEXTURE_SIZE:32883'];
  names.forEach(function (s) { var p = s.split(':'); GL_CONSTANTS[p[0]] = parseInt(p[1], 10); });
})();

function makeGL() {
  var idc = 1;
  var gl = Object.create(null);
  Object.keys(GL_CONSTANTS).forEach(function (k) { gl[k] = GL_CONSTANTS[k]; });
  gl.canvas = { width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
                addEventListener: function () {} };
  gl.drawingBufferWidth = 1280; gl.drawingBufferHeight = 720;

  function obj(tag) { return { __gl: tag, id: idc++ }; }

  var makers = {
    createShader: 'shader', createProgram: 'program', createBuffer: 'buffer',
    createTexture: 'texture', createFramebuffer: 'fbo', createRenderbuffer: 'rbo',
    createVertexArray: 'vao', createSampler: 'sampler', createQuery: 'query',
    createTransformFeedback: 'tf', fenceSync: 'sync'
  };
  Object.keys(makers).forEach(function (fn) {
    gl[fn] = function () { glCalls++; return obj(makers[fn]); };
  });

  gl.getShaderParameter = function (s, p) { glCalls++; return p === GL_CONSTANTS.COMPILE_STATUS ? true : 0; };
  gl.getProgramParameter = function (pr, p) {
    glCalls++;
    if (p === GL_CONSTANTS.LINK_STATUS) { return true; }
    return 0;
  };
  gl.getShaderInfoLog = function () { return ''; };
  gl.getProgramInfoLog = function () { return ''; };
  gl.getUniformLocation = function (p, n) { glCalls++; return { __gl: 'uloc', name: n }; };
  gl.getAttribLocation = function (p, n) { glCalls++; return 0; };
  gl.getUniformBlockIndex = function () { glCalls++; return 0; };
  gl.getActiveUniform = function () { return { name: 'u', size: 1, type: GL_CONSTANTS.FLOAT }; };
  gl.getActiveAttrib = function () { return { name: 'a', size: 1, type: GL_CONSTANTS.FLOAT }; };
  gl.checkFramebufferStatus = function () { glCalls++; return GL_CONSTANTS.FRAMEBUFFER_COMPLETE; };
  gl.getError = function () { return 0; };
  gl.getParameter = function (p) {
    glCalls++;
    switch (p) {
      case GL_CONSTANTS.MAX_TEXTURE_SIZE: return 8192;
      case GL_CONSTANTS.MAX_CUBE_MAP_TEXTURE_SIZE: return 8192;
      case GL_CONSTANTS.MAX_3D_TEXTURE_SIZE: return 2048;
      case GL_CONSTANTS.MAX_ARRAY_TEXTURE_LAYERS: return 2048;
      case GL_CONSTANTS.MAX_TEXTURE_IMAGE_UNITS: return 16;
      case GL_CONSTANTS.MAX_VERTEX_UNIFORM_VECTORS: return 1024;
      case GL_CONSTANTS.MAX_UNIFORM_BLOCK_SIZE: return 65536;
      case GL_CONSTANTS.MAX_RENDERBUFFER_SIZE: return 8192;
      case GL_CONSTANTS.MAX_COLOR_ATTACHMENTS: return 8;
      case GL_CONSTANTS.MAX_DRAW_BUFFERS: return 8;
      case GL_CONSTANTS.MAX_SAMPLES: return 4;
      case GL_CONSTANTS.MAX_VIEWPORT_DIMS: return new Int32Array([16384, 16384]);
      case GL_CONSTANTS.VENDOR: return 'SmokeTest';
      case GL_CONSTANTS.RENDERER: return 'SmokeTest Mock GL';
      case GL_CONSTANTS.VERSION: return 'WebGL 2.0 (mock)';
      case GL_CONSTANTS.SHADING_LANGUAGE_VERSION: return 'WebGL GLSL ES 3.00 (mock)';
      default: return 1;
    }
  };
  gl.getExtension = function (name) {
    glCalls++;
    if (name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float' ||
        name === 'OES_texture_float_linear' || name === 'EXT_float_blend') { return {}; }
    if (name === 'EXT_texture_filter_anisotropic') {
      return { TEXTURE_MAX_ANISOTROPY_EXT: 34046, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047 };
    }
    if (name === 'WEBGL_debug_renderer_info') {
      return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
    }
    if (name === 'WEBGL_lose_context') { return { loseContext: function () {}, restoreContext: function () {} }; }
    return null;
  };
  gl.getSupportedExtensions = function () {
    return ['EXT_color_buffer_float', 'EXT_texture_filter_anisotropic', 'OES_texture_float_linear'];
  };
  gl.isContextLost = function () { return false; };

  /* Record shader sources so we can lint them separately. */
  gl.__shaderSources = [];
  gl.shaderSource = function (s, src) { glCalls++; gl.__shaderSources.push(src); s.__src = src; };

  /* Everything else becomes a counted no-op. */
  var noops = ['attachShader','bindAttribLocation','bindBuffer','bindBufferBase','bindBufferRange',
    'bindFramebuffer','bindRenderbuffer','bindSampler','bindTexture','bindVertexArray',
    'blendEquation','blendEquationSeparate','blendFunc','blendFuncSeparate','blitFramebuffer',
    'bufferData','bufferSubData','clear','clearColor','clearDepth','clearStencil','colorMask',
    'compileShader','copyTexImage2D','copyTexSubImage2D','cullFace','deleteBuffer','deleteFramebuffer',
    'deleteProgram','deleteRenderbuffer','deleteShader','deleteTexture','deleteVertexArray',
    'depthFunc','depthMask','depthRange','detachShader','disable','disableVertexAttribArray',
    'drawArrays','drawArraysInstanced','drawBuffers','drawElements','drawElementsInstanced',
    'enable','enableVertexAttribArray','finish','flush','framebufferRenderbuffer',
    'framebufferTexture2D','framebufferTextureLayer','frontFace','generateMipmap','hint',
    'invalidateFramebuffer','linkProgram','pixelStorei','polygonOffset','readBuffer','readPixels',
    'renderbufferStorage','renderbufferStorageMultisample','sampleCoverage','samplerParameteri',
    'scissor','stencilFunc','stencilMask','stencilOp','texImage2D','texImage3D','texParameterf',
    'texParameteri','texStorage2D','texStorage3D','texSubImage2D','texSubImage3D',
    'uniformBlockBinding','useProgram','validateProgram','vertexAttribDivisor','vertexAttribPointer',
    'vertexAttribIPointer','viewport','activeTexture','deleteSampler','clearBufferfv','clearBufferiv'];
  noops.forEach(function (fn) { gl[fn] = function () { glCalls++; }; });

  ['uniform1f','uniform1i','uniform1ui','uniform2f','uniform2i','uniform3f','uniform3i',
   'uniform4f','uniform4i','uniform1fv','uniform1iv','uniform2fv','uniform3fv','uniform4fv',
   'uniform2iv','uniform3iv','uniform4iv','uniformMatrix2fv','uniformMatrix3fv','uniformMatrix4fv'
  ].forEach(function (fn) {
    gl[fn] = function (loc) {
      glCalls++;
      if (loc === undefined) { glErrors.push(fn + ' called with undefined location'); }
      for (var i = 1; i < arguments.length; i++) {
        var v = arguments[i];
        if (typeof v === 'number' && !isFinite(v)) { glErrors.push(fn + ' got non-finite ' + v); }
        else if (v && v.length !== undefined && v.length < 64) {
          for (var j = 0; j < v.length; j++) {
            if (!isFinite(v[j])) { glErrors.push(fn + ' array[' + j + '] non-finite'); break; }
          }
        }
      }
    };
  });
  return gl;
}

/* -------------------------------------------------------------- 2D ctx -- */
function make2D() {
  var c = {};
  ['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo','rect','roundRect',
   'fill','stroke','fillRect','strokeRect','clearRect','fillText','strokeText','translate',
   'rotate','scale','transform','setTransform','resetTransform','clip','drawImage','putImageData',
   'quadraticCurveTo','bezierCurveTo','ellipse','setLineDash','createImageData'
  ].forEach(function (fn) { c[fn] = function () {}; });
  c.measureText = function (t) { return { width: String(t).length * 7, actualBoundingBoxAscent: 8 }; };
  c.getImageData = function (x, y, w, h) {
    return { width: w || 1, height: h || 1, data: new Uint8ClampedArray(Math.max(4, (w || 1) * (h || 1) * 4)) };
  };
  c.createLinearGradient = c.createRadialGradient = c.createConicGradient = function () {
    return { addColorStop: function () {} };
  };
  c.createPattern = function () { return {}; };
  c.canvas = { width: 512, height: 512 };
  return c;
}

/* --------------------------------------------------------------- Audio -- */
function makeAudioNode(extra) {
  var n = {
    connect: function (d) { return d; }, disconnect: function () {},
    start: function () {}, stop: function () {},
    gain: makeParam(1), frequency: makeParam(440), Q: makeParam(1),
    detune: makeParam(0), pan: makeParam(0), playbackRate: makeParam(1),
    positionX: makeParam(0), positionY: makeParam(0), positionZ: makeParam(0),
    orientationX: makeParam(0), orientationY: makeParam(0), orientationZ: makeParam(-1),
    threshold: makeParam(-24), knee: makeParam(30), ratio: makeParam(12),
    attack: makeParam(0.003), release: makeParam(0.25), delayTime: makeParam(0),
    type: 'sine', buffer: null, loop: false, curve: null, oversample: 'none',
    onended: null, normalize: true, distanceModel: 'inverse',
    refDistance: 1, maxDistance: 10000, rolloffFactor: 1,
    coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 0,
    setPosition: function () {}, setOrientation: function () {}
  };
  if (extra) { Object.keys(extra).forEach(function (k) { n[k] = extra[k]; }); }
  return n;
}
function makeParam(v) {
  return {
    value: v, defaultValue: v, minValue: -3.4e38, maxValue: 3.4e38,
    setValueAtTime: function () { return this; },
    linearRampToValueAtTime: function () { return this; },
    exponentialRampToValueAtTime: function () { return this; },
    setTargetAtTime: function () { return this; },
    setValueCurveAtTime: function () { return this; },
    cancelScheduledValues: function () { return this; },
    cancelAndHoldAtTime: function () { return this; }
  };
}
function AudioContextMock() {
  var self = this;
  this.state = 'running';
  this.sampleRate = 48000;
  this.currentTime = 0;
  this.destination = makeAudioNode({ maxChannelCount: 2 });
  this.listener = makeAudioNode({
    setPosition: function () {}, setOrientation: function () {},
    forwardX: makeParam(0), forwardY: makeParam(0), forwardZ: makeParam(-1),
    upX: makeParam(0), upY: makeParam(1), upZ: makeParam(0)
  });
  ['createGain','createOscillator','createBiquadFilter','createBufferSource','createPanner',
   'createStereoPanner','createConvolver','createDynamicsCompressor','createWaveShaper',
   'createDelay','createAnalyser','createChannelMerger','createChannelSplitter',
   'createConstantSource','createIIRFilter','createPeriodicWave'
  ].forEach(function (fn) { self[fn] = function () { return makeAudioNode(); }; });
  this.createBuffer = function (ch, len, sr) {
    var data = [];
    for (var i = 0; i < ch; i++) { data.push(new Float32Array(len)); }
    return {
      numberOfChannels: ch, length: len, sampleRate: sr || 48000,
      duration: len / (sr || 48000),
      getChannelData: function (i) { return data[i] || data[0]; },
      copyToChannel: function () {}, copyFromChannel: function () {}
    };
  };
  this.decodeAudioData = function () { return Promise.resolve(self.createBuffer(2, 1024, 48000)); };
  this.resume = function () { self.state = 'running'; return Promise.resolve(); };
  this.suspend = function () { self.state = 'suspended'; return Promise.resolve(); };
  this.close = function () { return Promise.resolve(); };
  this.audioWorklet = { addModule: function () { return Promise.resolve(); } };
}

/* -------------------------------------------------------------- window -- */
var doc = makeEl('#document');
doc.documentElement = makeEl('html');
doc.head = makeEl('head');
doc.body = makeEl('body');
doc.documentElement.appendChild(doc.head);
doc.documentElement.appendChild(doc.body);
doc.appendChild(doc.documentElement);
doc.readyState = 'complete';
doc.hidden = false;
doc.pointerLockElement = null;
doc.fullscreenElement = null;
doc.createElement = function (tag) { return makeEl(tag); };
doc.createElementNS = function (ns, tag) { return makeEl(tag); };
doc.createTextNode = function (t) { var e = makeEl('#text'); e.textContent = t; return e; };
doc.createDocumentFragment = function () { return makeEl('#fragment'); };
doc.getElementById = function (id) {
  for (var i = 0; i < allElements.length; i++) { if (allElements[i].id === id) { return allElements[i]; } }
  return null;
};
doc.exitPointerLock = function () { doc.pointerLockElement = null; };
doc.exitFullscreen = function () { return Promise.resolve(); };

/* the shell's markup */
var root = makeEl('div'); root.id = 'ip-root'; doc.body.appendChild(root);
var cvs = makeEl('canvas'); cvs.id = 'ip-canvas'; root.appendChild(cvs);
var uiEl = makeEl('div'); uiEl.id = 'ip-ui'; root.appendChild(uiEl);
var rot = makeEl('div'); rot.id = 'ip-rotate'; root.appendChild(rot);

var rafQueue = [];
var store = {};
var win = {
  document: doc,
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
  navigator: { userAgent: 'smoke', maxTouchPoints: 0, deviceMemory: 8,
               hardwareConcurrency: 8, vibrate: function () {},
               wakeLock: { request: function () { return Promise.resolve({ release: function () {} }); } },
               getGamepads: function () { return []; } },
  location: { href: 'about:blank', search: '', hash: '' },
  performance: { now: function () { return simTime; } },
  requestAnimationFrame: function (fn) { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: function () {},
  setTimeout: function (fn, ms) { return setTimeout(fn, Math.min(ms || 0, 1)); },
  clearTimeout: clearTimeout,
  setInterval: function () { return 0; },
  clearInterval: function () {},
  addEventListener: function (t, fn) { (win._l[t] || (win._l[t] = [])).push(fn); },
  removeEventListener: function () {},
  dispatchEvent: function (ev) {
    var a = win._l[ev.type] || [];
    for (var i = 0; i < a.length; i++) { try { a[i](ev); } catch (e) { warnings.push('win ' + ev.type + ': ' + e.message); } }
  },
  _l: {},
  matchMedia: function (q) {
    return { matches: false, media: q, addEventListener: function () {}, removeEventListener: function () {},
             addListener: function () {}, removeListener: function () {} };
  },
  getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
    key: function (i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; }
  },
  AudioContext: AudioContextMock,
  webkitAudioContext: AudioContextMock,
  Image: function () { return makeEl('img'); },
  Path2D: function () { return { addPath: function () {} }; },
  OffscreenCanvas: function (w, h) { var e = makeEl('canvas'); e.width = w; e.height = h; return e; },
  ImageData: function (w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
  screen: { width: 1280, height: 720, orientation: { type: 'landscape-primary', lock: function () { return Promise.resolve(); } } },
  isSecureContext: true,
  console: console
};
win.window = win;
win.self = win;
win.globalThis = win;
win.top = win;
win.parent = win;

var simTime = 0;

/* ----------------------------------------------------------------- run -- */
var sandbox = vm.createContext(win);
['Float32Array','Uint32Array','Uint16Array','Uint8Array','Uint8ClampedArray','Int32Array',
 'Int16Array','Int8Array','Float64Array','ArrayBuffer','DataView','Math','JSON','Date',
 'Promise','Map','Set','WeakMap','WeakSet','Symbol','Proxy','Reflect','Object','Array',
 'String','Number','Boolean','Error','TypeError','RangeError','RegExp','Function','parseInt',
 'parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','btoa','atob'
].forEach(function (k) { if (!(k in win) && typeof global[k] !== 'undefined') { win[k] = global[k]; } });
win.btoa = function (s) { return Buffer.from(String(s), 'binary').toString('base64'); };
win.atob = function (s) { return Buffer.from(String(s), 'base64').toString('binary'); };

var loaded = [], missing = [];
ORDER.forEach(function (f) {
  var p = path.join(SRC, f);
  if (!fs.existsSync(p)) { missing.push(f); return; }
  var code = fs.readFileSync(p, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: f });
    loaded.push(f);
  } catch (e) {
    console.error('\n  LOAD FAILED  ' + f + '\n  ' + e.message + '\n' +
                  (e.stack || '').split('\n').slice(1, 4).join('\n'));
    process.exitCode = 1;
  }
});

console.log('Loaded: ' + loaded.join(', '));
if (missing.length) { console.log('Missing: ' + missing.join(', ')); }

var IP = sandbox.IP;
if (!IP) { console.error('FATAL: IP namespace never appeared'); process.exit(1); }
console.log('Namespace: ' + Object.keys(IP).sort().join(' '));

/* drive DOMContentLoaded then pump frames */
var t0 = Date.now();
win.dispatchEvent({ type: 'DOMContentLoaded' });
doc.dispatchEvent({ type: 'DOMContentLoaded' });

function pump(n) {
  var i, q;
  for (i = 0; i < n; i++) {
    simTime += 16.667;
    q = rafQueue; rafQueue = [];
    if (!q.length && i > 2) { return i; }
    for (var j = 0; j < q.length; j++) {
      try { q[j](simTime); } catch (e) {
        warnings.push('frame ' + i + ': ' + e.message + ' | ' + (e.stack || '').split('\n')[1]);
        if (warnings.length > 25) { return i; }
      }
    }
  }
  return n;
}

/* let any deferred boot timers land first */
setTimeout(function () {
  var bootFrames = pump(3);
  if (FORCE_Q !== null && IP.Game && IP.Game.setQuality) { IP.Game.setQuality(FORCE_Q); }

  /* optional: populate the world so enemy rigs, AI and combat all get
     exercised through the real integration path */
  var si = process.argv.indexOf('--spawn');
  if (si >= 0 && IP.Game && IP.Game.S && IP.Systems && IP.Systems.EnemyAI) {
    var n = parseInt(process.argv[si + 1], 10) || 6;
    var S = IP.Game.S;
    var kinds = ['ganado', 'brute', 'shielder', 'spitter', 'crawler', 'soldier', 'boss'];
    for (var k = 0; k < n; k++) {
      try {
        var e = IP.Systems.EnemyAI.spawn(S, kinds[k % kinds.length],
          [S.player.pos[0] + 2 + k * 1.1, S.player.pos[1], S.player.pos[2] + (k % 3 - 1)], {});
        e.alert = 1; e.state = 'Chase';
      } catch (err) { warnings.push('spawn: ' + err.message); }
    }
    console.log('spawned ' + n + ' enemies');
  }

  var ran = pump(FRAMES);
  var ms = Date.now() - t0;

  console.log('\n--- RESULTS ---------------------------------------------');
  console.log('frames pumped      : ' + (ran + bootFrames));
  console.log('wall time          : ' + ms + ' ms');
  console.log('gl calls (total)   : ' + glCalls);
  console.log('elements created   : ' + allElements.length);
  if (IP.Game) {
    console.log('game.running       : ' + IP.Game.running);
    console.log('game.quality       : ' + IP.Game.quality);
    var S = IP.Game.S;
    if (S) {
      console.log('player pos         : ' + Array.prototype.slice.call(S.player.pos).map(function (v) { return v.toFixed(2); }).join(', '));
      console.log('player health      : ' + S.player.health);
      console.log('elena pos          : ' + (S.elena ? Array.prototype.slice.call(S.elena.pos).map(function (v) { return v.toFixed(2); }).join(', ') : 'n/a'));
      console.log('enemies            : ' + (S.enemies ? S.enemies.length : 0));
      console.log('section            : ' + S.section);
      var bad = [];
      ['pos'].forEach(function (k) {
        if (S.player[k]) { for (var i = 0; i < 3; i++) { if (!isFinite(S.player[k][i])) { bad.push('player.' + k); } } }
      });
      if (IP.Game.cam) {
        for (var i = 0; i < 3; i++) { if (!isFinite(IP.Game.cam.pos[i])) { bad.push('cam.pos'); } }
      }
      console.log('NaN check          : ' + (bad.length ? 'FAILED ' + bad.join(',') : 'clean'));
      if (bad.length) { process.exitCode = 1; }
    }
    console.log('scene items        : ' + (IP.Game.scene ? IP.Game.scene.items.length : 0));
    console.log('scene sprites      : ' + (IP.Game.scene ? IP.Game.scene.sprites.length : 0));
    console.log('scene lights       : ' + (IP.Game.scene ? IP.Game.scene.lights.length : 0));
    if (IP.Game.err && IP.Game.err.length) {
      console.log('\nengine notes (' + IP.Game.err.length + '):');
      IP.Game.err.slice(0, 20).forEach(function (e) { console.log('  ! ' + e); });
    }
  }
  if (IP.Renderer && IP.Renderer.stats) {
    console.log('renderer stats     : ' + JSON.stringify(IP.Renderer.stats));
  }
  if (glErrors.length) {
    console.log('\ngl argument errors (' + glErrors.length + '):');
    glErrors.slice(0, 12).forEach(function (e) { console.log('  ! ' + e); });
    process.exitCode = 1;
  }
  if (warnings.length) {
    console.log('\nRUNTIME ERRORS (' + warnings.length + '):');
    warnings.slice(0, 25).forEach(function (w) { console.log('  ! ' + w); });
    process.exitCode = 1;
  } else {
    console.log('\nNo runtime exceptions.');
  }
  console.log('---------------------------------------------------------');
}, 30);
