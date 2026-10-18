/**
 * S6 SCORING (Sam, 2026-10-18): "scoring and matching are separate, symbiotic phases. You aren't trying to optimize
 * everything right now, you're trying to enumerate harnessable signal and understand the feature space."
 *
 * tk.s6.pairFeatures is the table of every candidate pair on the course x one column per feature: raw numbers with units,
 * no threshold, no verdict. The matching rules (ports/s6straight/matching.mjs) read this table and nothing else.
 *
 *   tk.s6.pairCandidates        the pairs: every hole start (a tee of tk.s6.holePairs = S3 observed + S4 recovered, from its cap;
 *                               a badge with no tee, from the badge centre) x EVERY basket of tk.s6.baskets (S2 + S4 recovered,
 *                               BasketPoint as tk.s6.baskets has it)
 *   tk.s6.feature.geometry      3-point test (lateral / along / TLS max px of tee centre, badge centre, this BasketPoint) and
 *                               the S5 axis residual (fn.q.pair.residual: perp px and angle deg of the badge off the tee axis)
 *   tk.s6.feature.segment       the edge pair on the straight segment start -> BasketPoint (fn.q.path.edgePair, segmentVerify's
 *                               arguments): width px, centre offset px, edge step lum/px, and the step against the competitors
 *   tk.s6.feature.edge          the edge test along the same stations (fn.q.path.loss edge): visible stations, pass fraction at
 *                               tau 8 lum, longest gap px, median contrast lum
 *   tk.s6.feature.overlay       the alpha overlay fraction along the same stations (fn.q.path.loss overlay; tk.s7.alphaProfile):
 *                               mean / median fraction, visible stations, the station vector (so a rule applies its own
 *                               threshold: fn.q.path.overlayPass), and the loss / longest gap at the reference of half the
 *                               fitted path alpha
 *   tk.s6.pairFeatures          the join of the five Parts above (a feature's code changing recomputes only its Part)
 *
 * Every family is a Calculation with its own `code` (the digest of the functions it runs), so the store's cache key
 * (fn + code + args + input keys) moves only for the family whose code or inputs changed. The math is the existing
 * queries' (fn.q.hole.straight3Point = associate.mjs straight3Test; fn.q.path.*; fn.q.pair.residual): nothing is
 * re-derived here. Conditions are recorded per row (`<family>Condition`), never thrown. Coordinates: canonical px.
 */
import { capOf, segmentArgs } from './holeStraight.mjs';
import { ALPHA_PROFILE_PART, hasOverlay } from '../../contracts/alpha.profile@1.mjs';
import { PAIR_QUERIES, unitAxis } from '../s5pair/residualQuery.mjs';
import { registerQueries } from '../../fg/store.mjs';
import { sha256Hex } from '../../fg/canon.mjs';

export const CANDIDATES_PART = 'tk.s6.pairCandidates';
export const PAIR_FEATURES_PART = 'tk.s6.pairFeatures';
export const FEATURE_FAMILIES = Object.freeze(['geometry', 'segment', 'edge', 'overlay']);
export const featurePart = (family) => `tk.s6.feature.${family}`;
/** The reference level the overlay-loss columns are measured at (a measurement reference, not a decision): half the fitted path alpha. */
export const OVERLAY_REFERENCE_OF_ALPHA = 0.5;

const PATH_MASK_PART = 'tk.s6.pathMask', HALLWAY_PART = 'tk.s6.hallway', PAD_LENGTH_PART = 'tk.s6.padLength', RASTER = 'px.image.cropped';
const r3 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);

