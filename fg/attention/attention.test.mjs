import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterPx, mergeWindows, regionsForStep, changesOf, cropBox, pxClass } from './regions.mjs';
import { reasonsOf, scoreOf, testimonyCheck, rankRegions } from './rank.mjs';
import { describeRegion, questionFor } from './describe.mjs';
import { analyze, toPacket, linkRepeats, focusOf } from './packet.mjs';
import { crossVerify } from './crossverify.mjs';
import { drawCrop } from './render.mjs';
import { toRuns } from '../delta/px.mjs';
import { M1 } from '../delta/models.mjs';

const W = 100, H = 80;
const frame = { width: W, height: H };
const at = (x, y) => y * W + x;
const rect = (x, y, w, h) => { const out = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(at(x + i, y + j)); return out; };
const pxMap = (list, cls = '+own') => new Map(list.map((p) => [p, [{ address: 'px.a', cls, key: 'o1|own' }]]));
const scene = (parts) => ({ frame, parts: Object.fromEntries(Object.entries(parts).map(([a, value]) => [a, { value, meta: {} }])) });

test('clusterPx: 8-connected components with bbox and per-class counts', () => {
  const diag = [at(10, 10), at(11, 11), at(12, 12)]; // diagonal chain: one component under 8-connectivity
  const blob = rect(40, 40, 3, 2);
  const cl = clusterPx(pxMap([...diag, ...blob]), W);
  assert.equal(cl.length, 2);
  const d = cl.find((c) => c.bbox[0] === 10);
  assert.deepEqual(d.bbox, [10, 10, 3, 3]);
  assert.equal(d.px.length, 3);
  assert.deepEqual(cl.find((c) => c.bbox[0] === 40).counts, { 'px.a\u0000+own': 6 });
});

test('clusterPx: a row edge does not wrap to the next row', () => {
  const cl = clusterPx(pxMap([at(W - 1, 5), at(0, 6)]), W);
  assert.equal(cl.length, 2);
});

test('mergeWindows: padded overlap merges, far stays apart, maxSide caps a merge', () => {
  const items = [{ bbox: [10, 10, 4, 4] }, { bbox: [20, 10, 4, 4] }, { bbox: [80, 60, 4, 4] }];
  const m = mergeWindows(items, { pad: 4, maxSide: 96 });
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].bbox, [10, 10, 14, 4]);
  assert.equal(m[0].items.length, 2);
  const capped = mergeWindows(items, { pad: 4, maxSide: 10 });
  assert.equal(capped.length, 3, 'a merge wider than maxSide is refused');
});

test('cropBox: padded, at least minSide, clipped to the frame', () => {
  assert.deepEqual(cropBox([50, 40, 4, 4], { pad: 2, minSide: 20, ...frame }), [42, 32, 20, 20]);
  assert.deepEqual(cropBox([0, 0, 4, 4], { pad: 2, minSide: 20, ...frame }), [0, 0, 12, 12]);
});

test('pxClass: role re-own, owner re-assignment, split into sub-parts', () => {
  assert.equal(pxClass('b3|mute', 'b3/d0/c1|own'), 'mute->own');
  assert.equal(pxClass('b3|own', 'b3/plate|own'), 'split');
  assert.equal(pxClass('T1|own', 'T2|own'), 'own:reassigned');
});

// one synthetic step: a tee eliminated (px released + elim recorded), counters re-owned, a scalar set
function syntheticStep() {
  const tee = rect(10, 10, 6, 4), counter = rect(60, 50, 3, 3), plate = rect(70, 50, 5, 5);
  const before = scene({
    'px.tees': { objects: { T1: { bbox: [10, 10, 6, 4], center: [13, 12] } }, px: { 'T1|own': toRuns(tee) } },
    'px.badges': { objects: { b1: { bbox: [58, 48, 18, 8] } }, px: { 'b1|mute': toRuns(counter), 'b1|own': toRuns(plate) } }
  });
  const after = scene({
    ...before.parts && Object.fromEntries(Object.entries(before.parts).map(([a, p]) => [a, p.value])),
    'px.tees.refined': { objects: {}, elim: { g1: { bbox: [10, 10, 6, 4], center: [13, 12], why: 'structural', failedTests: ['interior-tone'] } } },
    'px.badges.assembly': { objects: { b1: { bbox: [58, 48, 18, 8] } }, px: { 'b1/d0/c1|own': toRuns(counter), 'b1/plate|own': toRuns(plate) } }
  });
  const view = [
    { address: 'px.tees.refined', base: 'px.tees', by: ['fn.fix'], delta: { facets: { objects: { kept: 0, changed: [], removed: [{ id: 'T1' }], added: [] }, elim: { kept: 0, changed: [], removed: [], added: [{ id: 'g1', obj: after.parts['px.tees.refined'].value.elim.g1 }] }, px: { added: {}, removed: { 'T1|own': toRuns(tee) }, reowned: [] } } } },
    { address: 'px.badges.assembly', base: 'px.badges', by: ['fn.asm'], delta: { facets: { px: { added: {}, removed: {}, reowned: [{ from: 'b1|mute', to: 'b1/d0/c1|own', px: toRuns(counter) }, { from: 'b1|own', to: 'b1/plate|own', px: toRuns(plate) }] }, scalars: { set: { rule: { from: null, to: 'enclosure' } }, unset: [] } } } }
  ];
  return { k: 0, step: 'S/x', tick: 'x', stage: 'S', lane: 'lane-a', by: ['fn.fix', 'fn.asm'], view, before, after, verdicts: [{ name: 'ok', ok: true }], violations: [] };
}

