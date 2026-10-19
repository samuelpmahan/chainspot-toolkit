/**
 * Sam's testimony, normalized to the canonical frame and keyed by HOLE NUMBER.
 * New schema (golden, lenard, townelake, heritage): holes[].number is the hole.
 * Old schema (alex): holes[].number is the annotation's order; testimony/alex/hole-numbers.json maps it to the hole.
 * `annotated` says which holes Sam labelled; a judgement is only ever made about those.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
/** annotation y -> canonical y = annotation y - dy (px), per testimony/<specimen>/README.md */
export const TESTIMONY_DY = Object.freeze({ golden: 4, lenard: 2, townelake: 1, heritage: 2, alex: 4 });

export function loadTestimony(specimen, root = ROOT) {
  const dir = join(root, 'testimony', specimen);
  if (!existsSync(dir)) return null;
  // a corrected annotation is a new file beside the original (never an edit); the latest correction is the testimony
  const files = readdirSync(dir).filter((f) => f.endsWith('.annotation.json')).sort();
  const file = files.filter((f) => f.includes('.corrected-')).at(-1) ?? files[0];
  if (!file) return null;
  const a = JSON.parse(readFileSync(join(dir, file), 'utf8')), dy = TESTIMONY_DY[specimen];
  const mapFile = join(dir, 'hole-numbers.json');
  const holeOf = existsSync(mapFile) ? new Map(JSON.parse(readFileSync(mapFile, 'utf8')).map.map((m) => [m.annotationNumber, m.holeNumber])) : null;
  const holes = new Map();
  for (const h of a.holes) {
    const n = holeOf ? holeOf.get(h.number) : h.number;
    if (n == null) throw new Error(`testimony ${specimen}: annotation number ${h.number} has no hole mapping`);
    const P = (p) => [p.xPx, p.yPx - dy];
    const bends = h.corridorBends ? h.corridorBends.map(P) : null;   // old schema has corridors, not bend points
    holes.set(n, { hole: n, tee: P(h.tee), basket: P(h.basket), bends, bent: bends ? bends.length > 0 : true });
  }
  // Old schema (alex) labels only the bent holes; new schema labels all 18.
  const complete = !holeOf && holes.size === 18;
  return { specimen, file: `testimony/${specimen}/${file}`, dy, holes, complete, annotated: [...holes.keys()].sort((x, y) => x - y) };
}
