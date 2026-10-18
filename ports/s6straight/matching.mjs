/**
 * S6 MATCHING (Sam, 2026-10-18): the rules of fn.Hole.straight over tk.s6.pairFeatures and nothing else. Each rule reads
 * the table, applies its threshold(s) and its solver (a per-pair threshold, or one to one by the provider matcher), and
 * emits the same straight.json verdict shape as before. No rule touches a raster or recomputes a signal: change a rule
 * and rerun it over every hole of every course in milliseconds (the table is cached by the store).
 *
 * Thresholds live here, in the rules, and nowhere in the table:
 *   straight3     tls max <= ASSOC_BOUNDS.straight3TlsPx (1.5 px)
 *   segmentVerify straight3's basket, then edge step >= SEGMENT_VERIFY.minScoreLumPerPx (6 lum/px)
 *   assigned      one to one (maximumWeightTeeBadgeMatching) on the edge step, then >= 6 lum/px
 *   pathLoss      station carries the path when overlay >= THRESHOLD_OF_LEVEL x the path alpha; straight when
 *                 >= MIN_PASS_FRAC of the visible stations carry it
 *
 * SYMBIOSIS: every rule takes `settled` ([{ hole: pairId, basket: index }], default none), the pairs a round already
 * assigned. Their holes are carried as straight with that basket (evidence.settled) and their baskets are no candidate
 * for any other hole. State is an argument; nothing is shared. Nothing passes `settled` by default.
 */
import { verdictRow, SEGMENT_VERIFY, LANE_NOT_RUN } from './holeStraight.mjs';
import { ASSOC_BOUNDS } from '../s3assoc/associate.mjs';
import { THRESHOLD_OF_LEVEL } from './pathLoss.mjs';

/** The pair rule of pathLoss: the fraction of visible stations that must carry the path for straight. */
export const MIN_PASS_FRAC = 0.5;
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

// ------------------------------------------------------------------ reading the table

const INDEX = new WeakMap();
/** The rows of one hole, in basket order. */
export function rowsOfHole(table, holeId) {
  let idx = INDEX.get(table);
  if (!idx) { idx = { byHole: new Map(), byKey: new Map() }; for (const r of table.rows) { (idx.byHole.get(r.hole) ?? idx.byHole.set(r.hole, []).get(r.hole)).push(r); idx.byKey.set(`${r.hole}|${r.basket}`, r); } INDEX.set(table, idx); }
  return idx.byHole.get(holeId) ?? [];
}
export const rowOf = (table, holeId, basket) => { rowsOfHole(table, holeId); return INDEX.get(table).byKey.get(`${holeId}|${basket}`) ?? null; };
const pairsOf = (table) => table.holes.filter((h) => h.pair);

/** The settled state: holes (pair ids) already assigned a basket, and the baskets they took. */
function settledView(settled) {
  return { byHole: new Map(settled.map((s) => [s.hole, s])), taken: new Set(settled.map((s) => s.basket)) };
}
const settledRow = (table, h, s, test) => verdictRow(h.pair, 'straight', { basket: table.baskets.find((k) => k.index === s.basket) ?? null, evidence: { test, settled: true } });

/**
 * The 3-point pick of one pair (associate.mjs straight3Test over the baskets beyond the badge): the first basket on the
 * line (tls <= the bound) by distance along, else the nearest to the line. null = no BasketPoint beyond the badge.
 */
export function straight3Pick(table, hole, { skip = new Set(), boundPx = ASSOC_BOUNDS.straight3TlsPx } = {}) {
  const hits = rowsOfHole(table, hole.id).filter((r) => r.straight3AlongPx != null && !skip.has(r.basket))
    .map((r) => ({ basket: r.basket, latPx: r.straight3LatPx, alongPx: r.straight3AlongPx, tlsMaxPx: r.straight3TlsMaxPx })).sort((a, b) => a.tlsMaxPx - b.tlsMaxPx);
  const onLine = hits.filter((x) => x.tlsMaxPx <= boundPx).sort((a, b) => a.alongPx - b.alongPx);
  const h = onLine[0] ?? hits[0];
  return h ? { ...h, nextTlsMaxPx: hits[1]?.tlsMaxPx ?? null, verdict: h.tlsMaxPx <= boundPx ? 'STRAIGHT' : 'BENT_OR_BASKET_UNSEEN', basketName: table.baskets.find((k) => k.index === h.basket).name, tlsBoundPx: boundPx } : null;
}
const noBadge = (p) => `Badge ${p.hole} has no S1 badge`;
const basketAt = (table, i) => table.baskets.find((k) => k.index === i);

