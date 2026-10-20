/**
 * S3 across UDisc's zoom levels (DOCTRINE, Sam 2026-10-20: "UDisc renders differently at different zooms"; "You SHOULD have
 * found a group of 9 square-ish things resembling tees").
 *
 * The pinned S3 (source/provider .../stages/S3/clean/Tee.ts, detectors/threeFactor/endpoints.ts) gates tee candidates in
 * fixed px BEFORE the family forms: an enclosed hole (the pad's grey fill) <= 44 px wide and <= 480 px in area, a frame
 * component <= 50 x 50 px and <= 500 px, rings merged within 10 px. Those are map-scaled quantities (the fill follows the
 * map), so at a zoomed capture every pad is thrown out before findFamily sees it (The Rec stitched: 2 tees of 9).
 *
 * Law of each S3 tee rule (pinned value -> how it is applied here):
 *   holeAreaMin 10 px, largeRadiiAreaMin 40 px      map-scaled floors; kept (a zoom-in only loosens what they reject)
 *   holeAreaMax 480 px, holeDimMax 44 px            map-scaled ceilings (the fill)      -> 1.0 rC1^2, 1.5 rC1
 *   frame area <= 500 px, bbox <= 50 x 50 px        map-scaled ceilings (pad outline)   -> 1.5 rC1^2, 2.0 rC1
 *   frame area >= 10 px                             floor; kept
 *   ringMergeProximity 10 px                        SCREEN-FIXED: it merges one hole found at dilation radii 0..3 px, whose
 *                                                   centroids differ by the dilation (screen px), not by the map; kept
 *   ringBand 3 px                                   SCREEN-FIXED (the white frame is ~3-4 px at every zoom); kept
 *   dilationRadii 0..3 px                           screen-fixed (AA / occlusion gaps in the frame stroke); kept
 *   ringFracMin 0.6, elongationThreshold 1.18       ratios of quantities that follow one law; kept
 *   family MAJOR/MINOR 1.25, AREA 1.5 (log-ratio)   LOCAL: members resemble each other (findFamily); kept
 * The map-scaled ceilings are purely in rC1 (no px floor): the floor bound on lenard, townelake, heritage and northpark
 * (rC1 21-27.5 px) and on none of the zoomed captures, and without it every dev course keeps the same family (judged).
 * The ceilings are only pre-filters, generous in rC1, and family consistency does the selection, as Sam asked: the family is
 * UP TO N visible pads that resemble each other (occluded pads are S4's), never forced to N. The unit of the map-scaled ceilings is rC1px, the radius of the basket's C1 circle (a physical 10 m
 * ring) measured per image before S3 from the S2 BasketPoints (tk.scale.rC1, fg/alpha/alphaSpace.mjs ringScale). The family
 * itself then carries its own size (pad major / rC1 = 0.64-0.79 across the dev courses and the zoomed captures, the frame
 * being screen-fixed and the fill map-scaled).
 */
export const TEE_SCALE = Object.freeze({ holeDimMax: 1.5, holeAreaMax: 1.0, frameDimMax: 2.0, frameAreaMax: 1.5 });
export const TEE_SCALE_UNITS = Object.freeze({ holeDimMax: 'rC1 (x rC1px)', holeAreaMax: 'rC1^2 (x rC1px^2)', frameDimMax: 'rC1 (x rC1px)', frameAreaMax: 'rC1^2 (x rC1px^2)' });
/** The pinned provider px: the screen-fixed ones are kept; the map-scaled ones apply only when rC1 is not measured. */
export const PINNED_PX = Object.freeze({ holeDimMax: 44, holeAreaMax: 480, frameDimMax: 50, frameAreaMax: 500, frameAreaMin: 10, ringMergeProximity: 10 });

/** The S3 tee bounds for an image whose C1 radius is rC1 px (null: not measured -> the pinned px, recorded as the condition). */
export function teeBounds(rC1) {
  const r = Number.isFinite(rC1) && rC1 > 0 ? rC1 : null;
  if (!r) return { rC1Px: null, ...PINNED_PX, condition: 'rC1 not measured: the pinned px bounds' };
  return {
    rC1Px: r, holeDimMax: TEE_SCALE.holeDimMax * r, holeAreaMax: TEE_SCALE.holeAreaMax * r * r,
    frameDimMax: TEE_SCALE.frameDimMax * r, frameAreaMax: TEE_SCALE.frameAreaMax * r * r,
    frameAreaMin: PINNED_PX.frameAreaMin, ringMergeProximity: PINNED_PX.ringMergeProximity, condition: null
  };
}

