// Close-up B&W brutalist concrete: formwork marks, pitting, grain.
// Planes are large cropped faces of concrete, not distant buildings.

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
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = noise2(x0, y0);
  const b = noise2(x0 + 1, y0);
  const c = noise2(x0, y0 + 1);
  const d = noise2(x0 + 1, y0 + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) {
    v += a * smoothNoise(x, y);
    x *= 2.03; y *= 2.03; a *= 0.5;
  }
  return v;
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

/** Photographic concrete value 0=black 1=white for UV on a face */
function concreteAt(u, v, seed) {
  // Macro formwork board lines (horizontal boards)
  const board = ((v * 14 + seed) % 1);
  let t = 0.42 + 0.08 * Math.sin(v * 40 + seed);
  if (board < 0.04) t -= 0.12; // joint shadow
  if (board > 0.96) t -= 0.06;

  // Vertical tie-rod holes / form ties
  const tieU = ((u * 9 + seed * 0.3) % 1);
  const tieV = ((v * 11 + seed * 0.7) % 1);
  const tie = Math.hypot(tieU - 0.5, (tieV - 0.5) * 1.4);
  if (tie < 0.04) t -= 0.25 * (1 - tie / 0.04);

  // Aggregate pitting
  const pit = fbm(u * 28 + seed, v * 28);
  if (pit > 0.72) t -= (pit - 0.72) * 0.9;
  if (pit < 0.28) t += (0.28 - pit) * 0.15;

  // Fine sand grain
  t += (fbm(u * 90 + 3, v * 90) - 0.5) * 0.12;
  t += (noise2(Math.floor(u * 200), Math.floor(v * 200)) - 0.5) * 0.06;

  // Weathering stain
  t *= 0.85 + 0.2 * fbm(u * 3 + seed, v * 2);

  return Math.min(1, Math.max(0, t));
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
    if (!this._last || now - this._last > 180) {
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
    const drift = ((now - this.t0) / 55000) % 1;
    const phase = frac * 0.3 + drift * 0.1 + season * 0.05;

    // Paper ground (B&W warm)
    ctx.fillStyle = '#e8e6df';
    ctx.fillRect(0, 0, W, H);

    // Large close-up concrete faces (cropped, filling space)
    const faces = [
      { x: 0.48 + phase * 0.03, y: -0.05, w: 0.65, h: 0.72, skew: 0.12, seed: 1.2, crop: 0.15 },
      { x: 0.58 + phase * 0.02, y: 0.28, w: 0.55, h: 0.58, skew: -0.06, seed: 4.7, crop: 0.35 },
      { x: 0.52, y: 0.62 + phase * 0.02, w: 0.6, h: 0.5, skew: 0.1, seed: 8.1, crop: 0.55 },
      { x: 0.72, y: 0.05, w: 0.4, h: 0.4, skew: 0.04, seed: 2.9, crop: 0.8 },
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
        let tone = 0.9; // paper
        let onConcrete = false;

        for (const f of faces) {
          const lx = u - f.x;
          const ly = v - f.y;
          const px = lx + ly * f.skew;
          const py = ly;
          if (px >= 0 && px <= f.w && py >= 0 && py <= f.h) {
            // UV zoomed into a crop of the texture (close-up)
            const tu = f.crop + (px / f.w) * 0.45 + phase * 0.02;
            const tv = f.crop * 0.7 + (py / f.h) * 0.5;
            let c = concreteAt(tu, tv, f.seed);
            // Hard edge / shadow at plane boundaries
            const edge = Math.min(px, f.w - px, py, f.h - py);
            if (edge < 0.008) c *= 0.55;
            tone = Math.min(tone, c);
            onConcrete = true;
          }
        }

        // Ordered dither for print/archival feel
        const b = bayer(x, y);
        let q = tone + (b - 0.5) * (onConcrete ? 0.1 : 0.04);
        q = Math.min(1, Math.max(0, q));
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
