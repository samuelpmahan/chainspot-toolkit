// Rectangular min-cost assignment (Hungarian / Jonker-Volgenant). One copy of what ports/s3assoc/associate.mjs (square),
// ports/s4recover/teeRecover.mjs and ports/s7route/match.mjs (rectangular) each carried.
//
// cost[i][j]; Infinity = forbidden (treated as 1e9 while solving, then dropped from the result). Rows <= cols after a
// transpose. Returns [[row, col], ...] ordered by column; callers that need row order sort the result.

export function assignMinCost(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n || !m) return [];
  const T = n > m;
  const C = T ? cost[0].map((_, j) => cost.map((row) => row[j])) : cost;
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
  for (let j = 1; j <= M; j++) if (p[j]) {
    const [i, jj] = T ? [j - 1, p[j] - 1] : [p[j] - 1, j - 1];
    if (Number.isFinite(cost[i][jj])) pairs.push([i, jj]);
  }
  return pairs;
}

/** Square matrix -> row[i] = assigned column (the shape associate.mjs' `hungarian` returns). */
export function assignSquare(a) {
  const row = new Array(a.length);
  for (const [i, j] of assignMinCost(a)) row[i] = j;
  return row;
}
