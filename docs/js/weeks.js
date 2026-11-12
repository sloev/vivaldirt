// Brutalism plates mapped across the year. Always crossfade between two.
import p0 from './plates/p0.js';
import p6 from './plates/p6.js';
import p12 from './plates/p12.js';
import p18 from './plates/p18.js';
import p24 from './plates/p24.js';
import p30 from './plates/p30.js';
import p36 from './plates/p36.js';
import p42 from './plates/p42.js';
import p48 from './plates/p48.js';

export const WEEK_IMAGES = {
  0: p0,
  6: p6,
  12: p12,
  18: p18,
  24: p24,
  30: p30,
  36: p36,
  42: p42,
  48: p48,
};

export function plateForWeek(w) {
  const keys = Object.keys(WEEK_IMAGES).map(Number).sort((a, b) => a - b);
  if (!keys.length) return null;
  if (WEEK_IMAGES[w] != null) return WEEK_IMAGES[w];
  let best = keys[0], bd = Math.abs(keys[0] - w);
  for (const k of keys) {
    const d = Math.abs(k - w);
    if (d < bd) { best = k; bd = d; }
  }
  return WEEK_IMAGES[best];
}
