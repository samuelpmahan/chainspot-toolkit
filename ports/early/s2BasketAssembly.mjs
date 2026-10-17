/**
 * Toolkit-layer body-first assembly of the Basket Parts (declared spec
 * delta refine.s2.basketAssembly.bodyFirst in stages/s2.json; lane
 * lanes/s2/basket-assembly.json, default OFF). Assembly refactor phase 3.
 *
 * Sam's doctrine (2026-10-17): there is a literal step fusing a sprite's
 * Black and White PxSets into the full sprite, and per sprite the assembly
 * starts from the MORE RELIABLE BASE PxSet and fuses the rest onto it.
 * The pinned provider's clean S2 contract already fuses inline
 * (findPxCalculation: px = [...white, ...member.blackPx]), but the toolkit
 * seam receives only the finished px array with white/black counts: the
 * two component sets do not cross the seam as named structure, and no
 * anchor or ownership accounting rides on the Part. This Calculation
 * re-derives the identical set through the phase-1 assembly shape
 * (ports/early/assembly.mjs), from the provider's own component evidence,
 * never from the finished px.baskets set: assembling from the
 * already-fused set would be circular and prove nothing.
 *
 * The component seam, precisely: the BODY (the declared base, the bright
 * glyph component) is materialized from the px.components bright label
 * field at the component ref the basket records as its findPx body
 * (basket.has.findPx.body, the ref assembleBasketV1-style evidence the
 * provider's findPxCalculation itself materializes), and its size must
 * equal both the ref's declared area and the basket's recorded whitePx
 * count. The SHELL (fused onto the body) is the per-basket blackPx set
 * the basket records as its findShellFamily evidence
 * (basket.has.findShellFamily.blackPx, produced by the pinned
 * fn.Basket.findShellFamily), cross-checked element for element against
 * the px.baskets.shellFamily Part's member for the same basket, and its
 * size must equal the basket's recorded blackPx count. Two components,
 * separately sourced; the fused px.baskets array is only the gate's
 * baseline, never an input.
 *
 * The anchor rides on the Part: the basket's TIP, the bottom of the
 * glyph, the physical point the basket stands on. Circles and distances
 * are measured from the tip, and the radial circle fits
 * (renders/hidden-pads/circle-radial-fits-2026-10-17.md) place the C1S
 * and C2D ring centers at the semantic tip: the glyph origin plus
 * (21, 70) within the 46x72 semantic window. No bbox center or centroid
 * is used as the anchor.
 *
 * Ownership is accounted against the semantic window (the basket Part
 * bbox, 46x72: the 42x66 glyph window expanded by the shell family's
 * margins), and the residue (window px not owned) is named per basket.
 * On the golden specimen the phase-1 analysis measured this residue at
 * 1,172 to 1,177 px per basket; the wiring's guarantee gates on that
 * band.
 *
 * This module is pure over plain board data (basket objects, the
 * shellFamily Part, component fields), so the wiring's guarantee block
 * can re-execute it on a second restored branch and re-derive one
 * basket's decomposition independently (see rederiveBasketDecomposition,
 * a separate code path that never reads the basket's recorded findPx
 * body ref or findShellFamily blackPx).
 */
import { createHash } from 'node:crypto';
import { assembleSprite } from './assembly.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pxSha256 = (px) => sha256(Buffer.from(Uint32Array.from(px).buffer));

export const BASKET_ASSEMBLY = {
  specDelta: 'refine.s2.basketAssembly.bodyFirst',
  calculation: 'fn.Basket.findPx',
  assemblyCalculation: 'fn.Basket.assemble.bodyFirst',
  part: 'px.baskets.assembly',
  // Phase-1 analysis band for the per-basket window residue on the golden
  // specimen (ports/early/assembly.test.mjs specimen proof).
  expectedResidueBandPx: [1172, 1177]
};

const TIP_DERIVATION = 'the basket tip, the bottom of the glyph: the physical point the basket stands on. Circles and distances are measured from the tip, and the radial circle fits place the C1S and C2D ring centers at the semantic tip, glyph origin + (21, 70) within the 46x72 semantic window. No bbox center or centroid is used.';

// Materialize one component ref's pixel set from a polarity label field by
// scanning the component's own bbox (the same extraction the S1 badge
// assembly uses). Fails unless the scan finds exactly the component's
// declared area.
function materializeComponent(labels, part, widthPx) {
  const [bx, by, bw, bh] = part.bbox;
  const px = [];
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++)
      if (labels[y * widthPx + x] === part.label) px.push(y * widthPx + x);
  if (px.length !== part.area)
    throw new Error(`basket assembly: ${part.polarity} component ${part.label} materialized ${px.length} px, its declared area is ${part.area}`);
  return px;
}

