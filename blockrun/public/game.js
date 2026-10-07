// Tweet Obby client - raw WebGL2, no dependencies.
(() => {
'use strict';

// ====================== math ======================
const M = {
  id() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, o = new Float32Array(16)) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = M.id();
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m;
  },
  look(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  inv(m) {
    const o = new Float32Array(16), a = m;
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4],
      b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6],
      b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12],
      b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return o;
  },
};
// transform builder (post-multiply chain): X().t(..).ry(..).s(..)
class X {
  constructor() { this.m = M.id(); this.tmp = new Float32Array(16); }
  reset() { const m = this.m; m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return this; }
  t(x, y, z) { const m = this.m; m[12] += m[0] * x + m[4] * y + m[8] * z; m[13] += m[1] * x + m[5] * y + m[9] * z; m[14] += m[2] * x + m[6] * y + m[10] * z; return this; }
  s(x, y, z) { const m = this.m; for (let i = 0; i < 3; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; } return this; }
  ry(a) { const c = Math.cos(a), s = Math.sin(a), m = this.m; for (let i = 0; i < 3; i++) { const x = m[i], z = m[8 + i]; m[i] = x * c - z * s; m[8 + i] = x * s + z * c; } return this; }
  rx(a) { const c = Math.cos(a), s = Math.sin(a), m = this.m; for (let i = 0; i < 3; i++) { const y = m[4 + i], z = m[8 + i]; m[4 + i] = y * c + z * s; m[8 + i] = -y * s + z * c; } return this; }
  rz(a) { const c = Math.cos(a), s = Math.sin(a), m = this.m; for (let i = 0; i < 3; i++) { const x = m[i], y = m[4 + i]; m[i] = x * c + y * s; m[4 + i] = -x * s + y * c; } return this; }
}
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

// ====================== WebGL setup ======================
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
if (!gl) { document.body.innerHTML = '<div style="padding:30px;font:800 18px Nunito,sans-serif;color:#fff">Your browser does not support WebGL2.</div>'; return; }

function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

