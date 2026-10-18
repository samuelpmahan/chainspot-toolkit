import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { associate, straight3Test, basketPoint } from '../s3assoc/associate.mjs';
import { pairsOf, basketsOf, pinnedOf, holeQueries, S6_CALCULATIONS, HOLE_STRAIGHT_SLOT, verdictCounts } from './holeStraight.mjs';
import { judgeStraight, GUARANTEES } from './guarantees.mjs';
import { compareStraight, drawCourse } from './compare.mjs';
import { acceptRule } from './run.mjs';
import { straightSvg } from './render.mjs';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { comparableForkJoin } from '../../fg/forkjoin.mjs';
import { discoverImplementations } from '../../fg/discover.mjs';
import { renderValue } from '../../fg/render.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
// a basket sprite bbox whose BasketPoint is (x, y)
const bboxAt = ([x, y]) => [x - 22.5 - 0.34, y - 71 - 0.73, 46, 72];

// A synthetic course: hole 1 straight (tee, badge, basket on one line), hole 2 bent (basket off the line),
// hole 3 a recovered tee whose line reaches a recovered (S4) basket.
const badges = [{ label: '1', bbox: [190, 90, 21, 21] }, { label: '2', bbox: [190, 290, 21, 21] }, { label: '3', bbox: [390, 490, 21, 21] }];
const badgeCenters = badges.map((b) => ({ label: b.label, center: [b.bbox[0] + 10, b.bbox[1] + 10] }));
const s2 = [{ bbox: bboxAt([400, 100]) }, { bbox: bboxAt([400, 360]) }];
const recoveredBoxes = [bboxAt([600, 500])];
const association = { rows: [
  { tee: 'tee-0', candidate: 'Tee ca', center: [100, 100], pose: { cx: 100, cy: 100, thDeg: 0 }, best: { badge: '1' }, verdict: 'ASSOCIATED' },
  { tee: 'tee-1', candidate: 'Tee cb', center: [100, 300], pose: { cx: 100, cy: 300, thDeg: 0 }, best: { badge: '2' }, verdict: 'ASSOCIATED' },
  { tee: 'tee-2', candidate: 'Tee cc', center: [700, 700], pose: null, best: null, verdict: 'NO_CONSISTENT_BADGE' }
] };
const s4 = { accepted: 'greedyOccluded', recovered: [{ hole: '3', center: [300, 500], angleRad: 0 }] };
const holes = [
  { hole: '1', tee: [100, 101], basket: [400, 97], bends: [], bent: false },
  { hole: '2', tee: [100, 300], basket: [400, 360], bends: [[300, 300]], bent: true },
  { hole: '3', tee: [302, 500], basket: [600, 500], bends: [], bent: false }
];

test('straight3Test is the 3-point math associate runs (one copy, identical answers)', () => {
  const bps = s2.map((k, i) => ({ index: i, point: basketPoint(k.bbox) }));
  const rows = associate({ tees: [{ label: 'a', center: [100, 100], thRad: 0 }, { label: 'b', center: [100, 300], thRad: 0 }], badges: badgeCenters.slice(0, 2), baskets: s2.map((k, i) => ({ index: i, bbox: k.bbox })), padLengthPx: 30 });
  for (const r of rows) assert.deepEqual(straight3Test(r.center, badgeCenters.find((b) => b.label === r.best.badge).center, bps), r.straight3);
  assert.equal(rows[0].straight3.verdict, 'STRAIGHT'); assert.equal(rows[1].straight3.verdict, 'BENT_OR_BASKET_UNSEEN');
});

test('pairs after S4: observed with their badge, recovered with forHole; baskets S2 + S4 with BasketPoints', () => {
  const pairs = pairsOf(association, s4, badgeCenters);
  assert.deepEqual(pairs.map((p) => [p.id, p.hole, p.source, p.tee.name]), [['P0', '1', 'S3 observed', 'Tee ca'], ['P1', '2', 'S3 observed', 'Tee cb'], ['P2', '3', 'S4 recovered (greedyOccluded)', 'S4 Tee ca']]);
  const baskets = basketsOf(s2, recoveredBoxes);
  assert.deepEqual(baskets.map((k) => [k.index, k.name, k.source]), [[0, 'Basket ca', 'S2'], [1, 'Basket cb', 'S2'], [2, 'S4 Basket ca', 'S4 recovered']]);
  for (const [k, p] of [[0, [400, 100]], [2, [600, 500]]]) assert.ok(Math.hypot(baskets[k].point[0] - p[0], baskets[k].point[1] - p[1]) < 1e-9);
});

