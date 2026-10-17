/**
 * Toolkit-layer interior-first assembly of the Tee Parts (declared spec
 * delta refine.s3.teeAssembly.interiorFirst in stages/s3.json; lane
 * lanes/s3/tee-assembly.json, default OFF). Assembly refactor phase 4.
 *
 * Sam's doctrine (2026-10-17): there is a literal step fusing a sprite's
 * Black and White PxSets into the full sprite, and per sprite the assembly
 * starts from the MORE RELIABLE BASE PxSet and fuses the rest onto it.
 * The tee is the one sprite class the pinned provider never fuses at all:
 * the clean S3 contract's Tee.findPx materializes only the single bright
 * frame component, so a baseline tee Part is its frame alone, and the
 * enclosed interior the frame surrounds lives on px.tees.rings only as
 * geometry (the ring record: center, bbox, holeArea), never as pixels of
 * the tee Part. This Calculation assembles each baseline tee whole
 * through the phase-1 assembly shape (ports/early/assembly.mjs): the
 * enclosed interior is the declared base (it is bounded by the frame and
 * cannot merge into another sprite, while the bright frame is a bright
 * set, with a bright set's failure modes), and the frame component is
 * fused onto it. Unlike phases 2 and 3 this is a genuine delta, not a
 * reproduction: the fused set owns interior pixels the baseline Part
 * never claimed. The frame set itself must still reproduce the baseline
 * tee px exactly; that is the wiring's gate.
 *
 * The component seam, precisely. The FRAME is materialized from the
 * px.components bright label field at the component refs the tee records
 * as its findPx evidence (tee.has.findPx.parts, the refs the pinned
 * Tee.findPx itself materializes), and its size must equal both the
 * refs' declared areas and the tee's recorded px count. The INTERIOR is
 * not carried by the provider as a pixel set anywhere: the rings
 * evidence records it only as geometry. It is therefore DERIVED here
 * from the branch's bright mask (fields.bright.mask): inside the frame
 * component's bbox window (expanded by one pixel), flood from the
 * window's border through not-bright pixels (4-connectivity); the
 * interior is the not-bright pixels the flood cannot reach, the enclosed
 * complement component the frame surrounds. The derivation is gated
 * exactly, per tee: the derived size must equal the ring's recorded
 * holeArea and the derived bbox must equal the ring's recorded bbox
 * (which is also the tee's recorded innerBbox). A tee whose interior
 * cannot be derived to that exact gate fails here, named, rather than
 * being forced.
 *
 * The anchor rides on the Part: the ring center fitted by
 * fn.Tee.detectRings, the center of the enclosed interior. It is NOT the
 * frame component's centroid; the frame centroid and the distance
 * between the two are recorded per tee for the record.
 *
 * Ownership is accounted against the frame component's bbox (the tee's
 * recorded bbox), and the residue (window px owned by neither the
 * interior nor the frame) is named per tee.
 *
 * Scope: the 18 baseline tees only. Composition with the S3FIX refined
 * tee set (px.tees.refined) is out of scope for this delta.
 *
 * This module is pure over plain board data (tee objects, the rings
 * Part, component fields), so the wiring's guarantee block can
 * re-execute it on a second restored branch and re-derive one tee's
 * interior independently (see rederiveTeeInterior, a separate code path
 * that never reads the tee's findPx component refs or its ring record).
 */
import { createHash } from 'node:crypto';
import { assembleSprite } from './assembly.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pxSha256 = (px) => sha256(Buffer.from(Uint32Array.from(px).buffer));
const round4 = (v) => Math.round(v * 10000) / 10000;

export const TEE_ASSEMBLY = {
  specDelta: 'refine.s3.teeAssembly.interiorFirst',
  calculation: 'fn.Tee.findPx',
  assemblyCalculation: 'fn.Tee.assemble.interiorFirst',
  part: 'px.tees.assembly'
};

const ANCHOR_DERIVATION = 'the ring center fitted by fn.Tee.detectRings: the center (centroid) of the enclosed interior the tee frame surrounds. The tee\'s reference point is the center of its enclosed interior, the base of this assembly; the frame component\'s centroid is recorded beside it, never used as the anchor.';

