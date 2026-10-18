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
  const widthOf = new Map(raw.holes.map((h) => [holeOf ? holeOf.get(h.number) : h.number, h.corridorWidthPx ?? null]));
  return { path: T.file, rule: `canonical y = annotation y - ${T.dy} px (testimony/${specimen}/README.md); corridor = tee -> corridorBends -> basket`,
    holes: [...T.holes.values()].sort((a, b) => a.hole - b.hole).map((h) => ({ hole: String(h.hole), tee: h.tee, basket: h.basket, bends: h.bends, corridorWidthPx: widthOf.get(h.hole) ?? null })) };
}