// ------------------------------------------------------------------ straight3

export function straight3Rule(table, { settled = [] } = {}) {
  const S = settledView(settled);
  const verdicts = pairsOf(table).map((h) => {
    const p = h.pair;
    if (S.byHole.has(h.id)) return settledRow(table, h, S.byHole.get(h.id), '3-point');
    if (!p.badge.center) return verdictRow(p, 'unknown', { condition: noBadge(p), evidence: { test: '3-point' } });
    const s = straight3Pick(table, h, { skip: S.taken });
    if (!s) return verdictRow(p, 'unknown', { condition: 'no BasketPoint beyond the badge', evidence: { test: '3-point' } });
    const evidence = { test: '3-point', tlsMaxPx: s.tlsMaxPx, tlsBoundPx: s.tlsBoundPx, latPx: s.latPx, alongPx: s.alongPx, nextTlsMaxPx: s.nextTlsMaxPx, nearestBasket: s.basketName };
    return s.verdict === 'STRAIGHT' ? verdictRow(p, 'straight', { basket: basketAt(table, s.basket), evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, note: 'no BasketPoint within the bound: bent, or its basket unseen' } });
  });
  return { rule: 'tee centre, badge centre, BasketPoint collinear (TLS max <= 1.5 px); first basket on the line', verdicts, laneNotRun: false };
}

// ------------------------------------------------------------------ segmentVerify

export function segmentVerifyRule(table, { settled = [] } = {}) {
  const S = settledView(settled), V = SEGMENT_VERIFY, course = table.header.course, W = course.hallwayWidthPx, L = course.padLengthPx;
  const verdicts = pairsOf(table).map((h) => {
    const p = h.pair, test = 'segment verify';
    if (S.byHole.has(h.id)) return settledRow(table, h, S.byHole.get(h.id), test);
    if (!p.badge.center) return verdictRow(p, 'unknown', { condition: noBadge(p), evidence: { test } });
    const s = straight3Pick(table, h, { skip: S.taken });
    if (!s) return verdictRow(p, 'unknown', { condition: 'no BasketPoint beyond the badge', evidence: { test } });
    if (s.verdict !== 'STRAIGHT') return verdictRow(p, 'bent', { evidence: { test, step: '3-point test not STRAIGHT: nothing to verify', tlsMaxPx: s.tlsMaxPx } });
    if (!W) return verdictRow(p, 'unknown', { condition: `no hallway width (tk.s6.hallway: ${course.hallwayCondition ?? 'absent'})`, evidence: { test } });
    if (!L) return verdictRow(p, 'unknown', { condition: 'no pad length (tk.s6.padLength: the S3 family model)', evidence: { test } });
    const basket = basketAt(table, s.basket), r = rowOf(table, h.id, s.basket);
    const evidence = { test, capPx: course.startsPx[h.id].map(r2), segmentLengthPx: r2(r.segmentLengthPx), hallwayWidthPx: r2(W), tlsMaxPx: s.tlsMaxPx,
      edgeWidthPx: r.edgeWidthPx != null ? r2(r.edgeWidthPx) : null, edgeCentrePx: r.edgeCentreOffsetPx != null ? r2(r.edgeCentreOffsetPx) : null,
      edgeScoreLumPerPx: r.edgeScoreLumPerPx != null ? r2(r.edgeScoreLumPerPx) : null, edgeCondition: r.edgeScoreLumPerPx != null ? null : r.segmentCondition };
    return r.edgeScoreLumPerPx != null && r.edgeScoreLumPerPx >= V.minScoreLumPerPx ? verdictRow(p, 'straight', { basket, evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, step: `3-point STRAIGHT, segment not verified (${r.edgeScoreLumPerPx != null ? `edge score ${r2(r.edgeScoreLumPerPx)} < ${V.minScoreLumPerPx} lum/px` : r.segmentCondition ?? 'no edge pair'})` } });
  });
  return { rule: 'the 3-point STRAIGHT pairs verified as one segment tee cap -> BasketPoint on unmasked stations (s3first.py seg_fit: W +- 1.5 px, centre +- 1.5 px, edge step >= 6 lum/px)', verdicts, laneNotRun: false };
}