const samePx = (a, b) => {
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
};
const sameTuple = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The body-first assembly Calculation. Inputs are live board values:
 * baskets (px.baskets objects carrying has.findPx.body and
 * has.findShellFamily evidence), shellFamily (the px.baskets.shellFamily
 * Part), fields (px.components with bright/dark label fields, masks and
 * component lists). Returns the serializable assembly Part for
 * px.baskets.assembly.
 */
export function computeBasketAssembly({ baskets, shellFamily, fields }) {
  const widthPx = fields.bright.mask.width, heightPx = fields.bright.mask.height;
  if (fields.dark.mask.width !== widthPx || fields.dark.mask.height !== heightPx)
    throw new Error('basket assembly: bright and dark component fields disagree on frame size');
  if (!Array.isArray(baskets) || !baskets.length)
    throw new Error('basket assembly: px.baskets is missing or empty');
  if (!shellFamily || !Array.isArray(shellFamily.members) || shellFamily.members.length !== baskets.length)
    throw new Error(`basket assembly: shellFamily members (${shellFamily?.members?.length}) are not index-aligned with the baskets (${baskets.length})`);
  const margins = shellFamily.margins;
  if (!Array.isArray(margins) || margins.length !== 4)
    throw new Error('basket assembly: the shellFamily Part carries no margins');

  const records = baskets.map((basket, index) => {
    const label = String(index + 1);
    const member = shellFamily.members[index];
    if (!basket.bbox || !sameTuple(member.bbox, [...basket.bbox]))
      throw new Error(`basket assembly: basket ${label} bbox disagrees with its shellFamily member bbox (baskets and shellFamily out of alignment)`);
    const bodyRef = basket.has?.findPx?.body;
    if (!bodyRef || bodyRef.polarity !== 'bright')
      throw new Error(`basket assembly: basket ${label} carries no findPx body component evidence (opaque basket object)`);
    const candidateBody = member.candidate?.body;
    if (!candidateBody || candidateBody.label !== bodyRef.label
      || !sameTuple([candidateBody.bboxX, candidateBody.bboxY, candidateBody.bboxW, candidateBody.bboxH], [...bodyRef.bbox])
      || candidateBody.area !== bodyRef.area)
      throw new Error(`basket assembly: basket ${label} findPx body ref disagrees with the family member's body component`);
    if (!sameTuple(basket.has.findShellFamily?.margins, margins))
      throw new Error(`basket assembly: basket ${label} recorded shell margins disagree with the shellFamily Part margins`);
    // The semantic window is the glyph window expanded by the shell
    // family's margins; the basket Part bbox must be exactly that window.
    const windowFromBody = [
      bodyRef.bbox[0] - margins[0], bodyRef.bbox[1] - margins[1],
      bodyRef.bbox[2] + margins[0] + margins[2], bodyRef.bbox[3] + margins[1] + margins[3]
    ];
    if (!sameTuple(windowFromBody, [...basket.bbox]))
      throw new Error(`basket assembly: basket ${label} semantic bbox is not its glyph window expanded by the shell margins`);

    const bodyPx = materializeComponent(fields.bright.labels, bodyRef, widthPx);
    if (bodyPx.length !== basket.whitePx)
      throw new Error(`basket assembly: basket ${label} body materialized ${bodyPx.length} px, the basket records whitePx ${basket.whitePx}`);
    const shellPx = [...basket.has.findShellFamily.blackPx].sort((a, b) => a - b);
    if (shellPx.length !== basket.blackPx)
      throw new Error(`basket assembly: basket ${label} shell evidence carries ${shellPx.length} px, the basket records blackPx ${basket.blackPx}`);
    if (!samePx(shellPx, member.blackPx))
      throw new Error(`basket assembly: basket ${label} recorded shell set disagrees with its shellFamily member's blackPx`);

    const tip = [bodyRef.bbox[0] + 21, bodyRef.bbox[1] + 70];
    const assembled = assembleSprite({
      part: 'px.baskets', calculation: BASKET_ASSEMBLY.assemblyCalculation,
      components: [
        { name: 'body', role: 'base', px: bodyPx },
        { name: 'shell', role: 'fused', px: shellPx }
      ],
      anchor: { value: tip, derivation: TIP_DERIVATION },
      window: { x: basket.bbox[0], y: basket.bbox[1], widthPx: basket.bbox[2], heightPx: basket.bbox[3], rowWidthPx: widthPx }
    });
    return {
      index, label,
      bbox: [...basket.bbox],
      components: [
        {
          name: 'body', role: 'base',
          parts: [{ polarity: bodyRef.polarity, label: bodyRef.label, bbox: [...bodyRef.bbox], area: bodyRef.area }],
          px: bodyPx, pxCount: bodyPx.length, pxSha256: pxSha256(bodyPx)
        },
        {
          name: 'shell', role: 'fused',
          evidence: { fn: basket.has.findShellFamily.fn, margins: [...margins], shellOffsetsCount: shellFamily.shellOffsets.length },
          px: shellPx, pxCount: shellPx.length, pxSha256: pxSha256(shellPx)
        }
      ],
      anchor: { tip, value: tip, derivation: TIP_DERIVATION },
      fusedPx: assembled.fusedPx, fusedPxCount: assembled.fusedPxCount, fusedPxSha256: assembled.fusedPxSha256,
      componentOverlapPx: assembled.componentOverlapPx,
      ownership: assembled.ownership,
      residuePx: assembled.ownership.residuePx
    };
  });

  const fusedUnion = new Set();
  for (const r of records) for (const p of r.fusedPx) fusedUnion.add(p);
  const totals = {
    basketCount: records.length,
    bodyPx: records.reduce((n, r) => n + r.components[0].pxCount, 0),
    shellPx: records.reduce((n, r) => n + r.components[1].pxCount, 0),
    fusedVisitsPx: records.reduce((n, r) => n + r.fusedPxCount, 0),
    fusedUnionPx: fusedUnion.size,
    residueTotalPx: records.reduce((n, r) => n + r.residuePx, 0)
  };
  return {
    schema: 'nctk-s2-basket-assembly@1',
    specDelta: BASKET_ASSEMBLY.specDelta, calculation: BASKET_ASSEMBLY.calculation, assemblyCalculation: BASKET_ASSEMBLY.assemblyCalculation,
    image: { widthPx, heightPx },
    totals,
    // Auto-instrumentation emit channel (ports/early/instrument.mjs): the
    // measures this Calculation declares on its output Part; the runner
    // copies them verbatim into the op's instrumentation entry.
    // Deterministic counts only: the branch re-execution witness hashes
    // this Part.
    emits: {
      baskets: totals.basketCount, fusedUnionPx: totals.fusedUnionPx,
      residuePx: totals.residueTotalPx
    },
    baskets: records
  };
}

