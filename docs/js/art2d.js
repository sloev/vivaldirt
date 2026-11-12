// B&W concrete planes + score engraved into the surface.
// Uses photo crops when CONCRETE.* data-URLs exist; else photographic procedural.

import { CONCRETE } from './textures.js';

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
function noise2(x, y) {
  return hash(x * 12.9898 + y * 78.233);
}
function smoothNoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return noise2(x0, y0) * (1 - u) * (1 - v) + noise2(x0 + 1, y0) * u * (1 - v)
    + noise2(x0, y0 + 1) * (1 - u) * v + noise2(x0 + 1, y0 + 1) * u * v;
}
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { v += a * smoothNoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return v;
}
function bayer(x, y) {
  const m = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
  return (m[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
}
function concreteProc(u, v, seed) {
  const board = ((v * 14 + seed) % 1);
  let t = 0.42 + 0.08 * Math.sin(v * 40 + seed);
  if (board < 0.04) t -= 0.12;
  if (board > 0.96) t -= 0.06;
  const tie = Math.hypot(((u * 9 + seed * 0.3) % 1) - 0.5, (((v * 11 + seed * 0.7) % 1) - 0.5) * 1.4);
  if (tie < 0.04) t -= 0.25 * (1 - tie / 0.04);
  const pit = fbm(u * 28 + seed, v * 28);
  if (pit > 0.72) t -= (pit - 0.72) * 0.9;
  if (pit < 0.28) t += (0.28 - pit) * 0.15;
  t += (fbm(u * 90 + 3, v * 90) - 0.5) * 0.12;
  t *= 0.85 + 0.2 * fbm(u * 3 + seed, v * 2);
  return Math.min(1, Math.max(0, t));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

export class Art2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.frac = 0;
    this.season = 0;
    this.t0 = performance.now();
    this.tex = [];
    this._resize();
    addEventListener('resize', () => this._resize());
    this._init();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  async _init() {
    const urls = [CONCRETE.t2, CONCRETE.t5].filter(Boolean);
    if (!urls.length) return;
    try {
      this.tex = await Promise.all(urls.map(loadImage));
      for (const im of this.tex) this._ensureData(im);
    } catch (e) { console.warn('texture load', e); }
  }

  _ensureData(im) {
    if (!im || im._data) return;
    const c = document.createElement('canvas');
    c.width = im.naturalWidth || im.width;
    c.height = im.naturalHeight || im.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    im._data = g.getImageData(0, 0, c.width, c.height).data;
    im._w = c.width; im._h = c.height;
  }

  async setScoreSeason(name) {
    if (this._scoreName === name) return;
    this._scoreName = name;
    try {
      const url = new URL(`../score/${name}-01.png`, import.meta.url).href;
      const im = await loadImage(url);
      const c = document.createElement('canvas');
      const w = 256, h = Math.round((im.height / im.width) * w);
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0, w, h);
      this.scoreData = g.getImageData(0, 0, w, h).data;
      this.scoreW = w; this.scoreH = h;
    } catch (e) { console.warn('score', e); }
  }

  _scoreSample(u, v) {
    if (!this.scoreData) return 0.5;
    const x = Math.min(this.scoreW - 1, Math.max(0, Math.floor(u * this.scoreW)));
    const y = Math.min(this.scoreH - 1, Math.max(0, Math.floor(v * this.scoreH)));
    return this.scoreData[(y * this.scoreW + x) * 4] / 255;
  }

  _texSample(im, u, v) {
    this._ensureData(im);
    if (!im?._data) return null;
    const w = im._w, h = im._h;
    const x = Math.min(w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * h)));
    return im._data[(y * w + x) * 4] / 255;
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    const w = innerWidth, h = innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
  }

  setMusic({ fraction = 0, seasonIndex = 0, seasonName = 'winter' } = {}) {
    this.frac = fraction;
    this.season = seasonIndex;
    this.setScoreSeason(seasonName);
  }

  _loop(now) {
    if (!this._last || now - this._last > 200) {
      this._last = now;
      this._draw(now);
    }
    requestAnimationFrame(this._loop);
  }

  _draw(now) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const frac = this.frac;
    const drift = ((now - this.t0) / 60000) % 1;
    const phase = frac * 0.25 + drift * 0.08 + this.season * 0.04;

    ctx.fillStyle = '#e8e6df';
    ctx.fillRect(0, 0, W, H);

    const faces = [
      { x: 0.48 + phase * 0.03, y: -0.04, w: 0.64, h: 0.7, skew: 0.1, ti: 0, seed: 1.2, ou: 0.1, ov: 0.15 },
      { x: 0.58 + phase * 0.02, y: 0.3, w: 0.52, h: 0.55, skew: -0.05, ti: 1, seed: 4.7, ou: 0.3, ov: 0.2 },
      { x: 0.5, y: 0.6 + phase * 0.02, w: 0.58, h: 0.48, skew: 0.08, ti: 0, seed: 8.1, ou: 0.5, ov: 0.4 },
      { x: 0.74, y: 0.08, w: 0.36, h: 0.38, skew: 0.03, ti: 1, seed: 2.9, ou: 0.0, ov: 0.55 },
    ];

    const scale = Math.max(2, Math.floor((this.dpr || 1) * 2));
    const bw = Math.ceil(W / scale), bh = Math.ceil(H / scale);
    const img = ctx.createImageData(bw, bh);
    const data = img.data;
    const ntex = this.tex.length;

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const u = x / bw, v = y / bh;
        let tone = 0.9, on = false;
        for (const f of faces) {
          const lx = u - f.x, ly = v - f.y;
          const px = lx + ly * f.skew, py = ly;
          if (px >= 0 && px <= f.w && py >= 0 && py <= f.h) {
            const tu = f.ou + (px / f.w) * 0.7 + phase * 0.03;
            const tv = f.ov + (py / f.h) * 0.7;
            let c = null;
            if (ntex) c = this._texSample(this.tex[f.ti % ntex], tu, tv);
            if (c == null) c = concreteProc(tu, tv, f.seed);
            const note = this._scoreSample((px / f.w) * 0.9 + 0.05, (py / f.h) * 0.85 + 0.05 + frac * 0.05);
            c = c * (0.55 + 0.45 * note) - (1 - note) * 0.12;
            const edge = Math.min(px, f.w - px, py, f.h - py);
            if (edge < 0.01) c *= 0.6;
            tone = Math.min(tone, Math.max(0, Math.min(1, c)));
            on = true;
          }
        }
        const b = bayer(x, y);
        const q = Math.min(1, Math.max(0, tone + (b - 0.5) * (on ? 0.08 : 0.03)));
        const g = Math.round(q * 255);
        const i = (y * bw + x) * 4;
        data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
      }
    }

    const off = this._off || (this._off = document.createElement('canvas'));
    off.width = bw; off.height = bh;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W, H);
  }
}
