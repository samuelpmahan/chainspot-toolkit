import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { S6_CALCULATIONS, holeQueries, verdictCounts } from './holeStraight.mjs';
import { registerPathLoss } from './pathLoss.mjs';
import { registerPairFeatures, S6_FEATURE_CALCULATIONS, FEATURE_FAMILIES, featurePart, COLUMN_UNITS } from './pairFeatures.mjs';
import { straight3Rule, segmentVerifyRule, assignedRule, pathLossRule, MIN_PASS_FRAC } from './matching.mjs';
import { assignHolesToBaskets } from './assign.mjs';
import { registerAlphaProfile } from '../../fg/alpha/run.mjs';
import { renderValue } from '../../fg/render.mjs';
import { overlayPassOf } from './pathSpace.mjs';
import { ribbonRaster } from './fixtures/ribbon.mjs';

const bboxAt = ([x, y]) => [x - 22.5 - 0.34, y - 71 - 0.73, 46, 72];

/** A synthetic course: hole 1's ribbon runs to its basket; hole 2's ribbon stops past its pad (the hole bends). */
function ribbonStore({ cache = undefined, mutate = null } = {}) {
  const W = 640, H = 640, half = 18;
  const r1 = ribbonRaster({ W, H, from: [100, 200], to: [500, 200], halfPx: half }), r2 = ribbonRaster({ W, H, from: [100, 450], to: [150, 450], halfPx: half, seed: 9 });
  const rgba = new Uint8Array(r1.rgba); for (let y = 380; y < H; y++) rgba.set(r2.rgba.subarray(y * W * 4, (y + 1) * W * 4), y * W * 4);
  const bb = [{ label: '1', bbox: [240, 190, 21, 21], px: [] }, { label: '2', bbox: [240, 440, 21, 21], px: [] }];
  const kj = [{ bbox: bboxAt([500, 200]), px: [] }, { bbox: bboxAt([500, 450]), px: [] }];
  const rows = [1, 2].map((n) => ({ tee: `t${n}`, candidate: `Tee c${n}`, center: [100, n === 1 ? 200 : 450], thDeg: 0, pose: { cx: 100, cy: n === 1 ? 200 : 450, thDeg: 0 }, best: { badge: String(n), sense: 1 }, verdict: 'ASSOCIATED' }));
  const board = new Map([['px.badges', bb], ['px.baskets', kj], ['px.tees', []], ['px.image.cropped', { rgba, widthPx: W, heightPx: H }]]);
  const store = createPartStore({ name: 's6-features', cache, base: { has: (a) => board.has(a), get: (a) => board.get(a) } });
  store.constant('fn.tk.s6straight.laneOutputs', { 'px.tees.association': { rows, template: { L: 20 } }, 'px.tees.refined': [], 'tk.s6.padLength': { lengthPx: 20 },
    'tk.s6.s4Recovered': { accepted: null, recovered: [] }, 'tk.s6.basketRecovery': { recoveredBoxes: [] }, 'tk.s6.lateS6': { absent: 'test', rows: [], templateTops: {} }, 'testimony.source.holes': { path: null, rule: 'none', holes: [] },
    'tk.s4.hallway': { widthPx: 2 * half } });
  for (const [fn, spec] of S6_CALCULATIONS) store.register(fn, spec);
  registerQueries(store, holeQueries((a) => store.get(a)), { resolve: (r) => r });
  registerPathLoss(store);
  registerAlphaProfile(store, { association: { rows }, course: 's6-features' });
  if (mutate) mutate(store); else registerPairFeatures(store);
  return store;
}

