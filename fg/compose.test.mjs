/**
 * Tests for FGs as higher-order functions over Compositions (fg/compose.mjs)
 * and the property mixins (fg/mixins.mjs):
 *   1. a UNIT test FG: one real Calculation (fn.testimony.teePoints, the one
 *      the runner registers) applied to Sam's real golden annotation
 *   2. a COMPONENT test FG: a span of real Calculations (teePoints, then the
 *      precision judge judgeMembers registered as a Calculation)
 *   3. decorators compose by function composition in an inspectable order;
 *      their declarations union into the FG; forced render fails an FG that
 *      draws nothing
 *   4. flow: fork joins variants (an ablation-shaped join with effectMatrix),
 *      forkJoin runs comparableForkJoin, reuse runs a Composition once per key
 *   5. stages/*.json "properties" are cross-checked against the composition
 *   6. unitful fails by name on a number without a unit; FIX_BOUNDS is covered
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { asNodeTest, calc, componentTest, decorator, fork, forkJoin, guarantee, pipe, read, reuse, runComposition, sequence, step, unitTest } from './compose.mjs';
import { delta, framed, gated, judged, materialized, unitful, unitlessPaths, witnessed } from './mixins.mjs';
import { TEE_POINTS_CALCULATION, judgeMembers, memberPose } from './s3/teeFamily.mjs';
import { createPartStore } from './store.mjs';
import { runGuarantee } from './guarantee.mjs';
import { runGuarantees, crossCheck } from './registry.mjs';
import { createMemorySink } from './sinks.mjs';
import { effectMatrix } from './ablation.mjs';
import { FIX_BOUNDS, FIX_BOUNDS_UNITS } from '../ports/early/s3FamilyFix.mjs';
import teePose from '../contracts/tee.pose@1.mjs';
import s2Materialize from './s2/fg.s2.pxBaskets.materialize.fg.mjs';
import s2Assembly from './s2/fg.s2.pxBaskets.assembly.fg.mjs';

// Sam's golden annotation, byte for byte, and the golden S0 crop (1290 x 2091 source, 4 rows off the top, 4 off the bottom).
const ANNOTATION_PATH = new URL('../testimony/golden/DashsTrack-full.annotation.json', import.meta.url);
const annotationBytes = new Uint8Array(readFileSync(ANNOTATION_PATH));
const annotation = JSON.parse(new TextDecoder().decode(annotationBytes));
const crop = { originalPx: { width: 1290, height: 2091 }, upperRowsRemoved: 4, lowerRowsRemoved: 4, croppedPx: { width: 1290, height: 2083 } };
const testimonyFixtures = { 'testimony.source.annotation': { path: 'testimony/golden/DashsTrack-full.annotation.json', specimen: 'golden', sha256: null, bytes: annotationBytes }, 'tk.source.cropReceipt': crop };
const withTeePoints = (store) => store.register('fn.testimony.teePoints', TEE_POINTS_CALCULATION);

test('unit test FG: fn.testimony.teePoints on the golden annotation', () => {
  const fg = unitTest({
    id: 'fg.test.unit.teePoints', calculation: 'fn.testimony.teePoints',
    expect: (s) => {
      const { points } = s.out['testimony.source.teePoints'];
      const withTee = annotation.holes.filter((h) => h.tee);
      return {
        everyAnnotatedTeeConverted: points.length === withTee.length && points.length === 18,
        canonicalIsSourceMinusUpperRows: points.every((p) => p.canonical[0] === p.source[0] && p.canonical[1] === p.source[1] - crop.upperRowsRemoved),
        holesInOrder: points.every((p, i) => i === 0 || points[i - 1].hole < p.hole),
        insideCanonicalFrame: points.every(({ canonical: [x, y] }) => x >= 0 && x < 1290 && y >= 0 && y < 2083)
      };
    }
  });
  const { record, frames } = asNodeTest(fg, { fixtures: testimonyFixtures, register: withTeePoints })();
  assert.equal(record.status, 'held');
  assert.deepEqual(record.checks.filter((c) => !c.name.startsWith('read:') && !c.name.startsWith('call:')).map((c) => c.name),
    ['everyAnnotatedTeeConverted', 'canonicalIsSourceMinusUpperRows', 'holesInOrder', 'insideCanonicalFrame', 'rendered']);
  assert.deepEqual(record.callCount, { 'fn.testimony.teePoints': 1 });
  assert.equal(frames.length, 1, 'forced render: the test outcome is a flipbook page');
  assert.deepEqual(record.properties, ['instrumented', 'rendered']);
});

test('component test FG: teePoints -> judgeMembers over a span, real code paths, fixture members', () => {
  const judge = 'fn.test.s3.judgeMembers';
  const fg = componentTest({
    id: 'fg.test.component.teeJudge', guards: ['testimony.source.teePoints', judge],
    span: sequence(read('testimony.source.teePoints'), calc(judge, { as: 'judged', args: (s) => {
      const pts = s.parts['testimony.source.teePoints'].points;
      // five genuine members on annotated tees, one impostor 300 px away
      const ms = pts.slice(0, 5).map((p) => memberPose({ cx: p.canonical[0], cy: p.canonical[1], bboxX: p.canonical[0] - 5, bboxY: p.canonical[1] - 4, bboxW: 10, bboxH: 8, holeArea: 60 },
        { label: 1, bboxX: p.canonical[0] - 8, bboxY: p.canonical[1] - 6, bboxW: 16, bboxH: 12, angle: 0 }));
      const [x, y] = pts[0].canonical;
      ms.push(memberPose({ cx: x + 300, cy: y, bboxX: x + 295, bboxY: y - 4, bboxW: 10, bboxH: 8, holeArea: 60 }, { label: 2, bboxX: x + 292, bboxY: y - 6, bboxW: 16, bboxH: 12, angle: 0 }));
      return { members: ms, points: pts };
    } })),
    expect: (s) => ({
      fiveAgreeOneImpostor: s.judged.totals.agrees === 5 && s.judged.totals.disagrees === 1,
      precisionIsFiveSixths: s.judged.totals.precision === 0.8333,
      uncoveredAreTheRest: s.judged.totals.uncoveredPoints === 18 - 5
    })
  });
  const { record } = asNodeTest(fg, { fixtures: testimonyFixtures, register: (store) => {
    withTeePoints(store);
    store.register(judge, { calculate: ({ args }) => judgeMembers(args.members, args.points) });
  } })();
  assert.equal(record.status, 'held');
  assert.deepEqual(record.callCount, { [judge]: 1 });
  assert.ok(record.reads.includes('testimony.source.teePoints') && record.calls.includes(judge), 'the span declares what it reads and calls');
});

const toyStore = () => {
  const store = createPartStore({ base: null, name: 'toy' });
  store.constant('fn.toy.fixture', { 'px.toy': { objects: [{ px: [1, 2, 3] }, { px: [7, 8] }] }, 'px.toy.base': [{ px: [1, 2, 3] }, { px: [7, 9] }] });
  store.register('fn.toy.double', { calculate: ({ args }) => args.n * 2 });
  return store;
};

test('decorators compose in code order; declarations union; forced render fails an FG that draws nothing', () => {
  const mark = (name) => decorator({ name, property: name, after: (env, s) => ({ order: [...(s.order ?? []), name] }) });
  const base = pipe(read('px.toy'), mark('first'), mark('second'));
  const fg = guarantee({ id: 'fg.toy.order', guards: ['px.toy'], result: (s) => ({ totals: { stepsCount: s.order.length }, order: s.order }) },
    pipe(base, framed(() => [{ title: 'toy', parts: [{ address: 'px.toy', kind: 'scalar', data: { value: 2, unit: 'objects' } }] }]),
      delta({ out: 'px.toy', base: 'px.toy.base', by: 'fn.toy', outPx: (s) => s.parts['px.toy'].objects.map((o, i) => [`#${i}`, o.px]), basePx: (s) => s.parts['px.toy.base'].map((o, i) => [`#${i}`, o.px]) }),
      step('needs base', (env, s) => ({ parts: { ...s.parts, 'px.toy.base': env.get('px.toy.base') } }), { reads: ['px.toy.base'] })));
  assert.deepEqual(fg.plan.map((p) => p.name).slice(0, 3), ['read px.toy', 'first', 'second']);
  assert.deepEqual(fg.properties, ['first', 'second', 'framed', 'delta:px.toy.base', 'instrumented', 'rendered']);
  assert.deepEqual(fg.reads, ['px.toy', 'px.toy.base'], 'a step declares its own reads; the FG is their union');
  // the delta ran before the step that reads its base: the plan order is the execution order, so this FG fails by name
  assert.throws(() => runGuarantee(fg, { store: toyStore(), sink: createMemorySink() }), /run threw/);
  const fixed = guarantee({ id: 'fg.toy.order2', guards: ['px.toy'] }, pipe(read('px.toy', 'px.toy.base'),
    delta({ out: 'px.toy', base: 'px.toy.base', by: 'fn.toy', outPx: (s) => s.parts['px.toy'].objects.map((o, i) => [`#${i}`, o.px]), basePx: (s) => s.parts['px.toy.base'].map((o, i) => [`#${i}`, o.px]) }),
    framed(() => [{ title: 'toy', parts: [{ address: 'px.toy', kind: 'scalar', data: { value: 2, unit: 'objects' } }] }])));
  const { record } = runGuarantee(fixed, { store: toyStore(), sink: createMemorySink() });
  assert.deepEqual(record.baseDelta, { model: 'M1', out: 'px.toy', base: 'px.toy.base', by: 'fn.toy', totals: { outPx: 5, basePx: 5, addedPx: 1, removedPx: 1 }, changedObjectCount: 1 });
  const silent = guarantee({ id: 'fg.toy.silent', guards: ['px.toy'] }, read('px.toy'));
  assert.throws(() => runGuarantee(silent, { store: toyStore(), sink: createMemorySink() }), (e) => e.name === 'GuaranteeFailure' && e.failed.includes('rendered'));
});

test('fork joins variants (an ablation-shaped join); a variant that throws is its result', () => {
  const variant = (n) => calc('fn.toy.double', { as: 'doubled', args: () => ({ n }) });
  const boom = step('boom', () => { throw new Error('variant broke'); })(null);
  const flow = fork({ name: 'ablation', variants: { baseline: variant(2), ablated: variant(10), broken: boom }, join: (results) => {
    const rows = ['ablated', 'baseline'].map((id) => ({ id, fork: id, parts: { 'S3:tees': [{ center: [results[id].s.doubled, 0], angleRad: 0 }] } }));
    const column = { id: 'S3:tees', stage: 'S3', part: 'px.tees', contract: teePose, label: (m) => `tee@${m.center[0]}` };
    return { broken: results.broken.error, matrix: effectMatrix({ columns: [column], rows, baseline: 'baseline' }) };
  } });
  const { record } = runComposition(pipe(flow, framed(() => [{ title: 'fork', parts: [{ address: 'cmp', kind: 'ledger', data: { rows: [] } }] }])),
    { store: toyStore(), result: (s) => ({ totals: null, joined: { broken: s.ablation.broken, cells: s.ablation.matrix.rows.map((r) => [r.id, r.cells['S3:tees'].status]) } }) });
  assert.equal(record.status, 'held');
  assert.equal(record.joined.broken, 'variant broke');
  assert.deepEqual(record.joined.cells, [['ablated', 'changed'], ['baseline', 'unchanged']], 'the ablated tee moved 16 px (4 -> 20), past the tee.pose@1 tolerance');
  assert.deepEqual(record.callCount, { 'fn.toy.double': 2 });
});

test('forkJoin runs comparableForkJoin as a Composition at the runner level; reuse runs once per key', () => {
  const store = toyStore();
  const board = () => { const m = new Map([['px.toy.sizes', [3, 9, 4]]]); return { get: (a) => m.get(a), has: (a) => m.has(a), set: (a, v) => m.set(a, v) }; };
  const flow = forkJoin({ as: 'fj', slot: 'fn.toy.pick', part: 'px.toy.picked', restore: board,
    implementations: { big: Object.assign((p) => p.get('px.toy.sizes').filter((x) => x > 3), { reads: ['px.toy.sizes'] }), all: Object.assign((p) => p.get('px.toy.sizes'), { reads: ['px.toy.sizes'] }) },
    guarantees: [], compare: ({ branches }) => Object.fromEntries(Object.entries(branches).map(([n, b]) => [n, b.store.get('px.toy.picked').length])) });
  const once = reuse(calc('fn.toy.double', { as: 'd', args: () => ({ n: 21 }) }), { key: 'double21' });
  const { record } = runComposition(pipe(sequence(flow, once, once), framed((s) => [{ title: 'fj', parts: [{ address: 'cmp.fn.toy.pick', kind: 'ledger', data: { rows: [s.fj.comparison.value] } }] }])),
    { store, result: (s) => ({ totals: null, cmp: s.fj.comparison.value, d: s.d }) });
  assert.deepEqual(record.cmp, { all: 3, big: 2 });
  assert.equal(record.d, 42);
  assert.deepEqual(record.callCount, { 'fn.toy.double': 1 }, 'the second use replayed the first');
  // inside an FG (no store capability) forkJoin refuses by name
  const inside = guarantee({ id: 'fg.toy.fj', guards: ['px.toy'] }, pipe(flow, framed(() => [])));
  assert.throws(() => runGuarantee(inside, { store: toyStore(), sink: createMemorySink() }), /needs the run's store/);
});

test('stages/*.json properties are cross-checked against the composition', () => {
  const declared = (props) => ({ id: s2Materialize.id, part: 'px.baskets', appliesTo: 'every S2 run', requires: [], ...(props ? { properties: props } : {}) });
  const own = s2Materialize.properties.filter((p) => !['instrumented', 'rendered'].includes(p));
  assert.deepEqual(crossCheck([s2Materialize], [declared(own)]).mismatches, []);
  assert.deepEqual(crossCheck([s2Materialize], [declared([...own].reverse())]).mismatches, [], 'a multiset: the stage may list them in reading order');
  const missing = crossCheck([s2Materialize], [declared(own.filter((p) => p !== 'conserved:S2'))]).mismatches;
  assert.deepEqual(missing.map((m) => [m.field, m.missing]), [['properties', ['conserved:S2']]]);
  assert.equal(crossCheck([s2Materialize], [declared(null)]).mismatches[0].field, 'properties', 'a composed FG must be declared readable');
  const s2 = JSON.parse(readFileSync(new URL('../stages/s2.json', import.meta.url), 'utf8'));
  assert.deepEqual(crossCheck([s2Materialize, s2Assembly], s2.guarantees).mismatches, []);
  assert.ok(s2.guarantees.every((g) => g.properties.length > 0));
});

test('unitful: a number without a unit fails by name; FIX_BOUNDS carries a unit for every number', () => {
  assert.deepEqual(unitlessPaths({ totals: { claimedPx: 3, visits: 4 }, rows: [{ index: 0, score: 0.5 }], scalar: { value: 2, unit: 'members' } }),
    ['totals.visits', 'rows.[].score']);
  assert.deepEqual(unitlessPaths({ totals: { visits: 4 } }, { visits: 'px visits' }), []);
  const fg = guarantee({ id: 'fg.toy.units', guards: ['px.toy'], audit: [unitful({ params: { FIX_BOUNDS: [FIX_BOUNDS, FIX_BOUNDS_UNITS] } })], result: () => ({ totals: { objectsCount: 2, spread: 0.3 } }) },
    pipe(read('px.toy'), framed(() => [{ title: 'u', parts: [{ address: 'px.toy', kind: 'scalar', data: { value: 2, unit: 'objects' } }] }])));
  assert.throws(() => runGuarantee(fg, { store: toyStore(), sink: createMemorySink() }),
    (e) => e.failed.includes('unitful') && e.record.checks.find((c) => c.name === 'unitful').detail.unitless.join() === 'record.totals.spread');
  assert.deepEqual(Object.keys(FIX_BOUNDS).filter((k) => !FIX_BOUNDS_UNITS[k]), []);
});

test('mixins add verdicts and records, never values: materialized/witnessed/judged/gated on a toy', () => {
  const sink = createMemorySink();
  const first = guarantee({ id: 'fg.toy.first', guards: ['px.toy'], result: () => ({ totals: { objectsCount: 2 } }) },
    pipe(read('px.toy'), framed(() => [{ title: 't', parts: [{ address: 'px.toy', kind: 'scalar', data: { value: 2, unit: 'objects' } }] }])));
  const second = guarantee({ id: 'fg.toy.second', guards: ['px.toy'], result: (s) => ({ totals: { objectsCount: s.parts['px.toy'].objects.length } }) }, pipe(read('px.toy'),
    gated('fg.toy.first', { checks: [{ name: 'countMatchesFirst', mine: (s) => s.parts['px.toy'].objects.length, theirs: (r) => r.totals.objectsCount }] }),
    witnessed.provider('fn.toy.double', { name: 'doubleWitness', run: (call) => call({ n: 2 }) === 4 }),
    judged('expectation', { judge: (s) => ({ matches: s.parts['px.toy'].objects.length === 3 }) }),
    materialized({ artifacts: (s) => [{ id: 'toy', kind: 'json', path: 'toy.json', json: s.parts['px.toy'] }], reread: (s, readBack) => readBack('toy').objects.length === 2 }),
    framed((s) => [{ title: 'toy', parts: [{ address: 'px.toy', kind: 'pxset', artifact: s.entries.toy }] }])));
  const { records } = runGuarantees({ guarantees: [first, second], store: toyStore(), sink });
  const r = records['fg.toy.second'];
  assert.equal(r.status, 'held', 'a judged mismatch is a finding, not a failure');
  assert.deepEqual(r.requires, ['fg.toy.first']);
  assert.deepEqual(r.judged, [{ against: 'expectation', matches: false, acceptance: 'UNKNOWN' }]);
  assert.deepEqual([...r.checks.map((c) => c.name), ...r.witnesses.map((w) => w.name)].filter((n) => !n.includes(':')),
    ['countMatchesFirst', 'artifactsRehashedAfterWrite', 'artifactsReReadAndCompared', 'rendered', 'doubleWitness']);
});
