/**
 * fn.Tee.associate: S3 initial association (Sam, 2026-10-17: "unoccluded
 * pads should associate with at MOST 2 badges with 1 being an obviously
 * better fit"), plus the straight-hole half of S5: continue the pad axis past
 * its badge and see whether it lands on a BasketPoint.
 *
 * Geometry it relies on (all measured, docs/evidence):
 *  - a tee's long axis points at its badge centre: 0.23 deg median, 0.36 deg max on Alex's AA-fit pads;
 *  - on a straight hole the pad axis passes the basket's BasketPoint: 0.05-2.58 px at 130-415 px on 4 annotated courses;
 *  - BasketPoint = basket sprite tip (bbox x + 22.5, bbox y + 71) + BASKET_POINT_OFFSET, solved from 59 C1 spokes on 5 courses.
 */

/** BasketPoint offset from the sprite's bottom-centre pixel (px): the spokes cross the stem's bottom edge here. */
export const BASKET_POINT_OFFSET = Object.freeze([0.34, 0.73]);
export const basketPoint = (bbox) => [bbox[0] + (bbox[2] - 1) / 2 + BASKET_POINT_OFFSET[0], bbox[1] + bbox[3] - 1 + BASKET_POINT_OFFSET[1]];

export const ASSOC_BOUNDS = Object.freeze({
  sigma0Px: 0.85,              // px: badge + pad centre error, calibrated on 76 Sam-confirmed pairings (5 courses)
  sigmaThetaFloorRad: 0.0005,  // rad (0.03 deg): floor on a pad's own angle sigma
  zMax: 3,
  zGate: 8,                    // z: loose gate for a pad no consistent badge is left for (assigned ASSOCIATED_WEAK, inspected)
  straight3TlsPx: 1.5,         // px: 3-point (tee, badge, BasketPoint) TLS max residual for a 0-bend hole; calibrated below                     // z: a badge within 3 sigma of the axis is consistent with the pad
  badgeMinDistPadLengths: 0.6, // pad lengths: nearer badges are overlapping chrome, not a pairing
  badgeMaxDistPadLengths: 12,  // pad lengths
  straightLateralPx: 3.0       // px: axis-to-BasketPoint miss that reads as a straight hole; a coincidental hit on a bent
                               // hole (golden 7, 14 at 507-552 px) is S6's to reject by the ribbon, not a length cutoff
});
export const ASSOC_UNITS = Object.freeze({
  resDeg: 'deg (pad axis to badge centre)', latPx: 'px (badge centre to pad axis line)', distPx: 'px (pad centre to badge centre)',
  alongPx: 'px (pad centre to BasketPoint along the axis)', z: 'z (lateral miss / its expected sigma)'
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * tees: [{ label, center:[x,y], thRad }]; badges: [{ label, center }]; baskets: [{ index, bbox }];
 * padLengthPx: course pad length. Returns one row per tee.
 */
/**
 * Which way the hole path leaves a pad: mean RGB-level excess of a strip on the axis just past each end over its
 * flanks (the path is a semi-transparent light ribbon about 1.9 pad widths wide, measured 33.6 px on Alex's
 * 17.4 px pads). Returns { sense: +1 | -1 along thRad, excess: [ahead, behind] (RGB level), decisive }.
 * occ (Uint8Array, 1 = another sprite) pixels are skipped. Measured on Alex: the badge lies on this side
 * for 10 of 10 pads with a fitted ribbon.
 */
export function pathSide({ raster, occ = null, center, thRad, L, W }) {
  const { rgba, widthPx } = raster, ax = [Math.cos(thRad), Math.sin(thRad)], nr = [-ax[1], ax[0]];
  const lum = (x, y) => { const i = Math.round(y) * widthPx + Math.round(x); return occ?.[i] ? null : (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3; };
  const strip = (sense) => {
    let a = 0, na = 0, b = 0, nb = 0;
    for (let t = L / 2 + 4; t <= L / 2 + 4 + 2 * L; t += 1) for (let v = -1.5 * W; v <= 1.5 * W; v += 1) {
      const x = center[0] + ax[0] * t * sense + nr[0] * v, y = center[1] + ax[1] * t * sense + nr[1] * v, l = lum(x, y);
      if (l === null) continue;
      if (Math.abs(v) <= 0.6 * W) { a += l; na++; } else if (Math.abs(v) >= 1.15 * W) { b += l; nb++; }
    }
    return na > 20 && nb > 20 ? a / na - b / nb : null;
  };
  const ahead = strip(1), behind = strip(-1);
  if (ahead === null || behind === null) return { sense: null, excess: [ahead, behind], decisive: false };
  return { sense: ahead >= behind ? 1 : -1, excess: [r2(ahead), r2(behind)], decisive: Math.abs(ahead - behind) >= 8 };
}

/**
 * tees: [{ label, center:[x,y], thRad, sigmaThRad?, pathSide? }]; badges: [{ label, center }]; baskets: [{ index, bbox }].
 * Every badge gets a z per pad: lateral miss / sqrt(sigma0^2 + (dist * sigmaTheta)^2). sigma0 = 0.85 px was calibrated on
 * the 76 Sam-confirmed pairings (5 courses; the miss does not grow with distance over 45-214 px); sigmaTheta is the
 * pad's own profile-curvature angle sigma (a floor, never zero). Badges within z <= 3 are consistent. Association is
 * global and one-to-one: consistent pairs are taken in increasing z, each badge and pad once, so a far badge a pad
 * cannot rule out is settled by the pad it actually belongs to. Nothing is dropped: every pad keeps its 3 lowest-z badges.
 */
/** Hungarian algorithm (square cost matrix, minimisation); returns row -> column. O(n^3), n = pads + badges. */
export function hungarian(a) {
  const n = a.length, u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const row = new Array(n);
  for (let j = 1; j <= n; j++) if (p[j]) row[p[j] - 1] = j - 1;
  return row;
}

export function associate({ tees, badges, baskets, padLengthPx, bounds = ASSOC_BOUNDS }) {
  const bps = baskets.map((k) => ({ index: k.index, point: basketPoint(k.bbox) }));
  const per = tees.map((t) => {
    const ax = [Math.cos(t.thRad), Math.sin(t.thRad)], sTh = Math.max(t.sigmaThRad ?? 0, bounds.sigmaThetaFloorRad);
    const all = badges.map((b) => {
      const v = sub(b.center, t.center), dist = Math.hypot(...v);
      const sense = dot(v, ax) > 0 ? 1 : -1, u = [ax[0] * sense, ax[1] * sense], nrm = [-u[1], u[0]], lat = Math.abs(dot(v, nrm));
      return { badge: String(b.label), z: r2(lat / Math.sqrt(bounds.sigma0Px ** 2 + (dist * sTh) ** 2)), latPx: r2(lat), resDeg: r2((Math.atan2(lat, dot(v, u)) * 180) / Math.PI), distPx: r2(dist), sense };
    }).filter((k) => k.distPx >= bounds.badgeMinDistPadLengths * padLengthPx).sort((a, b) => a.z - b.z);
    return { t, ax, all, consistent: all.filter((k) => k.z <= bounds.zMax) };
  });
  // Global one-to-one assignment: minimum total cost sum(z^2) over all pads (Hungarian), a pad left without a badge
  // costing zGate^2. Greedy best-first is not optimal: one pad grabbing a neighbour's badge strands that neighbour.
  const nT = per.length, labels = badges.map((b) => String(b.label)), nB = labels.length, BIG = 1e9;
  const n = nT + nB, cost = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i < nT && j < nB) { const k = per[i].all.find((x) => x.badge === labels[j]); cost[i][j] = k && k.z <= bounds.zGate ? k.z * k.z : BIG; }
    else if (i < nT) cost[i][j] = bounds.zGate ** 2;   // pad unmatched
    else cost[i][j] = 0;                               // badge unmatched (its tee is hidden: S4's to recover)
  }
  const match = hungarian(cost);
  const chosen = new Map(), weak = new Set();
  for (let i = 0; i < nT; i++) {
    const j = match[i];
    if (j < nB && cost[i][j] < BIG) { const k = per[i].all.find((x) => x.badge === labels[j]); chosen.set(i, k); if (k.z > bounds.zMax) weak.add(i); }
  }
  const owner = new Map([...chosen].map(([i, k]) => [k.badge, i]));
  return per.map((p, i) => {
    const { t, ax, all, consistent } = p, best = chosen.get(i) ?? null, side = t.pathSide ?? null;
    const others = consistent.filter((k) => k !== best);
    let verdict = !best ? (consistent.length ? 'ALL_CONSISTENT_BADGES_TAKEN' : 'NO_CONSISTENT_BADGE') : weak.has(i) ? 'ASSOCIATED_WEAK' : others.length === 0 ? 'ASSOCIATED' : 'ASSOCIATED_BY_EXCLUSIVITY';
    const resolvedBy = others.map((k) => ({ badge: k.badge, z: k.z, distPx: k.distPx, takenByTee: owner.has(k.badge) ? tees[owner.get(k.badge)].label : null }));
    if (verdict === 'ASSOCIATED_BY_EXCLUSIVITY' && resolvedBy.some((r) => r.takenByTee === null)) verdict = 'AMBIGUOUS';
    let straight = null;
    if (best) {
      const u = [ax[0] * best.sense, ax[1] * best.sense], nrm = [-u[1], u[0]];
      const hits = bps.map((k) => { const v = sub(k.point, t.center); return { basket: k.index, latPx: r2(Math.abs(dot(v, nrm))), alongPx: r2(dot(v, u)) }; })
        .filter((h) => h.alongPx > best.distPx * 0.5).sort((a, b) => a.latPx - b.latPx);
      const h = hits[0];
      if (h) straight = { ...h, nextLatPx: hits[1]?.latPx ?? null, verdict: h.latPx <= bounds.straightLateralPx ? 'STRAIGHT_CANDIDATE' : 'NOT_STRAIGHT_OR_BASKET_UNSEEN' };
    }
    // Sam's 3-point straight test (0-bend holes), written once (straight3Test below; S6 asks it per tee-badge pair too).
    const straight3 = best ? straight3Test(t.center, badges.find((b) => String(b.label) === best.badge).center, bps, bounds) : null;
    const inspect = verdict !== 'ASSOCIATED' || (straight && straight.verdict !== 'STRAIGHT_CANDIDATE' && straight.latPx < 10);
    return { tee: t.label, center: t.center.map(r2), thDeg: r2((t.thRad * 180) / Math.PI), best, candidates: consistent, nearest: all.slice(0, 3), resolvedBy,
      verdict, inspect, pathSide: side, badgeOnPathSide: best && side?.sense ? best.sense === side.sense : null, straight, straight3 };
  });
}

/**
 * Sam's 3-point straight test (0-bend holes): tee centre, badge centre and a BasketPoint are collinear.
 * Uses no pad angle: the line is tee centre -> badge centre, the residual is the TLS max distance of the 3 points.
 * teeCenter, badgeCenter: [x, y] px; bps: [{ index, point: BasketPoint [x, y] }]. Returns null when no BasketPoint lies
 * beyond the badge; else the best basket with its residuals (px) and verdict STRAIGHT | BENT_OR_BASKET_UNSEEN.
 */
export function straight3Test(teeCenter, badgeCenter, bps, bounds = ASSOC_BOUNDS) {
  const B = badgeCenter, d = sub(B, teeCenter), L = Math.hypot(...d), u = [d[0] / L, d[1] / L], nrm = [-u[1], u[0]];
  const tls = (P) => { // max perpendicular distance of points P from their total-least-squares line
    const m = [P.reduce((a, q) => a + q[0], 0) / P.length, P.reduce((a, q) => a + q[1], 0) / P.length];
    let sxx = 0, sxy = 0, syy = 0; for (const q of P) { const a = q[0] - m[0], b = q[1] - m[1]; sxx += a * a; sxy += a * b; syy += b * b; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), n2 = [-Math.sin(th), Math.cos(th)];
    return Math.max(...P.map((q) => Math.abs((q[0] - m[0]) * n2[0] + (q[1] - m[1]) * n2[1])));
  };
  const hits = bps.map((k) => { const v = sub(k.point, teeCenter); return { basket: k.index, latPx: r2(Math.abs(dot(v, nrm))), alongPx: r2(dot(v, u)), tlsMaxPx: r2(tls([teeCenter, B, k.point])) }; })
    .filter((h) => h.alongPx > L).sort((a, b) => a.tlsMaxPx - b.tlsMaxPx);
  // A straight hole ends at the FIRST basket its line reaches (consecutive baskets can lie on one line, lenard).
  const onLine = hits.filter((x) => x.tlsMaxPx <= bounds.straight3TlsPx).sort((a, b) => a.alongPx - b.alongPx);
  const h = onLine[0] ?? hits[0];
  return h ? { ...h, nextTlsMaxPx: hits[1]?.tlsMaxPx ?? null, verdict: h.tlsMaxPx <= bounds.straight3TlsPx ? 'STRAIGHT' : 'BENT_OR_BASKET_UNSEEN' } : null;
}