test('tk.s6.pairFeatures: every hole x every basket, raw columns with units, no verdict and no threshold', () => {
  const store = ribbonStore(), t = store.get('tk.s6.pairFeatures');
  assert.equal(t.rows.length, 2 * 2, 'two holes x two baskets');
  assert.deepEqual(t.rows.map((r) => [r.hole, r.basket]), [['P0', 0], ['P0', 1], ['P1', 0], ['P1', 1]]);
  for (const [c, x] of Object.entries(t.columns)) { assert.ok(x.unit && x.family, c); assert.ok(FEATURE_FAMILIES.includes(x.family)); assert.equal(x.unit, COLUMN_UNITS[c]); }
  for (const r of t.rows) for (const k of Object.keys(r)) assert.ok(!/verdict|threshold|straight$|pass$/i.test(k), `${k} looks like a decision`);
  const on = t.rows.find((r) => r.hole === 'P0' && r.basket === 0), off = t.rows.find((r) => r.hole === 'P0' && r.basket === 1);
  assert.ok(on.straight3TlsMaxPx < 0.5 && on.straight3LatPx < 0.5, '3-point: hole 1 and its basket are collinear');
  assert.ok(off.straight3TlsMaxPx > 20, '3-point: hole 1 and the other basket are not');
  assert.ok(on.axisResidualPerpPx !== null && Math.abs(on.axisResidualAngleDeg) < 1, 'S5 axis residual: the badge lies on the tee axis');
  assert.ok(on.edgeScoreLumPerPx >= 6 && on.edgePassFrac > 0.8 && on.overlayMeanFrac != null, 'hole 1 reaches its basket along a ribbon');
  const bent = t.rows.find((r) => r.hole === 'P1' && r.basket === 1);
  assert.ok(bent.edgePassFrac < 0.5, `hole 2's ribbon stops: edge pass ${bent.edgePassFrac}`);
  assert.ok(on.edgeScoreRatioToBestOtherBasket == null || on.edgeScoreRatioToBestOtherBasket > 1 || on.edgeScoreLumPerPx > 0);
  assert.equal(Array.isArray(on.overlayFracStations), true);
  assert.equal(t.emits.rowsCount, 4);
});

test('the rules read the table and nothing else: a cloned table with no store gives the same verdicts as the fork-join implementations', async () => {
  const store = ribbonStore(), t = structuredClone(store.get('tk.s6.pairFeatures'));
  const pass = (overlayFrac, thresholdFrac) => store.call('fn.q.path.overlayPass', { overlayFrac, thresholdFrac, stepPx: 1 }).value;
  const asRows = (o) => o.verdicts.map((v) => [v.hole, v.verdict, v.basket?.name ?? null]);
  const expect = [['1', 'straight', 'Basket ca'], ['2', 'bent', null]];
  assert.deepEqual(asRows(segmentVerifyRule(t)), expect);
  assert.deepEqual(asRows(assignedRule(t, { assign: assignHolesToBaskets })), expect);
  const pl = pathLossRule(t, { pass });
  assert.deepEqual(asRows(pl), expect); assert.equal(pl.laneNotRun, false);
  assert.ok(pl.verdicts[0].evidence.overlayPassFrac >= MIN_PASS_FRAC);
  assert.equal(verdictCounts(straight3Rule(t).verdicts).pairs, 2);
  for (const n of ['straight3', 'segmentVerify', 'assigned', 'pathLoss']) {   // the implementation files are those rules
    const I = await import(`../../impl/fn.Hole.straight/${n}.mjs`), sc = store.scope({ who: `t-${n}`, reads: I.reads, calls: I.calls });
    const out = I.default({ get: sc.get, has: sc.has, call: sc.call });
    assert.deepEqual(asRows(out), n === 'straight3' ? asRows(straight3Rule(t)) : expect, n);
  }
});

test('fn.q.path.overlayPass is the loss the path query computes (one copy), and a rule may apply any threshold to the stored vector', () => {
  const v = [0.9, 0.8, null, 0.1, 0.1, 0.7, 0.2, null, 0.9];
  const a = overlayPassOf(v, 0.5, 1);
  assert.deepEqual([a.visibleCount, a.passCount, a.passFrac, a.lossFrac, a.longestGapPx], [7, 4, 0.571, 0.429, 2]);
  const b = overlayPassOf(v, 0.05, 1);
  assert.deepEqual([b.passFrac, b.lossFrac, b.longestGapPx], [1, 0, 0]);
  assert.equal(overlayPassOf(v, null).passFrac, null);
});

