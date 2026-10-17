/**
 * Tests for convention discovery (fg/discover.mjs), ComparableForkJoin
 * (fg/forkjoin.mjs) and the static flipbook (fg/flipbook.mjs):
 *   1. discoverGuarantees picks up the fixture FG dir (including a nested
 *      lanes/ dir, skipping fixtures/), crossCheck against the fixture
 *      stage declarations reports declared-but-unimplemented and
 *      implemented-but-undeclared without throwing, and the real stages/
 *      declarations load and cross-check against fg/ (nothing ported yet).
 *   2. Two discovered fn.toy.findFamily implementations fork from the same
 *      restored board under the same FGs; the comparison lists the
 *      per-candidate disagreement (blob c) with its own frames; a branch
 *      failing a guarantee is a comparison result, not a crash.
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

/** The comparator: per candidate blob, each branch's membership; disagreements named. */
function compareFamilies({ branches, frame }) {
  const names = Object.keys(branches).sort();
  const held = names.filter((n) => !branches[n].error);
  const base = branches[held[0]].records['fg.toy.blobs.materialize'];
  const candidates = base.blobIds.map((id) => ({
    id, ...Object.fromEntries(names.map((n) => [n, branches[n].error ? null : branches[n].records['fg.toy.family.materialize'].members.includes(id)]))
  }));
  const disagreements = candidates.filter((c) => new Set(names.map((n) => c[n])).size > 1);
  const blobs = branches[held[0]].board.get('px.blobs');
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

test('real stages/*.json declarations load; scanning fg/ skips fixtures; S1 is fully ported', async () => {
  const { registry, report } = await loadRegistry({ root: here, stagesDir: join(here, '..', 'stages') });
  const s1 = ['fg.s1.badgeGlyphTemplate.materialize', 'fg.s1.pxBadges.assembly', 'fg.s1.pxBadges.materialize', 'fg.s1.pxDigits.materialize'];
  assert.deepEqual(registry.ids, s1, 'only the S1 FG files, no fixtures');
  assert.equal(report.implemented, 4);
  assert.deepEqual(report.implementedUndeclared, []);
  assert.deepEqual(report.mismatches, [], 'part, lane and prose-named requires agree with stages/s1.json');
  assert.ok(!report.declaredUnimplemented.some((id) => id.startsWith('fg.s1.')));
  assert.equal(report.declared, report.declaredUnimplemented.length + 4);
  // the assembly runs after the two records it gates against
  const order = registry.order();
  assert.ok(order.indexOf('fg.s1.pxBadges.assembly') > order.indexOf('fg.s1.pxBadges.materialize'));
  assert.ok(order.indexOf('fg.s1.pxBadges.assembly') > order.indexOf('fg.s1.pxDigits.materialize'));
  assert.equal(registry.guarantees.find((fg) => fg.id === 'fg.s1.pxBadges.assembly').lane, 's1-badge-assembly');
});

test('comparableForkJoin runs two discovered implementations under the same FGs and names the disagreement', async () => {
  const implementations = await discoverImplementations(join(fixtures, 'impl'), SLOT);
  assert.deepEqual(Object.keys(implementations), ['byRow', 'bySize']);
  const { registry } = await loadRegistry({ root: join(fixtures, 'fgs') });
  const run = () => comparableForkJoin({ slot: SLOT, implementations, restore: () => toyBoard(), guarantees: registry.guarantees, compare: compareFamilies });
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
    good: (board) => board.set('px.blobs.family', { rule: 'all', members: ['a', 'b', 'c', 'd'] }),
    phantom: (board) => board.set('px.blobs.family', { rule: 'phantom', members: ['a', 'ghost'] }),
    broken: () => { throw new Error('impl crashed'); }
  };
  return discoverGuarantees(join(fixtures, 'fgs')).then((guarantees) => {
    const result = comparableForkJoin({ slot: SLOT, implementations, restore: () => toyBoard(), guarantees, compare: compareFamilies });
    assert.deepEqual(result.branches.phantom.error, { stage: 'guarantee', guarantee: 'fg.toy.family.materialize', message: 'fg.toy.family.materialize FunctionalGuarantee failed: failed: membersAreMaterializedBlobs' });
    assert.equal(result.branches.phantom.records['fg.toy.family.materialize'].status, 'failed');
    assert.equal(result.branches.broken.error.stage, 'apply');
    assert.deepEqual(result.comparison.value.failedBranches, ['broken', 'phantom']);
  });
});

test('flipbook renders one page per frame, over an embedded raster', async () => {
  const implementations = await discoverImplementations(join(fixtures, 'impl'), SLOT);
  const guarantees = await discoverGuarantees(join(fixtures, 'fgs'));
  const frames = forkJoinFrames(comparableForkJoin({ slot: SLOT, implementations, restore: () => toyBoard(), guarantees, compare: compareFamilies }));
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
