// Synthetic tests for the Δ kinds, the three models, and the shared projections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toRuns, fromRuns, countRuns, enclosedUnowned } from './px.mjs';
import { pxset, objectSet, scalars, ledger, partDiff, partApply } from './kinds.mjs';
import { teePose } from './contracts.mjs';
import { MODELS, M1, M2, deltaToEvents, eventToDelta, mergeDeltas } from './models.mjs';
import { fold, stageLayers, scrub, ablate, frames, narrate, taint, conservation, sceneAt, receipt } from './project.mjs';
import { layer, sceneContent } from './scene.mjs';
import { renderFlipbook } from '../flipbook.mjs';
import { canonicalJson } from '../canon.mjs';

const W = 10;
const at = (x, y) => y * W + x;
const box = (x0, y0, w, h) => { const out = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push(at(x, y)); return out; };
const ring = (x0, y0, w, h) => box(x0, y0, w, h).filter((p) => { const x = p % W, y = Math.floor(p / W); return x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1; });

test('runs round-trip and count; enclosed-unowned finds a hole', () => {
  const px = [5, 3, 4, 9, 10, 11, 20];
  const runs = toRuns(px);
  assert.deepEqual(runs, [3, 3, 9, 3, 20, 1]);
  assert.deepEqual(fromRuns(runs), [3, 4, 5, 9, 10, 11, 20]);
  assert.equal(countRuns(runs), 7);
  assert.equal(enclosedUnowned(ring(2, 2, 3, 3), W), 1);
  assert.equal(enclosedUnowned(box(2, 2, 3, 3), W), 0);
});

test('pxset: diff then apply reproduces the target; renames and re-owns are explicit; stale input is reported', () => {
  const a = { 'a|own': toRuns([1, 2, 3]), 'a|mute': toRuns([4, 5]) };
  const b = { 'A|own': toRuns([1, 2, 3, 4]), 'b|own': toRuns([7]) };
  const d = pxset.diff(a, b, { rename: { a: 'A' } });
  assert.deepEqual(d.rename, { a: 'A' });
  assert.deepEqual(d.reowned, [{ from: 'A|mute', to: 'A|own', px: [4, 1] }]);
  assert.deepEqual(d.removed, { 'A|mute': [5, 1] });
  assert.deepEqual(d.added, { 'b|own': [7, 1] });
  const r = pxset.apply(a, d);
  assert.deepEqual(r.violations, []);
  assert.equal(canonicalJson(r.value), canonicalJson(b));
  const stale = pxset.apply({}, d);
  assert.ok(stale.violations.some((v) => v.kind === 'pxRemoveAbsent' && v.count === 1));
  assert.ok(stale.violations.some((v) => v.kind === 'pxReownAbsent'));
});

test('objectSet: geometric join matches a moved tee within tolerance and splits one moved too far', () => {
  const a = { g0: { center: [10, 10], angleRad: 0 }, g1: { center: [50, 50], angleRad: 0.1 } };
  const b = { T1: { center: [11, 10], angleRad: Math.PI }, T2: { center: [56, 50], angleRad: 0.1 } };
  const { delta, rename } = objectSet.diff(a, b, { contract: teePose });
  assert.deepEqual(rename, { g0: 'T1' });
  assert.equal(delta.changed.length, 1);
  assert.equal(delta.changed[0].pose.dCenterPx, 1);
  assert.equal(delta.changed[0].pose.dAngleDeg, 0);
  assert.deepEqual(delta.removed, [{ id: 'g1' }]);
  assert.deepEqual(delta.added.map((x) => x.id), ['T2']);
  const r = objectSet.apply(a, delta);
  assert.deepEqual(r.violations, []);
  assert.equal(canonicalJson(r.value), canonicalJson(b));
  // a facet sharing nothing with its base is a replacement
  const rep = objectSet.diff({ x: { center: [0, 0], angleRad: 0 } }, { y: { center: [90, 90], angleRad: 0 } }, { contract: teePose }).delta;
  assert.equal(rep.replace, true);
  assert.deepEqual(objectSet.apply({ x: {} }, rep).value, { y: { center: [90, 90], angleRad: 0 } });
});

