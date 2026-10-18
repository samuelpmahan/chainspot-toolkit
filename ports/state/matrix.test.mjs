import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, statusOf, matrixRows, matrixMarkdown, registerStateMatrix, MATRIX_PART, MATRIX_CALCULATION, POST_RECIPE_CLOSURES, s6VariantsOf } from './matrix.mjs';
import { createPartStore } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';

const cell = (key) => CELLS.find((c) => c.key === key);
const fresh = { recipe: { state: 'VERIFIED', changed: [] }, s3assoc: { state: 'VERIFIED', changed: [] }, s4recover: { state: 'VERIFIED', changed: [] }, s5pair: { state: 'VERIFIED', changed: [] }, s6straight: { state: 'VERIFIED', changed: [] } };
const complete = { annotatedHoles: Array.from({ length: 18 }, (_, i) => i + 1), complete: true };
const partial = { annotatedHoles: [6, 13, 16], complete: false };
const outputs = { early: true, s3fix: true, s3assoc: true, basketBridge: true, s4recover: true, s5pair: true, s6straight: true };
const judged = (TP, FN, FP, extra = {}) => ({ TP, FN, FP, found: TP + FP, tp: [], fn: [], fp: [], ...extra });
const pairs = (right, wrong, none, unjudged, unmatchedBadges) => ({ tees: right + wrong + none + unjudged, right, wrong, none, unjudged, unmatchedBadges, holesWithNoTee: [], laneNotRun: null, rows: [] });

const course = (name, testimony, judgement, freshness = fresh, over = {}) => ({
  course: name, attempt: `attempt-${name}`, request: null, testimony, N: 18,
  counts: { badges: 18, baskets: 17, tees: 15, associated: 15, s4baskets: 1, s4tees: 3, paired: 18 }, judgement, outputs, freshness,
  s4: { accepted: 'greedyOccluded', timingsMs: { greedyOccluded: { ms: 368.2 }, pinned: { ms: 1.1 } }, recoveredCount: { greedyOccluded: 3, pinned: 3 } },
  s5: { accepted: 'toolkit', timingsMs: { pinned: { ms: 2.3 }, toolkit: { ms: 0.6 } }, pairedCount: { pinned: 17, toolkit: 18 }, laneNotRun: { pinned: null, toolkit: null } },
  s6: { accepted: 'straight3', timingsMs: { straight3: { ms: 2.8 }, pathLoss: { ms: 0.3 } },
    counts: { pairs: 18, straight: 9, bent: 9, unknown: 0, straight3: { pairs: 18, straight: 9, bent: 9, unknown: 0, laneNotRun: false }, pathLoss: { pairs: 18, straight: 0, bent: 0, unknown: 18, laneNotRun: true } } }, ...over
});
const golden = course('golden', complete, {
  S1: { found: 18, labelsMissing: [], duplicates: [] }, S2: judged(17, 1, 0), S3: judged(15, 3, 0),
  S3association: { associatedCorrectly: 15, associatedIncorrectly: 0, notAssociated: 0 },
  S4baskets: judged(18, 0, 0, { recovered: 1 }), S4tees: { branches: { greedyOccluded: judged(18, 0, 0, { recovered: 3, recoveredForHoleCorrectly: 3 }), pinned: judged(17, 1, 0, { recovered: 3, recoveredForHoleCorrectly: 2 }) } },
  S5pairs: { accepted: 'toolkit', variants: { toolkit: pairs(18, 0, 0, 0, []), pinned: pairs(17, 0, 0, 3, ['Badge 3']) } },
  S6straight: { accepted: 'straight3', variants: { straight3: { judgedPairs: 18, TP: 9, FP: 0, FN: 0, TN: 9, straightWithWrongBasket: 0, laneNotRun: false }, pathLoss: { judgedPairs: 18, TP: 0, FP: 0, FN: 9, TN: 9, straightWithWrongBasket: 0, laneNotRun: true } } }
});

