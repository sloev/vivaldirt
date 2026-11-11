// Calendar (meteorological) seasons and the mapping from wall-clock time to
// a position in the recording. Pure functions – shared by the app and tests.
//
// Northern hemisphere: spring 1 Mar – 31 May, summer 1 Jun – 31 Aug,
// autumn 1 Sep – 30 Nov, winter 1 Dec – end of Feb. The southern hemisphere
// is shifted by six months. Boundaries are at local midnight.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const START_MONTHS = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-based)

/** Season index (0 spring … 3 winter) that starts in a given start month. */
function seasonForMonth(month, hemisphere) {
  const k = START_MONTHS.indexOf(month);
  return (k + (hemisphere === 'south' ? 2 : 0)) % 4;
}

/** All season starts from the year before `t` to the year after, in order. */
export function seasonStarts(t, hemisphere = 'north') {
  const year = new Date(t).getFullYear();
  const out = [];
  for (let y = year - 2; y <= year + 1; y++) {
    for (const m of START_MONTHS) {
      out.push({ index: seasonForMonth(m, hemisphere), t: new Date(y, m, 1).getTime() });
    }
  }
  return out;
}

/**
 * Which season `t` (ms) falls in.
 * Returns {season, index, start, end, fraction}.
 */
export function seasonAt(t, hemisphere = 'north') {
  const ev = seasonStarts(t, hemisphere);
  for (let i = 0; i < ev.length - 1; i++) {
    if (t >= ev[i].t && t < ev[i + 1].t) {
      const start = ev[i].t;
      const end = ev[i + 1].t;
      const index = ev[i].index;
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
