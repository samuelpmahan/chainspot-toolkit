/**
 * S0's capture: the tiles of ONE capture become one course raster in one frame (Sam, 2026-10-19: "a stitched course is one
 * raster"; "stitching is native, now"). The tiles and their placements are that raster's backing: S1-S7 read the course.
 *
 *   fn.tk.source.stitch       tk.source.captureTiles -> tk.source.capture (the placement record) + tk.source.courseRaster
 *                             calls fn.q.stitch.place / frame / composite (fg/queries/stitch.mjs)
 *   fn.tk.source.captureView  tk.source.capture + tk.source.cropReceipt -> tk.source.captureView: the same record in the
 *                             CANONICAL frame of the course (S0's own crop of the course raster subtracted), what renders
 *                             over px.course.canonicalPixels
 *
 * tk.source.captureTiles is produced by the runner (ports/capture/capture.mjs: per tile, the pinned S0 crop and S1 badges).
 * A capture of one tile is not stitched at all (the runner passes the file through; see ports/capture). Data conditions
 * (an unplaced tile, a rejected link, a hole number no tile shows) are recorded, never thrown. Units: px (tile source
 * rasters; the composite), luma levels 0..255, ratios.
 */
import { STITCH, TRANSFORM } from '../queries/stitch.mjs';

export const CAPTURE_SCHEMA = 'nctk-capture@1';
export const CONVENTION = 'ChainSpot main src/lib/stitch (stitchPipeline.ts, renderComposite.ts, domain/provenance.ts): transform = tile source-raster px -> composite px [a, b, c, d, e, f]; coverage polygon = transform(crop corners) TL, TR, BR, BL; origin = -floor(min of the union); integer translation = direct copy, else nearest-neighbour at the pixel centre; uncovered = opaque black, owner 0 (ChainSpot: transparent; the toolkit stages need an opaque frame)';
const r3 = (v) => Math.round(v * 1000) / 1000;

/** The capture record from the tiles, their placement and the composite frame (pure; testable without pixels). */
export function captureRecord(tiles, placement, frame, owner) {
  const byName = new Map(frame.tiles.map((t) => [t.name, t]));
  const ownedPx = new Map(); if (owner) for (let k = 0; k < owner.length; k++) if (owner[k]) ownedPx.set(owner[k] - 1, (ownedPx.get(owner[k] - 1) ?? 0) + 1);
  const holes = new Map();
  for (const t of tiles) {
    const placed = byName.get(t.name); if (!placed) continue;
    for (const b of t.badges) { const [x, y] = TRANSFORM.apply(placed.transform.coefficients, b.xPx, b.yPx); (holes.get(b.holeNumber) ?? holes.set(b.holeNumber, []).get(b.holeNumber)).push({ tile: t.name, xPx: x, yPx: y }); }
  }
  const badges = [...holes.entries()].sort((a, b) => a[0] - b[0]).map(([holeNumber, v]) => ({ holeNumber, xPx: r3(v.reduce((s, q) => s + q.xPx, 0) / v.length), yPx: r3(v.reduce((s, q) => s + q.yPx, 0) / v.length), seenIn: v.map((q) => q.tile),
    disagreementPx: r3(v.length > 1 ? Math.max(...v.flatMap((a, i) => v.slice(i + 1).map((b) => Math.hypot(a.xPx - b.xPx, a.yPx - b.yPx)))) : 0) }));
  const N = badges.length ? Math.max(...badges.map((b) => b.holeNumber)) : 0, seen = new Set(badges.map((b) => b.holeNumber));
  const missing = Array.from({ length: N }, (_, i) => i + 1).filter((h) => !seen.has(h));
  const conditions = [
    ...placement.unplaced.map((t) => `tile ${t} is not placed: no badge link and no pixel overlap was confirmed`),
    ...placement.rejected.map((l) => `link ${l.a} - ${l.b} (badges ${l.sharedHoles.join(', ')}) rejected by pixels (contrast ${l.pixel?.contrast ?? 'n/a'})`),
    ...missing.map((h) => `hole ${h} is below the highest hole number ${N} but no tile shows its badge`)
  ];
  const confirmed = placement.links.filter((l) => l.confirmed);
  return {
    schema: CAPTURE_SCHEMA, convention: CONVENTION, overlapRule: STITCH.overlapRule,
    overlapRuleText: 'the tile that sees the point deepest wins: largest distance from the point to that tile\'s own crop edge (tile source px); ties: the earlier tile of the capture',
    frame: { widthPx: frame.widthPx, heightPx: frame.heightPx, frameTile: placement.frameTile ?? null, seed: placement.seed ?? null },
    tiles: tiles.map((t, i) => { const p = byName.get(t.name); return { name: t.name, path: t.path ?? null, sha256: t.sha256 ?? null, widthPx: t.widthPx, heightPx: t.heightPx, crop: t.crop,
      badgesRead: t.badges.map((b) => b.holeNumber), badgeWidthPx: t.badgeWidthPx ?? null, placed: Boolean(p),
      ...(p ? { transform: p.transform, coveragePolygon: p.coveragePolygon, copy: p.copy, ownedPx: ownedPx.get(i) ?? 0 } : {}) }; }),
    tree: placement.tree, links: placement.links, rejected: placement.rejected, closures: placement.closures ?? [], unplaced: placement.unplaced,
    searchRadiusPx: placement.radiusPx ?? null,
    badges, coverage: { holes: [...seen].sort((a, b) => a - b), seen: seen.size, of: N, missing, text: `${seen.size}/${N}` },
    conditions,
    emits: { tiles: tiles.length, tilesPlaced: frame.tiles.length, links: placement.links.length, linksConfirmed: confirmed.length, linksRejected: placement.rejected.length,
      linksResampled: confirmed.filter((l) => l.model !== 'translation').length, holesCovered: seen.size, holesOf: N, maxLinkResidualLuma: confirmed.length ? Math.max(...confirmed.map((l) => l.residualLuma)) : 0 }
  };
}

