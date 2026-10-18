import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createPartStore, registerQueries, RENDER_PART } from '../../fg/store.mjs';
import { comparableForkJoin } from '../../fg/forkjoin.mjs';
import { discoverImplementations } from '../../fg/discover.mjs';
import { PAIR_QUERIES } from '../../fg/queries/pair.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { MATCH_PX } from '../judge/judge.mjs';
import { PAIR_SLOT, judgePairs } from './pairBadge.mjs';
import { GUARANTEES } from './guarantees.mjs';
import { comparePairs, pairsSvg, joinTees } from './compare.mjs';
import { acceptRule, latePinnedPart } from './run.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

// A synthetic course: 4 badges in a row at y = 20; tee n sits 60 px below badge n, its axis vertical (pointing at it).
const W = 200, H = 120;
const badgeAt = (n) => [20 + 40 * (n - 1), 20];
const badges = [1, 2, 3, 4].map((n) => ({ label: String(n), bbox: [badgeAt(n)[0] - 10, 10, 20, 20], px: [], has: {} }));
const teeAt = (n) => [badgeAt(n)[0], 80];
const points = [1, 2, 3, 4].map((n) => ({ hole: n, canonical: teeAt(n) }));

test('judgePairs: hole n\'s tee pairs with badge n; right / wrong / none / unjudged, unmatched badges, holes with no tee', () => {
  const plates = [1, 2, 3, 4].map((n) => ({ label: String(n), plateCenter: badgeAt(n) }));
  const pairs = [
    { tee: 'Tee ca', origin: 'S3 observed', center: [20.5, 80.5], badge: '1', angleResidualDeg: 0.5, signedPerpPx: 0.5 },   // right
    { tee: 'Tee cb', origin: 'S3 observed', center: [60, 81], badge: '3', angleResidualDeg: 30, signedPerpPx: 34 },         // wrong: is hole 2
    { tee: 'S4 Tee ca', origin: 'S4 recovered', center: [100, 79], badge: null },                                             // none: is hole 3
    { tee: 'Tee cc', origin: 'S3 observed', center: [180, 100], badge: '4', angleResidualDeg: 20, signedPerpPx: 20 }          // unjudged: no point within 8 px
  ];
  const j = judgePairs(pairs, points, plates);
  assert.deepEqual(j.rows.map((r) => r.verdict), ['right', 'wrong', 'none', 'unjudged']);
  assert.deepEqual(j.rows.map((r) => r.hole), [1, 2, 3, null]);
  assert.deepEqual(j.totals, { tees: 4, right: 1, wrong: 1, none: 1, unjudged: 1, unmatchedBadges: 1, missingTees: 1 });
  assert.deepEqual(j.unmatchedBadges, ['2']); assert.deepEqual(j.missingTees, [4]);
  assert.deepEqual(j.rows[1].saidCenter, badgeAt(3)); assert.deepEqual(j.rows[1].truthCenter, badgeAt(2));
  assert.equal(PAIR_SLOT.matchPx, MATCH_PX.tee, 'one match rule per kind: the judge\'s tee radius');
});

test('acceptRule: best judged result, ties to the fastest; a lane not run is no candidate; no testimony takes the annotated courses\' pointer', () => {
  const branches = { a: { error: null }, b: { error: null }, c: { error: null } };
  const timingsMs = { a: { ms: 5 }, b: { ms: 1 }, c: { ms: 0.1 } };
  const value = { variants: { a: { right: 18, wrong: 0, none: 0 }, b: { right: 18, wrong: 0, none: 0 }, c: { right: 0, wrong: 0, none: 0, laneNotRun: 'late S5 not run' } } };
  const acc = acceptRule();
  assert.equal(acc(value, { names: ['a', 'b', 'c'], branches, timingsMs }), 'b');
  assert.match(acc.decided, /tie on judged result among a, b: fastest standalone/);
  assert.equal(acceptRule()({ variants: { ...value.variants, a: { right: 18, wrong: 0, none: 0 }, b: { right: 17, wrong: 1, none: 0 } } }, { names: ['a', 'b', 'c'], branches, timingsMs }), 'a');
  const blind = acceptRule({ judged: false, acceptedElsewhere: 'a' });
  assert.equal(blind(value, { names: ['a', 'b', 'c'], branches, timingsMs }), 'a'); assert.equal(blind.decided, 'annotated courses');
  const none = acceptRule({ judged: false });
  assert.equal(none(value, { names: ['a', 'b', 'c'], branches, timingsMs }), null); assert.equal(none.decided, 'nothing');
});

