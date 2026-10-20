/**
 * fn.q.identity.place: put the tiles of ONE capture into one frame using only the tiles themselves (Sam, 2026-10-19: a stitched
 * course is one raster; several backing rasters are a mechanical detail). The correspondence is the hole number: a badge read
 * as hole 7 in two tiles is the same badge. Nothing here sees any course it will later be matched against.
 *
 * The approach is ChainSpot's pose graph (old-stuff/src/lib/stitch/semanticPoseGraph.ts at 9f4b9e4^), reused in shape, not in
 * code: all-pairs edges from the landmarks two tiles share, edge weight = 10 x shared + 2 x family - min(5, rms) (no families
 * here, so 10 x shared - min(5, rms)), the strongest-weighted seed, a maximum-weight Prim spanning tree, transforms composed
 * down the tree, a graph that does not span reported as not connected. Different: the edges are not a landmark translation
 * vote (the hole number already pairs the points), and the fit is ChainSpot's "simplest model first" (fitMinimalSemanticTransform):
 * translation when its residual is within `translationTol` of the tile's spread, else similarity, else affine. An edge counts
 * as VERIFIED with >= 2 shared badges; one shared badge is only a translation hypothesis (it cannot fix rotation or scale).
 *
 * Units: px of the tile images' canonical frames; the union is in the seed tile's frame. Ratios are unitless.
 */
import { estimateSimilarity, estimateAffine, spreadOf } from './identity.mjs';

