/**
 * Render cases for tk.s7.firstLegs and tk.s7.firstLegCheck (S7 first-legs block of fg/render.mjs; browser-safe).
 *   firstLegs       a ledger: per hole its first leg S -> B* and its badge plate (no full-frame picture)
 *   firstLegCheck   one crop per route that breaks a rule: every hole's first leg (S -> B*, cyan; the one run along: red), every
 *                   badge plate (outlined; the one passed over: red), the route (white; Sam's testimony yellow), its violating legs
 *                   magenta, the BasketPoints named, a header band with the violations and a legend; then a ledger.
 * The drawing kit is fg/s7route/laneRender.mjs draw (the 5 x 7 font canvas of fg/render.mjs, passed in).
 */
import { encodePngRgb, base64 } from '../png.mjs';
import { draw } from './laneRender.mjs';

export const FIRST_LEGS_SCHEMA = 'nctk-s7-first-legs@1';
export const FIRST_LEG_CHECK_SCHEMA = 'nctk-s7-first-leg-check@1';
export const isFirstLegs = (v) => Boolean(v && typeof v === 'object' && v.schema === FIRST_LEGS_SCHEMA);
export const isFirstLegCheck = (v) => Boolean(v && typeof v === 'object' && v.schema === FIRST_LEG_CHECK_SCHEMA);
const COL = Object.freeze({ leg: [0, 220, 255], hit: [255, 40, 40], plate: [255, 255, 255], route: [255, 255, 255], sam: [255, 225, 0], bad: [255, 60, 230], casing: [0, 0, 0], basket: [120, 220, 255] });

export function renderFirstLegs(address, v) {
  return { kind: 'firstLegs', parts: [{ address: `${address}#holes`, kind: 'ledger', data: { rows: v.holes.map((h) => ({ hole: h.hole, S: h.S.join(', '), Bstar: h.Bstar.join(', '), plate: h.box ? h.box.join(', ') : 'none' })) } }] };
}

export function renderFirstLegCheck(address, v, dims, { canvas, deflate = null }) {
  const parts = [];
  if (dims?.widthPx > 0 && dims?.rgba) for (const r of v.routes) {
    if (!r.violations.length) continue;
    const legs = new Set(r.violations.filter((x) => x.kind === 'runs along').map((x) => x.of)), plates = new Set(r.violations.filter((x) => x.kind === 'badge plate').map((x) => x.of)), bad = new Set(r.violations.map((x) => x.leg));
    const pts = [...r.verts, ...v.firstLegs.holes.filter((g) => legs.has(g.hole)).flatMap((g) => g.leg)], m = 2 * v.widthPx, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (const p of v.firstLegs.plates) if (plates.has(p.hole)) { xs.push(p.box[0], p.box[0] + p.box[2]); ys.push(p.box[1], p.box[1] + p.box[3]); }
    let xa = Math.min(...xs) - m, xb = Math.max(...xs) + m, ya = Math.min(...ys) - m, yb = Math.max(...ys) + m;
    if (xb - xa < 0.75 * (yb - ya)) { const g = (0.75 * (yb - ya) - (xb - xa)) / 2; xa -= g; xb += g; }
    if (yb - ya < 0.75 * (xb - xa)) { const g = (0.75 * (xb - xa) - (yb - ya)) / 2; ya -= g; yb += g; }
    const x0 = Math.max(0, Math.floor(xa)), y0 = Math.max(0, Math.floor(ya)), x1 = Math.min(dims.widthPx, Math.ceil(xb)), y1 = Math.min(dims.heightPx, Math.ceil(yb));
    const w = x1 - x0, h = y1 - y0, s = Math.max(1, Math.min(3, 1000 / Math.max(w, h)));
    const own = r.source === 'testimony' ? COL.sam : COL.route;
    const band = [[null, `HOLE ${r.hole}, ${r.source === 'testimony' ? "SAM'S ROUTE (TESTIMONY)" : `THE S7 DEFAULT'S ROUTE${r.basket ? ` TO ${r.basket}` : ''}`}: ${r.violations.map((x) => `LEG ${x.leg + 1} ${x.kind === 'runs along' ? `RUNS ALONG HOLE ${x.of}'S FIRST LEG` : `PASSES OVER BADGE ${x.of}`}`).join('; ')}`],
      [own, r.source === 'testimony' ? "SAM'S ROUTE" : "THE DEFAULT'S ROUTE"], [COL.bad, 'ITS VIOLATING LEGS'], [COL.leg, 'FIRST LEGS (TEE CAP -> B*) OF THE OTHER HOLES'], [COL.hit, 'THE FIRST LEG RUN ALONG / THE BADGE PLATE PASSED OVER'],
      [COL.plate, 'BADGE PLATES (OUTLINE)'], [COL.basket, `BASKETPOINTS; W = ${Math.round(v.widthPx * 100) / 100} PX, R1 = ${v.R1Px} PX`]];
    const crop = draw(canvas, dims, { x0, y0, w, h, scale: s, bandLines: band }, (g) => {
      const box = (b, c, t) => { const [ax, ay] = g.P([b[0], b[1]]), [bx, by] = g.P([b[0] + b[2], b[1] + b[3]]); for (const [p, q] of [[[ax, ay], [bx, ay]], [[bx, ay], [bx, by]], [[bx, by], [ax, by]], [[ax, by], [ax, ay]]]) { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1])); for (let k = 0; k <= n; k++) g.disk(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n, t, c); } };
      for (const b of v.baskets) { const [x, y] = g.P(b.point); g.ring(x, y, Math.max(4, v.R1Px * g.S * 0.25), 2, COL.basket); g.label(x + 6, y + 6, b.name.replace('Basket ', ''), COL.basket, 2); }
      for (const p of v.firstLegs.plates) box(p.box, plates.has(p.hole) ? COL.hit : COL.plate, plates.has(p.hole) ? 2 : 1);
      for (const L of v.firstLegs.holes) { if (L.hole === r.hole) continue; const c = legs.has(L.hole) ? COL.hit : COL.leg; g.poly(L.leg, 3, COL.casing); g.poly(L.leg, 2, c); const [x, y] = g.P(L.Bstar); g.label(x + 6, y - 14, `${L.hole}`, c, 2); }
      g.poly(r.verts, 3.5, COL.casing); g.poly(r.verts, 2, own);
      for (let i = 0; i + 1 < r.verts.length; i++) if (bad.has(i)) g.poly([r.verts[i], r.verts[i + 1]], 1.2, COL.bad, 6);
      const [x, y] = g.P(r.verts[0]); g.label(x + 10, y - 26, `${r.hole}`, own, 3);
    });
    parts.push({ address: `${address}#${r.source}${r.hole}`, kind: 'raster', data: { width: crop.width, height: crop.height, scale: s, origin: [x0, y0], headerBandPx: crop.bandH, png: base64(encodePngRgb({ width: crop.width, height: crop.height, rgb: crop.rgb, ...(deflate ? { deflate } : {}) })) } });
  }
  parts.push({ address: `${address}#routes`, kind: 'ledger', data: { rows: v.routes.map((r) => ({ source: r.source, hole: r.hole, basket: r.basket ?? null, violations: r.violations.map((x) => `leg ${x.leg + 1} ${x.kind} ${x.of}`).join('; ') || 'none' })) } });
  return { kind: 'firstLegCheck', parts };
}
