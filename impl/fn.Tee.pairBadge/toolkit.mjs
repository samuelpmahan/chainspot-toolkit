/**
 * fn.Tee.pairBadge / toolkit: the toolkit's own S5 pairs, from what its S3 and S4 already decided.
 *   S3 observed tees: the badge ports/s3assoc associated each visible pad with (Sam, 2026-10-17: an unoccluded pad
 *     pairs with at most 2 badges, one obviously better; global one-to-one by z), at the s3assoc AA-fit pose.
 *   S4 recovered tees: the badge each was recovered FOR (fn.Tee.recover, the accepted variant: px.tees.recovered).
 * The residual of every pair is measured here, by the store (fn.q.pair.axisResidual), against the badge plate centre
 * (tk.s4.badgePlates: the S1 dark plate part's bbox centre). No new signal decides anything: the pairs are S3's and S4's.
 */
import { PAIR_CALLS, PAIR_UNITS } from '../../fg/queries/pair.mjs';
import { nameCandidates } from '../../fg/names.mjs';

export const reads = ['px.tees.association', 'px.tees.recovered', 'tk.s4.badgePlates'];
export const calls = [...PAIR_CALLS];

const DEG = Math.PI / 180;

export default function toolkit(parts) {
  const assoc = parts.get('px.tees.association'), rec = parts.get('px.tees.recovered'), plates = parts.get('tk.s4.badgePlates');
  const plateOf = new Map(plates.map((b) => [String(b.label), b.plateCenter]));
  const residual = (center, angleRad, badge) => {
    const target = badge != null ? plateOf.get(String(badge)) : null;
    if (badge == null) return { angleResidualDeg: null, signedPerpPx: null, alongPx: null, distancePx: null };
    if (!target) return { unavailable: `Badge ${badge} has no plate in tk.s4.badgePlates`, angleResidualDeg: null, signedPerpPx: null, alongPx: null, distancePx: null };
    return parts.call('fn.q.pair.axisResidual', { center, angleRad, target }).value;
  };
  const rows = assoc.rows ?? [];
  const observed = rows.map((r, i) => {
    const angleRad = r.thDeg * DEG, badge = r.best ? String(r.best.badge) : null;
    return { tee: r.candidate, origin: 'S3 observed', teeIndex: i, center: r.center, angleRad, angleDeg: r.thDeg, badge, plateCenter: badge != null ? plateOf.get(badge) ?? null : null,
      ...residual(r.center, angleRad, badge), rule: badge != null ? `S3 association (${r.verdict}, z ${r.best.z})` : `S3 association: ${r.verdict}`,
      evidence: { s3assocVerdict: r.verdict, z: r.best?.z ?? null, s3assocResDeg: r.best?.resDeg ?? null } };
  });
  const R = rec.recovered ?? [];
  const names = nameCandidates('Tee', R, (t) => t.center).map((n) => `S4 ${n}`);
  const recovered = R.map((t, i) => {
    const badge = t.hole != null ? String(t.hole) : null;
    return { tee: names[i], origin: 'S4 recovered', teeIndex: i, center: t.center, angleRad: t.angleRad, angleDeg: t.angleDeg ?? Math.round(t.angleRad / DEG * 1000) / 1000, badge, plateCenter: badge != null ? plateOf.get(badge) ?? null : null,
      ...residual(t.center, t.angleRad, badge), rule: `S4 recovered for Badge ${badge} (fn.Tee.recover@${rec.variant ?? '?'}: ${t.rule ?? ''})`,
      evidence: { s4BadgeRayResidualDeg: t.badgeRayResidualDeg ?? null, confidence: t.confidence ?? null } };
  });
  return {
    rule: 'S3 observed tees: the s3assoc badge; S4 recovered tees: the badge each was recovered for; residuals measured by fn.q.pair.axisResidual against tk.s4.badgePlates plate centres',
    laneNotRun: null, notes: [assoc.absent, rec.absent].filter(Boolean),
    s4Variant: rec.variant ?? null, units: PAIR_UNITS,
    pairs: [...observed, ...recovered]
  };
}
