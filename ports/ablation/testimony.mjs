/**
 * Judge one ablation row's Parts against Sam's annotation testimony
 * (testimony/<specimen>/*.annotation.json; source-image frame). Node-free.
 * Agreement is evidence, never acceptance: acceptance stays Sam's.
 *
 *   S3 px.tees      precision/recall: a tee agrees when one of Sam's tee
 *                   points lies in its frame bbox padded by 2 px (the S3
 *                   fork-join judge, fg/s3/teeFamily.mjs judgeMembers)
 *   S4 axes         a tee axis is ATTRIBUTED to hole h when Sam's tee point
 *                   for h lies in the axis bbox padded by teePadPx, else
 *                   when it is the nearest point within teeRadiusPx
 *   S5 selected     Sam: "hole n's tee pairs with badge n". A selected pair
 *                   agrees when its tee is attributed to hole == its badge
 *                   label; wrong-hole / tee-unattributed otherwise
 *   S7 traces       Sam's corridor for hole n is the polyline tee -> bends
 *                   -> basket with width corridorWidthPx (a human corridor,
 *                   treated as tolerance: ribbon half-width = width / 2).
 *                   Per trace from badge n: the fraction of its walked
 *                   vertices inside the ribbon, the endpoint's distance to
 *                   Sam's basket n, and inRibbon = every vertex inside;
 *                   reachedBasket = endpoint within the half-width of
 *                   Sam's basket point; progress = arc length of the
 *                   endpoint's projection onto Sam's corridor / its length
 *   tee error       for every attributed axis / selected pair, the distance
 *                   (px) from the tee center to Sam's tee point: the
 *                   geometric magnitude, not just agree/disagree
 */
import { judgeMembers, testimonyTeePoints } from '../../fg/s3/teeFamily.mjs';
import { pointToPolyline, pointToSegment } from '../../contracts/s7.trace@1.mjs';

export const JUDGE = Object.freeze({ teePadPx: 4, teeRadiusPx: 16 });
const r4 = (v) => (v === null ? null : Math.round(v * 1e4) / 1e4);
const inside = ([x, y], [bx, by, bw, bh], pad) => x >= bx - pad && x <= bx + bw + pad && y >= by - pad && y <= by + bh + pad;

/** Arc length along `path` of the point on it closest to p. */
export function arcAt(p, path) {
  let best = Infinity, arc = 0, at = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i];
    const len = Math.hypot(bx - ax, by - ay);
    const d = pointToSegment(p, path[i - 1], path[i]);
    if (d < best) {
      best = d;
      const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / (len * len))) : 0;
      at = arc + t * len;
    }
    arc += len;
  }
  return { at, length: arc };
}
const stats = (xs) => xs.length ? { mean: r4(xs.reduce((n, x) => n + x, 0) / xs.length), max: r4(Math.max(...xs)) } : null;
const teeError = (center, holeNumber, holes) => {
  const h = holes.find((x) => x.number === holeNumber);
  return h?.tee ? Math.hypot(center[0] - h.tee.xPx, center[1] - h.tee.yPx) : null;
};

export function attributeTee(center, bbox, holes) {
  const withTee = holes.filter((h) => h.tee);
  const boxed = bbox ? withTee.filter((h) => inside([h.tee.xPx, h.tee.yPx], bbox, JUDGE.teePadPx)) : [];
  if (boxed.length === 1) return { hole: boxed[0].number, how: 'bbox' };
  let best = null;
  for (const h of withTee) {
    const d = Math.hypot(h.tee.xPx - center[0], h.tee.yPx - center[1]);
    if (d <= JUDGE.teeRadiusPx && (!best || d < best.d)) best = { hole: h.number, d };
  }
  return best ? { hole: best.hole, how: 'nearest', distancePx: r4(best.d) } : { hole: null, how: 'none' };
}

