import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { earlyConditionOf } from './condition.mjs';

test('an early run that ended in a data condition is read back with the stages it did not run; a clean run has none', () => {
  const root = mkdtempSync(join(tmpdir(), 'early-condition-'));
  try {
    const at = (id) => join(root, 'attempts', 'stages', id, 'fork', 'stage-output', 'early');
    mkdirSync(at('a1'), { recursive: true }); mkdirSync(at('a2'), { recursive: true });
    writeFileSync(join(at('a1'), 'run.receipt.json'), JSON.stringify({ condition: { stage: 'S2', result: 'no baskets', detail: 'no shell family' }, counts: { badges: 21, baskets: 0 }, notRun: ['S3', 'S4', 'S5', 'S6', 'S7'] }));
    writeFileSync(join(at('a2'), 'run.receipt.json'), JSON.stringify({ stages: [] }));
    const c = earlyConditionOf(root, 'a1');
    assert.deepEqual([c.stage, c.result, c.notRun[0], c.counts.baskets], ['S2', 'no baskets', 'S3', 0]);
    assert.equal(earlyConditionOf(root, 'a2'), null);
    assert.equal(earlyConditionOf(root, 'missing'), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
