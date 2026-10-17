/**
 * Tests for convention discovery (fg/discover.mjs), ComparableForkJoin
 * (fg/forkjoin.mjs) and the static flipbook (fg/flipbook.mjs):
 *   1. discoverGuarantees picks up the fixture FG dir (including a nested
 *      lanes/ dir, skipping fixtures/), crossCheck against the fixture
 *      stage declarations reports declared-but-unimplemented and
 *      implemented-but-undeclared without throwing, and the real stages/
 *      declarations load and cross-check against fg/ (nothing ported yet).
 *   2. Two discovered fn.toy.findFamily implementations fork from the same
 *      restored board under the same FGs, each run as the registered
 *      Calculation fn.toy.findFamily on its branch store; the comparison
 *      lists the per-candidate disagreement (blob c) with its own frames; a
 *      branch failing a guarantee, or an implementation reading an
 *      undeclared Part, is a comparison result, not a crash.
 *   3. The flipbook has one page per frame and embeds the raster.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { discoverGuarantees, discoverImplementations, loadDeclarations, loadRegistry } from './discover.mjs';
import { crossCheck } from './registry.mjs';
import { comparableForkJoin, forkJoinFrames } from './forkjoin.mjs';
import { framesJson, renderFlipbook } from './flipbook.mjs';
import { canonicalJson } from './canon.mjs';
import { toyBoard } from './fixtures/board.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, 'fixtures');
const SLOT = 'fn.toy.findFamily';
const PART = 'px.blobs.family';

/** The comparator: per candidate blob, each branch's membership; disagreements named. */
function compareFamilies({ branches, frame }) {
  const names = Object.keys(branches).sort();
  const held = names.filter((n) => !branches[n].error);
  const base = branches[held[0]].records['fg.toy.blobs.materialize'];
  const candidates = base.blobIds.map((id) => ({
    id, ...Object.fromEntries(names.map((n) => [n, branches[n].error ? null : branches[n].records['fg.toy.family.materialize'].members.includes(id)]))
  }));
  const disagreements = candidates.filter((c) => new Set(names.map((n) => c[n])).size > 1);
  const blobs = branches[held[0]].store.get('px.blobs');
  frame({
    title: `${SLOT}: ${disagreements.length} disagreeing candidate(s)`, calculation: SLOT,
    parts: [
      { address: `cmp.${SLOT}.disagreements`, kind: 'pxset', data: { width: blobs.width, height: blobs.height, px: blobs.blobs.filter((b) => disagreements.some((d) => d.id === b.id)).flatMap((b) => b.px) } },
      { address: `cmp.${SLOT}.ledger`, kind: 'ledger', data: { rows: candidates } },
      { address: `cmp.${SLOT}.count`, kind: 'scalar', data: { value: disagreements.length } }
    ],
    verdicts: candidates.map((c) => ({ name: c.id, ok: !disagreements.includes(c) }))
  });
  return { candidates, disagreements: disagreements.map((d) => d.id), failedBranches: names.filter((n) => branches[n].error) };
}

test('discovery picks up the fixture FG dir and cross-checks declarations without crashing', async () => {
  const fgs = await discoverGuarantees(join(fixtures, 'fgs'));
  assert.deepEqual(fgs.map((fg) => fg.id), ['fg.toy.blobs.materialize', 'fg.toy.blobs.undeclared', 'fg.toy.family.experimental', 'fg.toy.family.materialize']);
  const { registry, report } = await loadRegistry({ root: join(fixtures, 'fgs'), stagesDir: join(fixtures, 'stages') });
  assert.deepEqual(registry.order(), ['fg.toy.blobs.materialize', 'fg.toy.blobs.undeclared', 'fg.toy.family.materialize', 'fg.toy.family.experimental']);
  assert.deepEqual(report.declaredUnimplemented, ['fg.toy.declaredOnly']);
  assert.deepEqual(report.implementedUndeclared, ['fg.toy.blobs.undeclared']);
  assert.deepEqual(report.mismatches, []);
  // a lane or requires drift between prose and code is reported, not thrown
  const drift = crossCheck(fgs.map((fg) => fg.id === 'fg.toy.family.materialize' ? { ...fg, requires: [], lane: 'x' } : fg), loadDeclarations(join(fixtures, 'stages')));
  assert.deepEqual(drift.mismatches.map((m) => m.field), ['lane', 'requires']);
});

