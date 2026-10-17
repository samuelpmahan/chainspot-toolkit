/**
 * Toolkit-layer structural refinement of the pinned fn.Tee.findFamily
 * Calculation (declared spec delta refine.s3.findFamily.structural in
 * stages/s3.json; lane lanes/s3/findfamily-structural-fix.json, default OFF).
 *
 * The pinned baseline selects family membership by mutual resemblance: the
 * largest set of framed candidates whose frame major/minor/area sit within
 * log-ratios 1.25/1.25/1.5 of a seed. Nothing tests any candidate against the
 * structure of a tee pad, so same-scale map chrome (the satellite-view button,
 * map lettering) is admitted whenever it resembles the family.
 *
 * The refined Calculation makes membership absolute and structural:
 *   Pass A anchors the pad model on the strongest structural cases: framed,
 *   unoccluded candidates whose frame already satisfies every structural
 *   class test (border present on all four sides, frame fill in the border
 *   range, interior a different material than the frame, frame pixels the
 *   bright/white class). The model is the anchors' fitted structure: frame
 *   major/minor/area, enclosed hole area, mean border thickness.
 *   Pass B tests every candidate against that model with rotation MODELED:
 *   the fit is (ring center, frame major/minor/area, frame angleRad); the
 *   expected frame is the rotated border band derived from the fit, and
 *   completeness is measured against that band, not against an axis-aligned
 *   tolerance box.
 * Verdicts are three piles with partition closure over every candidate that
 * entered findFamily, framed and unframed:
 *   ADMITTED   passes every structural test.
 *   EXCUSED    fails only evidence-absence tests (frame present, border
 *              complete, band coverage) and every missing evidence pixel is
 *              covered by a NAMED occluder: a Part owned by a prior layer
 *              (S1 badge px, S1 badge mute px, S2 basket px).
 *   ELIMINATED anything else; the failed tests and measured values are
 *              recorded. A material mismatch (wrong size, wrong interior,
 *              non-white frame) is never excused by occlusion: occlusion
 *              explains absence, not wrongness.
 * Unframed candidates fail the frame-present test; they are EXCUSED only
 * when the would-be border band is fully covered by named occluders,
 * otherwise ELIMINATED.
 *
 * Thresholds are derived from the anchor pads' own measured distributions
 * on the specimen under test, under one uniform rule stated here, not tuned
 * per candidate: size bounds are the anchor [min, max] expanded by a factor
 * 1.1 on both ends; the band-coverage bound is the anchor minimum times
 * 0.85; border, fill, interior and whiteness bounds are the Pass A class
 * definitions themselves. This module is pure over plain board data plus a
 * makeTee callback supplied by the wiring, so the wiring's guarantee block
 * can re-derive every verdict independently (see rederiveFamilyFixVerdicts).
 */

export const FAMILY_FIX = {
  specDelta: 'refine.s3.findFamily.structural',
  calculation: 'fn.Tee.findFamily',
  refinedCalculation: 'fn.Tee.findFamily.structural',
  familyPart: 'px.tees.familyRefined',
  teesPart: 'px.tees.refined'
};

// Class definitions (Pass A) and the uniform model-expansion rule (Pass B).
export const FIX_BOUNDS = {
  marginMin: 2, marginMax: 7, marginSpreadMax: 3,
  // Band fill: frame area over the band between the oriented outer extent
  // and the enclosed hole, major*minor - holeArea. Scale-free, because the
  // frame stroke is constant in screen px while pads scale with the map
  // (golden 0.82, Lenard 0.83); the old raw fill 0.30-0.50 was golden-fit
  // and found no anchors on Lenard's smaller pads.
  bandFillMin: 0.65, bandFillMax: 1.05,
  interiorDeltaMin: 30, interiorBrightMax: 0.5,
  interiorToneFloor: 12, interiorToneExpansion: 1.5,
  whiteFracMin: 0.95,
  sizeExpansion: 1.1,
  coverageFactor: 0.85
};
/**
 * The unit of every FIX_BOUNDS number ("numbers without units are
 * meaningless"; fg/mixins.mjs unitful checks this map covers the object).
 */
