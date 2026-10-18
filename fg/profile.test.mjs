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