test('real stages/*.json declarations load; scanning fg/ skips fixtures; S1-S3 are fully ported', async () => {
  const { registry, report } = await loadRegistry({ root: here, stagesDir: join(here, '..', 'stages') });
  const s1 = ['fg.s1.badgeGlyphTemplate.materialize', 'fg.s1.pxBadges.assembly', 'fg.s1.pxBadges.materialize', 'fg.s1.pxDigits.materialize'];
  const s2 = ['fg.s2.pxBaskets.assembly', 'fg.s2.pxBaskets.materialize'];
  const s3 = ['fg.s3.pxTees.assembly', 'fg.s3.pxTees.materialize', 'fg.s3.pxTeesFamilyFix.materialize', 'fg.s3.pxTeesRingsFamily.materialize'];
  const s3fj = ['fg.s3.teeFamily.materialize', 'fg.s3.teeFamily.precision'];
  const all = [...s1, ...s2, ...s3, ...s3fj];
  assert.deepEqual(registry.ids, all, 'every S1-S3 FG file, no fixtures');
  assert.equal(report.implemented, all.length);
  assert.deepEqual(report.implementedUndeclared, []);
  assert.deepEqual(report.declaredUnimplemented, [], 'no S1-S3 guarantee is still an inline block');
  assert.deepEqual(report.mismatches, [], 'part (incl. multi-Part a + b), lane, site and prose-named requires agree with stages/s1-s3.json');
  assert.equal(report.declared, all.length);
  for (const id of s3fj) {
    const fg = registry.guarantees.find((g) => g.id === id);
    assert.equal(fg.lane, 's3-findfamily-forkjoin');
    assert.equal(fg.site, 'forkjoin', 'fork-join FGs never run on the stage store');
  }
  for (const id of [...s1, ...s2, ...s3]) assert.equal(registry.guarantees.find((g) => g.id === id).site, 'stage');
  const order = registry.order();
  assert.ok(order.indexOf('fg.s3.teeFamily.precision') > order.indexOf('fg.s3.teeFamily.materialize'));
  // every assembly / fix runs after the records it gates against
  for (const [later, earlier] of [
    ['fg.s1.pxBadges.assembly', 'fg.s1.pxBadges.materialize'], ['fg.s1.pxBadges.assembly', 'fg.s1.pxDigits.materialize'],
    ['fg.s2.pxBaskets.assembly', 'fg.s2.pxBaskets.materialize'], ['fg.s3.pxTees.assembly', 'fg.s3.pxTees.materialize'],
    ['fg.s3.pxTeesFamilyFix.materialize', 'fg.s3.pxTees.materialize'], ['fg.s3.pxTeesFamilyFix.materialize', 'fg.s3.pxTeesRingsFamily.materialize']
  ]) assert.ok(order.indexOf(later) > order.indexOf(earlier), `${later} after ${earlier}`);
  const lanes = Object.fromEntries(registry.guarantees.map((g) => [g.id, g.lane]));
  assert.equal(lanes['fg.s1.pxBadges.assembly'], 's1-badge-assembly');
  assert.equal(lanes['fg.s2.pxBaskets.assembly'], 's2-basket-assembly');
  assert.equal(lanes['fg.s3.pxTees.assembly'], 's3-tee-assembly');
  assert.equal(lanes['fg.s3.pxTeesFamilyFix.materialize'], 's3-findfamily-structural-fix');
  // cross-stage records travel as Parts, never as requires
  assert.ok(registry.guarantees.find((g) => g.id === 'fg.s3.pxTees.materialize').reads.includes('tk.fg.s2.pxBaskets.materialize.record'));
  for (const fg of registry.guarantees) for (const r of fg.requires) assert.equal(r.split('.')[1], fg.id.split('.')[1], `${fg.id} requires ${r} across a stage boundary`);
});

test('crossCheck: a multi-Part declaration names every guarded Part, and a site drift is reported', () => {
  const fg = { id: 'fg.toy.multi', guards: ['px.a'], requires: [], lane: null, site: 'stage' };
  const decl = { id: 'fg.toy.multi', part: 'px.a + px.b', appliesTo: 'every run', requires: [] };
  assert.deepEqual(crossCheck([fg], [decl]).mismatches.map((m) => m.field), ['part']);
  assert.deepEqual(crossCheck([{ ...fg, guards: ['px.a', 'px.b'] }], [decl]).mismatches, []);
  assert.deepEqual(crossCheck([{ ...fg, guards: ['px.a', 'px.b'] }], [{ ...decl, site: 'forkjoin' }]).mismatches.map((m) => m.field), ['site']);
});

