// Brutalism plates in docs/images — indexed by year progress so neighbours differ.

const PLATES = [
  '1794444638147.jpg',
  '1794445586538.jpg',
  '1794445649576.jpg',
  '1794445698080.jpg',
  '1794445730395.jpg',
  '1794445771608.jpg',
  '1794445800933.jpg',
  '1794445857153.jpg',
  '1794445897831.jpg',
  '1794445988345.jpg',
];

const BASE = new URL('../images/', import.meta.url);

export function plateCount() {
  return PLATES.length;
}

/** Plate index 0..n-1 from continuous year fraction. */
export function plateIndexAt(yearFrac) {
  const n = PLATES.length;
  if (!n) return 0;
  // Spread so each plate owns an equal slice of the year
  return Math.min(n - 1, Math.floor((((yearFrac % 1) + 1) % 1) * n));
}

export function plateUrl(index) {
  if (!PLATES.length) return null;
  const i = ((index % PLATES.length) + PLATES.length) % PLATES.length;
  return new URL(PLATES[i], BASE).href;
}

/** @deprecated prefer plateUrl + plateIndexAt */
export function plateForWeek(w) {
  const n = PLATES.length;
  if (!n) return null;
  const i = Math.min(n - 1, Math.floor((((w % 52) + 52) % 52 / 52) * n));
  return plateUrl(i);
}