test('latePinnedPart: a missing pinned S5 is a recorded result, never a throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 's5late-'));
  assert.match(latePinnedPart(dir, 4).laneNotRun, /late S5 not run/);
  writeFileSync(join(dir, 's5-pairs.json'), JSON.stringify({ rows: [] }));
  assert.match(latePinnedPart(dir, 4).laneNotRun, /s5\.globalAssignment not run/);
  writeFileSync(join(dir, 's5-global-assignment.json'), JSON.stringify({ assignment: { status: 'FULL', selected: [{ id: 'ray:t0:plus:b0', teeId: 't0', badgeId: 'b0' }], unusedTeeIds: ['t1'], unmatchedBadgeIds: [] } }));
  writeFileSync(join(dir, 'geometry.json'), JSON.stringify({ baselineAxes: { visible: [{ detId: 't0', center: [20, 84], angleRad: Math.PI / 2 }, { detId: 't1', center: [180, 104], angleRad: 0 }], recovered: [], unknown: [] } }));
  writeFileSync(join(dir, 's5-pairs.json'), JSON.stringify({ rows: [{ teeId: 't0', badgeId: 'b0', holeRead: '1', angleResidualDeg: 0, signedPerpPx: 0 }] }));
  const p = latePinnedPart(dir, 4);
  assert.equal(p.laneNotRun, null);
  assert.deepEqual(p.axes[0].center, [20, 80], 'source px -> canonical: y - upperRowsRemoved');
  assert.deepEqual(p.selected, [{ teeId: 't0', badgeId: 'b0', holeRead: '1', hitId: 'ray:t0:plus:b0', angleResidualDeg: 0, signedPerpPx: 0 }]);
});

function fixtureStore({ late, testimony = true }) {
  const rgba = new Uint8Array(W * H * 4);
  const board = new Map([['px.badges', badges], ['px.image.cropped', { widthPx: W, heightPx: H, rgba }]]);
  const base = { has: (a) => board.has(a), get: (a) => board.get(a) };
  const store = createPartStore({ name: 's5-test', base });
  const rows = [1, 2, 3].map((n, i) => ({ tee: `t${i}`, candidate: ['Tee ca', 'Tee cb', 'Tee cc'][i], center: teeAt(n), thDeg: 90, best: n === 3 ? null : { badge: String(n === 2 ? 1 : n), z: 0.4, resDeg: 0.1 }, verdict: n === 3 ? 'NO_CONSISTENT_BADGE' : 'ASSOCIATED' }));
  store.constant('fn.tk.s5pair.laneOutputs', {
    'px.tees.association': { rows },
    'px.tees.recovered': { variant: 'greedyOccluded', recovered: [{ hole: '4', center: teeAt(4), angleRad: Math.PI / 2 + 0.01, rule: 'greedy' }] },
    'tk.s5.latePinned': late,
    'testimony.source.teePoints': testimony ? { path: 'testimony/x', rule: 'fixture', points } : { path: null, rule: 'blind', points: [] }
  });
  for (const [fn, spec] of S4_CALCULATIONS.filter(([fn]) => fn === 'fn.tk.s4.badgePlates')) store.register(fn, spec);
  registerQueries(store, PAIR_QUERIES);
  return { store, base };
}