// ------------------------------------------------------------------ assigned

/**
 * assign: assignHolesToBaskets (ports/s6straight/assign.mjs, node-only: the provider matcher), passed in so this module stays
 * browser-safe. Every hole's edge step to every basket is an edge; one to one, cardinality first, then score.
 */
export function assignedRule(table, { settled = [], assign } = {}) {
  const S = settledView(settled), V = SEGMENT_VERIFY, course = table.header.course, W = course.hallwayWidthPx, L = course.padLengthPx, test = 'assigned';
  const pairs = pairsOf(table);
  if (!W || !L) {
    const condition = !W ? 'no hallway width (tk.s6.hallway)' : 'no pad length (tk.s6.padLength)';
    return { rule: 'assigned', verdicts: pairs.map((h) => verdictRow(h.pair, 'unknown', { condition, evidence: { test } })), laneNotRun: false };
  }
  const holes = table.holes.filter((h) => !S.byHole.has(h.id)).map((h) => ({ id: h.id, label: h.label, order: h.order, center: h.centerPx, pair: h.pair }));
  const baskets = table.baskets.filter((k) => !S.taken.has(k.index));
  const edges = [], scored = new Map();
  for (const h of holes) for (const k of baskets) {
    const r = rowOf(table, h.id, k.index);
    if (r.edgeScoreLumPerPx == null) continue;
    edges.push({ hole: h.id, basket: k.index, score: r.edgeScoreLumPerPx });
    scored.set(`${h.id} ${k.index}`, r);
  }
  const { locks } = assign(holes, baskets, edges);
  const verdicts = pairs.map((h) => {
    const p = h.pair;
    if (S.byHole.has(h.id)) return settledRow(table, h, S.byHole.get(h.id), test);
    const lock = locks.get(p.id), own = edges.filter((x) => x.hole === p.id).sort((a, b) => b.score - a.score);
    const best = own[0] ? { basket: baskets.find((k) => k.index === own[0].basket).name, scoreLumPerPx: r2(own[0].score) } : null;
    if (!lock) return verdictRow(p, 'bent', { evidence: { test, step: 'no basket assigned (no scored segment left for this hole)', edges: own.length, bestBasket: best?.basket ?? null, bestScoreLumPerPx: best?.scoreLumPerPx ?? null } });
    const basket = basketAt(table, lock.basket), r = scored.get(`${p.id} ${lock.basket}`);
    const evidence = { test, assignedBasket: basket.name, edgeScoreLumPerPx: r2(r.edgeScoreLumPerPx), edgeWidthPx: r2(r.edgeWidthPx), edgeCentrePx: r2(r.edgeCentreOffsetPx), segmentLengthPx: r2(r.segmentLengthPx),
      runnerUpMarginLumPerPx: lock.runnerUpMargin != null ? r2(lock.runnerUpMargin) : null, edges: own.length, bestBasket: best?.basket ?? null, bestScoreLumPerPx: best?.scoreLumPerPx ?? null };
    return r.edgeScoreLumPerPx >= V.minScoreLumPerPx ? verdictRow(p, 'straight', { basket, evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, step: `assigned ${basket.name}, segment not verified (edge score ${r2(r.edgeScoreLumPerPx)} < ${V.minScoreLumPerPx} lum/px)` } });
  });
  return { rule: 'every hole scored to every BasketPoint (segment edge step), one to one by the provider matcher (cardinality, then score); straight when the assigned segment verifies (>= 6 lum/px)', verdicts, laneNotRun: false,
    assignment: holes.map((h) => ({ hole: h.id, label: h.label, from: h.pair ? 'tee cap' : 'badge (no tee)', basket: locks.has(h.id) ? baskets.find((k) => k.index === locks.get(h.id).basket).name : null, scoreLumPerPx: locks.has(h.id) ? r2(locks.get(h.id).score) : null })), edgesCount: edges.length };
}

// ------------------------------------------------------------------ pathLoss

