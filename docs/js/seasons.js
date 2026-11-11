// Astronomical seasons and the mapping from wall-clock time to a position
// in the recording. Pure functions – shared by the app and the tests.

// Equinoxes & solstices (Meeus, Astronomical Algorithms, ch. 27).
// Accurate to about a minute for years 1000–3000.
const MEAN = [
  // March equinox, June solstice, September equinox, December solstice
  [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
  [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
];
const TERMS = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186],
  [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443],
  [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513],
  [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417],
  [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029],
  [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756],
  [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
];
const RAD = Math.PI / 180;
const DELTA_T_MS = 69_000; // TT − UT, close enough for this century

/** UTC milliseconds of event k (0 = March equinox … 3 = December solstice). */
export function seasonEvent(year, k) {
  const Y = (year - 2000) / 1000;
  const c = MEAN[k];
  const jde0 = c[0] + c[1] * Y + c[2] * Y ** 2 + c[3] * Y ** 3 + c[4] * Y ** 4;
  const T = (jde0 - 2451545.0) / 36525;
  const W = (35999.373 * T - 2.47) * RAD;
  const dl = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
  let S = 0;
  for (const [A, B, C] of TERMS) S += A * Math.cos((B + C * T) * RAD);
  const jde = jde0 + (0.00001 * S) / dl;
  return (jde - 2440587.5) * 86400000 - DELTA_T_MS;
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Which season `t` (UTC ms) falls in. Northern hemisphere: spring starts at
 * the March equinox. Southern: spring starts at the September equinox.
 * Returns {season, index, start, end, fraction}.
 */
export function seasonAt(t, hemisphere = 'north') {
  const year = new Date(t).getUTCFullYear();
  const events = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let k = 0; k < 4; k++) events.push({ k, t: seasonEvent(y, k) });
  }
  for (let i = 0; i < events.length - 1; i++) {
    if (t >= events[i].t && t < events[i + 1].t) {
      const shift = hemisphere === 'south' ? 2 : 0;
      const index = (events[i].k + shift) % 4;
      const start = events[i].t;
      const end = events[i + 1].t;
      return { season: SEASONS[index], index, start, end, fraction: (t - start) / (end - start) };
    }
  }
  throw new Error('time out of range');
}

/** Start/end frame of each season's concerto in the continuous timeline. */
export function seasonFrames(manifest) {
  const out = {};
  for (const m of manifest.movements) {
    const s = (out[m.season] ||= { start: Infinity, end: 0 });
    s.start = Math.min(s.start, m.start);
    s.end = Math.max(s.end, m.end);
  }
  return out;
}

/**
 * Map a wall-clock instant to the recording.
 * Returns {season info…, frame, stretch, movement, movementFraction}.
 */
export function positionAt(t, manifest, hemisphere = 'north') {
  const s = seasonAt(t, hemisphere);
  const fr = seasonFrames(manifest)[s.season];
  const frame = fr.start + s.fraction * (fr.end - fr.start);
  const seasonSeconds = (s.end - s.start) / 1000;
  const stretch = seasonSeconds / ((fr.end - fr.start) / manifest.sampleRate);
  const mv = manifest.movements.find((m) => frame >= m.start && frame < m.end)
    || manifest.movements.filter((m) => m.season === s.season).at(-1);
  const movementFraction = Math.min(1, Math.max(0, (frame - mv.start) / (mv.end - mv.start)));
  return { ...s, frame, stretch, movement: mv, movementFraction };
}

/** Wall-clock time at which the recording reaches `frame` within season `s`. */
export function timeOfFrame(frame, s, manifest) {
  const fr = seasonFrames(manifest)[s.season];
  return s.start + ((frame - fr.start) / (fr.end - fr.start)) * (s.end - s.start);
}

/**
 * Where in the printed score a movement fraction lies.
 * Optional anchors [[timeFraction, barFraction], ...] correct for tempo
 * changes; without them bars are assumed to be of equal length.
 * Returns {bar (float, 0-based), system, x (page fraction), page}.
 */
export function scoreAt(scoreMv, fraction) {
  let f = fraction;
  const a = scoreMv.anchors;
  if (a && a.length > 1) {
    for (let i = 0; i < a.length - 1; i++) {
      if (fraction <= a[i + 1][0] || i === a.length - 2) {
        const u = (fraction - a[i][0]) / (a[i + 1][0] - a[i][0] || 1);
        f = a[i][1] + Math.min(1, Math.max(0, u)) * (a[i + 1][1] - a[i][1]);
        break;
      }
    }
  }
  const bar = Math.min(scoreMv.measures - 1e-6, Math.max(0, f * scoreMv.measures));
  let n = bar;
  for (const sys of scoreMv.systems) {
    const count = sys.bars.length - 1;
    if (n < count || sys === scoreMv.systems.at(-1)) {
      const i = Math.min(count - 1, Math.floor(n));
      const u = n - i;
      const x = sys.bars[i] + u * (sys.bars[i + 1] - sys.bars[i]);
      return { bar, system: sys, page: sys.page, x, barIndex: i };
    }
    n -= count;
  }
  return null;
}

/** Inverse of the bar mapping: movement fraction at which `bar` (float) begins. */
export function fractionForBar(scoreMv, bar) {
  const g = Math.min(1, Math.max(0, bar / scoreMv.measures));
  const a = scoreMv.anchors;
  if (!a || a.length < 2) return g;
  for (let i = 0; i < a.length - 1; i++) {
    if (g <= a[i + 1][1] || i === a.length - 2) {
      const span = a[i + 1][1] - a[i][1];
      const u = span > 0 ? (g - a[i][1]) / span : 0;
      return a[i][0] + u * (a[i + 1][0] - a[i][0]);
    }
  }
  return g;
}
