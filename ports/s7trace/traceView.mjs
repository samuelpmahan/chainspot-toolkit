/**
 * tk.s7.routeMatchView (browser-safe): the routeMatch traces beside Sam's testimony, as one value the default render
 * (fg/s7trace/traceViewRender.mjs) draws over the course. Per hole: the route, its bends BEFORE the bend placement (the matching
 * rule's) and AFTER it, Sam's corridor, and the agreement.
 *
 * Agreement (judging only; testimony is impeachable, so this is agreement with Sam's marks, never acceptance):
 *   tee      the hole's tee centre within teeMatchPx (8 px) of Sam's tee mark;
 *   basket   the route ends within basketMatchPx (12 px) of Sam's basket mark;
 *   corridor the route stays within W / 2 of Sam's corridor (tee -> bends -> basket).
 * A hole whose annotation has no corridor at all is not judged. The old annotation schema (alex) has corridors but no bend
 * points: its corridor is the midline of the left / right polylines (ports/judge/testimony.mjs corridorOf), judged the
 * same way, and its bend offsets are not reported (there is no bend point to measure against).
 */
import { judgeTrace } from './hallway.mjs';
import { matchBends } from './judgeBends.mjs';
import { MATCH } from '../s7route/match.mjs';

import { TRACE_VIEW_SCHEMA } from '../../fg/s7trace/traceViewRender.mjs';
export { TRACE_VIEW_SCHEMA };
export const TRACE_VIEW = Object.freeze({ teeMatchPx: 8, basketMatchPx: 12 });
/**
 * Confidence of a route with no testimony to agree with (northpark): confirmed = the sensor reads >= MATCH.tau (0.75) on
 * >= MATCH.minStations (20) stations; unconfirmed = a reading below that; noReading = no route or no visible station.
 */
export const confidenceOf = (verts, sensor, stations) => (!verts?.length || !(stations > 0) ? 'noReading' : sensor >= MATCH.tau && stations >= MATCH.minStations ? 'confirmed' : 'unconfirmed');

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Sam's bend -> the nearest of ours (px); null when we have no bend. The e09 / E13 offset statistic: a missed bend counts at its nearest. */
const offsetsTo = (sam, ours) => sam.map((q) => (ours.length ? Math.min(...ours.map((v) => dist(v, q))) : null));

export function routeMatchViewOf({ solve, holesPart, holePaths, widthPx }) {
  const rows = [], offAfter = [], offBefore = [];
  let hitsAfter = 0, hitsBefore = 0, samBends = 0;
  for (const h of holesPart.holes) {
    const r = solve.holes?.[h.hole] ?? solve.holes?.[Number(h.hole)] ?? null, verts = r?.verts ?? [];
    const asg = (solve.assignment ?? []).find((a) => String(a.hole) === String(h.hole)) ?? null;
    const after = verts.slice(1, -1), before = r?.bendsRefined?.before ?? after;
    const p = (holePaths.holes ?? []).find((x) => String(x.hole) === String(h.hole)) ?? null;
    const corridorBends = p ? (p.bends ?? p.centre?.slice(1, -1) ?? null) : null;   // old schema: the corridor's midpoints (samples, not bends)
    const row = { hole: String(h.hole), path: verts, after, before, placementTaken: r?.bendsRefined?.taken ?? null, end: verts.length ? verts.at(-1) : null,
      teeCenter: h.tee?.teeCenter ?? null, marginLum: r1(r?.pair?.marginLum ?? null), sensor: asg ? Math.round(asg.sensor * 100) / 100 : null, stations: asg?.stations ?? null,
      confidence: confidenceOf(verts, asg?.sensor, asg?.stations), samTee: p?.tee ?? null, samBasket: p?.basket ?? null,
      samCentre: corridorBends ? [p.tee, ...corridorBends, p.basket] : null, bendsKnown: Boolean(p?.bends), judged: false, agree: null };
    if (p && corridorBends && verts.length) {
      const j = judgeTrace({ verts, endPoint: verts.at(-1) }, { tee: p.tee, basket: p.basket, bends: corridorBends }, widthPx, TRACE_VIEW.basketMatchPx);
      row.teeErrPx = row.teeCenter ? r1(dist(row.teeCenter, p.tee)) : null;
      row.teeOk = row.teeErrPx != null && row.teeErrPx <= TRACE_VIEW.teeMatchPx;
      row.endErrPx = j.endErrPx; row.maxOffCentrelinePx = j.maxDevPx; row.corridorOk = j.maxDevPx <= widthPx / 2; row.basketOk = j.endErrPx < TRACE_VIEW.basketMatchPx;
      row.judged = true; row.agree = Boolean(row.teeOk && row.basketOk && row.corridorOk);
      if (p.bends) {
        const a = offsetsTo(p.bends, after), b = offsetsTo(p.bends, before);
        row.bendOffAfterPx = a.map(r1); row.bendOffBeforePx = b.map(r1);
        offAfter.push(...a.filter((v) => v != null)); offBefore.push(...b.filter((v) => v != null));
        hitsAfter += matchBends(p.bends, after, widthPx / 2).hits.length; hitsBefore += matchBends(p.bends, before, widthPx / 2).hits.length; samBends += p.bends.length;
      }
    } else if (p && corridorBends && !verts.length) { row.judged = true; row.agree = false; row.teeOk = null; row.why = 'no route'; }
    rows.push(row);
  }
  const J = rows.filter((x) => x.judged);
  return { schema: TRACE_VIEW_SCHEMA, variant: 'routeMatch', widthPx, teeMatchPx: TRACE_VIEW.teeMatchPx, basketMatchPx: TRACE_VIEW.basketMatchPx, source: holePaths.path ?? null, rows,
    totals: { holes: rows.length, judged: J.length, agree: J.filter((x) => x.agree).length, teeOk: J.filter((x) => x.teeOk).length, bendsSam: samBends, bendsHitBefore: hitsBefore, bendsHitAfter: hitsAfter,
      bendOffsetMedianBeforePx: r1(median(offBefore)), bendOffsetMedianAfterPx: r1(median(offAfter)), bendOffsetMaxBeforePx: r1(offBefore.length ? Math.max(...offBefore) : null), bendOffsetMaxAfterPx: r1(offAfter.length ? Math.max(...offAfter) : null),
      confirmed: rows.filter((x) => x.confidence === 'confirmed').length, unconfirmed: rows.filter((x) => x.confidence === 'unconfirmed').length, noReading: rows.filter((x) => x.confidence === 'noReading').length,
      bendPointsKnown: rows.filter((x) => x.bendsKnown).length },
    sensorTau: MATCH.tau, sensorMinStations: MATCH.minStations, sensorRule: `confirmed = sensor >= ${MATCH.tau} on >= ${MATCH.minStations} stations`,
    units: 'px (canonical frame): path, bends, tee, basket; offsets = Sam bend to our nearest bend; widthPx = the course hallway width W (LOCAL)',
    rule: `agree = tee within ${TRACE_VIEW.teeMatchPx} px of Sam's tee, route ends within ${TRACE_VIEW.basketMatchPx} px of his basket, route within W / 2 = ${r1(widthPx / 2)} px of his corridor; testimony is impeachable: agreement, never acceptance` };
}
