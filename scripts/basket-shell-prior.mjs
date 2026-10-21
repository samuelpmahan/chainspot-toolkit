#!/usr/bin/env node
/**
 * The basket sprite's dark frame as a carried prior (Sam, 2026-10-21: "we need to learn and carry in the frame shape by
 * overlapping frames").
 *
 *   node scripts/basket-shell-prior.mjs [--write]
 *
 * Learn: every S2 basket family member on the dev courses (docs/evidence/dev-s1s4/ATTEMPTS, read from each attempt's S3
 * PxC board: px.baskets.family, px.components) is overlapped in sprite frame, registered on its bright body, with the
 * provider's own overlapShellFrames / shellShapeOf (source/provider .../stages/S2/clean/Basket.ts): the px at least 75 %
 * of members share, and of those the agreeing component that encloses the body. Carry in: the sprite is screen-fixed, so
 * that shape is written as the vendored asset assets/basket-shell.json (src and dist), which S2 uses when a course's own
 * members share no enclosing frame. Each dev course's own learned shape is recorded beside the pooled one and must agree.
 * Dev courses only: validation is held out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { overlapShellFrames, shellShapeOf, shellWindow, SHELL_AGREEMENT_MIN } = require(join(ROOT, 'source/provider/packages/alg/dist/stages/S2/clean/Basket.js'));
const DEV = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));
const ASSET = 'detectors/threeFactor/assets/basket-shell.json';

const entries = [], courses = [];
let size = null;
for (const [course, attempt] of DEV) {
  const board = new Map(deserialize(readFileSync(join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin'))));
  const family = board.get('px.baskets.family'), dark = board.get('px.components').dark.mask;
  const [w, h] = family.templateSize; size ??= [w, h];
  if (w !== size[0] || h !== size[1]) throw new Error(`${course}: basket template ${w}x${h} differs from ${size.join('x')}`);
  const mine = family.members.map(({ body }) => ({ body, dark }));
  const own = shellShapeOf(overlapShellFrames(mine, shellWindow(w, h)), w, h);
  courses.push({ course, attempt, members: mine.length, margins: own ? [...own.margins] : null, shellPx: own ? own.offsets.length : null });
  entries.push(...mine);
}
const [w, h] = size;
const pooled = shellShapeOf(overlapShellFrames(entries, shellWindow(w, h)), w, h);
if (!pooled) throw new Error('the dev members share no frame that encloses the body');
const [left, top, right, bottom] = pooled.margins, width = w + left + right, height = h + top + bottom;
const on = new Set(pooled.offsets);
const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (on.has(y * width + x) ? '1' : '0')).join(''));
const prior = {
  schema: 'chainspot-basket-shell-prior@1', width, height, margins: [...pooled.margins], rows,
  provenance: {
    members: entries.length, agreementMin: SHELL_AGREEMENT_MIN, shellPx: pooled.offsets.length, bodyPx: [w, h],
    rule: "dev-course S2 basket family members' dark frames (V <= 45) overlapped in sprite frame, registered on the bright body; px shared by >= agreementMin of members; the agreeing 8-connected component enclosing the body",
    generatedBy: 'scripts/basket-shell-prior.mjs (chainspot-toolkit)', courses
  }
};
console.log(JSON.stringify({ margins: prior.margins, size: [width, height], shellPx: pooled.offsets.length, members: entries.length, courses }, null, 1));
const disagree = courses.filter((c) => JSON.stringify(c.margins) !== JSON.stringify(prior.margins));
if (disagree.length) console.log('courses whose own learned margins differ from the pooled prior:', disagree.map((c) => c.course).join(', '));
if (process.argv.includes('--write'))
  for (const tree of ['src', 'dist']) writeFileSync(join(ROOT, 'source/provider/packages/alg', tree, ASSET), JSON.stringify(prior, null, 1) + '\n');
