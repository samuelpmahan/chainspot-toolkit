#!/usr/bin/env node
/**
 * Copies one clean badge sprite per label 1..18 from the DEV courses into
 * source/provider/artifacts/badge-coverage-sources/ (hole-NN.png + sources.json),
 * the sources the coverage templates are baked from
 * (source/provider/scripts/generate-badge-glyph-templates.mjs --coverage).
 *
 *   node scripts/badge-coverage-sources.mjs
 *
 * For each label, the first badge over the dev attempts (docs/evidence/dev-s1s4/ATTEMPTS, in order) whose
 * bbox is its label's sprite size (fg/s1 BADGE_SIZE_BY_LABEL; an off-size bbox is a frame merged with a
 * neighbour) is cropped at its bbox from the board's localImage. Dev courses only: validation is held out.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { encodePngRgba } from '../ports/capture/capture.mjs';
import { BADGE_SIZE_BY_LABEL } from '../fg/s1/fg.s1.badgeInvariants.observe.fg.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'source/provider/artifacts/badge-coverage-sources');
const DEV = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));

/** One clean sprite per label 1..18 from the dev courses not excluded: { label: { course, bboxPx, raster } }. */
export function devSprites({ exclude = [] } = {}) {
const chosen = {};
for (const [course, attempt] of DEV) {
  if (exclude.includes(course)) continue;
  const board = new Map(deserialize(readFileSync(join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin'))));
  const image = board.get('localImage'), { topPx } = board.get('viewport');
  for (const badge of board.get('badges')) {
    const label = Number(badge.label), [x, y, w, h] = badge.bbox, size = BADGE_SIZE_BY_LABEL[label];
    if (!size || chosen[label] || w !== size[0] || h !== size[1]) continue;
    const rgba = new Uint8Array(w * h * 4);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const o = ((y - topPx + yy) * image.width + x + xx) * 4, q = (yy * w + xx) * 4;
        rgba[q] = image.data[o]; rgba[q + 1] = image.data[o + 1]; rgba[q + 2] = image.data[o + 2]; rgba[q + 3] = 255;
      }
    chosen[label] = { course, bboxPx: [x, y, w, h], rgba, raster: { width: w, height: h, data: rgba } };
  }
}
const missing = Object.keys(BADGE_SIZE_BY_LABEL).filter((l) => !chosen[l]);
if (missing.length) throw new Error(`no clean dev badge for labels ${missing.join(', ')}`);
return chosen;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
const chosen = devSprites();
mkdirSync(OUT, { recursive: true });
const provenance = {};
for (const [label, c] of Object.entries(chosen)) {
  const name = `hole-${String(label).padStart(2, '0')}.png`;
  writeFileSync(join(OUT, name), encodePngRgba({ widthPx: c.bboxPx[2], heightPx: c.bboxPx[3], rgba: c.rgba }));
  provenance[name] = { course: c.course, bboxPx: c.bboxPx, unit: 'px of the course canonical raster (S1 badge bbox)' };
}
writeFileSync(join(OUT, 'sources.json'), JSON.stringify({ from: 'dev courses (docs/evidence/dev-s1s4/ATTEMPTS)', rule: 'first label-sized badge per label', files: provenance }, null, 2) + '\n');
console.log(`wrote ${Object.keys(provenance).length} dev badge crops to ${OUT}`);
}
