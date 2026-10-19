/**
 * Render case for tk.s7.routeMatchView (S7 trace lane block of fg/render.mjs; browser-safe): the course picture with the
 * routeMatch traces drawn over it at VIEW.scale x, one raster (stored PNG; a real compressor may be passed as opts.deflate).
 *   route            coloured by agreement with Sam's testimony: green agrees (tee <= 8 px, basket <= 12 px, within W / 2 of his
 *                    corridor), red disagrees, blue is not judged (no testimony for the hole)
 *   bends            hollow ring = where the matching rule put it (before the bend placement), filled dot = after it
 *   testimony        yellow centreline tee -> bends -> basket with a translucent band of width W, rings on his tee and basket
 *   labels, legend   hole number (+ agree / X) at the tee; the legend box top-left with the counts and median bend offsets
 * The drawing kit (5 x 7 font canvas) is fg/render.mjs's, passed in so this module does not import it back.
 */
import { encodePngRgb, base64 } from '../png.mjs';
import { TRACE_VIEW_SCHEMA } from '../../ports/s7trace/traceView.mjs';

export const isTraceView = (v) => Boolean(v && typeof v === 'object' && v.schema === TRACE_VIEW_SCHEMA);
export const VIEW = Object.freeze({ scale: 2, routePx: 4, centrelinePx: 3, bandAlpha: 0.22, ringRadiusPx: 8, dotRadiusPx: 5, labelScale: 3 });
const COL = Object.freeze({ agree: [40, 220, 90], disagree: [255, 50, 50], unjudged: [70, 150, 255], unconfirmed: [255, 150, 0], noReading: [200, 60, 255], sam: [255, 225, 0], ink: [255, 255, 255], black: [0, 0, 0] });

