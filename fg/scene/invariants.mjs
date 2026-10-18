/**
 * Invariant scopes and image orientation (Sam, 2026-10-17): "Nothing may be asserted to be constant unless it holds
 * across both courses and zoom scales. In blind prod runs, detecting that which is constant locally is an INCREDIBLY
 * POWERFUL ORIENTATION/specialization we get for free."
 *
 *   GLOBAL   same on every image, full courses AND zoomed views: a value in screen px, a ratio, or a model in R1
 *   LOCAL    one value per image (tight within it), different between images: measured on every run
 *   VARIABLE depends on what the view shows (counts)
 *
 * R1 = the C1S radius in px (10 m on the ground) = the image's map scale. Evidence: docs/evidence/ledger/ (ledger.json,
 * ledger.png), 6 full courses + 5 zoomed Lenard views.
 *
 * Scale comes from the rings ONLY (Sam, 2026-10-18: "pad size COULD vary. Circle1Radius and Circle2Radius WILL NEVER
 * VARY"). The rings are the app's definition (10 m, 20 m); everything else on the course is course data, however
 * constant it looked on the dev set. Nothing course-made (pads, hallways) ever sets or corrects the scale: it is
 * predicted from the scale and checked, and a miss is a finding about that thing.
 */
export const SCOPE = Object.freeze({ GLOBAL: 'GLOBAL', LOCAL: 'LOCAL', VARIABLE: 'VARIABLE' });

/** GLOBAL in screen px: the sprites and the strokes do not scale with the map. */
export const SCREEN_PX = Object.freeze({
  basketSprite: [46, 72],            // px [width, height], 127 baskets on 11 images
  padEndStroke: [3.53, 3.62],        // px, AA render fit, range over 11 images
  padSideStroke: [3.01, 3.05],       // px
  c1sStroke: [2.75, 3.5]             // px FWHM (0.25 px radial steps)
});

/** GLOBAL ratio: C2D radius = 2 x C1S radius (1.953-2.014 measured). */
export const RING_RATIO = 2;

/** The only scale anchor: the C1S and C2D radii are fixed on the ground by the app. */
export const SCALE_ANCHOR = Object.freeze({ c1sRadiusM: 10, c2dRadiusM: 20 });

/**
 * OBSERVED prior, not a constant: on all 11 dev images the pad is a 6.0 m x 4.0 m body (0.597 / 0.399 x R1) outlined by
 * the screen-px stroke (the intercepts equal the end and side strokes); px = a px + b x R1, max residual 0.27 px (length),
 * 0.16 px (width). Pad size is course data and could differ on another course: the prior says where to look, the image's
 * own pad fit says what is there, and a pad off the prior is reported (padMatchesPrior false), never used to rescale.
 */
export const PAD_MODEL = Object.freeze({ lengthPx: [3.532, 0.5971], widthPx: [2.985, 0.3994], maxResidualPx: [0.27, 0.16] });

/**
 * LOCAL, in two scale regimes (hypothesis from 11 images, no image with R1 between 27 and 36 px): hallway width / R1 and
 * dashes per C2D circle. Full Lenard (R1 24 px) is coarse and its zoomed views (R1 ~56 px) are fine, so the regime follows
 * map scale, not the course. Never assumed: measured per image, then used to predict and cross-check.
 */
export const REGIMES = Object.freeze({
  coarse: { r1Px: [0, 27], hallwayOverR1: [1.46, 1.494], dashesPerC2: [9.9, 10.47] },
  fine: { r1Px: [36, Infinity], hallwayOverR1: [0.928, 0.943], dashesPerC2: [20.91, 21.04] }
});

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Pad template (px) predicted from the map scale R1 (px). */
export const padFromScale = (r1Px) => ({ lengthPx: r3(PAD_MODEL.lengthPx[0] + PAD_MODEL.lengthPx[1] * r1Px), widthPx: r3(PAD_MODEL.widthPx[0] + PAD_MODEL.widthPx[1] * r1Px) });

