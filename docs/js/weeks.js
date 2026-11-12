// Assembles week-0 plate from chunk modules (avoids huge single file).
import c0 from './week0_0.js';
import c1 from './week0_1.js';
import c2 from './week0_2.js';
import c3 from './week0_3.js';
import c4 from './week0_4.js';
import c5 from './week0_5.js';
import c6 from './week0_6.js';
const b64 = c0 + c1 + c2 + c3 + c4 + c5 + c6;

export const WEEK_IMAGES = {
  0: 'data:image/jpeg;base64,' + b64,
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
