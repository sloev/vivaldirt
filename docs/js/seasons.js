/** Calendar (meteorological) seasons. Spring 1 Mar – 31 May, etc. */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export function seasonStarts(t, hemisphere = 'north') {
  const d = new Date(t);
  const y = d.getFullYear();
  const out = [];
  for (let yy = y - 1; yy <= y + 1; yy++) {
    const months = hemisphere === 'south'
      ? [8, 11, 2, 5]   // Sep, Dec, Mar, Jun
      : [2, 5, 8, 11];  // Mar, Jun, Sep, Dec
    months.forEach((m, i) => {
      const Y = (hemisphere === 'south' && m < 6) ? yy + 1 : yy;
      out.push({ t: new Date(Y, m, 1).getTime(), index: i, season: SEASONS[i] });
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function positionAt(t, hemisphere = 'north') {
  const starts = seasonStarts(t, hemisphere);
  let i = starts.length - 1;
  while (i > 0 && starts[i].t > t) i--;
  const cur = starts[i];
  const next = starts[i + 1] || { t: cur.t + 92 * 864e5 };
  const frac = Math.min(1, Math.max(0, (t - cur.t) / (next.t - cur.t)));
  const movement = Math.min(3, Math.floor(frac * 3) + 1);
  return {
    season: cur.season,
    movement,
    fraction: frac,
    seasonStart: cur.t,
    seasonEnd: next.t,
    movementFrac: (frac * 3) % 1,
  };
}

export function scoreAt(t, hemisphere, scoreMap) {
  const pos = positionAt(t, hemisphere);
  return { ...pos, page: 1, system: 0, bar: 1, barInPage: 1 };
}

export function fractionForBar() {
  return 0;
}