/** Units, per column: the name carries the unit too. */
export const COLUMN_UNITS = Object.freeze({
  straight3LatPx: 'px (BasketPoint to the tee centre -> badge centre line)',
  straight3AlongPx: 'px (BasketPoint along the tee centre -> badge centre line, from the tee centre)',
  straight3TlsMaxPx: 'px (TLS max residual of tee centre, badge centre, this BasketPoint)',
  axisResidualPerpPx: 'px (badge centre off the tee long axis line, signed; fn.q.pair.residual signedPerpPx)',
  axisResidualAngleDeg: 'deg (tee long axis to the ray tee centre -> badge centre; fn.q.pair.residual angleResidualDeg)',
  badgeDistancePx: 'px (tee centre to badge centre)',
  segmentLengthPx: 'px (hole start -> this BasketPoint; the start is the tee cap, or the badge centre when the tee is hidden)',
  edgeWidthPx: 'px (width of the best edge pair on the segment, fn.q.path.edgePair at the hallway width +- 1.5 px)',
  edgeCentreOffsetPx: 'px (centre of that edge pair off the segment line)',
  edgeScoreLumPerPx: 'lum/px (edge step: min of the two edge gradients)',
  edgeScoreMarginToBestOtherBasketLumPerPx: 'lum/px (this score minus the best score of the same hole to any other basket)',
  edgeScoreRatioToBestOtherBasket: 'ratio (this score over the best score of the same hole to any other basket)',
  edgeScoreRatioToBestOtherHole: 'ratio (this score over the best score of any other hole to the same basket)',
  stationsCount: 'stations (1 px apart, 0.6 W .. |segment| - 2 px)',
  edgeVisibleStationsCount: 'stations (unmasked on both edges)',
  edgePassFrac: 'fraction of visible stations whose min-side contrast exceeds tau = 8 lum',
  edgeLongestGapPx: 'px (longest run of visible stations that fail the edge test)',
  edgeMedianContrastLum: 'lum (median min-side contrast over visible stations)',
  overlayVisibleStationsCount: 'stations (centre unmasked with a background)',
  overlayMeanFrac: 'fraction (mean overlay fraction of the path colour over visible stations)',
  overlayMedianFrac: 'fraction (median overlay fraction over visible stations)',
  overlayFracStations: 'fraction per station (null = masked / no background), stations 1 px apart from 0.6 W',
  overlayLossFracAtHalfPathAlpha: 'fraction of visible stations below half the fitted path alpha',
  overlayLongestGapPxAtHalfPathAlpha: 'px (longest run of visible stations below half the fitted path alpha)'
});

// ------------------------------------------------------------------ the pairs

/** Every hole start x every basket. Holes: tees after S4 first (as tk.s6.holePairs), then badges with no tee (assigned's holes). */
export function candidatesOf(pairs, baskets, badgeCenters) {
  const withTee = new Set(pairs.map((p) => p.hole));
  const holes = [
    ...pairs.map((p, i) => ({ id: p.id, label: p.hole, order: i, from: 'tee cap', pair: p, badge: p.badge, centerPx: p.tee.center })),
    ...badgeCenters.filter((b) => !withTee.has(b.label)).map((b, i) => ({ id: `B${b.label}`, label: b.label, order: pairs.length + i, from: 'badge (no tee)', pair: null, badge: b, centerPx: b.center }))
  ];
  const rows = []; for (const h of holes) for (const k of baskets) rows.push({ hole: h.id, basket: k.index });
  return { schema: 'nctk-s6-pair-candidates@1', rule: 'every hole start (tee cap of each S3 observed / S4 recovered tee; the badge centre when the tee is hidden) x every basket (S2 + S4 recovered), BasketPoint as tk.s6.baskets',
    holes, baskets, rows, emits: { holesCount: holes.length, basketsCount: baskets.length, pairsCount: rows.length } };
}

const holeOf = (cands) => new Map(cands.holes.map((h) => [h.id, h]));
const basketOf = (cands) => new Map(cands.baskets.map((k) => [k.index, k]));
/** The start of a hole's straight segment: the tee cap (capOf, pad length L), else the badge centre. */
export const startOf = (hole, L) => (hole.pair ? capOf(hole.pair, L) : hole.badge.center);

function familyOf(family, cands, header, columns, perRow) {
  const holes = holeOf(cands), baskets = basketOf(cands);
  const rows = cands.rows.map((r) => ({ hole: r.hole, basket: r.basket, ...perRow(holes.get(r.hole), baskets.get(r.basket), r) }));
  return { schema: 'nctk-s6-pair-feature-family@1', family, header, columns: Object.fromEntries(columns.map((c) => [c, COLUMN_UNITS[c]])), rows, emits: { rowsCount: rows.length, columnsCount: columns.length } };
}
const nullsOf = (columns) => Object.fromEntries(columns.map((c) => [c, null]));