const VS_INST = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN;
layout(location=2) in vec4 m0; layout(location=3) in vec4 m1; layout(location=4) in vec4 m2; layout(location=5) in vec4 m3;
layout(location=6) in vec4 aC;
uniform mat4 uVP; uniform mat4 uLVP;
out vec3 vW; out vec3 vN; out vec4 vC; out vec4 vL; out vec3 vLN;
void main(){
  mat4 m = mat4(m0,m1,m2,m3);
  vec4 w = m*vec4(aP,1.0);
  vW = w.xyz; vN = normalize(mat3(m)*aN); vLN = aN; vC = aC; vL = uLVP*w;
  gl_Position = uVP*w;
}`;
const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec4 vC; in vec4 vL; in vec3 vLN;
uniform sampler2DShadow uSh; uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uFog; uniform float uT;
out vec4 o;
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
float shadow(){
  vec3 p = vL.xyz/vL.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float s=0.0; vec2 ts=vec2(1.0/2048.0);
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) s+=texture(uSh, vec3(p.xy+vec2(x,y)*ts, p.z-0.0015));
  return s/9.0;
}
void main(){
  float mat = vC.a;
  vec3 n = normalize(vN);
  vec3 base = lin(vC.rgb);
  // world-space tile grid (studs feel)
  if(mat < 0.5 || (mat>2.5&&mat<3.5)){
    vec3 an = abs(n); vec2 uv = an.y>an.x&&an.y>an.z ? vW.xz : (an.x>an.z ? vW.zy : vW.xy);
    vec2 f = abs(fract(uv*0.5)-0.5);
    float g = smoothstep(0.455,0.5,max(f.x,f.y));
    base *= 1.0 - g*0.10;
    // top-face subtle bevel brightening
    base *= n.y>0.5 ? 1.04 : 1.0;
  }
  if(mat>4.5 && mat<5.5){ // cloud
    o = vec4(mix(vec3(1.0),uFog, clamp(length(vW-uCam)/900.0,0.0,0.6)),1.0); return;
  }
  vec3 L = -uSun;
  float sh = shadow();
  float dif = max(dot(n,L),0.0)*sh;
  vec3 hemi = mix(vec3(0.32,0.30,0.36), vec3(0.62,0.74,0.95), n.y*0.5+0.5);
  vec3 V = normalize(uCam-vW);
  vec3 H = normalize(L+V);
  float spec = pow(max(dot(n,H),0.0),48.0)*0.25*sh;
  float rim = pow(1.0-max(dot(n,V),0.0),3.0)*0.12;
  vec3 col = base*(hemi*0.62 + vec3(1.0,0.96,0.88)*dif*1.05) + spec + rim;
  if(mat>0.5 && mat<1.5){ // neon / kill
    float pu = 0.75+0.25*sin(uT*5.0 + vW.x*0.3+vW.z*0.3);
    col = base*(1.2+0.8*pu) + base*dif*0.2;
  }
  if(mat>1.5 && mat<2.5){ // checkpoint glow
    col += base*0.35*(0.6+0.4*sin(uT*3.0));
  }
  if(mat>3.5 && mat<4.5){ // lava
    float w = sin(vW.x*0.7+uT*2.0)*sin(vW.z*0.6-uT*1.6);
    col = mix(lin(vec3(1.0,0.25,0.05)), lin(vec3(1.0,0.75,0.1)), w*0.5+0.5)*1.3;
  }
  float d = length(vW-uCam);
  float fog = 1.0-exp(-pow(d/420.0,2.0));
  col = mix(col, lin(uFog), clamp(fog,0.0,1.0));
  o = vec4(pow(col,vec3(1.0/2.2)),1.0);
}`;
const FS_SHADOW = `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.0); }`;
const VS_SHADOW = VS_INST.replace('gl_Position = uVP*w;', 'gl_Position = uLVP*w;');
const VS_SKY = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
out vec2 vP; void main(){ vP=P[gl_VertexID]; gl_Position=vec4(vP,0.9999,1); }`;
const FS_SKY = `#version 300 es
precision highp float; in vec2 vP; uniform mat4 uInv; uniform vec3 uSun; uniform vec3 uFog; out vec4 o;
void main(){
  vec4 a=uInv*vec4(vP,-1,1), b=uInv*vec4(vP,1,1);
  vec3 d=normalize(b.xyz/b.w-a.xyz/a.w);
  float h=clamp(d.y,-1.0,1.0);
  vec3 top=vec3(0.16,0.42,0.92), mid=vec3(0.45,0.70,0.98);
  vec3 c = mix(uFog, mid, smoothstep(-0.05,0.25,h));
  c = mix(c, top, smoothstep(0.25,0.9,h));
  float s = max(dot(d,-uSun),0.0);
  c += vec3(1.0,0.9,0.7)*pow(s,600.0)*2.0 + vec3(1.0,0.85,0.6)*pow(s,12.0)*0.25;
  o=vec4(c,1);
}`;

const P_MAIN = prog(VS_INST, FS_MAIN);
const P_SHADOW = prog(VS_SHADOW, FS_SHADOW);
const P_SKY = prog(VS_SKY, FS_SKY);

// cube geometry
const cubeData = []; {
  const faces = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (const n of faces) {
    const [a, b] = n[1] ? [[1, 0, 0], [0, 0, 1]] : n[0] ? [[0, 1, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
    const s = n[0] + n[1] + n[2];
    const v = (u, w) => [0, 1, 2].map(i => n[i] * 0.5 + a[i] * u * 0.5 + b[i] * w * 0.5);
    let quad = [v(-1, -1), v(1, -1), v(1, 1), v(-1, -1), v(1, 1), v(-1, 1)];
    // ensure CCW from outside
    const e1 = quad[1].map((x, i) => x - quad[0][i]), e2 = quad[2].map((x, i) => x - quad[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) quad = [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]];
    void s;
    for (const p of quad) cubeData.push(...p, ...n);
  }
}
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeData), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
const ibo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
const STRIDE = 20; // 16 matrix + 4 color
for (let i = 0; i < 5; i++) {
  gl.enableVertexAttribArray(2 + i);
  gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
  gl.vertexAttribDivisor(2 + i, 1);
}
let inst = new Float32Array(STRIDE * 4096), instN = 0;
const xf = new X();
function push(m, c, mat) {
  if (instN * STRIDE + STRIDE > inst.length) { const n = new Float32Array(inst.length * 2); n.set(inst); inst = n; }
  const o = instN * STRIDE; inst.set(m, o); inst[o + 16] = c[0]; inst[o + 17] = c[1]; inst[o + 18] = c[2]; inst[o + 19] = mat; instN++;
}
function box(x, y, z, sx, sy, sz, c, mat = 0) { push(xf.reset().t(x, y, z).s(sx, sy, sz).m, c, mat); }

// shadow map
const SH = 2048;
const shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SH, SH);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
const shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shFB);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shTex, 0);
gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

const SUN = (() => { const v = [-0.45, -1, -0.35], l = Math.hypot(...v); return v.map(x => x / l); })();
const FOG = [0.78, 0.87, 0.98];

// ====================== level ======================
const C = {
  spawn: hex('#a3abb8'), spawnTrim: hex('#5b6577'), kill: hex('#ff2d3d'), cp: hex('#2ee66b'), gold: hex('#ffc933'),
  pal: ['#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#ec4899', '#eab308', '#6366f1', '#22c55e', '#06b6d4', '#f43f5e', '#8b5cf6', '#84cc16'].map(hex),
};
const solids = []; // {x,y,z,sx,sy,sz,c,mat, kill, move, blink, cp, finish, dx,dy,dz, on}
const spinners = [];
const deco = [];
const checkpoints = []; // stage -> spawn pos
const STAGES = 12;
function S(o) { o.dx = o.dy = o.dz = 0; o.on = true; o.bx = o.x; o.by = o.y; o.bz = o.z; solids.push(o); return o; }

function buildLevel() {
  // spawn
  S({ x: 0, y: -1, z: 0, sx: 34, sy: 2, sz: 34, c: C.spawn, mat: 3 });
  for (const [x, z, sx, sz] of [[0, 17.5, 35, 1], [0, -17.5, 35, 1], [17.5, 0, 1, 34], [-17.5, 0, 1, 34]]) deco.push({ x, y: -0.5, z, sx, sy: 3, sz, c: C.spawnTrim });
  S({ x: 0, y: -0.4, z: 12, sx: 10, sy: 1, sz: 6, c: C.cp, mat: 2, cp: 0 }).top = 0.1;
  checkpoints[0] = [0, 0.2, 0];
  // start arch
  deco.push({ x: -6, y: 5, z: 16, sx: 1.5, sy: 10, sz: 1.5, c: C.pal[0] }, { x: 6, y: 5, z: 16, sx: 1.5, sy: 10, sz: 1.5, c: C.pal[0] }, { x: 0, y: 10.5, z: 16, sx: 13.5, sy: 1.5, sz: 1.5, c: C.pal[5] });

  let z = 17, y = 0;
  const pad = (k, col) => {
    z += 5;
    S({ x: 0, y: y - 0.5, z: z + 4, sx: 12, sy: 1, sz: 8, c: col, mat: 0 });
    S({ x: 0, y: y + 0.1, z: z + 4, sx: 5, sy: 0.25, sz: 5, c: C.cp, mat: 2, cp: k });
    checkpoints[k] = [0, y + 0.3, z + 4];
    z += 8;
  };
  const types = ['stones', 'movers', 'pillars', 'lava', 'spinner', 'blink', 'rope', 'stones2', 'movers2', 'spinner2', 'blink2', 'tower'];
  for (let k = 1; k <= STAGES; k++) {
    const col = C.pal[(k - 1) % C.pal.length], col2 = C.pal[(k + 4) % C.pal.length];
    const t = types[k - 1];
    if (t === 'stones' || t === 'stones2') {
      const n = t === 'stones' ? 6 : 7, sz = t === 'stones' ? 4 : 3;
      for (let i = 0; i < n; i++) { z += sz + (t === 'stones' ? 4 : 5); y += 0.6; S({ x: Math.sin(i * 1.7) * 4, y: y - 0.5, z, sx: sz, sy: 1, sz, c: i % 2 ? col : col2 }); }
    } else if (t === 'movers' || t === 'movers2') {
      const n = t === 'movers' ? 4 : 5;
      for (let i = 0; i < n; i++) {
        z += 10; S({ x: 0, y: y - 0.5, z, sx: 6, sy: 1, sz: 6, c: i % 2 ? col : col2, move: { ax: t === 'movers2' && i % 2 ? 1 : 0, amp: 7, sp: t === 'movers' ? 1.1 : 1.5, ph: i * 1.3 } });
      }
      z += 2;
    } else if (t === 'pillars' || t === 'tower') {
      const n = t === 'pillars' ? 6 : 8;
      for (let i = 0; i < n; i++) {
        y += t === 'pillars' ? 2.2 : 2.6;
        const ang = i * (t === 'tower' ? 1.25 : 0.9);
        const px = t === 'tower' ? Math.cos(ang) * 6 : Math.sin(ang) * 5;
        z += t === 'tower' ? 3.5 : 6.5;
        const h = y + 30;
        S({ x: px, y: y - h / 2, z, sx: 3.2, sy: h, sz: 3.2, c: i % 2 ? col : col2 });
      }
    } else if (t === 'lava') {
      z += 4;
      S({ x: 0, y: y - 2, z: z + 18, sx: 18, sy: 1, sz: 36, c: C.kill, mat: 4, kill: true });
      const segs = [[-5, 0, 8, 1.6], [0, 6, 1.6, 10], [5, 12, 8, 1.6], [0, 18, 1.6, 10], [-4, 24, 6, 1.6], [3, 30, 1.6, 10]];
      for (const [x, dz, sx, szz] of segs) S({ x, y: y - 0.5, z: z + dz + (szz > 2 ? 0 : 0), sx, sy: 1, sz: szz, c: col });
      // stepping links
      S({ x: -8, y: y - 0.5, z: z + 3, sx: 2, sy: 1, sz: 6, c: col }); S({ x: 8, y: y - 0.5, z: z + 9, sx: 2, sy: 1, sz: 8, c: col });
      S({ x: -6, y: y - 0.5, z: z + 21, sx: 2, sy: 1, sz: 6, c: col });
      z += 34;
    } else if (t === 'spinner' || t === 'spinner2') {
      z += 12;
      S({ x: 0, y: y - 0.5, z, sx: 18, sy: 1, sz: 18, c: col });
      S({ x: 0, y: y + 0.8, z, sx: 2.4, sy: 2.6, sz: 2.4, c: hex('#334155') });
      spinners.push({ x: 0, y: y + 1.4, z, len: 17, sp: t === 'spinner' ? 1.5 : -2.3, a: 0 });
      z += 9;
    } else if (t === 'blink' || t === 'blink2') {
      const n = t === 'blink' ? 5 : 6;
      for (let i = 0; i < n; i++) { z += 9; S({ x: (i % 2 ? 2 : -2), y: y - 0.5, z, sx: 6, sy: 1, sz: 6, c: i % 2 ? col : col2, blink: { per: t === 'blink' ? 3.2 : 2.6, on: 0.62, ph: i * 0.45 } }); }
    } else if (t === 'rope') {
      const path = [[0, 0], [0, 10], [7, 10], [7, 20], [-6, 20], [-6, 30], [0, 30], [0, 34]];
      for (let i = 0; i < path.length - 1; i++) {
        const [x1, z1] = path[i], [x2, z2] = path[i + 1];
        S({ x: (x1 + x2) / 2, y: y - 0.5, z: z + 4 + (z1 + z2) / 2, sx: Math.abs(x2 - x1) + 1.3, sy: 1, sz: Math.abs(z2 - z1) + 1.3, c: i % 2 ? col : col2 });
      }
      z += 38;
    }
    if (k < STAGES) pad(k, col);
  }
  // finish
  z += 8;
  S({ x: 0, y: y - 1, z: z + 12, sx: 28, sy: 2, sz: 24, c: C.gold, mat: 0, finish: true });
  checkpoints[STAGES] = [0, y + 0.2, z + 12];
  S({ x: 0, y: y + 0.6, z: z + 18, sx: 6, sy: 1.2, sz: 6, c: hex('#e5e7eb') });
  deco.push({ x: 0, y: y + 3.2, z: z + 18, sx: 1.2, sy: 4, sz: 1.2, c: C.gold, mat: 1 }, { x: 0, y: y + 6, z: z + 18, sx: 3.6, sy: 2.4, sz: 3.6, c: C.gold, mat: 1 });
  deco.push({ x: -10, y: y + 6, z: z + 23, sx: 1.5, sy: 12, sz: 1.5, c: C.pal[4] }, { x: 10, y: y + 6, z: z + 23, sx: 1.5, sy: 12, sz: 1.5, c: C.pal[4] }, { x: 0, y: y + 12.5, z: z + 23, sx: 21.5, sy: 1.5, sz: 1.5, c: C.gold, mat: 1 });
  // clouds
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const cx = (rnd() - 0.5) * 700, cz = rnd() * 900 - 250, cy = -75 + rnd() * 45;
    const w = 20 + rnd() * 50;
    deco.push({ x: cx, y: cy, z: cz, sx: w, sy: 6 + rnd() * 6, sz: w * (0.5 + rnd() * 0.6), c: [1, 1, 1], mat: 5 });
    deco.push({ x: cx + w * 0.2, y: cy + 4, z: cz, sx: w * 0.5, sy: 6, sz: w * 0.4, c: [1, 1, 1], mat: 5 });
  }
}
buildLevel();

function updateWorld(t, dt) {
  for (const o of solids) {
    if (o.move) {
      const v = Math.sin(t * o.move.sp + o.move.ph) * o.move.amp;
      const nx = o.move.ax === 0 ? o.bx + v : o.bx, nz = o.move.ax === 1 ? o.bz + v : o.bz;
      o.dx = nx - o.x; o.dz = nz - o.z; o.x = nx; o.z = nz;
    }
    if (o.blink) {
      const ph = ((t / o.blink.per + o.blink.ph) % 1 + 1) % 1;
      o.on = ph < o.blink.on; o.warn = ph > o.blink.on - 0.22 && ph < o.blink.on; o.phase = ph;
    }
  }
  for (const s of spinners) s.a += s.sp * dt;
}

// ====================== avatar ======================
const EYE = hex('#111827'), SKIN = hex('#ffcc8a'), PANTS = hex('#1f2a44');
function drawAvatar(px, py, pz, yaw, color, anim, t, scale = 1) {
  const swing = anim.run * Math.sin(t * 11) * 0.9;
  const air = anim.air;
  const shirt = color;
  const part = (ox, oy, oz, rx, sx, sy, sz, c, pivot) => {
    xf.reset().t(px, py, pz).ry(yaw).s(scale, scale, scale).t(ox, oy, oz);
    if (rx) xf.rx(rx);
    xf.t(0, pivot ? -sy / 2 : 0, 0).s(sx, sy, sz);
    push(xf.m, c, 0);
  };
  part(-0.5, 2, 0, swing + air * 0.3, 0.96, 2, 1, PANTS, true);
  part(0.5, 2, 0, -swing + air * -0.4, 0.96, 2, 1, PANTS, true);
  part(0, 3, 0, 0, 2, 2, 1, shirt, false);
  part(-1.5, 4, 0, -swing * 0.9 - air * 2.6, 0.96, 2, 1, SKIN, true);
  part(1.5, 4, 0, swing * 0.9 - air * 2.6, 0.96, 2, 1, SKIN, true);
  part(0, 4.6, 0, 0, 1.25, 1.2, 1.2, SKIN, false);
  part(-0.25, 4.75, 0.6, 0, 0.18, 0.3, 0.05, EYE, false);
  part(0.25, 4.75, 0.6, 0, 0.18, 0.3, 0.05, EYE, false);
  part(0, 4.38, 0.6, 0, 0.5, 0.1, 0.05, EYE, false);
}

// ====================== state ======================
const me = {
  x: 0, y: 0.2, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, ground: false, stage: 0, maxStage: 0,
  run: 0, air: 0, dead: 0, color: '#3b82f6', name: '', started: false, t0: 0, won: false, coyote: 0, jumpBuf: 0, plat: null,
};
const cam = { yaw: Math.PI, pitch: 0.38, dist: 15, x: 0, y: 8, z: -15 };
let mode = 'menu'; // menu | play
const others = new Map(); // id -> {name,color,stage, x,y,z,r, tx..., anim}
const debris = [];
const confetti = [];
let myId = 0;

// ====================== input ======================
const keys = {};
const touchMove = { x: 0, y: 0 };
let jumpPressed = false;
const chatIn = document.getElementById('chatIn');
addEventListener('keydown', e => {
  if (document.activeElement === chatIn || document.activeElement === nameIn) return;
  if (mode === 'play' && e.key === 'Enter') { e.preventDefault(); chatIn.focus(); return; }
  if (mode === 'play' && e.key === '/') { e.preventDefault(); chatIn.focus(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') { jumpPressed = true; e.preventDefault(); }
  if (mode === 'play' && e.code === 'KeyR') kill();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
chatIn.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const v = chatIn.value.trim(); if (v) net.send({ t: 'chat', text: v }), localChat(v); chatIn.value = ''; chatIn.blur(); canvas.focus(); }
  if (e.key === 'Escape') chatIn.blur();
});

// camera drag (mouse + touch on canvas)
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); if (document.activeElement === chatIn) chatIn.blur(); audio.unlock(); });
canvas.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.005, -0.2, 1.3);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => drag = null); canvas.addEventListener('pointercancel', () => drag = null);
canvas.addEventListener('wheel', e => { cam.dist = clamp(cam.dist + e.deltaY * 0.02, 7, 30); e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// touch controls
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null;
stick.addEventListener('pointerdown', e => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.stopPropagation(); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
const endStick = () => { stickId = null; touchMove.x = touchMove.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
function moveStick(e) {
  const r = stick.getBoundingClientRect(); let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
  const l = Math.hypot(dx, dy), max = r.width / 2 - 10; if (l > max) { dx *= max / l; dy *= max / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; touchMove.x = dx / max; touchMove.y = dy / max;
}
const jumpBtn = document.getElementById('jumpBtn');
jumpBtn.addEventListener('pointerdown', e => { jumpPressed = true; keys.TouchJump = true; e.preventDefault(); audio.unlock(); });
jumpBtn.addEventListener('pointerup', () => keys.TouchJump = false); jumpBtn.addEventListener('pointercancel', () => keys.TouchJump = false);

// ====================== audio ======================
const audio = {
  ctx: null, on: true,
  unlock() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f1, f2, dur, type = 'square', vol = 0.06, delay = 0) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  jump() { this.tone(320, 640, 0.12, 'square', 0.035); },
  cp() { [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.08, i * 0.07)); },
  die() { this.tone(300, 60, 0.35, 'sawtooth', 0.06); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.09, i * 0.1)); },
  click() { this.tone(700, 900, 0.05, 'triangle', 0.04); },
};

// ====================== physics ======================
const HW = 0.8, HH = 5;
const GRAV = 85, JUMP = 27, SPEED = 16;
function overlap(o, x, y, z) {
  return Math.abs(x - o.x) < HW + o.sx / 2 && y < o.y + o.sy / 2 && y + HH > o.y - o.sy / 2 && Math.abs(z - o.z) < HW + o.sz / 2;
}
function stepPlayer(dt) {
  if (me.dead > 0) {
    me.dead -= dt;
    if (me.dead <= 0) respawn();
    return;
  }

  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchMove.x;
  let iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touchMove.y;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  // camera-relative: forward = from camera toward player
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx = -fz, rz = fx;
  const wx = (fx * iz + rx * ix), wz = (fz * iz + rz * ix);
  const acc = me.ground ? 14 : 6;
  me.vx = lerp(me.vx, wx * SPEED, 1 - Math.exp(-acc * dt));
  me.vz = lerp(me.vz, wz * SPEED, 1 - Math.exp(-acc * dt));
  if (il > 0.1) me.yaw = angLerp(me.yaw, Math.atan2(wx, wz), 1 - Math.exp(-14 * dt));

  me.coyote = me.ground ? 0.1 : me.coyote - dt;
  if (jumpPressed) me.jumpBuf = 0.12; else me.jumpBuf -= dt;
  jumpPressed = false;
  if (me.jumpBuf > 0 && me.coyote > 0) { me.vy = JUMP; me.coyote = 0; me.jumpBuf = 0; audio.jump(); }
  if (keys.TouchJump && me.ground) { me.vy = JUMP; audio.jump(); }
  if (!(keys.Space || keys.TouchJump) && me.vy > 8) me.vy -= GRAV * dt * 1.2; // short hop
  me.vy -= GRAV * dt; if (me.vy < -90) me.vy = -90;

  // axis-separated collision
  const act = solids.filter(o => o.on && !o.kill);
  me.x += me.vx * dt;
  for (const o of act) if (overlap(o, me.x, me.y, me.z)) {
    if (me.y >= o.y + o.sy / 2 - 0.6) { me.y = o.y + o.sy / 2; continue; } // step up small ledges
    me.x = me.x > o.x ? o.x + o.sx / 2 + HW : o.x - o.sx / 2 - HW; me.vx = 0;
  }
  me.z += me.vz * dt;
  for (const o of act) if (overlap(o, me.x, me.y, me.z)) {
    if (me.y >= o.y + o.sy / 2 - 0.6) { me.y = o.y + o.sy / 2; continue; }
    me.z = me.z > o.z ? o.z + o.sz / 2 + HW : o.z - o.sz / 2 - HW; me.vz = 0;
  }
  me.y += me.vy * dt;
  me.ground = false; me.plat = null;
  for (const o of act) if (overlap(o, me.x, me.y, me.z)) {
    if (me.vy <= 0) { me.y = o.y + o.sy / 2; me.ground = true; me.plat = o; }
    else me.y = o.y - o.sy / 2 - HH;
    me.vy = 0;
  }
  // standing check (for flat contact)
  if (!me.ground) for (const o of act) if (overlap(o, me.x, me.y - 0.05, me.z) && me.vy <= 0) { me.ground = true; me.plat = o; }

  // triggers
  for (const o of solids) {
    if (!o.on) continue;
    if (o.kill && overlap(o, me.x, me.y - 0.1, me.z)) return kill();
    if (o.cp !== undefined && overlap(o, me.x, me.y - 0.2, me.z)) reachStage(o.cp);
    if (o.finish && overlap(o, me.x, me.y - 0.2, me.z)) win();
  }
  for (const s of spinners) {
    if (me.y > s.y + 0.6 || me.y + HH < s.y - 0.6) continue;
    const dx = me.x - s.x, dz = me.z - s.z, c = Math.cos(-s.a), sn = Math.sin(-s.a);
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (Math.abs(lx) < s.len / 2 + HW * 0.8 && Math.abs(lz) < 0.6 + HW * 0.8) return kill();
  }
  if (me.y < -45) kill();

  if (!me.started && Math.hypot(me.x, me.z - 0) > 0.1 && (me.z > 15 || me.y > 1)) { me.started = true; me.t0 = performance.now(); }

  const sp = Math.hypot(me.vx, me.vz) / SPEED;
  me.run = lerp(me.run, me.ground ? sp : 0, 1 - Math.exp(-12 * dt));
  me.air = lerp(me.air, me.ground ? 0 : 1, 1 - Math.exp(-10 * dt));
}
function kill() {
  if (me.dead > 0 || mode !== 'play') return;
  me.dead = 1.3; audio.die();
  const col = hex(me.color);
  const parts = [[0, 2, 0, 1, 2, 1, PANTS], [0, 2, 0, 1, 2, 1, PANTS], [0, 3, 0, 2, 2, 1, col], [0, 4, 0, 1, 2, 1, SKIN], [0, 4, 0, 1, 2, 1, SKIN], [0, 4.6, 0, 1.25, 1.2, 1.2, SKIN]];
  for (const [ox, oy, oz, sx, sy, sz, c] of parts) debris.push({ x: me.x + ox + (Math.random() - .5), y: me.y + oy, z: me.z + oz, vx: (Math.random() - .5) * 16, vy: 8 + Math.random() * 14, vz: (Math.random() - .5) * 16, rx: 0, rz: 0, wr: (Math.random() - .5) * 12, sx, sy, sz, c, life: 1.3 });
}
function respawn() {
  const p = checkpoints[me.stage] || checkpoints[0];
  me.x = p[0]; me.y = p[1] + 0.2; me.z = p[2]; me.vx = me.vy = me.vz = 0; me.dead = 0; me.yaw = 0;
}
function reachStage(k) {
  if (k <= me.stage) { if (k !== me.stage) {} return; }
  me.stage = k; me.maxStage = Math.max(me.maxStage, k);
  toast(`STAGE ${k}!`); audio.cp();
  for (let i = 0; i < 26; i++) confetti.push(mkConf(me.x, me.y + 3, me.z, 10));
  updateStageUI();
}
function win() {
  if (me.won) return;
  me.won = true; me.stage = STAGES; updateStageUI();
  const t = fmt(performance.now() - me.t0);
  document.getElementById('winTime').textContent = `Your time: ${t}`;
  document.getElementById('win').classList.remove('hidden');
  audio.win(); net.send({ t: 'win', time: t });
  for (let i = 0; i < 160; i++) confetti.push(mkConf(me.x, me.y + 6, me.z, 22));
}
const CONF_COLS = ['#ff3b5c', '#ffcf33', '#4ade80', '#3b82f6', '#a855f7', '#f97316'].map(hex);
function mkConf(x, y, z, p) { return { x, y, z, vx: (Math.random() - .5) * p, vy: Math.random() * p, vz: (Math.random() - .5) * p, a: Math.random() * 6, w: (Math.random() - .5) * 15, c: CONF_COLS[Math.random() * 6 | 0], life: 2 + Math.random() }; }

// ====================== rendering ======================
let W = 1, H = 1;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = Math.floor(innerWidth * dpr); H = Math.floor(innerHeight * dpr);
  canvas.width = W; canvas.height = H;
}
addEventListener('resize', resize); resize();

function buildInstances(t) {
  instN = 0;
  for (const o of solids) {
    if (!o.on && o.blink) {
      continue;
    }
    let c = o.c;
    if (o.warn) { const f = Math.sin(t * 30) > 0 ? 1 : 0.55; c = [c[0] * f + (1 - f), c[1] * f + (1 - f), c[2] * f + (1 - f)]; }
    box(o.x, o.y, o.z, o.sx, o.sy, o.sz, c, o.mat || 0);
    // kill-brick glow trim / checkpoint flag
    if (o.cp !== undefined && o.cp > 0) {
      box(o.x + 3.2, o.y + 3, o.z, 0.25, 6, 0.25, [0.9, 0.9, 0.9], 0);
      box(o.x + 2.1, o.y + 5.2, o.z, 2, 1.3, 0.12, o.cp <= me.stage ? C.cp : [0.85, 0.85, 0.85], o.cp <= me.stage ? 2 : 0);
    }
  }
  for (const o of deco) box(o.x, o.y, o.z, o.sx, o.sy, o.sz, o.c, o.mat || 0);
  for (const s of spinners) push(xf.reset().t(s.x, s.y, s.z).ry(s.a).s(s.len, 0.9, 0.9).m, C.kill, 1);
  // players
  if (mode === 'play' && me.dead <= 0) drawAvatar(me.x, me.y, me.z, me.yaw, hex(me.color), me, t);
  for (const o of others.values()) if (o.vis) drawAvatar(o.x, o.y, o.z, o.r, o.col, o, t + o.id);
  for (const d of debris) push(xf.reset().t(d.x, d.y, d.z).rx(d.rx).rz(d.rz).s(d.sx, d.sy, d.sz).m, d.c, 0);
  for (const p of confetti) push(xf.reset().t(p.x, p.y, p.z).rx(p.a).ry(p.a * 0.7).s(0.35, 0.05, 0.22).m, p.c, 0);
}

function render(t) {
  // camera
  const tx = mode === 'play' ? me.x : 0, ty = mode === 'play' ? me.y + 4 : 3, tz = mode === 'play' ? me.z : 20;
  let eye;
  if (mode === 'menu') {
    const a = t * 0.06;
    const fz = 60 + Math.sin(t * 0.05) * 50;
    eye = [Math.sin(a) * 48, 26 + Math.sin(t * 0.13) * 6, fz - Math.cos(a) * 48];
    cam.x = fz;
    var target = [0, 6, fz];
  } else {
    const cp = Math.cos(cam.pitch);
    cam.x = lerp(cam.x, tx, 0.35); cam.y = lerp(cam.y, ty, 0.25); cam.z = lerp(cam.z, tz, 0.35);
    eye = [cam.x + Math.sin(cam.yaw) * cp * cam.dist, cam.y + Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * cp * cam.dist];
    target = [cam.x, cam.y, cam.z];
  }
  const proj = M.persp(70 * Math.PI / 180, W / H, 0.3, 1400);
  const view = M.look(eye, target, [0, 1, 0]);
  const vp = M.mul(proj, view);
  // light camera follows focus
  const f = mode === 'play' ? [me.x, me.y, me.z] : target;
  const lEye = [f[0] - SUN[0] * 80, f[1] - SUN[1] * 80, f[2] - SUN[2] * 80];
  const lvp = M.mul(M.ortho(-55, 55, -55, 55, 1, 200), M.look(lEye, f, [0, 1, 0]));

  buildInstances(t);
  gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, instN * STRIDE), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(vao);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);

  // shadow pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, shFB); gl.viewport(0, 0, SH, SH);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(P_SHADOW.p); gl.uniformMatrix4fv(P_SHADOW.u.uLVP, false, lvp);
  gl.cullFace(gl.FRONT);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, instN);
  gl.cullFace(gl.BACK);

  // main pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  gl.clearColor(...FOG, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(P_MAIN.p);
  gl.uniformMatrix4fv(P_MAIN.u.uVP, false, vp); gl.uniformMatrix4fv(P_MAIN.u.uLVP, false, lvp);
  gl.uniform3fv(P_MAIN.u.uSun, SUN); gl.uniform3fv(P_MAIN.u.uCam, eye); gl.uniform3fv(P_MAIN.u.uFog, FOG); gl.uniform1f(P_MAIN.u.uT, t);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(P_MAIN.u.uSh, 0);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, instN);

  // sky
  gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
  gl.useProgram(P_SKY.p);
  gl.uniformMatrix4fv(P_SKY.u.uInv, false, M.inv(vp)); gl.uniform3fv(P_SKY.u.uSun, SUN); gl.uniform3fv(P_SKY.u.uFog, FOG);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthFunc(gl.LESS);

  updateTags(vp);
}

// ====================== name tags ======================
const tagsEl = document.getElementById('tags');
const tagEls = new Map();
function updateTags(vp) {
  const seen = new Set();
  const list = mode === 'play' ? [...others.values()].filter(o => o.vis) : [];
  if (mode === 'play' && me.dead <= 0 && me.bubble) list.push({ id: 'me', x: me.x, y: me.y, z: me.z, name: '', bubble: me.bubble, bubbleT: me.bubbleT, self: true });
  for (const o of list) {
    const x = o.x, y = o.y + 6.2, z = o.z;
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    let el = tagEls.get(o.id);
    if (cw < 0.5 || cw > 220) { if (el) el.style.display = 'none'; seen.add(o.id); continue; }
    if (!el) { el = document.createElement('div'); el.className = 'ntag'; tagsEl.appendChild(el); tagEls.set(o.id, el); el._b = document.createElement('div'); el._b.className = 'bubble'; tagsEl.appendChild(el._b); }
    seen.add(o.id);
    const sx = (cx / cw * 0.5 + 0.5) * innerWidth, sy = (1 - (cy / cw * 0.5 + 0.5)) * innerHeight;
    el.style.display = o.self ? 'none' : ''; el.style.left = sx + 'px'; el.style.top = sy + 'px';
    const html = `${esc(o.name)}<small>Stage ${o.stage | 0}</small>`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    const showB = o.bubble && performance.now() - o.bubbleT < 6000;
    el._b.style.display = showB ? '' : 'none';
    if (showB) { if (el._b.textContent !== o.bubble) el._b.textContent = o.bubble; el._b.style.left = sx + 'px'; el._b.style.top = (sy - (o.self ? 0 : 34)) + 'px'; }
  }
  for (const [id, el] of tagEls) if (!seen.has(id)) { el._b.remove(); el.remove(); tagEls.delete(id); }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ====================== networking ======================
const net = {
  ws: null, open: false, room: null, last: 0, retry: 0,
  connect(room) {
    this.room = room;
    if (location.protocol === 'file:') return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${encodeURIComponent(room.id)}`;
    let ws; try { ws = new WebSocket(url); } catch { return; }
    this.ws = ws;
    ws.onopen = () => { this.open = true; this.retry = 0; this.send({ t: 'hi', name: me.name, color: me.color }); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
    ws.onclose = () => {
      this.open = false; this.ws = null;
      if (mode !== 'play' || this.closing) return;
      others.clear(); renderBoard();
      sysChat('Reconnecting…');
      setTimeout(() => mode === 'play' && this.connect(this.room), Math.min(8000, 1000 * ++this.retry));
    };
  },
  close() { this.closing = true; if (this.ws) this.ws.close(); this.ws = null; this.open = false; setTimeout(() => this.closing = false, 50); },
  send(m) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
  handle(m) {
    if (m.t === 'welcome') {
      myId = m.id; document.getElementById('roomName').textContent = m.room;
      others.clear(); for (const p of m.players) addOther(p);
      renderBoard();
    } else if (m.t === 'join') { addOther(m.p); sysChat(`${m.p.name} joined the game`); renderBoard(); }
    else if (m.t === 'leave') { const o = others.get(m.id); if (o) sysChat(`${o.name} left the game`); others.delete(m.id); renderBoard(); }
    else if (m.t === 'w') {
      for (const [id, x, y, z, r, a, st] of m.ps) {
        if (id === myId) continue; const o = others.get(id); if (!o) continue;
        o.tx = x; o.ty = y; o.tz = z; o.tr = r; o.ta = a; if (o.stage !== st) { o.stage = st; boardDirty = true; }
        if (!o.vis) { o.x = x; o.y = y; o.z = z; o.r = r; o.vis = true; }
      }
    } else if (m.t === 'chat') {
      if (m.id === myId) return;
      chatLine(m.name, m.color, m.text);
      const o = others.get(m.id); if (o) { o.bubble = m.text; o.bubbleT = performance.now(); }
    } else if (m.t === 'sys') sysChat(m.text);
    else if (m.t === 'full') sysChat('Server is full - try another one');
  },
};
function addOther(p) { others.set(p.id, { id: p.id, name: p.name, color: p.color, col: hex(p.color), stage: p.stage || 0, x: 0, y: -999, z: 0, r: 0, tx: 0, ty: 0, tz: 0, tr: 0, ta: 0, run: 0, air: 0, vis: false }); }
function updateOthers(dt) {
  const k = 1 - Math.exp(-14 * dt);
  for (const o of others.values()) {
    if (!o.vis) continue;
    const dx = o.tx - o.x, dz = o.tz - o.z;
    o.x += dx * k; o.y += (o.ty - o.y) * k; o.z += dz * k; o.r = angLerp(o.r, o.tr, k);
    const anim = o.ta | 0;
    o.run = lerp(o.run, anim === 1 ? 1 : 0, k); o.air = lerp(o.air, anim === 2 ? 1 : 0, k);
    if (anim === 3) o.vis = o.ty > -900; // dead
  }
}