test('the status rule as written: stale > missing > unjudged > met / unmet', () => {
  assert.equal(statusOf(cell('S2'), golden, golden.judgement.S2, fresh), 'unmet', 'FN = 1 with no S4 rows is unmet');
  assert.equal(statusOf(cell('S4baskets'), golden, golden.judgement.S4baskets, fresh), 'met');
  assert.equal(statusOf(cell('S1'), golden, golden.judgement.S1, fresh), 'met');
  assert.equal(statusOf(cell('S1'), golden, { found: 18, labelsMissing: ['Badge 7'], duplicates: [] }, fresh), 'unmet');
  assert.equal(statusOf(cell('S3association'), golden, { associatedCorrectly: 14, associatedIncorrectly: 0, notAssociated: 1 }, fresh), 'unmet');
  // S2 and S3 expect occlusion: an FN that S4 recovers does not count (Sam: "they should pass as long as S4 recovers for them")
  const withS4 = (s4rows) => ({ ...golden, judgement: { ...golden.judgement, S2: { ...golden.judgement.S2, rows: [{ hole: 6, verdict: 'FN' }] }, S4baskets: { ...golden.judgement.S4baskets, rows: s4rows } } });
  assert.equal(statusOf(cell('S2'), withS4([{ hole: 6, verdict: 'recoveredTP' }]), withS4([]).judgement.S2, fresh), 'met', 'the FN basket was recovered by S4');
  assert.equal(statusOf(cell('S2'), withS4([{ hole: 7, verdict: 'TP' }]), withS4([]).judgement.S2, fresh), 'unmet', 'S4 recovered a different hole');
  // FP counts only where testimony is complete
  const alex = course('alex', partial, {});
  assert.equal(statusOf(cell('S2'), alex, judged(3, 0, 5), fresh), 'met', 'FP is not judged on partial testimony');
  assert.equal(statusOf(cell('S2'), golden, judged(17, 0, 1), fresh), 'unmet', 'FP is judged on complete testimony');
  // unjudged never met
  assert.equal(statusOf(cell('S2'), course('northpark', null, null), '17 of N = 18', fresh), 'unjudged');
  // missing
  assert.equal(statusOf(cell('S4tees'), golden, null, fresh), 'missing');
  // stale overrides everything, only for the closures the cell was computed with
  const stale = { ...fresh, s4recover: { state: 'STALE', changed: ['ports/s4recover/teeRecover.mjs'] } };
  assert.equal(statusOf(cell('S4tees'), golden, golden.judgement.S4tees.branches.greedyOccluded, stale), 'stale');
  assert.equal(statusOf(cell('S2'), golden, golden.judgement.S2, stale), 'unmet', 'an S4 code change does not stale S2');
  assert.equal(statusOf(cell('S2'), golden, golden.judgement.S2, { ...fresh, recipe: { state: 'STALE', changed: ['fg/pxset.mjs'] } }), 'stale', 'a recipe change stales every cell');
  // S5 pairs: met when every judged tee pairs with its own hole's badge and none is unpaired
  assert.equal(statusOf(cell('S5pairs'), golden, golden.judgement.S5pairs.variants.toolkit, fresh), 'met');
  assert.equal(statusOf(cell('S5pairs'), golden, pairs(17, 1, 0, 0, []), fresh), 'unmet', 'a tee paired with another hole\'s badge');
  assert.equal(statusOf(cell('S5pairs'), golden, pairs(17, 0, 1, 0, []), fresh), 'unmet', 'a judged tee paired with no badge');
  assert.equal(statusOf(cell('S5pairs'), golden, golden.judgement.S5pairs.variants.toolkit, { ...fresh, s5pair: { state: 'STALE', changed: ['impl/fn.Tee.pairBadge/toolkit.mjs'] } }), 'stale');
  assert.equal(statusOf(cell('S4tees'), golden, golden.judgement.S4tees.branches.greedyOccluded, { ...fresh, s5pair: { state: 'STALE', changed: ['ports/s5pair/run.mjs'] } }), 'met', 'an S5 code change does not stale S4');
});

