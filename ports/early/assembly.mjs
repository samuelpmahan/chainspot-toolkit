/**
 * The sprite assembly Calculation shape (toolkit layer; groundwork for the
 * assembly refactor, phase 1: no stage is rewired onto it yet).
 *
 * Sam's doctrine (2026-10-17): the engine has a literal step fusing the
 * Black and White PxSets into the full sprite. Per sprite, assembly starts
 * from the MORE RELIABLE BASE PxSet and fuses the rest onto it, because
 * PxSets are what compose each Part. The bare minimum of reliability is
 * that all px within a sprite become owned, and thus subtracted in the PCR.
 * A Part is composed of subParts (each produced by some Calculation) and
 * the Calculations which compose the Part, so the assembled Part carries
 * its named components and its composing Calculation with it; the shape,
 * not a flat px array with two counts, is what crosses the seam.
 *
 * Input: assembleSprite({ part, calculation, components, anchor, window })
 *   part:        the Part address being assembled (e.g. 'px.baskets').
 *   calculation: the composing Calculation's name.
 *   components:  [{ name, role, px }] — named PxSets, each with a role;
 *                role is 'base' for exactly one component (the reliable
 *                base the assembly starts from) and 'fused' for the rest,
 *                which are fused onto the base. px is any iterable of flat
 *                raster indices.
 *   anchor:      { value, derivation } — the sprite's reference point rides
 *                on the Part as a value, with the derivation that fixes it
 *                (reference points are fixed by use, not chosen per lane).
 *   window:      optional { x, y, widthPx, heightPx, rowWidthPx } — the
 *                sprite's defined extent, against which ownership is
 *                accounted.
 *
 * Output: the assembled Part object:
 *   { schema: 'nctk-assembly@1', part, calculation,
 *     components: [{ name, role, pxCount }] in input order,
 *     fusedPx (the union of all components, sorted), fusedPxCount,
 *     fusedPxSha256,
 *     componentOverlapPx (px claimed by more than one component),
 *     anchor: { value, derivation },
 *     ownership: { ownedPx,
 *                  windowPx, ownedWithinWindowPx, ownedOutsideWindowPx,
 *                  residuePx } }
 *   residuePx, present when a window is defined, is the count of window px
 *   NOT owned: that Part's residue. An unowned sprite pixel inside the
 *   window is a floor-level failure regardless of detection scores, so the
 *   residue is named on the Part, never left implicit.
 */
import { createHash } from 'node:crypto';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assembleSprite({ part, calculation, components, anchor, window = null }) {
  if (typeof part !== 'string' || !part) throw new Error('assembly: part address is required');
  if (typeof calculation !== 'string' || !calculation) throw new Error('assembly: the composing Calculation name is required');
  if (!Array.isArray(components) || components.length === 0) throw new Error('assembly: at least one component PxSet is required');
  const bases = components.filter((c) => c.role === 'base');
  if (bases.length !== 1) throw new Error(`assembly: exactly one component must be declared the base; received ${bases.length}`);
  const names = new Set();
  for (const c of components) {
    if (typeof c.name !== 'string' || !c.name) throw new Error('assembly: every component needs a name');
    if (names.has(c.name)) throw new Error(`assembly: duplicate component name '${c.name}'`);
    names.add(c.name);
    if (c.role !== 'base' && c.role !== 'fused') throw new Error(`assembly: component '${c.name}' has unknown role '${c.role}'`);
    if (!c.px || typeof c.px[Symbol.iterator] !== 'function') throw new Error(`assembly: component '${c.name}' px is not an iterable of raster indices`);
  }
  if (!anchor || anchor.value === undefined || typeof anchor.derivation !== 'string' || !anchor.derivation)
    throw new Error('assembly: an anchor point value with a derivation note is required');

  const componentSets = components.map((c) => {
    const set = new Set();
    for (const pixel of c.px) {
      if (!Number.isInteger(pixel) || pixel < 0) throw new Error(`assembly: component '${c.name}' carries a non-index px value ${pixel}`);
      set.add(pixel);
    }
    return set;
  });
  const fused = new Set();
  for (const set of componentSets) for (const pixel of set) fused.add(pixel);
  const fusedPx = [...fused].sort((a, b) => a - b);
  const componentVisits = componentSets.reduce((n, set) => n + set.size, 0);

  const ownership = { ownedPx: fused.size };
  if (window) {
    const { x, y, widthPx, heightPx, rowWidthPx } = window;
    if (![x, y, widthPx, heightPx, rowWidthPx].every(Number.isInteger) || widthPx <= 0 || heightPx <= 0 || rowWidthPx <= 0)
      throw new Error('assembly: window requires integer x, y, widthPx, heightPx, rowWidthPx');
    let ownedWithinWindowPx = 0;
    for (let dy = 0; dy < heightPx; dy++) {
      const rowStart = (y + dy) * rowWidthPx + x;
      for (let dx = 0; dx < widthPx; dx++) if (fused.has(rowStart + dx)) ownedWithinWindowPx++;
    }
    ownership.windowPx = widthPx * heightPx;
    ownership.ownedWithinWindowPx = ownedWithinWindowPx;
    ownership.ownedOutsideWindowPx = fused.size - ownedWithinWindowPx;
    ownership.residuePx = ownership.windowPx - ownedWithinWindowPx;
  }

  return {
    schema: 'nctk-assembly@1',
    part,
    calculation,
    components: components.map((c, i) => ({ name: c.name, role: c.role, pxCount: componentSets[i].size })),
    fusedPx,
    fusedPxCount: fused.size,
    fusedPxSha256: sha256(Buffer.from(Uint32Array.from(fusedPx).buffer)),
    componentOverlapPx: componentVisits - fused.size,
    anchor: { value: anchor.value, derivation: anchor.derivation },
    ownership
  };
}
