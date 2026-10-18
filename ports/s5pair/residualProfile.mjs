/**
 * S5 learning (docs/agents/lanes-s5s7.md, agent B): the course-local residual of a tee's long axis against the ray to
 * its badge, on the holes whose path is straight. DOCTRINE S5: "a tee's long axis points directly at its badge;
 * residual indicts the tee fit". The measurement the pairing (fn.Tee.pairBadge, agent A) rides on.
 *
 *   fn.tk.s5.residualProfile -> tk.s5.residualProfile
 *     inParts  px.tees, px.badges, px.baskets, px.image.cropped (the S3 board), testimony.s5.straightHoles (the
 *              straight-pair truth: Sam's holes with no corridor bend, the judge's S5straight set), tk.s7.alphaProfile
 *              (contracts/alpha.profile@1; the runner produces the recorded noProfile condition when S7 has not run)
 *     calls    fn.q.pair.axis, fn.q.pair.plate, fn.q.pair.residual (ports/s5pair/pairSpace.mjs)
 *     Every S3 tee is fitted twice through fn.q.pair.axis (the S3 association's two passes: free shape, then the course
 *     template = median shape of the clean free fits, pose only). A tee is paired for this measurement with the badge
 *     of the hole whose testimony tee point is within the tee match rule (8 px); that pairing is the truth this
 *     profile learns from, never a pairing decision. Per course: the distribution (n, mean, sigma, median, max |.|) of
 *     angleResidualDeg and signedPerpPx over the straight pairs, raw and (when a profile carries fill classes)
 *     un-composited; bent pairs are listed beside it as a referent, never mixed in.
 *   fn.tk.s5.residualStrips -> tk.s5.residualStrips (a derived view: per pair, the pad crop and the badge crop with the
 *     axis line, the ray and both centres; rendered by fg/render.mjs case 'strips')
 */
import { r3 } from './pairSpace.mjs';
import { nameCandidates } from '../../fg/names.mjs';
import { ALPHA_PROFILE_PART } from '../../contracts/alpha.profile@1.mjs';
import { ASSOC_BOUNDS } from '../s3assoc/associate.mjs';

export const RESIDUAL_PROFILE_PART = 'tk.s5.residualProfile';
export const RESIDUAL_STRIPS_PART = 'tk.s5.residualStrips';
export const STRAIGHT_TRUTH_PART = 'testimony.s5.straightHoles';
/** The frozen S3 association (baselines/s3assoc/<course>.json): the recorded per-hole z the 76/76 came from. */
export const RECORDED_ASSOC_PART = 'tk.s5.recordedAssociation';
/**
 * The recorded signal (docs/evidence/s7main/README.md "Two independent geometric signals"; docs/evidence/s3assoc):
 * a pad's axis lines up with its own badge when z = lateral / sqrt(sigma0^2 + (dist x sigma_theta)^2) <= 3 with the
 * badge 40-230 px away; sigma0 = 0.85 px (76 confirmed pairings), sigma_theta = the pad's own profile-curvature angle
 * sigma, floored at 0.0005 rad (ports/s3assoc/associate.mjs ASSOC_BOUNDS, the rule as shipped). Recorded: 76/76 real
 * pads on golden, lenard, townelake, heritage, alex; a random angle at the real position 1.7% (own badge).
 */