test('scalars and ledger: difference, staleness, row changes', () => {
  const d = scalars.diff({ height: 2091, sha: 'x' }, { height: 2083 });
  assert.deepEqual(d.set.height, { from: 2091, to: 2083, diff: -8 });
  assert.deepEqual(d.unset, ['sha']);
  assert.deepEqual(scalars.apply({ height: 2091, sha: 'x' }, d).value, { height: 2083 });
  assert.equal(scalars.apply({ height: 1 }, d).violations[0].kind, 'scalarStale');
  const l = ledger.diff({ r1: { v: 'A' }, r2: { v: 'B' } }, { r1: { v: 'E' }, r3: { v: 'C' } });
  assert.deepEqual(ledger.summary(l), { rowsAdded: 1, rowsRemoved: 1, rowsChanged: 1 });
  assert.deepEqual(ledger.apply({ r1: { v: 'A' }, r2: { v: 'B' } }, l).value, { r1: { v: 'E' }, r3: { v: 'C' } });
});

test('partDiff carries the object rename into px owners (a relabel is not a re-own)', () => {
  const a = { objects: { T1: { center: [5, 5], angleRad: 0 } }, px: { 'T1|own': toRuns([1, 2]) } };
  const b = { objects: { R1: { center: [5, 5], angleRad: 0, verdict: 'ADMITTED' } }, px: { 'R1|own': toRuns([1, 2]) } };
  const d = partDiff(a, b, { contract: teePose });
  assert.deepEqual(d.facets.px, { added: {}, removed: {}, reowned: [], rename: { T1: 'R1' } });
  assert.equal(canonicalJson(partApply(a, d).value), canonicalJson(b));
});

// ---------------------------------------------------------------- synthetic evidence
function evidence() {
  const badgeOwn = box(1, 1, 2, 2), badgeMute = ring(0, 0, 4, 4);
  const counter = [at(0, 0)];
  const s = (stage, tick, calculations, outs, extra = {}) => ({ key: `${stage}/${tick}`, stage, tick, lane: null, calculations, consumes: extra.consumes ?? [], produces: outs.map((o) => o.address), verdicts: extra.verdicts ?? [], outs: outs.map((o) => ({ contract: null, supersedes: [], base: null, ...o })), ...extra });
  return {
    frame: { width: W, height: 10 },
    steps: [
      s('S0', 'crop', ['fn.crop'], [{ address: 'img', value: { scalars: { width: 10, height: 10 } } }]),
      s('S0', 'noop', ['fn.noop'], []),
      s('S1', 'Badge.findPx', ['fn.findPx', 'fn.mute'], [{ address: 'px.badges', roleCalc: { mute: 'fn.mute' }, value: { objects: { b0: { bbox: [1, 1, 2, 2], label: '1', whitePx: 1, blackPx: 3 } }, px: { 'b0|own': toRuns(badgeOwn), 'b0|mute': toRuns(badgeMute) } } }], { verdicts: [{ name: 'px', ok: true }] }),
      s('S1', 'digits', ['fn.digits'], [{ address: 'px.badges.digits', value: { objects: { 'b0/d0': { bbox: [1, 1, 1, 2] } }, px: { 'b0/d0/c1|own': toRuns(counter) } } }], { consumes: ['px.badges'] }),
      s('S2', 'Basket.findPx', ['fn.basketPx'], [{ address: 'px.baskets', value: { objects: { k0: { bbox: [6, 0, 3, 3] } }, px: { 'k0|own': toRuns(ring(6, 0, 3, 3)) } } }]),
      s('S3', 'Tee.detectRings', ['fn.rings'], [{ address: 'px.tees.rings', contract: 'tee.pose', value: { objects: { g0: { center: [2, 7], angleRad: 0 }, g1: { center: [7, 7], angleRad: 0 } } } }], { consumes: ['px.badges'] }),
      s('S3', 'Tee.findPx', ['fn.teePx'], [{ address: 'px.tees', base: 'px.tees.rings', contract: 'tee.pose', value: { objects: { T1: { center: [2, 7], angleRad: 0, label: '1' }, T2: { center: [7, 7], angleRad: 0, label: '2' } }, px: { 'T1|own': toRuns(box(1, 6, 3, 3)), 'T2|own': toRuns(box(6, 6, 3, 3)) } } }]),
      s('S3', 'fix', ['fn.fix'], [{ address: 'px.tees.refined', base: 'px.tees', contract: 'tee.pose', supersedes: ['px.tees'], value: { objects: { R1: { center: [2, 7], angleRad: 0, label: '1' } }, px: { 'R1|own': toRuns(box(1, 6, 3, 3)) } } }], { lane: 'fix-lane' })
    ]
  };
}

