/**
 * Candidate names, Excel style (Sam, 2026-10-17): before a sprite's identity
 * is known it is `{Tee|Badge|Basket} c[a-z]+` (ca, cb, ... cz, caa, cab, ...);
 * once proven it takes its hole number (`Tee 12`). Letters can never be
 * mistaken for a hole number, a count or a list index, so an unproven thing
 * reads as unproven. Names follow raster order of the candidate's centre
 * (y, then x), so the same detections get the same names on every run.
 */
export const KINDS = Object.freeze(['Tee', 'Badge', 'Basket']);

/** 0 -> 'ca', 25 -> 'cz', 26 -> 'caa' (bijective base 26, like spreadsheet columns). */
export function candidateCode(i) {
  if (!Number.isInteger(i) || i < 0) throw new Error(`candidateCode: ${i} is not a non-negative integer`);
  let s = '', n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
  return `c${s}`;
}

export const CANDIDATE_RE = /^(Tee|Badge|Basket) c[a-z]+$/;
export const IDENTIFIED_RE = /^(Tee|Badge|Basket) ([1-9]|1[0-8])$/;

/**
 * Name a list of candidates of one kind. centerOf(item) -> [x, y] (px). Returns names in the INPUT order,
 * assigned by raster order of the centres (y rounded to the pixel row, then x).
 */
export function nameCandidates(kind, items, centerOf) {
  if (!KINDS.includes(kind)) throw new Error(`nameCandidates: unknown kind ${kind}`);
  const order = items.map((it, i) => ({ i, c: centerOf(it) })).sort((a, b) => Math.round(a.c[1]) - Math.round(b.c[1]) || a.c[0] - b.c[0] || a.i - b.i);
  const names = new Array(items.length);
  order.forEach((o, rank) => { names[o.i] = `${kind} ${candidateCode(rank)}`; });
  return names;
}

/** The name to print: the proven hole identity when there is one, else the candidate code. */
export const displayName = (kind, candidate, hole = null) => (hole == null ? candidate : `${kind} ${hole}`);