// ====================== UI ======================
const $ = id => document.getElementById(id);
const nameIn = $('nameIn');
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#f8fafc', '#111827'];
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
me.color = store('br_color') || COLORS[Math.random() * COLORS.length | 0];
nameIn.value = store('br_name') || 'Player' + (1000 + Math.random() * 9000 | 0);
const sw = $('swatches');
for (const c of COLORS) {
  const d = document.createElement('div'); d.className = 'sw' + (c === me.color ? ' on' : ''); d.style.background = c;
  d.onclick = () => { me.color = c; store('br_color', c); sw.querySelectorAll('.sw').forEach(e => e.classList.toggle('on', e === d)); audio.unlock(); audio.click(); };
  sw.appendChild(d);
}

let servers = [], selected = null;
async function loadServers() {
  const box = $('servers');
  if (location.protocol === 'file:') { servers = [{ id: 'solo', name: 'Solo (offline)', players: 0, max: 1 }]; selected = servers[0]; renderServers(); return; }
  try {
    const t0 = performance.now();
    const r = await fetch('/api/servers', { cache: 'no-store' });
    const ping = Math.round(performance.now() - t0);
    const d = await r.json();
    servers = d.servers.map(s => ({ ...s, ping }));
    $('onlineCount').textContent = d.online;
    if (!selected || !servers.find(s => s.id === selected.id)) {
      // auto-pick fullest non-full server - more fun with people
      selected = [...servers].filter(s => s.players < s.max).sort((a, b) => b.players - a.players)[0] || servers[0];
    } else selected = servers.find(s => s.id === selected.id);
    renderServers();
  } catch {
    servers = [{ id: 'solo', name: 'Solo (servers offline)', players: 0, max: 1, ping: 0 }]; selected = servers[0];
    $('onlineCount').textContent = '0'; renderServers();
  }
}
function renderServers() {
  const box = $('servers'); box.innerHTML = '';
  for (const s of servers) {
    const el = document.createElement('div'); el.className = 'srv' + (s === selected ? ' on' : '');
    const pct = s.max ? s.players / s.max * 100 : 0;
    el.innerHTML = `<span class="n">${esc(s.name)}</span><span class="meter"><i style="width:${pct}%;background:${pct > 85 ? '#f97316' : '#4ade80'}"></i></span><span class="cap">${s.players}/${s.max}</span><span class="ping">${s.ping ? s.ping + 'ms' : ''}</span>`;
    el.onclick = () => { selected = s; renderServers(); audio.unlock(); audio.click(); };
    el.ondblclick = () => { selected = s; start(); };
    box.appendChild(el);
  }
}
$('refresh').onclick = () => { audio.unlock(); audio.click(); loadServers(); };
loadServers();
const srvTimer = setInterval(() => mode === 'menu' && loadServers(), 5000);

