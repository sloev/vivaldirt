import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneAt, makeMassing, cameraPose, frame, project, lightAt, N_BOX } from '../docs/js/scene.js';

const base = {
  t: Date.parse('2026-11-11T14:00:00Z'), key: { season: 'autumn', movement: 3 }, nextKey: { season: 'winter', movement: 1 },
  mvFraction: 0.4, season: 'autumn', nextSeason: 'winter', seasonIndex: 2, seasonFraction: 0.8,
  intensity: 0.5, hour: 14, reduced: false,
};
const flat = (x) => JSON.stringify(x);

test('the building is a deterministic function of time and music', () => {
  assert.equal(flat(sceneAt(base)), flat(sceneAt({ ...base })));
  assert.notEqual(flat(sceneAt(base).light), flat(sceneAt({ ...base, t: base.t + 60_000 }).light));
});

test('every movement raises its own massing, with a fixed number of volumes', () => {
  const seen = new Set();
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    for (const movement of [1, 2, 3]) {
      const m = makeMassing(season, movement);
      assert.equal(m.boxes.length, N_BOX);
      seen.add(flat(m.boxes));
    }
  }
  assert.equal(seen.size, 12);
});

test('movements hand over continuously', () => {
  const end = sceneAt({ ...base, key: { season: 'autumn', movement: 2 }, nextKey: { season: 'autumn', movement: 3 }, mvFraction: 0.999999 });
  const start = sceneAt({ ...base, key: { season: 'autumn', movement: 3 }, nextKey: { season: 'winter', movement: 1 }, mvFraction: 0 });
  end.boxes.forEach((b, i) => {
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(b.min[k] - start.boxes[i].min[k]) < 0.05, `box ${i} min ${k}`);
      assert.ok(Math.abs(b.max[k] - start.boxes[i].max[k]) < 0.05, `box ${i} max ${k}`);
    }
  });
});

test('reduced motion freezes the slow drift', () => {
  const r = { ...base, reduced: true };
  assert.equal(flat(sceneAt(r)), flat(sceneAt({ ...r, t: r.t + 60_000 })));
});

test('the sun is high in summer at noon and low in winter', () => {
  const summer = lightAt({ hour: 12, seasonPhase: 0.375, drift: { az: 0, el: 0 } });
  const winter = lightAt({ hour: 12, seasonPhase: 0.875, drift: { az: 0, el: 0 } });
  assert.ok(summer.elevation > winter.elevation + 0.5);
  assert.equal(lightAt({ hour: 2, seasonPhase: 0.875, drift: { az: 0, el: 0 } }).day, 0);
});

test('the framing keeps the whole massing inside the given rectangle', () => {
  for (const movement of [1, 2, 3]) {
    const S = sceneAt({ ...base, key: { season: 'spring', movement }, mvFraction: 0.2 });
    const cam = cameraPose(S);
    const rect = [600, 60, 1440, 740];
    const fr = frame(S, cam, rect, 0);
    for (const b of S.boxes) {
      if (b.max[1] - b.min[1] < 1e-3) continue;
      for (let i = 0; i < 8; i++) {
        const p = project(cam, fr, [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
        assert.ok(p[0] >= rect[0] - 1 && p[0] <= rect[2] + 1 && p[1] >= rect[1] - 1 && p[1] <= rect[3] + 1, `movement ${movement}`);
      }
    }
  }
});