export const LINE_UP_RULE = Object.freeze({ zMax: ASSOC_BOUNDS.zMax, sigma0Px: ASSOC_BOUNDS.sigma0Px, sigmaThetaFloorRad: ASSOC_BOUNDS.sigmaThetaFloorRad, minDistPx: 40, maxDistPx: 230, recorded: '76/76 real pads (golden, lenard, townelake, heritage, alex)' });
export const zOf = (signedPerpPx, distancePx, sigmaThDeg) => Math.abs(signedPerpPx) / Math.sqrt(LINE_UP_RULE.sigma0Px ** 2 + (distancePx * Math.max((sigmaThDeg * Math.PI) / 180, LINE_UP_RULE.sigmaThetaFloorRad)) ** 2);
const linesUp = (r) => r.z <= LINE_UP_RULE.zMax && r.distancePx >= LINE_UP_RULE.minDistPx && r.distancePx <= LINE_UP_RULE.maxDistPx;
/** How far a fit's |angle residual| may sit from the course's straight-hole mean before the residual indicts it (z). */
export const INDICT_Z = 3;

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** n, mean, sigma (sample), median, max |x| of a list; unit-bearing names from `unit` ('Deg' | 'Px'). */
export function distribution(xs, unit) {
  const n = xs.length;
  if (!n) return { n: 0, [`mean${unit}`]: null, [`sigma${unit}`]: null, [`median${unit}`]: null, [`maxAbs${unit}`]: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sigma = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, [`mean${unit}`]: r3(mean), [`sigma${unit}`]: sigma == null ? null : r3(sigma), [`median${unit}`]: r3(median(xs)), [`maxAbs${unit}`]: r3(Math.max(...xs.map(Math.abs))) };
}

const profileOf = (rows, pick) => ({
  signedAngleResidualDeg: distribution(rows.map((r) => pick(r).signedAngleResidualDeg), 'Deg'),
  signedPerpPx: distribution(rows.map((r) => pick(r).signedPerpPx), 'Px'),
  angleResidualDeg: distribution(rows.map((r) => pick(r).angleResidualDeg), 'Deg')
});

const PROFILE_UNITS = Object.freeze({
  signedAngleResidualDeg: 'deg: tee axis (fn.q.pair.axis, course template, pose fit) to the ray tee centre -> badge plate centre; + = badge right of the axis facing it (screen y down)',
  angleResidualDeg: 'deg: the same angle, unsigned (fn.q.pair.residual, the stage\'s definition)',
  z: 'z: |signedPerpPx| / sqrt(0.85^2 + (distancePx x max(sigma_theta, 0.0005 rad))^2), the shipped association rule',
  signedPerpPx: 'px: badge plate centre off the tee axis line, same sign',
  alongPx: 'px: tee centre to badge plate centre along the axis',
  sigma: 'sample standard deviation (n - 1) over the straight pairs of this course'
});

