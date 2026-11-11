// The architecture of the artwork: a deterministic function of time and of
// the position in the music. Nothing here is random per frame – two people
// looking at the piece at the same moment see the same composition, and
// time travel moves the architecture along with the music.
//
// Coordinates: p = (x, y) with y pointing down, the viewport height = 1 and
// its width = A (the aspect ratio).

const TAU = Math.PI * 2;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Tonal character of each season (applied after shading).
export const SEASON_TONE = {
  spring: { exposure: 0.05, contrast: 0.95, texture: 0.8 },
  summer: { exposure: 0.02, contrast: 1.18, texture: 0.7 },
  autumn: { exposure: -0.02, contrast: 1.05, texture: 1.1 },
  winter: { exposure: -0.06, contrast: 1.12, texture: 0.9 },
};

/**
 * A layout is a small architectural scene: a vanishing point, four boxes
 * (a far tower, a large mass, an overhanging slab and a ground slab) and the
 * planes the score is mounted on. Each (season, movement) has its own,
 * recomposed for portrait or landscape screens.
 */
export function makeLayout(key, A) {
  const portrait = A < 0.9;
  const r = mulberry32(hashStr(`${key}|${portrait ? 'p' : 'l'}`));
  const R = (a, b) => lerp(a, b, r());
  const boxes = [];
  if (!portrait) {
    const vp = [A * R(0.66, 1.0), R(-0.08, 0.26)];
    boxes.push({ f: [A * R(0.4, 0.5), -0.15, A * R(0.56, 0.66), R(0.5, 0.72)], k: R(0.3, 0.45), tone: R(0.58, 0.7) });
    boxes.push({ f: [A * R(0.66, 0.76), R(0.16, 0.32), A + 0.25, R(0.82, 1.05)], k: R(0.18, 0.3), tone: R(0.26, 0.38) });
    boxes.push({ f: [A * R(0.28, 0.46), -0.3, A * R(0.86, 1.08), R(0.02, 0.1)], k: R(0.3, 0.45), tone: R(0.14, 0.24) });
    boxes.push({ f: [-0.2, R(0.86, 0.9), A * R(0.62, 0.95), 1.3], k: R(0.12, 0.2), tone: R(0.48, 0.58) });
    return {
      vp, boxes,
      // the score planes have their own, distant vanishing points so the
      // staves sweep across the space like long perspective lines
      ribbons: [
        // very wide, short screens (phones on their side) have less height to share
        A > 1.9
          ? { left: [-0.02, R(0.4, 0.43), R(0.6, 0.63)], rvp: [A * R(1.8, 2.4), R(0.25, 0.4)], end: A * R(0.66, 0.78), depth: 2.5, opacity: 0.95 }
          : { left: [-0.02, R(0.47, 0.51), R(0.77, 0.8)], rvp: [A * R(1.8, 2.4), R(0.28, 0.5)], end: A * R(0.86, 0.98), depth: 2.5, opacity: 0.95 },
        { left: [A + 0.02, R(0.6, 0.66), R(0.76, 0.8)], rvp: [-A * R(0.8, 1.3), R(0.45, 0.6)], end: A * R(0.42, 0.55), depth: 0.5, opacity: 0.75 },
      ],
    };
  }
  const vp = [A * R(0.6, 1.2), R(0.12, 0.34)];
  boxes.push({ f: [A * R(0.5, 0.62), -0.15, A * R(0.82, 0.95), R(0.42, 0.55)], k: R(0.3, 0.45), tone: R(0.58, 0.7) });
  boxes.push({ f: [A * R(0.62, 0.74), R(0.32, 0.42), A + 0.25, R(0.76, 0.86)], k: R(0.18, 0.3), tone: R(0.26, 0.38) });
  boxes.push({ f: [A * R(0.25, 0.42), -0.3, A + 0.2, R(0.03, 0.08)], k: R(0.3, 0.45), tone: R(0.14, 0.24) });
  boxes.push({ f: [-0.2, R(0.88, 0.92), A * R(0.7, 1.0), 1.3], k: R(0.1, 0.18), tone: R(0.48, 0.58) });
  return {
    vp, boxes,
    // on a phone the main plane runs off the right edge: a bar or two of
    // the score, large enough to read
    ribbons: [
      { left: [-0.02, R(0.35, 0.38), R(0.56, 0.59)], rvp: [A * R(3.2, 4.2), R(0.3, 0.42)], end: A * R(1.15, 1.35), depth: 2.5, opacity: 0.95 },
      { left: [A + 0.02, R(0.62, 0.66), R(0.72, 0.75)], rvp: [-A * R(1.5, 2.5), R(0.55, 0.65)], end: A * R(0.3, 0.45), depth: 0.5, opacity: 0.7 },
    ],
  };
}

