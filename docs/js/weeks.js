import p12 from './plates/p12.js';
import p42 from './plates/p42.js';

export const WEEK_IMAGES = {
  12: p12,
  42: p42,
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
