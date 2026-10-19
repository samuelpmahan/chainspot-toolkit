/**
 * The S7 judge (browser-safe), one rule used by the testimony guarantee, the comparator and ports/judge (S7bends).
 *
 * Sam's S7 pass condition (docs/evidence/s7main/README.md): the trace ends at the hole's basket (its end within the
 * basket match rule, 12 px, of Sam's basket point) and its centreline never leaves the hallway: the largest distance
 * from Sam's corridor polyline tee -> bends -> basket is at most W / 2. Bend offsets are REPORTED, never gated:
 *   bendsHit     Sam's bends with one of ours within half his corridor width (closest pairs first, one to one)
 *   bendsMissed  Sam's bends with none of ours there
 *   extraBends   our bends matching none of Sam's
 * Testimony is impeachable; this is agreement, never acceptance. A hole without bend testimony (old schema) is unjudged.
 */
import { judgeTrace } from './hallway.mjs';

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** One-to-one bend matching within radiusPx, closest pairs first. */
export function matchBends(sam, ours, radiusPx) {
  const pairs = [];
  sam.forEach((s, i) => ours.forEach((o, j) => { const d = dist(s, o); if (d <= radiusPx) pairs.push([d, i, j]); }));
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const ui = new Set(), uj = new Set(), hits = [];
  for (const [d, i, j] of pairs) if (!ui.has(i) && !uj.has(j)) { ui.add(i); uj.add(j); hits.push({ sam: i, ours: j, offPx: r1(d) }); }
  return { hits, missed: sam.map((_, i) => i).filter((i) => !ui.has(i)), extra: ours.map((_, j) => j).filter((j) => !uj.has(j)) };
}

/**
 * traces: px.holes.trace traces; holePaths: { holes: [{ hole, tee, basket, bends, corridorWidthPx }] } (canonical px);
 * widthPx: the course hallway width W (px, LOCAL).
 */
export function judgeHoleTraces(traces, holePaths, { widthPx, basketMatchPx = 12 }) {
  const rows = [];
  for (const p of holePaths.holes ?? []) {
    const t = traces.find((x) => String(x.hole) === String(p.hole));
    if (!p.bends && p.centre) {   // old schema: the route is judged against the corridor centreline; bends are unknown
      const sam = { tee: p.centre[0], basket: p.centre.at(-1), bends: p.centre.slice(1, -1) };
      if (!t || !t.path?.length || t.status !== 'reached') { rows.push({ hole: String(p.hole), judged: true, status: t?.status ?? 'missing', ok: false, why: `no BasketPoint reached (${t?.status ?? 'no trace'})`, reachedBasket: false, endErrPx: null, maxOffCentrelinePx: null, bendsSam: null, bendsOurs: (t?.bends ?? []).length, bendsJudged: false }); continue; }
      const j = judgeTrace({ verts: t.path, endPoint: t.end.point }, sam, widthPx, basketMatchPx);
      rows.push({ hole: String(p.hole), judged: true, status: t.status, ok: j.ok, why: j.ok ? null : j.endErrPx >= basketMatchPx ? `ends ${j.endErrPx} px from Sam's basket` : `leaves the hallway: ${j.maxDevPx} px from Sam's corridor centreline (W / 2 = ${j.halfWidthPx} px)`,
        reachedBasket: j.endErrPx < basketMatchPx, endErrPx: j.endErrPx, maxOffCentrelinePx: j.maxDevPx, halfWidthPx: j.halfWidthPx, bendsSam: null, bendsOurs: t.bends.length, bendsJudged: false,
        note: 'old annotation schema: route judged on the corridor centreline (edges oriented by geometry); bends not judged' });
      continue;
    }
    if (!p.bends) { rows.push({ hole: String(p.hole), judged: false, why: 'no bend testimony for this hole (old annotation schema)' }); continue; }
    const radius = (p.corridorWidthPx ?? widthPx) / 2;
    if (!t || !t.path?.length || t.status !== 'reached') {
      const m = matchBends(p.bends, t?.bends ?? [], radius);
      rows.push({ hole: String(p.hole), judged: true, status: t?.status ?? 'missing', ok: false, why: t?.status === 'reached' ? 'no path' : `no BasketPoint reached (${t?.status ?? 'no trace'})`,
        reachedBasket: false, endErrPx: null, maxOffCentrelinePx: null, bendsSam: p.bends.length, bendsOurs: (t?.bends ?? []).length,
        bendsHit: m.hits.length, bendsMissed: m.missed.length, extraBends: m.extra.length, bendMatchPx: r1(radius), bendOffPx: m.hits.map((h) => h.offPx) });
      continue;
    }
    const j = judgeTrace({ verts: t.path, endPoint: t.end.point }, p, widthPx, basketMatchPx);
    const m = matchBends(p.bends, t.bends, radius);
    rows.push({ hole: String(p.hole), judged: true, status: t.status, ok: j.ok, why: j.ok ? null : j.endErrPx >= basketMatchPx ? `ends ${j.endErrPx} px from Sam's basket` : `leaves the hallway: ${j.maxDevPx} px from Sam's corridor (W / 2 = ${j.halfWidthPx} px)`,
      reachedBasket: j.endErrPx < basketMatchPx, endErrPx: j.endErrPx, maxOffCentrelinePx: j.maxDevPx, halfWidthPx: j.halfWidthPx,
      bendsSam: p.bends.length, bendsOurs: t.bends.length, bendsHit: m.hits.length, bendsMissed: m.missed.length, extraBends: m.extra.length, bendMatchPx: r1(radius),
      bendOffPx: m.hits.map((h) => h.offPx), nearestBendOffPx: j.bendOffPx });
  }
  const J = rows.filter((r) => r.judged), sum = (k) => J.reduce((s, r) => s + (r[k] ?? 0), 0);
  return { rows, totals: { judged: J.length, agree: J.filter((r) => r.ok).length, reachedBasket: J.filter((r) => r.reachedBasket).length,
    bendsSam: sum('bendsSam'), bendsHit: sum('bendsHit'), bendsMissed: sum('bendsMissed'), extraBends: sum('extraBends'), notAgreeing: J.filter((r) => !r.ok).map((r) => r.hole) },
    rule: `ends within ${basketMatchPx} px of Sam's basket and stays within W / 2 = ${r1(widthPx / 2)} px of his corridor; a bend hits within half his corridor width` };
}
