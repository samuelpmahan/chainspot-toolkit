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
  writeFileSync(join(A, 's1', 'px.badges.json'), JSON.stringify({ image: { widthPx: 1290 }, badges: holes.map((h) => ({ label: String(h.number), bbox: [h.tee.xPx + 20, 200, 54, 42], px: [], mute: { px: [] } })) }));
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

// S5 pairs: read from the latest s5pair run, per fn.Tee.pairBadge variant; hole n's tee pairs with badge n.
test('judge: S5 pairs per variant, right / wrong / none / unjudged, unmatched badges, rows like S3 association', () => {
  const root = mkdtempSync(join(tmpdir(), 'judge-s5-'));
  const out = join(root, 'attempts', 'stages', 'att', 'fork', 'stage-output'), A = join(out, 'early', 'artifacts');
  for (const d of ['s1', 's2']) mkdirSync(join(A, d), { recursive: true });
  mkdirSync(join(root, 'testimony', 'golden'), { recursive: true });
  const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, tee: { xPx: 100 + 50 * i, yPx: 104 }, basket: { xPx: 100 + 50 * i, yPx: 504 }, corridorBends: [] }));
  writeFileSync(join(root, 'testimony', 'golden', 'x.annotation.json'), JSON.stringify({ holes }));
  writeFileSync(join(A, 's1', 'px.badges.json'), JSON.stringify({ image: { widthPx: 1290 }, badges: holes.map((h) => ({ label: String(h.number), bbox: [h.tee.xPx + 20, 200, 54, 42], px: [], mute: { px: [] } })) }));
  writeFileSync(join(A, 's2', 'px.baskets.json'), JSON.stringify({ baskets: [] }));
  const badges = holes.map((h) => ({ label: String(h.number), plateCenter: [h.tee.xPx + 47, 221] }));
  const pairsOf = (wrongAt, noneAt) => holes.slice(0, 17).map((h, i) => ({ tee: `Tee c${String.fromCharCode(97 + i)}`, origin: 'S3 observed', center: [h.tee.xPx, 100.5], badge: i === noneAt ? null : String(i === wrongAt ? 18 : h.number), angleResidualDeg: 0.2, signedPerpPx: 0.1 }));
  const run = join(out, 's5pair', 'run-2026-10-18T00-00-00-000Z');
  for (const [v, pairs] of [['toolkit', pairsOf(-1, -1)], ['pinned', pairsOf(2, 5)]]) {
    mkdirSync(join(run, 'artifacts', 'fn.Tee.pairBadge', v), { recursive: true });
    writeFileSync(join(run, 'artifacts', 'fn.Tee.pairBadge', v, 'pairs.json'), JSON.stringify({ pairs, badges, laneNotRun: null }));
  }
  writeFileSync(join(run, 'cmp.fn.Tee.pairBadge.json'), JSON.stringify({ accepted: 'toolkit', acceptRule: 'r', acceptedBy: 'best judged result' }));
  const r = judgeAttempt({ specimen: 'golden', attempt: 'att', root }).stages.S5pairs;
  assert.equal(r.accepted, 'toolkit');
  const t = r.variants.toolkit, p = r.variants.pinned;
  assert.deepEqual([t.right, t.wrong, t.none, t.unjudged], [17, 0, 0, 0]); assert.deepEqual(t.unmatchedBadges, ['Badge 18']); assert.deepEqual(t.holesWithNoTee, ['Tee 18']);
  assert.deepEqual([p.right, p.wrong, p.none, p.unjudged], [15, 1, 1, 0]);
  assert.deepEqual(p.incorrect, ['Tee cc -> Badge 18, is Tee 3']); assert.deepEqual(p.notPaired, ['Tee cf (is Tee 6)']);
  assert.deepEqual(Object.keys(p.rows[2]), ['hole', 'name', 'origin', 'point', 'said', 'saidCenter', 'truthCenter', 'verdict', 'teeErrorPx', 'residualDeg', 'signedPerpPx']);
  assert.deepEqual(p.rows[2].truthCenter, badges[2].plateCenter);
});
