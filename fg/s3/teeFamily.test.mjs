/**
 * Tests for the fn.Tee.findFamily fork-join pieces that need no provider:
 *   1. testimony points convert source -> canonical by the crop receipt
 *   2. the judge: agrees / disagrees per member with the 2 px pad,
 *      uncovered points as recall info, shared points named
 *   3. the two FGs on a stub board (materialize refuses a non-candidate;
 *      precision checks the testimony names this source and never claims
 *      acceptance)
 *   4. the comparator over a stub fork-join: matched / only-in with
 *      verdicts, one crop contact-sheet frame per only-in-one member
 *   5. the pure-JS PNG round-trips through zlib and renders inline
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { judgeMembers, testimonyTeePoints, compareTeeFamilies, TEE_FAMILY_SLOT, TEE_POINTS_CALCULATION, memberPose } from './teeFamily.mjs';
import { createPartStore } from '../store.mjs';
import materialize from './fg.s3.teeFamily.materialize.fg.mjs';
import precision from './fg.s3.teeFamily.precision.fg.mjs';
import { comparableForkJoin } from '../forkjoin.mjs';
import { runGuarantees } from '../registry.mjs';
import { cropWindow, encodePngRgb } from '../png.mjs';
import { renderFlipbook } from '../flipbook.mjs';
import { utf8 } from '../canon.mjs';
import teePose from '../../contracts/tee.pose@1.mjs';

const W = 200, H = 120;
const crop = { originalPx: { width: W, height: H + 8 }, upperRowsRemoved: 4, lowerRowsRemoved: 4, croppedPx: { width: W, height: H } };
const annotation = { schemaVersion: 1, sourceImage: { sha256: 'src', widthPx: W, heightPx: H + 8 }, holes: [
  { number: 1, tee: { xPx: 30, yPx: 34 } }, { number: 2, tee: { xPx: 100, yPx: 64 } }, { number: 3, tee: { xPx: 170, yPx: 104 } }, { number: 4 }
] };
const ring = (cx, cy) => ({ cx, cy, bboxX: cx - 5, bboxY: cy - 4, bboxW: 10, bboxH: 8, holeArea: 60 });
const frame = (cx, cy, angle = 0) => ({ label: Math.round(cx), bboxX: cx - 8, bboxY: cy - 6, bboxW: 16, bboxH: 12, angle });
const CANDS = [[30, 30], [100, 60], [150, 20], [60, 100]];

function board(extra = {}) {
  const parts = new Map([
    ['px.tees.rings', { candidates: CANDS.map(([x, y]) => ring(x, y)) }],
    ['px.image.cropped', { widthPx: W, heightPx: H, rgba: new Uint8Array(W * H * 4).fill(90) }],
    ...Object.entries(extra)
  ]);
  return { get: (a) => parts.get(a), set: (a, v) => parts.set(a, v), has: (a) => parts.has(a) };
}
// The toolkit Parts the precision judge reads, each with a named producer:
// a constant fixture standing in for the runner's intake/S0/locate
// Calculations, and the real fn.testimony.teePoints.
function testimonyStore(base, { sourceSha256 = 'src' } = {}) {
  const store = createPartStore({ base, name: 'test' });
  store.constant('fn.test.fixture', {
    'testimony.source.annotation': { path: 'testimony/t.annotation.json', specimen: 't', sha256: 'x', bytes: utf8(JSON.stringify(annotation)) },
    'tk.source.cropReceipt': crop, 'tk.source.sha256': sourceSha256
  });
  store.register('fn.testimony.teePoints', TEE_POINTS_CALCULATION);
  return store;
}
const members = (list) => list.map(([x, y]) => memberPose(ring(x, y), frame(x, y)));

test('testimony converts by the crop receipt; the judge reports precision, not acceptance', () => {
  const points = testimonyTeePoints(annotation, crop);
  assert.deepEqual(points.map((p) => p.canonical), [[30, 30], [100, 60], [170, 100]], 'y - upperRowsRemoved; holes without a tee skipped');
  const judged = judgeMembers(members([[30, 30], [100, 60], [150, 20]]), points);
  assert.deepEqual(judged.verdicts.map((v) => v.verdict), ['agrees', 'agrees', 'disagrees']);
  assert.deepEqual(judged.totals, { members: 3, agrees: 2, disagrees: 1, precision: 0.6667, annotatedPoints: 3, coveredPoints: 2, uncoveredPoints: 1 });
  assert.deepEqual(judged.uncovered, [3]);
  // the 2 px pad: frame bbox [22..38] x [24..36]; a point at x = 40 is inside, 40.1 is not
  const edge = (x) => judgeMembers(members([[30, 30]]), [{ hole: 9, canonical: [x, 30] }]).verdicts[0].verdict;
  assert.equal(edge(40), 'agrees');
  assert.equal(edge(40.1), 'disagrees');
});

test('the two FGs hold on a branch and refuse what they must', () => {
  const ok = runGuarantees({ guarantees: [materialize, precision], store: testimonyStore(board({ [TEE_FAMILY_SLOT.part]: { implementation: 'stub', members: members([[30, 30], [150, 20]]) } })), lanes: [TEE_FAMILY_SLOT.lane] });
  const rec = ok.records[TEE_FAMILY_SLOT.precision];
  assert.equal(rec.status, 'held');
  assert.equal(rec.totals.precision, 0.5);
  assert.match(rec.acceptance, /^UNKNOWN/);
  assert.equal(rec.testimony.path, 'testimony/t.annotation.json');
  assert.ok(rec.witnesses.every((w) => w.ok));
  assert.deepEqual(rec.witnesses.map((w) => w.name), ['teePointsFromAnnotation', 'pointMajorAgrees']);
  assert.ok(rec.reads.includes('testimony.source.teePoints') && !('env' in rec));
  // dormant with the lane OFF
  const off = runGuarantees({ guarantees: [materialize, precision], store: testimonyStore(board()) });
  assert.equal(off.records[TEE_FAMILY_SLOT.precision].status, 'dormant');
  // a member that is not an S3 candidate fails materialize
  assert.throws(() => runGuarantees({ guarantees: [materialize], board: board({ [TEE_FAMILY_SLOT.part]: { implementation: 'x', members: members([[31, 30]]) } }), lanes: [TEE_FAMILY_SLOT.lane] }),
    (e) => e.name === 'GuaranteeFailure' && e.failed.includes('membersAreCandidates'));
  // testimony for another image fails precision
  assert.throws(() => runGuarantees({ guarantees: [materialize, precision], store: testimonyStore(board({ [TEE_FAMILY_SLOT.part]: { implementation: 'x', members: [] } }), { sourceSha256: 'other' }), lanes: [TEE_FAMILY_SLOT.lane] }),
    (e) => e.name === 'GuaranteeFailure' && e.failed.includes('testimonyNamesThisSource'));
  // no testimony Part on the store: the read check fails by the Part's name
  assert.throws(() => runGuarantees({ guarantees: [materialize, precision], board: board({ [TEE_FAMILY_SLOT.part]: { implementation: 'x', members: [] } }), lanes: [TEE_FAMILY_SLOT.lane] }),
    (e) => e.name === 'GuaranteeFailure' && e.guarantee === TEE_FAMILY_SLOT.precision && e.failed.includes('read:testimony.source.annotation'));
});

test('the comparator lists matched and only-in members with verdicts and a crop per only-in-one member', () => {
  const result = comparableForkJoin({
    slot: TEE_FAMILY_SLOT.slot,
    part: TEE_FAMILY_SLOT.part,
    implementations: { loose: () => members([[30, 30], [100, 60], [150, 20], [60, 100]]), strict: () => [{ ...members([[100, 60]])[0], center: [100.5, 60.4], angleRad: Math.PI - 0.01 }, ...members([[30, 30]])] },
    store: testimonyStore(null),
    restore: () => board(),
    apply: (parts, impl, name) => ({ implementation: name, members: impl(parts) }),
    guarantees: [materialize, precision], lanes: [TEE_FAMILY_SLOT.lane],
    compare: compareTeeFamilies({ contract: teePose, crop: cropWindow })
  });
  const v = result.comparison.value;
  assert.equal(v.contract.address, 'contracts/tee.pose@1');
  assert.deepEqual(v.counts, { matched: 2, 'only.loose': 2, 'only.strict': 0, partial: 0, ambiguous: 0, collisions: 0 });
  assert.deepEqual(v.matched.map((r) => [r.loose.verdict, r.strict.verdict]), [['agrees', 'agrees'], ['agrees', 'agrees']]);
  assert.deepEqual(v.only.loose.map((r) => r.loose.verdict), ['disagrees', 'disagrees']);
  assert.deepEqual([v.branches.loose.precision, v.branches.strict.precision], [0.5, 1]);
  assert.match(v.acceptance, /^UNKNOWN/);
  const frames = result.comparison.frames;
  assert.equal(frames.length, 1 + 2, 'one ledger frame, one crop frame per only-in-one member');
  const sheet = frames[1].parts.find((p) => p.kind === 'raster').data;
  assert.equal(sheet.width, TEE_FAMILY_SLOT.cropPx);
  assert.match(renderFlipbook(frames), /<img class="crop"[^>]+src="data:image\/png;base64,/);
});

test('pure-JS PNG round-trips through zlib', () => {
  const rgb = new Uint8Array(70000 * 3).map((_, i) => (i * 7) & 255); // > one 64 KiB stored block
  const png = encodePngRgb({ width: 700, height: 100, rgb });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idatLen = new DataView(png.buffer).getUint32(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(raw.length, 100 * (1 + 700 * 3));
  assert.deepEqual([...raw.subarray(1, 1 + 700 * 3)], [...rgb.subarray(0, 700 * 3)]);
  const c = cropWindow({ rgba: new Uint8Array(4 * 4 * 4).fill(255), width: 4, height: 4 }, { cx: 0, cy: 0, size: 6 });
  assert.deepEqual(c.origin, [-3, -3]);
});