// ------------------------------------------------------------------ geometry

const GEOMETRY_COLUMNS = ['straight3LatPx', 'straight3AlongPx', 'straight3TlsMaxPx', 'axisResidualPerpPx', 'axisResidualAngleDeg', 'badgeDistancePx'];
export function geometryFamily(cands, q) {
  const axis = new Map();   // per hole: the S5 residual does not depend on the basket
  const axisOfHole = (h) => {
    if (axis.has(h.id)) return axis.get(h.id);
    const p = h.pair; let a;
    if (!p) a = { condition: 'no tee: no tee axis' };
    else if (!p.badge.center) a = { condition: `Badge ${p.hole} has no S1 badge` };
    else if (p.tee.angleRad == null) a = { condition: 'tee has no pose angle' };
    else { const v = q('fn.q.pair.residual', { center: p.tee.center, axis: unitAxis(p.tee.angleRad), plate: p.badge.center }); a = v.unavailable ? { condition: v.unavailable } : v; }
    axis.set(h.id, a); return a;
  };
  return familyOf('geometry', cands, { rule: '3-point test per (hole, basket) through fn.q.hole.straight3Point; S5 axis residual per hole through fn.q.pair.residual' }, GEOMETRY_COLUMNS, (h, k) => {
    const out = { ...nullsOf(GEOMETRY_COLUMNS), geometryCondition: null, axisCondition: null }, a = axisOfHole(h);
    if (a.condition) { out.axisCondition = a.condition; out.geometryCondition = a.condition; }
    else { out.axisResidualPerpPx = a.signedPerpPx; out.axisResidualAngleDeg = a.angleResidualDeg; out.badgeDistancePx = a.distancePx; }
    if (h.pair?.badge.center) {
      const g = q('fn.q.hole.straight3Point', { teePx: h.pair.tee.center, badgePx: h.pair.badge.center, pointPx: k.point });
      if (g.condition) out.geometryCondition = g.condition; else Object.assign(out, { straight3LatPx: g.latPx, straight3AlongPx: g.alongPx, straight3TlsMaxPx: g.tlsMaxPx });
    } else if (!out.geometryCondition) out.geometryCondition = h.pair ? `Badge ${h.pair.hole} has no S1 badge` : 'no tee: no 3-point test';
    return out;
  });
}

// ------------------------------------------------------------------ segment (edge pair), edge test, overlay: one walk over the segments

const courseOf = (hallway, padLength) => ({
  hallwayWidthPx: hallway?.widthPx ?? null, hallwayCondition: hallway?.condition ?? null, padLengthPx: padLength?.lengthPx ?? null,
  condition: !hallway?.widthPx ? `no hallway width (tk.s6.hallway: ${hallway?.condition ?? 'absent'})` : !padLength?.lengthPx ? 'no pad length (tk.s6.padLength: the S3 family model)' : null
});
/** The segment of a (hole, basket) row, or null when the course has no W or L: { start, lengthPx, args }. */
function segmentOf(h, k, course) {
  if (course.condition) return null;
  const S = startOf(h, course.padLengthPx);
  return { start: S, ...segmentArgs(S, k.point, course.hallwayWidthPx) };
}
const startsOf = (cands, course) => (course.condition ? null : Object.fromEntries(cands.holes.map((h) => [h.id, startOf(h, course.padLengthPx)])));