export const FIX_BOUNDS_UNITS = Object.freeze({
  marginMin: 'px', marginMax: 'px', marginSpreadMax: 'px',
  bandFillMin: 'fraction of band area (frame px / (major*minor - holeArea))', bandFillMax: 'fraction of band area (frame px / (major*minor - holeArea))',
  interiorDeltaMin: 'RGB level (mean-luminance difference, interior vs frame)', interiorBrightMax: 'fraction of ring-bbox px that are bright',
  interiorToneFloor: 'RGB level per channel', interiorToneExpansion: 'ratio (tolerance / largest anchor tone deviation)',
  whiteFracMin: 'fraction of frame px with luminance >= 200',
  sizeExpansion: 'ratio (bound / anchor extreme)',
  coverageFactor: 'ratio (bound / smallest anchor band coverage)'
});

const round4 = (v) => Math.round(v * 10000) / 10000;
export const ringTupleOf = (r) => [r.cx, r.cy, r.bboxX, r.bboxY, r.bboxW, r.bboxH, r.kind];
export const ringKeyOf = (r) => JSON.stringify(ringTupleOf(r));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const rangeOf = (values) => ({ min: Math.min(...values), max: Math.max(...values), median: median(values) });

// The pad interior is a course-constant painted tone (Sam, 2026-10-17: the
// grey inner section of every pad on a course is the same). A candidate's
// tone is the per-channel median RGB of the NOT-bright pixels inside its
// ring bbox (the frame excluded); the model's tone is the per-channel median
// of the anchors' tones, with tolerance max(floor, expansion * the largest
// anchor channel deviation from it). A blue button interior that merely
// differs from its white frame no longer passes for a pad.
function interiorTone(rgba, brightMask, ring, width) {
  const ch = [[], [], []];
  for (let y = ring.bboxY; y < ring.bboxY + ring.bboxH; y++) for (let x = ring.bboxX; x < ring.bboxX + ring.bboxW; x++) {
    const i = y * width + x;
    if (brightMask[i]) continue;
    ch[0].push(rgba[i * 4]); ch[1].push(rgba[i * 4 + 1]); ch[2].push(rgba[i * 4 + 2]);
  }
  return ch[0].length ? ch.map(median) : null;
}
function toneModel(tones) {
  const usable = tones.filter(Boolean);
  const med = [0, 1, 2].map((c) => median(usable.map((t) => t[c])));
  const maxDev = Math.max(0, ...usable.flatMap((t) => [0, 1, 2].map((c) => Math.abs(t[c] - med[c]))));
  return { median: med.map(round4), maxDev: round4(maxDev), tolerance: round4(Math.max(FIX_BOUNDS.interiorToneFloor, maxDev * FIX_BOUNDS.interiorToneExpansion)) };
}
const toneDistance = (tone, model) => tone ? round4(Math.max(...[0, 1, 2].map((c) => Math.abs(tone[c] - model.median[c])))) : null;

function luminanceStats(rgba, pixels) {
  let sum = 0, ge200 = 0;
  const values = [];
  for (const p of pixels) {
    const lum = (rgba[p * 4] + rgba[p * 4 + 1] + rgba[p * 4 + 2]) / 3;
    values.push(lum); sum += lum; if (lum >= 200) ge200++;
  }
  values.sort((a, b) => a - b);
  return {
    pxCount: pixels.length,
    lumMean: round4(sum / pixels.length),
    lumP10: round4(values[Math.min(values.length - 1, Math.floor(0.1 * values.length))]),
    fracGe200: round4(ge200 / pixels.length)
  };
}

function interiorStats(rgba, brightMask, darkMask, ring) {
  let bright = 0, dark = 0, sum = 0, total = 0;
  for (let y = ring.bboxY; y < ring.bboxY + ring.bboxH; y++) for (let x = ring.bboxX; x < ring.bboxX + ring.bboxW; x++) {
    const i = y * ring.width + x;
    total++; sum += (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
    if (brightMask[i]) bright++; else if (darkMask && darkMask[i]) dark++;
  }
  return { lumMean: round4(sum / total), brightFrac: round4(bright / total), darkFrac: round4(dark / total), tone: interiorTone(rgba, brightMask, ring, ring.width) };
}

// Rotated border band of the fitted frame: pixels inside the frame's axis
// extents but outside the same extents shrunk by t on every side, in the
// frame's own (major, minor) axes at frame.angle. Returns band pixel list.
function rotatedBandPixels(frame, width, height, t) {
  const cos = Math.cos(frame.angle), sin = Math.sin(frame.angle);
  const band = [];
  const reach = Math.ceil(frame.major) + 1;
  const x0 = Math.max(0, Math.floor(frame.cx - reach)), x1 = Math.min(width - 1, Math.ceil(frame.cx + reach));
  const y0 = Math.max(0, Math.floor(frame.cy - reach)), y1 = Math.min(height - 1, Math.ceil(frame.cy + reach));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - frame.cx, dy = y - frame.cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    if (u < frame.axisMajorMin || u > frame.axisMajorMax || v < frame.axisMinorMin || v > frame.axisMinorMax) continue;
    if (u >= frame.axisMajorMin + t && u <= frame.axisMajorMax - t && v >= frame.axisMinorMin + t && v <= frame.axisMinorMax - t) continue;
    band.push(y * width + x);
  }
  return band;
}

