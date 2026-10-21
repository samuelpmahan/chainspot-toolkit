/**
 * Render case for the UDisc header Part (tk.source.header, nctk-udisc-header@1; browser-safe; header block of fg/render.mjs).
 * One raster: a legend on top, then per band (the image's, or every tile's for a capture) a title line, the band itself at
 * 1:1 with each glyph boxed in its confidence colour and its read above it (char and NCC score), and the parsed line under it
 * (holes, par, feet; tiles' agreement for a capture) with the recorded conditions. The legend states the read thresholds.
 *   green   read, high confidence: NCC >= HIGH_SCORE (a pixel-identical render reads ~1.0)
 *   amber   read: NCC >= scoreMin and margin >= marginMin (the template asset's calibrated thresholds)
 *   red     unread ('?'): below either threshold; its best guess is printed small, never used
 * Without a band (no header bar) it renders the ledger of conditions only.
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const isUdiscHeader = (v) => Boolean(v && typeof v === 'object' && v.schema === 'nctk-udisc-header@1');
const COL = Object.freeze({ high: [40, 220, 90], read: [255, 176, 0], unread: [255, 50, 50], ink: [235, 235, 235], dim: [150, 150, 150], bg: [16, 16, 20] });
const shown = (c) => (c === '•' ? '*' : c);

export function renderUdiscHeader(address, v, { canvas, deflate = null }) {
  const bands = (v.source === 'tiles' ? v.tiles : [v]).filter((b) => b.bandRaster);
  const ledger = { address: `${address}#fields`, kind: 'ledger', data: { rows: [
    { field: 'source', value: v.source }, { field: 'text', value: v.text }, { field: 'holes', value: v.holes }, { field: 'par', value: v.par }, { field: 'feet (ft)', value: v.feet },
    ...(v.source === 'tiles' ? [{ field: 'tiles read', value: `${v.tilesRead} of ${v.tilesOf}` }, { field: 'tiles agree', value: v.agree }] : []),
    ...(v.conditions ?? []).map((c, i) => ({ field: `condition ${i + 1}`, value: c }))] } };
  if (!bands.length) return { kind: 'udiscHeader', parts: [ledger] };
  const t = v.thresholds ?? { scoreMin: '?', marginMin: '?', high: '?' };
  const legend = [
    [null, `UDISC HEADER (${v.source === 'tiles' ? `CAPTURE: ${v.tilesRead} OF ${v.tilesOf} TILES READ, ${v.agree ? 'TILES AGREE' : 'TILES DO NOT AGREE'}` : 'ONE IMAGE'}): READ ${(v.text ?? '-').replace(/•/g, '*')}`],
    [COL.high, `READ, HIGH CONFIDENCE: NCC >= ${t.high}`],
    [COL.read, `READ: NCC >= ${t.scoreMin} AND MARGIN OVER THE NEXT CLASS >= ${t.marginMin}`],
    [COL.unread, 'UNREAD (?): BELOW EITHER THRESHOLD; THE BEST GUESS IS SHOWN SMALL AND NEVER USED'],
    [null, 'LABEL ABOVE EACH BOX: THE READ AND ITS NCC SCORE AGAINST THE TEMPLATE; * = THE BULLET']
  ];
  const legendH = 12 + legend.length * 24, top = 34, labelH = 44, foot = (b) => 30 + 22 * Math.min(4, b.conditions?.length ?? 0);
  const panelH = (b) => top + labelH + b.bandRaster.heightPx + foot(b) + 10;
  const w = Math.max(...bands.map((b) => b.bandRaster.widthPx), 900), h = legendH + bands.reduce((s, b) => s + panelH(b), 0);
  const cv = canvas(w, h);
  cv.fill(0, 0, w, h, COL.bg);
  legend.forEach(([c, s], i) => { const y = 8 + i * 24; if (c) cv.fill(16, y, 20, 14, c); cv.text(c ? 46 : 16, y, s, COL.ink, 2); });
  let y0 = legendH;
  for (const b of bands) {
    const r = b.bandRaster, by = y0 + top + labelH;
    cv.text(16, y0 + 10, `${b.name ? `${b.name}: ` : ''}BAND ROWS ${b.band.rows[0]}-${b.band.rows[1]} PX, GLYPH CAP HEIGHT ${b.line?.capHPx ?? '-'} PX, ${b.glyphs.length} GLYPHS IN ${b.tokens.length} TOKENS`, COL.ink, 2);
    for (let yy = 0; yy < r.heightPx; yy++) for (let xx = 0; xx < r.widthPx; xx++) { const q = (yy * r.widthPx + xx) * 3; cv.put(xx, by + yy, [r.rgb[q], r.rgb[q + 1], r.rgb[q + 2]]); }
    for (const g of b.glyphs) {
      const c = COL[g.confidence] ?? COL.unread, [x, y, gw, gh] = g.bbox, py = by + (y - r.origin[1]);
      cv.frame(x - 3, py - 3, gw + 6, gh + 6, c, 2);
      const lx = x - 2, ly = by - labelH + 2;
      if (g.read) cv.text(lx, ly, shown(g.char), c, 3); else { cv.text(lx, ly, '?', c, 3); cv.text(lx + 20, ly + 6, shown(g.best), COL.dim, 1); }
      cv.text(lx, ly + 26, g.score.toFixed(2), c, 1);
    }
    const fy = by + r.heightPx + 10;
    const f = (k) => (b[k] != null ? String(b[k]) : b.fields?.[k]?.text ? `${b.fields[k].text} (UNREAD)` : '-');
    cv.text(16, fy, `HOLES ${f('holes')}   PAR ${f('par')}   FEET ${f('feet')}${b.unread.length ? `   ${b.unread.length} UNREAD GLYPH${b.unread.length > 1 ? 'S' : ''}` : ''}`, b.unread.length ? COL.unread : COL.high, 2);
    (b.conditions ?? []).slice(0, 4).forEach((s, i) => cv.text(16, fy + 24 + i * 22, s.replace(/"/g, "'").replace(/\u2022/g, '*').slice(0, Math.floor((w - 32) / 12)), COL.dim, 2));   // the bitmap font has no double quote
    y0 += panelH(b);
  }
  const png = base64(encodePngRgb({ width: w, height: h, rgb: cv.rgb, ...(deflate ? { deflate } : {}) }));
  return { kind: 'udiscHeader', parts: [{ address, kind: 'raster', data: { width: w, height: h, scale: 1, origin: [0, 0], png } }, ledger] };
}
