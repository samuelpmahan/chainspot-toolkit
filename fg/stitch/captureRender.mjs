/**
 * Render case for a capture (tk.source.capture, nctk-capture@1; tk.source.captureView, nctk-capture-view@1): the course raster
 * with the tiles that back it (browser-safe; capture block of fg/render.mjs). One raster with a header band legend:
 *   tile           outline (its coverage polygon) in the tile's colour, a light tint of that colour over every pixel the
 *                  overlap rule gave it, and its name inside its top-left corner
 *   seam           white where the painting tile changes (the overlap rule's boundary)
 *   link           tile centre to tile centre: green = confirmed by pixels from shared badges, cyan = pixels alone (no
 *                  shared badge), red dashed = rejected by pixels; label = shared holes and residual (luma levels)
 *   uncovered      dark grey (owner 0: no tile covers it; the course raster holds opaque black there)
 *   badge          yellow square with the hole number at the union badge position; x2.. when several tiles saw it
 * The raster under the drawing is the value's owner plane's raster: dims (px.course.canonicalPixels for the view, whose
 * coordinates are canonical). Without a raster of the frame's size it renders a ledger only.
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const isCapture = (v) => Boolean(v && typeof v === 'object' && (v.schema === 'nctk-capture@1' || v.schema === 'nctk-capture-view@1') && Array.isArray(v.tiles));
const PALETTE = [[230, 25, 75], [60, 140, 255], [255, 170, 0], [170, 60, 230], [0, 200, 160], [240, 50, 230], [128, 128, 0], [0, 128, 128]];
const COL = Object.freeze({ badge: [255, 225, 0], confirmed: [40, 220, 90], pixels: [40, 200, 230], rejected: [255, 50, 50], seam: [255, 255, 255], ink: [255, 255, 255], black: [0, 0, 0], empty: [45, 45, 45] });

export function renderCapture(address, v, dims, { canvas, deflate = null }) {
  const rows = v.tiles.map((t) => ({ tile: t.name, placed: t.placed, model: t.transform?.model ?? null, transform: t.transform ? t.transform.coefficients.map((c) => Math.round(c * 10000) / 10000).join(', ') : null, copy: t.copy ?? null, ownedPx: t.ownedPx ?? null, badgesRead: t.badgesRead.join(' ') }));
  const linkRows = [...v.links, ...v.rejected].map((l) => ({ a: l.a, b: l.b, evidence: l.evidence, sharedHoles: l.sharedHoles.join(' '), model: l.model, confirmed: l.confirmed, residualLuma: l.residualLuma ?? null, contrast: l.contrast ?? l.pixel?.contrast ?? null, tightenedPx: l.tightenedPx ?? null, inTree: v.tree.some((e) => (e.parent === l.a && e.child === l.b) || (e.parent === l.b && e.child === l.a)) }));
  const ledgers = [{ address: `${address}#tiles`, kind: 'ledger', data: { rows } }, { address: `${address}#links`, kind: 'ledger', data: { rows: linkRows } }];
  const W = dims?.widthPx, H = dims?.heightPx, owner = v.owner && W && v.owner.length === W * H ? v.owner : null;
  if (!(W > 0) || !dims?.rgba) return { kind: 'capture', parts: ledgers };
  const colOf = (name) => PALETTE[v.tiles.findIndex((t) => t.name === name) % PALETTE.length];
  const lines = [
    [null, `ONE COURSE FROM ${v.tiles.length} TILES: ${W} X ${H} PX (${v.schema === 'nctk-capture-view@1' ? 'CANONICAL FRAME' : 'COMPOSITE FRAME'}), BADGE COVERAGE ${v.coverage.text}${v.coverage.missing.length ? ` (MISSING ${v.coverage.missing.join(' ')})` : ''}, FRAME TILE ${v.frame.frameTile}`],
    ...v.tiles.map((t) => [colOf(t.name), `${t.name}: ${t.placed ? `${t.transform.model.toUpperCase()} [${t.transform.coefficients.map((c) => Math.round(c * 1000) / 1000).join(' ')}] ${t.copy === 'direct' ? 'DIRECT COPY' : 'NEAREST RESAMPLED'}, PAINTS ${t.ownedPx} PX` : 'NOT PLACED'}, BADGES ${t.badgesRead.join(' ')}`]),
    [COL.confirmed, 'LINK CONFIRMED BY PIXELS FROM SHARED BADGES (LABEL: HOLES, RESIDUAL IN LUMA LEVELS 0-255)  |  CYAN: PIXELS ALONE  |  RED DASHED: REJECTED'],
    [COL.seam, `SEAM: WHERE THE PAINTING TILE CHANGES. OVERLAP RULE ${v.overlapRule.toUpperCase()}: THE TILE THAT SEES THE POINT DEEPEST (FARTHEST FROM ITS OWN EDGE) WINS`],
    [COL.badge, 'NUMBER BADGE (UNION OVER THE TILES; XN = SEEN IN N TILES)']
  ];
  const bandH = 14 * 2 + lines.length * 26, w = W, h = H + bandH, cv = canvas(w, h), rgb = cv.rgb;
  for (let i = 0; i < w * bandH * 3; i++) rgb[i] = 18;
  const tint = v.tiles.map((t) => colOf(t.name));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, i = k * 4, d = ((y + bandH) * w + x) * 3, o = owner ? owner[k] : 0;
    if (owner && !o) { rgb[d] = COL.empty[0]; rgb[d + 1] = COL.empty[1]; rgb[d + 2] = COL.empty[2]; continue; }
    const c = o ? tint[o - 1] : null, a = c ? 0.16 : 0;
    for (let q = 0; q < 3; q++) rgb[d + q] = Math.round(dims.rgba[i + q] * (1 - a) + (c ? c[q] * a : 0));
  }
  if (owner) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, o = owner[k]; if (!o) continue;
    if ((x + 1 < W && owner[k + 1] && owner[k + 1] !== o) || (y + 1 < H && owner[k + W] && owner[k + W] !== o)) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cv.put(x + dx, y + dy + bandH, COL.seam);
  }
  const P = (p) => [p.xPx, p.yPx + bandH];
  const disk = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) cv.put(x, y, c); };
  const seg = (a, b, r, c, dash = false) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))); for (let k = 0; k <= n; k++) { if (dash && Math.floor(k / 12) % 2) continue; disk(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, r, c); } };
  const label = (x, y, s, c, k) => { for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) cv.text(x + ox * 2, y + oy * 2, s, COL.black, k); cv.text(x, y, s, c, k); };
  for (const t of v.tiles) if (t.placed) { const poly = t.coveragePolygon.map(P), c = colOf(t.name); for (let i = 0; i < 4; i++) { seg(poly[i], poly[(i + 1) % 4], 3, COL.black); seg(poly[i], poly[(i + 1) % 4], 2, c); } }
  const centre = (name) => { const t = v.tiles.find((x) => x.name === name); if (!t?.placed) return null; const q = t.coveragePolygon.map(P); return [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]; };
  for (const l of [...v.links, ...v.rejected]) {
    const a = centre(l.a), b = centre(l.b); if (!a || !b) continue;
    const c = !l.confirmed ? COL.rejected : l.evidence === 'pixels' ? COL.pixels : COL.confirmed;
    seg(a, b, 4, COL.black, !l.confirmed); seg(a, b, 2.5, c, !l.confirmed);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    label(m[0] + 8, m[1] - 10, `${l.sharedHoles.length ? `H${l.sharedHoles.join(',')}` : 'PX'} ${l.confirmed ? `${l.residualLuma}L` : 'REJECTED'}${l.model !== 'translation' ? ' SIM' : ''}`, c, 2);
  }
  for (const t of v.tiles) if (t.placed) { const q = t.coveragePolygon.map(P); label(Math.max(4, q[0][0] + 12), Math.max(bandH + 4, q[0][1] + 12), t.name, colOf(t.name), 3); }
  for (const b of v.badges) {
    const [x, y] = P(b); cv.fill(Math.round(x) - 7, Math.round(y) - 7, 15, 15, COL.black); cv.fill(Math.round(x) - 5, Math.round(y) - 5, 11, 11, COL.badge);
    label(x + 12, y - 8, `${b.holeNumber}${b.seenIn.length > 1 ? ` X${b.seenIn.length}` : ''}`, COL.badge, 3);
  }
  lines.forEach(([c, t], i) => { const y = 14 + i * 26, x = 20; if (c) cv.fill(x, y, 22, 14, c); cv.text(x + 32, y, t, COL.ink, 2); });
  const png = base64(encodePngRgb({ width: w, height: h, rgb, ...(deflate ? { deflate } : {}) }));
  return { kind: 'capture', parts: [{ address, kind: 'raster', data: { width: w, height: h, scale: 1, origin: [0, 0], headerBandPx: bandH, png } }, ...ledgers] };
}