export const PLACE = Object.freeze({ translationTol: 0.01, similarityTol: 0.01, minShared: 2 });
/** The models an edge may escalate to, simplest first. A capture (one device, one zoom) restricts it to ['translation']. */
export const MODELS = Object.freeze(['translation', 'similarity', 'affine']);
const apply = (c, p) => ({ xPx: c[0] * p.xPx + c[2] * p.yPx + c[4], yPx: c[1] * p.xPx + c[3] * p.yPx + c[5] });
const compose = ([A, B, C, D, E, F], [a, b, c, d, e, f]) => [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
const rmsOf = (c, pairs) => Math.sqrt(pairs.reduce((s, p) => { const q = apply(c, p.b); return s + (q.xPx - p.a.xPx) ** 2 + (q.yPx - p.a.yPx) ** 2; }, 0) / pairs.length);

/** The transform taking tile b's coordinates to tile a's from the badges they share; null when they share none. */
export function fitEdge(a, b, { models = MODELS } = {}) {
  const bm = new Map(b.badges.map((p) => [p.holeNumber, p])), pairs = a.badges.filter((p) => bm.has(p.holeNumber)).map((p) => ({ holeNumber: p.holeNumber, a: p, b: bm.get(p.holeNumber) }));
  if (!pairs.length) return null;
  const spread = spreadOf(a.badges) || 1, n = pairs.length;
  const dx = pairs.reduce((s, p) => s + p.a.xPx - p.b.xPx, 0) / n, dy = pairs.reduce((s, p) => s + p.a.yPx - p.b.yPx, 0) / n, tr = [1, 0, 0, 1, dx, dy], trRms = rmsOf(tr, pairs);
  let model = 'translation', coefficients = tr, rms = trRms;
  const mk = (p) => ({ id: String(p.holeNumber), enabled: true, source: { xPx: p.b.xPx, yPx: p.b.yPx }, target: { xPx: p.a.xPx, yPx: p.a.yPx } });
  if (n >= 2 && trRms / spread > PLACE.translationTol && models.includes('similarity')) {
    const s = estimateSimilarity({ pairs: pairs.map(mk) });
    if ('transform' in s) { model = 'similarity'; coefficients = s.transform.coefficients; rms = s.metrics.rmsDistance; }
    if (n >= 3 && rms / spread > PLACE.similarityTol && models.includes('affine')) { const f = estimateAffine({ pairs: pairs.map(mk) }); if ('transform' in f) { model = 'affine'; coefficients = f.transform.coefficients; rms = f.metrics.rmsDistance; } }
  }
  const worst = pairs.map((p) => ({ hole: p.holeNumber, px: Math.hypot(apply(coefficients, p.b).xPx - p.a.xPx, apply(coefficients, p.b).yPx - p.a.yPx) })).sort((x, y) => y.px - x.px)[0];
  return { shared: n, sharedHoles: pairs.map((p) => p.holeNumber), model, coefficients, rmsPx: rms, normalizedRms: rms / spread, worst, verified: n >= 2, weight: n * 10 - Math.min(5, rms) };
}

/**
 * tiles: [{ name, badges: [{ holeNumber, xPx, yPx }] }]. minShared: shared badges an edge needs to place a tile (default 2: verified).
 * models: the fits an edge may use (default all three; ['translation'] for one capture). exclude: tile-name pairs ('a|b', either
 * order) whose badge edge is not used to place (a link the pixels rejected). adjust: { 'a|b': weight } added to that pair's edge
 * weight (the pixel residual breaking a tie between equally supported badge edges).
 */
export function placeTiles(tiles, { minShared = PLACE.minShared, models = MODELS, exclude = [], adjust = {} } = {}) {
  const n = tiles.length, E = new Map(), cut = new Set(exclude);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) { const e = fitEdge(tiles[i], tiles[j], { models }); if (e) E.set(`${i}>${j}`, e); }   // edge i>j maps tile j into tile i
  const w = (i, j) => { const e = E.get(`${i}>${j}`); return e && e.shared >= minShared && !cut.has(`${tiles[i].name}|${tiles[j].name}`) && !cut.has(`${tiles[j].name}|${tiles[i].name}`) ? e.weight + (adjust[`${tiles[i].name}|${tiles[j].name}`] ?? adjust[`${tiles[j].name}|${tiles[i].name}`] ?? 0) : -Infinity; };
  let seed = 0, best = -Infinity;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) if (i !== j && Number.isFinite(w(i, j))) s += w(i, j); if (s > best) { best = s; seed = i; } }
  const placed = [seed], T = new Map([[seed, [1, 0, 0, 1, 0, 0]]]), tree = [];
  while (placed.length < n) {
    let bp = -1, bc = -1, bw = -Infinity;
    for (const i of placed) for (let j = 0; j < n; j++) if (!T.has(j) && w(i, j) > bw) { bw = w(i, j); bp = i; bc = j; }
    if (bc === -1 || !Number.isFinite(bw)) break;
    T.set(bc, compose(T.get(bp), E.get(`${bp}>${bc}`).coefficients)); placed.push(bc); tree.push({ parent: tiles[bp].name, child: tiles[bc].name, ...pick(E.get(`${bp}>${bc}`)) });
  }
  const byHole = new Map();
  for (const k of placed) for (const p of tiles[k].badges) { const q = apply(T.get(k), p); (byHole.get(p.holeNumber) ?? byHole.set(p.holeNumber, []).get(p.holeNumber)).push({ tile: tiles[k].name, ...q }); }
  const union = [...byHole.entries()].sort((a, b) => a[0] - b[0]).map(([holeNumber, v]) => ({ holeNumber, xPx: v.reduce((s, q) => s + q.xPx, 0) / v.length, yPx: v.reduce((s, q) => s + q.yPx, 0) / v.length, seenIn: v.map((q) => q.tile),
    disagreementPx: v.length > 1 ? Math.max(...v.flatMap((a, x) => v.slice(x + 1).map((b) => Math.hypot(a.xPx - b.xPx, a.yPx - b.yPx)))) : 0 }));
  const edges = [...E.entries()].filter(([k]) => { const [i, j] = k.split('>').map(Number); return i < j; }).map(([k, e]) => { const [i, j] = k.split('>').map(Number); return { a: tiles[i].name, b: tiles[j].name, ...pick(e) }; });
  return { seed: tiles[seed].name, placed: placed.map((k) => tiles[k].name), unplaced: tiles.map((t, k) => ({ t, k })).filter(({ k }) => !T.has(k)).map(({ t, k }) => ({ tile: t.name, badges: t.badges.length, bestSharedWithPlaced: Math.max(0, ...placed.map((p) => E.get(`${p}>${k}`)?.shared ?? 0)) })),
    connected: placed.length === n, tree, edges, transforms: Object.fromEntries(placed.map((k) => [tiles[k].name, T.get(k)])), union, unionHoles: union.map((u) => u.holeNumber), minShared };
}
const pick = (e) => ({ shared: e.shared, sharedHoles: e.sharedHoles, model: e.model, rmsPx: +e.rmsPx.toFixed(3), normalizedRms: +e.normalizedRms.toFixed(5), worst: e.worst, verified: e.verified });

export const IDENTITY_PLACE_QUERIES = Object.freeze({
  'fn.q.identity.place': ({ tiles, minShared, models, exclude, adjust }) => ({ value: placeTiles(tiles, { ...(minShared ? { minShared } : {}), ...(models ? { models } : {}), ...(exclude ? { exclude } : {}), ...(adjust ? { adjust } : {}) }), unit: 'px (union frame = the seed tile\'s canonical frame); normalizedRms: ratio (edge RMS px / tile RMS spread px)' })
});
