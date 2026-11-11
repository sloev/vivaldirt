// The artwork: a monumental concrete massing under a pale sky, ray-traced
// analytically in a WebGL2 fragment shader (boxes and one drum; exact cast
// shadows from the sun of the current moment).
//
// The score is part of the building: the current system is engraved on the
// south face of the main mass, the next one wraps around the corner, and
// the staff lines continue around every volume as formwork strata. Dither
// is used only where it means something: in penumbrae, in the perforated
// screens, where played bars dissolve and where staff lines fade. Every
// other surface is clean, continuous tone.
import { sceneAt, cameraPose, frame, project, N_BOX } from './scene.js';

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform vec3 uFrame;          // f, cx, cy (render px, y down)
uniform vec3 uBmin[${N_BOX}];
uniform vec3 uBmax[${N_BOX}];
uniform vec4 uBinfo[${N_BOX}]; // tone, perforated face (0 none, 1 south, 2 east), -, -
uniform vec4 uDrum;            // x, z, r, y0
uniform float uDrumY1;
uniform vec3 uL;               // towards the light
uniform vec4 uLight;           // sun, ambient, penumbra (rad), day
uniform vec4 uPerf;            // density, phase x, phase y, -
uniform vec4 uFrz;             // frieze on core south face: x0, x1, y0, y1 (world)
uniform float uFrzZ;           // z of that face
uniform float uCoreX1;         // east edge of the core (the next system wraps here)
uniform float uCoreZ1;
uniform vec4 uCrop0, uCrop1;   // page crops (u0, v0, u1, v1) of current / next system
uniform vec4 uCur;             // cursor u, bar u0, bar u1, visible
uniform vec4 uMisc;            // strata reach (m), notation strength, dot size (px), fade
uniform sampler2D uPage0, uPage1, uStaff;

const float INF = 1e9;
const vec3 C0 = vec3(0.090, 0.090, 0.082), C1 = vec3(0.145, 0.145, 0.133), C2 = vec3(0.467, 0.471, 0.451),
           C3 = vec3(0.780, 0.776, 0.749), C4 = vec3(0.918, 0.914, 0.890);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float bayer(vec2 q) { // 8×8 ordered threshold in (0,1)
  ivec2 p = ivec2(mod(q, 8.0));
  int m[64] = int[64](0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
                      3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21);
  return (float(m[p.y * 8 + p.x]) + 0.5) / 64.0;
}
vec3 ramp(float l) {
  l = clamp(l, 0.0, 1.0);
  if (l < 0.3) return mix(C0, C1, l / 0.3);
  if (l < 0.58) return mix(C1, C2, (l - 0.3) / 0.28);
  if (l < 0.82) return mix(C2, C3, (l - 0.58) / 0.24);
  return mix(C3, C4, (l - 0.82) / 0.18);
}
float quant(float l, float b) { // ordered dither onto the five palette levels
  float L[5] = float[5](0.0, 0.3, 0.58, 0.82, 1.0);
  for (int i = 0; i < 4; i++) {
    if (l <= L[i + 1]) { float f = (l - L[i]) / (L[i + 1] - L[i]); return f > b ? L[i + 1] : L[i]; }
  }
  return 1.0;
}

