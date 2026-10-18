/**
 * fn.Hole.straight: S6 straight vs bent per tee-badge pair, as a ComparableForkJoin slot (browser-safe core; no node:*).
 *
 * DOCTRINE S6 (Sam): straight holes are the trivial case; objective path loss along tee to basket; learn the course-local
 * path transparency profile there; judged by the straight-hole residual (testimony: a hole with no corridorBends is
 * straight). This file holds what every implementation shares, behind the PxC boundary:
 *
 *   S6_CALCULATIONS   Parts derived from the S3 PxC board and the lane outputs (root inputs):
 *     tk.s6.badgeCenters  px.badges -> [{ label, center }]: the badge sprite's bbox centre (the point ports/s3assoc uses)
 *     tk.s6.baskets       px.baskets + tk.s6.basketRecovery -> [{ index, name, source, bbox, point }]: S2 baskets and the
 *                         S4 recovered basket boxes, each with its BasketPoint (ports/s3assoc/associate.mjs basketPoint)
 *     tk.s6.holePairs         tk.s6.association + tk.s6.s4Recovered + tk.s6.badgeCenters -> one pair per tee after S4: the S3
 *                         observed tees with the badge S3 association gave them, and the tees the S4 accepted variant
 *                         recovered, with the badge each was recovered for (forHole)
 *   S6_QUERIES        fn.q.hole.* (registerQueries: cached by arguments, profiled, { value, unit }):
 *     fn.q.hole.straight3 { pair }   Sam's 3-point test (tee centre, badge centre, a BasketPoint collinear), the math of
 *                                    ports/s3assoc/associate.mjs straight3Test, called, never rewritten
 *     fn.q.hole.pinned    { pair }   the pinned late S6 two-ray rows (ports/late, --until 6) of this pair
 *   fn.q.path.*       the S6 lane's measurement half (ports/s6straight/pathSpace.mjs + pathLoss.mjs, agent B; see NOTES.md)
 *
 * Coordinates: canonical (S0-cropped) px, pixel centres at integers. Every number carries its unit in its name.
 */
import { straight3Test, basketPoint, ASSOC_BOUNDS } from '../s3assoc/associate.mjs';
import { nameCandidates } from '../../fg/names.mjs';

export const HOLE_STRAIGHT_SLOT = Object.freeze({
  slot: 'fn.Hole.straight',
  part: 'px.holes.straight',
  materialize: 'fg.s6.holeStraight.materialize',
  testimony: 'fg.s6.holeStraight.testimony',
  teeMatchPx: 8,        // judging only: the one tee match rule (AGENTS.md)
  basketMatchPx: 12     // judging and pinned basket identity: the one basket match rule (AGENTS.md)
});
export const ACCEPTANCE = "UNKNOWN: acceptance is Sam's; agreement with his testimony (corridorBends) is evidence only";
export const VERDICTS = Object.freeze(['straight', 'bent', 'unknown']);
export const LANE_NOT_RUN = 'lane not run';

const r3 = (v) => Math.round(v * 1000) / 1000;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const bboxCenter = (b) => [b[0] + (b[2] - 1) / 2, b[1] + (b[3] - 1) / 2];

/** Pairs: observed (S3 association rows with a badge) then recovered (S4 accepted variant), ordered by hole then source. */
export function pairsOf(association, s4, badgeCenters) {
  const badgeAt = new Map(badgeCenters.map((b) => [String(b.label), b.center]));
  const observed = (association.rows ?? []).filter((r) => r.best).map((r) => ({
    hole: String(r.best.badge), source: 'S3 observed', teeName: r.candidate ?? r.tee,
    center: r.pose ? [r.pose.cx, r.pose.cy] : r.center, angleRad: r.pose ? r.pose.thDeg * Math.PI / 180 : null,
    from: `px.tees.association row ${r.tee} (best badge ${r.best.badge}, ${r.verdict})`
  }));
  const rec = s4.recovered ?? [];
  const recNames = nameCandidates('Tee', rec, (t) => t.center).map((n) => `S4 ${n}`);
  const recovered = rec.map((t, i) => ({
    hole: String(t.hole), source: `S4 recovered (${s4.accepted})`, teeName: recNames[i], center: t.center, angleRad: t.angleRad ?? null,
    from: `cmp.fn.Tee.recover accepted ${s4.accepted}: recovered for Badge ${t.hole}`
  }));
  return [...observed, ...recovered]
    .sort((a, b) => Number(a.hole) - Number(b.hole) || a.source.localeCompare(b.source))
    .map((p, i) => ({ id: `P${i}`, hole: p.hole, source: p.source, from: p.from,
      tee: { name: p.teeName, center: p.center, angleRad: p.angleRad },
      badge: { label: p.hole, center: badgeAt.get(p.hole) ?? null } }));
}

/** Baskets after S4: S2 baskets, then the S4 recovered basket boxes (basket-bridge), each with its BasketPoint. */
export function basketsOf(s2Baskets, recoveredBoxes) {
  const s2Names = nameCandidates('Basket', s2Baskets, (k) => basketPoint(k.bbox));
  const s4Names = nameCandidates('Basket', recoveredBoxes, (b) => basketPoint(b)).map((n) => `S4 ${n}`);
  return [
    ...s2Baskets.map((k, i) => ({ index: i, name: s2Names[i], source: 'S2', bbox: k.bbox, point: basketPoint(k.bbox) })),
    ...recoveredBoxes.map((b, i) => ({ index: s2Baskets.length + i, name: s4Names[i], source: 'S4 recovered', bbox: b, point: basketPoint(b) }))
  ];
}