// Materialize one component ref's pixel set from a polarity label field by
// scanning the component's own bbox (the same extraction the S1/S2
// assemblies use). Fails unless the scan finds exactly the component's
// declared area.
function materializeComponent(labels, part, widthPx) {
  const [bx, by, bw, bh] = part.bbox;
  const px = [];
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++)
      if (labels[y * widthPx + x] === part.label) px.push(y * widthPx + x);
  if (px.length !== part.area)
    throw new Error(`tee assembly: ${part.polarity} component ${part.label} materialized ${px.length} px, its declared area is ${part.area}`);
  return px;
}

const sameTuple = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const ringTupleOf = (r) => [r.cx, r.cy, r.bboxX, r.bboxY, r.bboxW, r.bboxH, r.kind];
const bboxOf = (px, widthPx) => {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const p of px) {
    const x = p % widthPx, y = Math.floor(p / widthPx);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
};
const centroidOf = (px, widthPx) => {
  let sx = 0, sy = 0;
  for (const p of px) { sx += p % widthPx; sy += Math.floor(p / widthPx); }
  return [round4(sx / px.length), round4(sy / px.length)];
};

/**
 * Derive the enclosed interior pixel set of one tee frame from the
 * bright mask: flood the frame window (the frame bbox expanded by one
 * pixel, clipped to the image) from its border through not-bright
 * pixels, 4-connectivity; the interior is the not-bright pixels the
 * flood cannot reach. This is the complement component the frame
 * encloses, the same region fn.Tee.detectRings records as the ring's
 * hole; the caller gates it exactly against that record.
 */
function deriveEnclosedInterior(frameBbox, brightMask, widthPx, heightPx) {
  const [fx, fy, fw, fh] = frameBbox;
  const x0 = Math.max(0, fx - 1), y0 = Math.max(0, fy - 1);
  const x1 = Math.min(widthPx - 1, fx + fw), y1 = Math.min(heightPx - 1, fy + fh);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const reached = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => {
    const i = (y - y0) * w + (x - x0);
    if (!reached[i] && !brightMask[y * widthPx + x]) { reached[i] = 1; stack.push([x, y]); }
  };
  for (let x = x0; x <= x1; x++) { seed(x, y0); seed(x, y1); }
  for (let y = y0; y <= y1; y++) { seed(x0, y); seed(x1, y); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x > x0) seed(x - 1, y);
    if (x < x1) seed(x + 1, y);
    if (y > y0) seed(x, y - 1);
    if (y < y1) seed(x, y + 1);
  }
  const interior = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (!brightMask[y * widthPx + x] && !reached[(y - y0) * w + (x - x0)]) interior.push(y * widthPx + x);
  return interior;
}

/**
 * The interior-first assembly Calculation. Inputs are live board values:
 * tees (px.tees objects carrying has.detectRings.hole, has.findFamily
 * and has.findPx evidence), rings (the px.tees.rings Part), fields
 * (px.components with bright/dark label fields and masks). Returns the
 * serializable assembly Part for px.tees.assembly.
 */
