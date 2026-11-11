// The building. A deterministic function of the music and of time: which
// massing stands, how far its cantilevers reach, where the sun is, how
// dense the perforations are. Pure – shared by the renderer and the tests.
//
// World: metres, y up, +x east, +z north. Ground at y = 0. The main mass
// stands at the origin; its south face (normal −z) carries the score.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const N_BOX = 8;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
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

const box = (x0, x1, y0, y1, z0, z1, opt = {}) => ({ min: [x0, y0, z0], max: [x1, y1, z1], tone: opt.tone ?? 0.74, perf: opt.perf ?? 0, grow: opt.grow ?? null });
const NONE = () => box(0, 0, 0, 0, 0, 0); // degenerate, hidden inside the core

/**
 * Three families of brutalist massing. Every family has the same number of
 * primitives so that one can transform into the next between movements.
 *  0 – stacked cantilevers around a core
 *  1 – terraces, a drum on a pier and a fly tower (National Theatre)
 *  2 – a monolith with a perforated screen and a long cantilevered slab
 */
export function makeMassing(season, movement) {
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const family = (movement - 1 + seasons.indexOf(season)) % 3;
  const r = rng(hashStr(`${season}${movement}`));
  const J = (v, f = 0.08) => v * (1 + (r() * 2 - 1) * f);
  let boxes;
  let drum = { x: 0, z: 0, r: 0, y0: 0, y1: 0 };
  let core;
  if (family === 0) {
    const w = J(14), d = J(10), h = J(23), yF = h * 0.42;
    core = { w, d, h, yF };
    boxes = [
      box(-w / 2, w / 2, 0, h, 0, d, { tone: 0.76 }),
      box(-w / 2 - J(3), -w / 2 + J(6), yF + J(3.2), yF + J(8.5), -J(4.5), J(4), { grow: [0, 0, -1] }),
      box(w / 2 - J(5), w / 2 + J(4), yF + J(6.5), yF + J(12), -J(5), J(3), { grow: [0, 0, -1], perf: 1 }),
      box(w / 2 - J(2), w / 2 + J(5), 0, yF - J(3), -J(2), J(6), { tone: 0.7 }),
      box(-w / 2 + J(1), -w / 2 + J(7), h - J(3), h + J(4), J(1), d - J(1), { grow: [0, 1, 0] }),
      box(J(1.5), J(7), h - J(1), h + J(7), J(3), d + J(3)),
      box(-w / 2 - J(4), w / 2 + J(6), 0, J(0.9), -J(3), d + J(2), { tone: 0.8 }),
      NONE(),
    ];
  } else if (family === 1) {
    const w = J(16), d = J(9), h = J(15), yF = h * 0.36;
    core = { w, d, h, yF };
    boxes = [
      box(-w / 2, w / 2, 0, h, 0, d, { tone: 0.75 }),
      box(J(2), J(9.5), 0, J(27), J(7), J(15), { tone: 0.72 }),
      box(-w / 2 - J(10), -w / 2 + J(3), 0, J(4.6), -J(7), J(2), { tone: 0.72 }),
      box(-w / 2 - J(8), -w / 2 + J(4), J(4.6), J(6.1), -J(9), J(3), { grow: [0, 0, -1], tone: 0.7 }),
      box(w / 2 - J(1), w / 2 + J(7), 0, J(10), -J(1), J(8), { perf: 2 }),
      box(w / 2 + J(3.1), w / 2 + J(4.9), 0, yF + J(2.6), -J(4.4), -J(2.6), { tone: 0.68 }),
      box(-J(7), J(3), h, h + J(5), J(2), d + J(4), { grow: [0, 1, 0] }),
      box(-w / 2 - J(11), w / 2 + J(9), 0, J(0.7), -J(10), d + J(2), { tone: 0.8 }),
    ];
    drum = { x: w / 2 + J(4), z: -J(3.5), r: J(3.4), y0: yF + J(2.6), y1: yF + J(5.6) };
  } else {
    const w = J(12), d = J(12), h = J(29), yF = h * 0.34;
    core = { w, d, h, yF };
    boxes = [
      box(-w / 2, w / 2, 0, h, 0, d, { tone: 0.75 }),
      box(w / 2 + J(1), w / 2 + J(10), 0, J(19), -J(2.2), -J(0.4), { perf: 1, tone: 0.72 }),
      box(-w / 2 - J(12), -w / 2 + J(2), J(3.6), J(6.2), -J(6), J(2), { grow: [-1, 0, 0] }),
      box(-w / 2 - J(10.5), -w / 2 - J(7), 0, J(3.6), -J(5.5), -J(1), { tone: 0.68 }),
      box(-w / 2 - J(2), w / 2 + J(3), h, h + J(3.2), -J(3), d + J(1), { grow: [0, 0, -1] }),
      box(w / 2 + J(10), w / 2 + J(14), 0, J(24), J(4), J(9)),
      box(-w / 2 - J(6), w / 2 + J(16), 0, J(0.8), -J(8), d + J(3), { tone: 0.8 }),
      NONE(),
    ];
  }
  // the score is engraved on the south face of the core: as wide as 82 %
  // of the face, as tall as the system's proportions require
  return { family, boxes, drum, core, camYaw: J(31, 0.25), camDist: J(1.7, 0.1), camPitch: J(11, 0.25) };
}

