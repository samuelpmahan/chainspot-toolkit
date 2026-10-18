// Architecture ratchet (Sam, 2026-10-18: "I have to re-explain this every conversation when it's just a better way to
// work"). The PxC boundary rules, encoded so they fail instead of being remembered:
//   1. code outside the boundary does not read artifact files for Parts the PxC holds (read Parts by address);
//   2. code outside the boundary does not loop over raster pixel indices (ask the store: fn.q.pxset.*, fn.q.pose.*).
// The detectors are tripwires (regexes), not proofs. architecture.ratchet.json holds today's counts per file: a count
// may only go DOWN. A new file, or a higher count, fails; a lower count fails too until the ratchet is lowered, so the
// debt visibly shrinks. The boundary itself (where the math lives) is exempt.
// After paying debt: UPDATE_RATCHET=1 node --test architecture.test.mjs rewrites the ratchet (the diff is the review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = import.meta.dirname;
export const BOUNDARY = Object.freeze(['fg/pxset.mjs', 'fg/render.mjs', 'fg/store.mjs', 'fg/profile.mjs', 'ports/s4recover/teeRecover.mjs', 'ports/s4recover/poseSpace.mjs']);
export const DETECTORS = Object.freeze({
  artifactReads: /early[/'", ]+artifacts|'artifacts',\s*'s\d|s3fix['/]|readJson\(join\(A|readFileSync\(join\(A/g,
  pixelLoops: /\b(?:i|p|idx|k)\s*%\s*(?:W|w|width|widthPx|ctx\.W|W_)\b|\(\s*(?:i|p|idx)\s*\/\s*(?:W|width|widthPx|ctx\.W)\s*\)\s*\|\s*0|Math\.floor\(\s*(?:i|p|idx)\s*\/\s*(?:W|width|widthPx|ctx\.W)\s*\)/g
});
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => { const p = join(d, f); return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]; });
export function measure() {
  const files = ['ports', 'fg', 'impl'].flatMap(walk).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !f.includes('/fixtures/') && !BOUNDARY.includes(f));
  const out = {};
  for (const f of files.sort()) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    const counts = Object.fromEntries(Object.entries(DETECTORS).map(([k, re]) => [k, (s.match(re) ?? []).length]).filter(([, n]) => n));
    if (Object.keys(counts).length) out[f] = counts;
  }
  return out;
}

test('the PxC boundary only gains ground: artifact reads and pixel loops outside it never grow', () => {
  if (process.env.UPDATE_RATCHET) writeFileSync(join(ROOT, 'architecture.ratchet.json'), JSON.stringify({ rule: 'counts per file may only go down (architecture.test.mjs)', files: measure() }, null, 1) + '\n');
  const ratchet = JSON.parse(readFileSync(join(ROOT, 'architecture.ratchet.json'), 'utf8')).files, now = measure(), errors = [];
  for (const [f, counts] of Object.entries(now)) for (const [k, n] of Object.entries(counts)) {
    const was = ratchet[f]?.[k] ?? 0;
    if (n > was) errors.push(`${f}: ${k} ${was} -> ${n}. Read Parts by address / ask the store (DOCTRINE.md "How we work"), or move the math behind the boundary`);
  }
  for (const [f, counts] of Object.entries(ratchet)) for (const [k, was] of Object.entries(counts)) {
    const n = now[f]?.[k] ?? 0;
    if (n < was) errors.push(`${f}: ${k} ${was} -> ${n}: debt paid. Lower architecture.ratchet.json to ${n} so it cannot come back`);
  }
  assert.deepEqual(errors, []);
});