test('regionsForStep: typed changes become few windows; scalars stay non-geometric', () => {
  const s = syntheticStep();
  const g = regionsForStep(s, frame, { pad: 4, maxSide: 40, minSide: 16 });
  assert.equal(g.changedPx, 24 + 9 + 25);
  assert.equal(g.regions.length, 2, 'tee region + badge region');
  const tee = g.regions.find((r) => r.bbox[0] === 10);
  assert.deepEqual(tee.pxByAddress, { 'px.tees.refined': { '-own': 24 } });
  assert.deepEqual(tee.objects.map((o) => `${o.facet}:${o.op}:${o.id}`).sort(), ['elim:elimRecorded:g1', 'objects:eliminated:T1']);
  assert.equal(tee.objects.find((o) => o.op === 'eliminated').failedTests[0], 'interior-tone');
  const badge = g.regions.find((r) => r.bbox[0] === 60);
  assert.deepEqual(badge.pxByAddress, { 'px.badges.assembly': { 'mute->own': 9, split: 25 } });
  assert.ok(g.nonGeometric.some((n) => n.facet === 'scalars' && n.id === 'rule'));
});

test('unchanged never appears: a step whose Δ keeps everything yields no region', () => {
  const s = { k: 0, view: [{ address: 'px.tees', base: 'px.tees', by: ['c'], delta: { facets: { objects: { kept: 5, changed: [], removed: [], added: [] } } } }], before: scene({}), after: scene({}) };
  assert.equal(regionsForStep(s, frame).regions.length, 0);
});

test('refit: the same id removed and re-added is one refit, not an elimination', () => {
  const prev = { bbox: [20, 20, 6, 4], center: [23, 22], angleRad: 0 }, next = { bbox: [20, 20, 6, 4], center: [23, 22], angleRad: 0.5 };
  const s = { k: 0, view: [{ address: 'px.tees.family', base: 'px.tees.rings', by: ['c'], delta: { facets: { objects: { kept: 0, changed: [], removed: [{ id: 'g4' }], added: [{ id: 'g4', obj: next }] } } } }], before: scene({ 'px.tees.rings': { objects: { g4: prev } } }), after: scene({ 'px.tees.family': { objects: { g4: next } } }) };
  const ch = changesOf(s);
  assert.deepEqual(ch.objects.map((o) => o.op), ['refit']);
});

test('ranking: eliminations and testimony disagreements outrank re-owns, which outrank splits', () => {
  const s = syntheticStep();
  const g = regionsForStep(s, frame, { pad: 4, maxSide: 40, minSide: 16 });
  const meta = { k: 0, step: 'S/x', calcs: ['fn'], verdicts: [], lane: 'lane-a', laneStatus: { oracle: 'UNKNOWN' } };
  const rs = g.regions.map((r) => ({ ...r, k: 0, window: r.window, score: scoreOf(reasonsOf(r, meta), r.changedPx), reasons: reasonsOf(r, meta) }));
  const ranked = rankRegions(rs);
  assert.equal(ranked[0].bbox[0], 10, 'the eliminated tee first');
  assert.ok(ranked[0].reasons.some((x) => x.reason === 'obj:eliminated'));
  assert.ok(ranked[1].reasons.some((x) => x.reason === 'px:role-reown'));
  assert.ok(ranked.every((r) => r.reasons.some((x) => x.reason === 'lane:unknown')));
  const splitOnly = { objects: [], pxByAddress: { 'px.b': { split: 500 } } };
  assert.ok(scoreOf(reasonsOf(splitOnly, {}), 500) < ranked[1].score);
  // testimony: a tee point at the eliminated tee's center flips agreement and adds weight
  const tee = ranked[0];
  const d = describeRegion(tee, meta);
  const t = testimonyCheck(d.claimsAbout, tee.window, { points: [{ kind: 'tee', id: 'h1', x: 13, y: 12 }] });
  assert.equal(t.disagree, 2, 'T1 eliminated and g1 recorded as eliminated: both claims contradict the point');
  const withT = scoreOf(reasonsOf(tee, meta, { testimonyRows: t.rows }), tee.changedPx);
  assert.ok(withT > tee.score);
});