/** pass: (overlayFrac[], thresholdFrac) => { visibleCount, passFrac, lossFrac, longestGapPx } (the store's fn.q.path.overlayPass, passed in as a call). */
export function pathLossRule(table, { settled = [], pass } = {}) {
  const S = settledView(settled), course = table.header.course, W = course.hallwayWidthPx, L = course.padLengthPx, alpha = table.header.alpha, test = 'path loss';
  const rule = `the 3-point STRAIGHT pairs read as one segment tee cap -> BasketPoint (segmentVerify's stations); a station carries the path when its overlay fraction >= ${THRESHOLD_OF_LEVEL} x the fitted path alpha (tk.s7.alphaProfile); straight when >= ${MIN_PASS_FRAC} of the visible stations carry it`;
  const pairs = pairsOf(table);
  if (!alpha.hasPath) {
    const condition = `${LANE_NOT_RUN}: no alpha profile (path ${alpha.pathStatus}: ${alpha.why})`;
    return { rule, verdicts: pairs.map((h) => verdictRow(h.pair, 'unknown', { condition, evidence: { test } })), laneNotRun: pairs.length > 0 };
  }
  const threshold = { frac: r3(THRESHOLD_OF_LEVEL * alpha.pathAlphaFrac), rule: `${THRESHOLD_OF_LEVEL} x the profile's path alpha ${alpha.pathAlphaFrac} (tk.s7.alphaProfile, fitted on ${alpha.pathFitOn})` };
  const verdicts = pairs.map((h) => {
    const p = h.pair;
    if (S.byHole.has(h.id)) return settledRow(table, h, S.byHole.get(h.id), test);
    if (!p.badge.center) return verdictRow(p, 'unknown', { condition: noBadge(p), evidence: { test } });
    const s = straight3Pick(table, h, { skip: S.taken });
    if (!s) return verdictRow(p, 'unknown', { condition: 'no BasketPoint beyond the badge', evidence: { test } });
    if (s.verdict !== 'STRAIGHT') return verdictRow(p, 'bent', { evidence: { test, step: '3-point test not STRAIGHT: nothing to read', tlsMaxPx: s.tlsMaxPx } });
    if (!W) return verdictRow(p, 'unknown', { condition: `no hallway width (tk.s6.hallway: ${course.hallwayCondition ?? 'absent'})`, evidence: { test } });
    if (!L) return verdictRow(p, 'unknown', { condition: 'no pad length (tk.s6.padLength: the S3 family model)', evidence: { test } });
    const basket = basketAt(table, s.basket), r = rowOf(table, h.id, s.basket);
    const o = r.overlayCondition ? null : { visibleCount: r.overlayVisibleStationsCount, meanOverlayFrac: r.overlayMeanFrac, medianOverlayFrac: r.overlayMedianFrac, ...pass(r.overlayFracStations, threshold.frac) };
    const evidence = { test, capPx: course.startsPx[h.id].map(r2), segmentLengthPx: r2(r.segmentLengthPx), hallwayWidthPx: r2(W), tlsMaxPx: s.tlsMaxPx, pathAlphaFrac: alpha.pathAlphaFrac, thresholdFrac: threshold.frac,
      stationsCount: r.stationsCount ?? 0, overlayVisibleCount: o?.visibleCount ?? 0, overlayPassFrac: o?.passFrac ?? null, medianOverlayFrac: o?.medianOverlayFrac ?? null, meanOverlayFrac: o?.meanOverlayFrac ?? null,
      overlayLongestGapPx: o?.longestGapPx ?? null, edgePassFrac: r.edgeCondition ? null : r.edgePassFrac ?? null };
    if (r.overlayCondition) return verdictRow(p, 'unknown', { condition: `fn.q.path.loss: ${r.overlayCondition}`, evidence });
    if (!o?.visibleCount) return verdictRow(p, 'unknown', { condition: 'no station with a visible background on the segment (all masked)', evidence });
    return o.passFrac >= MIN_PASS_FRAC ? verdictRow(p, 'straight', { basket, evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, step: `3-point STRAIGHT, path lost: ${o.passFrac} of ${o.visibleCount} visible stations carry >= ${threshold.frac} overlay (< ${MIN_PASS_FRAC})` } });
  });
  return { rule, threshold, verdicts, laneNotRun: false };
}
