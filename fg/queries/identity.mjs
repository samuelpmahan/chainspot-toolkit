/**
 * fn.q.identity.*: course identity from the geometry of hole-number badges (and tees, baskets when present), math
 * written once behind the PxC boundary (docs/agents/boundary.md). Code outside asks by Part address (the derived view
 * tk.identity.points) or passes two point sets; every answer is { value, unit }, cached by its arguments and profiled.
 *
 * Ported from ChainSpot v1's Course Memory (src/lib/courseSignature.ts, src/lib/alignment/{similarity,affine,residuals,
 * transform}.ts, src/lib/geometry/affine6.ts; Sam OK'd referencing and importing it, 2026-10-19). The ported math is the
 * same operation for operation, so the descriptors, hashes and fits equal the TS's on the same inputs
 * (identity.parity.test.mjs checks that against the TS run under bun). What the TS does, exactly:
 *   - the correspondence is the key (hole number, kind): a point of one image pairs with the point of the same hole and
 *     kind in the other; there is no blind point-cloud registration and no angle or ratio table. A similarity transform
 *     (affine on an overlap of 9 holes or more when the similarity is not confident) is fitted over the pairs, with a
 *     drop-the-worst-pair refit loop, and the fit's RMS residual is divided by the TARGET's own RMS spread. The "angles
 *     and ratios stay the same" claim lives in that fit: a similarity preserves angles and ratios of distances.
 *   - the descriptor (translate to the centroid, scale by the RMS spread, rotate the smallest present hole's badge onto +x,
 *     quantize to 0.01) is only a coarse pre-filter hash, expected NOT to match across different crops.
 * The TS reads badges and baskets. This port adds `tees` as a third kind of the same key; with no tees the answers equal
 * the TS's exactly. Units: pixels of the image the points come from (canonical frame); normalized fields are ratios.
 */
import { createHash } from 'node:crypto';

export const IDENTITY = Object.freeze({
  minSignatureHoles: 6, hashQuantizationStep: 0.01, minOverlapHoles: 6, minOverlapFraction: 0.5,
  confidentNormalizedRms: 0.06, outlierPruneMaxIterations: 3, outlierPruneMinRemainingPairs: 5, affineFallbackMinOverlap: 9,
  similarityMinPairs: 2, affineMinPairs: 3, reflectionImprovementMargin: 0.5, singularityRelativeTolerance: 1e-9, determinantTolerance: 1e-12
});
const KINDS = Object.freeze(['badge', 'basket', 'tee']);   // the order the TS combines (badges, baskets) then the added tees

const centroidOf = (pts) => {
  if (!pts.length) return { xPx: 0, yPx: 0 };
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.xPx; sy += p.yPx; }
  return { xPx: sx / pts.length, yPx: sy / pts.length };
};
/** RMS distance from the set's own centroid: the one definition of spread (descriptor scale and match residual). */
export function spreadOf(pts) {
  if (!pts.length) return 0;
  const c = centroidOf(pts);
  let ss = 0;
  for (const p of pts) { const dx = p.xPx - c.xPx, dy = p.yPx - c.yPx; ss += dx * dx + dy * dy; }
  return Math.sqrt(ss / pts.length);
}
export const combinePoints = (input) => KINDS.flatMap((kind) => (input[`${kind}s`] ?? []).map((p) => ({ holeNumber: p.holeNumber, kind, xPx: p.xPx, yPx: p.yPx })));
const quantize = (v) => Math.round(v / IDENTITY.hashQuantizationStep) * IDENTITY.hashQuantizationStep + 0;
const formatFixed = (v) => (v + 0).toFixed(2);

export function computeSignatureDescriptor(input) {
  const distinctBadgeHoles = new Set((input.badges ?? []).map((b) => b.holeNumber));
  if (distinctBadgeHoles.size < IDENTITY.minSignatureHoles) return { ok: false, reason: 'insufficient-holes' };
  const combined = combinePoints(input), c = centroidOf(combined);
  const centered = combined.map((p) => ({ ...p, xPx: p.xPx - c.xPx, yPx: p.yPx - c.yPx }));
  const scale = spreadOf(centered);
  if (scale < 1e-6) return { ok: false, reason: 'degenerate-spread' };
  const minHole = Math.min(...combined.map((p) => p.holeNumber));
  const ref = centered.find((p) => p.holeNumber === minHole && p.kind === 'badge') ?? centered.find((p) => p.holeNumber === minHole);
  const angle = Math.atan2(ref.yPx, ref.xPx), cosA = Math.cos(angle), sinA = Math.sin(angle);
  const points = centered.map((p) => ({ holeNumber: p.holeNumber, kind: p.kind, xNorm: quantize((p.xPx * cosA + p.yPx * sinA) / scale), yNorm: quantize((-p.xPx * sinA + p.yPx * cosA) / scale) }))
    .sort((a, b) => a.holeNumber - b.holeNumber || a.kind.localeCompare(b.kind));
  return { ok: true, holeNumbers: [...new Set(combined.map((p) => p.holeNumber))].sort((a, b) => a - b), points };
}