test('pinned: rows of the pair (same badge, tee within 8 px); candidate -> straight basket by the 12 px rule; lane not run when absent', () => {
  const pair = pairsOf(association, s4, badgeCenters)[0], baskets = basketsOf(s2, recoveredBoxes);
  assert.match(pinnedOf({ absent: 'late S6 not run' }, pair, baskets).condition, /^lane not run/);
  const late = { candidateStatus: 'C', templateTops: { k0: { bbox: s2[0].bbox } }, rows: [
    { id: 'r0', holeRead: '1', basketId: 'k0', teeCenter: [101, 100], status: 'C', reasons: [], topSignedPerpPx: 1.2, badgeSignedPerpPx: 0.3 },
    { id: 'r1', holeRead: '1', basketId: 'k0', teeCenter: [130, 100], status: 'C', reasons: [], topSignedPerpPx: 0.1, badgeSignedPerpPx: 0.1 }] };
  const r = pinnedOf(late, pair, baskets);
  assert.equal(r.rows, 1, 'the tee 30 px away is another tee'); assert.equal(r.row, 'r0'); assert.equal(r.basket.name, 'Basket ca');
  assert.match(pinnedOf({ ...late, rows: [] }, pair, baskets).condition, /no pinned two-ray row/);
});

test('judgeStraight: TP / FP / FN / TN, wrong basket, unjudged (hole not annotated, tee not the hole\'s)', () => {
  const v = (pair, hole, verdict, center, basket = null) => ({ pair, hole, source: 'S3 observed', tee: { name: `Tee ${pair}`, center }, badge: { label: hole, center: [0, 0] }, verdict, basket, condition: null });
  const k = (name, point) => ({ index: 0, name, source: 'S2', point });
  const j = judgeStraight([
    v('P0', '1', 'straight', [100, 100], k('Basket ca', [400, 100])), v('P1', '2', 'straight', [100, 300], k('Basket cb', [400, 360])),
    v('P2', '3', 'bent', [300, 500]), v('P3', '2', 'bent', [100, 300]), v('P4', '3', 'straight', [300, 500], k('Basket cz', [500, 500])),
    v('P5', '9', 'straight', [0, 0], k('Basket ca', [400, 100])), v('P6', '1', 'unknown', [150, 100])], holes);
  assert.deepEqual(j.rows.map((r) => r.outcome), ['TP', 'FP', 'FN', 'TN', 'TP', 'unjudged', 'unjudged']);
  assert.deepEqual(j.totals, { judgedPairs: 5, TP: 2, FP: 1, FN: 1, TN: 1, unknownJudged: 0, straightWithWrongBasket: 1, unjudged: 2 });
  assert.equal(j.rows[4].basketAgrees, false); assert.equal(j.rows[0].pass, true); assert.equal(j.rows[4].pass, false);
  assert.match(j.rows[6].why, /not hole 1's tee/);
});

test('acceptRule: lane-not-run variants excluded; fewest FP, then FN; ties fastest; unjudged takes the annotated courses\' pointer', () => {
  const branches = { a: { error: null }, b: { error: null }, c: { error: null }, d: { error: { message: 'x' } } };
  const value = { branches: { a: { FP: 0, FN: 2 }, b: { FP: 0, FN: 2 }, c: { FP: 0, FN: 0, laneNotRun: true }, d: { FP: 0, FN: 0 } } };
  const t = { a: { ms: 5 }, b: { ms: 1 }, c: { ms: 0 }, d: { ms: 0 } };
  const acc = acceptRule({ judged: true });
  assert.equal(acc(value, { names: ['a', 'b', 'c', 'd'], branches, timingsMs: t }), 'b'); assert.match(acc.decided, /tie/);
  const acc2 = acceptRule({ judged: true });
  assert.equal(acc2({ branches: { ...value.branches, a: { FP: 0, FN: 1 } } }, { names: ['a', 'b', 'c', 'd'], branches, timingsMs: t }), 'a');
  assert.equal(acceptRule({ judged: false, acceptedElsewhere: 'a' })(value, { names: ['a', 'b'], branches, timingsMs: t }), 'a');
  assert.equal(acceptRule({ judged: false, acceptedElsewhere: 'c' })(value, { names: ['a', 'b', 'c'], branches, timingsMs: t }), null, 'a lane-not-run pointer is no pointer');
  assert.equal(acceptRule({ judged: false })(value, { names: ['a'], branches, timingsMs: t }), null);
});

test('the fork-join on a synthetic store: every impl, one verdict per pair, judged, compared, pointer by the rule, renderable', async () => {
  const W = 800, H = 800, rgba = new Uint8Array(W * H * 4).fill(120);
  const board = new Map([['px.badges', badges], ['px.baskets', s2], ['px.image.cropped', { rgba, widthPx: W, heightPx: H }]]);
  const store = createPartStore({ name: 's6-test', base: { has: (a) => board.has(a), get: (a) => board.get(a) } });
  store.constant('fn.tk.s6straight.laneOutputs', { 'tk.s6.association': association, 'tk.s6.s4Recovered': s4, 'tk.s6.basketRecovery': { recoveredBoxes },
    'tk.s6.lateS6': { absent: 'late S6 not run (test)', rows: [], templateTops: {} }, 'testimony.source.holes': { path: 'test', rule: 'synthetic', holes } });
  for (const [fn, spec] of S6_CALCULATIONS) store.register(fn, spec);
  registerQueries(store, holeQueries((a) => store.get(a)), { resolve: (r) => r });
  const implementations = await discoverImplementations(join(ROOT, 'impl'), HOLE_STRAIGHT_SLOT.slot);
  assert.deepEqual(Object.keys(implementations).sort(), ['pathLoss', 'pinned', 'straight3']);
  const accept = acceptRule({ judged: true });
  const r = comparableForkJoin({ slot: HOLE_STRAIGHT_SLOT.slot, part: HOLE_STRAIGHT_SLOT.part, implementations, store, restore: () => ({ has: (a) => board.has(a), get: (a) => board.get(a) }),
    apply: (parts, impl, name) => ({ implementation: name, ...impl(parts) }), guarantees: GUARANTEES, compare: compareStraight({ parentStore: store }), accept });
  for (const n of ['pathLoss', 'pinned', 'straight3']) assert.equal(r.branches[n].error, null, `${n}: ${r.branches[n].error?.message}`);
  const b = r.comparison.value.branches;
  assert.deepEqual([b.straight3.TP, b.straight3.FP, b.straight3.FN, b.straight3.TN], [2, 0, 0, 1]);
  assert.equal(b.pinned.laneNotRun, true); assert.equal(b.pathLoss.laneNotRun, true);
  assert.equal(r.comparison.accepted, 'straight3'); assert.equal(store.get(HOLE_STRAIGHT_SLOT.part).implementation, 'straight3', 'the pointer resolves');
  const s3 = store.get(r.comparison.variants.straight3);
  assert.deepEqual(verdictCounts(s3.verdicts), { pairs: 3, straight: 2, bent: 1, unknown: 0 });
  assert.equal(s3.verdicts.find((v) => v.hole === '3').basket.name, 'S4 Basket ca', 'the recovered tee reaches the recovered basket');
  assert.ok(r.comparison.frames.some((f) => f.parts.some((p) => p.kind === 'raster')), 'a course frame per variant');
  for (const a of ['tk.s6.holePairs', 'tk.s6.baskets', 'tk.s6.badgeCenters']) assert.notEqual(renderValue(a, store.get(a)).kind, 'unrenderable', a);
  const svg = straightSvg({ widthPx: W, heightPx: H, title: 't', accepted: 'straight3', rows: s3.verdicts, holes, judged: true });
  assert.match(svg, /<svg/); assert.match(svg, /1: straight -&gt; Basket ca/); assert.match(svg, /Sam's path/);
});

test('drawCourse draws segments at half scale', () => {
  const raster = { rgba: new Uint8Array(40 * 20 * 4).fill(200), widthPx: 40, heightPx: 20 };
  const c = drawCourse(raster, { segments: [{ kind: 'verdict', verdict: 'straight', from: [2, 10], to: [38, 10] }] });
  assert.deepEqual([c.width, c.height], [20, 10]); assert.ok(c.png.length > 20);
});
