/**
 * Render case for an S7 route comparison (S7 block of fg/render.mjs; browser-safe): { schema: 'nctk-s7-route-compare@1', title,
 * widthPx, R1Px, baskets: [{ name, point }], holes: [{ hole, sam: [[x, y], ...] | null, routes: [{ label, verts }] }] }. One crop
 * per hole: Sam's corridor (testimony) yellow under the routes, each route in its own colour (the first dashed: the reference),
 * its bends ringed, the BasketPoints named, a header band with each route's label, bend count and bends, and a legend. Used for
 * before / after renders of a rule change on the same course.
 */
import { encodePngRgb, base64 } from '../png.mjs';
import { draw } from './laneRender.mjs';

export const ROUTE_COMPARE_SCHEMA = 'nctk-s7-route-compare@1';
export const isRouteCompare = (v) => Boolean(v && typeof v === 'object' && v.schema === ROUTE_COMPARE_SCHEMA);
const PALETTE = [[255, 255, 255], [40, 230, 90], [255, 140, 0], [255, 60, 230], [0, 220, 255]];
const SAM = [255, 225, 0], BASKET = [120, 220, 255], CASING = [0, 0, 0];
const f1 = (v) => (Math.round(v * 10) / 10).toString();

export function renderRouteCompare(address, v, dims, { canvas, deflate = null }) {
  const parts = [];
  if (dims?.widthPx > 0 && dims?.rgba) for (const h of v.holes) {
    const pts = [...h.routes.flatMap((r) => r.verts), ...(h.sam ?? [])];
    if (!pts.length) continue;
    const m = 2 * v.widthPx, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let xa = Math.min(...xs) - m, xb = Math.max(...xs) + m, ya = Math.min(...ys) - m, yb = Math.max(...ys) + m;
    if (xb - xa < 0.75 * (yb - ya)) { const g = (0.75 * (yb - ya) - (xb - xa)) / 2; xa -= g; xb += g; }
    if (yb - ya < 0.75 * (xb - xa)) { const g = (0.75 * (xb - xa) - (yb - ya)) / 2; ya -= g; yb += g; }
    const x0 = Math.max(0, Math.floor(xa)), y0 = Math.max(0, Math.floor(ya)), x1 = Math.min(dims.widthPx, Math.ceil(xb)), y1 = Math.min(dims.heightPx, Math.ceil(yb));
    const w = x1 - x0, hh = y1 - y0, s = Math.max(1, Math.min(4, 1000 / Math.max(w, hh)));
    const band = [[null, `${v.title ?? 'S7 ROUTES'}: HOLE ${h.hole}; W = ${f1(v.widthPx)} PX, R1 = ${f1(v.R1Px)} PX`],
      ...h.routes.map((r, i) => [PALETTE[i % PALETTE.length], `${r.label}: ${r.verts.length - 2} BEND${r.verts.length === 3 ? '' : 'S'}${r.verts.length > 2 ? ` AT ${r.verts.slice(1, -1).map((p) => `(${f1(p[0])}, ${f1(p[1])})`).join(' ')}` : ''}`, i === 0]),
      ...(h.sam ? [[SAM, "SAM'S CORRIDOR (TESTIMONY, IMPEACHABLE)"]] : []), [BASKET, 'BASKETPOINTS']];
    const crop = draw(canvas, dims, { x0, y0, w, h: hh, scale: s, bandLines: band }, (g) => {
      for (const b of v.baskets) { const [x, y] = g.P(b.point); g.ring(x, y, Math.max(4, v.R1Px * g.S * 0.25), 2, BASKET); g.label(x + 6, y + 6, b.name.replace('Basket ', ''), BASKET, 2); }
      if (h.sam) { g.poly(h.sam, 4, CASING); g.poly(h.sam, 3, SAM); }
      h.routes.forEach((r, i) => {
        const c = PALETTE[i % PALETTE.length], wd = 2.2 - 0.4 * i;
        g.poly(r.verts, wd + 1.5, CASING, i === 0 ? 10 : null); g.poly(r.verts, wd, c, i === 0 ? 10 : null);
        for (const p of r.verts.slice(1, -1)) { const [x, y] = g.P(p); g.ring(x, y, 7 + 3 * i, 2, c); }
      });
      const [x, y] = g.P(h.routes[0].verts[0]); g.label(x + 10, y - 26, `${h.hole}`, PALETTE[0], 3);
    });
    parts.push({ address: `${address}#hole${h.hole}`, kind: 'raster', data: { width: crop.width, height: crop.height, scale: s, origin: [x0, y0], headerBandPx: crop.bandH, png: base64(encodePngRgb({ width: crop.width, height: crop.height, rgb: crop.rgb, ...(deflate ? { deflate } : {}) })) } });
  }
  parts.push({ address: `${address}#routes`, kind: 'ledger', data: { rows: v.holes.flatMap((h) => h.routes.map((r) => ({ hole: h.hole, route: r.label, bends: r.verts.length - 2, verts: r.verts.map((p) => p.map(f1).join(' ')).join(' | ') }))) } });
  return { kind: 'routeCompare', parts };
}
