/**
 * Named fork points for AblationForkJoin (node-free; pure over Parts).
 *
 * A fork point is an ADDRESSED thing at a stage boundary, plus what is done
 * to it. Today every fork point lives at the S3 boundary, because that is
 * the one boundary with a sealed, restorable Part snapshot that the
 * downstream stages already re-enter from (s3.pxc.bin, restored by S4):
 *
 *   { id, at: { boundary, part, calculation?, parameter? }, describe,
 *     apply(parts, ctx) -> { replaced: [address], note, ... } }
 *
 * `parts` is a Map address -> value restored from the sealed S3 snapshot
 * (a private copy per branch); apply edits it in place. ctx carries what a
 * Calculation needs that is not a Part: { dist (pinned provider loader),
 * familyFix (the s3FamilyFix module of the run being ablated), testimony,
 * cropTopPx }.
 *
 * Coupled Parts: px.tees and px.tees.family are one fact in two Parts (S4's
 * broad recovery checks members[i].frame.label === tees[i]'s frame label),
 * so a fork of px.tees must also rewrite px.tees.family.members/anchor.
 */

export const S3_BOUNDARY = 'S3';

const keyOf = (r) => JSON.stringify([r.cx, r.cy, r.bboxX, r.bboxY, r.bboxW, r.bboxH, r.kind]);

/** Run fn with FIX_BOUNDS temporarily overridden (a parameter fork). */
export function withBounds(bounds, overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in bounds)) throw new Error(`parameter fork: FIX_BOUNDS has no ${k}`);
    saved[k] = bounds[k]; bounds[k] = v;
  }
  try { return fn(); } finally { Object.assign(bounds, saved); }
}

function structuralTees(parts, ctx, overrides = {}) {
  const { computeFamilyFix, FIX_BOUNDS } = ctx.familyFix;
  const { Tee } = ctx.dist('stages/S3/clean/Tee');
  const { componentRef, materializeRasterComponentPixels } = ctx.dist('detectors/threeFactor/componentAssembly');
  const get = (a) => { if (!parts.has(a)) throw new Error(`fork needs S3 Part ${a}`); return parts.get(a); };
  const rings = get('px.tees.rings'), family = get('px.tees.family'), fields = get('px.components');
  const image = get('px.image.cropped'), badges = get('px.badges'), baskets = get('px.baskets'), baseTees = get('px.tees');
  const byRing = new Map(baseTees.map((t) => [keyOf(t.has.detectRings.hole), t]));
  let made = 0;
  // Same makeTee rule as the s3-findfamily-structural-fix lane wiring: a
  // baseline member keeps its baseline tee object; a newly admitted ring
  // gets the pinned findPx body over its frame component.
  const makeTee = (member) => {
    const existing = byRing.get(keyOf(member.ring));
    if (existing) return existing;
    made++;
    const frame = componentRef('bright', member.frame);
    const raster = { width: fields.bright.mask.width, height: fields.bright.mask.height, topPx: 0, brightLabels: fields.bright.labels, darkLabels: fields.dark.labels };
    return new Tee(member, { frame, px: materializeRasterComponentPixels(frame, raster) });
  };
  const fix = withBounds(FIX_BOUNDS, overrides, () => computeFamilyFix({ rings, family, fields, image, badges, baskets, makeTee }));
  const members = fix.correctedPairs.map((p) => ({ ring: p.ring, frame: p.frame }));
  const anchorKey = family.anchor ? keyOf(family.anchor.ring) : null;
  const anchor = members.find((m) => keyOf(m.ring) === anchorKey) ?? members[0] ?? null;
  parts.set('px.tees', fix.tees);
  parts.set('px.tees.family', { ...family, members, anchor });
  return {
    replaced: ['px.tees', 'px.tees.family'],
    counts: { before: baseTees.length, after: fix.tees.length, newlyMaterialized: made, ...fix.familyPart.counts },
    eliminated: fix.rows.filter((r) => r.verdict === 'ELIMINATED' && r.baselineMember).map((r) => ({ baselineLabel: String(r.baselineMember), center: [r.ring.cx, r.ring.cy], failedTests: r.failedTests })),
    admittedNonMembers: fix.rows.filter((r) => r.verdict !== 'ELIMINATED' && !r.baselineMember).map((r) => ({ center: [r.ring.cx, r.ring.cy], verdict: r.verdict })),
    parameters: Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, Number.isFinite(v) ? v : String(v)]))
  };
}

// The basket nearest Sam's annotated tee point for hole `hole` (by distance
// from the point to the basket bbox, canonical frame): the basket that
// occludes that tee's pad on golden.
function basketNearestTestimonyTee(parts, ctx, hole) {
  const h = ctx.testimony?.holes?.find((x) => x.number === hole);
  if (!h?.tee) throw new Error(`fork needs Sam's testimony tee point for hole ${hole}`);
  const p = [h.tee.xPx, h.tee.yPx - ctx.cropTopPx];
  const baskets = parts.get('px.baskets');
  const dist = ([x, y, w, hh]) => Math.hypot(Math.max(x - p[0], 0, p[0] - (x + w)), Math.max(y - p[1], 0, p[1] - (y + hh)));
  let best = -1;
  baskets.forEach((b, i) => { if (best < 0 || dist(b.bbox) < dist(baskets[best].bbox)) best = i; });
  return { index: best, bbox: [...baskets[best].bbox], distancePx: Math.round(dist(baskets[best].bbox) * 100) / 100, testimonyTeeCanonical: p };
}

export const FORKS = Object.freeze({
  baseline: {
    id: 'baseline', at: null,
    describe: 'pinned S3 Parts exactly as sealed in s3.pxc.bin (18 tees incl. 3 impostors)',
    apply: () => ({ replaced: [] })
  },
  'tees.structural': {
    id: 'tees.structural', at: { boundary: S3_BOUNDARY, part: 'px.tees', calculation: 'fn.Tee.findFamily.structural' },
    describe: 'px.tees (+ coupled px.tees.family) := the structural refined family (ports/early/s3FamilyFix.mjs computeFamilyFix)',
    apply: (parts, ctx) => structuralTees(parts, ctx)
  },
  'tees.structural.interiorTone=off': {
    id: 'tees.structural.interiorTone=off', at: { boundary: S3_BOUNDARY, part: 'px.tees', calculation: 'fn.Tee.findFamily.structural', parameter: 'FIX_BOUNDS.interiorToneFloor' },
    describe: 'as tees.structural, with the interior-tone test disabled (interiorToneFloor = Infinity, so every measurable tone passes)',
    apply: (parts, ctx) => structuralTees(parts, ctx, { interiorToneFloor: Infinity })
  },
  'baskets.minus=hole12-occluder': {
    id: 'baskets.minus=hole12-occluder', at: { boundary: S3_BOUNDARY, part: 'px.baskets' },
    describe: "px.baskets minus the basket nearest Sam's hole-12 tee point (the basket occluding that pad); S3's own use of it (occlusion excuses) is NOT re-run: the fork is at the S3 boundary",
    apply: (parts, ctx) => {
      const pick = basketNearestTestimonyTee(parts, ctx, 12);
      const baskets = parts.get('px.baskets');
      parts.set('px.baskets', baskets.filter((_, i) => i !== pick.index));
      return { replaced: ['px.baskets'], removed: pick, counts: { before: baskets.length, after: baskets.length - 1 } };
    }
  }
});

export const DEFAULT_ROWS = Object.keys(FORKS);
