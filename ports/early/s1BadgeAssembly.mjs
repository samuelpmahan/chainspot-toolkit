/**
 * Toolkit-layer plate-first assembly of the Badge Parts (declared spec
 * delta refine.s1.badgeAssembly.plateFirst in stages/s1.json; lane
 * lanes/s1/badge-assembly.json, default OFF). Assembly refactor phase 2.
 *
 * Sam's doctrine (2026-10-17): there is a literal step fusing a sprite's
 * Black and White PxSets into the full sprite, and per sprite the assembly
 * starts from the MORE RELIABLE BASE PxSet and fuses the rest onto it. For
 * a badge the base is the inner plate: the outer bright ribbon can merge
 * into other bright sprites' pixels (a basket glyph) and stop being
 * family, while the plate body is enclosed and cannot merge. The pinned
 * provider's primary badge path does the reverse: assembleBadgeV1 seeds
 * from the outer bright component and owns the plate as a contained
 * member (the plate-base order survives only in its dark-plate recovery
 * path). The fused SET is order-independent, so this Calculation
 * re-derives the identical set plate-first, from the provider's per-badge
 * COMPONENT evidence (the findPx component refs plus the component label
 * fields), never from the finished px.badges set: assembling from the
 * already-fused set would be circular and prove nothing.
 *
 * Per badge the assembly runs through the phase-1 shape
 * (ports/early/assembly.mjs): base = the plate component set; fused =
 * the white frame/ribbon component (bright-family badges; absent for
 * dark-plate-recovery badges) and one component per digit, the union of
 * that digit's bright glyph components. Digit counters (the dark
 * components enclosed by a digit's strokes, unowned by Badge.findPx and
 * inside the badge mute set) are attributed by the accepted S1 counter
 * rule (ownership by enclosure, Sam 2026-10-16) and carried as
 * digit-owned sub-structure on the Part; they are NOT part of the badge's
 * fused set, exactly as px.badges excludes them. The ledger reconciles
 * at the digit layer: fused union 37,002 + counter px 293 = 37,295 owned
 * on the golden specimen.
 *
 * The anchor rides on the Part: the plate centroid (the base's own
 * centroid), with the fused-set centroid recorded beside it and any badge
 * whose two centroids differ by more than 2 px flagged.
 *
 * This module is pure over plain board data (badge objects, reads,
 * component fields), so the wiring's guarantee block can re-execute it on
 * a second restored branch and re-derive one badge independently (see
 * rederiveBadgeComponents, a separate code path that never reads the
 * findPx component refs).
 */
import { createHash } from 'node:crypto';
import { assembleSprite } from './assembly.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pxSha256 = (px) => sha256(Buffer.from(Uint32Array.from(px).buffer));
const round4 = (v) => Math.round(v * 10000) / 10000;

export const BADGE_ASSEMBLY = {
  specDelta: 'refine.s1.badgeAssembly.plateFirst',
  calculation: 'fn.Badge.findPx',
  assemblyCalculation: 'fn.Badge.assemble.plateFirst',
  part: 'px.badges.assembly',
  anchorFlagThresholdPx: 2
};

const containsBbox = (outer, inner) =>
  outer[0] <= inner[0] && outer[1] <= inner[1]
  && outer[0] + outer[2] >= inner[0] + inner[2] && outer[1] + outer[3] >= inner[1] + inner[3];

// Materialize one component ref's pixel set from a polarity label field by
// scanning the component's own bbox (the same extraction the S1 digits
// materialization uses for dark components). Fails unless the scan finds
// exactly the component's declared area.
function materializeComponent(labels, part, widthPx) {
  const [bx, by, bw, bh] = part.bbox;
  const px = [];
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++)
      if (labels[y * widthPx + x] === part.label) px.push(y * widthPx + x);
  if (px.length !== part.area)
    throw new Error(`badge assembly: ${part.polarity} component ${part.label} materialized ${px.length} px, its declared area is ${part.area}`);
  return px;
}

function centroidOf(px, widthPx) {
  let sx = 0, sy = 0;
  for (const p of px) { sx += p % widthPx; sy += Math.floor(p / widthPx); }
  return [round4(sx / px.length), round4(sy / px.length)];
}

