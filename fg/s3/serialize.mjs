/**
 * Serializers for the S3 Parts, shared by the S3 FunctionalGuarantees (not
 * an FG file). The inline blocks serialized px.tees, px.tees.rings and
 * px.tees.family once and handed the arrays to the findFamily fix block as
 * locals; as FGs, each guarantee reads the Parts itself and serializes them
 * with the same functions, so the fix FG's baseline tuples and the
 * witness's ringsPlain/familyPlain are exactly what the materialize FGs
 * wrote to artifacts/s3/.
 *
 * pxSha(typedArray) is the caller's hash of a px list's bytes (an FG passes
 * a function that calls fn.tk.sha256).
 */
import { legacyPlain } from '../legacy.mjs';

export const serializeTee = (tee, index, pxSha, { extra = {}, findFamilyFn = null } = {}) => ({
  index, label: String(index + 1),
  center: [...tee.center], bbox: [...tee.bbox], innerBbox: [...tee.innerBbox], angleRad: tee.angleRad,
  px: [...tee.px], pxCount: tee.px.length,
  pxSha256: pxSha(tee.px),
  ...extra,
  detectRings: { fn: tee.has.detectRings.fn, hole: legacyPlain(tee.has.detectRings.hole) },
  findFamily: { fn: findFamilyFn ?? tee.has.findFamily.fn, frame: legacyPlain(tee.has.findFamily.frame) },
  findPx: { fn: tee.has.findPx.fn, parts: legacyPlain(tee.has.findPx.parts) }
});

export const serializeRings = (rings) => ({
  enclosed: rings.enclosed.map(legacyPlain),
  elongated: rings.elongated.map(legacyPlain),
  excludedByBadge: rings.excludedByBadge.map(legacyPlain),
  candidates: rings.candidates.map(legacyPlain)
});

const memberView = (m) => ({ ring: legacyPlain(m.ring), frame: legacyPlain(m.frame) });
export const serializeFamily = (family) => ({
  measured: family.measured.map(memberView),
  unframed: family.unframed.map(legacyPlain),
  members: family.members.map(memberView),
  anchor: family.anchor ? memberView(family.anchor) : null
});

/** The per-tee identity tuple the fix FG compares carried-over members by. */
export const teeTuple = (t) => [t.center, t.bbox, t.innerBbox, t.angleRad, t.pxCount, t.pxSha256];
