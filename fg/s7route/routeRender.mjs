/**
 * Render case for tk.s7.routeTable (S7 scoring block of fg/render.mjs; browser-safe): three holes x baskets heatmap PNGs,
 * the edge contrast (lum) of the best contrast route, the hallway sensor on that route, and the sensor's own best route.
 * One row per hole (tee cap), one column per basket (`Basket cX`, S2 then S4 recovered), cell colour = the value (white
 * low .. dark blue high), the value printed (lum, or percent); a black underline marks the
 * row maximum, an orange frame Sam's basket for that hole (testimony, BasketPoint within 12 px; impeachable), a grey
 * cross a cell with no reading. Legend drawn in the image and given as a ledger.
 * The drawing kit (5 x 7 font canvas) is fg/render.mjs's, passed in so this module does not import it back.
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const ROUTE_TABLE_SCHEMA = 'nctk-s7-route-table@1';
export const isRouteTable = (v) => Boolean(v && typeof v === 'object' && v.schema === ROUTE_TABLE_SCHEMA);

const COL = Object.freeze({ ink: [20, 20, 20], dim: [120, 120, 120], sam: [245, 130, 48], best: [0, 0, 0], none: [150, 150, 150], prior: [214, 39, 40], lo: [255, 255, 255], hi: [8, 48, 107] });
const ramp = (f) => COL.lo.map((a, i) => Math.round(a + (COL.hi[i] - a) * Math.max(0, Math.min(1, f))));
const short = (name) => String(name ?? '').replace(/^Basket /, '');

/** One heatmap panel: values M[i][j] (null = no reading), shown as `fmt(v)`, coloured by (v - lo) / (hi - lo). */
function panel(v, { canvas, M, lo, hi, fmt, title, sub, maxOf, mark = null }) {
  const holes = v.holes ?? [], baskets = v.baskets ?? [];
  const cw = 26, ch = 16, left = 46, top = 64, legendH = 70;
  const w = Math.max(left + cw * baskets.length + 12, 640, 16 + 6 * Math.max(title.length, sub.length)), h = top + ch * holes.length + 14 + legendH;
  const cv = canvas(w, h);
  cv.text(8, 6, title, COL.ink); cv.text(8, 18, sub, COL.dim);
  baskets.forEach((k, j) => { cv.text(left + j * cw + 2, top - 22, short(k.name).slice(0, 4), COL.ink); cv.text(left + j * cw + 2, top - 12, String(k.index), COL.dim); });
  cv.text(4, top - 22, 'BASKET', COL.dim); cv.text(4, top - 12, 'INDEX', COL.dim);
  holes.forEach((hole, i) => {
    const y = top + i * ch, best = maxOf(i), sam = v.sam?.byHole?.[hole]?.basket;
    cv.text(4, y + 4, `H${hole}`, COL.ink);
    baskets.forEach((_, j) => {
      const x = left + j * cw, val = M[i]?.[j], f = val == null ? 0 : (val - lo) / (hi - lo || 1);
      cv.fill(x, y, cw - 1, ch - 1, val == null ? [235, 235, 235] : ramp(f));
      if (val != null) cv.text(x + 3, y + 4, fmt(val).padStart(3, ' '), f > 0.55 ? [255, 255, 255] : COL.ink);
      else for (let d = 0; d < 7; d++) { cv.put(x + 9 + d, y + 4 + d, COL.none); cv.put(x + 15 - d, y + 4 + d, COL.none); }
      if (j === best) cv.fill(x + 2, y + ch - 3, cw - 5, 2, COL.best);
      if (j === sam) cv.frame(x - 1, y - 1, cw + 1, ch + 1, COL.sam, 2);
      if (mark?.[i]?.[j]) cv.fill(x + 1, y + 1, 6, 3, COL.prior);
    });
  });
  let y = top + ch * holes.length + 12, x = 8;
  for (let k = 0; k <= 20; k++) cv.fill(x + k * 8, y, 8, 10, ramp(k / 20));
  cv.text(x, y + 13, fmt(lo), COL.dim); cv.text(x + 150, y + 13, fmt(hi), COL.dim); x += 180;
  const sw = (c, label, frame = false) => { if (frame) cv.frame(x, y, 12, 10, c, 2); else cv.fill(x, y, 12, 10, c); x = cv.text(x + 16, y + 2, label) + 14; };
  sw(COL.sam, "SAM'S BASKET (TESTIMONY, 12 PX)", true); sw(COL.best, 'ROW MAXIMUM');
  y += 26; x = 8; sw([235, 235, 235], 'NO READING (TOO FEW VISIBLE PX / STATIONS)');
  if (mark) sw(COL.prior, 'ON-AXIS PRIOR +15 (E03; NOT IN THE VALUE)');
  cv.text(8, y + 16, v.sam?.source ? `TESTIMONY: ${String(v.sam.source).slice(0, 90)}` : 'NO TESTIMONY: NOTHING MARKED', COL.dim);
  return { width: w, height: h, png: base64(encodePngRgb({ width: w, height: h, rgb: cv.rgb })) };
}
const argmaxRow = (row) => { let j = null; (row ?? []).forEach((x, i) => { if (x != null && (j === null || x > row[j])) j = i; }); return j; };