/**
 * Independent re-derivation of ONE basket's body/shell decomposition by a
 * separate code path: it never reads the basket's recorded findPx body
 * ref or findShellFamily blackPx. The body is the bright component in
 * the fields' component list whose bbox is the glyph window the semantic
 * bbox and the family margins imply, materialized from the bright label
 * field; the shell is re-derived the way fn.Basket.findShellFamily
 * itself constructs a member's blackPx, from the family-level consensus
 * shell offsets in the shellFamily Part against the dark mask. Returns
 * per-role pixel sets for exact comparison against the assembly's record
 * for that basket.
 */
export function rederiveBasketDecomposition({ basket, shellFamily, fields }) {
  const widthPx = fields.bright.mask.width;
  const margins = shellFamily.margins;
  if (!Array.isArray(margins) || margins.length !== 4)
    throw new Error('basket witness: the shellFamily Part carries no margins');
  const glyphWindow = [
    basket.bbox[0] + margins[0], basket.bbox[1] + margins[1],
    basket.bbox[2] - margins[0] - margins[2], basket.bbox[3] - margins[1] - margins[3]
  ];
  const bodies = fields.bright.components.filter((c) =>
    c.bboxX === glyphWindow[0] && c.bboxY === glyphWindow[1] && c.bboxW === glyphWindow[2] && c.bboxH === glyphWindow[3]);
  if (bodies.length !== 1)
    throw new Error(`basket witness: ${bodies.length} bright components carry the glyph window of basket bbox ${basket.bbox}, expected exactly one body`);
  const bodyComp = bodies[0];
  const bodyPart = { polarity: 'bright', label: bodyComp.label, bbox: glyphWindow, area: bodyComp.area };
  const bodyPx = materializeComponent(fields.bright.labels, bodyPart, widthPx);
  const shellWidth = basket.bbox[2];
  const shellPx = [];
  for (const offset of shellFamily.shellOffsets) {
    const x = offset % shellWidth, y = Math.floor(offset / shellWidth);
    const pixel = (basket.bbox[1] + y) * widthPx + basket.bbox[0] + x;
    if (fields.dark.mask.data[pixel]) shellPx.push(pixel);
  }
  shellPx.sort((a, b) => a - b);
  return {
    body: { part: bodyPart, px: bodyPx },
    shell: { px: shellPx }
  };
}
