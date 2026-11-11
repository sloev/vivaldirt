// The artwork: one continuous dithered field in which concrete architecture
// and the actual engraved score are the same material.
//
// WebGL1 fragment shader, rendered at "dither-dot" resolution and scaled up
// with nearest-neighbour sampling, so every dot of the ordered dither is a
// crisp square on any screen density. A Canvas 2D fallback draws the same
// composition without the dither.
import { compose, squareToQuad, invert3, apply3 } from './composition.js';

const MAX_FACES = 12;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uA;
uniform vec4 uQ[${MAX_FACES * 2}];
uniform vec4 uF[${MAX_FACES}];
uniform int uN;
uniform mat3 uH0;
uniform mat3 uH1;
uniform vec4 uCrop0;
uniform vec4 uCrop1;
uniform vec4 uRP0;   // depth, opacity, bend, phase
uniform vec4 uRP1;
uniform vec4 uTex;   // texel size of page 0 (xy) and page 1 (zw)
uniform vec4 uCur;   // cursor u, bar u0, bar u1, on
uniform vec4 uHair;  // x, y0, y1, on
uniform vec4 uBeam;  // x, angle, width, strength
uniform vec4 uTone;  // exposure, contrast, texture, grain
uniform vec2 uDrift;
uniform vec4 uZone[8];
uniform float uWash;
uniform float uPx;   // size of one dot in p units
uniform sampler2D uPage0;
uniform sampler2D uPage1;
uniform sampler2D uStaff0;
uniform sampler2D uStaff1;
uniform sampler2D uBayer;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
bool inQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  float s1 = cross2(b - a, p - a), s2 = cross2(c - b, p - b);
  float s3 = cross2(d - c, p - c), s4 = cross2(a - d, p - d);
  return (s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0 && s4 >= 0.0) || (s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0 && s4 <= 0.0);
}

// ink of an engraved page at tc (0 = paper, 1 = ink); 4 taps against aliasing
float pageInk(sampler2D tex, vec2 tc, vec2 texel) {
  vec2 o = texel * 0.6;
  float w = texture2D(tex, tc + vec2(-o.x, -o.y)).r + texture2D(tex, tc + vec2(o.x, -o.y)).r
          + texture2D(tex, tc + vec2(-o.x, o.y)).r + texture2D(tex, tc + vec2(o.x, o.y)).r;
  return clamp(1.0 - w * 0.25, 0.0, 1.0) * 1.15;
}