export const S5_RESIDUAL_CALCULATIONS = Object.freeze([
  ['fn.tk.s5.residualProfile', {
    inParts: ['px.tees', 'px.badges', 'px.baskets', 'px.image.cropped', STRAIGHT_TRUTH_PART, RECORDED_ASSOC_PART, ALPHA_PROFILE_PART],
    outParts: [RESIDUAL_PROFILE_PART],
    calls: ['fn.q.pair.axis', 'fn.q.pair.plate', 'fn.q.pair.residual'],
    calculate: (io) => {
      const tees = io.in('px.tees'), badges = io.in('px.badges'), truth = io.in(STRAIGHT_TRUTH_PART), profile = io.in(ALPHA_PROFILE_PART);
      const course = truth.course ?? null;
      const q = (fn, args) => io.call(fn, args).value;
      const refs = { raster: 'px.image.cropped', tees: 'px.tees', badges: 'px.badges', baskets: 'px.baskets' };
      // pass 1: free shape; the course template is the median shape of the clean free fits (pads are rigid per image)
      const free = tees.map((_, i) => q('fn.q.pair.axis', { ...refs, teeIndex: i }));
      const clean = free.filter((f) => f.clean && f.shape);
      const template = clean.length ? { L: median(clean.map((f) => f.shape.L)), W: median(clean.map((f) => f.shape.W)), se: median(clean.map((f) => f.shape.se)), ss: median(clean.map((f) => f.shape.ss)) } : null;
      const templateRule = clean.length ? `median shape of ${clean.length} clean free-shape fits of ${tees.length} S3 tees (px)` : 'no clean pad: free-shape fits only';
      // pass 2: pose only against the template; raw raster, and un-composited when the profile carries fill classes
      const raw = tees.map((_, i) => (template ? q('fn.q.pair.axis', { ...refs, teeIndex: i, template }) : free[i]));
      const profiled = profile?.status !== 'no alpha profile';
      const unmixed = profiled ? tees.map((_, i) => q('fn.q.pair.axis', { ...refs, teeIndex: i, template, alphaProfile: ALPHA_PROFILE_PART })) : null;
      const alphaCondition = profiled ? (unmixed.find((u) => u.alpha?.status === 'applied')?.alpha ?? unmixed[0]?.alpha ?? profile) : profile;

      const names = nameCandidates('Tee', tees, (t) => t.center);
      const plates = badges.map((_, j) => q('fn.q.pair.plate', { badges: 'px.badges', index: j }));
      const holes = truth.holes ?? [];
      const matchPx = truth.matchTeePx;
      const res = (a, j) => { const v = q('fn.q.pair.residual', { center: a.center, axis: a.dirUnit, plate: plates[j].center }); return { ...v, z: r3(zOf(v.signedPerpPx, v.distancePx, a.sigma.thDeg)) }; };
      const rows = tees.map((t, i) => {
        const a = raw[i];
        const near = holes.map((h) => ({ h, d: Math.hypot(h.tee[0] - a.center[0], h.tee[1] - a.center[1]) })).sort((x, y) => x.d - y.d)[0];
        const base = { tee: names[i], teeIndex: i, center: a.center.map(r3), axisDeg: r3(a.angleDeg), freeAxisDeg: r3(free[i].angleDeg), clean: a.clean, rmsRgb: r3(a.rmsRgb), sigmaThDegRaw: r3(a.sigma.thDeg) };
        if (!near || near.d > matchPx) return { ...base, status: holes.length ? 'no testimony tee within the match rule' : 'no testimony', nearestTestimonyPx: near ? r3(near.d) : null };
        const j = badges.findIndex((b) => String(b.label) === String(near.h.hole));
        if (j < 0) return { ...base, hole: near.h.hole, testimonyPx: r3(near.d), status: `no S1 badge labelled ${near.h.hole}` };
        const r = res(a, j), u = unmixed ? res(unmixed[i], j) : null;
        return {
          ...base, hole: near.h.hole, identity: `Tee ${near.h.hole}`, testimonyPx: r3(near.d), badge: `Badge ${badges[j].label}`, badgeIndex: j, plateCenter: plates[j].center.map(r3),
          straight: !near.h.bent, status: near.h.bent ? 'bent (referent)' : 'straight',
          signedAngleResidualDeg: r.signedAngleResidualDeg, angleResidualDeg: r.angleResidualDeg, signedPerpPx: r.signedPerpPx, alongPx: r.alongPx, distancePx: r.distancePx,
          z: r.z, linesUp: linesUp(r),
          ...(u ? { unmixed: { signedAngleResidualDeg: u.signedAngleResidualDeg, angleResidualDeg: u.angleResidualDeg, signedPerpPx: u.signedPerpPx, z: u.z, linesUp: linesUp(u), axisDeg: r3(unmixed[i].angleDeg), unmixedPx: unmixed[i].unmixedPx } } : {})
        };
      });
      const paired = rows.filter((r) => r.signedAngleResidualDeg != null), straight = paired.filter((r) => r.straight), bent = paired.filter((r) => r.straight === false);
      const rawProfile = profileOf(straight, (r) => r);
      // the residual indicts a fit (DOCTRINE S5) when it sits beyond INDICT_Z course-local sigmas of the straight mean
      const m = rawProfile.signedAngleResidualDeg.meanDeg, s = rawProfile.signedAngleResidualDeg.sigmaDeg;
      for (const r of paired) r.zCourse = s ? r3((r.signedAngleResidualDeg - m) / s) : null;
      // the recorded signal, reproduced first: every paired pad (the tee -> badge segment is straight on every hole)
      const recorded = io.in(RECORDED_ASSOC_PART);
      const recHoles = recorded?.holes ? Object.entries(recorded.holes).map(([h, b]) => ({ hole: Number(h), z: b.z, latPx: b.latPx, badge: b.badgeLabel })) : [];
      const recLinesUp = recHoles.filter((h) => String(h.badge) === String(h.hole) && h.z <= LINE_UP_RULE.zMax);
      const ours = paired.filter(linesUp);
      const perHole = paired.map((r) => { const h = recHoles.find((x) => x.hole === r.hole); return { hole: r.hole, tee: r.tee, z: r.z, linesUp: r.linesUp, recordedZ: h?.z ?? null, recordedLinesUp: h ? String(h.badge) === String(h.hole) && h.z <= LINE_UP_RULE.zMax : null }; });
      const changed = perHole.filter((p) => p.recordedLinesUp !== null && p.recordedLinesUp !== p.linesUp).map((p) => `Hole ${p.hole}`);
      const lineUp = {
        rule: LINE_UP_RULE, nPads: paired.length, linesUpWithOwnBadge: ours.length, fraction: paired.length ? r3(ours.length / paired.length) : null,
        allPairs: profileOf(paired, (r) => r),
        recorded: recorded?.holes ? { source: recorded.source, frozenPairs: recHoles.length, linesUpWithOwnBadge: recLinesUp.length } : (recorded ?? { status: 'no recorded association' }),
        verdict: !recorded?.holes ? 'no recorded association to compare' : !changed.length && ours.length === paired.length && recLinesUp.length === recHoles.length ? `same: ${ours.length}/${paired.length} line up, as recorded (${recLinesUp.length}/${recHoles.length} frozen)` : `changed: ${ours.length}/${paired.length} line up vs recorded ${recLinesUp.length}/${recHoles.length}${changed.length ? `; differs on ${changed.join(', ')}` : ''}`,
        perHole
      };
      for (const r of paired) if (r.zCourse != null && Math.abs(r.zCourse) > INDICT_Z) r.status = `${r.status}; indicted (|z| > ${INDICT_Z})`;
      const condition = !holes.length ? (truth.status ?? 'no testimony') : !straight.length ? 'no straight pair' : null;
      const value = {
        schema: 'nctk-s5-residual-profile@1', course, part: RESIDUAL_PROFILE_PART, units: PROFILE_UNITS,
        truth: { source: truth.source ?? null, rule: truth.rule ?? null, matchTeePx: matchPx },
        template: template ? Object.fromEntries(Object.entries(template).map(([k, v]) => [k, r3(v)])) : null, templateRule,
        alpha: alphaCondition,
        condition,
        lineUp,
        straight: { raw: rawProfile, ...(unmixed ? { unmixed: profileOf(straight, (r) => r.unmixed) } : { unmixed: alphaCondition }) },
        bentReferent: profileOf(bent, (r) => r),
        counts: { tees: tees.length, paired: paired.length, straightPairs: straight.length, bentPairs: bent.length, unpaired: rows.length - paired.length, indicted: paired.filter((r) => r.status.includes('indicted')).length },
        rows,
        emits: {
          straightPairs: straight.length, bentPairs: bent.length,
          pads: paired.length, padsLiningUpWithOwnBadge: ours.length,
          allPairsAngleSigmaDeg: lineUp.allPairs.signedAngleResidualDeg.sigmaDeg, allPairsPerpSigmaPx: lineUp.allPairs.signedPerpPx.sigmaPx,
          angleResidualSigmaDeg: rawProfile.signedAngleResidualDeg.sigmaDeg, angleResidualMeanDeg: rawProfile.signedAngleResidualDeg.meanDeg,
          signedPerpSigmaPx: rawProfile.signedPerpPx.sigmaPx, signedPerpMeanPx: rawProfile.signedPerpPx.meanPx,
          unmixedPx: unmixed ? unmixed.reduce((a, u) => a + (u.unmixedPx ?? 0), 0) : 0, alphaProfile: profiled ? 1 : 0
        }
      };
      return { [RESIDUAL_PROFILE_PART]: value };
    }
  }],
  ['fn.tk.s5.residualStrips', {
    inParts: ['px.image.cropped', RESIDUAL_PROFILE_PART],
    outParts: [RESIDUAL_STRIPS_PART],
    calculate: (io) => {
      const img = io.in('px.image.cropped'), P = io.in(RESIDUAL_PROFILE_PART);
      const strips = P.rows.filter((r) => r.signedAngleResidualDeg != null).sort((a, b) => a.hole - b.hole).map((r) => stripOf(img, r));
      return { [RESIDUAL_STRIPS_PART]: { schema: 'nctk-s5-residual-strips@1', course: P.course, strips, legend: STRIP_LEGEND, scale: STRIP_SCALE, emits: { strips: strips.length } } };
    }
  }]
]);

