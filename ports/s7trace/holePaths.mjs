/** Sam's corridors (testimony) for the S7 judge, canonical frame (node-only: reads testimony/<specimen>/). */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadTestimony } from '../judge/testimony.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Sam's corridors in the canonical frame, with his corridor width per hole (px). */
export function loadHolePaths(specimen, root = ROOT) {
  const T = loadTestimony(specimen, root);
  if (!T) return { path: null, rule: `no testimony for ${specimen}: blind run, nothing judged`, holes: [] };
  const raw = readJson(join(root, T.file)), mapFile = join(root, 'testimony', specimen, 'hole-numbers.json');
  const holeOf = existsSync(mapFile) ? new Map(readJson(mapFile).map.map((m) => [m.annotationNumber, m.holeNumber])) : null;
  // the old annotation schema (alex) has corridors, not bend points: its corridor centreline = the midpoints of the paired left / right
  // polylines. The two are NOT stored in one direction (alex annotation 1's right runs basket -> tee, 2's and 3's tee -> basket):
  // the right polyline is oriented so that its ends sit nearest the left one's.
  const d2 = (a, b) => Math.hypot(a.xPx - b.xPx, a.yPx - b.yPx);
  const centreOf = new Map(raw.holes.filter((h) => !h.corridorBends && h.left?.length && h.left.length === h.right?.length).map((h) => {
    const n = h.left.length, same = d2(h.left[0], h.right[0]) + d2(h.left[n - 1], h.right[n - 1]), flipped = d2(h.left[0], h.right[n - 1]) + d2(h.left[n - 1], h.right[0]);
    const R = flipped < same ? [...h.right].reverse() : h.right, P = (p) => [p.xPx, p.yPx - T.dy];
    return [holeOf ? holeOf.get(h.number) : h.number, h.left.map((l, i) => { const a = P(l), b = P(R[i]); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; })];
  }));
  const widthOf = new Map(raw.holes.map((h) => [holeOf ? holeOf.get(h.number) : h.number, h.corridorWidthPx ?? null]));
  return { path: T.file, rule: `canonical y = annotation y - ${T.dy} px (testimony/${specimen}/README.md); corridor = tee -> corridorBends -> basket`,
    holes: [...T.holes.values()].sort((a, b) => a.hole - b.hole).map((h) => ({ hole: String(h.hole), tee: h.tee, basket: h.basket, bends: h.bends, corridorWidthPx: widthOf.get(h.hole) ?? null, ...(h.bends ? {} : centreOf.has(h.hole) ? { corridorCentre: centreOf.get(h.hole) } : {}) })) };
}

