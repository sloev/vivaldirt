import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, makeLayout, squareToQuad, invert3, apply3 } from '../docs/js/composition.js';

const base = {
  t: Date.parse('2026-11-11T22:00:00Z'), A: 1.6, key: 'autumn3', nextKey: 'winter1', mvFraction: 0.4,
  season: 'autumn', nextSeason: 'winter', seasonFraction: 0.8, intensity: 0.5, hour: 14, reduced: false,
};
const flat = (c) => JSON.stringify(c);

test('the artwork is a deterministic function of time and music', () => {
  assert.equal(flat(compose(base)), flat(compose({ ...base })));
  assert.notEqual(flat(compose(base)), flat(compose({ ...base, t: base.t + 60_000 })));
});

test('each movement has its own architecture, for landscape and portrait', () => {
  const keys = ['spring1', 'spring2', 'summer1', 'winter3'];
  for (const A of [1.6, 0.46]) {
    const set = new Set(keys.map((k) => JSON.stringify(makeLayout(k, A))));
    assert.equal(set.size, keys.length);
  }
});

test('stays within the renderer limits', () => {
  for (const A of [0.46, 0.75, 1, 1.6, 2.4]) {
    for (const intensity of [0, 1]) {
      const c = compose({ ...base, A, intensity });
      assert.ok(c.faces.length <= 12);
      assert.equal(c.ribbons.length, 2);
    }
  }
});

test('movement hand-over is continuous', () => {
  const end = compose({ ...base, key: 'autumn2', nextKey: 'autumn3', mvFraction: 0.999999 });
  const start = compose({ ...base, key: 'autumn3', nextKey: 'winter1', mvFraction: 0 });
  const pts = (c) => c.faces.flatMap((f) => f.pts.flat());
  const a = pts(end);
  const b = pts(start);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-3, `point ${i}`);
  assert.ok(Math.abs(end.drift[0] - start.drift[0]) < 1e-3);
});

test('reduced motion freezes the slow drift', () => {
  const r = { ...base, reduced: true };
  assert.equal(flat(compose(r).faces), flat(compose({ ...r, t: r.t + 60_000 }).faces));
});

test('homography maps the unit square onto the quad and back', () => {
  const q = [[0, 0.4], [1.2, 0.2], [1.1, 0.5], [0, 0.7]];
  const H = squareToQuad(q);
  const I = invert3(H);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
    const p = apply3(H, u, v);
    assert.ok(Math.hypot(p[0] - q[i][0], p[1] - q[i][1]) < 1e-9);
    const back = apply3(I, p[0], p[1]);
    assert.ok(Math.hypot(back[0] - u, back[1] - v) < 1e-9);
  });
});