function measureCandidate(ring, frame, ctx) {
  const { rgba, brightLabels, brightMask, darkMask, width } = ctx;
  const ringW = { ...ring, width };
  const interior = interiorStats(rgba, brightMask, darkMask, ringW);
  if (!frame) return { framed: false, margins: null, frameStats: null, interior, framePixels: null };
  const framePixels = [];
  for (let i = 0; i < brightLabels.length; i++) if (brightLabels[i] === frame.label) framePixels.push(i);
  const frameStats = { ...luminanceStats(rgba, framePixels), area: frame.area, major: round4(frame.major), minor: round4(frame.minor), fill: round4(frame.fill), angle: round4(frame.angle) };
  const margins = {
    left: ring.bboxX - frame.bboxX, top: ring.bboxY - frame.bboxY,
    right: (frame.bboxX + frame.bboxW) - (ring.bboxX + ring.bboxW),
    bottom: (frame.bboxY + frame.bboxH) - (ring.bboxY + ring.bboxH)
  };
  margins.min = Math.min(margins.left, margins.top, margins.right, margins.bottom);
  margins.max = Math.max(margins.left, margins.top, margins.right, margins.bottom);
  margins.spread = margins.max - margins.min;
  frameStats.bandFill = round4(frame.area / Math.max(1, frame.major * frame.minor - ring.holeArea));
  return { framed: true, margins, frameStats, interior, framePixels };
}

function passAAnchor(measured) {
  if (!measured.framed) return false;
  const m = measured.margins, f = measured.frameStats, interior = measured.interior;
  return m.min >= FIX_BOUNDS.marginMin && m.max <= FIX_BOUNDS.marginMax && m.spread <= FIX_BOUNDS.marginSpreadMax
    && f.bandFill >= FIX_BOUNDS.bandFillMin && f.bandFill <= FIX_BOUNDS.bandFillMax
    && Math.abs(interior.lumMean - f.lumMean) >= FIX_BOUNDS.interiorDeltaMin && interior.brightFrac <= FIX_BOUNDS.interiorBrightMax
    && f.fracGe200 >= FIX_BOUNDS.whiteFracMin;
}

function buildModel(anchorEntries) {
  const majors = anchorEntries.map(e => e.measured.frameStats.major);
  const minors = anchorEntries.map(e => e.measured.frameStats.minor);
  const areas = anchorEntries.map(e => e.measured.frameStats.area);
  const holes = anchorEntries.map(e => e.ring.holeArea);
  const meanMargin = anchorEntries.reduce((n, e) => n + (e.measured.margins.left + e.measured.margins.top + e.measured.margins.right + e.measured.margins.bottom) / 4, 0) / anchorEntries.length;
  const bandT = Math.round(meanMargin);
  const model = {
    anchorCount: anchorEntries.length,
    major: rangeOf(majors), minor: rangeOf(minors), area: rangeOf(areas), holeArea: rangeOf(holes),
    meanMargin: round4(meanMargin), bandT,
    interiorTone: toneModel(anchorEntries.map(e => e.measured.interior.tone))
  };
  const e = FIX_BOUNDS.sizeExpansion;
  model.bounds = {
    major: [round4(model.major.min / e), round4(model.major.max * e)],
    minor: [round4(model.minor.min / e), round4(model.minor.max * e)],
    area: [round4(model.area.min / e), round4(model.area.max * e)],
    holeArea: [round4(model.holeArea.min / e), round4(model.holeArea.max * e)]
  };
  return model;
}