/** A fitted pad template (px) against the prior at the ring scale: residuals in px and the pad's own size in m. */
export function padAgainstPrior({ lengthPx, widthPx }, r1Px, { tolPx = [0.75, 0.5] } = {}) {
  const want = padFromScale(r1Px), mPerPx = SCALE_ANCHOR.c1sRadiusM / r1Px;
  const residualPx = [r3(lengthPx - want.lengthPx), r3(widthPx - want.widthPx)];
  return {
    predicted: want, residualPx, matches: Math.abs(residualPx[0]) <= tolPx[0] && Math.abs(residualPx[1]) <= tolPx[1],
    bodyM: [r3((lengthPx - PAD_MODEL.lengthPx[0]) * mPerPx), r3((widthPx - PAD_MODEL.widthPx[0]) * mPerPx)]   // stroke removed
  };
}

const inside = (v, [lo, hi]) => v >= lo && v <= hi;
/** Which regime each available signal points at; 'unobserved' between the two R1 ranges. */
export function regimeOf({ r1Px, hallwayPx = null, dashesPerC2 = null }) {
  const by = (pick) => Object.keys(REGIMES).find((k) => pick(REGIMES[k])) ?? 'unobserved';
  const votes = { scale: by((g) => inside(r1Px, g.r1Px)) };
  if (hallwayPx != null) votes.hallway = by((g) => inside(hallwayPx / r1Px, [g.hallwayOverR1[0] - 0.03, g.hallwayOverR1[1] + 0.03]));
  if (dashesPerC2 != null) votes.dashes = by((g) => inside(dashesPerC2, [g.dashesPerC2[0] - 1, g.dashesPerC2[1] + 1]));
  const vals = Object.values(votes).filter((v) => v !== 'unobserved');
  return { regime: vals.length && vals.every((v) => v === vals[0]) ? vals[0] : 'unresolved', votes };
}

/**
 * Orientation for one image from what is constant locally. The scale is the ring radius and nothing else; from it the
 * pad prior, the C2D radius and (given the regime) the hallway width are predicted before they are fitted. A fitted pad
 * template is checked against the prior: a miss is a finding about this course's pads, the scale is untouched.
 */
export function orient({ ringR1Px, padTemplate = null, hallwayPx = null, dashesPerC2 = null }) {
  const reg = regimeOf({ r1Px: ringR1Px, hallwayPx, dashesPerC2 });
  const g = REGIMES[reg.regime];
  const pad = padTemplate ? padAgainstPrior(padTemplate, ringR1Px) : null;
  return {
    scale: { r1Px: ringR1Px, source: 'C1S/C2D rings', mPerPx: r3(SCALE_ANCHOR.c1sRadiusM / ringR1Px) },
    regime: reg.regime, votes: reg.votes,
    predicted: { pad: padFromScale(ringR1Px), hallwayPx: g ? g.hallwayOverR1.map((k) => r3(k * ringR1Px)) : null, c2dRadiusPx: r3(RING_RATIO * ringR1Px) },
    pad, padMatchesPrior: pad ? pad.matches : null,
    findings: pad && !pad.matches ? [`pads measure ${pad.bodyM[0]} m x ${pad.bodyM[1]} m, off the 6.0 m x 4.0 m prior by ${pad.residualPx.join(' / ')} px: this course's pads differ; scale stays the rings'`] : []
  };
}

export const ORIENT_UNITS = Object.freeze({ r1Px: 'px (C1S radius, from the rings)', mPerPx: 'm per px', lengthPx: 'px', widthPx: 'px', residualPx: 'px [length, width] (fitted - prior)', bodyM: 'm [length, width] (stroke removed)', tolPx: 'px [length, width]', hallwayPx: 'px [min, max]', c2dRadiusPx: 'px', c1sRadiusM: 'm', c2dRadiusM: 'm' });
