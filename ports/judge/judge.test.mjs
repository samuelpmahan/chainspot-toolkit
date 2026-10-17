import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { judgeAttempt } from './judge.mjs';

// A tiny synthetic course: 18 annotated holes, S2 finds baskets for holes 1..17 plus one stray, S3 finds tees 1..16.
test('judge: named TP/FN/FP and association counts against complete testimony', () => {
  const root = mkdtempSync(join(tmpdir(), 'judge-'));
  const A = join(root, 'attempts', 'stages', 'att', 'fork', 'stage-output', 'early', 'artifacts');
  for (const d of ['s1', 's2', 's3fix']) mkdirSync(join(A, d), { recursive: true });
  mkdirSync(join(root, 'attempts', 'stages', 'att', 'fork', 'stage-output', 's3assoc'), { recursive: true });
  mkdirSync(join(root, 'testimony', 'golden'), { recursive: true });
  const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, tee: { xPx: 100 + 50 * i, yPx: 104 }, basket: { xPx: 100 + 50 * i, yPx: 504 }, corridorBends: i % 2 ? [{ xPx: 1, yPx: 1 }] : [] }));
  writeFileSync(join(root, 'testimony', 'golden', 'x.annotation.json'), JSON.stringify({ holes }));
  writeFileSync(join(A, 's1', 'px.badges.json'), JSON.stringify({ image: { widthPx: 1290 }, badges: holes.map((h) => ({ label: String(h.number), px: [], mute: { px: [] } })) }));
  const bb = (x, y) => [x - 22.5 - 0.34, y - 71 - 0.73, 46, 72];
  writeFileSync(join(A, 's2', 'px.baskets.json'), JSON.stringify({ baskets: [...holes.slice(0, 17).map((h) => ({ bbox: bb(h.basket.xPx, 500), px: [] })), { bbox: bb(1200, 900), px: [] }] }));
  writeFileSync(join(A, 's3fix', 'px.tees.refined.json'), JSON.stringify({ tees: holes.slice(0, 16).map((h) => ({ center: [h.tee.xPx, 100] })) }));
  writeFileSync(join(root, 'attempts', 'stages', 'att', 'fork', 'stage-output', 's3assoc', 'px.tees.association.json'),
    JSON.stringify({ rows: holes.slice(0, 16).map((h, i) => ({ best: { badge: String(i === 3 ? 9 : h.number) }, straight3: null })) }));
  const r = judgeAttempt({ specimen: 'golden', attempt: 'att', root });
  assert.equal(r.stages.S2.found, 18); assert.equal(r.stages.S2.TP, 17); assert.equal(r.stages.S2.FN, 1); assert.equal(r.stages.S2.FP, 1);
  assert.deepEqual(r.stages.S2.fn, ['Basket 18']);
  assert.equal(r.stages.S3.TP, 16); assert.equal(r.stages.S3.FN, 2);
  assert.equal(r.stages.S3association.associatedCorrectly, 15); assert.equal(r.stages.S3association.associatedIncorrectly, 1);
  assert.match(r.stages.S3association.incorrect[0], /-> Badge 9, is Tee 4$/);
});
