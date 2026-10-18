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
import { registerPathLoss, THRESHOLD_OF_LEVEL } from './pathLoss.mjs';
import { registerAlphaProfile } from '../../fg/alpha/run.mjs';
import { ALPHA_PROFILE_PART } from '../../contracts/alpha.profile@1.mjs';

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
  const board = new Map([['px.badges', badges.map((b) => ({ ...b, px: [] }))], ['px.baskets', s2.map((k) => ({ ...k, px: [] }))], ['px.tees', []], ['px.image.cropped', { rgba, widthPx: W, heightPx: H }]]);
  const store = createPartStore({ name: 's6-test', base: { has: (a) => board.has(a), get: (a) => board.get(a) } });
  store.constant('fn.tk.s6straight.laneOutputs', { 'px.tees.association': { ...association, template: { L: 30 } }, 'px.tees.refined': [], 'tk.s6.padLength': { lengthPx: 30 }, 'tk.s6.s4Recovered': s4, 'tk.s6.basketRecovery': { recoveredBoxes },
    'tk.s6.lateS6': { absent: 'late S6 not run (test)', rows: [], templateTops: {} }, 'testimony.source.holes': { path: 'test', rule: 'synthetic', holes }, 'tk.s4.hallway': null });
  for (const [fn, spec] of S6_CALCULATIONS) store.register(fn, spec);
  registerQueries(store, holeQueries((a) => store.get(a)), { resolve: (r) => r });
  registerPathLoss(store);   // agent B's fn.q.path.* and tk.s6.pathMask / tk.s6.hallway
  registerAlphaProfile(store, { association, course: 's6-test' });   // as the runner: the S7 profile the pathLoss variant reads
  const implementations = await discoverImplementations(join(ROOT, 'impl'), HOLE_STRAIGHT_SLOT.slot);
  assert.deepEqual(Object.keys(implementations).sort(), ['assigned', 'pathLoss', 'pinned', 'segmentVerify', 'straight3']);
  const accept = acceptRule({ judged: true });
  const r = comparableForkJoin({ slot: HOLE_STRAIGHT_SLOT.slot, part: HOLE_STRAIGHT_SLOT.part, implementations, store, restore: () => ({ has: (a) => board.has(a), get: (a) => board.get(a) }),
    apply: (parts, impl, name) => ({ implementation: name, ...impl(parts) }), guarantees: GUARANTEES, compare: compareStraight({ parentStore: store }), accept });
  for (const n of ['assigned', 'pathLoss', 'pinned', 'segmentVerify', 'straight3']) assert.equal(r.branches[n].error, null, `${n}: ${r.branches[n].error?.message}`);
  const b = r.comparison.value.branches;
  assert.deepEqual([b.straight3.TP, b.straight3.FP, b.straight3.FN, b.straight3.TN], [2, 0, 0, 1]);
  assert.equal(b.pinned.laneNotRun, true); assert.equal(b.pathLoss.laneNotRun, true);
  // a flat raster: no rings, no hallway; the S7 Calculation records its classes not fitted and pathLoss says why
  assert.match(store.get(r.comparison.variants.pathLoss).verdicts[0].condition, /^lane not run: no alpha profile \(path not fitted: no hallway width/);
  // a flat raster has no ribbon: no hallway width, so the 3-point STRAIGHT pairs stay unknown and the bent one is bent
  assert.deepEqual(store.get(r.comparison.variants.segmentVerify).verdicts.map((v) => v.verdict), ['unknown', 'bent', 'unknown']);
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

test('segmentVerify on a synthetic ribbon: a 3-point STRAIGHT pair whose ribbon runs to the basket verifies; one whose ribbon stops does not', async () => {
  const { ribbonRaster } = await import('./fixtures/ribbon.mjs');
  const W = 640, H = 640, half = 18;
  const r1 = ribbonRaster({ W, H, from: [100, 200], to: [500, 200], halfPx: half }), r2 = ribbonRaster({ W, H, from: [100, 450], to: [150, 450], halfPx: half, seed: 9 });
  const rgba = new Uint8Array(r1.rgba); for (let y = 380; y < H; y++) rgba.set(r2.rgba.subarray(y * W * 4, (y + 1) * W * 4), y * W * 4);   // hole 2's ribbon stops past its pad (the hole bends there): no ribbon on the line to its basket
  const bb = [{ label: '1', bbox: [240, 190, 21, 21], px: [] }, { label: '2', bbox: [240, 440, 21, 21], px: [] }];
  const kj = [{ bbox: bboxAt([500, 200]), px: [] }, { bbox: bboxAt([500, 450]), px: [] }];
  const rows = [1, 2].map((n) => ({ tee: `t${n}`, candidate: `Tee c${n}`, center: [100, n === 1 ? 200 : 450], thDeg: 0, pose: { cx: 100, cy: n === 1 ? 200 : 450, thDeg: 0 }, best: { badge: String(n), sense: 1 }, verdict: 'ASSOCIATED' }));
  const board = new Map([['px.badges', bb], ['px.baskets', kj], ['px.tees', []], ['px.image.cropped', { rgba, widthPx: W, heightPx: H }]]);
  const store = createPartStore({ name: 's6-ribbon', base: { has: (a) => board.has(a), get: (a) => board.get(a) } });
  store.constant('fn.tk.s6straight.laneOutputs', { 'px.tees.association': { rows, template: { L: 20 } }, 'px.tees.refined': [], 'tk.s6.padLength': { lengthPx: 20 },
    'tk.s6.s4Recovered': { accepted: null, recovered: [] }, 'tk.s6.basketRecovery': { recoveredBoxes: [] }, 'tk.s6.lateS6': { absent: 'test', rows: [], templateTops: {} }, 'testimony.source.holes': { path: null, rule: 'none', holes: [] },
    'tk.s4.hallway': { widthPx: 2 * half } });   // S4's ribbon width (here the composited one); the runner produces it with S4's Calculations
  for (const [fn, spec] of S6_CALCULATIONS) store.register(fn, spec);
  registerQueries(store, holeQueries((a) => store.get(a)), { resolve: (r) => r });
  registerPathLoss(store);
  registerAlphaProfile(store, { association: { rows }, course: 's6-ribbon' });
  const { default: segmentVerify, reads, calls } = await import('../../impl/fn.Hole.straight/segmentVerify.mjs');
  const scoped = store.scope({ who: 'test', reads, calls });
  const out = segmentVerify({ get: scoped.get, has: scoped.has, call: scoped.call });
  assert.ok(Math.abs(store.get('tk.s6.hallway').widthPx - 2 * half) <= 2, `hallway ${store.get('tk.s6.hallway').widthPx} px learned on the tee -> badge segments`);
  assert.deepEqual(out.verdicts.map((v) => [v.hole, v.verdict]), [['1', 'straight'], ['2', 'bent']]);
  assert.ok(out.verdicts[0].evidence.edgeScoreLumPerPx >= 6); assert.match(out.verdicts[1].evidence.step, /segment not verified/);
  // assigned: every hole scored to every BasketPoint, one to one; the same verdicts here, with the assignment recorded
  const A = await import('../../impl/fn.Hole.straight/assigned.mjs'), sa = store.scope({ who: 'test-assigned', reads: A.reads, calls: A.calls });
  const as = A.default({ get: sa.get, has: sa.has, call: sa.call });
  assert.deepEqual(as.verdicts.map((v) => [v.hole, v.verdict, v.basket?.name ?? null]), [['1', 'straight', 'Basket ca'], ['2', 'bent', null]]);
  assert.equal(as.assignment.length, 2);
  // pathLoss: the profile produced on first need by fn.tk.s7.alphaProfile (the runner's registration) on the same board;
  // the ribbon's path class fitted on the tee -> badge segments, the station threshold half its alpha
  const P = await import('../../impl/fn.Hole.straight/pathLoss.mjs'), sp = store.scope({ who: 'test-pathLoss', reads: P.reads, calls: P.calls });
  const pl = P.default({ get: sp.get, has: sp.has, call: sp.call });
  const prof = store.get(ALPHA_PROFILE_PART);
  assert.equal(store.provenance(ALPHA_PROFILE_PART).producedBy, 'fn.tk.s7.alphaProfile');
  assert.ok(Math.abs(prof.overlays.path.alpha - 0.4) <= 0.03, `fitted path alpha ${prof.overlays.path.alpha} vs the composited 0.4`);
  assert.equal(pl.laneNotRun, false);
  assert.equal(pl.threshold.frac, Math.round(THRESHOLD_OF_LEVEL * prof.overlays.path.alpha * 1000) / 1000);
  assert.deepEqual(pl.verdicts.map((v) => [v.hole, v.verdict]), [['1', 'straight'], ['2', 'bent']]);
  assert.ok(pl.verdicts[0].evidence.overlayPassFrac >= 0.9 && pl.verdicts[1].evidence.overlayPassFrac < P.MIN_PASS_FRAC, JSON.stringify(pl.verdicts.map((v) => v.evidence.overlayPassFrac)));
  assert.match(pl.verdicts[1].evidence.step, /path lost/);
});

test('assignHolesToBaskets: the provider matcher, cardinality first, then score; two holes on one basket: the stronger ribbon keeps it', async () => {
  const { assignHolesToBaskets } = await import('./assign.mjs');
  const holes = [{ id: 'P0', label: '1', order: 0, center: [0, 0] }, { id: 'P1', label: '2', order: 1, center: [0, 10] }], baskets = [{ index: 0 }, { index: 1 }];
  const one = assignHolesToBaskets(holes, baskets, [{ hole: 'P0', basket: 0, score: 9 }, { hole: 'P1', basket: 0, score: 2 }]);
  assert.equal(one.locks.get('P0').basket, 0); assert.equal(one.locks.has('P1'), false, 'one basket, the 9 lum/px ribbon keeps it');
  const two = assignHolesToBaskets(holes, baskets, [{ hole: 'P0', basket: 0, score: 9 }, { hole: 'P0', basket: 1, score: 8 }, { hole: 'P1', basket: 0, score: 2 }]);
  assert.deepEqual([two.locks.get('P0').basket, two.locks.get('P1').basket], [1, 0], 'cardinality before score');
});
