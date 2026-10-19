/**
 * S7 MATCHING over tk.s7.routeTable (Sam, 2026-10-19: "start from 18x18 matching"; "the POINT of score -> rank -> match";
 * "assignment + bend refinement passes using the hallway sensor"). Graduates docs/evidence/s7after/match6.py:
 *
 *   1. assignment: maximum total of (edge contrast of the hole's best route to the basket + onAxisPrior), one-to-one
 *      over the whole table (no greedy claims); a cell without a contrast reading scores -99 (the prototype's value);
 *   2. the assigned 1-bend route is refined by coordinate search (polyscore refine_vertices, 2 iterations, the bend
 *      sliding on the tee axis);
 *   3. bends by the hallway sensor: the straight route if it reads >= TAU on >= MIN_STATIONS visible stations, else the
 *      contrast route; a second bend (B1 on the tee axis, B2 free) only when the 1-bend route reads < TAU and the best
 *      2-bend route reads >= TAU, gains >= 0.15 and has >= MIN_STATIONS stations;
 *   4. bend placement (bends.mjs, graduated from after-s4-e09): each bend moves to where the ribbon's heading changes, on a
 *      sensor gate; a hole S6 reads STRAIGHT keeps the route of step 3 (rule 1).
 *
 * Pure functions on the S7 scene ({ lum, mask, W, H }) and the table; no thresholds hide anywhere else.
 */
import { routeSensorAt, ribbonContrastAt, ROUTE } from './routeSpace.mjs';
import { refineVertices, arange } from '../s7trace/hallway.mjs';
import { refineBendsOf } from './bends.mjs';

export const MATCH = Object.freeze({
  tau: 0.75,                 // sensor reading at which a route counts as hallway
  minStations: ROUTE.minStations,
  noReadingLum: -99.0,       // a cell with no contrast reading (polyscore.py's value)
  refineIters: 2,            // match18.py refine_vertices(iters=2)
  secondBend: Object.freeze({ gain: 0.15, axisSpanPx: 80, axisStepPx: 8, gridStepW: 0.5, bboxW: 2, minLegW: 1, top: 8, refineAxisPx: 8, refineAxisStepPx: 2, refineStepPx: 2 })
});

