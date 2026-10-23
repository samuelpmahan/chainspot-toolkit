import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutTime } from './instrument.mjs';

// 2026-10-23: run.receipt.json is hashed evidence, and it carried stage durations and the provider's Tick times
test('withoutTime: a receipt loses every clock field, the times come back as sidecar timings with their paths', () => {
  const receipt = { stages: [{ id: 'S0', durationMs: 12, pcr: { ticks: [{ testimony: { opId: 'a', startedAtMs: 3.5, durationMs: 1.25, writes: [] } }] } }], counts: { badges: 18 } };
  const { record, timings } = withoutTime(receipt);
  assert.equal(JSON.stringify(record).includes('Ms"'), false);
  assert.deepEqual(record, { stages: [{ id: 'S0', pcr: { ticks: [{ testimony: { opId: 'a', writes: [] } }] } }], counts: { badges: 18 } });
  assert.deepEqual(timings, [{ path: '$.stages[0].pcr.ticks[0].testimony', startedAtMs: 3.5, durationMs: 1.25 }, { path: '$.stages[0]', durationMs: 12 }]);
  assert.deepEqual(withoutTime(withoutTime(receipt).record).record, record, 'stripping twice changes nothing');
});