// Split a badge's findPx component refs into plate (the unique dark part),
// frame (bright parts NOT contained by the plate bbox) and glyphs (bright
// parts contained by the plate bbox), with pixel sets materialized from
// the component label fields. Shared by the assembly only; the independent
// witness below re-derives the same split geometrically from the fields'
// component lists and never touches these refs.
function decomposeBadge(badge, fields, widthPx) {
  const parts = badge.has?.findPx?.parts;
  if (!Array.isArray(parts) || !parts.length)
    throw new Error(`badge assembly: badge ${badge.label} carries no findPx component evidence (opaque badge object)`);
  const darkParts = parts.filter((p) => p.polarity === 'dark');
  if (darkParts.length !== 1)
    throw new Error(`badge assembly: badge ${badge.label} has ${darkParts.length} dark findPx parts, expected exactly one (the plate)`);
  const platePart = darkParts[0];
  const brightParts = parts.filter((p) => p.polarity === 'bright');
  const frameParts = brightParts.filter((p) => !containsBbox(platePart.bbox, p.bbox));
  const glyphParts = brightParts.filter((p) => containsBbox(platePart.bbox, p.bbox));
  if (frameParts.length > 1)
    throw new Error(`badge assembly: badge ${badge.label} has ${frameParts.length} bright parts outside the plate, expected at most one (the frame)`);
  if (badge.source === 'bright-family' && frameParts.length !== 1)
    throw new Error(`badge assembly: bright-family badge ${badge.label} has no bright frame part outside the plate`);
  return {
    platePart,
    framePart: frameParts[0] ?? null,
    glyphParts,
    platePx: materializeComponent(fields.dark.labels, platePart, widthPx),
    framePx: frameParts.length ? materializeComponent(fields.bright.labels, frameParts[0], widthPx) : [],
    glyphPxByPart: glyphParts.map((p) => materializeComponent(fields.bright.labels, p, widthPx))
  };
}

// Counter attribution, ownership by enclosure (the accepted S1 counter
// rule, mirrored from the fg.s1.pxDigits.materialize enforcement): a dark
// component inside the badge bbox, not one of the badge's findPx dark
// parts, whose pixels are disjoint from the badge owned set and contained
// in the badge mute set, and whose bbox is enclosed by exactly one
// digit's bbox, is attributed to that digit as a named counter part.
function attributeCounters({ badge, read, fields, widthPx }) {
  const owned = new Set(badge.px);
  const mute = new Set(badge.has.mute.px);
  const darkPartLabels = new Set(badge.has.findPx.parts.filter((p) => p.polarity === 'dark').map((p) => p.label));
  const [bx, by, bw, bh] = badge.bbox;
  const counters = [];
  for (const comp of fields.dark.components) {
    if (darkPartLabels.has(comp.label)) continue;
    if (!(comp.bboxX >= bx && comp.bboxY >= by && comp.bboxX + comp.bboxW <= bx + bw && comp.bboxY + comp.bboxH <= by + bh)) continue;
    const px = materializeComponent(fields.dark.labels, { polarity: 'dark', label: comp.label, bbox: [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH], area: comp.area }, widthPx);
    if (px.some((p) => owned.has(p)))
      throw new Error(`badge assembly: badge ${badge.label} counter candidate ${comp.label} overlaps the badge owned set`);
    if (!px.every((p) => mute.has(p)))
      throw new Error(`badge assembly: badge ${badge.label} counter candidate ${comp.label} is not inside the badge mute set`);
    const containing = read.digits.map((d, di) => ({ d, di })).filter(({ d }) =>
      d.bbox[0] <= comp.bboxX && d.bbox[1] <= comp.bboxY
      && comp.bboxX + comp.bboxW <= d.bbox[0] + d.bbox[2] && comp.bboxY + comp.bboxH <= d.bbox[1] + d.bbox[3]);
    if (containing.length !== 1)
      throw new Error(`badge assembly: badge ${badge.label} counter candidate ${comp.label} is enclosed by ${containing.length} digits, expected exactly 1`);
    counters.push({
      componentLabel: comp.label, digitIndex: containing[0].di,
      bbox: [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH],
      px, pxCount: px.length, pxSha256: pxSha256(px)
    });
  }
  return counters;
}

/**
 * The plate-first assembly Calculation. Inputs are live board values:
 * badges (px.badges objects carrying has.findPx.parts), reads (the
 * detectBadges reads, index-aligned with badges), fields (px.components
 * with bright/dark label fields and component lists). Returns the
 * serializable assembly Part for px.badges.assembly.
 */
