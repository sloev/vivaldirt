// Week plates crossfade + score as ambient grit (current band only).
import { plateForWeek } from './weeks.js';

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

export function weekBlend(date = new Date()) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 0));
  const day = Math.floor((date - start) / 86400000);
  const weekF = ((Math.max(1, day) - 1) / 365) * 52;
  const w0 = ((Math.floor(weekF) % 52) + 52) % 52;
  const w1 = (w0 + 1) % 52;
  const frac = weekF - Math.floor(weekF);
  return { w0, w1, blend: easeInOut(frac) };
}

export class Art2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.frac = 0;
    this.seasonName = 'winter';
    this.cache = new Map();
    this.scoreData = null;
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
  }

  async _getPlate(week) {
    if (this.cache.has(week)) return this.cache.get(week);
    const src = plateForWeek(week);
    if (!src) return null;
    if (!this._bySrc) this._bySrc = new Map();
    if (this._bySrc.has(src)) {
      const im = this._bySrc.get(src);
      this.cache.set(week, im);
      return im;
    }
    try {
      const im = await loadImage(src);
      this._bySrc.set(src, im);
      this.cache.set(week, im);
      return im;
    } catch (e) {
      console.warn('plate load', src, e);
      this.cache.set(week, null);
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
      const w = 480;
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

  _coverDraw(im, alpha) {
    if (!im || alpha <= 0.001) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const iw = im.naturalWidth || im.width;
    const ih = im.naturalHeight || im.height;
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.drawImage(im, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  }

  /** Lift shadows so nothing sits below ~70/255, keep highlights. */
  _liftShadows() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    // Screen-blend a mid grey so pure black rises toward ~70
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#464646'; // ~70
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Slight overall lift
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#c8c4bc';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** Heavy film grain. */
  _drawGrain(now) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const dpr = this.dpr || 1;
    const n = Math.floor((W * H) / 900);
    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < n; i++) {
      const x = (Math.sin(i * 19.7 + now * 0.00005) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 13.3 + i * 0.17) * 0.5 + 0.5) * H;
      const g = (i * 37) % 2 === 0 ? 0 : 255;
      ctx.fillStyle = g ? '#fff' : '#000';
      ctx.fillRect(x, y, dpr, dpr);
    }
    // Second pass coarser
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < n / 3; i++) {
      const x = (Math.sin(i * 7.1 + 3) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 11.9 + now * 0.00002) * 0.5 + 0.5) * H;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, dpr * 2, dpr * 2);
    }
    ctx.restore();
  }

  /** Score as visible stained notation — current band stronger. */
  _drawScoreAmbient() {
    if (!this.scoreData) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const sw = this.scoreW, sh = this.scoreH;

    const band = 0.28;
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
      if (v < y0) m = Math.max(0, 1 - (y0 - v) / 0.22);
      else if (v > y1) m = Math.max(0, 1 - (v - y1) / 0.22);
      m = m * m;

      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const lum = src[i] / 255;
        // Keep more of the notation — softer threshold
        const ink = lum < 0.82 ? (0.82 - lum) / 0.82 : 0;
        const grit = Math.pow(ink, 1.15);
        const edgeX = Math.min(x / sw, 1 - x / sw);
        const hx = Math.min(1, edgeX * 5);
        // Stronger alpha so it reads on lightened concrete
        const a = Math.round(grit * m * hx * 210);
        d[i] = 8; d[i + 1] = 8; d[i + 2] = 6; d[i + 3] = a;
      }
    }
    g.putImageData(id, 0, 0);

    const dw = W * 0.82;
    const dh = dw * (sh / sw);
    const dx = -W * 0.02;
    const dy = H * 0.04;

    ctx.save();
    // Multiply for ink-into-paper feel
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.72;
    ctx.drawImage(off, dx, dy, dw, dh);
    // Soft double impression
    ctx.globalAlpha = 0.28;
    ctx.drawImage(off, dx + W * 0.008, dy + H * 0.006, dw, dh);
    ctx.restore();

    // Slight darken where score sits so notes stay readable after shadow lift
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#1a1814';
    ctx.fillRect(dx, dy, dw * 0.95, dh);
    ctx.restore();
  }

  _loop(now) {
    if (!this._last || now - this._last > 90) {
      this._last = now;
      this._draw(now);
    }
    requestAnimationFrame(this._loop);
  }

  _draw(now) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#3a3834';
    ctx.fillRect(0, 0, W, H);

    const date = new Date(this.musicNow || Date.now());
    const { w0, w1, blend } = weekBlend(date);
    this._getPlate(w0);
    this._getPlate(w1);

    const a = this.cache.get(w0);
    const b = this.cache.get(w1);
    if (a) this._coverDraw(a, 1 - blend);
    if (b) this._coverDraw(b, blend);

    this._liftShadows();
    this._drawScoreAmbient();
    this._drawGrain(now);

    // Soft vignette for depth, not pure black
    const grd = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, H * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(20,18,14,0.22)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }
}