function mixMassing(a, b, t) {
  if (t <= 0) return a;
  const L = (x, y) => (Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], t)) : lerp(x, y, t));
  return {
    family: t < 0.5 ? a.family : b.family,
    boxes: a.boxes.map((bx, i) => ({
      min: L(bx.min, b.boxes[i].min), max: L(bx.max, b.boxes[i].max),
      tone: L(bx.tone, b.boxes[i].tone), perf: t < 0.5 ? bx.perf : b.boxes[i].perf, grow: null,
    })),
    drum: Object.fromEntries(Object.keys(a.drum).map((k) => [k, L(a.drum[k], b.drum[k])])),
    core: Object.fromEntries(Object.keys(a.core).map((k) => [k, L(a.core[k], b.core[k])])),
    camYaw: L(a.camYaw, b.camYaw), camDist: L(a.camDist, b.camDist), camPitch: L(a.camPitch, b.camPitch),
  };
}

/** Direction towards the light: the sun (latitude 48°) by day, a low moon by night. */
export function lightAt({ hour, seasonPhase, drift }) {
  const lat = 48 * DEG;
  // declination follows the seasons of the piece (spring begins near the equinox)
  const decl = 23.44 * DEG * Math.sin(TAU * seasonPhase - 0.22);
  const H = (hour - 12) * 15 * DEG;
  let el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)); // from south, + west
  const day = clamp01((el / DEG + 4) / 10); // civil twilight blend
  // by night a dim, fixed moon from the south-east keeps the forms legible
  const moonAz = -35 * DEG;
  const moonEl = 34 * DEG;
  az = day > 0 ? az : moonAz;
  el = day > 0 ? Math.max(el, 3 * DEG) : moonEl;
  // the building is turned so its engraved face looks south-west: morning light
  // rakes across it from the side, afternoon light falls full on it
  az += drift.az - 55 * DEG;
  el = Math.min(80 * DEG, Math.max(4 * DEG, el + drift.el));
  const dir = [
    -Math.sin(az) * Math.cos(el), // west is −x
    Math.sin(el),
    -Math.cos(az) * Math.cos(el), // south is −z
  ];
  return { dir, day, elevation: el };
}

export const SEASON_LIGHT = {
  spring: { sun: 0.74, ambient: 0.52 },
  summer: { sun: 0.86, ambient: 0.45 },
  autumn: { sun: 0.78, ambient: 0.46 },
  winter: { sun: 0.7, ambient: 0.43 },
};

/**
 * The scene for one moment.
 *  t, key/nextKey ({season, movement}), mvFraction, season, nextSeason,
 *  seasonIndex, seasonFraction, intensity (0..1), hour, barPhase (0..1
 *  through the current bar), reduced
 */
