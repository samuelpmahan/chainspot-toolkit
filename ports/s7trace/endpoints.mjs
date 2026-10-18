/**
 * fn.Hole.trace / endpoints (Sam, 2026-10-18: "the ABFeature era paired all badge -> basket endpoints and scored them
 * and THAT'S how it was able to assume known endpoints + work backwards"). Browser-safe math over the hallway scene.
 *
 *   1. every (badge, basket candidate) pair is scored by the ribbon evidence between them: the edge-contrast pass
 *      fraction of the straight segment badge -> BasketPoint, and, where a hole's forward route (the s3first leg
 *      follower from the badge along the tee -> badge direction) ends on a BasketPoint, that route's pass fraction
 *   2. one-to-one assignment by the provider's exact matcher (maximumWeightTeeBadgeMatching: real-edge cardinality
 *      first, then total score), the matcher passed in as an argument (the node runner loads the pinned provider)
 *   3. each assigned hole is traced BACKWARDS from its BasketPoint toward its badge with both endpoints known (the
 *      follower with the badge as its only target), then the tee -> badge leg (straight hallway) is put in front and
 *      the inner vertices refined by render-and-score
 * A bent pair is scored as one bend on the hole's own ray (the badge precedes the first bend): V on the ray, legs badge -> V
 * and V -> BasketPoint, over both legs' stations. Evidence thresholds are the follower's own: a leg is a ribbon at pass fraction 0.6 (find_bend), 0.75 to close on an
 * endpoint (close_on_bp). Every number is px or a fraction of stations, canonical frame.
 */
import { arange, stationContrast, trace, refineVertices, ribbonThroughBadge, TAU, FRONT, unit, round } from './hallway.mjs';