export const STITCH_CALCULATION = ['fn.tk.source.stitch', {
  inParts: ['tk.source.captureTiles'], outParts: ['tk.source.capture', 'tk.source.courseRaster'],
  calls: ['fn.q.stitch.place', 'fn.q.stitch.frame', 'fn.q.stitch.composite'],
  note: 'the tiles of one capture into one course raster: badges place, pixels confirm and tighten (fg/queries/stitch.mjs)',
  calculate: (io) => {
    const tiles = io.in('tk.source.captureTiles');
    const placement = io.call('fn.q.stitch.place', { tiles: 'tk.source.captureTiles' }).value;
    const frame = io.call('fn.q.stitch.frame', { tiles: 'tk.source.captureTiles', transforms: placement.transforms }).value;
    const raster = io.call('fn.q.stitch.composite', { tiles: 'tk.source.captureTiles', frame }).value;
    return { 'tk.source.capture': captureRecord(tiles, placement, frame, raster.owner), 'tk.source.courseRaster': { ...raster, emits: { courseWidthPx: raster.widthPx, courseHeightPx: raster.heightPx } } };
  }
}];

/** The capture record in the course's CANONICAL frame: S0 crops the course raster too (its chrome rule); y shifts by its top rows. */
export function captureView(capture, crop, raster = null) {
  const dy = crop?.upperRowsRemoved ?? 0, sh = (p) => ({ ...p, yPx: r3(p.yPx - dy) });
  const H = capture.frame.heightPx - dy - (crop?.lowerRowsRemoved ?? 0), owner = raster?.owner ? raster.owner.subarray(dy * capture.frame.widthPx, (dy + H) * capture.frame.widthPx) : null;
  return { ...capture, schema: 'nctk-capture-view@1', canonical: { rowsRemovedTop: dy, rowsRemovedBottom: crop?.lowerRowsRemoved ?? 0, rule: `canonical y = composite y - ${dy} px (S0 crop of the course raster)` },
    tiles: capture.tiles.map((t) => (t.placed ? { ...t, coveragePolygon: t.coveragePolygon.map(sh), transform: { ...t.transform, coefficients: TRANSFORM.compose([1, 0, 0, 1, 0, -dy], t.transform.coefficients) } } : t)),
    badges: capture.badges.map(sh), ...(owner ? { owner } : {}), emits: undefined };
}
export const CAPTURE_VIEW_CALCULATION = ['fn.tk.source.captureView', {
  inParts: ['tk.source.capture', 'tk.source.cropReceipt', 'tk.source.courseRaster'], outParts: ['tk.source.captureView'],
  note: 'the capture record in the canonical frame of the course (S0\'s crop of the course raster subtracted), with its owner plane',
  calculate: (io) => ({ 'tk.source.captureView': captureView(io.in('tk.source.capture'), io.in('tk.source.cropReceipt'), io.in('tk.source.courseRaster')) })
}];