export function sceneAt(m) {
  const s = m.t / 1000;
  const still = m.reduced ? 0 : 1;
  const wave = (period, phase, amp) => amp * still * Math.sin((TAU * s) / period + phase);
  const hand = smooth(clamp01((m.mvFraction - 0.97) / 0.03));
  // cantilevers reach further as a movement unfolds, then hand over
  const grown = (M0, f) => {
    for (const bx of M0.boxes) {
      if (!bx.grow) continue;
      const g = 2.4 * f + wave(380, bx.min[1], 0.8);
      for (let k = 0; k < 3; k++) {
        if (bx.grow[k] < 0) bx.min[k] -= g;
        if (bx.grow[k] > 0) bx.max[k] += g;
      }
    }
    return M0;
  };
  const cur = grown(makeMassing(m.key.season, m.key.movement), m.mvFraction);
  const nxt = grown(makeMassing(m.nextKey.season, m.nextKey.movement), 0);
  const M = mixMassing(cur, nxt, hand);

  const light = lightAt({
    hour: m.hour,
    seasonPhase: (m.seasonIndex + m.seasonFraction) / 4,
    drift: { az: wave(300, 0.4, 12 * DEG) + wave(1370, 2.1, 4 * DEG), el: wave(470, 1.3, 4 * DEG) },
  });
  const st = smooth(clamp01((m.seasonFraction - 0.95) / 0.05));
  const A = SEASON_LIGHT[m.season];
  const B = SEASON_LIGHT[m.nextSeason];
  const sunI = lerp(A.sun, B.sun, st) * (0.5 + 0.5 * light.day);
  const ambient = lerp(A.ambient, B.ambient, st) * (0.85 + 0.15 * light.day);

  return {
    ...M,
    light: light.dir,
    sun: sunI,
    ambient,
    day: light.day,
    // louder music: softer, wider dithered shadow edges and denser perforation
    penumbra: (0.7 + 1.6 * m.intensity) * DEG,
    perfDensity: 0.28 + 0.42 * m.intensity,
    perfPhase: [s * 0.011 * still + m.mvFraction * 2.0, s * 0.007 * still],
    // the staff lines carry around the building, breathing slowly
    strataReach: 7 + 9 * (0.5 + 0.5 * Math.sin((TAU * s) / 470 * still + TAU * m.mvFraction)),
    notation: 0.75 + 0.25 * m.intensity,
  };
}

// ----- camera ---------------------------------------------------------------

/** Camera pose for a massing: front-right of the building, looking up a little. */
export function cameraPose(M) {
  const c = [0, M.core.h * 0.42, M.core.d * 0.4];
  const yaw = M.camYaw * DEG; // positive: camera east of the building, looking north-west
  const dist = M.camDist * Math.max(M.core.h, 18);
  const pos = [c[0] + Math.sin(yaw) * dist, 1.7, c[2] - Math.cos(yaw) * dist];
  const fwd0 = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const pitch = M.camPitch * DEG;
  const fwd = [fwd0[0] * Math.cos(pitch), Math.sin(pitch), fwd0[2] * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, Math.sin(yaw)];
  const up = [ // fwd × right
    fwd[1] * right[2] - fwd[2] * right[1],
    fwd[2] * right[0] - fwd[0] * right[2],
    fwd[0] * right[1] - fwd[1] * right[0],
  ];
  return { pos, right, up, fwd };
}

function toCam(cam, p) {
  const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return [dot(cam.right), dot(cam.up), dot(cam.fwd)];
}

/**
 * Shift-lens framing: choose focal length and principal point so the whole
 * massing sits inside `rect` (pixels: x0,y0,x1,y1), standing on its bottom
 * edge. Width may bleed off the screen by `bleed` of the rect width.
 */
export function frame(M, cam, rect, bleed = 0.15) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const pts = [];
  for (const b of M.boxes) {
    if (b.max[1] - b.min[1] < 1e-3) continue;
    for (let i = 0; i < 8; i++) pts.push([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
  }
  if (M.drum.r > 0) {
    for (let a = 0; a < 8; a++) for (const y of [M.drum.y0, M.drum.y1]) pts.push([M.drum.x + Math.cos(a * Math.PI / 4) * M.drum.r, y, M.drum.z + Math.sin(a * Math.PI / 4) * M.drum.r]);
  }
  for (const p of pts) {
    const c = toCam(cam, p);
    if (c[2] < 0.5) continue;
    const x = c[0] / c[2];
    const y = c[1] / c[2];
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  const rw = rect[2] - rect[0];
  const rh = rect[3] - rect[1];
  const f = Math.min(rh / (ymax - ymin), (rw * (1 + bleed)) / (xmax - xmin));
  // centre horizontally (bleeding equally if too wide), stand on the bottom edge
  const cx = (rect[0] + rect[2]) / 2 - ((xmin + xmax) / 2) * f;
  const cy = rect[3] + ymin * f; // screen y grows downwards
  return { f, cx, cy };
}

/** Project a world point to screen pixels with a framed camera. */
export function project(cam, fr, p) {
  const c = toCam(cam, p);
  return [fr.cx + (c[0] / c[2]) * fr.f, fr.cy - (c[1] / c[2]) * fr.f];
}
