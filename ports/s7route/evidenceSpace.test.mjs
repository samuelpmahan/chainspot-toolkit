import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { laneStepAt, LANE_QUERIES } from './laneSpace.mjs';
import { laneExitsOf, laneBackOf, legWalked, meetOf, evidenceRankOf, zOf, logSigmoid, EVIDENCE_QUERIES, FEATURES } from './evidenceSpace.mjs';
import { fitLogistic, picksOf } from './evidenceModel.mjs';
import { seqFinalOf, cellRulesOf, RULE_SETS, S7_DEFAULT } from './match.mjs';

/** The lane tests' L: ground lum 100, a ribbon (lum 145, width 20) east from (10, 100) to (130, 100), then south-east to the
 *  BasketPoint (195, 165), C1 = R1 = 10 px; hole 1's tee cap at (20, 100), its badge at (60, 100), axis east. */
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const BEND = [[10, 100], [130, 100], [195, 165]];
function lScene({ w = 20, R1 = 10, W = 220, H = 220 } = {}) {
  const lum = new Float64Array(W * H).fill(100), m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let d = Infinity; for (let i = 0; i + 1 < BEND.length; i++) d = Math.min(d, segD([x, y], BEND[i], BEND[i + 1])); if (d <= w / 2) lum[y * W + x] = 145; }
  return { W, H, lum, mask: m, R1, bp: [[195, 165]], badges: { 1: [60, 100] }, badgeHalf: { 1: 6 } };
}
const legs = [{ hole: '1', S: [20, 100], u: [1, 0], badge: [60, 100] }];

test('basket backwards, lanes: the exit out of C1 is the hallway; the backward track walks it to the hole\'s tee -> badge segment', () => {
  const c = lScene(), ex = laneExitsOf(c, 0, 20);
  assert.ok(ex.exits.length >= 1);
  assert.ok(Math.abs(ex.exits[0].headingDeg - 222) <= 6, `exit ${ex.exits[0].headingDeg} deg (the hallway leaves toward 225 deg)`);
  const t = laneBackOf(c, 0, ex.exits[0].headingDeg, 20, (x, y, h) => laneStepAt(c, 4, x, y, h, 20, false), legs);
  assert.equal(t.stop, 'hole'); assert.equal(t.hole, '1');
  assert.ok(t.path.at(-1)[0] <= 75, `stops on the first leg near the badge (${t.path.at(-1)})`);
  assert.equal(t.violations.length, 0);
});

test('a forward and a backward track meet when antiparallel within W / 2; parallel tracks do not', () => {
  const fwd = [[20, 100], [130, 100], [180, 150]], back = [[195, 165], [130, 101], [60, 101]];
  const m = meetOf(fwd, back, 20);
  assert.equal(m.meets, true);
  assert.ok(m.alongFwdPx > 110, `the farthest meeting point along the forward track (${m.alongFwdPx} px)`);
  assert.equal(meetOf(fwd, [[60, 101], [130, 101]], 20).meets, false);
  assert.equal(meetOf(fwd, [[20, 150], [130, 150]].reverse(), 20).meets, false);
  assert.equal(meetOf([[0, 0]], back, 20).meets, null);
});

test('legWalked cuts a backward route where it walks onto a tee -> badge segment toward that tee', () => {
  const r = legWalked([[195, 165], [130, 100], [0, 100]], legs, 20);
  assert.equal(r.hole, '1');
  assert.ok(r.verts.at(-1)[0] >= 60 && r.verts.at(-1)[0] <= 71);
  assert.equal(legWalked([[0, 100], [130, 100]], legs, 20), null, 'walking the leg forward (toward the badge) is not walking it back');
});

