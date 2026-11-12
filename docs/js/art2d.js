// Year plates: always composite of three images + fullscreen ambient score.
// Top of frame is nearly transparent so type sits on paper; full opacity below copy.
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

export function yearComposite3(date = new Date()) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 0));
  const day = Math.floor((date - start) / 86400000);
  const yearFrac = ((Math.max(1, day) - 1) % 365) / 365;
  const weekF = yearFrac * 52;
  const base = Math.floor(weekF);
  const t = easeInOut(weekF - base);

  const wA = ((base - 1) % 52 + 52) % 52;
  const wB = ((base) % 52 + 52) % 52;
  const wC = ((base + 1) % 52 + 52) % 52;

  const a = (1 - t) * 0.35;
  const c = t * 0.35;
  const b = 1 - a - c;

  return {
    layers: [
      { week: wA, alpha: a },
      { week: wB, alpha: b },
      { week: wC, alpha: c },
    ],
    yearFrac,
  };
}

export class Art2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.frac = 0;
    this.seasonName = 'winter';
    this.cache = new Map();
    this._bySrc = new Map();
    this.scoreData = null;
    this.fadeStartY = 0.28; // fraction of viewport — updated from DOM
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

  /** Fade starts ~1 line below .clock; ramps over 4 line-heights to full. */
  _measureFade() {
    const clock = document.querySelector('.clock');
    const root = getComputedStyle(document.documentElement);
    const fontSize = parseFloat(root.fontSize) || 15;
    const line = (parseFloat(root.getPropertyValue('--line')) || 1.45) * fontSize;
    const vh = innerHeight || 1;
    if (clock) {
      const r = clock.getBoundingClientRect();
      this.fadeStartY = (r.bottom + line) / vh;
    } else {
      this.fadeStartY = 0.32;
    }
    this.fadeEndY = this.fadeStartY + (4 * line) / vh;
  }

  async _getPlate(week) {
    if (this.cache.has(week)) return this.cache.get(week);
    const src = plateForWeek(week);
    if (!src) return null;
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
      const w = 720;
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

  _liftShadows() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#464646';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#c8c4bc';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

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
      ctx.fillStyle = (i * 37) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x, y, dpr, dpr);
    }
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < n / 3; i++) {
      const x = (Math.sin(i * 7.1 + 3) * 0.5 + 0.5) * W;
      const y = (Math.cos(i * 11.9 + now * 0.00002) * 0.5 + 0.5) * H;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, dpr * 2, dpr * 2);
    }
    ctx.restore();
  }

  _drawScoreFullscreen() {
    if (!this.scoreData) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const sw = this.scoreW, sh = this.scoreH;

    const band = 0.3;
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
      if (v < y0) m = Math.max(0, 1 - (y0 - v) / 0.25);
      else if (v > y1) m = Math.max(0, 1 - (v - y1) / 0.25);
      m = m * m;

      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const lum = src[i] / 255;
        const ink = lum < 0.85 ? (0.85 - lum) / 0.85 : 0;
        const grit = Math.pow(ink, 1.1);
        const a = Math.round(grit * m * 200);
        d[i] = 8; d[i + 1] = 8; d[i + 2] = 6; d[i + 3] = a;
      }
    }
    g.putImageData(id, 0, 0);

    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.7;
    ctx.drawImage(off, dx, dy, dw, dh);
    ctx.globalAlpha = 0.25;
    ctx.drawImage(off, dx + W * 0.004, dy + H * 0.003, dw, dh);
    ctx.restore();
  }

  /**
   * Soft-light the top of the frame toward paper so type stays readable.
   * From y=0 → opacity of art ~10%; from fadeStartY over 4 lines → 100%.
   */
  _applyTopFade() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    this._measureFade();
    const y0 = 0;
    const y1 = this.fadeStartY * H;
    const y2 = Math.min(H, this.fadeEndY * H);

    // Paper wash: strongest at top (90% paper → art at 10%), gone by y2
    const paper = '#eae9e3';
    // Segment 0 → y1: hold ~90% paper
    if (y1 > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, y1);
      ctx.restore();
    }
    // Segment y1 → y2: ease paper from 90% → 0%
    if (y2 > y1) {
      const g = ctx.createLinearGradient(0, y1, 0, y2);
      g.addColorStop(0, 'rgba(234,233,227,0.9)');
      g.addColorStop(1, 'rgba(234,233,227,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y1, W, y2 - y1);
    }
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
    // Base paper so the 10% art region still feels like the page
    ctx.fillStyle = '#eae9e3';
    ctx.fillRect(0, 0, W, H);

    // Draw art into an offscreen so we can fade the whole composite
    const off = this._artOff || (this._artOff = document.createElement('canvas'));
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    octx.fillStyle = '#3a3834';
    octx.fillRect(0, 0, W, H);

    const prev = this.ctx;
    this.ctx = octx;

    const date = new Date(this.musicNow || Date.now());
    const { layers } = yearComposite3(date);
    for (const layer of layers) this._getPlate(layer.week);

    let any = false;
    for (const layer of layers) {
      const im = this.cache.get(layer.week);
      if (im) {
        this._coverDraw(im, layer.alpha);
        any = true;
      }
    }
    if (!any) {
      for (const im of this.cache.values()) {
        if (im) { this._coverDraw(im, 1); break; }
      }
    }

    this._liftShadows();
    this._drawScoreFullscreen();
    this._drawGrain(now);

    const grd = octx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, H * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(20,18,14,0.2)');
    octx.fillStyle = grd;
    octx.fillRect(0, 0, W, H);

    this.ctx = prev;

    // Composite art with vertical opacity mask: 10% top → 100% below copy
    this._measureFade();
    const y1 = this.fadeStartY * H;
    const y2 = Math.min(H, this.fadeEndY * H);

    // Draw art in strips with varying alpha (approximation of continuous fade)
    const strips = 48;
    for (let i = 0; i < strips; i++) {
      const sy = (i / strips) * H;
      const sh = Math.ceil(H / strips) + 1;
      let alpha;
      if (sy + sh <= y1) alpha = 0.1;
      else if (sy >= y2) alpha = 1;
      else {
        // blend through the ramp zone
        const mid = sy + sh / 2;
        if (mid <= y1) alpha = 0.1;
        else if (mid >= y2) alpha = 1;
        else alpha = 0.1 + 0.9 * easeInOut((mid - y1) / Math.max(1, y2 - y1));
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(off, 0, sy, W, sh, 0, sy, W, sh);
      ctx.restore();
    }
  }
}
