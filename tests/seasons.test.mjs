import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seasonEvent, seasonAt, positionAt, scoreAt, fractionForBar } from '../docs/js/seasons.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../docs/audio/manifest.json', import.meta.url)));
const score = JSON.parse(fs.readFileSync(new URL('../docs/score/score.json', import.meta.url)));

test('equinoxes and solstices match published times (±2 min)', () => {
  const known = [
    [2026, 0, '2026-03-20T14:46Z'], [2026, 1, '2026-06-21T08:24Z'],
    [2026, 2, '2026-09-23T00:05Z'], [2026, 3, '2026-12-21T20:50Z'],
    [2024, 0, '2024-03-20T03:06Z'], [2030, 3, '2030-12-21T20:09Z'],
  ];
  for (const [y, k, iso] of known) {
    assert.ok(Math.abs(seasonEvent(y, k) - Date.parse(iso)) < 120_000, `${y}/${k}`);
  }
});

test('hemispheres are half a year apart', () => {
  const t = Date.parse('2026-07-01T00:00Z');
  assert.equal(seasonAt(t, 'north').season, 'summer');
  assert.equal(seasonAt(t, 'south').season, 'winter');
});

test('the recording position is continuous across season boundaries', () => {
  for (let k = 0; k < 4; k++) {
    const b = seasonEvent(2026, k);
    const before = positionAt(b - 1, manifest);
    const after = positionAt(b + 1, manifest);
    const gap = Math.abs(after.frame - before.frame);
    // winter → spring wraps from the end of the timeline to its start
    const wrapped = Math.abs(gap - manifest.totalFrames);
    assert.ok(Math.min(gap, wrapped) < 1, `boundary ${k}: gap ${gap}`);
  }
});

test('each concerto lasts exactly its season', () => {
  const p = positionAt(Date.parse('2026-05-01T00:00Z'), manifest);
  const frames = manifest.movements.filter((m) => m.season === 'spring');
  const len = (frames.at(-1).end - frames[0].start) / manifest.sampleRate;
  assert.ok(Math.abs(len * p.stretch - (p.end - p.start) / 1000) < 1e-3);
});

test('score map covers every bar and inverts', () => {
  for (const mv of score.movements) {
    const total = mv.systems.reduce((n, s) => n + s.bars.length - 1, 0);
    assert.equal(total, mv.measures);
    for (const f of [0, 0.1, 0.5, 0.9, 0.9999]) {
      const at = scoreAt(mv, f);
      assert.ok(at.x >= 0 && at.x <= 1);
      assert.ok(Math.abs(fractionForBar(mv, at.bar) - f) < 1e-6);
    }
  }
});
