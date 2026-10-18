/**
 * fn.Tee.pairBadge: S5 tee-to-badge pairing as a ComparableForkJoin slot (browser-safe; no node:* imports).
 *
 * Sam's S5 doctrine (DOCTRINE.md row S5): a tee's long axis points directly at its badge; the residual indicts the tee
 * fit; judged as "hole n's tee pairs with badge n". After S4 every tee of the course (S3 observed + S4 recovered) is
 * paired with at most one badge, and each pair carries the axis residual against the ray to that badge's plate centre
 * (fn.q.pair.residual, ports/s5pair/residualQuery.mjs; the S5 learning lane's fn.q.pair.* replaces it at merge): angleResidualDeg (deg) and signedPerpPx (px). S6 later takes the
 * straight-hole pairs.
 *
 * The slot's Part px.tees.pairs is { implementation, rule, absent?, pairs: [pair], units }, one pair per tee:
 *   { tee: 'Tee cX' | 'S4 Tee cX' (a candidate name until identity is proven), origin: 'S3 observed' | 'S4 recovered',
 *     teeIndex, center: [x, y] px, angleRad, angleDeg, badge: label | null, plateCenter: [x, y] px | null,
 *     angleResidualDeg, signedPerpPx, alongPx, distancePx, rule, evidence }
 * Canonical (S0-cropped) frame, pixel centres at integer coordinates.
 *
 *   judgePairs(pairs, points, badges)  hole n's tee pairs with badge n: each tee is matched one-to-one (closest first)
 *     to Sam's tee points within PAIR_SLOT.matchPx (the judge's tee rule, 8 px); a matched tee is right when its badge
 *     is its hole, wrong when another, none when it has no badge; a tee matching no annotated point is unjudged.
 *     unmatchedBadges: badges no tee pairs with; missingTees: annotated holes no tee matches. Agreement only.
 */
export const PAIR_SLOT = Object.freeze({
  slot: 'fn.Tee.pairBadge',
  part: 'px.tees.pairs',
  materialize: 'fg.s5.teeBadgePair.materialize',
  testimony: 'fg.s5.teeBadgePair.testimony',
  matchPx: 8   // px: a tee IS the annotated tee within this distance (ports/judge MATCH_PX.tee, one rule per kind)
});

export const ACCEPTANCE = "UNKNOWN: acceptance is Sam's; agreement with his annotation testimony is evidence only";
export const VERDICTS = Object.freeze(['right', 'wrong', 'none', 'unjudged']);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** One-to-one match of tees to annotated points (closest pairs first) within maxPx: Map(pair index -> { hole, errorPx }). */
export function matchTees(pairs, points, maxPx = PAIR_SLOT.matchPx) {
  const cand = [];
  pairs.forEach((p, i) => points.forEach((t) => { const e = dist(p.center, t.canonical); if (e <= maxPx) cand.push({ i, hole: t.hole, e }); }));
  cand.sort((a, b) => a.e - b.e || a.i - b.i || a.hole - b.hole);
  const usedT = new Set(), out = new Map();
  for (const c of cand) if (!out.has(c.i) && !usedT.has(c.hole)) { out.set(c.i, { hole: c.hole, errorPx: r3(c.e) }); usedT.add(c.hole); }
  return out;
}

/**
 * pairs: px.tees.pairs .pairs; points: [{ hole, canonical: [x, y] }] (testimony.source.teePoints .points);
 * badges: [{ label, plateCenter }] (tk.s4.badgePlates). Returns { rows, totals, unmatchedBadges, missingTees }.
 */
export function judgePairs(pairs, points, badges, maxPx = PAIR_SLOT.matchPx) {
  const m = matchTees(pairs, points, maxPx);
  const plate = new Map(badges.map((b) => [String(b.label), b.plateCenter]));
  const rows = pairs.map((p, i) => {
    const truth = m.get(i)?.hole ?? null, said = p.badge != null ? Number(p.badge) : null;
    const verdict = truth == null ? 'unjudged' : said == null ? 'none' : said === truth ? 'right' : 'wrong';
    return {
      hole: truth, name: p.tee, origin: p.origin, point: p.center, said, saidCenter: p.badge != null ? (plate.get(String(p.badge)) ?? null) : null,
      truthCenter: truth != null ? (plate.get(String(truth)) ?? null) : null, verdict, teeErrorPx: m.get(i)?.errorPx ?? null,
      residualDeg: p.angleResidualDeg ?? null, signedPerpPx: p.signedPerpPx ?? null
    };
  });
  const paired = new Set(pairs.filter((p) => p.badge != null).map((p) => String(p.badge)));
  const unmatchedBadges = badges.map((b) => String(b.label)).filter((l) => !paired.has(l));
  const matchedHoles = new Set([...m.values()].map((x) => x.hole));
  const missingTees = points.map((p) => p.hole).filter((h) => !matchedHoles.has(h)).sort((a, b) => a - b);
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  return { rows, unmatchedBadges, missingTees, matchPx: maxPx,
    totals: { tees: pairs.length, right: count('right'), wrong: count('wrong'), none: count('none'), unjudged: count('unjudged'), unmatchedBadges: unmatchedBadges.length, missingTees: missingTees.length } };
}

/** The badges (label, plate centre) a pair names, for artifacts and renders. */
export const badgeList = (plates) => plates.map((b) => ({ label: String(b.label), plateCenter: b.plateCenter.map(r3) }));