export const STRIP_SCALE = 4;
export const STRIP_HALF_PX = 22;
export const STRIP_COLORS = Object.freeze({ straight: [40, 210, 90], bent: [255, 165, 0], indicted: [235, 40, 40], ray: [0, 200, 255], centre: [255, 0, 255] });
export const STRIP_LEGEND = Object.freeze([
  { color: STRIP_COLORS.straight, meaning: 'tee axis (fn.q.pair.axis, course template), straight hole: in the profile' },
  { color: STRIP_COLORS.bent, meaning: 'tee axis, bent hole: referent only, not in the profile' },
  { color: STRIP_COLORS.indicted, meaning: `tee axis whose angle residual sits beyond ${INDICT_Z} course sigma of the straight mean: the residual indicts the fit` },
  { color: STRIP_COLORS.ray, meaning: 'ray tee centre -> badge plate centre' },
  { color: STRIP_COLORS.centre, meaning: 'tee centre (left panel), badge plate centre (right panel)' }
]);

/** One strip: the pad crop and the badge crop (2 x STRIP_HALF_PX px each), the axis line, the ray and both centres. */
function stripOf(img, r) {
  const crop = (c) => {
    const n = 2 * STRIP_HALF_PX + 1, x0 = Math.round(c[0]) - STRIP_HALF_PX, y0 = Math.round(c[1]) - STRIP_HALF_PX, rgb = new Uint8Array(n * n * 3).fill(128);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= img.widthPx || sy >= img.heightPx) continue;
      const s = (sy * img.widthPx + sx) * 4, d = (y * n + x) * 3; rgb[d] = img.rgba[s]; rgb[d + 1] = img.rgba[s + 1]; rgb[d + 2] = img.rgba[s + 2];
    }
    return { origin: [x0, y0], widthPx: n, heightPx: n, rgb };
  };
  const th = (r.axisDeg * Math.PI) / 180, u = [Math.cos(th), Math.sin(th)], far = 4000;
  const color = r.status.includes('indicted') ? STRIP_COLORS.indicted : r.straight ? STRIP_COLORS.straight : STRIP_COLORS.bent;
  const sign = (v, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
  return {
    label: `${r.identity} (${r.tee}) -> ${r.badge} [${r.status}]: angle ${sign(r.signedAngleResidualDeg)} deg, perp ${sign(r.signedPerpPx)} px at ${r.alongPx.toFixed(0)} px along, z ${r.z.toFixed(2)}${r.unmixed ? `; unmixed ${sign(r.unmixed.signedAngleResidualDeg)} deg` : ''}`,
    panels: [crop(r.center), crop(r.plateCenter)],
    lines: [
      { from: [r.center[0] - far * u[0], r.center[1] - far * u[1]], to: [r.center[0] + far * u[0], r.center[1] + far * u[1]], color },
      { from: r.center, to: r.plateCenter, color: STRIP_COLORS.ray }
    ],
    marks: [{ at: r.center, color: STRIP_COLORS.centre }, { at: r.plateCenter, color: STRIP_COLORS.centre }]
  };
}