test('comparableForkJoin runs two discovered implementations under the same FGs and names the disagreement', async () => {
  const implementations = await discoverImplementations(join(fixtures, 'impl'), SLOT);
  assert.deepEqual(Object.keys(implementations), ['byRow', 'bySize']);
  assert.deepEqual(implementations.bySize.reads, ['px.blobs'], 'an implementation declares its reads as a named export');
  const { registry } = await loadRegistry({ root: join(fixtures, 'fgs') });
  const run = () => comparableForkJoin({ slot: SLOT, part: PART, implementations, restore: () => toyBoard(), guarantees: registry.guarantees, compare: compareFamilies });
  const result = run();
  assert.deepEqual(Object.keys(result.branches), ['byRow', 'bySize']);
  for (const name of ['byRow', 'bySize']) {
    const b = result.branches[name];
    assert.equal(b.error, null);
    assert.deepEqual(Object.keys(b.records), registry.order(), 'same guarantees, same order, every branch');
    assert.ok(b.frames.every((f) => f.branch === name));
  }
  assert.deepEqual(result.branches.bySize.records['fg.toy.family.materialize'].members, ['a', 'b', 'c']);
  assert.deepEqual(result.branches.byRow.records['fg.toy.family.materialize'].members, ['a', 'b']);
  const { comparison } = result;
  assert.equal(comparison.address, `cmp.${SLOT}`);
  assert.deepEqual(comparison.value.disagreements, ['c']);
  assert.deepEqual(comparison.value.candidates.find((c) => c.id === 'c'), { id: 'c', byRow: false, bySize: true });
  assert.equal(comparison.frames.length, 1);
  assert.equal(comparison.frames[0].fg, `cmp.${SLOT}`);
  // branch artifacts are kept apart by the scoped sink
  assert.notEqual(result.branches.byRow.records['fg.toy.blobs.materialize'].artifacts[0].uri, result.branches.bySize.records['fg.toy.blobs.materialize'].artifacts[0].uri);
  // deterministic end to end
  assert.equal(canonicalJson(run()), canonicalJson(result));
});

test('a branch that fails a guarantee is a comparison result, not a crash', () => {
  const implementations = {
    good: () => ({ rule: 'all', members: ['a', 'b', 'c', 'd'] }),
    phantom: () => ({ rule: 'phantom', members: ['a', 'ghost'] }),
    broken: () => { throw new Error('impl crashed'); },
    sneaky: (parts) => ({ rule: 'sneaky', members: parts.get('px.blobs').blobs.map((b) => b.id) }) // reads px.blobs without declaring it
  };
  return discoverGuarantees(join(fixtures, 'fgs')).then((guarantees) => {
    const result = comparableForkJoin({ slot: SLOT, part: PART, implementations, restore: () => toyBoard(), guarantees, compare: compareFamilies });
    assert.deepEqual(result.branches.phantom.error, { stage: 'guarantee', guarantee: 'fg.toy.family.materialize', message: 'fg.toy.family.materialize FunctionalGuarantee failed: failed: membersAreMaterializedBlobs' });
    assert.equal(result.branches.phantom.records['fg.toy.family.materialize'].status, 'failed');
    assert.equal(result.branches.broken.error.stage, 'apply');
    // an implementation reads only its declared Parts, exactly like an FG
    assert.deepEqual(result.branches.sneaky.error, { stage: 'apply', guarantee: null, message: `${SLOT} read 'px.blobs', which is not among its declared inParts` });
    assert.deepEqual(result.comparison.value.failedBranches, ['broken', 'phantom', 'sneaky']);
  });
});

test('flipbook renders one page per frame, over an embedded raster', async () => {
  const implementations = await discoverImplementations(join(fixtures, 'impl'), SLOT);
  const guarantees = await discoverGuarantees(join(fixtures, 'fgs'));
  const frames = forkJoinFrames(comparableForkJoin({ slot: SLOT, part: PART, implementations, restore: () => toyBoard(), guarantees, compare: compareFamilies }));
  assert.equal(frames.length, 2 * 3 + 1);
  const rgba = new Uint8Array(16 * 8 * 4).fill(200);
  const html = renderFlipbook(frames, { raster: { width: 16, height: 8, rgba }, title: 'toy findFamily fork' });
  assert.equal(html.match(/<section class="page"/g).length, frames.length);
  for (let i = 0; i < frames.length; i++) assert.ok(html.includes(`id="p${i}"`));
  assert.equal(html.match(/<canvas data-frame=/g).length, frames.filter((f) => f.parts.some((p) => ['pxset', 'bbox', 'points'].includes(p.kind))).length);
  assert.ok(html.includes('<table>'), 'ledger renders as a table');
  assert.ok(html.includes(Buffer.from(rgba).toString('base64')), 'raster embedded');
  assert.ok(!/<script[^>]+src=/.test(html), 'self-contained');
  assert.deepEqual(JSON.parse(framesJson(frames)), JSON.parse(canonicalJson(frames)));
  assert.equal(renderFlipbook([]).match(/<section class="page"/g), null);
});
