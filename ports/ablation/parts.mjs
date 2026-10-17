/**
 * The effect-matrix columns: one per downstream Part, each with the
 * geometric Contract that says when two branches hold the SAME member
 * (node-free). extractParts() adapts one branch's stage outputs into those
 * member lists, every member carrying its identity fields plus `draw`
 * geometry in SOURCE-image pixels (the flipbook draws over the source).
 *
 * Frames: S3 Parts and the native S4 state are canonical (S0-cropped)
 * raster coordinates; geometry.json, S5/S6 rows and S7 sourcePoints are
 * source pixels. Nothing on a Part says which, so this adapter knows:
 * canonical y + cropTopPx = source y.
 *
 * Positional ids ('tee-clean-7', 'basket-clean-9', 'ray:tee-clean-0:...')
 * are kept only as labels. They shift when an upstream list changes, which
 * is exactly why the join is by Contract.
 */
import teePose from '../../contracts/tee.pose@1.mjs';
import basketPose from '../../contracts/basket.pose@1.mjs';
import s4Resolution from '../../contracts/s4.resolution@1.mjs';
import s5Pair from '../../contracts/s5.pair@1.mjs';
import s6Row from '../../contracts/s6.row@1.mjs';
import s7Trace from '../../contracts/s7.trace@1.mjs';

const r1 = (v) => Math.round(v * 10) / 10;
const at = (p) => `${r1(p[0])},${r1(p[1])}`;

export const COLUMNS = Object.freeze([
  { id: 'S3:px.tees', stage: 'S3', part: 'px.tees', contract: teePose, label: (m) => `tee@${at(m.sourceCenter)}` },
  { id: 'S3:px.baskets', stage: 'S3', part: 'px.baskets', contract: basketPose, label: (m) => `basket@${at(m.draw.bbox)}` },
  { id: 'S4:px.s4.teeBadge.state', stage: 'S4', part: 'px.s4.teeBadge.state.resolutions', contract: s4Resolution,
    verdictOf: (m) => m.visibility, label: (m) => `H${m.hole}@${at(m.draw.points[0])}` },
  { id: 'S4:px.s5.axes', stage: 'S4', part: 'px.s5.axes (S4 visible + recovered tee axes; the S4->S5 handoff)', contract: teePose,
    verdictOf: (m) => m.kind, label: (m) => `${m.kind}@${at(m.center)}` },
  { id: 'S5:px.s5.rayBadgeHits', stage: 'S5', part: 'px.s5.rayBadgeHits', contract: s5Pair, label: (m) => `B${m.badgeLabel}<-tee@${at(m.teeCenter)}` },
  { id: 'S5:px.s5.globalAssignment', stage: 'S5', part: 'px.s5.globalAssignment.selected', contract: s5Pair, label: (m) => `B${m.badgeLabel}<-tee@${at(m.teeCenter)}` },
  { id: 'S6:px.s6.twoRayRows', stage: 'S6', part: 'px.s6.twoRayRows', contract: s6Row,
    verdictOf: (m) => m.status, label: (m) => `B${m.badgeLabel}<-tee@${at(m.teeCenter)}->top@${at(m.templateTop)}` },
  { id: 'S7:s7.traces', stage: 'S7', part: 's7 fresh-S6 heading traces', contract: s7Trace,
    verdictOf: (m) => m.outcome, label: (m) => `B${m.badgeLabel}${m.path.length ? `->${at(m.path.at(-1))}` : ' (no path)'}` }
]);

const shiftBox = ([x, y, w, h], top) => [x, y + top, w, h];

/**
 * sources: { s3: Map address->value | null, s4State | null, geometry, s5Pairs,
 *            assignment, s6Rows, s7 } (parsed JSON documents; any may be null)
 * Returns { [columnId]: [member] }, omitting a column whose source is absent.
 */
export function extractParts({ s3 = null, s4State = null, geometry = null, s5Pairs = null, assignment = null, s6Rows = null, s7 = null, cropTopPx }) {
  if (!Number.isInteger(cropTopPx)) throw new Error('extractParts: cropTopPx (S0 upper rows removed) required');
  const out = {};
  const labelOf = new Map((geometry?.badgePlates ?? []).map((b) => [b.detId, String(b.holeRead)]));
  const badge = (id) => { if (!labelOf.has(id)) throw new Error(`extractParts: badge ${id} has no label in geometry.badgePlates`); return labelOf.get(id); };
  if (s3?.has('px.tees')) out['S3:px.tees'] = s3.get('px.tees').map((t) => ({
    center: [...t.center], angleRad: t.angleRad, bbox: [...t.bbox], sourceCenter: [t.center[0], t.center[1] + cropTopPx],
    draw: { bbox: shiftBox(t.bbox, cropTopPx) }
  }));
  if (s3?.has('px.baskets')) out['S3:px.baskets'] = s3.get('px.baskets').map((b) => ({ bbox: [...b.bbox], draw: { bbox: shiftBox(b.bbox, cropTopPx) } }));
  if (s4State) out['S4:px.s4.teeBadge.state'] = s4State.resolutions.map((r) => ({
    hole: r.hole, center: [...r.center], visibility: r.visibility ?? null, draw: { points: [[r.center[0], r.center[1] + cropTopPx]] }
  }));
  if (geometry) out['S4:px.s5.axes'] = [
    ...geometry.baselineAxes.visible.map((a) => ({ kind: 'visible', a })),
    ...geometry.baselineAxes.recovered.map((a) => ({ kind: 'recovered', a }))
  ].map(({ kind, a }) => ({ kind, detId: a.detId, center: [...a.center], angleRad: a.angleRad, bbox: a.bbox, draw: { bbox: a.bbox } }));
  const hit = (h) => ({ id: h.id, badgeLabel: badge(h.badgeId), teeCenter: [...h.teeCenter], u: [...h.u], badgeCenter: [...h.badgeCenter], draw: { path: [h.teeCenter, h.badgeCenter] } });
  if (s5Pairs) out['S5:px.s5.rayBadgeHits'] = s5Pairs.rayBadgeHits.map(hit);
  if (assignment) out['S5:px.s5.globalAssignment'] = assignment.assignment.selected.map((s) => hit(s.hit));
  if (s6Rows) out['S6:px.s6.twoRayRows'] = s6Rows.rows.map((r) => ({
    id: r.id, badgeLabel: badge(r.badgeId), teeCenter: [...r.teeCenter], u: [...r.u], templateTop: [...r.templateTop], status: r.status,
    draw: { path: [r.teeCenter, r.badgeCenter, r.templateTop] }
  }));
  if (s7) out['S7:s7.traces'] = s7.traces.map((t) => {
    const path = (t.points ?? []).map((p) => [...p.sourcePoint]);
    return {
      hitId: t.hitId, badgeLabel: badge(t.badgeId), path,
      outcome: t.status === 'UNKNOWN' ? `UNKNOWN:${t.reason}` : `${t.outcome}:${t.basketIdReached ?? t.reason ?? ''}`,
      draw: { path }
    };
  });
  return out;
}