/**
 * fn.Tee.detectRings and fn.Tee.findFamily with the bounds above, the same operations as the pinned Tee.ts otherwise (the
 * provider's detectTeeRings with knobs, its selectTeeFamily). deps: { detectTeeRings, DEFAULT_ENDPOINTS_KNOBS, selectTeeFamily }.
 */
export function scaledTeeCalculations(deps, bounds) {
  const knobs = { ...deps.DEFAULT_ENDPOINTS_KNOBS, holeDimMax: bounds.holeDimMax, holeAreaMax: bounds.holeAreaMax, ringMergeProximity: bounds.ringMergeProximity };
  const detectRings = ({ fields, badges }) => {
    const enclosed = deps.detectTeeRings(fields.bright.mask, knobs), elongated = enclosed.filter((r) => r.kind === 'tee-rect');
    const muted = new Set(); for (const b of badges) for (const p of b.has.mute.px) muted.add(p);
    const { width, height } = fields.bright.mask, excludedByBadge = [], candidates = [];
    for (const ring of elongated) {
      const x = Math.round(ring.cx), y = Math.round(ring.cy), pixel = x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null;
      (pixel !== null && muted.has(pixel) ? excludedByBadge : candidates).push(ring);
    }
    return { enclosed, elongated, excludedByBadge, candidates };
  };
  const enclosingFrame = (ring, components) => components.filter((c) => c.area >= bounds.frameAreaMin && c.area <= bounds.frameAreaMax && c.bboxW <= bounds.frameDimMax && c.bboxH <= bounds.frameDimMax
    && ring.cx >= c.bboxX && ring.cx <= c.bboxX + c.bboxW && ring.cy >= c.bboxY && ring.cy <= c.bboxY + c.bboxH)
    .sort((l, r) => l.bboxW * l.bboxH - r.bboxW * r.bboxH || r.area - l.area || l.label - r.label)[0] ?? null;
  const findFamily = ({ rings, fields }) => {
    const measured = [], unframed = [];
    for (const ring of rings.candidates) { const frame = enclosingFrame(ring, fields.bright.components); if (frame) measured.push({ ring, frame }); else unframed.push(ring); }
    return { measured, unframed, ...deps.selectTeeFamily(measured) };
  };
  return { knobs, detectRings, findFamily };
}

const ORIGINAL = Symbol.for('chainspot-toolkit.teeScale.originalRegisterTee');
/**
 * Route the pinned S3's own registration of fn.Tee.detectRings / fn.Tee.findFamily to the scaled calculations (the toolkit
 * wraps provider entry points the same way it routes the stage gateways, ports/early/earlyStore.mjs); fn.Tee.findPx and
 * everything else stay the provider's. boundsOf() is read when S3 registers, so the bounds are this image's.
 */
export function installScaledTee(dist, boundsOf) {
  const tee = dist('stages/S3/clean/Tee'), ends = dist('detectors/threeFactor/endpoints');
  const original = tee.registerTee[ORIGINAL] ?? tee.registerTee;
  const deps = { detectTeeRings: ends.detectTeeRings, DEFAULT_ENDPOINTS_KNOBS: ends.DEFAULT_ENDPOINTS_KNOBS, selectTeeFamily: tee.selectTeeFamily };
  const wrapped = (pxc) => {
    const calc = scaledTeeCalculations(deps, boundsOf());
    const routed = Object.create(pxc);
    routed.register = (fn, calculate) => pxc.register(fn, fn.address === 'fn.Tee.detectRings' ? calc.detectRings : fn.address === 'fn.Tee.findFamily' ? calc.findFamily : calculate);
    return original(routed);
  };
  wrapped[ORIGINAL] = original;
  tee.registerTee = wrapped;
  return () => { tee.registerTee = original; };
}