export function computeTeeAssembly({ tees, rings, fields }) {
  const widthPx = fields.bright.mask.width, heightPx = fields.bright.mask.height;
  if (!fields.bright.labels || fields.bright.labels.length !== widthPx * heightPx)
    throw new Error('tee assembly: the bright label field does not cover the frame');
  if (!Array.isArray(tees) || !tees.length)
    throw new Error('tee assembly: px.tees is missing or empty');
  if (!rings || !Array.isArray(rings.candidates) || !rings.candidates.length)
    throw new Error('tee assembly: px.tees.rings carries no candidate rings to gate the interiors against');
  const candidateKeys = new Set(rings.candidates.map((r) => JSON.stringify(ringTupleOf(r))));

  const records = tees.map((tee, index) => {
    const label = String(index + 1);
    const ring = tee.has?.detectRings?.hole;
    if (!ring || typeof ring.holeArea !== 'number')
      throw new Error(`tee assembly: tee ${label} carries no detectRings hole evidence (opaque tee object)`);
    if (!candidateKeys.has(JSON.stringify(ringTupleOf(ring))))
      throw new Error(`tee assembly: tee ${label} ring is not among the px.tees.rings candidates`);
    if (!sameTuple(tee.innerBbox, [ring.bboxX, ring.bboxY, ring.bboxW, ring.bboxH]))
      throw new Error(`tee assembly: tee ${label} innerBbox ${tee.innerBbox} disagrees with its ring bbox [${ring.bboxX}, ${ring.bboxY}, ${ring.bboxW}, ${ring.bboxH}]`);
    const parts = tee.has?.findPx?.parts;
    if (!Array.isArray(parts) || !parts.length || parts.some((p) => p.polarity !== 'bright'))
      throw new Error(`tee assembly: tee ${label} carries no bright findPx frame component evidence (opaque tee object)`);
    const familyFrame = tee.has?.findFamily?.frame;
    if (familyFrame && !parts.some((p) => p.label === familyFrame.label && sameTuple(p.bbox, familyFrame.bbox) && p.area === familyFrame.area))
      throw new Error(`tee assembly: tee ${label} findPx parts disagree with its findFamily frame ref`);
    const framePx = parts.flatMap((part) => materializeComponent(fields.bright.labels, part, widthPx)).sort((a, b) => a - b);
    if (new Set(framePx).size !== framePx.length)
      throw new Error(`tee assembly: tee ${label} findPx frame parts overlap each other`);
    if (framePx.length !== tee.px.length)
      throw new Error(`tee assembly: tee ${label} frame materialized ${framePx.length} px, the tee records px count ${tee.px.length}`);
    if (!sameTuple(bboxOf(framePx, widthPx), [...tee.bbox]))
      throw new Error(`tee assembly: tee ${label} frame bbox disagrees with the tee's recorded bbox ${tee.bbox}`);

    // The interior: derived from the bright mask as the enclosed
    // complement component inside the frame window, gated exactly
    // against the ring record (size and bbox).
    const interiorPx = deriveEnclosedInterior(tee.bbox, fields.bright.mask.data, widthPx, heightPx);
    if (interiorPx.length !== ring.holeArea)
      throw new Error(`tee assembly: tee ${label} enclosed interior derived ${interiorPx.length} px, its ring records holeArea ${ring.holeArea}`);
    if (!sameTuple(bboxOf(interiorPx, widthPx), [ring.bboxX, ring.bboxY, ring.bboxW, ring.bboxH]))
      throw new Error(`tee assembly: tee ${label} derived interior bbox disagrees with its ring bbox`);

    const anchor = [ring.cx, ring.cy];
    const frameCentroid = centroidOf(framePx, widthPx);
    const anchorDistancePx = round4(Math.hypot(anchor[0] - frameCentroid[0], anchor[1] - frameCentroid[1]));
    const assembled = assembleSprite({
      part: 'px.tees', calculation: TEE_ASSEMBLY.assemblyCalculation,
      components: [
        { name: 'interior', role: 'base', px: interiorPx },
        { name: 'frame', role: 'fused', px: framePx }
      ],
      anchor: { value: anchor, derivation: ANCHOR_DERIVATION },
      window: { x: tee.bbox[0], y: tee.bbox[1], widthPx: tee.bbox[2], heightPx: tee.bbox[3], rowWidthPx: widthPx }
    });
    if (assembled.componentOverlapPx !== 0)
      throw new Error(`tee assembly: tee ${label} interior and frame overlap by ${assembled.componentOverlapPx} px`);
    return {
      index, label,
      bbox: [...tee.bbox], innerBbox: [...tee.innerBbox],
      ring: {
        fn: tee.has.detectRings.fn,
        cx: ring.cx, cy: ring.cy, holeArea: ring.holeArea,
        bbox: [ring.bboxX, ring.bboxY, ring.bboxW, ring.bboxH],
        angle: ring.angle, elongation: ring.elongation, ringFrac: ring.ringFrac, kind: ring.kind
      },
      components: [
        {
          name: 'interior', role: 'base',
          evidence: {
            source: 'derived from the px.components bright mask as the enclosed complement component inside the frame window (flood from the window border through not-bright pixels, 4-connectivity); the provider records the interior only as ring geometry',
            gatedAgainst: { holeArea: ring.holeArea, ringBbox: [ring.bboxX, ring.bboxY, ring.bboxW, ring.bboxH] }
          },
          px: interiorPx, pxCount: interiorPx.length, pxSha256: pxSha256(interiorPx)
        },
        {
          name: 'frame', role: 'fused',
          parts: parts.map((p) => ({ polarity: p.polarity, label: p.label, bbox: [...p.bbox], area: p.area })),
          px: framePx, pxCount: framePx.length, pxSha256: pxSha256(framePx)
        }
      ],
      anchor: { value: anchor, derivation: ANCHOR_DERIVATION, frameCentroid, distanceToFrameCentroidPx: anchorDistancePx },
      fusedPx: assembled.fusedPx, fusedPxCount: assembled.fusedPxCount, fusedPxSha256: assembled.fusedPxSha256,
      componentOverlapPx: assembled.componentOverlapPx,
      ownership: assembled.ownership,
      residuePx: assembled.ownership.residuePx
    };
  });

  const unionOf = (lists) => { const set = new Set(); for (const list of lists) for (const p of list) set.add(p); return set; };
  const frameUnion = unionOf(records.map((r) => r.components[1].px));
  const interiorUnion = unionOf(records.map((r) => r.components[0].px));
  const fusedUnion = unionOf(records.map((r) => r.fusedPx));
  const totals = {
    teeCount: records.length,
    framePx: records.reduce((n, r) => n + r.components[1].pxCount, 0),
    frameUnionPx: frameUnion.size,
    interiorPx: records.reduce((n, r) => n + r.components[0].pxCount, 0),
    interiorUnionPx: interiorUnion.size,
    fusedVisitsPx: records.reduce((n, r) => n + r.fusedPxCount, 0),
    fusedUnionPx: fusedUnion.size,
    residueTotalPx: records.reduce((n, r) => n + r.residuePx, 0)
  };
  return {
    schema: 'nctk-s3-tee-assembly@1',
    specDelta: TEE_ASSEMBLY.specDelta, calculation: TEE_ASSEMBLY.calculation, assemblyCalculation: TEE_ASSEMBLY.assemblyCalculation,
    image: { widthPx, heightPx },
    totals,
    // Auto-instrumentation emit channel (ports/early/instrument.mjs): the
    // measures this Calculation declares on its output Part; the runner
    // copies them verbatim into the op's instrumentation entry.
    // Deterministic counts only: the branch re-execution witness hashes
    // this Part.
    emits: {
      tees: totals.teeCount, frameUnionPx: totals.frameUnionPx,
      interiorUnionPx: totals.interiorUnionPx, fusedUnionPx: totals.fusedUnionPx
    },
    tees: records
  };
}