function start() {
  audio.unlock(); audio.click();
  me.name = (nameIn.value.trim() || 'Player').slice(0, 16); store('br_name', me.name);
  $('menu').classList.add('hidden'); $('loading').classList.remove('hidden');
  $('loadText').textContent = selected && selected.id !== 'solo' ? `Joining ${selected.name}…` : 'Loading…';
  setTimeout(() => {
    $('loading').classList.add('hidden'); $('hud').classList.remove('hidden');
    mode = 'play';
    me.stage = 0; me.won = false; me.started = false; me.dead = 0; respawn();
    cam.yaw = Math.PI; cam.x = me.x; cam.y = me.y + 4; cam.z = me.z;
    $('win').classList.add('hidden'); $('chatLog').innerHTML = ''; updateStageUI();
    if (selected && selected.id !== 'solo') net.connect(selected); else $('roomName').textContent = 'Solo';
    sysChat('Welcome to Starmex\'s Obby! Reach the golden platform.');
    renderBoard(); canvas.focus();
  }, 650);
}
$('playBtn').onclick = start;
nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
$('menuBtn').onclick = () => {
  net.close(); others.clear(); mode = 'menu';
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); loadServers();
};
$('againBtn').onclick = () => {
  me.stage = 0; me.won = false; me.started = false; respawn(); updateStageUI();
  $('win').classList.add('hidden');
};

