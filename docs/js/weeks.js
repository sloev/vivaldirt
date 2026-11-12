// Brutalism plates in docs/images, mapped across the year.
// Always crossfade between the plate for this week and the next.
// Add more files to PLATES (sorted) as you upload them.

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

/** Map week index 0–51 onto the plate list (even spacing). */
function plateIndexForWeek(w) {
  if (!PLATES.length) return 0;
  const t = ((w % 52) + 52) % 52 / 52;
  return Math.min(PLATES.length - 1, Math.floor(t * PLATES.length));
}

export function plateForWeek(w) {
  if (!PLATES.length) return null;
  const i = plateIndexForWeek(w);
  return new URL(PLATES[i], BASE).href;
}

export function plateList() {
  return PLATES.map((name) => new URL(name, BASE).href);
}