test('a feature family changing its code moves only its own Part key (and the join); the others keep their cache keys', () => {
  const cache = new Map(), a = ribbonStore({ cache });
  a.get('tk.s6.pairFeatures');
  const keysA = Object.fromEntries(['tk.s6.pairCandidates', ...FEATURE_FAMILIES.map(featurePart), 'tk.s6.pairFeatures'].map((p) => [p, a.keyOf(p)]));
  const b = ribbonStore({ cache });
  // same code: identical keys, so the shared cache serves every Part
  b.get('tk.s6.pairFeatures');
  for (const [p, k] of Object.entries(keysA)) assert.equal(b.keyOf(p), k, `${p} unchanged`);
  // a different geometry code: only geometry and the join move
  const c = ribbonStore({ cache, mutate: (s) => {
    registerPairFeatures(s, S6_FEATURE_CALCULATIONS.map(([fn, spec]) => [fn, fn === 'fn.tk.s6.feature.geometry' ? { ...spec, code: 'geometry code changed' } : spec]));
  } });
  c.get('tk.s6.pairFeatures');
  for (const [p, k] of Object.entries(keysA)) {
    const moved = p === 'tk.s6.feature.geometry' || p === 'tk.s6.pairFeatures';
    assert.equal(c.keyOf(p) !== k, moved, `${p} ${moved ? 'moves' : 'stays'}`);
  }
});

test('settled (the symbiosis hook): a settled pair keeps its basket, the basket is no candidate for another hole; nothing is settled by default', () => {
  // two tees reaching for the same basket: P0 scores 9, P1 scores 8 on basket 0 and 7 on basket 1
  const baskets = [0, 1].map((i) => ({ index: i, name: `Basket c${i}`, source: 'S2', point: [500, 200 + 50 * i] }));
  const pair = (i) => ({ id: `P${i}`, hole: String(i + 1), source: 'S3 observed', tee: { name: `Tee c${i}`, center: [100, 200 + 50 * i] }, badge: { label: String(i + 1), center: [240, 200 + 50 * i] } });
  const holes = [0, 1].map((i) => ({ id: `P${i}`, label: String(i + 1), order: i, from: 'tee cap', pair: pair(i), badge: pair(i).badge, centerPx: pair(i).tee.center }));
  const score = { 'P0|0': 9, 'P0|1': null, 'P1|0': 8, 'P1|1': 7 };
  const rows = holes.flatMap((h) => baskets.map((k) => ({ hole: h.id, basket: k.index, straight3AlongPx: 300, straight3LatPx: 0.2, straight3TlsMaxPx: k.index === h.order ? 0.4 : 30, edgeScoreLumPerPx: score[`${h.id}|${k.index}`], edgeWidthPx: 40, edgeCentreOffsetPx: 0.1, segmentLengthPx: 400, segmentCondition: null })));
  const table = { holes, baskets, rows, header: { course: { hallwayWidthPx: 40, padLengthPx: 20, hallwayCondition: null, startsPx: { P0: [110, 200], P1: [110, 250] } }, alpha: { hasPath: false, pathStatus: 'absent', why: 'test' } } };
  const call = (o) => o.verdicts.map((v) => [v.hole, v.verdict, v.basket?.name ?? null]);
  const base = assignedRule(table, { assign: assignHolesToBaskets });
  assert.deepEqual(call(base), [['1', 'straight', 'Basket c0'], ['2', 'straight', 'Basket c1']], 'one to one: cardinality first');
  assert.deepEqual(call(assignedRule(table, { assign: assignHolesToBaskets, settled: [] })), call(base), 'an empty settled changes nothing');
  assert.deepEqual(base.verdicts.map((v) => v.evidence.settled), [undefined, undefined]);
  // P1 settled on basket 0 in an earlier round: P0 may not take it (it has no other scored basket, so it is bent), P1 is carried
  const s = assignedRule(table, { assign: assignHolesToBaskets, settled: [{ hole: 'P1', basket: 0 }] });
  assert.deepEqual(call(s), [['1', 'bent', null], ['2', 'straight', 'Basket c0']]);
  assert.equal(s.verdicts[1].evidence.settled, true);
  assert.equal(s.assignment.length, 1, 'only the unsettled hole is solved');
  // the 3-point rule excludes a settled basket from the others' candidates too
  const s3 = straight3Rule(table, { settled: [{ hole: 'P1', basket: 1 }] });
  assert.equal(s3.verdicts[1].evidence.settled, true);
  assert.notEqual(s3.verdicts[0].basket?.name, 'Basket c1');
});

test('the pair table and its families render', () => {
  const store = ribbonStore();
  for (const a of ['tk.s6.pairCandidates', ...FEATURE_FAMILIES.map(featurePart), 'tk.s6.pairFeatures']) {
    const r = renderValue(a, store.get(a));
    assert.notEqual(r.kind, 'unrenderable', a); assert.ok(r.parts.length > 0, a);
  }
});
