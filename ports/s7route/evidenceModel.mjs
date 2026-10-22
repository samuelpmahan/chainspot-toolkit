/**
 * The combination of the S7 evidence (browser-safe, pure): a logistic over the perspectives' readings (a perceptron with a sigmoid;
 * Sam: "a perceptron could do this 75 years ago"), fitted by Newton steps with an L2 penalty on the weights (not the bias), and the
 * evidence ranking's assignment over a tk.s7.cellEvidence table without the store (the offline twin of match.mjs seqFinalOf with
 * rescore: the same cells, the straight claims certain; a hole with no candidate keeps no basket here). Judging lives in
 * ports/s7route/evidenceEval.mjs; nothing here reads testimony.
 */
import { assignMinCost } from './match.mjs';
import { FEATURES, zOf, logSigmoid } from './evidenceSpace.mjs';

export const FIT = Object.freeze({ l2: 1, iters: 50, tol: 1e-9 });

/** Solve A x = b (small, dense; Gaussian elimination with partial pivoting). */
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

/** x of one cell: the readings in FEATURES order, UNKNOWN as 0 (adds nothing; the weight is not asked to explain it). */
export const xOf = (readings, features = FEATURES) => features.map((f) => (readings[f] == null ? 0 : readings[f]));

/**
 * Fit P(y = 1 | x) = sigmoid(bias + w . x) on rows [{ readings, y }] (Newton, L2 = FIT.l2 on w). -> { bias, [feature]: w, ... ,
 * fit: { n, positives, logLoss, iters } }.
 */
export function fitLogistic(rows, { features = FEATURES, l2 = FIT.l2, iters = FIT.iters } = {}) {
  const X = rows.map((r) => [1, ...xOf(r.readings, features)]), y = rows.map((r) => (r.y ? 1 : 0)), d = features.length + 1;
  let w = new Array(d).fill(0), it = 0;
  for (; it < iters; it++) {
    const g = new Array(d).fill(0), H = Array.from({ length: d }, () => new Array(d).fill(0));
    X.forEach((x, i) => { const p = 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * w[j], 0))), q = p * (1 - p); for (let a = 0; a < d; a++) { g[a] += (p - y[i]) * x[a]; for (let b = 0; b < d; b++) H[a][b] += q * x[a] * x[b]; } });
    for (let a = 1; a < d; a++) { g[a] += l2 * w[a]; H[a][a] += l2; }
    H[0][0] += 1e-9;
    const step = solve(H, g);
    w = w.map((v, j) => v - step[j]);
    if (step.reduce((s, v) => s + v * v, 0) < FIT.tol) break;
  }
  const out = { bias: w[0], ...Object.fromEntries(features.map((f, j) => [f, w[j + 1]])) };
  const logLoss = -X.reduce((s, x, i) => { const z = x.reduce((t, v, j) => t + v * w[j], 0); return s + (y[i] ? logSigmoid(z) : logSigmoid(-z)); }, 0) / Math.max(1, X.length);
  return { ...out, fit: { n: X.length, positives: y.filter(Boolean).length, logLoss: Math.round(logLoss * 1000) / 1000, iters: it + 1, l2 } };
}

/** The evidence ranking's picks on one tk.s7.cellEvidence table under weights: { [hole]: basket index | null }. */
export function picksOf(table, weights) {
  const rows = table.rows, nK = table.baskets.length, M = rows.map(() => new Array(nK).fill(Infinity));
  rows.forEach((r, i) => { if (r.claimed !== undefined) M[i][r.claimed] = 0; else for (const x of r.cells) M[i][x.k] = -logSigmoid(zOf(x.readings, weights)); });
  const picks = Object.fromEntries(rows.map((r) => [r.hole, null]));
  for (const [i, k] of assignMinCost(M)) picks[rows[i].hole] = k;
  return picks;
}

/** Cell-level ranking quality: per hole with a labelled basket among its candidates, is the top-P cell the label? -> { holes, top1 }. */
export function top1Of(table, weights, labelOf) {
  let n = 0, hit = 0;
  for (const r of table.rows) {
    if (!r.cells?.length) continue;
    const lab = labelOf(r.hole); if (lab === null || lab === undefined || !r.cells.some((x) => x.k === lab)) continue;
    n++; const best = [...r.cells].sort((a, b) => zOf(b.readings, weights) - zOf(a.readings, weights))[0];
    if (best.k === lab) hit++;
  }
  return { holes: n, top1: hit };
}
