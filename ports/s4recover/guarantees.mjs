/**
 * The two FunctionalGuarantees every fn.Tee.recover fork-join branch runs
 * (site 'forkjoin'; browser-safe). They live here, not under fg/**.fg.mjs,
 * because this slot has no stage declaration yet (stages/s4.json is pinned
 * S4); fg/registry.mjs runGuarantees runs them by value.
 *
 *   fg.s4.teeRecover.materialize  the branch's recovered set is a set of
 *     poses on S1 badges: every tee finite, inside the raster, naming an S1
 *     badge, at most one per badge, and S3 tees + recovered <= N badges;
 *     written as an artifact (pixel sets omitted) with a frame
 *   fg.s4.teeRecover.testimony  judged against Sam's annotation (tee points
 *     are ring-hole centroids, canonical frame): a recovered tee LANDS when
 *     an annotated tee point is within hitRadiusPx (3 px); it is an
 *     IMPOSTOR otherwise; per tee the error in px to the nearest annotated
 *     point and whether that point's hole is the badge it was recovered for.
 *     Still-missing holes: annotated holes no S3 tee and no recovered tee
 *     lands on. A judge, never a pass gate: findings are data.
 */
import { defineGuarantee } from '../../fg/guarantee.mjs';
import { TEE_RECOVER_SLOT, ACCEPTANCE } from './teeRecover.mjs';

const { part: PART, slot: SLOT } = TEE_RECOVER_SLOT;
const r3 = (v) => Math.round(v * 1000) / 1000;
const stripPx = (t) => ({ ...t, evidence: t.evidence ? { ...t.evidence, visibleFramePxSet: undefined, visibleFramePxCount: t.evidence.visibleFramePxSet?.length } : t.evidence });