export function computeBadgeAssembly({ badges, reads, fields }) {
  const widthPx = fields.bright.mask.width, heightPx = fields.bright.mask.height;
  if (fields.dark.mask.width !== widthPx || fields.dark.mask.height !== heightPx)
    throw new Error('badge assembly: bright and dark component fields disagree on frame size');
  if (!Array.isArray(badges) || !Array.isArray(reads) || badges.length !== reads.length)
    throw new Error(`badge assembly: badges (${badges?.length}) and reads (${reads?.length}) are not index-aligned lists`);

  const records = badges.map((badge, index) => {
    const read = reads[index];
    if (!read.bbox || !badge.bbox || read.bbox.some((v, k) => v !== badge.bbox[k]))
      throw new Error(`badge assembly: read ${index} bbox disagrees with badge ${index} bbox (reads and badges out of alignment)`);
    const { platePart, framePart, glyphParts, platePx, framePx, glyphPxByPart } = decomposeBadge(badge, fields, widthPx);

    // Assign every glyph component to the digit whose bbox encloses it.
    const digitGlyphs = read.digits.map(() => []);
    glyphParts.forEach((part, gi) => {
      const containing = read.digits.map((d, di) => ({ d, di })).filter(({ d }) => containsBbox(d.bbox, part.bbox));
      if (containing.length !== 1)
        throw new Error(`badge assembly: badge ${badge.label} glyph component ${part.label} is enclosed by ${containing.length} digit bboxes, expected exactly 1`);
      digitGlyphs[containing[0].di].push({ part, px: glyphPxByPart[gi] });
    });

    const counters = attributeCounters({ badge, read, fields, widthPx });
    const counterPxTotal = counters.reduce((n, c) => n + c.pxCount, 0);

    const digitPx = read.digits.map((digit, di) => digitGlyphs[di].flatMap((g) => g.px).sort((a, b) => a - b));
    const components = [{ name: 'plate', role: 'base', px: platePx }];
    if (framePart) components.push({ name: 'frame', role: 'fused', px: framePx });
    digitPx.forEach((px, di) => components.push({ name: `digit-${di}`, role: 'fused', px }));
    const plateCentroid = centroidOf(platePx, widthPx);
    const assembled = assembleSprite({
      part: 'px.badges', calculation: BADGE_ASSEMBLY.assemblyCalculation,
      components,
      anchor: {
        value: plateCentroid,
        derivation: 'centroid of the plate component pixel set. The plate is the assembly base (Sam, 2026-10-17): assembly starts from the more reliable base PxSet, and for a badge that is the inner plate, because the outer bright ribbon can merge into other bright sprites\' pixels and stop being family, while the plate body is enclosed and cannot merge.'
      },
      window: { x: badge.bbox[0], y: badge.bbox[1], widthPx: badge.bbox[2], heightPx: badge.bbox[3], rowWidthPx: widthPx }
    });
    const fusedCentroid = centroidOf(assembled.fusedPx, widthPx);
    const anchorDeltaPx = round4(Math.hypot(plateCentroid[0] - fusedCentroid[0], plateCentroid[1] - fusedCentroid[1]));

    const partRef = (p) => ({ polarity: p.polarity, label: p.label, bbox: [...p.bbox], area: p.area });
    const componentRecords = [
      { name: 'plate', role: 'base', parts: [partRef(platePart)], px: platePx, pxCount: platePx.length, pxSha256: pxSha256(platePx) },
      ...(framePart ? [{ name: 'frame', role: 'fused', parts: [partRef(framePart)], px: framePx, pxCount: framePx.length, pxSha256: pxSha256(framePx) }] : []),
      ...read.digits.map((digit, di) => {
        const px = digitPx[di];
        return {
          name: `digit-${di}`, role: 'fused',
          parts: digitGlyphs[di].map((g) => partRef(g.part)),
          px, pxCount: px.length, pxSha256: pxSha256(px)
        };
      })
    ];
    const digits = read.digits.map((digit, di) => {
      const own = counters.filter((c) => c.digitIndex === di);
      const glyphPxCount = digitGlyphs[di].reduce((n, g) => n + g.px.length, 0);
      return {
        digitIndex: di, predicted: digit.predicted, bbox: [...digit.bbox],
        glyphComponents: digitGlyphs[di].map((g) => ({ label: g.part.label, bbox: [...g.part.bbox], area: g.part.area, pxCount: g.px.length, pxSha256: pxSha256(g.px) })),
        glyphPxCount,
        counter: own.length ? {
          fn: 'ownership-by-enclosure', part: 'counter',
          components: own.map((c) => ({ componentLabel: c.componentLabel, bbox: c.bbox, pxCount: c.pxCount, pxSha256: c.pxSha256 })),
          pxCount: own.reduce((n, c) => n + c.pxCount, 0),
          pxSha256: pxSha256(own.flatMap((c) => c.px).sort((a, b) => a - b))
        } : null
      };
    });
    return {
      index, label: badge.label ?? null, source: badge.source ?? null, bbox: [...badge.bbox],
      components: componentRecords,
      digits,
      counters: counters.map((c) => ({ componentLabel: c.componentLabel, digitIndex: c.digitIndex, bbox: c.bbox, px: c.px, pxCount: c.pxCount, pxSha256: c.pxSha256 })),
      counterPxTotal,
      anchor: {
        plateCentroid, fusedCentroid, deltaPx: anchorDeltaPx,
        exceedsThreshold: anchorDeltaPx > BADGE_ASSEMBLY.anchorFlagThresholdPx,
        thresholdPx: BADGE_ASSEMBLY.anchorFlagThresholdPx
      },
      fusedPx: assembled.fusedPx, fusedPxCount: assembled.fusedPxCount, fusedPxSha256: assembled.fusedPxSha256,
      componentOverlapPx: assembled.componentOverlapPx,
      ownership: assembled.ownership,
      residue: {
        windowResiduePx: assembled.ownership.residuePx,
        digitOwnedCounterPx: counterPxTotal,
        unexplainedResiduePx: assembled.ownership.residuePx - counterPxTotal
      },
      ownedWithCountersPx: assembled.fusedPxCount + counterPxTotal
    };
  });

  const fusedUnion = new Set();
  for (const r of records) for (const p of r.fusedPx) fusedUnion.add(p);
  const counterUnion = new Set();
  for (const r of records) for (const c of r.counters) for (const p of c.px) counterUnion.add(p);
  for (const p of counterUnion) if (fusedUnion.has(p)) throw new Error('badge assembly: counter union overlaps the fused union');
  const totals = {
    badgeCount: records.length,
    fusedVisitsPx: records.reduce((n, r) => n + r.fusedPxCount, 0),
    fusedUnionPx: fusedUnion.size,
    whitePx: records.reduce((n, r) => n + r.components.filter((c) => c.name !== 'plate').reduce((m, c) => m + c.pxCount, 0), 0),
    blackPx: records.reduce((n, r) => n + r.components.find((c) => c.name === 'plate').pxCount, 0),
    counterComponentCount: records.reduce((n, r) => n + r.counters.length, 0),
    counterPx: counterUnion.size,
    ownedWithCountersPx: fusedUnion.size + counterUnion.size,
    anchorFlaggedBadges: records.filter((r) => r.anchor.exceedsThreshold).map((r) => r.label)
  };
  return {
    schema: 'nctk-s1-badge-assembly@1',
    specDelta: BADGE_ASSEMBLY.specDelta, calculation: BADGE_ASSEMBLY.calculation, assemblyCalculation: BADGE_ASSEMBLY.assemblyCalculation,
    image: { widthPx, heightPx },
    totals,
    // Auto-instrumentation emit channel (ports/early/instrument.mjs): the
    // measures this Calculation declares on its output Part; the runner
    // copies them verbatim into the op's instrumentation entry.
    // Deterministic counts only: the branch re-execution witness hashes
    // this Part.
    emits: {
      badges: totals.badgeCount, fusedUnionPx: totals.fusedUnionPx,
      counterComponents: totals.counterComponentCount, counterPx: totals.counterPx,
      ownedWithCountersPx: totals.ownedWithCountersPx
    },
    badges: records
  };
}