export const S6_CALCULATIONS = Object.freeze([
  ['fn.tk.s6.badgeCenters', { inParts: ['px.badges'], outParts: ['tk.s6.badgeCenters'], calculate: (io) => ({
    'tk.s6.badgeCenters': io.in('px.badges').map((b) => ({ label: String(b.label), center: bboxCenter(b.bbox), rule: 'badge sprite bbox centre (ports/s3assoc)' })) }) }],
  ['fn.tk.s6.baskets', { inParts: ['px.baskets', 'tk.s6.basketRecovery'], outParts: ['tk.s6.baskets'], calculate: (io) => {
    const v = basketsOf(io.in('px.baskets'), io.in('tk.s6.basketRecovery').recoveredBoxes ?? []);
    return { 'tk.s6.baskets': v };
  } }],
  ['fn.tk.s6.holePairs', { inParts: ['tk.s6.association', 'tk.s6.s4Recovered', 'tk.s6.badgeCenters'], outParts: ['tk.s6.holePairs'], calculate: (io) => ({
    'tk.s6.holePairs': pairsOf(io.in('tk.s6.association'), io.in('tk.s6.s4Recovered'), io.in('tk.s6.badgeCenters')) }) }]
]);

/** The pinned late S6 two-ray rows of one pair: same badge, tee centre within the tee match rule. */
export function pinnedOf(late, pair, baskets, { teePx = HOLE_STRAIGHT_SLOT.teeMatchPx, basketPx = HOLE_STRAIGHT_SLOT.basketMatchPx } = {}) {
  if (late.absent) return { condition: `${LANE_NOT_RUN}: ${late.absent}` };
  const rows = late.rows.filter((r) => r.holeRead === pair.hole && dist(r.teeCenter, pair.tee.center) <= teePx);
  if (!rows.length) return { condition: `no pinned two-ray row for this pair: no ray of a late tee within ${teePx} px of ${pair.tee.name} hit Badge ${pair.hole}` , rows: 0 };
  const byPerp = (a, b) => Math.abs(a.topSignedPerpPx) - Math.abs(b.topSignedPerpPx);
  const candidates = rows.filter((r) => r.status === late.candidateStatus).sort(byPerp);
  const best = candidates[0] ?? rows.filter((r) => !r.reasons.includes('TOP_NOT_BEYOND_BADGE_PLATE')).sort(byPerp)[0] ?? rows.slice().sort(byPerp)[0];
  const top = late.templateTops[best.basketId] ?? null;
  const bp = top ? basketPoint(top.bbox) : null;
  const basket = bp ? baskets.map((k) => ({ k, e: dist(k.point, bp) })).filter((x) => x.e <= basketPx).sort((a, b) => a.e - b.e)[0] ?? null : null;
  return {
    rows: rows.length, candidates: candidates.length, row: best.id, status: best.status, reasons: best.reasons,
    topSignedPerpPx: r3(best.topSignedPerpPx), badgeSignedPerpPx: r3(best.badgeSignedPerpPx), teeErrorPx: r3(dist(best.teeCenter, pair.tee.center)),
    pinnedBasket: best.basketId, basketPoint: bp, basket: basket ? { index: basket.k.index, name: basket.k.name, errorPx: r3(basket.e) } : null
  };
}

/**
 * fn.q.hole.* : the questions an implementation asks. get resolves Parts on the store (lazy: produced on first need).
 * Answers are { value, unit }; registerQueries (fg/store.mjs) caches them by arguments and profiles each call.
 */
export function holeQueries(get) {
  return {
    'fn.q.hole.straight3': (_, { pair }) => {
      const p = get('tk.s6.holePairs')[pair], baskets = get('tk.s6.baskets');
      if (!p.badge.center) return { value: { condition: `Badge ${p.hole} has no S1 badge` }, unit: 'px' };
      const r = straight3Test(p.tee.center, p.badge.center, baskets.map((k) => ({ index: k.index, point: k.point })), ASSOC_BOUNDS);
      return { value: r ? { ...r, basketName: baskets[r.basket].name, tlsBoundPx: ASSOC_BOUNDS.straight3TlsPx } : { condition: 'no BasketPoint beyond the badge' },
        unit: 'px (latPx, alongPx, tlsMaxPx: TLS max residual of tee centre, badge centre, BasketPoint)' };
    },
    'fn.q.hole.pinned': (_, { pair }) => ({ value: pinnedOf(get('tk.s6.lateS6'), get('tk.s6.holePairs')[pair], get('tk.s6.baskets')),
      unit: 'px (topSignedPerpPx: basket template top off the tee ray; teeErrorPx: late tee to pair tee)' })
  };
}
export const HOLE_QUERY_NAMES = Object.freeze(['fn.q.hole.straight3', 'fn.q.hole.pinned']);

/** A verdict row, the one shape every implementation writes. */
export function verdictRow(pair, verdict, { basket = null, evidence = {}, condition = null } = {}) {
  return { pair: pair.id, hole: pair.hole, source: pair.source, tee: { name: pair.tee.name, center: pair.tee.center }, badge: pair.badge,
    verdict, basket: basket ? { index: basket.index, name: basket.name, source: basket.source, point: basket.point } : null, evidence, condition };
}

/** Totals of a verdict list (deterministic, unitful by name). */
export const verdictCounts = (rows) => ({ pairs: rows.length, straight: rows.filter((r) => r.verdict === 'straight').length,
  bent: rows.filter((r) => r.verdict === 'bent').length, unknown: rows.filter((r) => r.verdict === 'unknown').length });
