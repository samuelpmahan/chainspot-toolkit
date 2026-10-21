import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignMinCost, assignSquare } from './assign.mjs';
import { pointerRule } from './pointerRule.mjs';
import { readJson, readOpt, latestRun, findKey } from './files.mjs';

// ------------------------------------------------------------------ assign: brute force on small matrices
function brute(cost) {
  const n = cost.length, m = cost[0].length;
  let best = [-1, Infinity];                                    // [pairs with finite cost, total]
  const rec = (i, usedCols, count, sum) => {
    if (i === n) { if (count > best[0] || (count === best[0] && sum < best[1])) best = [count, sum]; return; }
    rec(i + 1, usedCols, count, sum);                            // row i unassigned
    for (let j = 0; j < m; j++) if (!usedCols.has(j) && Number.isFinite(cost[i][j])) rec(i + 1, new Set([...usedCols, j]), count + 1, sum + cost[i][j]);
  };
  rec(0, new Set(), 0, 0);
  return best;
}
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

test('assignMinCost: optimal on random rectangular matrices, Infinity forbidden', () => {
  for (let t = 0; t < 60; t++) {
    const n = 1 + Math.floor(rnd() * 4), m = 1 + Math.floor(rnd() * 4);
    const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => (rnd() < 0.25 ? Infinity : Math.round(rnd() * 20))));
    const pairs = assignMinCost(cost);
    assert.equal(new Set(pairs.map((p) => p[0])).size, pairs.length);
    assert.equal(new Set(pairs.map((p) => p[1])).size, pairs.length);
    for (const [i, j] of pairs) assert.ok(Number.isFinite(cost[i][j]));
    const total = pairs.reduce((s, [i, j]) => s + cost[i][j], 0);
    const [count, sum] = brute(cost);
    assert.equal(pairs.length, count, JSON.stringify(cost));
    assert.equal(total, sum, JSON.stringify(cost));
  }
});

test('assignMinCost: empty and fully forbidden', () => {
  assert.deepEqual(assignMinCost([]), []);
  assert.deepEqual(assignMinCost([[]]), []);
  assert.deepEqual(assignMinCost([[Infinity]]), []);
});

test('assignSquare: the shape associate.mjs returned (row -> column); beats greedy', () => {
  assert.deepEqual(assignSquare([[1, 2], [3, 10]]), [1, 0]);
  assert.deepEqual(assignSquare([]), []);
});

// ------------------------------------------------------------------ pointerRule
const branches = (o) => Object.fromEntries(Object.entries(o).map(([n, error]) => [n, { error }]));
const timings = { a: { ms: 30 }, b: { ms: 10 }, c: { ms: 20 } };
const rule = pointerRule({ judgedRule: 'R', variantsOf: (v) => v.variants, score: (b) => [-(b.right ?? -1), b.wrong ?? Infinity], excludeLaneNotRun: true });

test('pointerRule: best judged result wins; ties go to the fastest; lane-not-run and errored variants are no candidates', () => {
  const value = { variants: { a: { right: 18, wrong: 0 }, b: { right: 17, wrong: 1 }, c: { right: 18, wrong: 0 }, d: { right: 99, wrong: 0, laneNotRun: true } } };
  const acc = rule();
  assert.equal(acc.rule, 'R');
  assert.equal(acc(value, { names: ['a', 'b', 'c', 'd'], branches: branches({ a: null, b: null, c: null, d: null }), timingsMs: { ...timings, d: { ms: 1 } } }), 'c');
  assert.match(acc.decided, /^tie on judged result among a, c/);
  assert.equal(acc(value, { names: ['a', 'b', 'c'], branches: branches({ a: null, b: null, c: 'boom' }), timingsMs: timings }), 'a');
  assert.equal(acc.decided, 'best judged result');
  assert.equal(acc(value, { names: ['b'], branches: branches({ b: null }), timingsMs: timings }), 'b');
  assert.equal(acc(value, { names: ['c'], branches: branches({ c: 'boom' }), timingsMs: timings }), null);
  assert.equal(acc.decided, 'nothing');
});

test('pointerRule: without testimony the annotated courses\' pointer is taken when it ran', () => {
  const value = { variants: { a: {}, b: {} } };
  const blind = rule({ judged: false, acceptedElsewhere: 'b' });
  assert.match(blind.rule, /^no testimony: the variant the annotated courses accepted \(b\)$/);
  assert.equal(blind(value, { names: ['a', 'b'], branches: branches({ a: null, b: null }), timingsMs: timings }), 'b');
  assert.equal(blind.decided, 'annotated courses');
  assert.equal(blind(value, { names: ['a'], branches: branches({ a: null }), timingsMs: timings }), null);
  assert.equal(blind.decided, 'nothing');
  assert.match(rule({ judged: false }).rule, /none on record: no pointer/);
});

test('pointerRule: lane-not-run is only excluded when asked for', () => {
  const plain = pointerRule({ judgedRule: 'R', variantsOf: (v) => v.branches, score: (b) => [b.x] });
  const value = { branches: { a: { x: 5, laneNotRun: true }, b: { x: 9 } } };
  assert.equal(plain()(value, { names: ['a', 'b'], branches: branches({ a: null, b: null }), timingsMs: timings }), 'a');
});

// ------------------------------------------------------------------ files
test('files: readJson, readOpt, latestRun, findKey', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ports-lib-'));
  try {
    writeFileSync(join(dir, 'x.json'), '{"a":{"b":{"k":7}}}');
    assert.deepEqual(readJson(join(dir, 'x.json')), { a: { b: { k: 7 } } });
    assert.deepEqual(readOpt(join(dir, 'x.json'), 'none'), { a: { b: { k: 7 } } });
    assert.equal(readOpt(join(dir, 'missing.json'), 'none'), 'none');
    assert.equal(latestRun(join(dir, 'nope')), null);
    mkdirSync(join(dir, 'runs/run-2026-01'), { recursive: true });
    mkdirSync(join(dir, 'runs/run-2026-03'), { recursive: true });
    mkdirSync(join(dir, 'runs/other'), { recursive: true });
    assert.equal(latestRun(join(dir, 'runs')), 'run-2026-03');
    assert.equal(findKey({ a: { b: { k: 7 } } }, 'k'), 7);
    assert.equal(findKey({ k: 1, a: { k: 2 } }, 'k'), 1);
    assert.equal(findKey({ a: [1] }, 'zzz'), undefined);
    assert.equal(findKey(null, 'k'), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
