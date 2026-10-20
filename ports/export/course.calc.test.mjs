import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../../fg/store.mjs';
import contract, { validateCourseGeometry, compareHole, FORMAT, VERSION } from '../../contracts/export.course@1.mjs';
import { exportCourse, courseGeometryOf } from './course.calc.mjs';

// a 3-hole course in a 400 x 300 px upload whose top 4 rows S0 removed (canonical y = upload y - 4)
const crop = { originalPx: { width: 400, height: 300 }, upperRowsRemoved: 4, lowerRowsRemoved: 4 };
const img = { widthPx: 400, heightPx: 292, rgba: new Uint8Array(400 * 292 * 4) };
const badges = [
  { label: '1', bbox: [10, 10, 21, 21], confidence: 0.9 }, { label: '2', bbox: [10, 60, 21, 21], confidence: 0.8 }, { label: '2', bbox: [12, 62, 21, 21], confidence: 0.95 },
  { label: '3', bbox: [10, 110, 21, 21], confidence: 0.7 }, { label: 'x', bbox: [0, 0, 5, 5], confidence: 1 }
];
const holesPart = {
  holes: [{ hole: '1', tee: { teeCenter: [20, 20.123], source: 'S3 association (ports/s3assoc)' } }, { hole: '2', tee: { teeCenter: [20, 70], source: 'S4 recovered (x)' } }, { hole: '3', tee: null, condition: 'no tee (neither the S3 association nor S4 recovery gives one)' }],
  baskets: [{ index: 0, name: 'Basket ca', point: [200, 20] }, { index: 1, name: 'Basket cb', point: [300, 150] }, { index: 2, name: 'Basket cc', point: [100, 250] }], conditions: []
};
const solve = {
  holes: { 1: { verts: [[22, 20], [200, 20]], how: 'straight: sensor 1.00 on 100 st' }, 2: { verts: [[22, 70], [150, 90], [300, 150]], how: 'contrast route (1 bends): sensor 0.60', pair: { marginLum: 4.4444 } } },
  assignment: [{ hole: '1', basket: 0, sensor: 1, stations: 100 }, { hole: '2', basket: 1, sensor: 0.6, stations: 50 }], widthPx: 40
};
const document = () => courseGeometryOf({ solve, holesPart, hallway: { widthPx: 41.627 }, badges, crop, source: { fileName: 'a.jpg', sha256: 'a'.repeat(64) }, producer: { name: 'chainspot-toolkit' } });

test('courseGeometryOf: AnnotatedHole shapes in the original-upload frame, evidence outside them', () => {
  const doc = document();
  assert.equal(doc.format, FORMAT); assert.equal(doc.version, VERSION);
  assert.deepEqual(validateCourseGeometry(doc), { ok: true, errors: [] });
  const [h1, h2, h3] = doc.holes;
  assert.deepEqual(h1, { id: 'hole-1', number: 1, tee: { xPx: 20, yPx: 24.12 }, basket: { xPx: 200, yPx: 24 }, shots: [], corridorBends: [], corridorWidthPx: 41.63 });   // y + 4 rows
  assert.deepEqual(h2.corridorBends, [{ xPx: 150, yPx: 94 }]);
  assert.deepEqual(h3, { id: 'hole-3', number: 3, shots: [], corridorBends: [], corridorWidthPx: 41.63 });
  assert.deepEqual(doc.evidence.map((e) => [e.holeId, e.status, e.confidence.level]), [['hole-1', 'straight', 'confirmed'], ['hole-2', 'partial', 'unconfirmed'], ['hole-3', 'unresolved', 'noReading']]);
  assert.match(doc.evidence[1].reasons.join(' '), /0\.6 on 50 stations/);
  assert.equal(doc.evidence[0].trace.lengthPx, 178);
});

test('badges are one per number (best read), centred, in the upload frame; unassigned baskets are unproven candidates', () => {
  const doc = document();
  assert.deepEqual(doc.numberBadges.map((b) => [b.number, b.xPx, b.yPx, b.confidence]), [[1, 20, 24, 0.9], [2, 22, 76, 0.95], [3, 20, 124, 0.7]]);
  assert.deepEqual(doc.candidates, [{ label: 'Basket cc', xPx: 100, yPx: 254, kind: 'basket' }]);
});

