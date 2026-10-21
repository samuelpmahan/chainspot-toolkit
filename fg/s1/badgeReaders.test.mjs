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

test('the digit reader: templates for every digit 0-9, and a two-digit read above the badge count is reported, not bent', () => {
  const { BADGE_DIGIT_TEMPLATES } = dist('features/g1.badgeDigitTemplate.js');
  assert.deepEqual([...new Set(BADGE_DIGIT_TEMPLATES.map((t) => t.digit))].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const { classifyBadgeDigitsAgainstTemplates } = dist('digits/badgeDigitTemplateMath.js');
  // a synthetic plate carrying the "1" and "4" templates side by side, read with N = 12 badges
  const t1 = BADGE_DIGIT_TEMPLATES.find((t) => t.from === '14 left').mask, t4 = BADGE_DIGIT_TEMPLATES.find((t) => t.from === '14 right').mask;
  const W = 80, H = 60, data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 30; data[i * 4 + 3] = 255; }
  const paint = (m, ox) => { for (let y = 0; y < m.heightPx; y++) for (let x = 0; x < m.widthPx; x++) if (m.data[y * m.widthPx + x]) for (let dy = 0; dy < 1.5; dy++) { const o = ((18 + y) * W + ox + x) * 4; data[o] = data[o + 1] = data[o + 2] = 250; } };
  paint(t1, 22); paint(t4, 40);
  const read = classifyBadgeDigitsAgainstTemplates({ width: W, height: H, data }, { xPx: W / 2, yPx: H / 2, widthPx: W, heightPx: H }, BADGE_DIGIT_TEMPLATES, 12);
  assert.equal(read.number, '14');
  assert.equal(read.label, null);
  assert.equal(read.abstention, 'above-badge-count');
});