export const materialize = defineGuarantee({
  id: TEE_RECOVER_SLOT.materialize,
  guards: [PART],
  reads: [PART, 'px.badges', 'px.tees.refined', 'px.image.cropped'],
  site: 'forkjoin',
  run(ctx) {
    const value = ctx.get(PART);
    if (!value || !Array.isArray(value.recovered)) ctx.fail(`${PART} is not { implementation, recovered: [...] }`);
    const badges = ctx.get('px.badges'), s3 = ctx.get('px.tees.refined'), img = ctx.get('px.image.cropped');
    const rec = value.recovered;
    const bad = rec.map((t, i) => (Array.isArray(t.center) && t.center.every(Number.isFinite) && Number.isFinite(t.angleRad)
      && t.center[0] >= 0 && t.center[1] >= 0 && t.center[0] < img.widthPx && t.center[1] < img.heightPx ? null : i)).filter((i) => i !== null);
    ctx.check('posesFiniteInsideRaster', bad.length === 0, { bad });
    const unknownHole = rec.filter((t) => !badges.some((b) => b.label === t.hole)).map((t) => t.hole);
    ctx.check('holesAreBadges', unknownHole.length === 0, { unknownHole });
    const holes = rec.map((t) => t.hole);
    const twice = holes.filter((h, i) => holes.indexOf(h) !== i);
    ctx.check('onePerBadge', twice.length === 0, { twice });
    ctx.check('cardinalityAtMostN', s3.length + rec.length <= badges.length, { s3TeesCount: s3.length, recoveredCount: rec.length, badgesN: badges.length });
    const rows = rec.map(stripPx);
    const artifact = ctx.artifact('recovered', 'tee-recovered-json', {
      schema: 'nctk-s4-tee-recovered@1', slot: SLOT, part: PART, implementation: value.implementation, guarantee: TEE_RECOVER_SLOT.materialize,
      frame: 'canonical (S0-cropped) px, pixel centers at integer coordinates', s3TeesCount: s3.length, badgesN: badges.length,
      template: value.template ?? null, assignment: value.assignment ?? null, searchRadiusPx: value.searchRadiusPx ?? null, searchRule: value.searchRule ?? null,
      need: value.need ?? null, rounds: value.rounds ?? null, evaluatedPoses: value.evaluatedPoses ?? null,
      recovered: rows, missed: value.missed ?? [], log: value.log ?? []
    }, undefined, { path: 'recovered.json' });
    ctx.frame({
      title: `${value.implementation}: ${rec.length} recovered tee(s), S3 ${s3.length} + ${rec.length} of N = ${badges.length} badges`, calculation: SLOT,
      parts: [
        { address: `${PART}#corners`, kind: 'points', data: { points: rec.flatMap((t) => (t.corners ?? []).map((c) => [...c, `hole ${t.hole}`])) } },
        { address: `${PART}#centers`, kind: 'points', data: { points: rec.map((t) => [...t.center, `hole ${t.hole}`]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: rows.map((t) => ({ hole: t.hole, centerPx: t.center.join(', '), angleDeg: t.angleDeg, sizePx: (t.sizePx ?? []).join(' x '), badgeRayResidualDeg: t.badgeRayResidualDeg, visibleFramePx: t.evidence?.visibleFramePx, negativePx: (t.evidence?.negativeFramePx ?? 0) + (t.evidence?.negativeInteriorPx ?? 0), occludedBy: JSON.stringify(t.evidence?.occludedBy ?? {}), confidence: t.confidence })) } },
        { address: `${PART}#artifact`, kind: 'scalar', artifact, data: { value: rec.length, unit: 'tees' } }
      ]
    });
    return { totals: { recovered: rec.length, s3Tees: s3.length, badges: badges.length, missed: (value.missed ?? []).length }, implementation: value.implementation };
  }
});

export function judgeRecovered(recovered, points, s3Tees, hitRadiusPx = TEE_RECOVER_SLOT.hitRadiusPx) {
  const near = (c) => points.map((p) => ({ hole: p.hole, distancePx: Math.hypot(p.canonical[0] - c[0], p.canonical[1] - c[1]) })).sort((a, b) => a.distancePx - b.distancePx)[0] ?? null;
  const s3Holes = new Set(points.filter((p) => s3Tees.some((t) => Math.hypot(t.center[0] - p.canonical[0], t.center[1] - p.canonical[1]) <= hitRadiusPx)).map((p) => p.hole));
  // Sam's tee points are the centroid of the VISIBLE hole (golden 12: 4.4 px
  // toward the visible side of an occluded pad). Testimony is therefore judged
  // against the recovered visible-interior centroid when the implementation
  // reports one; the full-pad-centre error is reported beside it.
  const verdicts = recovered.map((t, index) => {
    const at = t.visibleCenter ?? t.center;
    const n = near(at);
    const lands = Boolean(n && n.distancePx <= hitRadiusPx);
    const own = points.find((p) => String(p.hole) === String(t.hole));
    return {
      index, hole: t.hole, center: t.center, visibleCenter: t.visibleCenter ?? null,
      nearestHole: n?.hole ?? null, nearestDistancePx: n ? r3(n.distancePx) : null,
      ownHoleErrorPx: own ? r3(Math.hypot(own.canonical[0] - at[0], own.canonical[1] - at[1])) : null,
      padCentreErrorPx: own ? r3(Math.hypot(own.canonical[0] - t.center[0], own.canonical[1] - t.center[1])) : null,
      verdict: lands ? (String(n.hole) === String(t.hole) ? 'lands-own-hole' : 'lands-other-hole') : 'impostor',
      onS3Hole: lands ? s3Holes.has(n.hole) : false
    };
  });
  const landed = new Set(verdicts.filter((v) => v.verdict !== 'impostor').map((v) => v.nearestHole));
  const stillMissing = points.filter((p) => !s3Holes.has(p.hole) && !landed.has(p.hole)).map((p) => p.hole);
  const errs = verdicts.filter((v) => v.verdict !== 'impostor').map((v) => v.nearestDistancePx);
  return {
    hitRadiusPx, verdicts,
    s3CoveredHoles: [...s3Holes].sort((a, b) => a - b),
    stillMissing,
    totals: {
      recovered: recovered.length,
      landsOwnHole: verdicts.filter((v) => v.verdict === 'lands-own-hole').length,
      landsOtherHole: verdicts.filter((v) => v.verdict === 'lands-other-hole').length,
      impostors: verdicts.filter((v) => v.verdict === 'impostor').length,
      meanErrorPx: errs.length ? r3(errs.reduce((a, b) => a + b, 0) / errs.length) : null,
      maxErrorPx: errs.length ? r3(Math.max(...errs)) : null,
      stillMissing: stillMissing.length
    }
  };
}

export const testimony = defineGuarantee({
  id: TEE_RECOVER_SLOT.testimony,
  guards: [PART],
  reads: [PART, 'testimony.source.teePoints', 'px.tees.refined'],
  requires: [TEE_RECOVER_SLOT.materialize],
  site: 'forkjoin',
  run(ctx) {
    const value = ctx.get(PART);
    const tp = ctx.get('testimony.source.teePoints');
    const j = judgeRecovered(value.recovered, tp.points, ctx.get('px.tees.refined'));
    ctx.check('everyTeeJudgedOnce', j.verdicts.length === value.recovered.length, { verdicts: j.verdicts.length });
    ctx.frame({
      title: `${value.implementation} vs Sam: ${j.totals.landsOwnHole} land on their hole, ${j.totals.landsOtherHole} on another hole, ${j.totals.impostors} impostor(s); still missing ${j.stillMissing.join(' ') || 'none'}`,
      calculation: SLOT,
      parts: [
        { address: 'testimony.tees', kind: 'points', data: { points: tp.points.map((p) => [...p.canonical, `hole ${p.hole}`]) } },
        { address: `${PART}#centers`, kind: 'points', data: { points: value.recovered.map((t) => [...t.center, `hole ${t.hole}`]) } },
        { address: `${PART}#judge`, kind: 'ledger', data: { rows: j.verdicts.map((v) => ({ ...v, center: v.center.join(', ') })) } }
      ],
      verdicts: j.verdicts.map((v) => ({ name: `hole ${v.hole}: ${v.verdict} (nearest annotated hole ${v.nearestHole} at ${v.nearestDistancePx} px)`, ok: v.verdict === 'lands-own-hole' })),
      receipt: { testimonyRule: tp.rule, hitRadiusPx: j.hitRadiusPx, acceptance: ACCEPTANCE }
    });
    return { totals: j.totals, verdicts: j.verdicts, stillMissing: j.stillMissing, s3CoveredHoles: j.s3CoveredHoles, testimonyRule: tp.rule };
  }
});

export const GUARANTEES = [materialize, testimony];
