// Slow, deterministic dithered brutalist planes — pure 2D canvas.
const PAL = [
  [23, 23, 21], [37, 36, 34], [46, 45, 40],
  [119, 120, 115], [199, 198, 191], [234, 233, 227],
];

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function bayer(x, y) {
  const m = [
    0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
    12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
    3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25,
    15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21,
  ];
  return (m[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
}

export class Art2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.frac = 0;
    this.season = 0;
    this.t0 = performance.now();
    this._resize();
    addEventListener('resize', () => this._resize());
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    const w = innerWidth;
    const h = innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
  }

  setMusic({ fraction = 0, seasonIndex = 0 } = {}) {
    this.frac = fraction;
    this.season = seasonIndex;
  }

  _loop(now) {
    // ~6 fps is enough for slow mutation and saves battery on Android
    if (!this._last || now - this._last > 160) {
      this._last = now;
      this._draw(now);
    }
    requestAnimationFrame(this._loop);
  }

  _draw(now) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const frac = this.frac;
    const season = this.season;
    const drift = ((now - this.t0) / 50000) % 1;
    const phase = frac * 0.35 + drift * 0.12 + season * 0.07;

    ctx.fillStyle = '#eae9e3';
    ctx.fillRect(0, 0, W, H);

    const planes = [
      { x: 0.50 + phase * 0.04, y: 0.04, w: 0.58, h: 0.64, skew: 0.18, tone: 0.14 },
      { x: 0.60 + phase * 0.03, y: 0.30, w: 0.44, h: 0.50, skew: -0.08, tone: 0.07 },
      { x: 0.56, y: 0.66 + phase * 0.02, w: 0.52, h: 0.42, skew: 0.12, tone: 0.20 },
      { x: 0.76, y: 0.10, w: 0.30, h: 0.36, skew: 0.05, tone: 0.04 },
    ];

    const scale = Math.max(2, Math.floor((this.dpr || 1) * 2));
    const bw = Math.ceil(W / scale);
    const bh = Math.ceil(H / scale);
    const img = ctx.createImageData(bw, bh);
    const data = img.data;

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const u = x / bw;
        const v = y / bh;
        let tone = 0.93;
        for (const p of planes) {
          const lx = u - p.x;
          const ly = v - p.y;
          const px = lx + ly * p.skew;
          const py = ly;
          if (px >= 0 && px <= p.w && py >= 0 && py <= p.h) {
            const edge = Math.min(px, p.w - px, py, p.h - py);
            const edgeFactor = edge < 0.012 ? 0.65 : 1;
            tone = Math.min(tone, p.tone * edgeFactor + (1 - edgeFactor) * 0.02);
            const strata = ((py * 36 + phase * 2.5) % 1);
            if (strata < 0.045) tone *= 0.82;
          }
        }
        const b = bayer(x, y);
        const q = Math.min(1, Math.max(0, tone + (b - 0.5) * 0.14));
        const idx = Math.min(PAL.length - 1, Math.floor(q * (PAL.length - 0.001)));
        const c = PAL[idx];
        const i = (y * bw + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }

    const off = this._off || (this._off = document.createElement('canvas'));
    off.width = bw; off.height = bh;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W, H);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 600; i++) {
      ctx.fillRect(hash(i + drift * 8) * W, hash(i * 3.1 + 2) * H, this.dpr || 1, this.dpr || 1);
    }
    ctx.globalAlpha = 1;
  }
}
