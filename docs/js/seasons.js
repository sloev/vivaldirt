// Astronomical seasons and the mapping from wall-clock time to a position
// in the recording. Pure functions – shared by the app and the tests.

const MEAN = [
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
const DELTA_T_MS = 69000;

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

export function seasonAt(t, hemisphere = 'north') {
  const year = new Date(t).getUTCFullYear();
  const events = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let k = 0; k < 4; k++) events.push({ t: seasonEvent(y, k), k });
  }
  events.sort((a, b) => a.t - b.t);
  const offset = hemisphere === 'south' ? 2 : 0;
  let i = events.length - 1;
  while (i > 0 && events[i].t > t) i--;
  const start = events[i];
  const end = events[i + 1] || { t: start.t + 92 * 864e5, k: (start.k + 1) % 4 };
  const index = (start.k + offset) % 4;
  return {
    season: SEASONS[index],
    index,
    start: start.t,
    end: end.t,
    fraction: Math.min(1, Math.max(0, (t - start.t) / (end.t - start.t))),
  };
}

export function positionAt(t, hemisphere = 'north') {
  const s = seasonAt(t, hemisphere);
  const movement = Math.min(3, Math.floor(s.fraction * 3) + 1);
  return {
    season: s.season,
    movement,
    fraction: s.fraction,
    seasonStart: s.start,
    seasonEnd: s.end,
    movementFrac: (s.fraction * 3) % 1,
  };
}

export function seasonStarts(t, hemisphere = 'north') {
  const year = new Date(t).getUTCFullYear();
  const out = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let k = 0; k < 4; k++) {
      const tt = seasonEvent(y, k);
      const index = hemisphere === 'south' ? (k + 2) % 4 : k;
      out.push({ t: tt, index, season: SEASONS[index] });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function scoreAt(t, hemisphere, scoreMap) {
  const pos = positionAt(t, hemisphere);
  return { ...pos, page: 1, system: 0, bar: 1, barInPage: 1 };
}

export function fractionForBar() {
  return 0;
}