test('questions follow the most informative change', () => {
  const g = regionsForStep(syntheticStep(), frame, { pad: 4, maxSide: 40, minSide: 16 });
  assert.equal(questionFor(g.regions.find((r) => r.bbox[0] === 10)).kind, 'tee eliminated');
  assert.equal(questionFor(g.regions.find((r) => r.bbox[0] === 60)).kind, 'counter holes');
});

// end to end through a real Δ model (M1) over synthetic evidence
function evidence() {
  const tee = (x) => ({ bbox: [x, 10, 6, 4], center: [x + 3, 12], angleRad: 0 });
  const out = (address, base, value, contract = null) => ({ address, base, value, contract, supersedes: [] });
  return {
    frame,
    steps: [
      { key: 'S3/find', stage: 'S3', tick: 'find', lane: null, calculations: ['fn.find'], consumes: [], produces: ['px.tees'], verdicts: [], outs: [out('px.tees', null, { objects: { T1: tee(10), T2: tee(40) }, px: { 'T1|own': toRuns(rect(10, 10, 6, 4)), 'T2|own': toRuns(rect(40, 10, 6, 4)) } })] },
      { key: 'S3/fix', stage: 'S3', tick: 'fix', lane: 'fix-lane', calculations: ['fn.fix'], consumes: [], produces: ['px.tees.refined'], verdicts: [], outs: [out('px.tees.refined', 'px.tees', { objects: { T1: tee(10) }, elim: { T2: { ...tee(40), why: 'structural' } }, px: { 'T1|own': toRuns(rect(10, 10, 6, 4)) } })] }
    ]
  };
}

test('analyze: M1 stream -> ranked packet; repeats link to a primary; blind spots from testimony', () => {
  const stream = M1.build(evidence());
  const testimony = { points: [{ kind: 'tee', id: 'h1', x: 13, y: 12 }, { kind: 'tee', id: 'h2', x: 90, y: 70 }] };
  const A = analyze(M1, stream, { laneStatus: { 'fix-lane': { oracle: 'UNKNOWN' } }, testimony, pad: 4, minSide: 16 });
  const top = A.regions[0];
  assert.equal(top.step, 'S3/fix');
  assert.match(top.what.join(' '), /T2/);
  assert.equal(top.question.kind, 'tee eliminated');
  assert.ok(A.regions.find((r) => r.repeatOf === top.id), 'the T2 claim at S3/find rides on the elimination page');
  assert.deepEqual(A.testimonyBlindSpots.map((p) => p.id), ['h2']);
  assert.ok(!A.regions.some((r) => r.window[0] <= 13 && r.window[0] + r.window[2] > 13 && r.step === 'S3/fix'), 'T1 unchanged at the fix step: no region there');
  const packet = toPacket(A);
  assert.equal(packet.stats.regions, A.regions.length);
  assert.ok(!('_region' in packet.regions[0]));
  const cv = crossVerify(packet, { answers: [{ id: top.id, answer: 'no', says: 'isNot', why: 'letters' }] });
  assert.equal(cv.summary.visionVsReceipt.agree, 1);
});

test('linkRepeats: overlap without a shared object is not a repeat', () => {
  const mk = (id, window, ids) => ({ id, window, _region: { objects: ids.map((x) => ({ id: x })) } });
  const out = linkRepeats([mk('a', [0, 0, 20, 20], ['T1']), mk('b', [0, 0, 20, 20], ['T9']), mk('c', [2, 2, 20, 20], ['T1'])]);
  assert.equal(out[1].repeatOf, undefined);
  assert.equal(out[2].repeatOf, 'a');
});

test('focusOf: a small high-value class inside a big refinement gets a zoom window', () => {
  const s = syntheticStep();
  const g = regionsForStep(s, frame, { pad: 4, maxSide: 40, minSide: 16 });
  const badge = g.regions.find((r) => r.bbox[0] === 60);
  const region = { k: 0, _region: { ...badge, px: badge.px, changedPx: 9 + 30 } };
  const fo = focusOf(region, { _pxMaps: { 0: g.pxMap } }, frame);
  assert.equal(fo.cls, 'mute->own');
  assert.ok(fo.scale >= 4);
});

test('drawCrop: 3x nearest neighbour, px fill and outline in the upscaled grid', () => {
  const rgba = new Uint8Array(W * H * 4).fill(0);
  const im = drawCrop({ width: W, height: H, rgba }, [10, 10, 4, 4], [{ kind: 'px', px: [at(11, 11)], color: [255, 0, 0], alpha: 1 }], { scale: 3 });
  assert.equal(im.width, 12);
  const px = (x, y) => [...im.rgb.subarray((y * 12 + x) * 3, (y * 12 + x) * 3 + 3)];
  assert.deepEqual(px(4, 4), [255, 0, 0]);
  assert.deepEqual(px(0, 0), [0, 0, 0]);
});
