// Always composite three distinct plates + fullscreen score.
// Continuous vertical fade: 20% art until below clock, then 3 lines → 100%.
import { plateUrl, plateCount } from './weeks.js';

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error('no src'));
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** Three consecutive plate indices with strong crossfade weights. */
export function yearComposite3(date = new Date()) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 0));
  const day = Math.floor((date - start) / 86400000);
  const yearFrac = ((Math.max(1, day) - 1) % 365) / 365;
  const n = Math.max(1, plateCount());

  const pos = yearFrac * n;
  const i0 = Math.floor(pos) % n;
  const t = easeInOut(pos - Math.floor(pos));
  const iPrev = (i0 - 1 + n) % n;
  const iNext = (i0 + 1) % n;

  const aPrev = (1 - t) * 0.45;
  const aNext = t * 0.45;
  const aCurr = 1 - aPrev - aNext;

  return {
    layers: [
      { index: iPrev, alpha: aPrev },
      { index: i0, alpha: aCurr },
      { index: iNext, alpha: aNext },
    ],
    yearFrac,
    t,
  };
}

export class Art2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.frac = 0;
    this.seasonName = 'winter';
    this.cache = new Map();
    this.scoreData = null;
    this.fadeStartY = 0.28;
    this.fadeEndY = 0.4;
    this._resize();
    addEventListener('resize', () => this._resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this._measureFade();
  }

  _measureFade() {
    const clock = document.querySelector('.clock');
    const root = getComputedStyle(document.documentElement);
    const fontSize = parseFloat(root.fontSize) || 15;
    const line = (parseFloat(root.getPropertyValue('--line')) || 1.45) * fontSize;
    const vh = innerHeight || 1;
    if (clock) {
      const r = clock.getBoundingClientRect();
      this.fadeStartY = (r.bottom + line * 0.25) / vh;
    } else {
      this.fadeStartY = 0.3;
    }
    this.fadeEndY = this.fadeStartY + (3 * line) / vh;
  }

  async _getPlate(index) {
    if (this.cache.has(index)) return this.cache.get(index);
    const src = plateUrl(index);
    if (!src) return null;
    try {
      const im = await loadImage(src);
      this.cache.set(index, im);
      return im;
    } catch (e) {
      console.warn('plate load', src, e);
      this.cache.set(index, null);
      return null;
    }
  }

  async setScoreSeason(name) {
    if (this._scoreName === name) return;
    this._scoreName = name;
    try {
      const url = new URL(`../score/${name}-01.png`, import.meta.url).href;
      const im = await loadImage(url);
      const c = document.createElement('canvas');
      const w = 800;
      const h = Math.round((im.height / im.width) * w);
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0, w, h);
      this.scoreData = g.getImageData(0, 0, w, h).data;
      this.scoreW = w;
      this.scoreH = h;
    } catch (e) {
      console.warn('score', e);
    }
  }

  setMusic({ fraction = 0, seasonName = 'winter', now = Date.now() } = {}) {
    this.frac = fraction;
    this.seasonName = seasonName;
    this.musicNow = now;
    this.setScoreSeason(seasonName);
  }

  _coverDraw(ctx, im, alpha, offsetX = 0, offsetY = 0) {
    if (!im || alpha <= 0.001) return;
    const W = this.canvas.width, H = this.canvas.height;
    const iw = im.naturalWidth || im.width;
    const ih = im.naturalHeight || im.height;
    const scale = Math.max(W / iw, H / ih) * 1.04;
    const dw = iw * scale, dh = ih * scale;
    const dx = (W - dw) / 2 + offsetX;
    const dy = (H - dh) / 2 + offsetY;
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.drawImage(im, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  }

  _liftShadows(ctx) {
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#464646';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  _drawGrain(ctx, now) {
    const W = this.canvas.width, H = this.canvas.height;
    const dpr = this.dpr || 1;
    const n = Math.floor((W * H) / 300);
    ctx.save();
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < n; i++) {
      const x = (Math.sin(i * 19.7 + now * 0.00005) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 13.3 + i * 0.17) * 0.5 + 0.5) * H;
      ctx.fillStyle = (i * 37) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x, y, dpr, dpr);
    }
    ctx.restore();
  }

  /** Static grit: a tile of speckle and dust multiplied over everything. */
  _drawGrit(ctx) {
    if (!this._gritTile) {
      const T = 256;
      const c = document.createElement('canvas');
      c.width = T; c.height = T;
      const g = c.getContext('2d');
      const id = g.createImageData(T, T);
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < T * T; i++) {
        const r = rnd();
        // mostly paper, a fine tooth of grey, rare dark specks
        const v = r < 0.012 ? 40 + rnd() * 60 : r < 0.08 ? 150 + rnd() * 60 : 215 + rnd() * 40;
        id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
        id.data[i * 4 + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      this._gritTile = c;
    }
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = ctx.createPattern(this._gritTile, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  _drawScoreFullscreen(ctx) {
    if (!this.scoreData) return;
    const W = this.canvas.width, H = this.canvas.height;
    const sw = this.scoreW, sh = this.scoreH;

    const band = 0.35;
    const center = this.frac * (1 - band) + band * 0.5;
    const y0 = center - band / 2;
    const y1 = center + band / 2;

    const off = this._scoreOff || (this._scoreOff = document.createElement('canvas'));
    off.width = sw;
    off.height = sh;
    const g = off.getContext('2d');
    const id = g.createImageData(sw, sh);
    const d = id.data;
    const src = this.scoreData;

    for (let y = 0; y < sh; y++) {
      const v = y / sh;
      let m = 1;
      if (v < y0) m = Math.max(0, 1 - (y0 - v) / 0.28);
      else if (v > y1) m = Math.max(0, 1 - (v - y1) / 0.28);
      m = Math.pow(m, 1.2);

      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const lum = src[i] / 255;
        const ink = lum < 0.88 ? (0.88 - lum) / 0.88 : 0;
        const grit = Math.pow(ink, 1.05);
        const a = Math.round(grit * (0.35 + 0.65 * m) * 230);
        d[i] = 6; d[i + 1] = 6; d[i + 2] = 5; d[i + 3] = a;
      }
    }
    g.putImageData(id, 0, 0);

    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.38;
    ctx.drawImage(off, dx, dy, dw, dh);
    ctx.globalAlpha = 0.12;
    ctx.drawImage(off, dx + W * 0.005, dy + H * 0.004, dw, dh);
    ctx.restore();
  }

  _loop(now) {
    if (!this._last || now - this._last > 80) {
      this._last = now;
      this._draw(now);
    }
    requestAnimationFrame(this._loop);
  }

  _draw(now) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    // Paper-white base
    ctx.fillStyle = '#eae9e3';
    ctx.fillRect(0, 0, W, H);

    const off = this._artOff || (this._artOff = document.createElement('canvas'));
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    octx.fillStyle = '#eae9e3';
    octx.fillRect(0, 0, W, H);

    const date = new Date(this.musicNow || Date.now());
    const { layers } = yearComposite3(date);

    for (const layer of layers) this._getPlate(layer.index);

    const offsets = [
      { x: -W * 0.02, y: -H * 0.015 },
      { x: 0, y: 0 },
      { x: W * 0.02, y: H * 0.015 },
    ];

    layers.forEach((layer, i) => {
      const im = this.cache.get(layer.index);
      if (!im) return;
      const o = offsets[i] || { x: 0, y: 0 };
      // multiply: each plate's grain and stains darken the ones beneath
      octx.save();
      octx.globalCompositeOperation = 'multiply';
      octx.filter = 'grayscale(1) contrast(1.6)';
      this._coverDraw(octx, im, Math.max(0.55, layer.alpha), o.x, o.y);
      octx.restore();
    });

    if (layers.every((l) => !this.cache.get(l.index))) {
      for (const im of this.cache.values()) {
        if (im) { this._coverDraw(octx, im, 1); break; }
      }
    }

    this._drawScoreFullscreen(octx);
    this._drawGrain(octx, now);
    this._drawGrit(octx);

    const grd = octx.createRadialGradient(W * 0.5, H * 0.5, H * 0.15, W * 0.5, H * 0.5, H * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(18,16,12,0.22)');
    octx.fillStyle = grd;
    octx.fillRect(0, 0, W, H);
    // levels: screen with 70 % grey maps every value v to 0.7 + 0.3·v, so
    // nothing in the artwork is darker than 70 % grey
    octx.save();
    octx.globalCompositeOperation = 'screen';
    octx.fillStyle = 'rgb(179,179,179)';
    octx.fillRect(0, 0, W, H);
    octx.restore();

    this._measureFade();
    const y1 = this.fadeStartY * H;
    const y2 = Math.min(H, this.fadeEndY * H);

    // One continuous gradient instead of strips: the artwork at full
    // strength, then paper laid over it, fading from 80 % (art shows at 20 %)
    // above the clock to 0 % three lines below it. (Drawing the art in 64
    // overlapping strips made every 1-px overlap darker: visible stripes.)
    ctx.drawImage(off, 0, 0);
    const fade = ctx.createLinearGradient(0, y1, 0, Math.max(y1 + 1, y2));
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      fade.addColorStop(u, `rgba(234,233,227,${(0.8 * (1 - easeInOut(u))).toFixed(4)})`);
    }
    ctx.fillStyle = 'rgba(234,233,227,0.8)';
    ctx.fillRect(0, 0, W, y1);
    ctx.fillStyle = fade;
    ctx.fillRect(0, y1, W, Math.max(1, y2 - y1));
  }
}