export function renderRouteTable(address, v, { canvas }) {
  const holes = v.holes ?? [], W = v.widthPx == null ? 'N/A' : Math.round(v.widthPx * 100) / 100;
  const C = v.contrastMatrix ?? [], vals = C.flat().filter((x) => x != null), hi = Math.max(1, Math.ceil(Math.max(0, ...vals)));
  const pct = (x) => String(Math.round(x * 100)), lum = (x) => String(Math.round(x));
  const panels = [
    ['contrast', C, 0, hi, lum, `S7 ROUTE TABLE: EDGE CONTRAST (LUM), BEST 0/1-BEND ROUTE, HOLE X BASKET (W ${W} PX)`, 'CELL = MEAN LUM 0.5-3 PX INSIDE THE RENDERED RIBBON EDGES MINUS OUTSIDE (MATCH18 BEST_ROUTE, BEND STEP 6 PX)'],
    ['contrastRouteSensor', v.contrastRouteSensor ?? [], 0, 1, pct, `S7 ROUTE TABLE: HALLWAY SENSOR ON THE CONTRAST ROUTE (%) (W ${W} PX)`, 'CELL = VISIBLE STATIONS WHOSE BOTH EDGES STEP > 8 LUM, ON THE ROUTE OF THE CONTRAST PANEL'],
    ['sensor', v.sensorMatrix ?? [], 0, 1, pct, `S7 ROUTE TABLE: HALLWAY SENSOR, ITS OWN BEST 0/1-BEND ROUTE (%) (W ${W} PX)`, 'CELL = BEST SENSOR READING (MATCH2: BEND STEP 8 PX, >= 20 VISIBLE STATIONS, ELSE 0)']
  ];
  const parts = panels.filter(([key, M]) => key !== 'sensor' || v.sensorMatrix).map(([key, M, lo, top, fmt, title, sub]) => ({ address: `${address}#${key}`, kind: 'raster', data: panel(v, { canvas, M, lo, hi: top, fmt, title, sub, maxOf: (i) => argmaxRow(M[i]), mark: key === 'contrast' ? v.onAxisPrior : null }) }));
  const judged = holes.filter((hole) => v.sam?.byHole?.[hole]?.basket != null);
  const agree = (M) => judged.filter((hole) => argmaxRow(M[holes.indexOf(hole)]) === v.sam.byHole[hole].basket).length;
  parts.push(
    { address: `${address}#legend`, kind: 'ledger', data: { rows: [
      { colour: 'white .. rgb(8, 48, 107)', meaning: `contrast panel: 0 .. ${hi} lum; sensor panels: 0 .. 100 % of visible stations passing the 8 lum edge test` },
      { colour: 'black underline', meaning: 'row maximum' }, { colour: 'rgb(245, 130, 48) frame', meaning: "Sam's basket for the hole (testimony, BasketPoint within 12 px)" },
      { colour: 'rgb(214, 39, 40) dot (contrast panel)', meaning: 'the on-axis prior column (packet E03): +15 for the matching rule, not in the value shown' },
      { colour: 'grey cross', meaning: 'no reading (contrast: < 30 visible px in an edge band; sensor: no route with >= 20 visible stations, read 0)' }] } },
    { address, kind: 'ledger', data: { rows: [
      { field: 'hallway width W (px, LOCAL)', value: v.widthPx }, { field: 'holes (tee caps)', value: holes.length }, { field: 'baskets (S2 + S4 recovered)', value: (v.baskets ?? []).length },
      { field: "contrast row maximum at Sam's basket (holes with testimony)", value: `${agree(C)} / ${judged.length}` },
      { field: "sensor row maximum at Sam's basket (holes with testimony)", value: v.sensorMatrix ? `${agree(v.sensorMatrix)} / ${judged.length}` : 'not produced (tk.s7.routeSensorTable)' },
      { field: 'conditions', value: (v.conditions ?? []).map((c) => `${c.hole ?? 'course'}: ${c.condition}`).join('; ') || 'none' }] } });
  return { kind: 'routeTable', parts };
}
