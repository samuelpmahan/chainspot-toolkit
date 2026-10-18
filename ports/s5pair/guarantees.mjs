/**
 * The two FunctionalGuarantees every fn.Tee.pairBadge fork-join branch runs (site 'forkjoin'; browser-safe). Like
 * S4's (ports/s4recover/guarantees.mjs) they live here, not under fg/**.fg.mjs: this slot has no stage declaration
 * yet (stages/s5.json is the pinned S5); fg/registry.mjs runGuarantees runs them by value.
 *
 *   fg.s5.teeBadgePair.materialize  the branch's pairs are a pairing of tees with S1 badges: every tee finite and
 *     inside the raster, every tee paired at most once, every badge a pair names an S1 badge, every residual field
 *     finite with its unit declared; written as an artifact (pairs.json, with the badge plate centres) with a frame.
 *     Badges named by two tees are a recorded count (badgesPairedTwice), not a failure: one-to-one is S5's to reach.
 *   fg.s5.teeBadgePair.testimony  hole n's tee pairs with badge n (judgePairs): per tee right / wrong / none /
 *     unjudged, unmatched badges, annotated holes no tee matches. A judge, never a pass gate: findings are data.
 */
import { defineGuarantee } from '../../fg/guarantee.mjs';
import { PAIR_SLOT, ACCEPTANCE, judgePairs, badgeList } from './pairBadge.mjs';

const { part: PART, slot: SLOT } = PAIR_SLOT;
const RESIDUALS = ['angleResidualDeg', 'signedPerpPx', 'alongPx', 'distancePx'];