/**
 * Independent re-derivation of ONE badge's component decomposition from
 * the raster fields alone, by a separate code path: it never reads the
 * badge's findPx component refs. The frame is the bright component whose
 * bbox is the badge bbox; the plate is the largest dark component
 * bbox-contained in it; the glyphs are the bright components (other than
 * the frame) bbox-contained in the plate; counters follow the same
 * enclosure rule re-derived here. Returns per-role pixel sets for exact
 * comparison against the assembly's record for that badge.
 */
export function rederiveBadgeComponents({ badge, read, fields }) {
  const widthPx = fields.bright.mask.width;
  const badgeBbox = [...badge.bbox];
  const brightComponents = fields.bright.components;
  const darkComponents = fields.dark.components;
  const frames = brightComponents.filter((c) => c.bboxX === badgeBbox[0] && c.bboxY === badgeBbox[1] && c.bboxW === badgeBbox[2] && c.bboxH === badgeBbox[3]);
  let framePart = null, framePx = [];
  if (badge.source === 'bright-family') {
    if (frames.length !== 1) throw new Error(`badge witness: badge ${badge.label} has ${frames.length} bright components with the badge bbox, expected exactly one frame`);
    framePart = { polarity: 'bright', label: frames[0].label, bbox: badgeBbox, area: frames[0].area };
    framePx = materializeComponent(fields.bright.labels, framePart, widthPx);
  }
  const plateCandidates = darkComponents
    .filter((c) => containsBbox(badgeBbox, [c.bboxX, c.bboxY, c.bboxW, c.bboxH]))
    .sort((a, b) => b.area - a.area || a.label - b.label);
  if (!plateCandidates.length) throw new Error(`badge witness: badge ${badge.label} has no contained dark component (no plate)`);
  if (plateCandidates.length > 1 && plateCandidates[0].area === plateCandidates[1].area)
    throw new Error(`badge witness: badge ${badge.label} has ambiguous largest contained dark components`);
  const plateComp = plateCandidates[0];
  const platePart = { polarity: 'dark', label: plateComp.label, bbox: [plateComp.bboxX, plateComp.bboxY, plateComp.bboxW, plateComp.bboxH], area: plateComp.area };
  const platePx = materializeComponent(fields.dark.labels, platePart, widthPx);
  const glyphComps = brightComponents.filter((c) => c.label !== framePart?.label && containsBbox(platePart.bbox, [c.bboxX, c.bboxY, c.bboxW, c.bboxH]));
  const digits = read.digits.map((digit, di) => {
    const glyphs = glyphComps
      .filter((c) => containsBbox(digit.bbox, [c.bboxX, c.bboxY, c.bboxW, c.bboxH]))
      .map((c) => {
        const ref = { polarity: 'bright', label: c.label, bbox: [c.bboxX, c.bboxY, c.bboxW, c.bboxH], area: c.area };
        return { ref, px: materializeComponent(fields.bright.labels, ref, widthPx) };
      });
    return { digitIndex: di, predicted: digit.predicted, glyphs };
  });
  if (digits.reduce((n, d) => n + d.glyphs.length, 0) !== glyphComps.length)
    throw new Error(`badge witness: badge ${badge.label} glyph components do not partition across the read's digits`);
  const owned = new Set(badge.px);
  const mute = new Set(badge.has.mute.px);
  const counters = [];
  for (const comp of darkComponents) {
    if (comp.label === plateComp.label) continue;
    if (!containsBbox(badgeBbox, [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH])) continue;
    const px = materializeComponent(fields.dark.labels, { polarity: 'dark', label: comp.label, bbox: [comp.bboxX, comp.bboxY, comp.bboxW, comp.bboxH], area: comp.area }, widthPx);
    if (px.some((p) => owned.has(p))) continue;
    if (!px.every((p) => mute.has(p))) continue;
    const containing = read.digits.map((d, di) => ({ d, di })).filter(({ d }) =>
      d.bbox[0] <= comp.bboxX && d.bbox[1] <= comp.bboxY
      && comp.bboxX + comp.bboxW <= d.bbox[0] + d.bbox[2] && comp.bboxY + comp.bboxH <= d.bbox[1] + d.bbox[3]);
    if (containing.length !== 1) continue;
    counters.push({ componentLabel: comp.label, digitIndex: containing[0].di, px, pxCount: px.length, pxSha256: pxSha256(px) });
  }
  return {
    label: badge.label,
    frame: framePart ? { part: framePart, px: framePx } : null,
    plate: { part: platePart, px: platePx },
    digits,
    counters
  };
}
