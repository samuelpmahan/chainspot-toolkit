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

/**
 * Old schema (alex): the corridor's two edge polylines, each ORIENTED BY GEOMETRY tee -> basket (an edge whose first point
 * lies nearer the basket than the tee is reversed; the file stores them both ways: AlexClark #1's right edge runs basket
 * -> tee, #2's and #3's tee -> basket). Paired point by point they give the centreline (tee -> midpoints -> basket) and the
 * corridor width at each pair (px). The midpoints are corridor samples, NOT bends: bends stay unknown for this schema.
 */
export function corridorOf(tee, basket, left, right) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const orient = (pts) => (pts.length && d(pts[0], basket) < d(pts[0], tee) ? [...pts].reverse() : pts);
  const L = orient(left), R = orient(right), n = Math.min(L.length, R.length);
  const mids = [], widthsPx = [];
  for (let i = 0; i < n; i++) { mids.push([(L[i][0] + R[i][0]) / 2, (L[i][1] + R[i][1]) / 2]); widthsPx.push(d(L[i], R[i])); }
  return { centre: [tee, ...mids, basket], widthsPx, pairedPoints: n, unpaired: Math.abs(L.length - R.length),
    rule: 'left / right edges oriented tee -> basket by geometry, paired point by point; centreline = tee -> midpoints -> basket' };
}

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
    const corridor = !bends && Array.isArray(h.left) && Array.isArray(h.right) ? corridorOf(P(h.tee), P(h.basket), h.left.map(P), h.right.map(P)) : null;
    holes.set(n, { hole: n, tee: P(h.tee), basket: P(h.basket), bends, bent: bends ? bends.length > 0 : true, corridor });
  }
  // Old schema (alex) labels only the bent holes; new schema labels all 18.
  const complete = !holeOf && holes.size === 18;
  return { specimen, file: `testimony/${specimen}/${file}`, dy, holes, complete, annotated: [...holes.keys()].sort((x, y) => x - y) };
}
