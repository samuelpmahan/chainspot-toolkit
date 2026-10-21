import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const require = createRequire(import.meta.url);
const dist = (p) => require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor', p));

test('one hole-label vocabulary, 1..27, carried by both template readers', () => {
  const { HOLE_LABELS } = dist('digits/holeLabels.js');
  assert.deepEqual(HOLE_LABELS, Array.from({ length: 27 }, (_, i) => i + 1));
  assert.deepEqual(dist('features/g1.badgeGlyphTemplate.js').BADGE_GLYPH_TEMPLATES.map((t) => t.label), HOLE_LABELS);
  assert.deepEqual(dist('features/g1.badgeCoverageTemplate.js').BADGE_COVERAGE_TEMPLATES.map((t) => t.label), HOLE_LABELS);
});

test('every template classifies as itself (binary and coverage)', () => {
  const B = dist('digits/badgeGlyphTemplateMath.js'), C = dist('digits/badgeCoverageTemplateMath.js');
  const binary = dist('features/g1.badgeGlyphTemplate.js').BADGE_GLYPH_TEMPLATES;
  for (const t of binary) assert.equal(B.classifyNormalizedGlyph(t.mask, binary).bestLabel, t.label);
  const coverage = dist('features/g1.badgeCoverageTemplate.js').BADGE_COVERAGE_TEMPLATES;
  for (const t of coverage) {
    const v = C.classifyNormalizedCoverage(t.coverage, coverage);
    assert.equal(v.label, t.label, `coverage template ${t.label}: ${v.abstention}`);
  }
});

test('the per-digit reader abstains on a well-formed read outside the vocabulary instead of projecting it', () => {
  const { classifyReading } = dist('measure.js');
  const candidates = [{ label: 14, confidence: 0.9 }, { label: 24, confidence: 0.1 }];
  assert.equal(classifyReading('24', 2, 0.99, candidates, 0.1, 0.045).label, '14');   // in vocabulary: unchanged
  const out = classifyReading('34', 2, 0.99, candidates, 0.1, 0.045);
  assert.equal(out.label, null);
  assert.equal(out.abstentionReason, 'out-of-vocabulary');
});
