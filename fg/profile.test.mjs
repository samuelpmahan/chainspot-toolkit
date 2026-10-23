import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentedStore, profileSummary, profileFrame } from './profile.mjs';

test('instrumentedStore + profileSummary: every call profiled, self time excludes nested calls, emits summed', () => {
  const { store, document } = instrumentedStore({ name: 'p' });
  store.register('fn.p.inner', { calculate: (io) => ({ v: io.args.k, emits: { poses: io.args.k } }) });
  store.register('fn.p.outer', { calls: ['fn.p.inner'], calculate: (io) => { io.call('fn.p.inner', { k: 2 }); io.call('fn.p.inner', { k: 3 }); return { emits: { rounds: 1 } }; } });
  store.call('fn.p.outer', {});
  const s = profileSummary(document());
  const inner = s.find((r) => r.calculation === 'fn.p.inner'), outer = s.find((r) => r.calculation === 'fn.p.outer');
  assert.equal(inner.calls, 2); assert.deepEqual(inner.emits, { poses: 5 }); assert.deepEqual(outer.emits, { rounds: 1 });
  assert.ok(outer.selfMs <= outer.totalMs);
  assert.equal(profileFrame(s).parts[0].data.rows.length, 2);
});

test('profiled is plug and play: any composed FG records its own call subtree (counts + emits, no timings)', async () => {
  const { guarantee, pipe, calc, sequence } = await import('./compose.mjs');
  const { profiled, framed } = await import('./mixins.mjs');
  const { runGuarantee } = await import('./guarantee.mjs'); const { createMemorySink } = await import('./sinks.mjs');
  const { store } = instrumentedStore({ name: 'fgp' });
  store.register('fn.p.work', { calculate: (io) => ({ ok: true, emits: { px: 10 } }) });
  const fg = guarantee({ id: 'fg.test.profiled', guards: ['t'] },
    pipe(sequence(calc('fn.p.work'), calc('fn.p.work', { as: 'again' })), framed(() => [{ title: 't', parts: [{ address: 't', kind: 'scalar', data: { v: 1 } }] }]), profiled));
  const { record } = runGuarantee(fg, { store, sink: createMemorySink() });
  assert.deepEqual(record.profile, [{ calculation: 'fn.p.work', calls: 2, emits: { px: 20 }, threw: 0 }]);
  assert.ok(!JSON.stringify(record.profile).includes('Ms'), 'no timings in the hashed record');
});

test('opaque hot spots: a leaf call with a large share of the run is flagged; one that itemises its work through store calls is not', async () => {
  const { opaqueHotSpots, hotSpotLines } = await import('./profile.mjs');
  const doc = { wallMs: 10000, calculations: [
    { seq: 1, parent: null, calculation: 'fn.q.opaque', elapsedMs: 6000 },        // 60 % of the run, no nested calls
    { seq: 2, parent: null, calculation: 'fn.q.itemised', elapsedMs: 3000 },      // its time is below it
    { seq: 3, parent: 2, calculation: 'fn.q.step', elapsedMs: 290 },              // a step: under the share
    { seq: 5, parent: 2, calculation: 'fn.q.step', elapsedMs: 2650 },             // itemised: fn.q.itemised keeps 60 ms of its own
    { seq: 4, parent: null, calculation: 'fn.q.small', elapsedMs: 200 }] };       // under minMs
  const spots = opaqueHotSpots(doc);
  assert.deepEqual(spots.map((s) => s.calculation), ['fn.q.opaque', 'fn.q.step']);   // fn.q.step: 2 calls, 29 % of the run together
  assert.ok(!spots.some((s) => s.calculation === 'fn.q.itemised'), 'its time is under its store calls');
  const half = opaqueHotSpots({ ...doc, calculations: [...doc.calculations, { seq: 6, parent: null, calculation: 'fn.q.partly', elapsedMs: 2000 }, { seq: 7, parent: 6, calculation: 'fn.q.x', elapsedMs: 100 }] });
  assert.ok(half.some((h) => h.calculation === 'fn.q.partly'), 'a call that makes SOME store calls but keeps 1.9 s of its own is flagged');
  assert.equal(spots[0].shareOfRun, 0.6);
  assert.match(hotSpotLines(spots)[0], /OPAQUE HOT SPOT fn\.q\.opaque/);
  const s = profileSummary(doc);
  assert.deepEqual(s.hotSpots.map((h) => h.calculation), ['fn.q.opaque', 'fn.q.step']);
  assert.ok(profileFrame(s).verdicts.some((v) => /opaque hot spot: fn\.q\.opaque/.test(v.name) && v.ok === false));
});

test('profileLines: wall, the time inside and outside store calls, self time first, then the hot spots', async () => {
  const { profileLines } = await import('./profile.mjs');
  const doc = { wallMs: 10000, processMs: 12500, calculations: [
    { seq: 1, parent: null, calculation: 'fn.q.big', elapsedMs: 6000, emits: { routes: 40 } },
    { seq: 2, parent: null, calculation: 'fn.q.small', elapsedMs: 1000 }] };
  const lines = profileLines(doc, { top: 2, title: 's7trace' });
  assert.match(lines[0], /^s7trace: wall 10\.0 s, inside store calls 7\.0 s, outside 3\.0 s \(30%: not itemised\); process 12\.5 s/);
  assert.match(lines[1], /6000 ms self .* 1x fn\.q\.big {2}\(routes 40\)/);
  assert.match(lines[2], /fn\.q\.small/);
  assert.match(lines[3], /OPAQUE HOT SPOT fn\.q\.big/);
});

// 2026-10-23 (claude-ed's review of the remainder): the time outside store calls is kept signed; a negative one is a
// conservation violation printed loudly, never clamped to zero.
test('profileLines: the outside remainder is signed, a negative one is a conservation violation', async () => {
  const { profileLines } = await import('./profile.mjs');
  const call = (ms) => ({ seq: 1, parent: null, depth: 0, calculation: 'fn.x', elapsedMs: ms, status: 'ok', emits: null });
  assert.match(profileLines({ wallMs: 1000, calculations: [call(600)] })[0], /outside 0\.4 s \(40%: not itemised\)/);
  assert.match(profileLines({ wallMs: 1000, calculations: [call(1500)] })[0], /outside -0\.5 s: CONSERVATION VIOLATED/);
});