function updateStageUI() {
  $('stageLbl').textContent = me.won ? 'FINISHED' : `STAGE ${me.stage}`;
  document.querySelector('#topbar .sub').style.display = me.won ? 'none' : '';
  $('stageBar').style.width = (me.stage / STAGES * 100) + '%';
  boardDirty = true;
}
let toastT;
function toast(s) { const el = $('toast'); el.textContent = s; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1300); }
function chatLine(name, color, text) {
  const d = document.createElement('div'); d.className = 'cm';
  d.innerHTML = `<b style="color:${/^#[0-9a-f]{6}$/i.test(color) ? color : '#fff'}">${esc(name)}:</b> ${esc(text)}`;
  const log = $('chatLog'); log.appendChild(d); while (log.children.length > 8) log.firstChild.remove();
}
function sysChat(text) { const d = document.createElement('div'); d.className = 'cm sys'; d.textContent = text; const log = $('chatLog'); log.appendChild(d); while (log.children.length > 8) log.firstChild.remove(); }
function localChat(text) { chatLine(me.name, me.color, text); me.bubble = text; me.bubbleT = performance.now(); }
let boardDirty = true;
function renderBoard() {
  boardDirty = false;
  const list = [{ id: 'me', name: me.name, stage: me.stage, me: true }, ...others.values()].sort((a, b) => b.stage - a.stage);
  $('boardCount').textContent = `${list.length} online`;
  $('boardList').innerHTML = list.slice(0, 12).map(p => `<div class="br${p.me ? ' me' : ''}"><span class="nm">${esc(p.name)}</span><span class="s">${p.stage === STAGES ? '🏆' : p.stage}</span></div>`).join('');
}
const fmt = ms => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