/** sha-256 (hex) of the canonical, order-independent serialization of a valid descriptor. */
export function hashSignatureDescriptor(d) {
  const canonical = JSON.stringify({ holeNumbers: d.holeNumbers, points: d.points.map((p) => ({ holeNumber: p.holeNumber, kind: p.kind, xNorm: formatFixed(p.xNorm), yNorm: formatFixed(p.yNorm) })) });
  return createHash('sha256').update(new TextEncoder().encode(canonical)).digest('hex');
}

// ------------------------------------------------------------------ alignment (similarity.ts, affine.ts, residuals.ts, affine6.ts)
const deriveValues = (a, b, c, d) => {
  const finite = [a, b, c, d].every(Number.isFinite), determinant = a * d - b * c, isInvertible = finite && Math.abs(determinant) >= IDENTITY.determinantTolerance;
  const trace = a * a + b * b + c * c + d * d, disc = Math.max(trace * trace - 4 * determinant * determinant, 0), sq = Math.sqrt(disc);
  const majorAxisScale = Math.sqrt((trace + sq) / 2), minorAxisScale = Math.sqrt(Math.max((trace - sq) / 2, 0)), sp = majorAxisScale * minorAxisScale;
  return { isInvertible, determinant, orientation: finite ? Math.sign(determinant) : 0, majorAxisScale, minorAxisScale, anisotropy: sp > 0 ? minorAxisScale / majorAxisScale : 0, shear: sp > 0 ? Math.abs(a * c + b * d) / sp : 0 };
};
const applyT = (p, [a, b, c, d, e, f]) => ({ xPx: a * p.xPx + c * p.yPx + e, yPx: b * p.xPx + d * p.yPx + f });
function residualsOf(pairs, transform) {
  const rs = pairs.filter((p) => p.enabled && p.target).map((p) => { const ex = applyT(p.source, transform.coefficients), dx = ex.xPx - p.target.xPx, dy = ex.yPx - p.target.yPx; return { pairId: p.id, distance: Math.hypot(dx, dy) }; });
  if (!rs.length) return { count: 0, meanDistance: 0, medianDistance: 0, rmsDistance: 0, maxDistance: 0, maxPairId: null };
  const dists = rs.map((r) => r.distance).sort((x, y) => x - y), n = dists.length, sum = dists.reduce((s, v) => s + v, 0);
  let maxDistance = rs[0].distance, maxPairId = rs[0].pairId;
  for (let i = 1; i < rs.length; i++) if (rs[i].distance > maxDistance) { maxDistance = rs[i].distance; maxPairId = rs[i].pairId; }
  return { count: n, meanDistance: sum / n, medianDistance: n % 2 === 1 ? dists[(n - 1) / 2] : (dists[n / 2 - 1] + dists[n / 2]) / 2, rmsDistance: Math.sqrt(dists.reduce((s, v) => s + v * v, 0) / n), maxDistance, maxPairId };
}
const fail = (model, reason, requiredPairs, availablePairs) => ({ model, reason, requiredPairs, availablePairs });
const finiteAll = (pairs) => pairs.every((p) => Number.isFinite(p.source.xPx) && Number.isFinite(p.source.yPx) && (p.target === null || (Number.isFinite(p.target.xPx) && Number.isFinite(p.target.yPx))));

