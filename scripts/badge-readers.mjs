#!/usr/bin/env node
/**
 * Binary vs coverage whole-glyph badge readers, badge by badge, on attempt boards (the PxC snapshot's
 * localImage, viewport and badges). Neither reader changes a run; this measures them side by side.
 *
 *   node scripts/badge-readers.mjs [--dev] [name=ATTEMPT[:labels.json] ...] [--json out.json]
 *
 * --dev reads every course of docs/evidence/dev-s1s4/ATTEMPTS. The reference label of a badge is the S1
 * per-digit read on that board, or the {detId: label} map given after the attempt (e.g. the 1..27 reads of
 * a validation course on a board from an older run with the same badge detections).
 * Per reader: read, abstained, wrong (a read that differs from the reference), and the top-vs-runner-up
 * margin (median, minimum) over every badge: Dice difference for binary, NCC difference for coverage.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const dist = (p) => require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor', p));
const { classifyBadgeAgainstTemplates } = dist('features/g1.badgeGlyphTemplate.js');
const { classifyBadgeCoverage } = dist('features/g1.badgeCoverageTemplate.js');

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
  const badges = board.get('badges').map((b) => {
    const reference = run.labels ? run.labels[b.detId] ?? null : b.label;
    const bin = classifyBadgeAgainstTemplates(bitmap, b, topPx);
    const cov = classifyBadgeCoverage(bitmap, b, topPx);
    return {
      detId: b.detId, reference, bboxPx: b.bbox,
      binary: { label: bin.templateLabel, best: bin.templateBestLabel, score: r3(bin.templateScore), margin: r3(bin.templateMargin), abstention: bin.templateAbstention },
      coverage: { label: cov.label != null ? String(cov.label) : null, best: cov.bestLabel != null ? String(cov.bestLabel) : null, runnerUp: cov.runnerUpLabel ?? null, score: r3(cov.bestScore), margin: r3(cov.ambiguityMargin), abstention: cov.abstention }
    };
  });
  const summary = (k) => ({
    read: badges.filter((b) => b[k].label != null).length,
    abstained: badges.filter((b) => b[k].label == null).length,
    wrong: badges.filter((b) => b[k].label != null && b.reference != null && b[k].label !== String(b.reference)).length,
    medianMargin: median(badges.map((b) => b[k].margin)), minMargin: Math.min(...badges.map((b) => b[k].margin))
  });
  const row = { course: run.name, attempt: run.attempt, badges: badges.length, binary: summary('binary'), coverage: summary('coverage'),
    binaryReadsCoverageMissed: badges.filter((b) => b.binary.label != null && b.coverage.label !== b.binary.label).map((b) => b.detId), perBadge: badges };
  rows.push(row);
  const f = (s) => `${String(s.read).padStart(2)} read ${String(s.abstained).padStart(2)} abst ${s.wrong} wrong  margin med ${s.medianMargin.toFixed(3)} min ${s.minMargin.toFixed(3)}`;
  console.log(`${run.name.padEnd(20)} ${String(badges.length).padStart(2)} badges | binary ${f(row.binary)} | coverage ${f(row.coverage)}${row.binaryReadsCoverageMissed.length ? ` | coverage misses binary reads ${row.binaryReadsCoverageMissed.join(',')}` : ''}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ unit: { margin: 'binary: Dice difference; coverage: NCC difference (best - runner-up)', counts: 'badges' }, rows }, null, 1));
