import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeBadges, BADGE_SIZE_BY_LABEL } from './fg.s1.badgeInvariants.observe.fg.mjs';

const badge = (label, x, y, { merged = false } = {}) => {
  const [w, h] = merged ? [56, 44] : BADGE_SIZE_BY_LABEL[label];
  const parts = [{ polarity: 'dark', bbox: [x + (w - 48) / 2, y + (h - 36) / 2, 48, 36] }, { polarity: 'bright', bbox: merged ? [x + 20, y + 10, 7, 21] : [x, y, w, h] }];
  return { label, bbox: [x, y, w, h], confidence: 0.99, has: { findPx: { parts } } };
};

test('a clean full view holds the robust base', () => {
  const o = observeBadges(Array.from({ length: 18 }, (_, i) => badge(String(i + 1), 10 + 70 * i, 20)));
  assert.equal(o.findings.view, 'full (18 badges)');
  assert.equal(o.findings.allLabelsPresent, true);
  assert.equal(o.findings.sizeExplainedByMerge, true);
  assert.deepEqual(o.findings.mergedWithNeighbour, []);
});

test('a merged frame is off-size and explained; a duplicate label and a missing label are findings', () => {
  const bs = Array.from({ length: 18 }, (_, i) => badge(String(i + 1), 10 + 70 * i, 20, { merged: i === 4 }));
  bs[17] = badge('1', 1300, 20);
  const o = observeBadges(bs);
  assert.deepEqual(o.findings.mergedWithNeighbour, ['5']);
  assert.equal(o.findings.sizeExplainedByMerge, true);
  assert.deepEqual(o.findings.duplicates, ['1']);
  assert.deepEqual(o.findings.missing, ['18']);
});

test('a partial view only requires unique in-range labels', () => {
  const o = observeBadges([badge('13', 0, 0), badge('14', 80, 0)]);
  assert.equal(o.findings.view, 'partial (2 badges)');
  assert.equal(o.findings.allLabelsPresent, null);
  assert.equal(o.findings.labelsUnique, true);
});

test('a full view of more than 18 holes is full; a label beyond its badge count is missing its own', () => {
  const size = (label) => BADGE_SIZE_BY_LABEL[label] ?? [56, 42];
  const at = (label, x) => { const [w, h] = size(label); return { label, bbox: [x, 20, w, h], confidence: 0.99, has: { findPx: { parts: [{ polarity: 'dark', bbox: [x + (w - 48) / 2, 20 + (h - 36) / 2, 48, 36] }, { polarity: 'bright', bbox: [x, 20, w, h] }] } } }; };
  const o = observeBadges(Array.from({ length: 27 }, (_, i) => at(String(i + 1), 10 + 70 * i)));
  assert.equal(o.findings.view, 'full (27 badges)');
  assert.equal(o.findings.labelsInRange, true);
  assert.equal(o.findings.allLabelsPresent, true);
  const p = observeBadges([at('24', 0), at('14', 80)]);
  assert.equal(p.findings.view, 'partial (2 badges)');
});
