/**
 * Pure S5/S6 recovery behavior ported from the pinned replay scripts.
 * Geometry rows are measurements/candidates only; no row claims ownership.
 */

const rad = 180 / Math.PI;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const pair = p => Array.isArray(p) && p.length === 2 && p.every(finite);
const bbox4 = b => Array.isArray(b) && b.length === 4 && b.every(finite) && b[2] > 0 && b[3] > 0;

function validateInputs({ sealedAxes, badgePlates, templateTops, sourceRgb }) {
  if (!sealedAxes || !Array.isArray(sealedAxes.visible) || !Array.isArray(sealedAxes.recovered) || !Array.isArray(sealedAxes.unknown))
    throw new TypeError('sealedAxes must explicitly contain visible, recovered, and unknown arrays');
  if (!Array.isArray(badgePlates) || !Array.isArray(templateTops)) throw new TypeError('badgePlates and templateTops must be arrays');
  if (!sourceRgb || !Number.isInteger(sourceRgb.width) || !Number.isInteger(sourceRgb.height) ||
      !(sourceRgb.data instanceof Uint8Array) || sourceRgb.data.length !== sourceRgb.width * sourceRgb.height * 4)
    throw new TypeError('sourceRgb must be explicit RGBA Uint8Array with matching dimensions');
  const axes = [...sealedAxes.visible, ...sealedAxes.recovered];
  for (const a of axes) if (!a.detId || !pair(a.center) || !finite(a.angleRad)) throw new TypeError(`invalid sealed axis ${a?.detId ?? 'UNKNOWN'}`);
  for (const u of sealedAxes.unknown) if (!u.detId) throw new TypeError('unknown axis requires detId');
  for (const b of badgePlates) if (!b.detId || !pair(b.center) || !bbox4(b.plateBbox) || b.holeRead == null) throw new TypeError(`invalid badge plate ${b?.detId ?? 'UNKNOWN'}`);
  for (const t of templateTops) if (!t.basketId || !pair(t.top)) throw new TypeError(`invalid template top ${t?.basketId ?? 'UNKNOWN'}`);
  return axes;
}

function signedAxis(tee, point) {
  const dx = point[0] - tee.center[0], dy = point[1] - tee.center[1];
  let ux = Math.cos(tee.angleRad), uy = Math.sin(tee.angleRad);
  if (dx * ux + dy * uy < 0) { ux = -ux; uy = -uy; }
  const alongPx = dx * ux + dy * uy, signedPerpPx = -uy * dx + ux * dy;
  return { ux, uy, alongPx, signedPerpPx, distancePx: Math.hypot(dx, dy),
    angleResidualDeg: Math.atan2(Math.abs(signedPerpPx), Math.abs(alongPx)) * rad };
}

/** S5 centroid-to-centroid major-axis measures, each pair kept unowned. */
export function measureS5Pairs({ sealedAxes, badgePlates, templateTops, sourceRgb }) {
  const axes = validateInputs({ sealedAxes, badgePlates, templateTops, sourceRgb });
  const rows = [];
  for (const badge of badgePlates) {
    if (!Number.isInteger(Number(badge.holeRead)) || Number(badge.holeRead) <= 0) continue;
    for (const tee of axes) {
      const m = signedAxis(tee, badge.center);
      rows.push({ id: `s5:${tee.detId}:${badge.detId}`, teeId: tee.detId, badgeId: badge.detId,
        holeRead: badge.holeRead, teeCenter: tee.center, badgeCenter: badge.center,
        axisStart: [tee.center[0] - m.ux * 22, tee.center[1] - m.uy * 22],
        axisBadgeEndpoint: [tee.center[0] + m.ux * (m.alongPx + 20), tee.center[1] + m.uy * (m.alongPx + 20)],
        signedPerpPx: m.signedPerpPx, perpendicularPx: Math.abs(m.signedPerpPx),
        angleResidualDeg: m.angleResidualDeg, alongPx: m.alongPx, distancePx: m.distancePx,
        status: tee.conditionalTargetBadgeId&&tee.conditionalTargetBadgeId!==badge.detId?
          'TARGET_CONDITIONED_DIAGNOSTIC_ONLY':'MEASURED_PAIR_UNOWNED',
        axisTaintedByBadgeConstraint: Boolean(tee.axisTaintedByBadgeConstraint),
        axisConstraintProvenance: tee.axisConstraintProvenance ?? 'UNKNOWN',
        conditionalTargetProvenance: tee.conditionalTargetProvenance ?? null,
        sourceMark: tee.sourceMark ?? null, badgeMark: badge.sourceMark ?? null });
    }
  }
  return rows;
}