export function renderTraceView(address, v, dims, { canvas, deflate = null }) {
  const S = VIEW.scale, IW = dims?.widthPx, IH = dims?.heightPx;
  if (!(IW > 0) || !dims?.rgba) return { kind: 'routeMatchView', parts: [{ address, kind: 'ledger', data: { rows: [{ field: 'condition', value: 'no image raster (px.image.cropped) to draw over' }] } }] };
  const w = IW * S, h = IH * S, cv = canvas(w, h), rgb = cv.rgb;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (Math.floor(y / S) * IW + Math.floor(x / S)) * 4, d = (y * w + x) * 3; rgb[d] = dims.rgba[i]; rgb[d + 1] = dims.rgba[i + 1]; rgb[d + 2] = dims.rgba[i + 2]; }
  const P = (p) => [p[0] * S + S / 2, p[1] * S + S / 2];
  const blend = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const d = (y * w + x) * 3; for (let k = 0; k < 3; k++) rgb[d + k] = Math.round(rgb[d + k] * (1 - a) + c[k] * a); };
  const disk = (cx, cy, r, c, a = 1) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) blend(x, y, c, a); };
  const ring = (cx, cy, r, t, c) => { for (let y = Math.floor(cy - r - t); y <= cy + r + t; y++) for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r + t / 2 && d >= r - t / 2) blend(x, y, c, 1); } };
  const line = (a, b, r, c, al = 1, dash = null) => {
    const [x0, y0] = P(a), [x1, y1] = P(b), L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L));
    for (let k = 0; k <= n; k++) { if (dash && Math.floor(k / dash) % 2) continue; disk(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, r, c, al); }
  };
  const poly = (V, r, c, al, dash) => { for (let i = 0; i + 1 < V.length; i++) line(V[i], V[i + 1], r, c, al, dash); };
  const label = (x, y, s, c, k) => { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) cv.text(x + dx * 2, y + dy * 2, s, COL.black, k); cv.text(x, y, s, c, k); };
  const bandR = (v.widthPx ?? 0) * S / 2;
  const confMode = v.totals.judged === 0;   // no testimony anywhere: colour by the sensor's confidence instead of agreement
  const colOf = (r) => (confMode ? (r.confidence === 'confirmed' ? COL.agree : r.confidence === 'unconfirmed' ? COL.unconfirmed : COL.noReading) : !r.judged ? COL.unjudged : r.agree ? COL.agree : COL.disagree);
  for (const r of v.rows) if (r.samCentre) { if (bandR > 0) { const V = r.samCentre; for (let i = 0; i + 1 < V.length; i++) { const [x0, y0] = P(V[i]), [x1, y1] = P(V[i + 1]), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2); for (let k = 0; k <= n; k++) disk(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, bandR, COL.sam, VIEW.bandAlpha * 0.3); } } }
  for (const r of v.rows) if (r.samCentre) poly(r.samCentre, VIEW.centrelinePx / 2, COL.sam, 1, 10);
  for (const r of v.rows) {
    const col = colOf(r);
    if (r.path.length) poly(r.path, VIEW.routePx / 2, col, 1, null);
    for (const q of r.samTee ? [r.samTee] : []) ring(...P(q), VIEW.ringRadiusPx, 3, COL.sam);
    for (const q of r.samBasket ? [r.samBasket] : []) ring(...P(q), VIEW.ringRadiusPx, 3, COL.sam);
    for (const b of r.before) { const [x, y] = P(b); ring(x, y, VIEW.ringRadiusPx, 3, COL.black); ring(x, y, VIEW.ringRadiusPx, 2, COL.ink); }
    for (const b of r.after) { const [x, y] = P(b); disk(x, y, VIEW.dotRadiusPx + 1, COL.black); disk(x, y, VIEW.dotRadiusPx, col); }
    if (r.path.length) { const [x, y] = P(r.path[0]); label(x + 12, y - 30, `${r.hole}${confMode ? (r.confidence === 'confirmed' ? '' : r.confidence === 'unconfirmed' ? ' ?' : ' -') : !r.judged ? '' : r.agree ? '' : ' X'}`, col, VIEW.labelScale); }
  }
  const T = v.totals, lines = [
    [null, `S7 ROUTEMATCH WITH BEND PLACEMENT (HALLWAY WIDTH W = ${Math.round(v.widthPx * 10) / 10} PX; IMAGE ${IW} X ${IH} PX, DRAWN AT ${S}X)`],
    ...(confMode ? [
      [COL.agree, `CONFIRMED: ${T.confirmed} OF ${T.holes} HOLES (SENSOR READS >= ${v.sensorTau} ON >= ${v.sensorMinStations} STATIONS)`],
      [COL.unconfirmed, `UNCONFIRMED: ${T.unconfirmed} ${T.unconfirmed === 1 ? 'HOLE' : 'HOLES'} (A READING BELOW THAT; HOLE NUMBER MARKED ?)`],
      [COL.noReading, `NO READING: ${T.noReading} ${T.noReading === 1 ? 'HOLE' : 'HOLES'} (NO ROUTE OR NO VISIBLE STATION; MARKED -)`],
      [null, `NO TESTIMONY FOR THIS COURSE: NOTHING IS JUDGED, CHECK BY EYE`]] : [
    [COL.agree, `ROUTE AGREES WITH TESTIMONY: ${T.agree} OF ${T.judged} JUDGED HOLES (TEE <= ${v.teeMatchPx} PX, BASKET <= ${v.basketMatchPx} PX, WITHIN W/2 OF HIS CORRIDOR)`],
    [COL.disagree, `ROUTE DISAGREES (HOLE NUMBER MARKED X)`],
    [COL.unjudged, `NOT JUDGED: ${T.holes - T.judged} OF ${T.holes} HOLES HAVE NO TESTIMONY`],
    [COL.sam, `TESTIMONY CORRIDOR (DASHED CENTRELINE, BAND = W; RINGS = HIS TEE AND BASKET)${v.source ? `: ${v.source}` : ''}`]]),
    ['hollow', `BEND BEFORE PLACEMENT (MATCHING RULE)  |  FILLED DOT = BEND AFTER PLACEMENT (ROUTE COLOUR)`],
    [null, T.bendsSam ? `BEND OFFSET TO HIS NEAREST BEND, MEDIAN OVER ${T.bendsSam} OF HIS BENDS: ${T.bendOffsetMedianBeforePx} PX BEFORE, ${T.bendOffsetMedianAfterPx} PX AFTER (MAX ${T.bendOffsetMaxBeforePx} / ${T.bendOffsetMaxAfterPx}); HIT WITHIN W/2: ${T.bendsHitBefore} -> ${T.bendsHitAfter}` : 'NO BEND POINTS IN THE TESTIMONY FOR THIS COURSE: BEND OFFSETS NOT MEASURED']
  ];
  // the legend goes where it covers no hole: the free corner (or text size) with the fewest route / tee / basket / label samples under it
  const pts = [];
  for (const r of v.rows) {
    for (let i = 0; i + 1 < r.path.length; i++) { const [x0, y0] = P(r.path[i]), [x1, y1] = P(r.path[i + 1]), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6)); for (let k = 0; k <= n; k++) pts.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); }
    if (r.path.length) { const [x, y] = P(r.path[0]); for (let dx = 0; dx <= 60; dx += 12) for (let dy = -34; dy <= 0; dy += 12) pts.push([x + 12 + dx, y + dy]); }   // the hole label
    for (const q of [r.samTee, r.samBasket, r.teeCenter, r.end]) if (q) pts.push(P(q));
  }
  const boxFor = (sc, corner) => {
    const bw = Math.min(w - 20, 12 + 6 * sc * Math.max(...lines.map((l) => l[1].length)) + 40), bh = 20 + lines.length * 13 * sc;
    const x0 = corner & 1 ? w - 10 - bw : 10, y0 = corner & 2 ? h - 10 - bh : 10;
    return { sc, bw, bh, x0, y0, hit: pts.filter(([x, y]) => x >= x0 - 8 && x <= x0 + bw + 8 && y >= y0 - 8 && y <= y0 + bh + 8).length };
  };
  const cand = [2, 1].flatMap((sc) => [0, 1, 2, 3].map((c) => boxFor(sc, c))), LB = cand.find((c) => c.hit === 0) ?? cand.reduce((a, b) => (b.hit < a.hit ? b : a));
  for (let y = LB.y0; y < LB.y0 + LB.bh; y++) for (let x = LB.x0; x < LB.x0 + LB.bw; x++) blend(x, y, COL.black, 0.72);
  lines.forEach(([c, t], i) => {
    const y = LB.y0 + 10 + i * 13 * LB.sc, x = LB.x0 + 10;
    if (c === 'hollow') { ring(x + 10, y + 7, 7, 3, COL.black); ring(x + 10, y + 7, 7, 2, COL.ink); } else if (c) { cv.fill(x, y, 22, 14, c); }
    cv.text(x + 32, y, t, COL.ink, LB.sc);
  });
  const png = base64(encodePngRgb({ width: w, height: h, rgb, ...(deflate ? { deflate } : {}) }));
  const rowsLedger = v.rows.map((r) => ({ hole: r.hole, judged: r.judged, agree: r.agree, teeErrPx: r.teeErrPx ?? null, endErrPx: r.endErrPx ?? null, maxOffCentrelinePx: r.maxOffCentrelinePx ?? null, confidence: r.confidence ?? null, marginLum: r.marginLum ?? null, sensor: r.sensor ?? null, stations: r.stations ?? null, bendsBefore: r.before.length, bendsAfter: r.after.length, bendOffBeforePx: (r.bendOffBeforePx ?? []).join(', '), bendOffAfterPx: (r.bendOffAfterPx ?? []).join(', ') }));
  return { kind: 'routeMatchView', parts: [
    { address, kind: 'raster', data: { width: w, height: h, scale: S, origin: [0, 0], png } },
    { address: `${address}#holes`, kind: 'ledger', data: { rows: rowsLedger } },
    { address: `${address}#legend`, kind: 'ledger', data: { rows: lines.map(([, t]) => ({ legend: t })) } }
  ] };
}