/** Rectangular min-cost assignment (Hungarian; Infinity = forbidden). -> [[row, col], ...] */
export function assignMinCost(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n || !m) return [];
  const T = n > m, C = T ? cost[0].map((_, j) => cost.map((row) => row[j])) : cost;
  const N = C.length, M = C[0].length, BIG = 1e9;
  const u = new Array(N + 1).fill(0), v = new Array(M + 1).fill(0), p = new Array(M + 1).fill(0), way = new Array(M + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(M + 1).fill(Infinity), used = new Array(M + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= M; j++) if (!used[j]) {
        const cur = (Number.isFinite(C[i0 - 1][j - 1]) ? C[i0 - 1][j - 1] : BIG) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= M; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const pairs = [];
  for (let j = 1; j <= M; j++) if (p[j]) { const [i, jj] = T ? [j - 1, p[j] - 1] : [p[j] - 1, j - 1]; if (Number.isFinite(cost[i][jj])) pairs.push([i, jj]); }
  return pairs.sort((a, b) => a[0] - b[0]);
}

const contrast = (S, V, W) => { const [c] = ribbonContrastAt(S, V, W); return c === null ? MATCH.noReadingLum : c; };

/** match6.py second_bend: B1 on the tee axis (+-80 px around the 1-bend vertex), B2 on a W/2 grid, top 8 refined; sensor-gated. */
export function secondBend(S, start, V1, E, W, f1) {
  const R = MATCH.secondBend, u = start.u, St = start.S;
  const t1 = (V1[1][0] - St[0]) * u[0] + (V1[1][1] - St[1]) * u[1];
  const lo = [Math.min(St[0], E[0]) - R.bboxW * W, Math.min(St[1], E[1]) - R.bboxW * W], hi = [Math.max(St[0], E[0]) + R.bboxW * W, Math.max(St[1], E[1]) + R.bboxW * W];
  const gx = arange(Math.max(lo[0], 0), Math.min(hi[0], S.W), W * R.gridStepW), gy = arange(Math.max(lo[1], 0), Math.min(hi[1], S.H), W * R.gridStepW);
  const cands = [];
  for (const t of arange(t1 - R.axisSpanPx, t1 + R.axisSpanPx + 0.1, R.axisStepPx)) {
    const B1 = [St[0] + u[0] * t, St[1] + u[1] * t];
    if (!(B1[0] >= 0 && B1[0] < S.W && B1[1] >= 0 && B1[1] < S.H)) continue;
    for (const x of gx) for (const y of gy) {
      if (Math.hypot(x - B1[0], y - B1[1]) < W * R.minLegW || Math.hypot(x - E[0], y - E[1]) < W * R.minLegW) continue;
      cands.push([contrast(S, [St, B1, [x, y], E], W), t, [x, y]]);
    }
  }
  cands.sort((a, b) => b[0] - a[0]);
  let best = [MATCH.noReadingLum, null];
  for (const [, t, B2] of cands.slice(0, R.top)) {
    for (const dt of arange(-R.refineAxisPx, R.refineAxisPx + 0.1, R.refineAxisStepPx)) {
      const B1 = [St[0] + u[0] * (t + dt), St[1] + u[1] * (t + dt)];
      for (const dx of arange(-W / 2, W / 2 + 0.1, R.refineStepPx)) for (const dy of arange(-W / 2, W / 2 + 0.1, R.refineStepPx)) {
        const Vt = [St, B1, [B2[0] + dx, B2[1] + dy], E], s2 = contrast(S, Vt, W);
        if (s2 > best[0]) best = [s2, Vt];
      }
    }
  }
  if (!best[1]) return { accepted: false, note: 'no 2-bend candidate' };
  const r2 = routeSensorAt(S, best[1], W), c1 = contrast(S, V1, W);
  const note = `2-bend candidate contrast ${best[0].toFixed(1)} (1-bend ${c1.toFixed(1)}) lum, sensor ${r2.passFrac.toFixed(2)} on ${r2.stations} st vs 1-bend ${f1.toFixed(2)}`;
  const ok = r2.passFrac >= MATCH.tau && r2.passFrac - f1 >= R.gain && r2.stations >= MATCH.minStations;
  return { accepted: ok, verts: best[1], note, sensor: r2 };
}

/**
 * The matching rule: table (tk.s7.routeTable), S (tk.s7.sceneS4), starts (tk.s7.routeStart). -> { holes: { [hole]: { end, verts, how, ... } },
 * assignment: rows, widthPx }. secondBend: false skips step 3's second bend (cheap variant).
 */
export function routeMatchOf(table, S, starts, { secondBends = true, straight: verdicts = undefined } = {}) {
  const W = table.widthPx, holes = table.holes;
  if (!(W > 0) || !holes.length) return { holes: {}, assignment: [], widthPx: W ?? null, condition: 'no hallway width or no holes in the route table' };
  const score = table.contrastMatrix.map((row, i) => row.map((c, k) => (c === null ? MATCH.noReadingLum : c) + (table.onAxisPrior[i]?.[k] ?? 0)));
  const pairs = assignMinCost(score.map((row) => row.map((v) => -v)));
  const out = {}, assignment = [];
  for (const [i, k] of pairs) {
    const hole = holes[i], cell = table.rows[i].cells[k], start = starts.holes.find((h) => String(h.hole) === String(hole));
    const sorted = [...score[i]].sort((a, b) => b - a);
    const E = table.baskets[k].point ?? cell.contrast.verts.at(-1);
    let V = cell.contrast.verts.map((v) => v.slice());
    if (V.length === 3) V = refineVertices(S, V, W, start.u, MATCH.refineIters)[0];
    const straight = routeSensorAt(S, [start.S, E], W);
    let rec;
    if (straight.stations >= MATCH.minStations && straight.passFrac >= MATCH.tau) {
      rec = { verts: [start.S, E], how: `straight: sensor ${straight.passFrac.toFixed(2)} on ${straight.stations} st`, sensor: straight };
    } else {
      const r1 = routeSensorAt(S, V, W);
      rec = { verts: V, how: `contrast route (${V.length - 2} bends): sensor ${r1.passFrac.toFixed(2)}; straight read ${straight.passFrac.toFixed(2)}`, sensor: r1 };
      if (secondBends && V.length === 3 && r1.passFrac < MATCH.tau) {
        const b2 = secondBend(S, start, V, E, W, r1.passFrac);
        rec = b2.accepted ? { verts: b2.verts, how: `2-bend accepted: ${b2.note}`, sensor: b2.sensor, secondBend: true } : { ...rec, how: `${rec.how}; 2-bend rejected: ${b2.note}` };
      }
    }
    const before = rec.verts;
    if (verdicts !== undefined) {
      if (verdicts === null) rec = { ...rec, bendsRefined: { taken: false, why: 'no S6 straight verdict on record: bend placement not run' } };
      else {
        const r = refineBendsOf(S, rec.verts, W, { straight: verdicts[hole] === 'straight' });
        rec = { ...rec, verts: r.verts, how: `${rec.how} | bends ${r.taken ? 'placed' : 'kept'}: ${r.why}`, sensor: r.taken ? routeSensorAt(S, r.verts, W) : rec.sensor,
          bendsRefined: { taken: r.taken, why: r.why, bendsBefore: r.K0, bendsAfter: r.taken ? r.K1 : r.K0, samples: r.samples ?? null, before: before.slice(1, -1) } };
      }
    }
    out[hole] = { end: k, verts: rec.verts, how: rec.how, polyScore: contrast(S, rec.verts, W), bendsRefined: rec.bendsRefined ?? null, legs: [{ passFrac: rec.sensor.passFrac }],
      pair: { basket: k, scoreLum: score[i][k], marginLum: sorted[0] === score[i][k] ? sorted[0] - (sorted[1] ?? sorted[0]) : score[i][k] - sorted[0], onAxisPrior: table.onAxisPrior[i]?.[k] ?? 0 } };
    assignment.push({ hole, basket: k, scoreLum: score[i][k], bends: rec.verts.length - 2, sensor: rec.sensor.passFrac, stations: rec.sensor.stations });
  }
  return { holes: out, assignment, widthPx: W };
}