const SEGMENT_COLUMNS = ['segmentLengthPx', 'edgeWidthPx', 'edgeCentreOffsetPx', 'edgeScoreLumPerPx', 'edgeScoreMarginToBestOtherBasketLumPerPx', 'edgeScoreRatioToBestOtherBasket', 'edgeScoreRatioToBestOtherHole'];
export function segmentFamily(cands, { hallway, padLength }, q) {
  const course = courseOf(hallway, padLength);
  const fam = familyOf('segment', cands, { ...course, startsPx: startsOf(cands, course), rule: 'fn.q.path.edgePair on stations 0.6 W .. |K - S| - 2 px, width within 1.5 px of W, centre within 1.5 px (s3first.py seg_fit)' }, SEGMENT_COLUMNS, (h, k) => {
    const out = { ...nullsOf(SEGMENT_COLUMNS), segmentCondition: course.condition };
    const s = segmentOf(h, k, course); if (!s) return out;
    out.segmentLengthPx = s.lengthPx;
    const e = q('fn.q.path.edgePair', s.args);
    if (e?.score != null) Object.assign(out, { edgeWidthPx: e.wPx, edgeCentreOffsetPx: e.cPx, edgeScoreLumPerPx: e.score }); else out.segmentCondition = e?.condition ?? 'no edge pair';
    return out;
  });
  // the competitors: the best score of the same hole to the other baskets, of the other holes to the same basket
  const byHole = new Map(), byBasket = new Map();
  for (const r of fam.rows) if (r.edgeScoreLumPerPx != null) {
    (byHole.get(r.hole) ?? byHole.set(r.hole, []).get(r.hole)).push(r); (byBasket.get(r.basket) ?? byBasket.set(r.basket, []).get(r.basket)).push(r);
  }
  const bestOther = (list, r) => list.filter((x) => x !== r).reduce((m, x) => Math.max(m, x.edgeScoreLumPerPx), -Infinity);
  for (const r of fam.rows) if (r.edgeScoreLumPerPx != null) {
    const ob = bestOther(byHole.get(r.hole), r), oh = bestOther(byBasket.get(r.basket), r);
    if (ob > -Infinity) { r.edgeScoreMarginToBestOtherBasketLumPerPx = r.edgeScoreLumPerPx - ob; r.edgeScoreRatioToBestOtherBasket = ob > 0 ? r.edgeScoreLumPerPx / ob : null; }
    if (oh > 0) r.edgeScoreRatioToBestOtherHole = r.edgeScoreLumPerPx / oh;
  }
  return fam;
}

const EDGE_COLUMNS = ['stationsCount', 'edgeVisibleStationsCount', 'edgePassFrac', 'edgeLongestGapPx', 'edgeMedianContrastLum'];
export function edgeFamily(cands, { hallway, padLength }, q) {
  const course = courseOf(hallway, padLength);
  return familyOf('edge', cands, { ...course, rule: 'fn.q.path.loss edge test (min-side contrast > tau = 8 lum) on the segment stations, step 1 px' }, EDGE_COLUMNS, (h, k) => {
    const out = { ...nullsOf(EDGE_COLUMNS), edgeCondition: course.condition };
    const s = segmentOf(h, k, course); if (!s) return out;
    const { tolPx, latLimPx, ...stations } = s.args;   // the edge pair's tolerances are not the loss query's
    const l = q('fn.q.path.loss', { ...stations, stepPx: 1, profile: null, threshold: null });
    out.stationsCount = l.stationsCount ?? 0; out.edgeCondition = l.condition ?? null;
    if (!l.condition) Object.assign(out, { edgeVisibleStationsCount: l.edge.visibleCount, edgePassFrac: l.edge.passFrac, edgeLongestGapPx: l.edge.longestGapPx, edgeMedianContrastLum: l.edge.medianContrastLum });
    return out;
  });
}