/**
 * Independent re-derivation of ONE tee's interior set by a separate code
 * path: it never reads the tee's findPx component refs or its
 * detectRings ring record. Starting from the tee object's own center,
 * it grows the not-bright connected component containing the center
 * pixel (4-connectivity, bounded by the tee's frame bbox window
 * expanded by one pixel) and requires that the component is enclosed
 * (it never touches the window border) and that its bbox is the tee's
 * recorded innerBbox. Returns the interior pixel set for exact
 * comparison against the assembly's record for that tee.
 */
export function rederiveTeeInterior({ tee, fields }) {
  const widthPx = fields.bright.mask.width, heightPx = fields.bright.mask.height;
  const brightMask = fields.bright.mask.data;
  const [fx, fy, fw, fh] = tee.bbox;
  const x0 = Math.max(0, fx - 1), y0 = Math.max(0, fy - 1);
  const x1 = Math.min(widthPx - 1, fx + fw), y1 = Math.min(heightPx - 1, fy + fh);
  const startX = Math.round(tee.center[0]), startY = Math.round(tee.center[1]);
  if (brightMask[startY * widthPx + startX])
    throw new Error('tee witness: the tee center pixel is bright; no interior component contains it');
  const seen = new Set([startY * widthPx + startX]);
  const stack = [[startX, startY]];
  let touchesBorder = false;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === x0 || x === x1 || y === y0 || y === y1) touchesBorder = true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const pixel = ny * widthPx + nx;
      if (brightMask[pixel] || seen.has(pixel)) continue;
      seen.add(pixel); stack.push([nx, ny]);
    }
  }
  if (touchesBorder)
    throw new Error('tee witness: the component containing the tee center reaches the frame window border; it is not enclosed');
  const px = [...seen].sort((a, b) => a - b);
  if (!sameTuple(bboxOf(px, widthPx), [...tee.innerBbox]))
    throw new Error(`tee witness: the interior component bbox disagrees with the tee's innerBbox ${tee.innerBbox}`);
  return { interior: { px } };
}