test('the matrix: one row per stage x course, emits, units, markdown, frozen comparison', () => {
  const northpark = course('northpark', null, null, { ...fresh, s4recover: { state: 'UNVERIFIED', changed: [] } });
  const inputs = { declarations: { S1: { responsibility: 'badges' }, S2: { responsibility: 'baskets' }, S3: { responsibility: 'tees' }, S4: { responsibility: 'recover' } }, courses: [golden, northpark] };
  const m = matrixRows(inputs);
  assert.equal(m.rows.length, 2 * CELLS.length);
  assert.deepEqual(m.emits, { cells: 16, met: 6, unmet: 2, unjudged: 8, missing: 0, stale: 0 }, 'no S4 rows in this fixture, so the S2 and S3 FNs stay unmet');
  assert.ok(Object.keys(m.units).includes('stale'));
  const np = m.rows.find((r) => r.course === 'northpark' && r.key === 'S4tees');
  assert.equal(np.status, 'unjudged'); assert.equal(np.freshness, 'UNVERIFIED'); assert.equal(np.result, '18 of N = 18');
  const g4 = m.rows.find((r) => r.course === 'golden' && r.key === 'S4tees');
  assert.match(g4.result, /18\/0\/0 TP\/FN\/FP \(\+3 recovered, 3 right hole\)/);
  // every variant rides along, the pointer marked, standalone ms beside the judged result; the unjudged course shows its count closure per variant
  assert.deepEqual(g4.variants, [{ name: 'greedyOccluded', judged: '18/0/0 TP/FN/FP (+3 recovered, 3 right hole)', standaloneMs: 368.2, accepted: true }, { name: 'pinned', judged: '17/1/0 TP/FN/FP (+3 recovered, 2 right hole)', standaloneMs: 1.1, accepted: false }]);
  assert.deepEqual(np.variants.map((v) => v.judged), ['18 of N = 18', '18 of N = 18']);
  assert.ok(!('variants' in m.rows.find((r) => r.course === 'golden' && r.key === 'S3')), 'only the S4 tee, S5 pair and S6 straight cells have variants');
  // the S5 row: the accepted variant's judged result, every variant beside it with standalone ms, the pointer marked
  const g5 = m.rows.find((r) => r.course === 'golden' && r.key === 'S5pairs');
  assert.equal(g5.status, 'met'); assert.equal(g5.result, '18 right / 0 wrong / 0 none; 0 unmatched badges');
  assert.deepEqual(g5.variants, [{ name: 'pinned', judged: '17 right / 0 wrong / 0 none (+3 unjudged); 1 unmatched badge', standaloneMs: 2.3, accepted: false }, { name: 'toolkit', judged: '18 right / 0 wrong / 0 none; 0 unmatched badges', standaloneMs: 0.6, accepted: true }]);
  const np5 = m.rows.find((r) => r.course === 'northpark' && r.key === 'S5pairs');
  assert.equal(np5.status, 'unjudged'); assert.equal(np5.result, '18 of N = 18'); assert.deepEqual(np5.variants.map((v) => v.judged), ['17 of N = 18 paired', '18 of N = 18 paired']);
  assert.match(matrixMarkdown(m), /S5 pairing variants per course[^\n]*\n- golden: pinned 17 right \/ 0 wrong \/ 0 none \(\+3 unjudged\); 1 unmatched badge 2 ms; → toolkit 18 right/);
  assert.match(matrixMarkdown(m), /- golden: → greedyOccluded 18\/0\/0 TP\/FN\/FP \(\+3 recovered, 3 right hole\) 368 ms; pinned 17\/1\/0 TP\/FN\/FP \(\+3 recovered, 2 right hole\) 1 ms/);
  // no pointer (an unjudged course with nothing accepted elsewhere): the S4 cell is missing, not guessed
  assert.equal(matrixRows({ ...inputs, courses: [{ ...northpark, s4: { ...northpark.s4, accepted: null } }] }).rows.find((r) => r.key === 'S4tees').status, 'unjudged');
  const md = matrixMarkdown(m);
  assert.match(md, /\| golden \| S2 baskets \| baskets within 12 px of all 18 holes, or recovered by S4 \(occlusion is expected\) \|/); assert.match(md, /16 cells: 6 met, 2 unmet, 8 unjudged/);
  // against a frozen record: same, changed, new
  const frozen = { rows: m.rows.filter((r) => r.course === 'golden').map((r) => ({ ...r, result: r.key === 'S2' ? '16/2/0 TP/FN/FP' : r.result })) };
  const again = matrixRows(inputs, frozen);
  assert.equal(again.rows.find((r) => r.course === 'golden' && r.key === 'S1').vsFrozen, 'same');
  assert.match(again.rows.find((r) => r.course === 'golden' && r.key === 'S2').vsFrozen, /^changed \(was unmet: 16\/2\/0/);
  assert.equal(again.rows.find((r) => r.course === 'northpark' && r.key === 'S1').vsFrozen, 'new');
});

test('tk.state.matrix is a Part: derived on a store, profiled with emits, renderable', () => {
  const inputs = { declarations: { S1: { responsibility: 'badges' } }, courses: [golden] };
  const store = registerStateMatrix(createPartStore({ name: 'state-test' }), inputs);
  const m = store.get(MATRIX_PART);
  assert.equal(m.rows.length, CELLS.length);
  const call = store.calls().find((e) => e.calculation === MATRIX_CALCULATION);
  assert.deepEqual(call.emits, m.emits, 'the store records the emits');
  assert.deepEqual(store.provenance(MATRIX_PART).inParts, ['tk.state.inputs', 'tk.state.frozen']);
  const r = renderValue(MATRIX_PART, { rows: m.rows.map(({ changedPaths, goal, ...row }) => row), ...m.emits });
  assert.notEqual(r.kind, 'unrenderable'); assert.ok(r.parts.some((p) => p.kind === 'ledger'));
});

test('inspector S5pairs rows: a ray to the paired plate coloured by verdict, the true badge dashed when wrong, unpaired badges boxed', async () => {
  const { cellRows, COLORS } = await import('./inspect.mjs');
  const rows = [
    { hole: 1, name: 'Tee ca', origin: 'S3 observed', point: [10, 50], said: 1, saidCenter: [10, 10], truthCenter: [10, 10], verdict: 'right', teeErrorPx: 0.3, residualDeg: 0.2, signedPerpPx: 0.1 },
    { hole: 2, name: 'S4 Tee ca', origin: 'S4 recovered', point: [40, 50], said: 3, saidCenter: [70, 10], truthCenter: [40, 10], verdict: 'wrong', teeErrorPx: 1, residualDeg: 9, signedPerpPx: 6 }
  ];
  const c = { ...golden, judgement: { ...golden.judgement, S5pairs: { accepted: 'toolkit', variants: { toolkit: { ...pairs(1, 1, 0, 0, ['Badge 2']), rows } } } },
    objects: { badges: [], pairs: [], pairBadges: [{ label: '2', plateCenter: [40, 10] }], unpairedBadges: [] } };
  const r = cellRows(cell('S5pairs'), c);
  assert.deepEqual(r.map((x) => [x.name, x.verdict]), [['Tee ca', 'right'], ['S4 Tee ca', 'wrong'], ['Badge 2 (unpaired)', 'unpaired']]);
  assert.ok(r[0].marks.some((m) => m.kind === 'line' && m.color === COLORS.right && m.b[1] === 10));
  assert.ok(r[1].marks.some((m) => m.kind === 'line' && m.color === COLORS.expected && m.dash), 'the badge of its own hole, dashed');
  assert.equal(r[1].reason, 'pairs with Badge 3, is Tee 2');
  assert.deepEqual(r[2].marks.map((m) => m.kind), ['rect']);
});

test('S6straight: met when FP = 0 and FN = 0 on judged pairs; variants with lane not run; unjudged shows verdict counts; its own closure', () => {
  const c = cell('S6straight');
  assert.deepEqual(c.closures, ['recipe', 's6straight']);
  assert.ok(POST_RECIPE_CLOSURES.s6straight.includes('ports/s6straight') && POST_RECIPE_CLOSURES.s6straight.includes('impl/fn.Hole.straight'));
  assert.equal(statusOf(c, golden, golden.judgement.S6straight.variants.straight3, fresh), 'met');
  assert.equal(statusOf(c, golden, { ...golden.judgement.S6straight.variants.straight3, FP: 3 }, fresh), 'unmet', 'a bent hole called straight');
  assert.equal(statusOf(c, golden, { ...golden.judgement.S6straight.variants.straight3, FN: 1 }, fresh), 'unmet');
  assert.equal(statusOf(c, golden, golden.judgement.S6straight.variants.straight3, { ...fresh, s6straight: { state: 'STALE', changed: ['impl/fn.Hole.straight/straight3.mjs'] } }), 'stale');
  assert.equal(statusOf(cell('S4tees'), golden, golden.judgement.S4tees.branches.greedyOccluded, { ...fresh, s6straight: { state: 'STALE', changed: [] } }), 'met', 'an S6 change does not stale S4');
  assert.deepEqual(s6VariantsOf(golden), [{ name: 'pathLoss', judged: 'lane not run', standaloneMs: 0.3, accepted: false, laneNotRun: true }, { name: 'straight3', judged: '9/0/0/9 TP/FP/FN/TN', standaloneMs: 2.8, accepted: true, laneNotRun: false }]);
  const m = matrixRows({ declarations: { S6: { responsibility: 'straight' } }, courses: [golden, course('northpark', null, null)] });
  const g = m.rows.find((r) => r.course === 'golden' && r.key === 'S6straight'), np = m.rows.find((r) => r.course === 'northpark' && r.key === 'S6straight');
  assert.equal(g.result, '9/0/0/9 TP/FP/FN/TN on 18 judged pairs; straight with wrong basket 0'); assert.equal(g.goal, 'straight');
  assert.equal(np.status, 'unjudged'); assert.equal(np.result, '9 straight / 9 bent / 0 unknown of 18 pairs');
  assert.match(matrixMarkdown(m), /- golden: pathLoss lane not run 0 ms; → straight3 9\/0\/0\/9 TP\/FP\/FN\/TN 3 ms/);
});