test('fn.Tee.pairBadge fork-join: toolkit pairs S3 + S4 tees with residuals from the store; pinned without its lane records why', async () => {
  const implementations = await discoverImplementations(join(ROOT, 'impl'), PAIR_SLOT.slot);
  assert.ok(['toolkit', 'pinned'].every((n) => n in implementations), 'both implementations are discovered');
  const { store, base } = fixtureStore({ late: { laneNotRun: 'late S5 not run (fixture)', axes: [], selected: [], unusedTeeIds: [], unmatchedBadgeIds: [] } });
  const accept = acceptRule();
  const result = comparableForkJoin({ slot: PAIR_SLOT.slot, part: PAIR_SLOT.part, implementations, store, restore: () => base,
    apply: (parts, impl, name) => ({ slot: PAIR_SLOT.slot, implementation: name, ...impl(parts) }), guarantees: GUARANTEES, compare: comparePairs({ parentStore: store }), accept });
  const v = result.comparison.value;
  assert.equal(result.branches.toolkit.error, null); assert.equal(result.branches.pinned.error, null);
  const t = v.variants.toolkit;
  assert.deepEqual([t.right, t.wrong, t.none, t.unjudged], [2, 1, 1, 0], 'tee 1 right, tee 2 said badge 1 (wrong), tee 3 no badge (none), the S4 tee for badge 4 right');
  assert.deepEqual(t.unmatchedBadgeLabels, ['2', '3']);
  assert.match(v.variants.pinned.laneNotRun, /late S5 not run/);
  assert.equal(result.comparison.accepted, 'toolkit', 'pinned did not run, so it is no candidate');
  const pairs = store.get(PAIR_SLOT.part).pairs;   // the pointer: px.tees.pairs follows the accepted variant
  assert.equal(pairs.length, 4);
  assert.equal(pairs[0].angleResidualDeg, 0, 'tee 1 points straight at its plate');
  assert.ok(Math.abs(pairs[3].angleResidualDeg - 0.573) < 0.01, 'the S4 tee is 0.01 rad off its ray');
  assert.ok(store.calls().some((e) => e.calculation === 'fn.q.pair.axisResidual'), 'the residual is a profiled store query');
  assert.ok(result.branches.toolkit.records[PAIR_SLOT.materialize].totals.paired === 3);
  assert.notEqual(store.call(RENDER_PART, { a: PAIR_SLOT.part }).value.kind, 'unrenderable', 'px.tees.pairs renders');
  assert.ok(v.disagreements.length === 0, 'a variant whose lane did not run is not compared tee by tee');
  const svg = pairsSvg({ title: 't', rows: result.branches.toolkit.records[PAIR_SLOT.testimony].rows, widthPx: W, heightPx: H });
  assert.match(svg, /Tee cb -&gt; Badge 1, [0-9.]+ deg \(is hole 2\)/, 'a wrong pair is labelled with the hole it is');
});

test('pinned pairs, one tee each; materialize fails a tee paired twice by name', async () => {
  const late = { laneNotRun: null, assignmentStatus: 'FULL', axes: [{ detId: 't0', kind: 'visible', center: teeAt(1), angleRad: Math.PI / 2 }, { detId: 't1', kind: 'recovered', center: teeAt(2), angleRad: Math.PI / 2 }],
    selected: [{ teeId: 't0', badgeId: 'b0', holeRead: '1', hitId: 'h0' }, { teeId: 't1', badgeId: 'b1', holeRead: '2', hitId: 'h1' }], unusedTeeIds: [], unmatchedBadgeIds: ['b2', 'b3'] };
  const { store, base } = fixtureStore({ late });
  const implementations = await discoverImplementations(join(ROOT, 'impl'), PAIR_SLOT.slot);
  const dup = { calculate: (parts) => ({ rule: 'dup', units: implementations.toolkit.calculate(parts).units, pairs: [0, 1].map(() => ({ tee: 'Tee ca', origin: 'S3 observed', teeIndex: 0, center: teeAt(1), angleRad: 1.5, badge: null })) }), reads: implementations.toolkit.reads, calls: implementations.toolkit.calls };
  const result = comparableForkJoin({ slot: PAIR_SLOT.slot, part: PAIR_SLOT.part, implementations: { pinned: implementations.pinned, dup }, store, restore: () => base,
    apply: (parts, impl, name) => ({ slot: PAIR_SLOT.slot, implementation: name, ...impl(parts) }), guarantees: GUARANTEES, compare: comparePairs({ parentStore: store }), accept: acceptRule() });
  const p = result.comparison.value.variants.pinned;
  assert.deepEqual([p.right, p.wrong, p.none, p.unjudged], [2, 0, 0, 0]);
  assert.match(result.branches.dup.error.message, /everyTeeAtMostOnce/);
  assert.equal(result.comparison.accepted, 'pinned');
  assert.deepEqual(joinTees({ a: [{ center: [0, 0] }], b: [{ center: [3, 4] }, { center: [50, 50] }] }).map((i) => i.members), [{ a: 0, b: 0 }, { b: 1 }], 'tees join one-to-one within 8 px');
});
