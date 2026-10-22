/**
 * Render case for tk.s7.laneCrosscheck (S7 lanes block of fg/render.mjs; browser-safe): the S7 default's routes and the four- /
 * three-lane tracks over the course, labelled, coloured by the cross-check's verdict, with a legend; then one crop per hole
 * that either variant flags (both routes and both tracks, the baskets named, the verdict and the numbers in a header band).
 *   default route   white (black casing), its BasketPoint end ringed
 *   four-lane track orange; three-lane track magenta (dashed); a track that reached no basket ends in a cross
 *   hole label      at the tee cap, coloured by the four-lane verdict: green agree, yellow route differs, red basket differs,
 *                   purple no basket (the track stopped short), grey no default route
 *   baskets         every BasketPoint, a small ring with its Basket cX name
 * The drawing kit (5 x 7 font canvas) is fg/render.mjs's, passed in so this module does not import it back.
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const LANE_CROSSCHECK_SCHEMA = 'nctk-s7-lane-crosscheck@1';
export const isLaneCrosscheck = (v) => Boolean(v && typeof v === 'object' && v.schema === LANE_CROSSCHECK_SCHEMA);
const COL = Object.freeze({ default: [255, 255, 255], four: [255, 140, 0], three: [255, 60, 230], casing: [0, 0, 0], ink: [255, 255, 255], basket: [120, 220, 255],
  agree: [40, 220, 90], 'route-differs': [255, 225, 0], 'basket-differs': [255, 50, 50], 'no-basket': [180, 90, 255], 'no-default': [150, 150, 150] });
const VERDICT_TEXT = { agree: 'AGREE', 'route-differs': 'ROUTE DIFFERS', 'basket-differs': 'BASKET DIFFERS', 'no-basket': 'NO BASKET', 'no-default': 'NO DEFAULT ROUTE' };
const f2 = (v) => (v == null ? '-' : String(Math.round(v * 100) / 100));

/** Legend lines wrapped to the picture's width (2x font: 12 px per character, 42 px of swatch and margin). */
const wrap = (lines, W) => {
  const n = Math.max(20, Math.floor((W - 42) / 12)), out = [];
  for (const [c, t, dash] of lines) {
    let rest = t, first = true;
    while (rest.length) { let cut = rest.length <= n ? rest.length : rest.lastIndexOf(' ', n); if (cut <= 0) cut = Math.min(n, rest.length); out.push([first ? c : null, rest.slice(0, cut), first ? dash : false]); rest = rest.slice(cut).trimStart(); first = false; }
  }
  return out;
};
function draw(canvas, dims, { x0, y0, w, h, scale, bandLines: lines0 }, paint) {
  const S = scale, W = Math.round(w * S), bandLines = wrap(lines0, W), bandH = 12 + bandLines.length * 22, H = Math.round(h * S) + bandH, cv = canvas(W, H), rgb = cv.rgb, IW = dims.widthPx, IH = dims.heightPx;
  for (let i = 0; i < W * bandH * 3; i++) rgb[i] = 18;
  for (let y = bandH; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.floor(x0 + x / S), sy = Math.floor(y0 + (y - bandH) / S), d = (y * W + x) * 3;
    if (sx < 0 || sy < 0 || sx >= IW || sy >= IH) { rgb[d] = rgb[d + 1] = rgb[d + 2] = 30; continue; }
    const i = (sy * IW + sx) * 4; rgb[d] = dims.rgba[i]; rgb[d + 1] = dims.rgba[i + 1]; rgb[d + 2] = dims.rgba[i + 2];
  }
  const P = (p) => [(p[0] - x0) * S + S / 2, (p[1] - y0) * S + S / 2 + bandH];
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < bandH || x >= W || y >= H) return; rgb.set(c, (y * W + x) * 3); };
  const disk = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, c); };
  const ring = (cx, cy, r, t, c) => { for (let y = Math.floor(cy - r - t); y <= cy + r + t; y++) for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r + t / 2 && d >= r - t / 2) put(x, y, c); } };
  const poly = (V, r, c, dash = null) => {
    for (let i = 0; i + 1 < V.length; i++) {
      const [ax, ay] = P(V[i]), [bx, by] = P(V[i + 1]), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let k = 0; k <= n; k++) { if (dash && Math.floor(k / dash) % 2) continue; disk(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, r, c); }
    }
  };
  const cross = (p, r, c) => { const [x, y] = P(p); for (let d = -r; d <= r; d++) for (let t = -1; t <= 1; t++) { put(x + d, y + d + t, c); put(x + d, y - d + t, c); } };
  const label = (x, y, s, c, k) => { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) cv.text(x + dx * 2, y + dy * 2, s, COL.casing, k); cv.text(x, y, s, c, k); };
  paint({ P, poly, ring, disk, cross, label, S });
  bandLines.forEach(([c, t, dash], i) => {
    const y = 8 + i * 22, x = 12;
    if (c) { if (dash) { for (let k = 0; k < 22; k += 6) cv.fill(x + k, y + 4, 4, 5, c); } else cv.fill(x, y, 22, 12, c); }
    cv.text(x + 30, y, t, COL.ink, 2);
  });
  return { width: W, height: H, rgb, bandH };
}

