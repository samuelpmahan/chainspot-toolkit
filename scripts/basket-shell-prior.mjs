#!/usr/bin/env node
/**
 * The basket sprite's dark frame as a carried prior (Sam, 2026-10-21: "we need to learn and carry in the frame shape by
 * overlapping frames").
 *
 *   node scripts/basket-shell-prior.mjs [--write]
 *
 * Learn: every S2 basket family member on the dev courses (docs/evidence/dev-s1s4/ATTEMPTS, read from each attempt's S3
 * PxC board: px.baskets.family, px.components) is overlapped in sprite frame, registered on its bright body, by the store
 * query fn.q.sprite.overlap with S2's own arguments (fg/s2/shellShape.mjs), pooled over the courses: the px at least 75 %
 * of members share, and of those the agreeing component that encloses the body. Carry in: the sprite is screen-fixed, so
 * that shape is written as the vendored asset assets/basket-shell.json (src and dist), which S2 uses when a course's own
 * members share no enclosing frame. Each dev course's own learned shape is recorded beside the pooled one and must agree.
 * Dev courses only: validation is held out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { createPartStore, registerQueries } from '../fg/store.mjs';
import { registerSpriteQueries, poolOverlaps } from '../fg/queries/sprite.mjs';
import { SHELL_QUERY, SHELL_LEVEL, shellOverlapArgs, frameOf } from '../fg/s2/shellShape.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { extractComponents } = require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor/components.js'));
const DEV = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));
const ASSET = 'detectors/threeFactor/assets/basket-shell.json';

const overlaps = [], courses = [];
let size = null;
for (const [course, attempt] of DEV) {
  // the course's S3 PxC board is the store's base; the overlap is asked of the store (fn.q.sprite.overlap)
  const board = new Map(deserialize(readFileSync(join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin'))));
  const store = createPartStore({ base: { has: (a) => board.has(a), get: (a) => board.get(a) }, name: course });
  registerSpriteQueries(store, registerQueries);
  const family = store.get('px.baskets.family'), [w, h] = family.templateSize; size ??= [w, h];
  if (w !== size[0] || h !== size[1]) throw new Error(`${course}: basket template ${w}x${h} differs from ${size.join('x')}`);
  const overlap = store.call(SHELL_QUERY, shellOverlapArgs(family)).value, own = frameOf(overlap, w, h, extractComponents);
  courses.push({ course, members: overlap.memberCount, margins: own ? [...own.margins] : null, shellPx: own ? own.offsets.length : null });
  overlaps.push(overlap);
}
const SHELL_AGREEMENT_MIN = SHELL_LEVEL;
const [w, h] = size;
const pooled = frameOf(poolOverlaps(overlaps), w, h, extractComponents);
const entries = { length: overlaps.reduce((s, o) => s + o.memberCount, 0) };
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