const OVERLAY_COLUMNS = ['overlayVisibleStationsCount', 'overlayMeanFrac', 'overlayMedianFrac', 'overlayFracStations', 'overlayLossFracAtHalfPathAlpha', 'overlayLongestGapPxAtHalfPathAlpha'];
/** The path class of the alpha profile as the rules need it (never the whole profile). */
export function alphaHeaderOf(profile) {
  const path = hasOverlay(profile, 'path') ? profile.overlays.path : null;
  return { hasPath: Boolean(path), pathAlphaFrac: path?.alpha ?? null, pathFitOn: path?.fitOn ?? null,
    pathStatus: profile?.overlays?.path?.status ?? profile?.status ?? 'absent', why: profile?.overlays?.path?.reason ?? profile?.reason ?? 'tk.s7.alphaProfile has no path class' };
}
export function overlayFamily(cands, { hallway, padLength, profile }, q) {
  const course = courseOf(hallway, padLength), alpha = alphaHeaderOf(profile);
  const reference = alpha.hasPath ? r3(OVERLAY_REFERENCE_OF_ALPHA * alpha.pathAlphaFrac) : null;
  const condition = course.condition ?? (alpha.hasPath ? null : 'no alpha profile');
  return familyOf('overlay', cands, { ...course, alpha, referenceFrac: reference, rule: `fn.q.path.loss overlay fraction of the fitted path colour (tk.s7.alphaProfile) on the segment stations; loss columns at ${OVERLAY_REFERENCE_OF_ALPHA} x the path alpha (a reference, not a decision)` }, OVERLAY_COLUMNS, (h, k) => {
    const out = { ...nullsOf(OVERLAY_COLUMNS), overlayCondition: condition };
    const s = condition ? null : segmentOf(h, k, course); if (!s) return out;
    const { tolPx, latLimPx, ...stations } = s.args;
    const l = q('fn.q.path.loss', { ...stations, stepPx: 1, profile: ALPHA_PROFILE_PART, threshold: null });
    out.overlayCondition = l.condition ?? null; if (l.condition) return out;
    const o = l.overlay, vec = l.stations.overlayFrac;
    Object.assign(out, { overlayVisibleStationsCount: o.visibleCount, overlayMeanFrac: o.meanOverlayFrac, overlayMedianFrac: o.medianOverlayFrac, overlayFracStations: vec });
    const ref = q('fn.q.path.overlayPass', { overlayFrac: vec, thresholdFrac: reference, stepPx: 1 });
    out.overlayLossFracAtHalfPathAlpha = ref.lossFrac; out.overlayLongestGapPxAtHalfPathAlpha = ref.longestGapPx;
    return out;
  });
}

// ------------------------------------------------------------------ the join

export function joinFeatures(cands, families) {
  const rows = cands.rows.map((r, i) => {
    const merged = { hole: r.hole, basket: r.basket };
    for (const f of FEATURE_FAMILIES) {
      const x = families[f].rows[i];
      if (x.hole !== r.hole || x.basket !== r.basket) throw new Error(`tk.s6.pairFeatures: ${f} row ${i} is (${x.hole}, ${x.basket}), the candidate is (${r.hole}, ${r.basket})`);   // an integrity check, not a data condition
      const { hole, basket, ...cols } = x; Object.assign(merged, cols);
    }
    return merged;
  });
  const columns = {}; for (const f of FEATURE_FAMILIES) for (const [c, unit] of Object.entries(families[f].columns)) columns[c] = { family: f, unit };
  const seg = families.segment.header, ov = families.overlay.header;
  return {
    schema: 'nctk-s6-pair-features@1',
    rule: 'one row per (hole, basket) candidate; raw features with units, no threshold, no verdict (the matching rules read this table and nothing else)',
    holes: cands.holes, baskets: cands.baskets, columns, rows,
    header: { course: { hallwayWidthPx: seg.hallwayWidthPx, hallwayCondition: seg.hallwayCondition, padLengthPx: seg.padLengthPx, condition: seg.condition, startsPx: seg.startsPx }, alpha: ov.alpha, overlayReferenceFrac: ov.referenceFrac },
    families: Object.fromEntries(FEATURE_FAMILIES.map((f) => [f, { part: featurePart(f), columns: Object.keys(families[f].columns) }])),
    emits: { rowsCount: rows.length, holesCount: cands.holes.length, basketsCount: cands.baskets.length, columnsCount: Object.keys(columns).length,
      segmentScoredCount: rows.filter((r) => r.edgeScoreLumPerPx != null).length, overlayMeasuredCount: rows.filter((r) => r.overlayMeanFrac != null).length }
  };
}

// ------------------------------------------------------------------ Calculations