function paintHoles(g, v, rows3, rows4, { only = null, baskets = true, labelScale = 3 } = {}) {
  const S = g.S, wR = Math.max(1, 1.5 * Math.min(S, 2));
  if (baskets) for (const b of v.baskets) { const [x, y] = g.P(b.point); g.ring(x, y, Math.max(4, v.R1Px * S * 0.25), 2, COL.basket); g.label(x + 6, y + 6, b.name.replace('Basket ', ''), COL.basket, Math.max(1, Math.min(2, S))); }
  for (const r of rows4) {
    if (only && r.hole !== only) continue;
    const r3 = rows3.find((x) => x.hole === r.hole);
    if (r.defaultPath.length) { g.poly(r.defaultPath, wR + 1.5, COL.casing); g.poly(r.defaultPath, wR, COL.default); }
    if (r3?.trackPath?.length) { g.poly(r3.trackPath, wR, COL.three, 8); if (r3.trackStop !== 'basket') g.cross(r3.trackPath.at(-1), 7, COL.three); }
    if (r.trackPath.length) { g.poly(r.trackPath, wR * 0.8, COL.four); if (r.trackStop !== 'basket') g.cross(r.trackPath.at(-1), 9, COL.four); }
    const at = r.defaultPath[0] ?? r.trackPath[0];
    if (at) { const [x, y] = g.P(at); g.label(x + 10, y - 26, `${r.hole}${r.verdict === 'agree' ? '' : ' !'}`, COL[r.verdict], labelScale); }
  }
}