function bandCoverage(frame, framePixelSet, ctx, t) {
  const band = rotatedBandPixels(frame, ctx.width, ctx.height, t);
  let hit = 0;
  for (const p of band) if (framePixelSet.has(p)) hit++;
  return { coverage: band.length ? round4(hit / band.length) : null, bandPx: band.length, bandHitPx: hit, band };
}

/**
 * The corrected findFamily. Inputs are live board values; makeTee(member)
 * must return the tee object for a corrected member (the wiring reuses the
 * baseline tee when the ring already was a member, else runs the pinned
 * findPx body). Returns the serializable family Part plus the tee objects.
 */
export function computeFamilyFix({ rings, family, fields, image, badges, baskets, makeTee }) {
  const width = fields.bright.mask.width, height = fields.bright.mask.height;
  const ctx = { rgba: image.rgba, brightLabels: fields.bright.labels, brightMask: fields.bright.mask.data, darkMask: fields.dark?.mask?.data ?? null, width, height };
  const occluders = { badgeOwned: new Set(), badgeMute: new Set(), basket: new Set() };
  for (const b of badges) { for (const p of b.px) occluders.badgeOwned.add(p); for (const p of b.has.mute.px) occluders.badgeMute.add(p); }
  for (const k of baskets) for (const p of k.px) occluders.basket.add(p);
  const occludedBy = (pixel) => occluders.badgeOwned.has(pixel) ? 'badgeOwned' : occluders.badgeMute.has(pixel) ? 'badgeMute' : occluders.basket.has(pixel) ? 'basket' : null;

  const measuredByRing = new Map(family.measured.map(m => [ringKeyOf(m.ring), m]));
  const baselineMemberIndex = new Map(family.members.map((m, i) => [ringKeyOf(m.ring), i + 1]));
  const entries = rings.candidates.map((ring, index) => {
    const pair = measuredByRing.get(ringKeyOf(ring)) ?? null;
    return { index, ring, frame: pair?.frame ?? null, measured: measureCandidate(ring, pair?.frame ?? null, ctx) };
  });

  // Pass A: anchors, then the fitted pad model from the anchors alone.
  const anchors = entries.filter(e => passAAnchor(e.measured));
  if (!anchors.length) throw new Error('findFamily structural refinement found no anchor pads; cannot fit the pad model');
  const model = buildModel(anchors);
  // Anchor band coverage under the fitted band thickness sets the coverage bound.
  for (const e of anchors) {
    const cov = bandCoverage(e.frame, new Set(e.measured.framePixels), ctx, model.bandT);
    e.band = cov; e.measured.bandCoverage = cov.coverage;
  }
  model.anchorBandCoverageMin = Math.min(...anchors.map(e => e.measured.bandCoverage));
  model.bounds.bandCoverage = round4(model.anchorBandCoverageMin * FIX_BOUNDS.coverageFactor);
  const anchorKeys = new Set(anchors.map(e => ringKeyOf(e.ring)));

  // Pass B: structural tests per candidate against the model.
  const rows = entries.map((entry) => {
    const { ring, frame, measured } = entry;
    if (!entry.band) {
      if (frame) { const cov = bandCoverage(frame, new Set(measured.framePixels), ctx, model.bandT); entry.band = cov; measured.bandCoverage = cov.coverage; }
      else measured.bandCoverage = null;
    }
    const tests = { 'frame-present': measured.framed, 'ring-white': null, 'interior-different': null, 'interior-tone': null, 'fitted-size': null, 'border-complete': null, 'band-coverage': null };
    measured.interior.toneDistance = toneDistance(measured.interior.tone, model.interiorTone);
    if (measured.framed) {
      const f = measured.frameStats, interior = measured.interior;
      tests['ring-white'] = f.fracGe200 >= FIX_BOUNDS.whiteFracMin;
      tests['interior-different'] = Math.abs(interior.lumMean - f.lumMean) >= FIX_BOUNDS.interiorDeltaMin && interior.brightFrac <= FIX_BOUNDS.interiorBrightMax;
      tests['interior-tone'] = interior.toneDistance !== null && interior.toneDistance <= model.interiorTone.tolerance;
      const b = model.bounds;
      tests['fitted-size'] = f.major >= b.major[0] && f.major <= b.major[1] && f.minor >= b.minor[0] && f.minor <= b.minor[1]
        && f.area >= b.area[0] && f.area <= b.area[1] && ring.holeArea >= b.holeArea[0] && ring.holeArea <= b.holeArea[1];
      tests['border-complete'] = measured.margins.min >= FIX_BOUNDS.marginMin && measured.margins.max <= FIX_BOUNDS.marginMax && measured.margins.spread <= FIX_BOUNDS.marginSpreadMax;
      tests['band-coverage'] = measured.bandCoverage !== null && measured.bandCoverage >= model.bounds.bandCoverage;
    }
    const failedTests = Object.entries(tests).filter(([, v]) => v === false).map(([k]) => k);
    // Occlusion accounting over the missing evidence pixels: for framed
    // candidates, the fitted band (rotated) plus the axis-aligned border
    // region not covered by the frame component; for unframed candidates,
    // the would-be border band not covered by any bright material.
    let missingEvidence = null;
    if (failedTests.length) {
      const missing = new Set();
      if (measured.framed) {
        const frameSet = new Set(measured.framePixels);
        for (const p of entry.band.band) if (!frameSet.has(p)) missing.add(p);
        for (let y = frame.bboxY; y < frame.bboxY + frame.bboxH; y++) for (let x = frame.bboxX; x < frame.bboxX + frame.bboxW; x++) {
          const inRing = x >= ring.bboxX && x < ring.bboxX + ring.bboxW && y >= ring.bboxY && y < ring.bboxY + ring.bboxH;
          if (!inRing && !frameSet.has(y * width + x)) missing.add(y * width + x);
        }
      } else {
        const t = model.bandT;
        for (let y = ring.bboxY - t; y < ring.bboxY + ring.bboxH + t; y++) for (let x = ring.bboxX - t; x < ring.bboxX + ring.bboxW + t; x++) {
          const inRing = x >= ring.bboxX && x < ring.bboxX + ring.bboxW && y >= ring.bboxY && y < ring.bboxY + ring.bboxH;
          if (inRing || x < 0 || y < 0 || x >= width || y >= height) continue;
          const i = y * width + x;
          if (!ctx.brightMask[i]) missing.add(i);
        }
      }
      const byOccluder = { badgeOwned: 0, badgeMute: 0, basket: 0 };
      let covered = 0;
      for (const p of missing) { const who = occludedBy(p); if (who) { covered++; byOccluder[who]++; } }
      missingEvidence = { px: missing.size, coveredPx: covered, byOccluder };
    }
    const excusable = failedTests.length > 0 && failedTests.every(t => ['frame-present', 'border-complete', 'band-coverage'].includes(t))
      && missingEvidence && missingEvidence.px > 0 && missingEvidence.coveredPx === missingEvidence.px;
    const verdict = failedTests.length === 0 ? 'ADMITTED' : excusable ? 'EXCUSED' : 'ELIMINATED';
    return {
      index: entry.index,
      ring, frame,
      baselineMember: baselineMemberIndex.get(ringKeyOf(ring)) ?? null,
      anchor: anchorKeys.has(ringKeyOf(ring)),
      measurements: {
        margins: measured.margins, frame: measured.frameStats, interior: measured.interior,
        bandCoverage: measured.bandCoverage, missingEvidence
      },
      tests, failedTests, verdict
    };
  });

  const admitted = rows.filter(r => r.verdict === 'ADMITTED');
  const excused = rows.filter(r => r.verdict === 'EXCUSED');
  const eliminated = rows.filter(r => r.verdict === 'ELIMINATED');
  const correctedPairs = [...admitted, ...excused]
    .map(r => ({ ring: r.ring, frame: r.frame }))
    .sort((a, b) => (a.ring.cy - b.ring.cy) || (a.ring.cx - b.ring.cx));
  const baselineAnchorKey = family.anchor ? ringKeyOf(family.anchor.ring) : null;
  const correctedAnchor = correctedPairs.find(p => ringKeyOf(p.ring) === baselineAnchorKey) ?? correctedPairs[0] ?? null;
  const tees = correctedPairs.map(pair => makeTee(pair));

  const plainRing = (r) => ({ cx: r.cx, cy: r.cy, bboxX: r.bboxX, bboxY: r.bboxY, bboxW: r.bboxW, bboxH: r.bboxH, holeArea: r.holeArea, angle: r.angle, elongation: r.elongation, ringFrac: r.ringFrac, kind: r.kind });
  const familyPart = {
    schema: 'nctk-s3-family-refined@1',
    specDelta: FAMILY_FIX.specDelta, calculation: FAMILY_FIX.calculation, refinedCalculation: FAMILY_FIX.refinedCalculation,
    boundsRule: FIX_BOUNDS,
    model: {
      anchorCount: model.anchorCount, major: model.major, minor: model.minor, area: model.area, holeArea: model.holeArea,
      meanMargin: model.meanMargin, bandT: model.bandT, interiorTone: model.interiorTone, anchorBandCoverageMin: model.anchorBandCoverageMin, bounds: model.bounds
    },
    counts: {
      candidates: rows.length, framed: rows.filter(r => r.frame).length, unframed: rows.filter(r => !r.frame).length,
      anchors: anchors.length, admitted: admitted.length, excused: excused.length, eliminated: eliminated.length,
      correctedMembers: correctedPairs.length
    },
    // Auto-instrumentation emit channel (ports/early/instrument.mjs): the
    // measures this Calculation declares on its output Part; the runner
    // copies them verbatim into the op's instrumentation entry. Deterministic
    // counts only: anything nondeterministic here would break the branch
    // re-execution witness, which hashes this Part.
    emits: {
      candidates: rows.length, admitted: admitted.length, excused: excused.length, eliminated: eliminated.length,
      correctedMembers: correctedPairs.length
    },
    candidates: rows.map(r => ({
      index: r.index, ring: plainRing(r.ring), framed: !!r.frame,
      frame: r.frame ? { label: r.frame.label, area: r.frame.area, bboxX: r.frame.bboxX, bboxY: r.frame.bboxY, bboxW: r.frame.bboxW, bboxH: r.frame.bboxH, cx: round4(r.frame.cx), cy: round4(r.frame.cy), major: round4(r.frame.major), minor: round4(r.frame.minor), angle: round4(r.frame.angle), fill: round4(r.frame.fill) } : null,
      baselineMember: r.baselineMember, anchor: r.anchor,
      measurements: r.measurements, tests: r.tests, failedTests: r.failedTests, verdict: r.verdict
    })),
    correctedFamily: {
      members: correctedPairs.map(p => ({ ring: plainRing(p.ring), frameLabel: p.frame.label })),
      anchor: correctedAnchor ? { ring: plainRing(correctedAnchor.ring), frameLabel: correctedAnchor.frame.label } : null
    },
    piles: {
      admitted: admitted.map(r => r.index), excused: excused.map(r => r.index), eliminated: eliminated.map(r => r.index)
    }
  };
  return { familyPart, tees, correctedPairs, rows };
}

