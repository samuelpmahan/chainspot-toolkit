/**
 * Render case for tk.export.course (browser-safe; export block of fg/render.mjs): the exported holes over the course, in the
 * ORIGINAL-UPLOAD frame the file is written in, one raster (stored PNG; a real compressor may be passed as opts.deflate).
 *   hole             tee -> corridorBends -> basket polyline, coloured by status (the evidence block), hole number at the tee,
 *                    '?' after it when the CV did not confirm the route and '-' when it has no route
 *   tee, basket      filled disk at the tee, ring at the basket; each bend a dot
 *   badges           yellow square at every numberBadges anchor with its number
 *   candidates       grey ring (unproven baskets, 'Basket cX'): never numbered
 * The drawing kit (5 x 7 font canvas) is fg/render.mjs's, passed in so this module does not import it back. The raster
 * under the drawing is px.image.cropped (S0's crop): a point at original-upload y is drawn at y - rowsRemovedTop.
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const COURSE_GEOMETRY_FORMAT = 'chainspot.course-geometry';
export const isCourseGeometry = (v) => Boolean(v && typeof v === 'object' && v.format === COURSE_GEOMETRY_FORMAT && Array.isArray(v.holes));
export const VIEW = Object.freeze({ scale: 1, routePx: 4, dotRadiusPx: 5, teeRadiusPx: 8, basketRingPx: 9, labelScale: 3, bandAlpha: 0.2 });
const COL = Object.freeze({ resolved: [40, 220, 90], straight: [40, 200, 230], partial: [255, 150, 0], unresolved: [255, 50, 50], badge: [255, 225, 0], candidate: [170, 170, 170], ink: [255, 255, 255], black: [0, 0, 0] });

export function renderCourseGeometry(address, v, dims, { canvas, deflate = null }) {
  const S = VIEW.scale, IW = dims?.widthPx, IH = dims?.heightPx;
  if (!(IW > 0) || !dims?.rgba) return { kind: 'courseGeometry', parts: [{ address, kind: 'ledger', data: { rows: [{ field: 'condition', value: 'no image raster (px.image.cropped) to draw over' }] } }] };
  const dy = v.source?.s0Crop?.rowsRemovedTop ?? 0, evidenceOf = new Map(v.evidence.map((e) => [e.holeId, e]));
  const count = (s) => v.evidence.filter((e) => e.status === s).length;
  const unconfirmed = v.evidence.filter((e) => e.confidence?.level !== 'confirmed').length;
  const lines = [
    [null, `CHAINSPOT.COURSE-GEOMETRY V${v.version}: ${v.holes.length} HOLES, ${v.numberBadges.length} NUMBER BADGES, ${v.candidates.length} UNPROVEN CANDIDATES (SOURCE ${v.source.widthPx} X ${v.source.heightPx} PX, ORIGINAL-UPLOAD FRAME, DRAWN AT ${S}X)`],
    [COL.resolved, `RESOLVED: ${count('resolved')} HOLES (ROUTE CONFIRMED BY THE HALLWAY SENSOR, WITH BENDS)`],
    [COL.straight, `STRAIGHT: ${count('straight')} HOLES (CONFIRMED, NO BENDS)`],
    [COL.partial, `PARTIAL: ${count('partial')} HOLES (ROUTE NOT CONFIRMED, MARKED ?)`],
    [COL.unresolved, `UNRESOLVED: ${count('unresolved')} HOLES (NO ROUTE, MARKED -)`],
    [COL.badge, `NUMBER BADGE ANCHOR (SQUARE)  |  GREY RING = UNPROVEN BASKET CANDIDATE (NEVER NUMBERED)  |  BAND = CORRIDOR WIDTH ${Math.round((v.holes[0]?.corridorWidthPx ?? 0) * 10) / 10} PX`],
    [null, `CONFIDENCE NOT CONFIRMED: ${unconfirmed} OF ${v.evidence.length} HOLES (FLAGGED FOR THE CORRECTION UI)`]
  ];
  const bandH = 14 * 2 + lines.length * 26, w = IW * S, h = IH * S + bandH, cv = canvas(w, h), rgb = cv.rgb;
  for (let i = 0; i < w * bandH * 3; i++) rgb[i] = 18;
  for (let y = bandH; y < h; y++) for (let x = 0; x < w; x++) { const i = (Math.floor((y - bandH) / S) * IW + Math.floor(x / S)) * 4, d = (y * w + x) * 3; rgb[d] = dims.rgba[i]; rgb[d + 1] = dims.rgba[i + 1]; rgb[d + 2] = dims.rgba[i + 2]; }
  const P = (p) => [p.xPx * S + S / 2, (p.yPx - dy) * S + S / 2 + bandH];
  const blend = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const d = (y * w + x) * 3; for (let k = 0; k < 3; k++) rgb[d + k] = Math.round(rgb[d + k] * (1 - a) + c[k] * a); };
  const disk = (cx, cy, r, c, a = 1) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) blend(x, y, c, a); };
  const ring = (cx, cy, r, t, c) => { for (let y = Math.floor(cy - r - t); y <= cy + r + t; y++) for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r + t / 2 && d >= r - t / 2) blend(x, y, c, 1); } };
  const line = (a, b, r, c, al = 1) => { const [x0, y0] = P(a), [x1, y1] = P(b), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r > 8 ? 3 : 1))); for (let k = 0; k <= n; k++) disk(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, r, c, al); };
  const label = (x, y, s, c, k) => { for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) cv.text(x + ox * 2, y + oy * 2, s, COL.black, k); cv.text(x, y, s, c, k); };
  const centreline = (hole) => [...(hole.tee ? [hole.tee] : []), ...hole.corridorBends, ...(hole.basket ? [hole.basket] : [])];
  for (const hole of v.holes) { const V = centreline(hole); for (let i = 0; i + 1 < V.length; i++) line(V[i], V[i + 1], hole.corridorWidthPx * S / 2, COL.ink, VIEW.bandAlpha * 0.35); }
  for (const hole of v.holes) {
    const ev = evidenceOf.get(hole.id), col = COL[ev?.status ?? 'unresolved'] ?? COL.unresolved, V = centreline(hole);
    for (let i = 0; i + 1 < V.length; i++) line(V[i], V[i + 1], VIEW.routePx / 2, col);
    for (const b of hole.corridorBends) { const [x, y] = P(b); disk(x, y, VIEW.dotRadiusPx + 1, COL.black); disk(x, y, VIEW.dotRadiusPx, col); }
    if (hole.basket) { const [x, y] = P(hole.basket); ring(x, y, VIEW.basketRingPx, 4, COL.black); ring(x, y, VIEW.basketRingPx, 2, col); }
    if (hole.tee) {
      const [x, y] = P(hole.tee); disk(x, y, VIEW.teeRadiusPx + 1, COL.black); disk(x, y, VIEW.teeRadiusPx, col);
      label(x + 12, y - 30, `${hole.number}${ev?.status === 'unresolved' ? ' -' : ev?.confidence?.level !== 'confirmed' ? ' ?' : ''}`, col, VIEW.labelScale);
    }
  }
  for (const c of v.candidates) { const [x, y] = P(c); ring(x, y, VIEW.basketRingPx + 3, 4, COL.black); ring(x, y, VIEW.basketRingPx + 3, 2, COL.candidate); }
  for (const b of v.numberBadges) { const [x, y] = P(b); cv.fill(Math.round(x) - 5, Math.round(y) - 5, 11, 11, COL.black); cv.fill(Math.round(x) - 4, Math.round(y) - 4, 9, 9, COL.badge); }
  lines.forEach(([c, t], i) => { const y = 14 + i * 26, x = 20; if (c) cv.fill(x, y, 22, 14, c); cv.text(x + 32, y, t, COL.ink, 2); });
  const png = base64(encodePngRgb({ width: w, height: h, rgb, ...(deflate ? { deflate } : {}) }));
  const holesLedger = v.holes.map((hole) => { const ev = evidenceOf.get(hole.id); return { hole: hole.number, status: ev?.status ?? null, confidence: ev?.confidence?.level ?? null, sensor: ev?.confidence?.sensor ?? null, stations: ev?.confidence?.stations ?? null, bends: hole.corridorBends.length, corridorWidthPx: hole.corridorWidthPx, tee: hole.tee ? `${hole.tee.xPx}, ${hole.tee.yPx}` : null, basket: hole.basket ? `${hole.basket.xPx}, ${hole.basket.yPx}` : null }; });
  return { kind: 'courseGeometry', parts: [
    { address, kind: 'raster', data: { width: w, height: h, scale: S, origin: [0, 0], headerBandPx: bandH, png } },
    { address: `${address}#holes`, kind: 'ledger', data: { rows: holesLedger } },
    { address: `${address}#legend`, kind: 'ledger', data: { rows: lines.map(([, t]) => ({ legend: t })) } }
  ] };
}