const digestOf = (...fns) => sha256Hex(fns.map(String).join('\n'));
const segmentShared = [capOf, segmentArgs, startOf, courseOf, segmentOf, startsOf, familyOf, nullsOf, holeOf, basketOf];
const CODE = Object.freeze({
  candidates: digestOf(candidatesOf),
  geometry: digestOf(geometryFamily, familyOf, nullsOf, holeOf, basketOf, unitAxis),
  segment: digestOf(segmentFamily, ...segmentShared),
  edge: digestOf(edgeFamily, ...segmentShared),
  overlay: digestOf(overlayFamily, alphaHeaderOf, ...segmentShared),
  join: digestOf(joinFeatures)
});
const call = (io) => (fn, args) => io.call(fn, args).value;

export const S6_FEATURE_CALCULATIONS = Object.freeze([
  ['fn.tk.s6.pairCandidates', { inParts: ['tk.s6.holePairs', 'tk.s6.baskets', 'tk.s6.badgeCenters'], outParts: [CANDIDATES_PART], code: CODE.candidates,
    calculate: (io) => ({ [CANDIDATES_PART]: candidatesOf(io.in('tk.s6.holePairs'), io.in('tk.s6.baskets'), io.in('tk.s6.badgeCenters')) }) }],
  ['fn.tk.s6.feature.geometry', { inParts: [CANDIDATES_PART], outParts: [featurePart('geometry')], calls: ['fn.q.hole.straight3Point', 'fn.q.pair.residual'], code: CODE.geometry,
    calculate: (io) => ({ [featurePart('geometry')]: geometryFamily(io.in(CANDIDATES_PART), call(io)) }) }],
  ['fn.tk.s6.feature.segment', { inParts: [CANDIDATES_PART, RASTER, PATH_MASK_PART, HALLWAY_PART, PAD_LENGTH_PART], outParts: [featurePart('segment')], calls: ['fn.q.path.edgePair'], code: CODE.segment,
    calculate: (io) => ({ [featurePart('segment')]: segmentFamily(io.in(CANDIDATES_PART), { hallway: io.in(HALLWAY_PART), padLength: io.in(PAD_LENGTH_PART) }, call(io)) }) }],
  ['fn.tk.s6.feature.edge', { inParts: [CANDIDATES_PART, RASTER, PATH_MASK_PART, HALLWAY_PART, PAD_LENGTH_PART], outParts: [featurePart('edge')], calls: ['fn.q.path.loss'], code: CODE.edge,
    calculate: (io) => ({ [featurePart('edge')]: edgeFamily(io.in(CANDIDATES_PART), { hallway: io.in(HALLWAY_PART), padLength: io.in(PAD_LENGTH_PART) }, call(io)) }) }],
  ['fn.tk.s6.feature.overlay', { inParts: [CANDIDATES_PART, RASTER, PATH_MASK_PART, HALLWAY_PART, PAD_LENGTH_PART, ALPHA_PROFILE_PART], outParts: [featurePart('overlay')], calls: ['fn.q.path.loss', 'fn.q.path.overlayPass'], code: CODE.overlay,
    calculate: (io) => ({ [featurePart('overlay')]: overlayFamily(io.in(CANDIDATES_PART), { hallway: io.in(HALLWAY_PART), padLength: io.in(PAD_LENGTH_PART), profile: io.in(ALPHA_PROFILE_PART) }, call(io)) }) }],
  ['fn.tk.s6.pairFeatures', { inParts: [CANDIDATES_PART, ...FEATURE_FAMILIES.map(featurePart)], outParts: [PAIR_FEATURES_PART], code: CODE.join,
    calculate: (io) => ({ [PAIR_FEATURES_PART]: joinFeatures(io.in(CANDIDATES_PART), Object.fromEntries(FEATURE_FAMILIES.map((f) => [f, io.in(featurePart(f))]))) }) }]
]);

/** Register the scoring Calculations (and the S5 residual query they ask) on a store that already has fn.q.path.*, fn.q.hole.* and the S6 Parts. */
export function registerPairFeatures(store, calculations = S6_FEATURE_CALCULATIONS) {
  let has = false; try { has = store.has('fn.q.pair.residual'); } catch { has = false; }
  if (!has) registerQueries(store, PAIR_QUERIES, { note: 'tee-axis residual (ports/s5pair/residualQuery.mjs)' });
  for (const [fn, spec] of calculations) store.register(fn, spec);
}