test('every model folds the same evidence to the same scene at every step (P3 scrub agrees)', () => {
  const ev = evidence();
  const hashes = MODELS.map((m) => scrub(m, m.build(ev), { hash: (s) => s }).map((x) => x.contentSha256));
  for (const h of hashes.slice(1)) assert.deepEqual(h, hashes[0]);
  assert.equal(hashes[0].length, ev.steps.length);
  for (const m of MODELS) assert.deepEqual(fold(m, m.build(ev)).violations, [], m.id);
  // random access equals the incremental fold
  const st = M1.build(ev);
  assert.equal(sceneContent(sceneAt(M1, st, 3)), hashes[0][3]);
});

test('M3 events invert to deltas: deltaToEvents then eventToDelta/mergeDeltas reapplies to the same Part', () => {
  const a = { objects: { g0: { center: [1, 1], angleRad: 0 } }, px: { 'g0|cand': toRuns([1, 2]) }, scalars: { n: 1 } };
  const b = { objects: { T1: { center: [1, 1], angleRad: 0, label: '1' }, T2: { center: [8, 8], angleRad: 0 } }, px: { 'T1|own': toRuns([1, 2, 3]) }, scalars: { n: 2 } };
  const d = partDiff(a, b, { contract: teePose });
  const evs = deltaToEvents('p', d);
  assert.ok(evs.some((e) => e.type === 'objectUpdated' && e.renameTo === 'T1'));
  assert.ok(evs.some((e) => e.type === 'pxReowned' && e.from === 'T1|cand' && e.to === 'T1|own'));
  let v = a;
  for (const e of evs) v = partApply(v, eventToDelta(e)).value;
  assert.equal(canonicalJson(v), canonicalJson(b));
  assert.equal(canonicalJson(partApply(a, mergeDeltas(evs.map(eventToDelta))).value), canonicalJson(b));
});

test('conservation: lineage closes ownership; models without lineage double-own the refinement', () => {
  const ev = evidence();
  const byModel = Object.fromEntries(MODELS.map((m) => [m.id, conservation(fold(m, m.build(ev)).scene)]));
  assert.equal(byModel.M1.closes, true);
  assert.equal(byModel.M3L.closes, true);
  assert.equal(byModel.M2.layer.conflictPx, 9);
  assert.equal(byModel.M3.layer.conflictPx, 9);
  const l = byModel.M1.layer;
  assert.equal(l.reownedFromMutePx, 1);           // the digit counter re-owns a muted pixel
  assert.equal(l.ownedPx, 4 + 1 + 8 + 9 + 9 - 9); // badge, counter, basket ring, R1 (T1 superseded), T2 superseded
  assert.ok(byModel.M1.enclosedUnowned['px.baskets'].max === 1); // the basket ring's hole
});

test('P1: receipt numbers fold out of the stream', () => {
  const ev = evidence();
  for (const m of MODELS) {
    const { fold: f, layers } = stageLayers(m, m.build(ev));
    const r = receipt(f.scene, layers);
    assert.equal(r['S1.totals.badgePx'], 4, m.id);
    assert.equal(r['S1.totals.mutedPx'], 16, m.id);
    assert.equal(r['S1Digits.totals.counterPx'], 1, m.id);
    assert.equal(r['S1Digits.totals.specDelta.movedFromMuteToDigitOwnedPx'], 1, m.id);
    assert.equal(r['S2.layerIntegrity.remainingEnteringPx'], 100 - 16, m.id);
    assert.equal(r['S3.layerIntegrity.remainingLeavingPx'], 100 - 16 - 8 - 18, m.id);
    assert.deepEqual(r['S3FamilyFix.delta.eliminatedBaselineLabels'], ['2'], m.id);
  }
});