// Slab intersection over pixel-inclusive bbox [x,y,w,h], including x+w-1/y+h-1.
export function intersectRayBadgePlate(tee, u, bbox, margin = 2) {
  if (!pair(tee?.center) || !pair(u) || !bbox4(bbox) || !finite(margin) || margin < 0) throw new TypeError('invalid ray/plate arguments');
  const [x, y, w, h] = bbox; let enterPx = 0, exitPx = Infinity;
  for (const [origin, direction, low, high] of [[tee.center[0], u[0], x - margin, x + w - 1 + margin],
    [tee.center[1], u[1], y - margin, y + h - 1 + margin]]) {
    if (Math.abs(direction) < 1e-12) { if (origin < low || origin > high) return null; continue; }
    const a = (low - origin) / direction, b = (high - origin) / direction;
    enterPx = Math.max(enterPx, Math.min(a, b)); exitPx = Math.min(exitPx, Math.max(a, b));
  }
  return enterPx <= exitPx && exitPx > 0 ? { enterPx, exitPx } : null;
}

function sampleAxisRgb(rgb, tee, u, start, end) {
  let sampled = 0, bright = 0, dark = 0, longestDark = 0;
  for (let s = start + 12; s <= end - 12; s += 3) {
    const x = Math.round(tee.center[0] + u[0] * s), y = Math.round(tee.center[1] + u[1] * s);
    if (x < 0 || x >= rgb.width || y < 0 || y >= rgb.height) continue;
    const i = (y * rgb.width + x) * 4, on = Math.min(rgb.data[i], rgb.data[i + 1], rgb.data[i + 2]) >= 185;
    sampled++; bright += Number(on); dark = on ? 0 : dark + 1; longestDark = Math.max(longestDark, dark);
  }
  return { sourceFrame: 'source-rgb-pixels', rgbMin185: 185, spacingPx: 3, endpointExclusionPx: 12,
    sampled, bright, brightFraction: sampled ? bright / sampled : null,
    longestDarkApproxPx: sampled ? longestDark * 3 : null,
    interpretation: 'SOURCE_RGB_CONTEXT_ONLY; no ownership or continuity inferred' };
}

/** Both signed major-axis directions; retain all badge hits and ordinal evidence. */
export function measureS6RayHits({ sealedAxes, badgePlates, templateTops, sourceRgb, plateMarginPx = 2 }) {
  const axes = validateInputs({ sealedAxes, badgePlates, templateTops, sourceRgb });
  if (!finite(plateMarginPx) || plateMarginPx < 0) throw new TypeError('invalid plate margin');
  const hits = [];
  for (const tee of axes) for (const sign of [-1, 1]) {
    const u = [sign * Math.cos(tee.angleRad), sign * Math.sin(tee.angleRad)];
    const onRay = badgePlates.flatMap(b => {
      // A badge-conditioned recovered rectangle can measure other plates, but
      // cannot own their hits without a fresh fit to that badge. Pair diagnostics
      // above retain the geometry; only this candidate Part is restricted.
      if(tee.conditionalTargetBadgeId&&tee.conditionalTargetBadgeId!==b.detId)return [];
      const intersection = intersectRayBadgePlate(tee, u, b.plateBbox, plateMarginPx);
      if (!intersection) return [];
      const dx = b.center[0] - tee.center[0], dy = b.center[1] - tee.center[1];
      const badgeAlongPx = dx * u[0] + dy * u[1];
      if (!(badgeAlongPx > 0)) return [];
      return [{ id: `ray:${tee.detId}:${sign > 0 ? 'plus' : 'minus'}:${b.detId}`, teeId: tee.detId,
        sign, u, badgeId: b.detId, teeCenter: tee.center, badgeCenter: b.center, plateBbox: b.plateBbox,
        badgeMark: b.sourceMark ?? null, teeMark: tee.sourceMark ?? null,
        teeGeometrySource: tee.geometrySource ?? (tee.state ?? 'UNKNOWN'),
        axisTaintedByBadgeConstraint: Boolean(tee.axisTaintedByBadgeConstraint),
        axisConstraintProvenance: tee.axisConstraintProvenance ?? 'UNKNOWN',
        conditionalTargetProvenance: tee.conditionalTargetProvenance ?? null,
        badgeAlongPx, badgeSignedPerpPx: -u[1] * dx + u[0] * dy, ...intersection }];
    }).sort((a, b) => a.enterPx - b.enterPx || a.badgeId.localeCompare(b.badgeId));
    onRay.forEach((h, i) => hits.push({ ...h, rayHitOrdinal: i + 1, rayHitCount: onRay.length,
      association: 'AMBIGUOUS_RAY_HITS_UNOWNED',
      ambiguityReason: onRay.length > 1 ? 'MULTIPLE_PLATE_HITS_ON_SAME_RAY' : 'SINGLE_PLATE_HIT_STILL_UNOWNED' }));
  }
  return hits;
}