const deg = (r) => r * 180 / Math.PI, rad = (d) => d * Math.PI / 180;
const pyMod = (a, n) => a - n * Math.floor(a / n);
const median = (xs) => { const s = Float64Array.from(xs).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const pass = (S, O, phi, ts, W) => {
  const { cl, cr, okl, okr } = stationContrast(S, O, phi, ts, W), m = [];
  for (let k = 0; k < ts.length; k++) if (okl[k] && okr[k]) m.push(Math.min(cl[k], cr[k]));
  return m;
};
export const ENDPOINT_RULES = Object.freeze({ ribbonPass: 0.6, closePass: 0.75, maxLegW: 15, minStations: 12, scanStations: 25, startHeadings: 4, headingSeparationDeg: 10, minTurnDeg: 4 });

/** The forward headings out of a badge: the tee -> badge direction when the hole has a tee, else both ways along the best ribbon lines through it. */
function forwardHeadings(S, h, W) {
  if (h.tee) return [{ phi: Math.atan2(h.tee.u[1], h.tee.u[0]), from: 'tee -> badge direction (straight hallway)' }];
  const lines = [];
  for (const [, psi] of ribbonThroughBadge(S, h.c, h.half, W)) { if (lines.every((q) => Math.abs(pyMod(psi - q + 90, 180) - 90) >= 4)) lines.push(psi); if (lines.length >= 2) break; }
  return lines.flatMap((psi) => [0, Math.PI].map((s) => ({ phi: rad(psi) + s, from: `ribbon line through the badge at ${round(pyMod(psi, 180), 1)} deg` })));
}

/** Step 1: candidate (badge, basket) pairs with their ribbon evidence. holes: [{ n, c, half, tee: { teeCenter, u } | null }]. */
export function scorePairs(S, holes, W, { tees = [] } = {}) {
  const cands = [], routes = {};
  for (const h of holes) {
    const fw = forwardHeadings(S, h, W);
    S.bp.forEach((b, k) => {
      const d = [b[0] - h.c[0], b[1] - h.c[1]], Lg = Math.hypot(d[0], d[1]);
      if (Lg < 1.2 * W) return;
      const psi = Math.atan2(d[1], d[0]);
      if (h.tee && Math.cos(psi - fw[0].phi) <= 0) return;   // never back toward the tee
      const m = pass(S, h.c, psi, arange(h.half + 2, Lg - 0.5 * W, 1.0), W);
      if (m.length < ENDPOINT_RULES.minStations) return;
      const pf = m.filter((x) => x > TAU).length / m.length;
      if (pf >= ENDPOINT_RULES.ribbonPass) cands.push({ n: h.n, k, score: pf, how: 'straight segment badge -> BasketPoint', stations: m.length });
    });
    // one bend on the hole's own ray: the tee -> badge leg is straight hallway and the badge precedes the first bend, so a
    // bent hole's first vertex V lies on the ray out of the badge; score badge -> V -> BasketPoint over both legs' stations
    for (const f of h.tee ? fw : []) {
      const u = [Math.cos(f.phi), Math.sin(f.phi)], t0 = h.half + 2;
      const reachT = Math.max(...S.bp.map((b) => (b[0] - h.c[0]) * u[0] + (b[1] - h.c[1]) * u[1])) + 2 * W;
      const ts1 = arange(t0, Math.max(t0 + 1, Math.min(reachT, 1500)), 1.0), st = stationContrast(S, h.c, f.phi, ts1, W);
      const n1 = new Int32Array(ts1.length + 1), p1 = new Int32Array(ts1.length + 1);
      for (let i = 0; i < ts1.length; i++) { const ok = st.okl[i] && st.okr[i]; n1[i + 1] = n1[i] + (ok ? 1 : 0); p1[i + 1] = p1[i] + (ok && Math.min(st.cl[i], st.cr[i]) > TAU ? 1 : 0); }
      S.bp.forEach((b, k) => {
        let best = null;
        for (const tv of arange(Math.max(W * 0.5, t0), ts1[ts1.length - 1] ?? t0, 2.0)) {
          const V = [h.c[0] + u[0] * tv, h.c[1] + u[1] * tv], d = [b[0] - V[0], b[1] - V[1]], Lg = Math.hypot(d[0], d[1]);
          if (Lg < 0.5 * W || Lg > ENDPOINT_RULES.maxLegW * W) continue;
          const psi = Math.atan2(d[1], d[0]), turn = Math.abs(pyMod(deg(psi - f.phi) + 180, 360) - 180);
          if (turn < ENDPOINT_RULES.minTurnDeg || turn > 150) continue;
          const i1 = Math.max(0, Math.min(ts1.length, Math.floor(tv - 0.5 * W - t0) + 1)), a1 = n1[i1], b1 = p1[i1];
          if (a1 >= ENDPOINT_RULES.minStations && b1 / a1 < ENDPOINT_RULES.ribbonPass) continue;   // the first leg must be ribbon
          // a last leg shorter than 1.2 W lies in the basket's own masked sprite and rings: only the first leg can testify
          const m2 = Lg < 1.2 * W ? [] : pass(S, V, psi, arange(W * 0.75, Lg - W * 0.5, 1.0), W);
          if (Lg >= 1.2 * W && m2.length < ENDPOINT_RULES.minStations) continue;
          if (Lg < 1.2 * W && a1 < ENDPOINT_RULES.minStations) continue;
          const pf = (b1 + m2.filter((x) => x > TAU).length) / (a1 + m2.length);
          if (best === null || pf > best.score) best = { score: pf, V, turnDeg: turn };
        }
        if (best && best.score >= ENDPOINT_RULES.closePass) cands.push({ n: h.n, k, score: best.score, how: `one bend on the hole's ray (${round(best.turnDeg, 1)} deg)`, verts: [h.c, best.V, b].map((v) => v.map((x) => round(x, 2))) });
      });
    }
    routes[h.n] = fw.map((f) => {
      const r = trace(S, h.c, f.phi, W, { selfC: h.tee ? h.tee.teeCenter : null, tees });
      const pf = r.legs.length ? r.legs.reduce((s, l) => s + l.passFrac, 0) / r.legs.length : 0;
      if (r.end !== null) cands.push({ n: h.n, k: r.end, score: pf, how: `forward route from the badge (${f.from}), ${r.verts.length - 2} bend(s)` });
      return { from: f.from, end: r.end, passFrac: round(pf, 3), verts: r.verts.map((v) => v.map((x) => round(x, 2))) };
    });
  }
  // the best evidence per pair
  const best = new Map();
  for (const c of cands) { const key = `${c.n} ${c.k}`; if (!best.has(key) || c.score > best.get(key).score) best.set(key, c); }
  return { pairs: [...best.values()].sort((a, b) => a.n - b.n || a.k - b.k), routes };
}

/** Step 2: one-to-one by the exact matcher (cardinality first, then total score). */
export function assign(pairs, holes, nBaskets, matcher) {
  const m = matcher(pairs.map((p) => ({ teeId: `BP${p.k}`, badgeId: `Badge ${p.n}`, score: p.score })), {
    badges: holes.map((h, i) => ({ detId: `Badge ${h.n}`, label: String(h.n), cxPx: h.c[0], cyPx: h.c[1], order: i })),
    tees: Array.from({ length: nBaskets }, (_, k) => ({ detId: `BP${k}`, order: k }))
  });
  return { locks: m.locks.map((l) => ({ n: Number(l.badgeId.slice(6)), k: Number(l.teeId.slice(2)), score: l.score, runnerUpMargin: l.runnerUpMargin })),
    unmatchedBadges: m.unmatchedBadgeIds, unusedBaskets: m.unusedTeeIds };
}

/** Step 3: from BasketPoint k back to badge centre c (the follower with the badge as its only endpoint). */
export function traceBack(S, k, c, W) {
  const B = S.bp[k], ts = arange(W * 0.75, W * 0.75 + 70, 1.0), scan = [];
  for (const d of arange(0, 360, 2.0)) {
    const m = pass(S, B, rad(d), ts, W);
    if (m.length < ENDPOINT_RULES.scanStations) continue;
    scan.push([m.filter((x) => x > TAU).length / m.length + 0.01 * median(m), d]);
  }
  scan.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const heads = [];
  for (const [sc, d] of scan) { if (heads.every((q) => Math.abs(pyMod(d - q[1] + 180, 360) - 180) >= ENDPOINT_RULES.headingSeparationDeg)) heads.push([sc, d]); if (heads.length >= ENDPOINT_RULES.startHeadings) break; }
  const target = { ...S, bp: [c] }, tried = [];
  for (const [sc, d] of heads) {
    const r = trace(target, B, rad(d), W);
    tried.push({ headingDeg: d, score: round(sc, 3), reachedBadge: r.end === 0, legs: r.legs.length });
    if (r.end === 0) return { verts: r.verts.slice().reverse(), legs: r.legs, tried };
  }
  return { verts: null, tried };
}

/** The whole endpoints solve. holes: [{ n, c, half, tee }]; matcher: the provider's maximumWeightTeeBadgeMatching. */
export function solveEndpoints(S, holes, W, { tees = [], matcher }) {
  const { pairs, routes } = scorePairs(S, holes, W, { tees });
  const a = assign(pairs, holes, S.bp.length, matcher), out = {};
  for (const h of holes) {
    const lock = a.locks.find((l) => l.n === h.n);
    if (!lock) { out[h.n] = { hole: h.n, how: 'endpoints: no basket assigned', end: null, verts: [], bends: null, condition: 'no basket with ribbon evidence was assigned to this badge' }; continue; }
    const pair = pairs.find((p) => p.n === h.n && p.k === lock.k);
    const start = h.tee ? [h.tee.teeCenter[0] + h.tee.u[0] * FRONT * S.L, h.tee.teeCenter[1] + h.tee.u[1] * FRONT * S.L] : h.c;
    const back = traceBack(S, lock.k, h.c, W);
    let verts, how;
    if (back.verts) { verts = [start, ...back.verts.slice(1)]; how = 'endpoints: traced back from the assigned BasketPoint to the badge'; }
    else {
      const route = routes[h.n].find((r) => r.end === lock.k);
      if (pair?.verts) { verts = [start, ...pair.verts.slice(1)]; how = `endpoints: the scored pair's route, ${pair.how} (the backward trace did not reach the badge)`; }
      else if (route) { verts = [start, ...route.verts.slice(1)]; how = 'endpoints: the forward route that ended on the assigned BasketPoint (the backward trace did not reach the badge)'; }
      else { verts = [start, h.c, S.bp[lock.k]]; how = 'endpoints: straight badge -> BasketPoint segment (the backward trace did not reach the badge)'; }
    }
    // the badge is a vertex only where the path turns there (the tee -> badge leg is straight hallway)
    verts = verts.filter((v, i) => {
      if (i === 0 || i === verts.length - 1 || Math.hypot(v[0] - h.c[0], v[1] - h.c[1]) > 0.5) return true;
      const a1 = Math.atan2(v[1] - verts[i - 1][1], v[0] - verts[i - 1][0]), a2 = Math.atan2(verts[i + 1][1] - v[1], verts[i + 1][0] - v[0]);
      return Math.abs(pyMod(deg(a2 - a1) + 180, 360) - 180) >= ENDPOINT_RULES.minTurnDeg;
    });
    // the tee -> badge leg is straight hallway: the first bend lies on the tee ray, where the next leg's line meets it
    if (h.tee && verts.length > 2) {
      const u = h.tee.u, a = verts[0], p = verts[1], q = verts[2], d = [q[0] - p[0], q[1] - p[1]], det = u[0] * -d[1] - u[1] * -d[0];
      if (Math.abs(det) > 1e-9) { const t = ((p[0] - a[0]) * -d[1] - (p[1] - a[1]) * -d[0]) / det; if (t > 0) verts[1] = [a[0] + u[0] * t, a[1] + u[1] * t]; }
    }
    const rec = { hole: h.n, how, end: lock.k, pair: { score: round(lock.score, 3), evidence: pair?.how ?? null, runnerUpMargin: lock.runnerUpMargin == null ? null : round(lock.runnerUpMargin, 3) }, backward: back.tried, legs: back.legs ?? null,
      verts: verts.map((v) => v.map((x) => round(x, 2))), condition: h.tee ? null : 'no tee: the trace starts at the badge' };
    if (verts.length > 2) {
      const axis = h.tee ? h.tee.u : unit(Math.atan2(verts[1][1] - verts[0][1], verts[1][0] - verts[0][0]));
      const [Vr, s1] = refineVertices(S, verts, W, axis); rec.verts = Vr.map((v) => v.map((x) => round(x, 2))); rec.polyScore = round(s1, 2);
    }
    rec.bends = rec.verts.length - 2;
    out[h.n] = rec;
  }
  return { widthPx: W, pairs: pairs.map((p) => ({ ...p, score: round(p.score, 3) })), assignment: a, holes: out };
}
