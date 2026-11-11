import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seasonAt, positionAt, scoreAt, fractionForBar } from '../docs/js/seasons.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../docs/audio/manifest.json', import.meta.url)));
const score = JSON.parse(fs.readFileSync(new URL('../docs/score/score.json', import.meta.url)));

test('seasons follow the calendar (meteorological seasons)', () => {
  const at = (y, m, d, h = 12) => seasonAt(new Date(y, m - 1, d, h).getTime()).season;
  assert.equal(at(2026, 2, 28), 'winter');
  assert.equal(at(2026, 3, 1, 0), 'spring');
  assert.equal(at(2026, 5, 31, 23), 'spring');
  assert.equal(at(2026, 6, 1, 0), 'summer');
  assert.equal(at(2026, 8, 31), 'summer');
  assert.equal(at(2026, 9, 1, 0), 'autumn');
  assert.equal(at(2026, 11, 30, 23), 'autumn');
  assert.equal(at(2026, 12, 1, 0), 'winter');
  assert.equal(at(2027, 1, 15), 'winter');
  const s = seasonAt(new Date(2026, 9, 15).getTime());
  assert.equal(s.start, new Date(2026, 8, 1).getTime());
  assert.equal(s.end, new Date(2026, 11, 1).getTime());
});

test('hemispheres are half a year apart', () => {
  const t = new Date(2026, 6, 1, 12).getTime();
  assert.equal(seasonAt(t, 'north').season, 'summer');
  assert.equal(seasonAt(t, 'south').season, 'winter');
});

test('the recording position is continuous across season boundaries', () => {
  for (const month of [2, 5, 8, 11]) {
    const b = new Date(2026, month, 1).getTime();
    const k = month;
    const before = positionAt(b - 1, manifest);
    const after = positionAt(b + 1, manifest);
    const gap = Math.abs(after.frame - before.frame);
    // winter → spring wraps from the end of the timeline to its start
    const wrapped = Math.abs(gap - manifest.totalFrames);
    assert.ok(Math.min(gap, wrapped) < 1, `boundary ${k}: gap ${gap}`);
  }
});

test('each concerto lasts exactly its season', () => {
  const p = positionAt(new Date(2026, 3, 15).getTime(), manifest);
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