// --- intersections -----------------------------------------------------
bool hitBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float tn, out vec3 n) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tsm = min(t0, t1), tbg = max(t0, t1);
  tn = max(max(tsm.x, tsm.y), tsm.z);
  float tf = min(min(tbg.x, tbg.y), tbg.z);
  if (tf < max(tn, 0.0)) return false;
  n = tn == tsm.x ? vec3(-sign(rd.x), 0, 0) : tn == tsm.y ? vec3(0, -sign(rd.y), 0) : vec3(0, 0, -sign(rd.z));
  return tn > 0.0;
}
bool hitDrum(vec3 ro, vec3 rd, out float t, out vec3 n) {
  if (uDrum.z <= 0.0) return false;
  vec2 o = ro.xz - uDrum.xy, d = rd.xz;
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - uDrum.z * uDrum.z;
  float h = b * b - a * c;
  if (h < 0.0) return false;
  t = (-b - sqrt(h)) / a;
  float y = ro.y + rd.y * t;
  if (t > 0.0 && y > uDrum.w && y < uDrumY1) { vec2 q = (o + d * t) / uDrum.z; n = vec3(q.x, 0.0, q.y); return true; }
  // underside / top caps
  for (int k = 0; k < 2; k++) {
    float yc = k == 0 ? uDrum.w : uDrumY1;
    float tc = (yc - ro.y) / rd.y;
    vec2 q = o + d * tc;
    if (tc > 0.0 && dot(q, q) < uDrum.z * uDrum.z) { t = tc; n = vec3(0, k == 0 ? -1.0 : 1.0, 0); return true; }
  }
  return false;
}
// nearest surface: id 0..N_BOX-1 boxes, 50 drum, 99 ground, -1 sky
float trace(vec3 ro, vec3 rd, out vec3 n, out int id) {
  float best = INF; id = -1; n = vec3(0);
  for (int i = 0; i < ${N_BOX}; i++) {
    float t; vec3 nn;
    if (uBmax[i].y - uBmin[i].y < 1e-3) continue;
    if (hitBox(ro, rd, uBmin[i], uBmax[i], t, nn) && t < best) { best = t; n = nn; id = i; }
  }
  float td; vec3 nd;
  if (hitDrum(ro, rd, td, nd) && td < best) { best = td; n = nd; id = 50; }
  if (rd.y < 0.0) { float tg = -ro.y / rd.y; if (tg < best) { best = tg; n = vec3(0, 1, 0); id = 99; } }
  return best;
}
bool occluded(vec3 ro, vec3 rd) {
  for (int i = 0; i < ${N_BOX}; i++) {
    float t; vec3 nn;
    if (uBmax[i].y - uBmin[i].y < 1e-3) continue;
    if (hitBox(ro, rd, uBmin[i], uBmax[i], t, nn)) return true;
  }
  float td; vec3 nd;
  return hitDrum(ro, rd, td, nd);
}
float sunVisibility(vec3 p, vec3 n) {
  if (dot(n, uL) <= 0.0) return 0.0;
  vec3 t1 = normalize(cross(uL, vec3(0.0, 1.0, 0.0001)));
  vec3 t2 = cross(uL, t1);
  float v = 0.0;
  vec3 o = p + n * 0.02;
  // three taps across the sun's disc (widened by the music)
  vec2 taps[3] = vec2[3](vec2(0), vec2(1, 0.4), vec2(-1, -0.4));
  for (int k = 0; k < 3; k++) {
    vec3 d = normalize(uL + (t1 * taps[k].x + t2 * taps[k].y) * uLight.z);
    if (!occluded(o, d)) v += 1.0;
  }
  return v / 3.0;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 dot2 = floor(px / uMisc.z);
  float B = bayer(dot2);
  vec3 cdir = vec3((px.x - uFrame.y) / uFrame.x, -(px.y - uFrame.z) / uFrame.x, 1.0);
  vec3 rd = normalize(uCamR * cdir.x + uCamU * cdir.y + uCamF * cdir.z);
  vec3 n; int id;
  float t = trace(uCamPos, rd, n, id);

  // sky: paper, a breath lighter towards the zenith
  if (id < 0) {
    float l = 0.965 + 0.03 * clamp(rd.y * 2.0, 0.0, 1.0);
    outColor = vec4(ramp(l), 1.0);
    return;
  }
  vec3 p = uCamPos + rd * t;
  float dith = 0.0;      // how much of this pixel becomes ordered dither
  float vis = sunVisibility(p, n);
  float lambert = max(dot(n, uL), 0.0);
  float sky = uLight.y * (0.72 + 0.28 * n.y) + (abs(n.y) < 0.5 ? 0.1 : 0.0) + (n.y < -0.5 ? 0.14 : 0.0); // walls and undersides get light back from the plaza
  float albedo;
  if (id == 99) {
    // the plaza: light paving with fine joints that fade with distance
    albedo = 0.8;
    vec2 g = abs(fract(p.xz / 1.8) - 0.5);
    float w = fwidth(p.x) + fwidth(p.z);
    albedo -= 0.03 * (1.0 - smoothstep(0.0, w * 0.6 + 0.006, 0.5 - max(g.x, g.y))) * exp(-t * 0.03);
  } else if (id == 50) {
    albedo = 0.73;
  } else {
    albedo = uBinfo[id].x;
  }
  // board-marked concrete: horizontal strata and faint vertical weathering
  if (id != 99 && abs(n.y) < 0.5) {
    float strip = floor(p.y / 0.24);
    albedo += (hash(vec2(strip, float(id))) - 0.5) * 0.035;
    albedo -= 0.025 * smoothstep(0.55, 1.0, noise(vec2((p.x + p.z) * 2.3, p.y * 0.12)));
  }
  float lum = albedo * (uLight.x * lambert * vis + sky);
  // penumbra: the only place light itself is dithered
  float pen = vis * (1.0 - vis) * 4.0;
  dith = max(dith, smoothstep(0.05, 0.6, pen) * smoothstep(0.1, 0.3, lambert));

  // perforated screen: an architectural dither whose pattern follows the music
  if (id >= 0 && id < ${N_BOX}) {
    int pf = int(uBinfo[id].y + 0.5);
    vec2 uv = vec2(-1.0);
    if (pf == 1 && n.z < -0.5) uv = vec2(p.x, p.y);
    if (pf == 2 && n.x > 0.5) uv = vec2(p.z, p.y);
    if (uv.x > -1.0 && p.y > 1.4) {
      vec2 cell = floor(uv / 0.9);
      vec2 f = fract(uv / 0.9);
      float field = uPerf.x + 0.3 * (noise(cell * 0.18 + uPerf.yz) - 0.5);
      float open = step(bayer(cell + 3.0), field);
      float hole = step(abs(f.x - 0.5), 0.2) * step(abs(f.y - 0.5), 0.2) * open;
      lum = mix(lum, 0.05 + 0.04 * uLight.w, hole);
    }
  }

  // the score, engraved on the south face of the core
  float onCore = (id == 0) ? 1.0 : 0.0;
  bool south = onCore > 0.5 && n.z < -0.5;
  bool east = onCore > 0.5 && n.x > 0.5;
  float sh = vis * lambert; // how directly lit this point is
  if ((south || east) && p.y > uFrz.z && p.y < uFrz.w) {
    float v = (uFrz.w - p.y) / (uFrz.w - uFrz.z);
    float u; vec4 crop; bool cur = south;
    if (south) u = (p.x - uFrz.x) / (uFrz.y - uFrz.x);
    else u = (p.z - uFrzZ) / ((uFrz.y - uFrz.x) * 0.9); // the next system wraps around the corner
    if (u >= 0.0 && u <= 1.0) {
      float ink;
      if (cur) ink = 1.0 - texture(uPage0, mix(uCrop0.xy, uCrop0.zw, vec2(u, v))).r;
      else ink = 1.0 - texture(uPage1, mix(uCrop1.xy, uCrop1.zw, vec2(u, v))).r;
      ink = clamp(ink * 1.25, 0.0, 1.0) * uMisc.y * uMisc.w;
      if (!cur) ink *= 0.55 * (1.0 - smoothstep(0.35, 1.0, u)); // further away in the music: fainter
      // played bars dissolve into the dither; the far edges dissolve too
      float gone = cur ? smoothstep(0.0, 0.45, uCur.x - u - 0.02) * uCur.w : smoothstep(0.5, 1.0, u);
      gone = max(gone, 1.0 - smoothstep(0.0, 0.03, min(u, 1.0 - u)));
      if (gone > 0.0) { ink *= step(B, 1.0 - gone * 0.85); dith = max(dith, gone * 0.9); }
      // incised: dark in the light, catching light in shadow
      if (lum > 0.36) lum *= 1.0 - 0.62 * ink;
      else lum += 0.32 * ink;
      if (cur && uCur.w > 0.5 && u > uCur.y && u < uCur.z) lum += 0.035 * sh; // the bar being played
    }
  }
  // the playhead: an incision down the face from the score to the ground
  if (south && uCur.w > 0.5 && p.y < uFrz.w) {
    float x = mix(uFrz.x, uFrz.y, uCur.x);
    if (abs(p.x - x) < fwidth(p.x) * 0.75) lum = lum > 0.36 ? 0.06 : 0.85;
  }
  // staff lines become formwork lines around the whole building
  if (id != 99 && abs(n.y) < 0.5 && p.y > uFrz.z && p.y < uFrz.w) {
    float v = (uFrz.w - p.y) / (uFrz.w - uFrz.z);
    float st = 1.0 - texture(uStaff, vec2(0.5, v)).r;
    // distance along the building from the engraved system
    float d = south ? max(max(uFrz.x - p.x, p.x - uFrz.y), 0.0)
                    : east ? max(p.z - uFrzZ - (uFrz.y - uFrz.x) * 0.9, 0.0) + 0.0
                    : length(vec2(max(abs(p.x) - uFrz.y, 0.0), max(p.z - uFrzZ, 0.0))) + 2.0;
    bool inside = south && p.x >= uFrz.x && p.x <= uFrz.y;
    if (!inside) {
      float fade = exp(-d / uMisc.x);
      float line = st * fade * uMisc.w;
      lum = lum > 0.36 ? lum * (1.0 - 0.32 * line) : lum + 0.08 * line;
      dith = max(dith, st * fade * (1.0 - fade) * 3.0);
    }
  }
  // a little aerial perspective
  lum = mix(lum, 0.92, 1.0 - exp(-t * 0.0045));
  lum = clamp(lum, 0.0, 1.0);
  float q = quant(lum, B);
  outColor = vec4(ramp(mix(lum, q, clamp(dith, 0.0, 1.0))), 1.0);
}`;

export class Artwork {
  constructor(canvas) {
    this.canvas = canvas;
    this.music = null;
    this.rect = null;
    this.images = new Map();
    this.fade = 0;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = mq.matches;
    mq.addEventListener?.('change', (e) => { this.reduced = e.matches; this._dirty = true; });
    this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'default', preserveDrawingBuffer: true });
    if (this.gl) {
      try { this._init(); } catch (err) { console.warn('WebGL2 artwork unavailable:', err); this.gl = null; }
    }
    if (!this.gl) { this.ctx = canvas.getContext('2d'); canvas.classList.add('fallback'); }
    this._resize();
    addEventListener('resize', () => this._resize());
    this._last = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _init() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.texBlank = this._tex(1, 1, new Uint8Array([255]), false);
    this.tex = { page0: this.texBlank, page1: this.texBlank, staff: this.texBlank };
    this.keys = { page0: null, page1: null, staff: null };
    gl.uniform1i(this.u.uPage0, 0);
    gl.uniform1i(this.u.uPage1, 1);
    gl.uniform1i(this.u.uStaff, 2);
  }

  _tex(w, h, data, mip) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (data instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, data);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _resize() {
    const w = innerWidth;
    const h = innerHeight;
    // close to full resolution for clean surfaces, capped so phones stay
    // cool; lowered further if frames run long (see _loop)
    this.scale = Math.min(devicePixelRatio || 1, 1.5) * (this.quality ?? 1);
    this.canvas.width = Math.round(w * this.scale);
    this.canvas.height = Math.round(h * this.scale);
    this._dirty = true;
  }

  /** The audio fell behind: the music matters more than pixels. Render less. */
  degrade() {
    const now = performance.now();
    if (now - (this._degradedAt || 0) < 4000) return;
    this._degradedAt = now;
    this.quality = Math.max(0.4, (this.quality ?? 1) * 0.7);
    this.interval = Math.min(1000, (this.interval ?? 200) * 1.5);
    this._resize();
  }

  /** Where the massing may stand, in CSS px: [x0, y0, x1, y1]. */
  setFrame(rect) { this.rect = rect; this._dirty = true; }
  setMusic(m) { this.music = m; }

  /** Luminance (0..1) under a CSS-px rectangle of the last frame, for text colour. */
  sampleLuminance(r) {
    if (!this.gl || !this._lastFrame) return 0.9;
    const gl = this.gl;
    const s = this.scale;
    const W = this.canvas.width;
    const H = this.canvas.height;
    let sum = 0;
    let n = 0;
    const px = new Uint8Array(4);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const x = Math.min(W - 1, Math.max(0, Math.round((r.left + (r.width * (i + 0.5)) / 3) * s)));
        const y = Math.min(H - 1, Math.max(0, Math.round((r.top + (r.height * (j + 0.5)) / 2) * s)));
        gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        sum += px[0] / 255;
        n++;
      }
    }
    return sum / n;
  }

  _image(url) {
    let e = this.images.get(url);
    if (!e) {
      e = { img: new Image(), ready: false };
      e.img.decoding = 'async';
      e.img.onload = () => { e.ready = true; this._dirty = true; };
      e.img.src = url;
      this.images.set(url, e);
      if (this.images.size > 8) this.images.delete(this.images.keys().next().value);
    }
    return e;
  }

  _staff(img, v0, v1) {
    const H = Math.max(8, Math.round((v1 - v0) * img.naturalHeight));
    const W = 160;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, v0 * img.naturalHeight, img.naturalWidth, H, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const out = new Uint8Array(H);
    for (let y = 0; y < H; y++) {
      let dark = 0;
      for (let x = 0; x < W; x++) if (d[(y * W + x) * 4] < 128) dark++;
      out[y] = dark / W > 0.55 ? 0 : 255;
    }
    return { H, out };
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    // if the page is starved (long gaps between frames), the GPU is struggling:
    // render fewer pixels so the audio scheduler on this thread keeps up
    const gap = now - (this._raf || now);
    this._raf = now;
    this._jank = gap > 140 ? (this._jank || 0) + 1 : Math.max(0, (this._jank || 0) - 1);
    if (this._jank > 4 && (this.quality ?? 1) > 0.5) {
      this.quality = (this.quality ?? 1) * 0.8;
      this._jank = 0;
      this._resize();
    }
    if (!this.music || !this.rect) return;
    // the building changes over minutes; five frames a second keep it fluid
    const interval = this.reduced ? 30000 : this.interval ?? 200;
    if (now - this._last < interval && !this._dirty) return;
    const dt = this._last ? Math.min(now - this._last, 3000) : 16;
    this._last = now;
    this._dirty = false;
    try { this._frame(dt); } catch (err) { console.error(err); }
  }

  _frame(dt) {
    const m = this.music;
    const S = sceneAt({ ...m, reduced: this.reduced });
    const cam = cameraPose(S);
    const k = this.scale;
    const r = this.rect;
    const fr = frame(S, cam, [r[0] * k, r[1] * k, r[2] * k, r[3] * k], this.bleed ?? 0.15);
    // the frieze: 82 % of the core's south face, proportioned like the system
    const c = S.boxes[0];
    const faceW = c.max[0] - c.min[0];
    const sys = m.systems[0]?.system;
    const cropOf = (sys2) => {
      const v0 = sys2.top - 0.012;
      const v1 = sys2.bottom + 0.012;
      return { u0: sys2.bars[0] - 0.012, u1: sys2.bars.at(-1) + 0.006, v0, v1 };
    };
    let frz = null;
    if (sys) {
      const cr = cropOf(sys);
      const aspect = (cr.u1 - cr.u0) / ((cr.v1 - cr.v0) * m.pageAspect);
      const w = faceW * 0.82;
      const h = w / aspect;
      const yc = S.core.yF;
      frz = { x0: -w / 2 + (c.min[0] + c.max[0]) / 2, x1: w / 2 + (c.min[0] + c.max[0]) / 2, y0: yc - h / 2, y1: yc + h / 2, crop: cr };
    }
    // where the horizon falls on screen (CSS px), so inscriptions can stay above it
    const hz = project(cam, fr, [cam.pos[0] + cam.fwd[0] * 1e4, cam.pos[1], cam.pos[2] + cam.fwd[2] * 1e4]);
    this.horizon = hz[1] / k;
    this.lastCamera = { cam, fr, frz, scale: k };
    if (this.gl) this._drawGL(S, cam, fr, frz, m, dt);
    else this._draw2D(S, cam, fr, frz, m);
    this._lastFrame = true;
  }

  _textures(m, frz, dt) {
    const gl = this.gl;
    const want = [m.systems[0], m.systems[1]];
    let ready = true;
    want.forEach((sw, i) => {
      if (!sw) return;
      const e = this._image(sw.url);
      const key = `page${i}`;
      if (!e.ready) { if (i === 0) ready = false; return; }
      if (this.keys[key] !== sw.url) {
        if (this.tex[key] !== this.texBlank) gl.deleteTexture(this.tex[key]);
        this.tex[key] = this._tex(0, 0, e.img, true);
        this.keys[key] = sw.url;
      }
    });
    if (frz && this.keys.page0) {
      const skey = `${this.keys.page0}|${frz.crop.v0}`;
      if (this.keys.staff !== skey) {
        const { H, out } = this._staff(this._image(want[0].url).img, frz.crop.v0, frz.crop.v1);
        if (this.tex.staff !== this.texBlank) gl.deleteTexture(this.tex.staff);
        this.tex.staff = this._tex(1, H, out, false);
        this.keys.staff = skey;
        this.fade = Math.min(this.fade, 0);
      }
    }
    // a new system fades in over a few seconds
    this.fade = ready ? Math.min(1, this.fade + dt / (this.reduced ? 1 : 3500)) : 0;
  }

  _drawGL(S, cam, fr, frz, m, dt) {
    const gl = this.gl;
    const u = this.u;
    this._textures(m, frz, dt);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform3fv(u.uCamPos, cam.pos);
    gl.uniform3fv(u.uCamR, cam.right);
    gl.uniform3fv(u.uCamU, cam.up);
    gl.uniform3fv(u.uCamF, cam.fwd);
    gl.uniform3f(u.uFrame, fr.f, fr.cx, fr.cy);
    const bmin = new Float32Array(N_BOX * 3);
    const bmax = new Float32Array(N_BOX * 3);
    const binfo = new Float32Array(N_BOX * 4);
    S.boxes.forEach((b, i) => {
      bmin.set(b.min, i * 3);
      bmax.set(b.max, i * 3);
      binfo.set([b.tone, b.perf, 0, 0], i * 4);
    });
    gl.uniform3fv(u.uBmin, bmin);
    gl.uniform3fv(u.uBmax, bmax);
    gl.uniform4fv(u.uBinfo, binfo);
    gl.uniform4f(u.uDrum, S.drum.x, S.drum.z, S.drum.r, S.drum.y0);
    gl.uniform1f(u.uDrumY1, S.drum.y1);
    gl.uniform3fv(u.uL, S.light);
    gl.uniform4f(u.uLight, S.sun, S.ambient, S.penumbra, S.day);
    gl.uniform4f(u.uPerf, S.perfDensity, S.perfPhase[0], S.perfPhase[1], 0);
    const core = S.boxes[0];
    gl.uniform1f(u.uFrzZ, core.min[2]);
    gl.uniform1f(u.uCoreX1, core.max[0]);
    gl.uniform1f(u.uCoreZ1, core.max[2]);
    if (frz && this.keys.page0) {
      gl.uniform4f(u.uFrz, frz.x0, frz.x1, frz.y0, frz.y1);
      const c0 = frz.crop;
      gl.uniform4f(u.uCrop0, c0.u0, c0.v0, c0.u1, c0.v1);
      const s1 = m.systems[1]?.system;
      if (s1) {
        const v0 = s1.top - 0.012;
        gl.uniform4f(u.uCrop1, s1.bars[0] - 0.012, v0, s1.bars.at(-1) + 0.006, s1.bottom + 0.012);
      }
      const span = c0.u1 - c0.u0;
      const sys = m.systems[0].system;
      const cu = (m.cursorX - c0.u0) / span;
      gl.uniform4f(u.uCur, cu, (sys.bars[m.barIndex] - c0.u0) / span, (sys.bars[m.barIndex + 1] - c0.u0) / span, this.fade > 0.5 ? 1 : 0);
      this.playhead = [mix(frz.x0, frz.x1, cu), frz.y1, core.min[2]];
    } else {
      gl.uniform4f(u.uFrz, 0, 0, -10, -10);
      gl.uniform4f(u.uCur, 0, 0, 0, 0);
    }
    gl.uniform4f(u.uMisc, S.strataReach, S.notation, 2 * this.scale, this.fade);
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    bind(0, this.tex.page0);
    bind(1, this.tex.page1);
    bind(2, this.tex.staff);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Without WebGL2: the same massing as flat, sun-shaded faces.
  _draw2D(S, cam, fr, frz, m) {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.fillStyle = '#eae9e3';
    g.fillRect(0, 0, W, H);
    const faces = [];
    const add = (pts, n, tone) => {
      const toCam = (p) => [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
      const c = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      const v = toCam(c);
      if (v[0] * n[0] + v[1] * n[1] + v[2] * n[2] >= 0) return; // back-facing
      const lam = Math.max(0, n[0] * S.light[0] + n[1] * S.light[1] + n[2] * S.light[2]);
      const l = tone * (S.sun * lam + S.ambient * (0.55 + 0.45 * n[1]));
      faces.push({ d: Math.hypot(...v), pts: pts.map((p) => project(cam, fr, p)), l });
    };
    for (const b of S.boxes) {
      if (b.max[1] - b.min[1] < 1e-3) continue;
      const [x0, y0, z0] = b.min;
      const [x1, y1, z1] = b.max;
      add([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], b.tone);
      add([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0], b.tone);
      add([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], [-1, 0, 0], b.tone);
      add([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], b.tone);
      add([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], [0, -1, 0], b.tone);
    }
    faces.sort((a, b) => b.d - a.d);
    for (const f of faces) {
      const v = Math.round(Math.min(1, Math.max(0, f.l)) * 220 + 20);
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.beginPath();
      f.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
    }
    const e = m.systems[0] && this._image(m.systems[0].url);
    if (frz && e?.ready) {
      const z = S.boxes[0].min[2];
      const p0 = project(cam, fr, [frz.x0, frz.y1, z]);
      const p1 = project(cam, fr, [frz.x1, frz.y1, z]);
      const p3 = project(cam, fr, [frz.x0, frz.y0, z]);
      const iw = e.img.naturalWidth;
      const ih = e.img.naturalHeight;
      const c = frz.crop;
      const sw = (c.u1 - c.u0) * iw;
      const shh = (c.v1 - c.v0) * ih;
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.transform((p1[0] - p0[0]) / sw, (p1[1] - p0[1]) / sw, (p3[0] - p0[0]) / shh, (p3[1] - p0[1]) / shh, p0[0], p0[1]);
      g.drawImage(e.img, c.u0 * iw, c.v0 * ih, sw, shh, 0, 0, sw, shh);
      g.restore();
    }
  }
}

function mix(a, b, t) { return a + (b - a) * t; }
