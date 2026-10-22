/**
 * S7 SEQUENCING (Sam, 2026-10-21: "18x18 is craycray. Think sequencing, neighborhoods, and what (almost) guarantees we can
 * confidently build on"). Instead of every hole x every basket, the assignment builds on what is (almost) guaranteed:
 *
 *   1. STRAIGHT FIRST: a hole S6 reads straight claims the FIRST forward BasketPoint on its tee ray (smallest along, among
 *      along > 0 and |lateral| <= SEQ.straightLateralR1 x R1 from the tee cap S). Measured (coordinator, guar.py,
 *      2026-10-21): the true basket on 44/44 S6-straight holes over golden, heritage, townelake, Coleto, Beaver, SeaTac (the
 *      nearest-offset rule fails golden 12, whose ray passes Basket co before Basket cn). No route search.
 *   2. NEIGHBOURHOODS: a bent hole considers only unclaimed forward BasketPoints, ranked by (rank of distance from its tee cap)
 *      + (rank of distance from the NEXT hole's tee centre: the course is played in sequence), ties by the first; the top
 *      SEQ.neighbours are its candidates. Measured: the true basket's joint rank <= 2 on 69/71 bent holes, <= 4 on all, so
 *      SEQ.neighbours = 5 is a RANK count (never px).
 *   3. Claimed baskets are state: an argument passed from one step to the next, never shared mutation.
 * Pure functions on the route starts, the BasketPoints and S6's verdicts.
 */
export const SEQ = Object.freeze({
  straightLateralR1: 0.5,   // R1: the tee ray's half-width for the straight claim
  neighbours: 5,            // candidates per bent hole: joint ranks 0..4 (the measured guarantee: <= 4 on all 71 bent holes)
  followLegs: 8,            // the hallway follower's leg budget per hole (hallway.mjs trace; the s3first prototype used 4)
  ringR1: 1                 // Sam (2026-10-21): "enforce no passing through baskets": no leg enters another basket's C1 ring (1 R1:
                            // C1 = 10 m by definition, R1 measured per image)
});

/**
 * The foreign rings of a route from a start to basket k: every other BasketPoint's C1 (SEQ.ringR1 x R1), except a basket whose
 * ring already holds the tee cap S (a tee pad beside the previous basket). -> { pts, idx, r, exempt }
 */
export function foreignRingsOf(start, bp, k, R1, plates = null) {
  const r = SEQ.ringR1 * R1, idx = [], exempt = [];
  bp.forEach((p, q) => { if (q === k) return; if (Math.hypot(p[0] - start.S[0], p[1] - start.S[1]) < r) exempt.push(q); else idx.push(q); });
  // plates (rule set option seqFirstLegs): every other hole's badge plate is foreign as well (firstLegs.mjs)
  return { pts: idx.map((q) => bp[q]), idx, r, exempt, ...(plates ? { boxes: plates.filter((p) => p.hole !== String(start.hole)) } : {}) };
}

const frame = (start, p) => { const d = [p[0] - start.S[0], p[1] - start.S[1]]; return { along: d[0] * start.u[0] + d[1] * start.u[1], lateral: Math.abs(-d[0] * start.u[1] + d[1] * start.u[0]) }; };

/**
 * Step 1: the straight claims, in hole order. claimed (the state passed in) -> { claims: { [hole]: basket }, claimed, rows }.
 * verdicts: S6's { [hole]: 'straight' | ... } (null or absent: no claim).
 */
export function straightClaimsOf(starts, bp, R1, verdicts, claimed = [], guard = null) {
  const taken = new Set(claimed), claims = {}, rows = [];
  for (const s of starts) {
    if (verdicts?.[s.hole] !== 'straight') continue;
    const on = bp.map((p, k) => ({ k, ...frame(s, p) })).filter((x) => x.along > 0 && x.lateral <= SEQ.straightLateralR1 * R1).sort((a, b) => a.along - b.along);
    const first = on[0];
    // guard (rule set option seqFirstLegs): the claim's straight route breaks a rule (why), the hole is treated as bent
    const broken = first && guard ? guard(s, first.k) : null;
    if (broken) { rows.push({ hole: s.hole, basket: null, why: `S6 straight, but the straight route to its first on-ray BasketPoint (${first.k}) ${broken}: treated as bent` }); continue; }
    if (first && !taken.has(first.k)) { claims[s.hole] = first.k; taken.add(first.k); rows.push({ hole: s.hole, basket: first.k, why: `S6 straight: the first forward BasketPoint on the tee ray (along ${(first.along / R1).toFixed(1)} R1, off ${(first.lateral / R1).toFixed(2)} R1)` }); }
    else rows.push({ hole: s.hole, basket: null, why: first ? `S6 straight, but its first on-ray BasketPoint (${first.k}) is already claimed: treated as bent` : 'S6 straight, but no forward BasketPoint within the tee ray: treated as bent' });
  }
  return { claims, claimed: [...taken], rows };
}

/**
 * Step 2: each unclaimed hole's neighbourhood among the unclaimed forward BasketPoints. -> { [hole]: [{ basket, rank, fwdRank,
 * nextRank }] } (rank = position by fwdRank + nextRank; nextRank null for the last hole).
 */
export function neighbourhoodsOf(starts, bp, claimed) {
  const taken = new Set(claimed), out = {};
  starts.forEach((s, i) => {
    const pool = bp.map((p, k) => ({ k, p, ...frame(s, p) })).filter((x) => !taken.has(x.k) && x.along > 0);
    const byS = [...pool].sort((a, b) => Math.hypot(a.p[0] - s.S[0], a.p[1] - s.S[1]) - Math.hypot(b.p[0] - s.S[0], b.p[1] - s.S[1])).map((x) => x.k);
    const next = starts.find((t) => Number(t.hole) === Number(s.hole) + 1) ?? null;
    const byNext = next ? [...pool].sort((a, b) => Math.hypot(a.p[0] - next.teeCenter[0], a.p[1] - next.teeCenter[1]) - Math.hypot(b.p[0] - next.teeCenter[0], b.p[1] - next.teeCenter[1])).map((x) => x.k) : null;
    const ranked = pool.map((x) => ({ basket: x.k, fwdRank: byS.indexOf(x.k), nextRank: byNext ? byNext.indexOf(x.k) : null }))
      .sort((a, b) => (a.fwdRank + (a.nextRank ?? 0)) - (b.fwdRank + (b.nextRank ?? 0)) || a.fwdRank - b.fwdRank);
    out[s.hole] = ranked.slice(0, SEQ.neighbours).map((x, r) => ({ ...x, rank: r }));
  });
  return out;
}