export function renderLaneCrosscheck(address, v, dims, { canvas, deflate = null }) {
  if (!(dims?.widthPx > 0) || !dims?.rgba) return { kind: 'laneCrosscheck', parts: [{ address, kind: 'ledger', data: { rows: [{ field: 'condition', value: 'no image raster (px.image.cropped) to draw over' }] } }] };
  const rows4 = v.variants.fourLane.rows, rows3 = v.variants.threeLane.rows, T4 = v.variants.fourLane.totals, T3 = v.variants.threeLane.totals;
  const legend = [
    [null, `S7 LANE CROSS-CHECK VS THE S7 DEFAULT (${v.reference}); W = ${f2(v.widthPx)} PX, R1 = ${f2(v.R1Px)} PX; AGREE = SAME BASKET AND WITHIN ${v.agreeLateralW} W`],
    [COL.default, 'S7 DEFAULT ROUTE'],
    [COL.four, `FOUR-LANE TRACK: ${T4.agree} AGREE, ${T4.routeDiffers} ROUTE DIFFERS, ${T4.basketDiffers} BASKET DIFFERS, ${T4.noBasket} NO BASKET OF ${T4.holes}`],
    [COL.three, `THREE-LANE TRACK (DASHED): ${T3.agree} AGREE, ${T3.routeDiffers} ROUTE DIFFERS, ${T3.basketDiffers} BASKET DIFFERS, ${T3.noBasket} NO BASKET OF ${T3.holes}`],
    [COL.agree, 'HOLE LABEL BY FOUR-LANE VERDICT: GREEN AGREE'], [COL['route-differs'], 'YELLOW ROUTE DIFFERS (SAME BASKET)'], [COL['basket-differs'], 'RED BASKET DIFFERS'],
    [COL['no-basket'], 'PURPLE NO BASKET (TRACK STOPPED SHORT; X = WHERE)'], [COL.basket, 'BASKETPOINTS (BASKET CX NAMES)']
  ];
  const scale = dims.widthPx > 1600 ? 1 : 2;
  const full = draw(canvas, dims, { x0: 0, y0: 0, w: dims.widthPx, h: dims.heightPx, scale, bandLines: legend }, (g) => paintHoles(g, v, rows3, rows4, { labelScale: scale === 1 ? 2 : 3 }));
  const parts = [{ address: `${address}#course`, kind: 'raster', data: { width: full.width, height: full.height, scale, origin: [0, 0], headerBandPx: full.bandH, png: base64(encodePngRgb({ width: full.width, height: full.height, rgb: full.rgb, ...(deflate ? { deflate } : {}) })) } }];
  // one crop per flagged hole (either variant)
  for (const r of rows4) {
    const r3 = rows3.find((x) => x.hole === r.hole);
    if (r.verdict === 'agree' && (!r3 || r3.verdict === 'agree') && !r.transitCrosses?.length) continue;
    const pts = [...r.defaultPath, ...r.trackPath, ...(r3?.trackPath ?? [])];
    if (!pts.length) continue;
    const m = 2 * v.widthPx, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    // the window: the routes plus 2 W, widened to at least 3:4 so the header band stays legible
    let xa = Math.min(...xs) - m, xb = Math.max(...xs) + m, ya = Math.min(...ys) - m, yb = Math.max(...ys) + m;
    if (xb - xa < 0.75 * (yb - ya)) { const g = (0.75 * (yb - ya) - (xb - xa)) / 2; xa -= g; xb += g; }
    if (yb - ya < 0.75 * (xb - xa)) { const g = (0.75 * (xb - xa) - (yb - ya)) / 2; ya -= g; yb += g; }
    const x0 = Math.max(0, Math.floor(xa)), y0 = Math.max(0, Math.floor(ya)), x1 = Math.min(dims.widthPx, Math.ceil(xb)), y1 = Math.min(dims.heightPx, Math.ceil(yb));
    const w = x1 - x0, h = y1 - y0, s = Math.max(1, Math.min(4, 1000 / Math.max(w, h)));
    const line = (rr, name) => `${name}: ${VERDICT_TEXT[rr.verdict]}; TRACK ${rr.trackStop.toUpperCase()}${rr.trackBasket ? ` AT ${rr.trackBasket}` : ''}, WALKED ${f2(rr.trackWalkedR1)} R1; LATERAL ${f2(rr.lateralW)} W${rr.transitCrosses?.length ? `; TEE-BADGE SEGMENT CROSSES ${rr.transitCrosses.join(', ')}` : ''}`;
    const crop = draw(canvas, dims, { x0, y0, w, h, scale: s, bandLines: [
      [null, `HOLE ${r.hole}: DEFAULT ENDS AT ${r.defaultBasket ?? 'NONE'} (${r.defaultBends} BENDS, ${f2(r.defaultLengthR1)} R1)`],
      [COL.four, line(r, 'FOUR-LANE')], ...(r3 ? [[COL.three, line(r3, 'THREE-LANE'), true]] : []), [COL.default, 'S7 DEFAULT ROUTE'], [COL.basket, 'BASKETPOINTS']] },
    (g) => paintHoles(g, v, rows3, rows4, { only: r.hole, labelScale: 3 }));
    parts.push({ address: `${address}#hole${r.hole}`, kind: 'raster', data: { width: crop.width, height: crop.height, scale: s, origin: [x0, y0], headerBandPx: crop.bandH, png: base64(encodePngRgb({ width: crop.width, height: crop.height, rgb: crop.rgb, ...(deflate ? { deflate } : {}) })) } });
  }
  const ledger = rows4.map((r) => { const r3 = rows3.find((x) => x.hole === r.hole); return { hole: r.hole, defaultBasket: r.defaultBasket, fourLane: r.verdict, fourLaneBasket: r.trackBasket, fourLaneStop: r.trackStop, fourLaneLateralW: r.lateralW, teeBadgeCrosses: (r.transitCrosses ?? []).join(', '), threeLane: r3?.verdict ?? null, threeLaneBasket: r3?.trackBasket ?? null, threeLaneStop: r3?.trackStop ?? null, threeLaneLateralW: r3?.lateralW ?? null }; });
  parts.push({ address: `${address}#holes`, kind: 'ledger', data: { rows: ledger } }, { address: `${address}#legend`, kind: 'ledger', data: { rows: legend.map(([, t]) => ({ legend: t })) } });
  return { kind: 'laneCrosscheck', parts };
}
