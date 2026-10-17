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
  badgeWindowDeg: 3.0,        // deg: badge candidates within this angle of the pad axis (either sense)
  badgeMinDistPadLengths: 0.6, // pad lengths: nearer badges are overlapping chrome, not a pairing
  badgeMaxDistPadLengths: 12,  // pad lengths
  inspectLateralPx: 2.0,       // px: flag a pairing for inspection past this; all 76 pads on 5 courses sit within 1.90 px
  obviousRatio: 2.0,           // ratio: the 2nd candidate's lateral miss must be at least this times the best's
  straightLateralPx: 3.0       // px: axis-to-BasketPoint miss that reads as a straight hole; a coincidental hit on a bent
                               // hole (golden 7, 14 at 507-552 px) is S6's to reject by the ribbon, not a length cutoff
});
export const ASSOC_UNITS = Object.freeze({
  resDeg: 'deg (pad axis to badge centre)', latPx: 'px (badge centre to pad axis line)', distPx: 'px (pad centre to badge centre)',
  alongPx: 'px (pad centre to BasketPoint along the axis)', ratio: 'ratio (2nd candidate lateral / best lateral)'
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

export function associate({ tees, badges, baskets, padLengthPx, bounds = ASSOC_BOUNDS }) {
  const bps = baskets.map((k) => ({ index: k.index, point: basketPoint(k.bbox) }));
  return tees.map((t) => {
    const ax = [Math.cos(t.thRad), Math.sin(t.thRad)];
    const cands = [];
    for (const b of badges) {
      const v = sub(b.center, t.center), dist = Math.hypot(...v);
      if (dist < bounds.badgeMinDistPadLengths * padLengthPx || dist > bounds.badgeMaxDistPadLengths * padLengthPx) continue;
      const sense = dot(v, ax) > 0 ? 1 : -1, u = [ax[0] * sense, ax[1] * sense], nrm = [-u[1], u[0]];
      const resDeg = (Math.atan2(Math.abs(dot(v, nrm)), dot(v, u)) * 180) / Math.PI;
      if (resDeg <= bounds.badgeWindowDeg) cands.push({ badge: String(b.label), resDeg: r2(resDeg), latPx: r2(Math.abs(dot(v, nrm))), distPx: r2(dist), sense });
    }
    cands.sort((a, b) => a.latPx - b.latPx);
    // Never drop a pad: the nearest badges by axis residual (no angle cutoff) are tracked for inspection,
    // because a miss is as likely our measurement as the scene.
    const nearest = badges.map((b) => {
      const v = sub(b.center, t.center), dist = Math.hypot(...v);
      const sense = dot(v, ax) > 0 ? 1 : -1, u = [ax[0] * sense, ax[1] * sense], nrm = [-u[1], u[0]];
      return { badge: String(b.label), resDeg: r2((Math.atan2(Math.abs(dot(v, nrm)), dot(v, u)) * 180) / Math.PI), latPx: r2(Math.abs(dot(v, nrm))), distPx: r2(dist), sense };
    }).filter((k) => k.distPx >= bounds.badgeMinDistPadLengths * padLengthPx).sort((a, b) => a.resDeg - b.resDeg).slice(0, 3);
    const best = cands[0] ?? null;
    const ratio = cands.length > 1 ? r2(cands[1].latPx / Math.max(best.latPx, 0.05)) : null;
    let verdict = !best ? 'NO_BADGE' : cands.length > 2 ? 'AMBIGUOUS' : cands.length === 2 && ratio < bounds.obviousRatio ? 'AMBIGUOUS' : 'ASSOCIATED';
    // Tie-break by the path: the badge lies on the side the hole path leaves the pad.
    const side = t.pathSide ?? null;
    let best_ = best;
    if (verdict === 'AMBIGUOUS' && side?.decisive) {
      const onPath = cands.filter((k) => k.sense === side.sense);
      if (onPath.length === 1) { best_ = onPath[0]; verdict = 'ASSOCIATED_BY_PATH_SIDE'; }
    }
    let straight = null;
    if (best_) {
      const best = best_;
      const u = [ax[0] * best.sense, ax[1] * best.sense], nrm = [-u[1], u[0]];
      const hits = bps.map((k) => { const v = sub(k.point, t.center); return { basket: k.index, latPx: r2(Math.abs(dot(v, nrm))), alongPx: r2(dot(v, u)) }; })
        .filter((h) => h.alongPx > best.distPx * 0.5).sort((a, b) => a.latPx - b.latPx);
      const h = hits[0];
      if (h) straight = { ...h, nextLatPx: hits[1]?.latPx ?? null,
        verdict: h.latPx <= bounds.straightLateralPx ? 'STRAIGHT_CANDIDATE' : 'NOT_STRAIGHT_OR_BASKET_UNSEEN' };
    }
    const inspect = verdict !== 'ASSOCIATED' || (best_ && best_.latPx > bounds.inspectLateralPx) || (straight && straight.verdict !== 'STRAIGHT_CANDIDATE' && straight.latPx < 10);
    return { tee: t.label, center: t.center.map(r2), thDeg: r2((t.thRad * 180) / Math.PI), candidates: cands, nearest, best: best_, ratio, verdict, inspect, pathSide: side,
      badgeOnPathSide: best_ && side?.sense ? best_.sense === side.sense : null, straight };
  });
}