function mixLayouts(a, b, t) {
  if (t <= 0) return a;
  const m = (x, y) => (Array.isArray(x) ? x.map((v, i) => m(v, y[i])) : typeof x === 'number' ? lerp(x, y, t) : x);
  return {
    vp: m(a.vp, b.vp),
    boxes: a.boxes.map((bx, i) => ({ f: m(bx.f, b.boxes[i].f), k: lerp(bx.k, b.boxes[i].k, t), tone: lerp(bx.tone, b.boxes[i].tone, t) })),
    ribbons: a.ribbons.map((rb, i) => ({ ...rb, left: m(rb.left, b.ribbons[i].left), rvp: m(rb.rvp, b.ribbons[i].rvp), end: lerp(rb.end, b.ribbons[i].end, t) })),
  };
}

const toward = (p, vp, k) => [p[0] + (vp[0] - p[0]) * k, p[1] + (vp[1] - p[1]) * k];

/** Faces of a box whose front face recedes towards the vanishing point. */
function boxFaces(f, k, vp) {
  const [x0, y0, x1, y1] = f;
  const F = { tl: [x0, y0], tr: [x1, y0], br: [x1, y1], bl: [x0, y1] };
  const B = Object.fromEntries(Object.entries(F).map(([n, c]) => [n, toward(c, vp, k)]));
  const faces = [];
  if (vp[0] > x1) faces.push({ pts: [F.tr, B.tr, B.br, F.br], n: [1, 0] });
  if (vp[0] < x0) faces.push({ pts: [F.tl, B.tl, B.bl, F.bl], n: [-1, 0] });
  if (vp[1] < y0) faces.push({ pts: [F.tl, F.tr, B.tr, B.tl], n: [0, -1] });
  if (vp[1] > y1) faces.push({ pts: [F.bl, F.br, B.br, B.bl], n: [0, 1] });
  faces.push({ pts: [F.tl, F.tr, F.br, F.bl], n: null });
  return faces;
}

/**
 * Everything the renderer needs for one frame.
 *  t           wall-clock ms (virtual time, so time travel works)
 *  A           aspect ratio
 *  key/nextKey layout keys of the current and next movement
 *  mvFraction  0..1 progress through the movement
 *  season, nextSeason, seasonFraction
 *  intensity   0..1 loudness of the music around the playhead
 *  hour        local hour of day (0..24) – the light follows the sun
 *  reduced     prefers-reduced-motion
 */