/** Evaluate every ray-hit × template-top row, including rejected geometry and reasons. */
export function measureS6ForwardTops({ hits, sealedAxes, templateTops, sourceRgb, s5Pairs = [], topPerpLimitPx = 16 }) {
  if (!Array.isArray(hits) || !finite(topPerpLimitPx) || topPerpLimitPx < 0) throw new TypeError('invalid forward-top arguments');
  const axes = validateInputs({ sealedAxes, badgePlates: [], templateTops, sourceRgb });
  const teeById = new Map(axes.map(t => [t.detId, t])), s5ById = new Map(s5Pairs.map(p => [p.id, p]));
  return hits.flatMap(hit => templateTops.map(top => {
    const tee = teeById.get(hit.teeId), dx = top.top[0] - tee.center[0], dy = top.top[1] - tee.center[1];
    const topAlongPx = dx * hit.u[0] + dy * hit.u[1], topSignedPerpPx = -hit.u[1] * dx + hit.u[0] * dy;
    const reasons = [];
    if (!(topAlongPx > hit.exitPx)) reasons.push('TOP_NOT_BEYOND_BADGE_PLATE');
    if (Math.abs(topSignedPerpPx) > topPerpLimitPx) reasons.push('TEMPLATE_TOP_OFF_RAY');
    const s5 = s5ById.get(`s5:${hit.teeId}:${hit.badgeId}`);
    return { id: `s6ray:${hit.teeId}:${hit.sign > 0 ? 'plus' : 'minus'}:${hit.badgeId}:${top.basketId}`,
      rayHitId: hit.id, teeId: hit.teeId, badgeId: hit.badgeId, basketId: top.basketId,
      sign: hit.sign, u: hit.u, teeCenter: hit.teeCenter, badgeCenter: hit.badgeCenter, plateBbox: hit.plateBbox,
      badgePlateEnterPx: hit.enterPx, badgePlateExitPx: hit.exitPx, badgeAlongPx: hit.badgeAlongPx,
      badgeSignedPerpPx: hit.badgeSignedPerpPx, rayHitOrdinal: hit.rayHitOrdinal, rayHitCount: hit.rayHitCount,
      s5MeasuredRelationId: s5?.id ?? null, s5SignedBadgePerpPx: s5?.signedPerpPx ?? null,
      teeGeometrySource: hit.teeGeometrySource, axisTaintedByBadgeConstraint: hit.axisTaintedByBadgeConstraint,
      axisConstraintProvenance: hit.axisConstraintProvenance,
      conditionalTargetProvenance: hit.conditionalTargetProvenance,
      badgeMark: hit.badgeMark, teeMark: hit.teeMark, templateTop: top.top,
      topAlongPx, topSignedPerpPx, topProvenance: 'BASKET_SPRITE_TEMPLATE_PREDICTION',
      status: reasons.length ? 'REJECTED_GEOMETRY' : 'TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED', reasons,
      association: hit.association, ambiguityReason: hit.ambiguityReason,
      teeBadgeRgb: reasons.length ? null : sampleAxisRgb(sourceRgb, tee, hit.u, 0, hit.enterPx),
      badgeTopRgb: reasons.length ? null : sampleAxisRgb(sourceRgb, tee, hit.u, hit.exitPx, topAlongPx) };
  }));
}

/** S6 two-ray measurement bundle. */
export function measureS6TwoRay({ sealedAxes, badgePlates, templateTops, sourceRgb, s5Pairs = [], plateMarginPx = 2, topPerpLimitPx = 16 }) {
  const hits = measureS6RayHits({ sealedAxes, badgePlates, templateTops, sourceRgb, plateMarginPx });
  const rows = measureS6ForwardTops({ hits, sealedAxes, templateTops, sourceRgb, s5Pairs, topPerpLimitPx });
  return { hits, rows, unknown: sealedAxes.unknown.map(u => ({ ...u, status: 'UNKNOWN_NO_FITTED_AXIS' })) };
}