export function estimateSimilarity({ pairs }) {
  const en = pairs.filter((p) => p.enabled), cp = en.filter((p) => p.target !== null), M = IDENTITY.similarityMinPairs;
  if (!finiteAll(en)) return fail('similarity', 'NON_FINITE_COORDINATES', M, en.length);
  if (cp.length < M) return fail('similarity', 'INSUFFICIENT_PAIRS', M, cp.length);
  if (new Set(cp.map((p) => `${p.source.xPx},${p.source.yPx}`)).size < M || new Set(cp.map((p) => `${p.target.xPx},${p.target.yPx}`)).size < M) return fail('similarity', 'ZERO_SPREAD', M, cp.length);
  let sx = 0, sy = 0, tx = 0, ty = 0;
  for (const p of cp) { sx += p.source.xPx; sy += p.source.yPx; tx += p.target.xPx; ty += p.target.yPx; }
  const mx = sx / cp.length, my = sy / cp.length, Mx = tx / cp.length, My = ty / cp.length;
  let sn2 = 0, dot = 0, cross = 0, rdot = 0, rcross = 0, tn2 = 0;
  for (const p of cp) {
    const u = p.source.xPx - mx, v = p.source.yPx - my, pu = p.target.xPx - Mx, pv = p.target.yPx - My;
    sn2 += u * u + v * v; tn2 += pu * pu + pv * pv; dot += pu * u + pv * v; cross += pv * u - pu * v; rdot += pu * u - pv * v; rcross += pv * u + pu * v;
  }
  if (sn2 <= 0) return fail('similarity', 'ZERO_SPREAD', M, cp.length);
  const rotErr = Math.max(tn2 - (dot * dot + cross * cross) / sn2, 0), refErr = Math.max(tn2 - (rdot * rdot + rcross * rcross) / sn2, 0);
  if (refErr < rotErr * IDENTITY.reflectionImprovementMargin) return fail('similarity', 'REFLECTION_REQUIRED', M, cp.length);
  const qr = dot / sn2, qi = cross / sn2, a = qr, b = qi, c = -qi, d = qr, e = Mx - a * mx - c * my, f = My - b * mx - d * my;
  const coefficients = [a, b, c, d, e, f];
  if (!coefficients.every(Number.isFinite)) return fail('similarity', 'NUMERICAL_SOLVE_FAILURE', M, cp.length);
  const transform = { model: 'similarity', coefficients, ...deriveValues(a, b, c, d) };
  return { model: 'similarity', transform, metrics: residualsOf(cp, transform), usedPairIds: cp.map((p) => p.id) };
}

export function estimateAffine({ pairs }) {
  const en = pairs.filter((p) => p.enabled), cp = en.filter((p) => p.target !== null), M = IDENTITY.affineMinPairs;
  if (!finiteAll(en)) return fail('affine', 'NON_FINITE_COORDINATES', M, en.length);
  if (cp.length < M) return fail('affine', 'INSUFFICIENT_PAIRS', M, cp.length);
  if (new Set(cp.map((p) => `${p.source.xPx},${p.source.yPx}`)).size < M) return fail('affine', 'COLLINEAR_GEOMETRY', M, cp.length);
  let sx = 0, sy = 0, tx = 0, ty = 0;
  for (const p of cp) { sx += p.source.xPx; sy += p.source.yPx; tx += p.target.xPx; ty += p.target.yPx; }
  const n = cp.length, mx = sx / n, my = sy / n, Mx = tx / n, My = ty / n;
  let u2 = 0, v2 = 0, uv = 0, pu_ = 0, pv_ = 0, qu = 0, qv = 0;
  for (const p of cp) {
    const u = p.source.xPx - mx, v = p.source.yPx - my, pp = p.target.xPx - Mx, q = p.target.yPx - My;
    u2 += u * u; v2 += v * v; uv += u * v; pu_ += pp * u; pv_ += pp * v; qu += q * u; qv += q * v;
  }
  const detG = u2 * v2 - uv * uv;
  if (detG <= IDENTITY.singularityRelativeTolerance * u2 * v2) return fail('affine', 'COLLINEAR_GEOMETRY', M, cp.length);
  const inv = 1 / detG, a = (pu_ * v2 - pv_ * uv) * inv, c = (pv_ * u2 - pu_ * uv) * inv, b = (qu * v2 - qv * uv) * inv, d = (qv * u2 - qu * uv) * inv, e = Mx - a * mx - c * my, f = My - b * mx - d * my;
  const coefficients = [a, b, c, d, e, f];
  if (!coefficients.every(Number.isFinite)) return fail('affine', 'NUMERICAL_SOLVE_FAILURE', M, cp.length);
  const transform = { model: 'affine', coefficients, ...deriveValues(a, b, c, d) };
  if (!transform.isInvertible) return fail('affine', 'NON_INVERTIBLE', M, cp.length);
  return { model: 'affine', transform, metrics: residualsOf(cp, transform), usedPairIds: cp.map((p) => p.id) };
}

