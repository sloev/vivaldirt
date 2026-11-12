// Week-of-year background plates. Keys 0–51. Add more photos as they arrive.
// Until more plates are uploaded, week 0 image is reused for all weeks (blend still runs).
export const WEEK_IMAGES = {};

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
