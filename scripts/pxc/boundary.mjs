// The PxC boundary measure, shared by architecture.test.mjs (advisory) and scripts/pxc.mjs doctor (guidance).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const BOUNDARY = Object.freeze(['fg/pxset.mjs', 'fg/render.mjs', 'fg/store.mjs', 'fg/profile.mjs', 'ports/s4recover/teeRecover.mjs', 'ports/s4recover/poseSpace.mjs']);
export const DETECTORS = Object.freeze({
  artifactReads: /early[/'", ]+artifacts|'artifacts',\s*'s\d|s3fix['/]|readJson\(join\(A|readFileSync\(join\(A/g,
  pixelLoops: /\b(?:i|p|idx|k)\s*%\s*(?:W|w|width|widthPx|ctx\.W|W_)\b|\(\s*(?:i|p|idx)\s*\/\s*(?:W|width|widthPx|ctx\.W)\s*\)\s*\|\s*0|Math\.floor\(\s*(?:i|p|idx)\s*\/\s*(?:W|width|widthPx|ctx\.W)\s*\)/g
});
export const FIX = Object.freeze({
  artifactReads: 'read the Part by address (store.get); put the runner store on the PxC board (ports/s4recover/run.mjs loadAttemptParts). `node scripts/pxc.mjs explain parts`',
  pixelLoops: 'ask the store (fn.q.pxset.*, fn.q.pose.*, fn.q.part.render) or add the math as a query behind the boundary: `node scripts/pxc.mjs scaffold query <family>`'
});
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => { const p = join(d, f); return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]; });
export function measureFile(f) {
  const s = readFileSync(join(ROOT, f), 'utf8'), out = {};
  for (const [k, re] of Object.entries(DETECTORS)) {
    const lines = []; s.split('\n').forEach((line, i) => { if (line.match(new RegExp(re.source))) lines.push(i + 1); });
    if (lines.length) out[k] = { count: (s.match(re) ?? []).length, lines };
  }
  return out;
}
export function measure() {
  const files = ['ports', 'fg', 'impl'].flatMap(walk).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !f.includes('/fixtures/') && !BOUNDARY.includes(f));
  const out = {};
  for (const f of files.sort()) { const m = measureFile(f); if (Object.keys(m).length) out[f] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.count])); }
  return out;
}