test('the evidence queries answer with units on a store', () => {
  const store = createPartStore();
  store.constant('fn.tk.fixture.scene', { 'tk.s7.sceneS4': lScene() });
  registerQueries(store, LANE_QUERIES); registerQueries(store, EVIDENCE_QUERIES);
  const ex = store.call('fn.q.evidence.laneExits', { scene: 'tk.s7.sceneS4', basket: 0, widthPx: 20 });
  assert.match(ex.unit, /deg/);
  const t = store.call('fn.q.evidence.laneBack', { scene: 'tk.s7.sceneS4', basket: 0, exit: ex.value.exits[0], widthPx: 20, legs }).value;
  assert.equal(t.stop, 'hole');
  assert.ok(store.calls().filter((e) => e.calculation === 'fn.q.route.laneStep').length >= t.path.length - 2);
  const none = store.call('fn.q.evidence.laneExits', { scene: 'tk.s7.sceneS4', basket: 0, widthPx: 20 });
  assert.equal(none.emits?.cached ?? 1, 1);
});

test('the evidence ranking: log P per candidate cell, a straight claim certain, nothing for another cell rule set', () => {
  const cellRules = cellRulesOf(RULE_SETS[S7_DEFAULT]);
  const part = { cellRules, rows: [{ hole: '1', i: 0, claimed: 1 }, { hole: '2', i: 1, cells: [{ k: 0, readings: { backbone: 0.5 } }, { k: 2, readings: { backbone: -0.5, meet: 1 } }] }] };
  const cells = { score: [[-Infinity, 0, -Infinity], [3, -Infinity, -1]] }, w = { bias: 0, backbone: 2, meet: 3 };
  const M = evidenceRankOf(part, cells, { evidenceWeights: w }, cellRules);
  assert.equal(M[0][1], 0);
  assert.equal(M[1][0], logSigmoid(1)); assert.equal(M[1][2], logSigmoid(2)); assert.equal(M[1][1], null);
  assert.equal(evidenceRankOf(part, cells, {}, { other: true }), null);
  assert.equal(zOf({ backbone: null, meet: 1 }, w), 3, 'an UNKNOWN reading adds nothing');
});

test('seqFinalOf ranks by the evidence when given, keeps forbidden cells forbidden, and never mutates the cells', () => {
  const cells = { starts: [{ hole: '1' }, { hole: '2' }], bp: [[0, 0], [1, 1], [2, 2]], score: [[5, 1, -Infinity], [4, -Infinity, 3]], route: { '1@0': [[0, 0], [1, 0]], '1@1': [[0, 0], [2, 0]], '2@0': [[0, 0], [3, 0]], '2@2': [[0, 0], [4, 0]] },
    why: { 1: 'a', 2: 'b' }, record: {}, violations: [], summary: {} };
  const frozen = JSON.stringify(cells, (k, v) => (v === -Infinity ? 'ninf' : v));
  const base = seqFinalOf(cells, { holes: ['1', '2'], S: {}, W: 10, legsMany: null });
  assert.deepEqual(base.pairs, [[0, 0], [1, 2]]);
  const ev = seqFinalOf(cells, { holes: ['1', '2'], S: {}, W: 10, legsMany: null, rescore: () => [[-3, -0.1, 0], [-0.1, 0, -5]] });
  assert.deepEqual(ev.pairs, [[0, 1], [1, 0]], 'the ranking moves both holes; hole 1 never takes the forbidden basket 2');
  assert.equal(JSON.stringify(cells, (k, v) => (v === -Infinity ? 'ninf' : v)), frozen);
});

test('the logistic recovers which perspective carries the label; picksOf assigns one to one', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) { const y = i % 3 === 0; rows.push({ readings: { backbone: (i % 5) / 5 - 0.4, meet: y ? 1 : -1, edge: null }, y }); }
  const w = fitLogistic(rows);
  assert.ok(w.meet > 1, `meet weight ${w.meet}`);
  assert.ok(Math.abs(w.backbone) < w.meet);
  assert.deepEqual(Object.keys(w).filter((k) => k !== 'fit'), ['bias', ...FEATURES]);
  const table = { baskets: [{}, {}, {}], rows: [{ hole: '1', claimed: 2 }, { hole: '2', cells: [{ k: 0, readings: { meet: -1 } }, { k: 1, readings: { meet: 1 } }] }, { hole: '3', cells: [{ k: 1, readings: { meet: 1 } }, { k: 0, readings: { meet: -1 } }] }] };
  const p = picksOf(table, { bias: 0, meet: 2 });
  assert.equal(p['1'], 2); assert.ok(new Set([p['2'], p['3']]).size === 2);
});