export const materialize = defineGuarantee({
  id: PAIR_SLOT.materialize,
  guards: [PART],
  reads: [PART, 'px.badges', 'tk.s4.badgePlates', 'px.image.cropped'],
  site: 'forkjoin',
  run(ctx) {
    const value = ctx.get(PART);
    if (!value || !Array.isArray(value.pairs)) ctx.fail(`${PART} is not { implementation, pairs: [...] }`);
    const badges = ctx.get('px.badges'), img = ctx.get('px.image.cropped'), plates = ctx.get('tk.s4.badgePlates');
    const P = value.pairs;
    const bad = P.map((p, i) => (Array.isArray(p.center) && p.center.every(Number.isFinite) && Number.isFinite(p.angleRad)
      && p.center[0] >= 0 && p.center[1] >= 0 && p.center[0] < img.widthPx && p.center[1] < img.heightPx ? null : i)).filter((i) => i !== null);
    ctx.check('teesFiniteInsideRaster', bad.length === 0, { bad });
    const keys = P.map((p) => `${p.origin} ${p.teeIndex}`), twiceTee = keys.filter((k, i) => keys.indexOf(k) !== i);
    const names = P.map((p) => p.tee), twiceName = names.filter((k, i) => names.indexOf(k) !== i);
    ctx.check('everyTeeAtMostOnce', twiceTee.length === 0 && twiceName.length === 0, { twiceTee, twiceName });
    const labels = new Set(badges.map((b) => String(b.label)));
    const unknownBadge = P.filter((p) => p.badge != null && !labels.has(String(p.badge))).map((p) => `${p.tee} -> ${p.badge}`);
    ctx.check('everyPairNamesAnS1Badge', unknownBadge.length === 0, { unknownBadge });
    const paired = P.filter((p) => p.badge != null);
    const nonFinite = paired.filter((p) => !RESIDUALS.every((k) => Number.isFinite(p[k]))).map((p) => `${p.tee} -> Badge ${p.badge}${p.unavailable ? `: ${p.unavailable}` : ''}`);
    const undeclared = RESIDUALS.filter((k) => typeof value.units?.[k] !== 'string');
    ctx.check('residualsUnitful', nonFinite.length === 0 && undeclared.length === 0, { nonFinite, undeclared, units: value.units ?? null });
    const said = paired.map((p) => String(p.badge)), badgesPairedTwice = [...new Set(said.filter((b, i) => said.indexOf(b) !== i))];
    const unmatchedBadges = [...labels].filter((l) => !said.includes(l));
    const rows = P.map((p) => ({ tee: p.tee, origin: p.origin, centerPx: p.center.join(', '), angleDeg: p.angleDeg, badge: p.badge, angleResidualDeg: p.angleResidualDeg, signedPerpPx: p.signedPerpPx, alongPx: p.alongPx, rule: p.rule }));
    const artifact = ctx.artifact('pairs', 'tee-badge-pairs-json', {
      schema: 'nctk-s5-tee-badge-pairs@1', slot: SLOT, part: PART, implementation: value.implementation, guarantee: PAIR_SLOT.materialize,
      frame: 'canonical (S0-cropped) px, pixel centers at integer coordinates', rule: value.rule, laneNotRun: value.laneNotRun ?? null, notes: value.notes ?? [],
      units: value.units ?? null, badgesN: badges.length, badges: badgeList(plates), unmatchedBadges, badgesPairedTwice, pairs: P
    }, undefined, { path: 'pairs.json' });
    ctx.frame({
      title: `${value.implementation}: ${paired.length} of ${P.length} tee(s) paired with a badge; ${unmatchedBadges.length} badge(s) unpaired of N = ${badges.length}${value.laneNotRun ? ` (${value.laneNotRun})` : ''}`,
      calculation: SLOT,
      parts: [
        { address: `${PART}#tees`, kind: 'points', data: { points: P.map((p) => [...p.center, `${p.tee}${p.badge != null ? ` -> Badge ${p.badge}` : ''}`]) } },
        { address: `${PART}#plates`, kind: 'points', data: { points: plates.map((b) => [...b.plateCenter, `Badge ${b.label}`]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows } },
        { address: `${PART}#artifact`, kind: 'scalar', artifact, data: { value: paired.length, unit: 'tee-badge pairs' } }
      ]
    });
    return { totals: { tees: P.length, paired: paired.length, unpairedTees: P.length - paired.length, badges: badges.length, unmatchedBadges: unmatchedBadges.length, badgesPairedTwice: badgesPairedTwice.length },
      implementation: value.implementation, laneNotRun: value.laneNotRun ?? null, unmatchedBadges, badgesPairedTwice };
  }
});

export const testimony = defineGuarantee({
  id: PAIR_SLOT.testimony,
  guards: [PART],
  reads: [PART, 'testimony.source.teePoints', 'tk.s4.badgePlates'],
  requires: [PAIR_SLOT.materialize],
  site: 'forkjoin',
  run(ctx) {
    const value = ctx.get(PART), tp = ctx.get('testimony.source.teePoints');
    const j = judgePairs(value.pairs, tp.points, ctx.get('tk.s4.badgePlates'));
    ctx.check('everyTeeJudgedOnce', j.rows.length === value.pairs.length, { rows: j.rows.length });
    ctx.frame({
      title: `${value.implementation} vs Sam: ${j.totals.right} right, ${j.totals.wrong} wrong, ${j.totals.none} none, ${j.totals.unjudged} unjudged; unmatched badges ${j.unmatchedBadges.join(' ') || 'none'}; holes with no tee ${j.missingTees.join(' ') || 'none'}`,
      calculation: SLOT,
      parts: [
        { address: 'testimony.tees', kind: 'points', data: { points: tp.points.map((p) => [...p.canonical, `hole ${p.hole}`]) } },
        { address: `${PART}#judge`, kind: 'ledger', data: { rows: j.rows.map((r) => ({ ...r, point: r.point.join(', '), saidCenter: r.saidCenter?.join(', ') ?? null, truthCenter: r.truthCenter?.join(', ') ?? null })) } }
      ],
      verdicts: j.rows.filter((r) => r.verdict !== 'unjudged').map((r) => ({ name: `${r.name} (hole ${r.hole}): ${r.verdict}${r.said != null ? ` -> Badge ${r.said}` : ''}${r.residualDeg != null ? `, residual ${r.residualDeg} deg` : ''}`, ok: r.verdict === 'right' })),
      receipt: { testimonyRule: tp.rule, matchPx: j.matchPx, acceptance: ACCEPTANCE }
    });
    return { totals: j.totals, rows: j.rows, unmatchedBadges: j.unmatchedBadges, missingTees: j.missingTees, judged: Boolean(tp.path), testimonyRule: tp.rule };
  }
});

export const GUARANTEES = [materialize, testimony];
