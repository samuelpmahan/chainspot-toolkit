#!/usr/bin/env node
/**
 * The four badge readers side by side, badge by badge, on attempt boards (the PxC snapshot's localImage,
 * viewport and badges): the binary whole-number reader (baseline), the black-and-white digit reader, the
 * coverage whole-number reader, and S1's per-digit segmentation reader (measure.ts, the one that sets
 * labels; its read is taken from the board). Only the last one changes a run.
 *
 *   node scripts/badge-readers.mjs [--dev] [name=ATTEMPT[:labels.json] ...] [--json out.json]
 *
 * --dev reads every course of docs/evidence/dev-s1s4/ATTEMPTS. The reference label of a badge is the S1
 * per-digit read on that board, or the {detId: label} map given after the attempt (e.g. the 1..27 reads of
 * a validation course on a board from an older run with the same badge detections).
 * Per reader: read, abstained, wrong (a read that differs from the reference), and the top-vs-runner-up
 * margin (median, minimum) over every badge: binary Dice difference; digitBW min(layout, digit) Dice difference;
 * coverage NCC difference; perDigit the gap between its top two label posteriors.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from '../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const dist = (p) => require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor', p));
const { classifyBadgeAgainstTemplates } = dist('features/g1.badgeGlyphTemplate.js');
const { classifyBadgeCoverage } = dist('features/g1.badgeCoverageTemplate.js');
const { classifyBadgeDigits } = dist('features/g1.badgeDigitTemplate.js');
const READERS = ['binary', 'digitBW', 'coverage', 'perDigit'];

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const runs = [];
if (args.includes('--dev'))
  for (const line of readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n')) {
    const [name, attempt] = line.split(' ');
    runs.push({ name, attempt, labels: null });
  }
for (const a of args.filter((x, i) => x.includes('=') && args[i - 1] !== '--json')) {
  const [name, rest] = a.split('='), [attempt, labels] = rest.split(':');
  runs.push({ name, attempt, labels: labels ? JSON.parse(readFileSync(labels, 'utf8')) : null });
}

const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const rows = [];
for (const run of runs) {
  const board = new Map(deserialize(readFileSync(join(ROOT, 'attempts/stages', run.attempt, 'fork/stage-output/early/s3.pxc.bin'))));
  const image = board.get('localImage'), { topPx } = board.get('viewport');
  const bitmap = { width: image.width, height: image.height, data: image.data };
  const all = board.get('badges'), n = all.length;
  const badges = all.map((b) => {
    const reference = run.labels ? run.labels[b.detId] ?? null : b.label;
    const bin = classifyBadgeAgainstTemplates(bitmap, b, topPx);
    const cov = classifyBadgeCoverage(bitmap, b, topPx);
    const dig = classifyBadgeDigits(bitmap, b, topPx, n);
    const cands = b.labelCandidates ?? [];
    return {
      detId: b.detId, reference, bboxPx: b.bbox,
      binary: { label: bin.templateLabel, best: bin.templateBestLabel, score: r3(bin.templateScore), margin: r3(bin.templateMargin), abstention: bin.templateAbstention },
      coverage: { label: cov.label != null ? String(cov.label) : null, best: cov.bestLabel != null ? String(cov.bestLabel) : null, runnerUp: cov.runnerUpLabel ?? null, score: r3(cov.bestScore), margin: r3(cov.ambiguityMargin), abstention: cov.abstention },
      digitBW: { label: dig.label, best: dig.number, layout: dig.layout, score: r3(Math.min(...dig.digits.map((d) => d.score), 1)), margin: r3(dig.margin), layoutMargin: r3(dig.layoutMargin), digitMargin: r3(dig.digitMargin), abstention: dig.abstention, gapColumns: dig.gapColumns },
      perDigit: { label: b.label ?? null, best: b.bestLabel ?? null, margin: r3(cands.length > 1 ? cands[0].confidence - cands[1].confidence : cands.length ? cands[0].confidence : 0), abstention: b.abstentionReason ?? null }
    };
  });
  const summary = (k) => ({
    read: badges.filter((b) => b[k].label != null).length,
    abstained: badges.filter((b) => b[k].label == null).length,
    wrong: badges.filter((b) => b[k].label != null && b.reference != null && b[k].label !== String(b.reference)).length,
    medianMargin: median(badges.map((b) => b[k].margin)), minMargin: Math.min(...badges.map((b) => b[k].margin))
  });
  const row = { course: run.name, attempt: run.attempt, badges: badges.length, ...Object.fromEntries(READERS.map((k) => [k, summary(k)])),
    digitVsCoverage: badges.filter((b) => b.digitBW.label !== b.coverage.label).map((b) => ({ detId: b.detId, reference: b.reference, digitBW: b.digitBW.label ?? `-${b.digitBW.abstention}:${b.digitBW.best}`, coverage: b.coverage.label ?? `-${b.coverage.abstention}:${b.coverage.best}` })), perBadge: badges };
  rows.push(row);
  const f = (s) => `${s.read}/${s.abstained}/${s.wrong} ${s.medianMargin.toFixed(3)}/${s.minMargin.toFixed(3)}`;
  console.log(`${run.name.padEnd(19)} ${String(badges.length).padStart(2)} | ${READERS.map((k) => `${k} ${f(row[k])}`).join(' | ')}${row.digitVsCoverage.length ? ` | digitBW vs coverage: ${row.digitVsCoverage.map((d) => `${d.reference}:${d.digitBW}/${d.coverage}`).join(' ')}` : ''}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ unit: { margin: 'binary: Dice difference; digitBW: min(layout, digit) Dice difference; coverage: NCC difference; perDigit: posterior difference (best - runner-up)', counts: 'badges (read/abstained/wrong)' }, rows }, null, 1));