// A system of the score mounted on a plane: inside the system the real
// engraving; beyond it the staff lines continue as perspective lines and
// dissolve into the field.
void ribbon(inout float lum, vec2 p, mat3 H, vec4 crop, vec4 rp, vec2 texel,
            sampler2D page, sampler2D staff, float topDepth, bool isMain) {
  vec3 w = H * vec3(p, 1.0);
  if (w.z <= 0.0 || rp.y <= 0.0) return;
  vec2 q = w.xy / w.z;
  q.y += rp.z * sin(q.x * 3.14159 + rp.w);
  if (q.y < -0.25 || q.y > 1.25) return;
  float vis = rp.y * (rp.x > topDepth ? 1.0 : 0.17);
  float ink = 0.0;
  bool inside = q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0;
  if (inside) {
    ink = pageInk(page, mix(crop.xy, crop.zw, q), texel);
  } else if (q.y >= 0.0 && q.y <= 1.0) {
    float d = q.x < 0.0 ? -q.x : q.x - 1.0;
    float st = 1.0 - texture2D(staff, vec2(0.5, q.y)).r;
    // the lines break up into the ordered pattern as they recede
    ink = st * exp(-d * 1.6) * (0.55 + 0.45 * step(0.35, noise(p * 90.0 + d * 7.0)));
  }
  if (isMain && uCur.w > 0.5 && q.y > -0.08 && q.y < 1.08) {
    // light falls on the bar being played; the playhead is cut into it
    if (q.x > uCur.y && q.x < uCur.z && q.y > 0.0 && q.y < 1.0) lum += 0.07;
    // half a dot either side of the playhead, measured in ribbon units
    float cw = 0.55 * uPx * abs(H[0][0] - q.x * H[0][2]) / w.z;
    if (abs(q.x - uCur.x) < cw) { lum = lum < 0.42 ? 0.95 : 0.03; return; }
  }
  ink *= vis;
  if (lum > 0.42) lum = mix(lum, 0.04, clamp(ink, 0.0, 1.0));
  else lum = mix(lum, min(lum + 0.5, 0.92), clamp(ink * 0.85, 0.0, 1.0)); // notes emerging from shadow
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = frag / uRes.y;

  // the void: paper-coloured light, slightly darker towards the ground
  float lum = 0.9 - 0.08 * smoothstep(0.2, 1.1, p.y) + 0.03 * (fbm(p * 2.0 + uDrift * 0.2) - 0.5);
  float topDepth = -1.0;
  float onFace = 0.0;
  for (int i = 0; i < ${MAX_FACES}; i++) {
    if (i >= uN) break;
    vec4 ab = uQ[i * 2];
    vec4 cd = uQ[i * 2 + 1];
    if (inQuad(p, ab.xy, ab.zw, cd.xy, cd.zw)) {
      vec4 f = uF[i];
      vec2 c = (ab.xy + ab.zw + cd.xy + cd.zw) * 0.25;
      lum = f.x + dot(p - c, f.yz);
      topDepth = f.w;
      onFace = 1.0;
    }
  }

  // concrete: large tonal clouds, form-tie pores, fine aggregate
  float tex = uTone.z * (0.4 + 0.6 * onFace);
  lum += (fbm(p * 7.0 + uDrift) - 0.5) * 0.16 * tex;
  lum += (noise(p * 160.0 + uDrift * 3.0) - 0.5) * 0.07 * tex;
  float pore = step(0.9935, hash(floor(p * 260.0)));
  lum -= pore * 0.35 * onFace;

  // a shaft of light from a skylight
  vec2 bd = vec2(cos(uBeam.y), sin(uBeam.y));
  float bdist = abs(cross2(bd, p - vec2(uBeam.x, 0.0)));
  lum += uBeam.w * smoothstep(uBeam.z, 0.0, bdist);

  ribbon(lum, p, uH1, uCrop1, uRP1, uTex.zw, uPage1, uStaff1, topDepth, false);
  ribbon(lum, p, uH0, uCrop0, uRP0, uTex.xy, uPage0, uStaff0, topDepth, true);

  // the playhead continues as a hairline down to the ground
  if (uHair.w > 0.5 && p.y > uHair.y && p.y < uHair.z && abs(p.x - uHair.x) < uPx * 0.5) lum = lum < 0.42 ? 0.95 : 0.04;

  // pools of light where the typography sits (soft, elliptical: light, not cards)
  float m = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 z = uZone[i];
    vec2 c = (z.xy + z.zw) * 0.5;
    vec2 hs = max((z.zw - z.xy) * 0.5, vec2(1e-3));
    vec2 d = (p - c) / (hs + 0.035);
    m = max(m, 1.0 - smoothstep(0.75, 1.35, length(d * vec2(0.85, 1.0))));
  }
  lum = mix(lum, lum + (0.9 - lum) * 0.8, m * uWash * step(lum, 0.9));

  // tone, grain, then ordered dither into the palette
  lum = (lum - 0.5) * uTone.y + 0.5 + uTone.x;
  lum += (hash(floor(frag)) - 0.5) * uTone.w;
  lum = clamp(lum, 0.0, 1.0);
  float b = texture2D(uBayer, frag / 8.0).r;
  vec3 c0 = vec3(0.090, 0.090, 0.082);
  vec3 c1 = vec3(0.467, 0.471, 0.451);
  vec3 c2 = vec3(0.780, 0.776, 0.749);
  vec3 c3 = vec3(0.918, 0.914, 0.890);
  vec3 col;
  if (lum < 0.467) col = ((lum - 0.09) / 0.377 > b) ? c1 : c0;
  else if (lum < 0.78) col = ((lum - 0.467) / 0.313 > b) ? c2 : c1;
  else col = ((lum - 0.78) / 0.138 > b) ? c3 : c2;
  gl_FragColor = vec4(col, 1.0);
}
`;

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

export class Artwork {
  constructor(canvas, { base }) {
    this.canvas = canvas;
    this.base = base;
    this.music = null;
    this.zones = [];
    this.images = new Map();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { this.reduced = e.matches; });
    this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (this.gl) {
      try {
        this._initGL();
      } catch (err) {
        console.warn('WebGL artwork unavailable, using 2D fallback:', err);
        this.gl = null;
      }
    }
    if (!this.gl) {
      this.ctx = canvas.getContext('2d');
      canvas.classList.add('fallback');
    }
    this.ribbonState = [{ key: null, fade: 0 }, { key: null, fade: 0 }];
    this._resize();
    addEventListener('resize', () => this._resize());
    this._last = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // --- setup -----------------------------------------------------------
  _initGL() {
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
    this.prog = prog;
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
      const name = info.name.replace(/\[0\]$/, '');
      this.u[name] = gl.getUniformLocation(prog, info.name);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const bayer = new Uint8Array(BAYER8.map((v) => Math.round(((v + 0.5) / 64) * 255)));
    this.texBayer = this._tex(8, 8, bayer, gl.NEAREST, gl.REPEAT);
    const white = new Uint8Array([255]);
    this.texBlank = this._tex(1, 1, white, gl.NEAREST, gl.CLAMP_TO_EDGE);
    this.texPage = [this.texBlank, this.texBlank];
    this.texStaff = [this.texBlank, this.texBlank];
    const units = { uPage0: 0, uPage1: 1, uStaff0: 2, uStaff1: 3, uBayer: 4 };
    for (const [k, v] of Object.entries(units)) gl.uniform1i(this.u[k], v);
  }

  _tex(w, h, data, filter, wrap) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (data instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    return t;
  }

  _resize() {
    const w = innerWidth;
    const h = innerHeight;
    // one dither dot = 2 CSS px on large screens, 1.5 on phones
    this.dot = w < 700 ? 1.5 : 2;
    this.canvas.width = Math.max(1, Math.round(w / this.dot));
    this.canvas.height = Math.max(1, Math.round(h / this.dot));
    this.A = w / h;
    this._dirty = true;
  }

  /** Rectangles (CSS px) where text sits; the field calms down under them. */
  setZones(rects) {
    const h = innerHeight;
    this.zones = rects.slice(0, 8).map((r) => [r.left / h, r.top / h, r.right / h, r.bottom / h]);
  }

  /** Music state from the app: see app.js `artState`. */
  setMusic(m) {
    this.music = m;
  }

  // --- score textures --------------------------------------------------
  _image(url) {
    let e = this.images.get(url);
    if (!e) {
      e = { img: new Image(), ready: false };
      e.img.decoding = 'async';
      e.img.onload = () => { e.ready = true; this._dirty = true; };
      e.img.src = url;
      this.images.set(url, e);
      if (this.images.size > 6) this.images.delete(this.images.keys().next().value);
    }
    return e;
  }

  /** Rows of the crop that are staff lines → a 1-px-wide texture (white = none). */
  _staffData(img, v0, v1) {
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

  _prepareRibbon(i, r, dt) {
    const st = this.ribbonState[i];
    if (!r) { st.fade = Math.max(0, st.fade - dt / 1500); return 0; }
    const e = this._image(r.url);
    const key = `${r.url}|${r.v0}|${r.v1}`;
    if (!e.ready) { st.fade = Math.max(0, st.fade - dt / 1500); return st.fade; }
    if (st.key !== key) {
      if (st.fade > 0.02) { st.fade = Math.max(0, st.fade - dt / 1200); return st.fade; }
      st.key = key;
      if (this.gl) {
        const gl = this.gl;
        if (st.pageUrl !== r.url) {
          if (this.texPage[i] !== this.texBlank) gl.deleteTexture(this.texPage[i]);
          this.texPage[i] = this._tex(0, 0, e.img, gl.LINEAR, gl.CLAMP_TO_EDGE);
          st.pageUrl = r.url;
          st.texel = [1 / e.img.naturalWidth, 1 / e.img.naturalHeight];
        }
        const { H, out } = this._staffData(e.img, r.v0, r.v1);
        if (this.texStaff[i] !== this.texBlank) gl.deleteTexture(this.texStaff[i]);
        this.texStaff[i] = this._tex(1, H, out, gl.LINEAR, gl.CLAMP_TO_EDGE);
      }
      st.img = e.img;
    }
    st.fade = Math.min(1, st.fade + dt / (this.reduced ? 1 : 2500));
    return st.fade;
  }

  /** Choose which part of a system is visible so the engraving keeps its proportions. */
  static window(quad, sys, cursorX, pageAspect) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const len = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
    const hgt = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
    const v0 = sys.top - 0.014;
    const v1 = sys.bottom + 0.014;
    const x0 = sys.bars[0] - 0.012;
    const x1 = sys.bars.at(-1) + 0.006;
    const cropAspect = (x1 - x0) / ((v1 - v0) * pageAspect);
    // perspective foreshortening makes the far end read smaller: allow ~25 % more
    const f = Math.min(1, (1.25 * len) / hgt / cropAspect);
    const w = (x1 - x0) * f;
    const c = cursorX ?? (x0 + x1) / 2;
    const u0 = Math.min(Math.max(c - w * 0.32, x0), x1 - w);
    return { u0, u1: u0 + w, v0, v1 };
  }

  // --- frame -----------------------------------------------------------
  _loop(now) {
    requestAnimationFrame(this._loop);
    if (!this.music) return;
    const interval = this.reduced ? 20000 : 1000 / 15; // the piece barely moves; 15 fps is plenty
    if (now - this._last < interval && !this._dirty) return;
    const dt = this._last ? Math.min(now - this._last, 3000) : 16;
    this._last = now;
    this._dirty = false;
    try {
      this._frame(dt);
    } catch (err) {
      console.error(err);
    }
  }

  _frame(dt) {
    const m = this.music;
    const c = compose({
      t: m.t, A: this.A, key: m.key, nextKey: m.nextKey, mvFraction: m.mvFraction,
      season: m.season, nextSeason: m.nextSeason, seasonFraction: m.seasonFraction,
      intensity: m.intensity, hour: m.hour, reduced: this.reduced,
    });
    // content of the two score planes
    const rib = c.ribbons.map((r, i) => {
      const src = m.systems[i];
      if (!src) return null;
      const win = Artwork.window(r.quad, src.system, i === 0 ? m.cursorX : null, m.pageAspect);
      return { ...r, ...win, url: src.url, system: src.system };
    });
    const fades = rib.map((r, i) => this._prepareRibbon(i, r, dt));
    if (this.gl) this._drawGL(c, rib, fades, m);
    else this._draw2D(c, rib, fades, m);
  }

  _drawGL(c, rib, fades, m) {
    const gl = this.gl;
    const u = this.u;
    const W = this.canvas.width;
    const H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform1f(u.uA, this.A);
    gl.uniform1f(u.uPx, 1 / H);
    const faces = c.faces.slice(0, MAX_FACES);
    const q = new Float32Array(MAX_FACES * 8);
    const f = new Float32Array(MAX_FACES * 4);
    faces.forEach((fc, i) => {
      fc.pts.forEach((pt, j) => { q[i * 8 + j * 2] = pt[0]; q[i * 8 + j * 2 + 1] = pt[1]; });
      f.set([fc.tone, fc.grad[0], fc.grad[1], fc.depth], i * 4);
    });
    gl.uniform4fv(u.uQ, q);
    gl.uniform4fv(u.uF, f);
    gl.uniform1i(u.uN, faces.length);

    const texel = [[1, 1], [1, 1]];
    let hair = [0, 0, 0, 0];
    let cur = [0, 0, 0, 0];
    rib.forEach((r, i) => {
      const RP = i === 0 ? u.uRP0 : u.uRP1;
      if (!r || !this.ribbonState[i].key) { gl.uniform4f(RP, 0, 0, 0, 0); return; }
      const Hf = squareToQuad(r.quad);
      const Hi = invert3(Hf);
      // GLSL mat3 is column-major
      gl.uniformMatrix3fv(i === 0 ? u.uH0 : u.uH1, false, new Float32Array([Hi[0], Hi[3], Hi[6], Hi[1], Hi[4], Hi[7], Hi[2], Hi[5], Hi[8]]));
      gl.uniform4f(i === 0 ? u.uCrop0 : u.uCrop1, r.u0, r.v0, r.u1, r.v1);
      gl.uniform4f(RP, r.depth, r.opacity * fades[i], r.bend, r.phase);
      texel[i] = this.ribbonState[i].texel || [1, 1];
      if (i === 0 && m.cursorX != null) {
        const cu = (m.cursorX - r.u0) / (r.u1 - r.u0);
        const sys = r.system;
        const bu0 = (sys.bars[m.barIndex] - r.u0) / (r.u1 - r.u0);
        const bu1 = (sys.bars[m.barIndex + 1] - r.u0) / (r.u1 - r.u0);
        if (cu >= 0 && cu <= 1) {
          cur = [cu, bu0, bu1, fades[0] > 0.5 ? 1 : 0];
          const vb = 1 - r.bend * Math.sin(cu * Math.PI + r.phase);
          const pb = apply3(Hf, cu, vb);
          hair = [pb[0], pb[1], m.groundY ?? 0.92, cur[3]];
        }
      }
    });
    gl.uniform4f(u.uTex, texel[0][0], texel[0][1], texel[1][0], texel[1][1]);
    gl.uniform4fv(u.uCur, cur);
    gl.uniform4fv(u.uHair, hair);
    gl.uniform4f(u.uBeam, c.beam.x, c.beam.angle, c.beam.width, c.beam.strength);
    gl.uniform4f(u.uTone, c.exposure, c.contrast, c.texture, 0.05);
    gl.uniform2f(u.uDrift, c.drift[0], c.drift[1]);
    const z = new Float32Array(32).fill(-10);
    this.zones.forEach((r, i) => z.set(r, i * 4));
    gl.uniform4fv(u.uZone, z);
    gl.uniform1f(u.uWash, 0.85);

    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    bind(0, this.texPage[0]);
    bind(1, this.texPage[1]);
    bind(2, this.texStaff[0]);
    bind(3, this.texStaff[1]);
    bind(4, this.texBayer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Without WebGL: the same architecture in flat tones, the score as an image.
  _draw2D(c, rib, fades, m) {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const tone = (l) => {
      const v = Math.round(Math.min(1, Math.max(0, (l - 0.5) * c.contrast + 0.5 + c.exposure)) * 255);
      return `rgb(${v},${v},${Math.max(0, v - 6)})`;
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#eae9e3';
    g.fillRect(0, 0, W, H);
    g.setTransform(H, 0, 0, H, 0, 0);
    for (const f of c.faces) {
      g.beginPath();
      f.pts.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1])));
      g.closePath();
      g.fillStyle = tone(f.tone);
      g.fill();
    }
    const r = rib[0];
    const st = this.ribbonState[0];
    if (r && st.img) {
      const [p0, p1, , p3] = r.quad;
      const iw = st.img.naturalWidth;
      const ih = st.img.naturalHeight;
      const sw = (r.u1 - r.u0) * iw;
      const shh = (r.v1 - r.v0) * ih;
      g.save();
      g.globalAlpha = 0.9 * fades[0];
      g.globalCompositeOperation = 'multiply';
      g.transform((p1[0] - p0[0]) / sw, (p1[1] - p0[1]) / sw, (p3[0] - p0[0]) / shh, (p3[1] - p0[1]) / shh, p0[0], p0[1]);
      g.drawImage(st.img, r.u0 * iw, r.v0 * ih, sw, shh, 0, 0, sw, shh);
      g.restore();
    }
    // pools of light under the typography
    g.save();
    g.filter = `blur(${Math.round(H * 0.025)}px)`;
    g.fillStyle = 'rgba(234, 233, 227, 0.8)';
    for (const [x0, y0, x1, y1] of this.zones) g.fillRect(x0 - 0.01, y0 - 0.01, x1 - x0 + 0.02, y1 - y0 + 0.02);
    g.restore();
  }
}