test('data conditions are recorded, never thrown: no hallway width exports no hole; a point outside the frame is dropped, not clamped', () => {
  const none = courseGeometryOf({ solve, holesPart, hallway: { widthPx: null }, badges, crop, source: { fileName: 'a.jpg', sha256: 'a'.repeat(64) }, producer: { name: 't' } });
  assert.deepEqual(none.holes, []); assert.match(none.conditions.join(' '), /no hallway width/);
  const out = courseGeometryOf({ solve: { ...solve, holes: { 1: { verts: [[22, 20], [999, 20]] } } }, holesPart, hallway: { widthPx: 40 }, badges, crop, source: { fileName: 'a.jpg', sha256: 'a'.repeat(64) }, producer: { name: 't' } });
  assert.equal(out.holes[0].basket, undefined); assert.equal(out.evidence[0].status, 'partial'); assert.match(out.evidence[0].reasons.join(' '), /outside the 400 x 300 px source frame: dropped/);
});

test('fn.tk.export.course: produces tk.export.course, emits its measures, renders over the course', () => {
  const parts = { 'tk.s7.holes': holesPart, 'tk.s7.hallway': { widthPx: 41.627 }, 'px.badges': badges, 'tk.source.cropReceipt': crop, 'tk.source.sha256': 'a'.repeat(64), 'tk.source.path': '/x/a.jpg', 'tk.source.captureProvenance': null, 'tk.export.producer': { name: 'chainspot-toolkit' }, 'tk.export.ruleSet': { variant: 'routeMatch', rules: {}, how: 'test' }, 'tk.s7.sceneS4': { R1: 44.5 }, 'px.image.cropped': img };
  const store = createPartStore({ base: { has: (a) => a in parts, get: (a) => parts[a] } });
  store.register('fn.q.trace.routeMatch', { calculate: () => ({ value: solve, unit: 'px (canonical frame)' }) });
  store.register(...exportCourse);
  const part = store.get('tk.export.course');
  assert.equal(part.source.fileName, 'a.jpg');
  const emits = store.calls().find((e) => e.calculation === 'fn.tk.export.course').emits;
  assert.deepEqual([emits.holesCount, emits.straightHolesCount, emits.partialHolesCount, emits.unresolvedHolesCount, emits.numberBadgesCount, emits.candidatesCount], [3, 1, 1, 1, 3, 1]);
  const r = store.call(RENDER_PART, { a: 'tk.export.course' }).value;
  assert.equal(r.kind, 'courseGeometry');
  assert.ok(r.parts.find((p) => p.kind === 'raster').data.png.length > 100);
  assert.equal(r.parts.find((p) => p.address.endsWith('#holes')).data.rows.length, 3);
});

test('contracts/export.course@1: same hole within 8 px tee, 12 px basket, half the corridor width at the bends', () => {
  const a = document().holes[1];
  const near = { ...a, tee: { xPx: a.tee.xPx + 7, yPx: a.tee.yPx }, basket: { xPx: a.basket.xPx, yPx: a.basket.yPx + 11 }, corridorBends: [{ xPx: 150 + 20, yPx: 94 }] };
  assert.equal(contract.equal(a, near).ok, true);
  assert.equal(contract.equal(a, { ...near, tee: { xPx: a.tee.xPx + 9, yPx: a.tee.yPx } }).ok, false);
  assert.equal(contract.equal(a, { ...near, corridorBends: [{ xPx: 150 + 21, yPx: 94 }] }).ok, false, 'half of 41.63 px is 20.8 px');
  assert.equal(contract.equal(a, { ...near, corridorBends: [] }).ok, false);
  assert.equal(contract.equal(a, { ...near, number: 3 }).ok, false);
  assert.equal(compareHole(a, a, contract.tolerances).score, 0);
});

test('validateCourseGeometry reports, never throws', () => {
  const doc = document();
  assert.equal(validateCourseGeometry(null).ok, false);
  assert.match(validateCourseGeometry({ ...doc, holes: [{ ...doc.holes[0], shots: [{}] }] }).errors.join(), /shots must be \[\]/);
  assert.match(validateCourseGeometry({ ...doc, holes: [{ ...doc.holes[0], confidence: 1 }] }).errors.join(), /not an AnnotatedHole field/);
  assert.match(validateCourseGeometry({ ...doc, source: { ...doc.source, sha256: 'zz' } }).errors.join(), /sha256/);
});

