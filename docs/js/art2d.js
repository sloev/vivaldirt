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
    try {
      const im = await loadImage(src);
      this.cache.set(week, im);
      return im;
    } catch {
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
      const w = 400;
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

  _drawScoreAmbient() {
    if (!this.scoreData) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const sw = this.scoreW, sh = this.scoreH;

    const band = 0.2;
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
      if (v < y0) m = Math.max(0, 1 - (y0 - v) / 0.2);
      else if (v > y1) m = Math.max(0, 1 - (v - y1) / 0.2);
      m = m * m * (0.3 + 0.7 * m);

      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const lum = src[i] / 255;
        const ink = lum < 0.7 ? (0.7 - lum) / 0.7 : 0;
        const grit = ink * ink;
        const edgeX = Math.min(x / sw, 1 - x / sw);
        const hx = Math.min(1, edgeX * 3.5);
        const a = Math.round(grit * m * hx * 145);
        d[i] = 10; d[i + 1] = 10; d[i + 2] = 9; d[i + 3] = a;
      }
    }
    g.putImageData(id, 0, 0);

    const dw = W * 0.75;
    const dh = dw * (sh / sw);
    const dx = -W * 0.05;
    const dy = H * 0.06;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(off, dx, dy, dw, dh);
    ctx.globalAlpha = 0.18;
    ctx.drawImage(off, dx + W * 0.012, dy + H * 0.01, dw, dh);
    ctx.restore();

    const grd = ctx.createRadialGradient(W * 0.45, H * 0.5, H * 0.12, W * 0.5, H * 0.5, H * 0.9);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
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
    ctx.fillStyle = '#121210';
    ctx.fillRect(0, 0, W, H);

    const date = new Date(this.musicNow || Date.now());
    const { w0, w1, blend } = weekBlend(date);
    this._getPlate(w0);
    this._getPlate(w1);

    const a = this.cache.get(w0);
    const b = this.cache.get(w1);
    if (a) this._coverDraw(a, 1 - blend);
    if (b) this._coverDraw(b, blend);
    if (!a && !b) {
      ctx.fillStyle = '#2a2926';
      ctx.fillRect(0, 0, W, H);
    }

    this._drawScoreAmbient();

    ctx.globalAlpha = 0.045;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 450; i++) {
      const x = (Math.sin(i * 19.7 + now * 0.00007) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 13.3 + 2) * 0.5 + 0.5) * H;
      ctx.fillRect(x, y, this.dpr || 1, this.dpr || 1);
    }
    ctx.globalAlpha = 1;
  }
}