/**
 * Independent re-derivation of every verdict from the SERIALIZED baseline
 * rings/family Parts plus the board rasters. Written as a separate code
 * path from computeFamilyFix (it consumes plain serialized data and
 * recomputes each measurement itself) so the wiring can witness the
 * materialized verdict ledger against it exactly.
 */
export function rederiveFamilyFixVerdicts({ ringsPlain, familyPlain, fields, image, badges, baskets }) {
  const width = fields.bright.mask.width, height = fields.bright.mask.height;
  const rgba = image.rgba, labels = fields.bright.labels, bright = fields.bright.mask.data, dark = fields.dark?.mask?.data ?? null;
  const key = (r) => JSON.stringify([r.cx, r.cy, r.bboxX, r.bboxY, r.bboxW, r.bboxH, r.kind]);
  const frameByRing = new Map(familyPlain.measured.map(m => [key(m.ring), m.frame]));
  const memberIndex = new Map(familyPlain.members.map((m, i) => [key(m.ring), i + 1]));
  const occ = { badgeOwned: new Set(), badgeMute: new Set(), basket: new Set() };
  for (const b of badges) { for (const p of b.px) occ.badgeOwned.add(p); for (const p of b.has.mute.px) occ.badgeMute.add(p); }
  for (const k of baskets) for (const p of k.px) occ.basket.add(p);

  const measured = ringsPlain.candidates.map((ring, index) => {
    let inSum = 0, inBright = 0, inDark = 0, inTot = 0;
    for (let y = ring.bboxY; y < ring.bboxY + ring.bboxH; y++) for (let x = ring.bboxX; x < ring.bboxX + ring.bboxW; x++) {
      const i = y * width + x; inTot++; inSum += (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
      if (bright[i]) inBright++; else if (dark && dark[i]) inDark++;
    }
    const interior = { lumMean: round4(inSum / inTot), brightFrac: round4(inBright / inTot), darkFrac: round4(inDark / inTot), tone: interiorTone(rgba, bright, ring, width) };
    const frame = frameByRing.get(key(ring)) ?? null;
    if (!frame) return { index, ring, frame: null, interior, margins: null, frameStats: null, framePixelSet: null };
    const pxs = [];
    for (let i = 0; i < labels.length; i++) if (labels[i] === frame.label) pxs.push(i);
    let sum = 0, ge = 0; const vals = [];
    for (const p of pxs) { const l = (rgba[p * 4] + rgba[p * 4 + 1] + rgba[p * 4 + 2]) / 3; vals.push(l); sum += l; if (l >= 200) ge++; }
    vals.sort((a, b) => a - b);
    const frameStats = { pxCount: pxs.length, lumMean: round4(sum / pxs.length), lumP10: round4(vals[Math.min(vals.length - 1, Math.floor(0.1 * vals.length))]), fracGe200: round4(ge / pxs.length), area: frame.area, major: round4(frame.major), minor: round4(frame.minor), fill: round4(frame.fill), angle: round4(frame.angle) };
    frameStats.bandFill = round4(frame.area / Math.max(1, frame.major * frame.minor - ring.holeArea));
    const margins = { left: ring.bboxX - frame.bboxX, top: ring.bboxY - frame.bboxY, right: (frame.bboxX + frame.bboxW) - (ring.bboxX + ring.bboxW), bottom: (frame.bboxY + frame.bboxH) - (ring.bboxY + ring.bboxH) };
    margins.min = Math.min(margins.left, margins.top, margins.right, margins.bottom);
    margins.max = Math.max(margins.left, margins.top, margins.right, margins.bottom);
    margins.spread = margins.max - margins.min;
    return { index, ring, frame, interior, margins, frameStats, framePixelSet: new Set(pxs) };
  });

  const isAnchor = (m) => !!m.frame && m.margins.min >= FIX_BOUNDS.marginMin && m.margins.max <= FIX_BOUNDS.marginMax && m.margins.spread <= FIX_BOUNDS.marginSpreadMax
    && m.frameStats.bandFill >= FIX_BOUNDS.bandFillMin && m.frameStats.bandFill <= FIX_BOUNDS.bandFillMax
    && Math.abs(m.interior.lumMean - m.frameStats.lumMean) >= FIX_BOUNDS.interiorDeltaMin && m.interior.brightFrac <= FIX_BOUNDS.interiorBrightMax
    && m.frameStats.fracGe200 >= FIX_BOUNDS.whiteFracMin;
  const anchors = measured.filter(isAnchor);
  if (!anchors.length) throw new Error('witness re-derivation found no anchor pads');
  const rng = (vals) => ({ min: Math.min(...vals), max: Math.max(...vals), median: median(vals) });
  const model = {
    anchorCount: anchors.length,
    major: rng(anchors.map(a => a.frameStats.major)), minor: rng(anchors.map(a => a.frameStats.minor)),
    area: rng(anchors.map(a => a.frameStats.area)), holeArea: rng(anchors.map(a => a.ring.holeArea)),
    meanMargin: round4(anchors.reduce((n, a) => n + (a.margins.left + a.margins.top + a.margins.right + a.margins.bottom) / 4, 0) / anchors.length)
  };
  model.bandT = Math.round(model.meanMargin);
  model.interiorTone = toneModel(anchors.map(a => a.interior.tone));
  const e = FIX_BOUNDS.sizeExpansion;
  model.bounds = {
    major: [round4(model.major.min / e), round4(model.major.max * e)], minor: [round4(model.minor.min / e), round4(model.minor.max * e)],
    area: [round4(model.area.min / e), round4(model.area.max * e)], holeArea: [round4(model.holeArea.min / e), round4(model.holeArea.max * e)]
  };
  const coverageOf = (m) => {
    const band = rotatedBandPixels(m.frame, width, height, model.bandT);
    let hit = 0; for (const p of band) if (m.framePixelSet.has(p)) hit++;
    return band.length ? round4(hit / band.length) : null;
  };
  for (const a of anchors) a.bandCoverage = coverageOf(a);
  model.anchorBandCoverageMin = Math.min(...anchors.map(a => a.bandCoverage));
  model.bounds.bandCoverage = round4(model.anchorBandCoverageMin * FIX_BOUNDS.coverageFactor);
  const anchorKeys = new Set(anchors.map(a => key(a.ring)));

  const rows = measured.map((m) => {
    const tests = { 'frame-present': !!m.frame, 'ring-white': null, 'interior-different': null, 'interior-tone': null, 'fitted-size': null, 'border-complete': null, 'band-coverage': null };
    m.interior.toneDistance = toneDistance(m.interior.tone, model.interiorTone);
    let bandCoverage = null, missingEvidence = null;
    if (m.frame) {
      bandCoverage = m.bandCoverage ?? coverageOf(m);
      const f = m.frameStats, b = model.bounds;
      tests['ring-white'] = f.fracGe200 >= FIX_BOUNDS.whiteFracMin;
      tests['interior-different'] = Math.abs(m.interior.lumMean - f.lumMean) >= FIX_BOUNDS.interiorDeltaMin && m.interior.brightFrac <= FIX_BOUNDS.interiorBrightMax;
      tests['interior-tone'] = m.interior.toneDistance !== null && m.interior.toneDistance <= model.interiorTone.tolerance;
      tests['fitted-size'] = f.major >= b.major[0] && f.major <= b.major[1] && f.minor >= b.minor[0] && f.minor <= b.minor[1] && f.area >= b.area[0] && f.area <= b.area[1] && m.ring.holeArea >= b.holeArea[0] && m.ring.holeArea <= b.holeArea[1];
      tests['border-complete'] = m.margins.min >= FIX_BOUNDS.marginMin && m.margins.max <= FIX_BOUNDS.marginMax && m.margins.spread <= FIX_BOUNDS.marginSpreadMax;
      tests['band-coverage'] = bandCoverage !== null && bandCoverage >= model.bounds.bandCoverage;
    }
    const failedTests = Object.entries(tests).filter(([, v]) => v === false).map(([k]) => k);
    if (failedTests.length) {
      const missing = new Set();
      if (m.frame) {
        for (const p of rotatedBandPixels(m.frame, width, height, model.bandT)) if (!m.framePixelSet.has(p)) missing.add(p);
        for (let y = m.frame.bboxY; y < m.frame.bboxY + m.frame.bboxH; y++) for (let x = m.frame.bboxX; x < m.frame.bboxX + m.frame.bboxW; x++) {
          const inRing = x >= m.ring.bboxX && x < m.ring.bboxX + m.ring.bboxW && y >= m.ring.bboxY && y < m.ring.bboxY + m.ring.bboxH;
          if (!inRing && !m.framePixelSet.has(y * width + x)) missing.add(y * width + x);
        }
      } else {
        const t = model.bandT;
        for (let y = m.ring.bboxY - t; y < m.ring.bboxY + m.ring.bboxH + t; y++) for (let x = m.ring.bboxX - t; x < m.ring.bboxX + m.ring.bboxW + t; x++) {
          const inRing = x >= m.ring.bboxX && x < m.ring.bboxX + m.ring.bboxW && y >= m.ring.bboxY && y < m.ring.bboxY + m.ring.bboxH;
          if (inRing || x < 0 || y < 0 || x >= width || y >= height) continue;
          const i = y * width + x; if (!bright[i]) missing.add(i);
        }
      }
      const byOccluder = { badgeOwned: 0, badgeMute: 0, basket: 0 }; let covered = 0;
      for (const p of missing) { if (occ.badgeOwned.has(p)) { covered++; byOccluder.badgeOwned++; } else if (occ.badgeMute.has(p)) { covered++; byOccluder.badgeMute++; } else if (occ.basket.has(p)) { covered++; byOccluder.basket++; } }
      missingEvidence = { px: missing.size, coveredPx: covered, byOccluder };
    }
    const excusable = failedTests.length > 0 && failedTests.every(t => ['frame-present', 'border-complete', 'band-coverage'].includes(t)) && missingEvidence && missingEvidence.px > 0 && missingEvidence.coveredPx === missingEvidence.px;
    return {
      index: m.index, ringKey: key(m.ring), baselineMember: memberIndex.get(key(m.ring)) ?? null,
      anchor: anchorKeys.has(key(m.ring)),
      measurements: { margins: m.margins, frame: m.frameStats, interior: m.interior, bandCoverage, missingEvidence },
      tests, failedTests, verdict: failedTests.length === 0 ? 'ADMITTED' : excusable ? 'EXCUSED' : 'ELIMINATED'
    };
  });
  return { model, rows };
}