// ====================== loop ======================
let last = performance.now(), sendT = 0, acc = 0;
const t0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05); last = now;
  const t = (now - t0) / 1000;
  updateWorld(t, dt);
  if (mode === 'play') {
    // fixed substeps for stable collisions
    if (me.plat && me.plat.on && me.dead <= 0) { me.x += me.plat.dx; me.z += me.plat.dz; }
    acc += dt; let n = 0;
    while (acc >= 1 / 120 && n < 8) { stepPlayer(1 / 120); acc -= 1 / 120; n++; }
    updateOthers(dt);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = 1 / 15;
      const a = me.dead > 0 ? 3 : !me.ground ? 2 : me.run > 0.3 ? 1 : 0;
      net.send({ t: 's', s: [me.x, me.dead > 0 ? -999 : me.y, me.z, me.yaw, a, me.stage] });
    }
    $('timer').textContent = me.started ? fmt((me.won ? me.wonAt || (me.wonAt = performance.now()) : performance.now()) - me.t0) : '0:00.0';
    if (!me.won) me.wonAt = 0;
    if (boardDirty) renderBoard();
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.vy -= GRAV * 0.6 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wr * dt; d.rz += d.wr * 0.7 * dt;
    if ((d.life -= dt) <= 0) debris.splice(i, 1);
  }
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i]; p.vy -= 18 * dt; p.vx *= 0.98; p.vz *= 0.98; if (p.vy < -6) p.vy = -6;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.a += p.w * dt;
    if ((p.life -= dt) <= 0) confetti.splice(i, 1);
  }
  render(t);
}
requestAnimationFrame(frame);

// for screenshots / debugging
window.__br = { me, cam, start, solids, checkpoints, others, addOther, get mode() { return mode; }, setMode(m) { mode = m; } };
})();