function fitWithOutlierPruning(estimator, initialPairs, targetSpread) {
  let pairs = initialPairs, iterations = 0;
  const droppedIds = [];
  for (;;) {
    const est = estimator({ pairs });
    if (!('transform' in est)) return { ok: false, result: null, normalizedRms: Infinity, pairsUsed: pairs, droppedIds };
    const normalizedRms = targetSpread > 1e-9 ? est.metrics.rmsDistance / targetSpread : Infinity;
    const worst = est.metrics.maxPairId, canPrune = worst !== null && pairs.length - 1 >= IDENTITY.outlierPruneMinRemainingPairs;
    if (normalizedRms <= IDENTITY.confidentNormalizedRms || iterations >= IDENTITY.outlierPruneMaxIterations || !canPrune) return { ok: true, result: est, normalizedRms, pairsUsed: pairs, droppedIds };
    droppedIds.push(worst); pairs = pairs.filter((p) => p.id !== worst); iterations += 1;
  }
}
const holeOfKey = (k) => Number.parseInt(k.split(':')[0], 10);

/**
 * Fit a transform from `source`'s points to `target`'s by (hole number, kind) and score it against the target's own spread.
 * `kinds` (default all three of badge, basket, tee) restricts which kinds take part, on both sides.
 */
export function matchSignatures(source, target, { kinds = KINDS } = {}) {
  const keep = (set) => ({ badges: kinds.includes('badge') ? set.badges : [], baskets: kinds.includes('basket') ? set.baskets : [], tees: kinds.includes('tee') ? set.tees : [] });
  const sc = combinePoints(keep(source)), tc = combinePoints(keep(target)), byKey = new Map(tc.map((p) => [`${p.holeNumber}:${p.kind}`, p]));
  const pairs = [];
  for (const p of sc) { const key = `${p.holeNumber}:${p.kind}`, t = byKey.get(key); if (t) pairs.push({ id: key, enabled: true, source: { xPx: p.xPx, yPx: p.yPx }, target: { xPx: t.xPx, yPx: t.yPx } }); }
  const overlap = new Set(pairs.map((p) => holeOfKey(p.id))), minSide = Math.min(new Set(sc.map((p) => p.holeNumber)).size, new Set(tc.map((p) => p.holeNumber)).size);
  const noMatch = { matched: false, transform: null, normalizedRms: Infinity, confidence: 0, usedHoleNumbers: [], droppedHoleNumbers: [], model: null, overlapHoles: overlap.size };
  if (overlap.size < IDENTITY.minOverlapHoles || overlap.size < IDENTITY.minOverlapFraction * minSide) return noMatch;
  const spread = spreadOf(tc);
  let chosen = null;
  const sim = fitWithOutlierPruning(estimateSimilarity, pairs, spread);
  if (sim.ok) chosen = { ...sim, model: 'similarity' };
  if ((!chosen || chosen.normalizedRms > IDENTITY.confidentNormalizedRms) && overlap.size >= IDENTITY.affineFallbackMinOverlap) {
    const aff = fitWithOutlierPruning(estimateAffine, pairs, spread);
    if (aff.ok && (!chosen || aff.normalizedRms < chosen.normalizedRms)) chosen = { ...aff, model: 'affine' };
  }
  if (!chosen || !chosen.result) return noMatch;
  const matched = chosen.normalizedRms <= IDENTITY.confidentNormalizedRms;
  return {
    matched, transform: matched ? chosen.result.transform : null, normalizedRms: chosen.normalizedRms, confidence: matched ? Math.max(0, Math.min(1, 1 - chosen.normalizedRms / IDENTITY.confidentNormalizedRms)) : 0,
    usedHoleNumbers: [...new Set(chosen.pairsUsed.map((p) => holeOfKey(p.id)))].sort((a, b) => a - b), droppedHoleNumbers: [...new Set(chosen.droppedIds.map(holeOfKey))].sort((a, b) => a - b),
    model: matched ? chosen.model : null, overlapHoles: overlap.size, fitModel: chosen.model, rmsPx: chosen.result.metrics.rmsDistance, targetSpreadPx: spread, scale: chosen.result.transform.majorAxisScale
  };
}

export const IDENTITY_QUERIES = Object.freeze({
  // a points set { badges, baskets, tees } of { holeNumber, xPx, yPx }; a string argument is the Part reference tk.identity.points
  'fn.q.identity.descriptor': ({ a }) => ({ value: computeSignatureDescriptor(a), unit: 'ratio (descriptor coordinates: px / RMS spread of the set; rotated, 0.01 steps)' }),
  'fn.q.identity.hash': ({ a }) => { const d = computeSignatureDescriptor(a); return { value: d.ok ? hashSignatureDescriptor(d) : null, unit: 'sha-256 hex of the canonical descriptor (null: no valid descriptor)' }; },
  'fn.q.identity.match': ({ source, target, kinds }) => ({ value: matchSignatures(source, target, kinds ? { kinds } : {}), unit: 'normalizedRms: ratio (fit RMS px / target RMS spread px); rmsPx: px; scale: ratio (target px per source px)' })
});