// ---- the golden fixture: produced by ports/export/run.mjs on the golden dev attempt, pinned by sha256 in both repos
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const FIXTURE = new URL('./fixtures/golden.course-geometry.json', import.meta.url);
export const GOLDEN_FIXTURE_SHA256 = 'e81cd32fff3e24d690a185457da5f47e41a2f6db766e949cbb6cc9e22d7ffc9b';

test('golden fixture: pinned bytes, valid format, every hole is an AnnotatedHole', () => {
  const bytes = readFileSync(FIXTURE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), GOLDEN_FIXTURE_SHA256, 'a changed fixture is a new pin in BOTH repos (chainspot tests/unit/courseGeometry.test.ts)');
  const doc = JSON.parse(bytes);
  assert.deepEqual(validateCourseGeometry(doc), { ok: true, errors: [] });
  assert.equal(doc.source.sha256, 'e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a');
  assert.deepEqual([doc.holes.length, doc.numberBadges.length, doc.evidence.length], [18, 18, 18]);
});

test('golden fixture vs Sam\'s testimony (agreement, never acceptance): tee 8 px, basket 12 px, bends within W/2; TP/FN/FP and right/wrong hole', () => {
  const doc = JSON.parse(readFileSync(FIXTURE)), sam = JSON.parse(readFileSync(new URL('../../testimony/golden/DashsTrack-full.annotation.json', import.meta.url)));
  let tp = 0, wrongHole = 0, fp = 0;
  for (const h of doc.holes) {
    const t = sam.holes.find((x) => x.number === h.number);
    if (!t) { fp++; continue; }
    if (contract.equal(h, t).ok) tp++;
    else if (sam.holes.some((x) => x.number !== h.number && contract.equal({ ...h, number: x.number }, x).ok)) wrongHole++;
  }
  const fn = sam.holes.filter((t) => !doc.holes.some((h) => h.number === t.number)).length;
  assert.deepEqual({ tp, fn, fp, wrongHole, judged: sam.holes.length }, { tp: 18, fn: 0, fp: 0, wrongHole: 0, judged: 18 });
});

test('the export runs the S7 rule set the pointer vote accepted, never a hard-coded default; --variant overrides', async () => {
  const { exportRuleSet } = await import('./run.mjs');
  const { RULE_SETS } = await import('../s7route/match.mjs');
  const given = exportRuleSet('/nonexistent', 'routeMatchS6CoordWide');
  assert.deepEqual(given.rules, RULE_SETS.routeMatchS6CoordWide); assert.match(given.how, /--variant/);
  const none = exportRuleSet('/nonexistent');
  assert.equal(none.variant, 'routeMatch'); assert.match(none.how, /no S7 pointer on record/);
  assert.match(exportRuleSet('/nonexistent', 'pinned').how, /not a routeMatch rule set/);
});

test('the export carries the C1 ground scale: 10 m = rC1 px, so a 445 px route at rC1 44.5 px is 100 m = 328 ft', async () => {
  const { courseGeometryOf } = await import('./course.calc.mjs');
  const doc = courseGeometryOf({ solve: { holes: { 1: { verts: [[0, 0], [445, 0]] } }, assignment: [{ hole: '1', basket: 0, sensor: 1, stations: 400 }] },
    holesPart: { holes: [{ hole: '1', tee: { teeCenter: [0, 0], source: 'S3' } }], baskets: [{ index: 0, name: 'Basket ca', point: [445, 0] }], conditions: [] },
    hallway: { widthPx: 40 }, badges: [], crop: { upperRowsRemoved: 0, lowerRowsRemoved: 0, originalPx: { width: 1000, height: 1000 } },
    source: { fileName: 'a.png', sha256: 'a'.repeat(64) }, producer: {}, r1Px: 44.5 });
  assert.equal(doc.scale.metresPerPx, Math.round((10 / 44.5) * 1e6) / 1e6);
  assert.equal(doc.evidence[0].trace.lengthFt, 328);
});