export function compose({ t, A, key, nextKey, mvFraction, season, nextSeason, seasonFraction, intensity, hour, reduced }) {
  const s = t / 1000;
  // movements hand over to the next layout during their last 3 %
  const hand = smooth(clamp01((mvFraction - 0.97) / 0.03));
  const L = mixLayouts(makeLayout(key, A), makeLayout(nextKey, A), hand);

  const still = reduced ? 0 : 1;
  const wave = (period, phase, amp) => amp * still * Math.sin((TAU * s) / period + phase);

  // the light: a sun that moves through the day, dim at night
  const sunAngle = ((hour - 6) / 12) * Math.PI; // 0 at 6:00 (from the left), π at 18:00
  const light = [Math.cos(sunAngle), -Math.abs(Math.sin(sunAngle)) * 0.6 - 0.2];
  const day = clamp01(Math.sin(((hour - 5) / 15) * Math.PI) * 1.4); // 0 at night
  const vp = [L.vp[0] + wave(900, 0.3, 0.03), L.vp[1] + wave(1300, 1.1, 0.02)];

  // quiet music opens up the space; loud music closes it in
  const fill = 0.86 + 0.16 * intensity;
  const faces = [];
  L.boxes.forEach((bx, i) => {
    const cx = (bx.f[0] + bx.f[2]) / 2;
    const cy = (bx.f[1] + bx.f[3]) / 2;
    const dx = wave(240 + i * 97, i * 1.7, 0.016);
    const dy = wave(330 + i * 61, i * 2.3, 0.01);
    const sc = (v, c) => c + (v - c) * fill;
    const f = [sc(bx.f[0], cx) + dx, sc(bx.f[1], cy) + dy, sc(bx.f[2], cx) + dx, sc(bx.f[3], cy) + dy];
    // as a movement progresses, its architecture slowly extrudes
    const k = bx.k + 0.08 * Math.sin(Math.PI * mvFraction) + wave(420 + i * 53, i, 0.025);
    for (const face of boxFaces(f, k, vp)) {
      let tone = bx.tone - 0.08 * intensity;
      let grad;
      if (face.n) {
        tone += 0.22 * (face.n[0] * light[0] + face.n[1] * light[1]) * (0.5 + 0.5 * day);
        grad = [light[0] * 0.12, light[1] * 0.12];
      } else {
        tone += 0.02 * day;
        grad = [light[0] * 0.18, light[1] * 0.1];
      }
      faces.push({ pts: face.pts, tone, grad, depth: i });
    }
  });

  const ribbons = L.ribbons.map((rb, i) => {
    const [x, yT, yB] = rb.left;
    const sway = wave(510 + i * 140, i * 2.1, 0.012);
    const TL = [x, yT + sway];
    const BL = [x, yB + sway];
    const rvp = [rb.rvp[0], rb.rvp[1] + wave(700 + i * 90, 0.5 + i, 0.04)];
    const end = rb.end + wave(820 + i * 70, 1.5 + i, 0.02);
    const sk = (end - x) / (rvp[0] - x); // fraction of the way to the vanishing point
    const TR = toward(TL, rvp, sk);
    const BR = toward(BL, rvp, sk);
    // the right-hand ribbon runs right-to-left: keep the score's left edge first
    const quad = i === 0 ? [TL, TR, BR, BL] : [TR, TL, BL, BR];
    return {
      quad,
      depth: rb.depth,
      opacity: rb.opacity * (i === 0 ? 1 : 0.6 + 0.4 * intensity),
      bend: 0.03 * still + 0.01,
      phase: (TAU * s) / 470 * still + i * 1.3,
    };
  });

  // tonal character blends into the next season over the last 5 % of a season
  const st = smooth(clamp01((seasonFraction - 0.95) / 0.05));
  const a = SEASON_TONE[season];
  const b = SEASON_TONE[nextSeason];
  return {
    faces,
    ribbons,
    vp,
    beam: {
      // a shaft of light from a skylight, drifting across the concrete
      x: A * (0.35 + 0.25 * Math.sin((TAU * s) / 1700 * still + hour)),
      angle: -0.95 + 0.25 * Math.sin((TAU * s) / 1100 * still),
      width: 0.16 + 0.08 * (1 - intensity),
      strength: 0.05 + 0.05 * day,
    },
    exposure: lerp(a.exposure, b.exposure, st) - 0.04 * (1 - day) - 0.03,
    contrast: lerp(a.contrast, b.contrast, st) + 0.15 * intensity,
    texture: lerp(a.texture, b.texture, st) * (0.6 + 0.8 * intensity),
    // the dither field migrates with the music and, slowly, with time
    drift: [Math.cos(TAU * mvFraction) * 1.3 + s * 0.0021 * still, Math.sin(TAU * mvFraction) * 1.3 - s * 0.0013 * still],
  };
}

// --- projective maps ---------------------------------------------------

/** Homography mapping the unit square (u,v) to the quad [p0,p1,p2,p3]
 *  (p0 ↔ (0,0), p1 ↔ (1,0), p2 ↔ (1,1), p3 ↔ (0,1)). Row-major 3×3. */
export function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-12 || Math.abs(sy) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
  }
  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

export function apply3(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