test('P4 ablation: attribution granularity and structural breakage differ by model', () => {
  const ev = evidence();
  const mute = Object.fromEntries(MODELS.map((m) => [m.id, ablate(m, m.build(ev), ev, 'fn.mute')]));
  const metric = (a, k) => a.changed.find((c) => c.metric === k);
  // M1 and M3 drop only the mute claims; M2 attributes the whole px.badges edition to both calculations
  assert.deepEqual(metric(mute.M1, 'px.badges.px.mute'), { metric: 'px.badges.px.mute', from: 12, to: null });
  assert.equal(metric(mute.M1, 'px.badges.px.own'), undefined);
  assert.equal(metric(mute.M3, 'px.badges.px.own'), undefined);
  assert.deepEqual(metric(mute.M2, 'px.badges.px.own'), { metric: 'px.badges.px.own', from: 4, to: null });
  assert.equal(metric(mute.M1, 'afterS1.consumedPx').to, 5);
  // dropping the base of a refinement breaks Δs written against it (M1, M3L), not snapshots (M2, M3)
  const teePx = Object.fromEntries(MODELS.map((m) => [m.id, ablate(m, m.build(ev), ev, 'fn.teePx')]));
  assert.ok(teePx.M1.preconditionFailures.baseMissing >= 1);
  assert.ok(teePx.M3L.preconditionFailures.baseMissing >= 1);
  assert.deepEqual(teePx.M2.preconditionFailures, {});
  assert.deepEqual(teePx.M3.preconditionFailures, {});
  // address-level taint from testimony is model-independent
  assert.deepEqual(taint(ev, 'fn.findPx'), ['S1/digits', 'S3/Tee.detectRings', 'S3/Tee.findPx', 'S3/fix']); // transitive through bases
  assert.deepEqual(mute.M1.taintedSteps, mute.M2.taintedSteps);
});

test('P2: one flipbook page per step, the Δ drawn over the state before it, same code for every model', () => {
  const ev = evidence();
  for (const m of MODELS) {
    const fr = frames(m, m.build(ev));
    assert.equal(fr.length, ev.steps.length, m.id);
    const html = renderFlipbook(fr, { title: m.id });
    assert.equal((html.match(/<section class="page"/g) ?? []).length, ev.steps.length);
    const counter = fr[3];
    const ctx = counter.parts.find((p) => p.address.startsWith('state before'));
    assert.ok(ctx.data.px.length >= 16, `${m.id}: badge px are the context for the digit page`);
  }
  const m1 = frames(M1, M1.build(ev));
  const fix = m1[m1.length - 1];
  assert.match(fix.parts[0].data.rows.map((r) => r.line).join('\n'), /px\.tees\.refined vs px\.tees .*-1 objects \(T2\)/);
  const m2 = frames(M2, M2.build(ev));
  assert.match(m2[m2.length - 1].parts[0].data.rows[0].line, /vs empty .*\+1 objects/);
});

test('narrate reads a Δ in one line', () => {
  const view = [{ address: 'px.tees.refined', base: 'px.tees', by: ['fn.fix'], delta: { facets: { objects: { kept: 0, changed: [{ from: 'T1', to: 'R1' }], removed: [{ id: 'T2' }], added: [] }, px: { added: {}, removed: { 'T2|own': [60, 3] }, reowned: [], rename: { T1: 'R1' } } } } }];
  assert.equal(narrate(view)[0], 'px.tees.refined vs px.tees [fn.fix]: -1 objects (T2); 1 matched+renamed; -3 px own');
  assert.ok(layer({ frame: { width: 2, height: 2 }, parts: {} }).remainingPx === 4);
});
