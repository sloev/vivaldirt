/** Calendar (meteorological) seasons. Spring 1 Mar – 31 May, etc. */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export function seasonStarts(t, hemisphere = 'north') {
  const d = new Date(t);
  const y = d.getFullYear();
  const starts = [];
  for (let yy = y - 1; yy <= y + 1; yy++) {
    const base = hemisphere === 'south'
      ? [[yy, 8, 1], [yy, 11, 1], [yy + 1, 2, 1], [yy + 1, 5, 1]] // Sep, Dec, Mar, Jun
      : [[yy, 2, 1], [yy, 5, 1], [yy, 8, 1], [yy, 11, 1]]; // Mar, Jun, Sep, Dec
    base.forEach(([Y, M, D], i) => {
      starts.push({ t: new Date(Y, M, D).getTime(), index: i, season: SEASONS[i] });
    });
  }
  starts.sort((a, b) => a.t - b.t);
  return starts;
}

export function positionAt(t, hemisphere = 'north') {
  const starts = seasonStarts(t, hemisphere);
  let i = starts.length - 1;
  while (i > 0 && starts[i].t > t) i--;
  const cur = starts[i];
  const next = starts[i + 1] || { t: cur.t + 90 * 86400000 };
  const frac = (t - cur.t) / (next.t - cur.t);
  return {
    season: cur.season,
    movement: Math.min(3, Math.floor(frac * 3) + 1),
    fraction: frac,
    seasonStart: cur.t,
    seasonEnd: next.t,
  };
}

export function scoreAt(t, hemisphere, scoreMap) {
  // placeholder – full logic lives in the original seasons + score map
  const pos = positionAt(t, hemisphere);
  return { ...pos, page: 1, system: 0, bar: 1 };
}

export function fractionForBar(season, movement, bar, scoreMap) {
  return 0;
}