export const S5S6_PARTS = Object.freeze({
  s5Axes: 'px.s5.sealedAxes', badgePlates: 'px.s1.sealedBadgePlates', templateTops: 'px.s6.sealedTemplateTops',
  s5Pairs: 'px.s5.sealedPairs', sourceRgb: 'px.s0.originalRgb', rayHits: 'px.s5.rayBadgeHits', s6Rows: 'px.s6.twoRayRows'
});

/** ABFeatureSet-compatible, two independently default-OFF bounded features. */
export function createRecoveryBehaviorFeatureSet({ plateMarginPx = 2, topPerpLimitPx = 16,
  topHitPart = S5S6_PARTS.rayHits } = {}) {
  const hitSpec = { id: 's5.twoRayBadgeHits', kind: 'compute', gate: 'S5', unit: 'two-ray',
    consumes: [S5S6_PARTS.s5Axes, S5S6_PARTS.badgePlates, S5S6_PARTS.templateTops, S5S6_PARTS.sourceRgb], produces: [S5S6_PARTS.rayHits],
    calculations: ['fn.s5.rayPlateIntersection'], accessConformance: 'exact', features: ['s5MajorAxisMetrics'] };
  const topSpec = { id: 's6.twoRayBasketTops', kind: 'compute', gate: 'S6', unit: 'two-ray',
    consumes: [topHitPart, S5S6_PARTS.templateTops, S5S6_PARTS.s5Axes, S5S6_PARTS.s5Pairs, S5S6_PARTS.sourceRgb],
    produces: [S5S6_PARTS.s6Rows], calculations: ['fn.s6.forwardBasketTop'], accessConformance: 'exact', features: ['s6TwoRay'] };
  const s5Spec = { id: 's5.majorAxisBadgeMetrics', kind: 'compute', gate: 'S5', unit: 'major-axis',
    consumes: [S5S6_PARTS.s5Axes, S5S6_PARTS.badgePlates, S5S6_PARTS.templateTops, S5S6_PARTS.sourceRgb],
    produces: [S5S6_PARTS.s5Pairs], calculations: ['fn.s5.centroidMetrics'], accessConformance: 'exact', features: ['s5MajorAxisMetrics'] };
  const s5 = { id: 's5MajorAxisMetrics', gate: 'G5', kind: 'deviation', defaultEnabled: false, resolveOnlyWhenConfigured: true,
    knobs: {plateMarginPx:{default:plateMarginPx,validate:n=>finite(n)&&n>=0&&n<=10?null:'must be 0..10 px'}}, operations: [{ spec: s5Spec, calculationBindings: [{ address: s5Spec.calculations[0], calculate: measureS5Pairs }],
      run(board) { board.set(S5S6_PARTS.s5Pairs, measureS5Pairs({ sealedAxes: board.get(S5S6_PARTS.s5Axes),
        badgePlates: board.get(S5S6_PARTS.badgePlates), templateTops: board.get(S5S6_PARTS.templateTops), sourceRgb: board.get(S5S6_PARTS.sourceRgb) })); } },
      { spec: hitSpec, calculationBindings: [{ address: hitSpec.calculations[0], calculate: measureS6RayHits }],
        run(board) { board.set(S5S6_PARTS.rayHits, measureS6RayHits({ sealedAxes: board.get(S5S6_PARTS.s5Axes),
          badgePlates: board.get(S5S6_PARTS.badgePlates), templateTops: board.get(S5S6_PARTS.templateTops),
          sourceRgb: board.get(S5S6_PARTS.sourceRgb), plateMarginPx })); } }] };
  const s6 = { id: 's6TwoRay', gate: 'G6', kind: 'deviation', defaultEnabled: false, resolveOnlyWhenConfigured: true,
    knobs: { topPerpLimitPx: { default: topPerpLimitPx, validate: n => finite(n) && n >= 0 && n <= 50 ? null : 'must be 0..50 px' } },
    operations: [
      { spec: topSpec, calculationBindings: [{ address: topSpec.calculations[0], calculate: measureS6ForwardTops }],
        run(board) { const axes = board.get(S5S6_PARTS.s5Axes);
          board.set(S5S6_PARTS.s6Rows, measureS6ForwardTops({ hits: board.get(topHitPart), sealedAxes: axes,
            templateTops: board.get(S5S6_PARTS.templateTops), sourceRgb: board.get(S5S6_PARTS.sourceRgb),
            s5Pairs: board.get(S5S6_PARTS.s5Pairs), topPerpLimitPx })); } }
    ] };
  return { id: 'recovery.behavior', seededSlots: [S5S6_PARTS.s5Axes, S5S6_PARTS.badgePlates, S5S6_PARTS.templateTops, S5S6_PARTS.sourceRgb], features: [s5, s6] };
}