export function judgeRow(parts, annotation, { cropTopPx }) {
  const holes = annotation.holes ?? [];
  const out = {};
  if (parts['S3:px.tees']) {
    const j = judgeMembers(parts['S3:px.tees'], testimonyTeePoints(annotation, { upperRowsRemoved: cropTopPx }));
    out.S3 = { ...j.totals, impostors: j.verdicts.filter((v) => v.verdict === 'disagrees').map((v) => `tee@${v.center.join(',')}`), uncoveredHoles: j.uncovered };
  }
  // Axis attribution by geometry (bbox + center), shared by S4 and S5.
  const axisHole = (center, bbox) => attributeTee(center, bbox, holes);
  if (parts['S4:px.s5.axes']) {
    const rows = parts['S4:px.s5.axes'].map((a) => ({ kind: a.kind, center: a.center, ...axisHole(a.center, a.bbox) }));
    const covered = new Set(rows.map((r) => r.hole).filter((h) => h !== null));
    const errs = rows.filter((r) => r.hole !== null).map((r) => teeError(r.center, r.hole, holes));
    out.S4 = { axes: rows.length, attributed: rows.filter((r) => r.hole !== null).length, unattributed: rows.filter((r) => r.hole === null).length,
      holesCovered: covered.size, holesUncovered: holes.map((h) => h.number).filter((n) => !covered.has(n)), teeErrorPx: stats(errs) };
  }
  const axes = parts['S4:px.s5.axes'] ?? [];
  const axisFor = (teeCenter) => axes.find((a) => Math.hypot(a.center[0] - teeCenter[0], a.center[1] - teeCenter[1]) < 1e-6) ?? null;
  if (parts['S5:px.s5.globalAssignment']) {
    const pairs = parts['S5:px.s5.globalAssignment'].map((p) => {
      const axis = axisFor(p.teeCenter);
      const a = axisHole(p.teeCenter, axis?.bbox ?? null);
      const verdict = a.hole === null ? 'tee-unattributed' : String(a.hole) === String(p.badgeLabel) ? 'agrees' : 'wrong-hole';
      return { badge: p.badgeLabel, teeHole: a.hole, verdict, teeErrorPx: verdict === 'agrees' ? r4(teeError(p.teeCenter, a.hole, holes)) : null };
    });
    out.S5 = { selected: pairs.length, agrees: pairs.filter((p) => p.verdict === 'agrees').length,
      wrongHole: pairs.filter((p) => p.verdict === 'wrong-hole').map((p) => `B${p.badge}<-H${p.teeHole}`),
      teeUnattributed: pairs.filter((p) => p.verdict === 'tee-unattributed').map((p) => `B${p.badge}`),
      teeErrorPx: stats(pairs.filter((p) => p.teeErrorPx !== null).map((p) => p.teeErrorPx)),
      teeErrorPxByBadge: Object.fromEntries(pairs.filter((p) => p.teeErrorPx !== null).sort((a, b) => Number(a.badge) - Number(b.badge)).map((p) => [p.badge, p.teeErrorPx])) };
  }
  if (parts['S7:s7.traces']) {
    const traces = parts['S7:s7.traces'].map((t) => {
      const h = holes.find((x) => String(x.number) === String(t.badgeLabel));
      if (!h || !t.path.length) return { badge: t.badgeLabel, judged: false };
      const corridor = [[h.tee.xPx, h.tee.yPx], ...(h.corridorBends ?? []).map((b) => [b.xPx, b.yPx]), [h.basket.xPx, h.basket.yPx]];
      const half = (h.corridorWidthPx ?? 40) / 2;
      const inRib = t.path.filter((p) => pointToPolyline(p, corridor) <= half).length;
      const end = t.path.at(-1);
      const endToBasketPx = Math.hypot(end[0] - h.basket.xPx, end[1] - h.basket.yPx);
      const { at: arc, length } = arcAt(end, corridor);
      return { badge: t.badgeLabel, judged: true, ribbonFraction: r4(inRib / t.path.length), inRibbon: inRib === t.path.length,
        endToBasketPx: r4(endToBasketPx), reachedBasket: endToBasketPx <= half, progress: r4(length ? arc / length : 0), outcome: t.outcome };
    });
    const judged = traces.filter((t) => t.judged);
    out.S7 = { traces: traces.length, judged: judged.length, inRibbon: judged.filter((t) => t.inRibbon).length,
      reachedSamBasket: judged.filter((t) => t.reachedBasket).length,
      meanRibbonFraction: judged.length ? r4(judged.reduce((n, t) => n + t.ribbonFraction, 0) / judged.length) : null,
      meanProgress: judged.length ? r4(judged.reduce((n, t) => n + t.progress, 0) / judged.length) : null,
      leftRibbon: judged.filter((t) => !t.inRibbon).map((t) => `B${t.badge}:${t.ribbonFraction}`),
      progressByBadge: Object.fromEntries(judged.sort((a, b) => Number(a.badge) - Number(b.badge)).map((t) => [t.badge, t.progress])) };
  }
  return out;
}
