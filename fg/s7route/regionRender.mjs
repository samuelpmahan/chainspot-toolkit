/**
 * Render cases for the S7 region sensor's Parts (S7 region block of fg/render.mjs; browser-safe; ports/s7route/regionSpace.mjs):
 *   tk.s7.regionHeat  the station P(hallway) on its W/4 grid (best of 8 headings) as a heat raster, the training segments drawn
 *                     on it (white: tee -> badge; cyan: S6-straight hole), a colour bar and legend in the image, and ledgers of
 *                     the overlay fit (a, b, sigma per channel), the training / held-out rows and the dark-under row
 *   tk.s7.regionMean  the unmasked cover of the W/4 window (grey; red where a station sample would be invisible), downsampled
 *                     to at most 480 px, plus a ledger (the mean colours are a blurred copy of the source image: not drawn)
 * The drawing kit (5 x 7 font canvas) is fg/render.mjs's, passed in so this module does not import it back.
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const REGION_HEAT_SCHEMA = 'nctk-s7-region-heat@1';
export const REGION_MEAN_SCHEMA = 'nctk-s7-region-mean@1';
export const isRegionHeat = (v) => Boolean(v && typeof v === 'object' && v.schema === REGION_HEAT_SCHEMA);
export const isRegionMean = (v) => Boolean(v && typeof v === 'object' && v.schema === REGION_MEAN_SCHEMA);

// purple (0) -> teal (0.5) -> yellow (1): the same ramp at every P
const RAMP = Object.freeze([[68, 1, 84], [33, 145, 140], [253, 231, 37]]);
const ramp = (p) => { const [a, b] = p < 0.5 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]], f = p < 0.5 ? p * 2 : (p - 0.5) * 2; return a.map((c, i) => Math.round(c + (b[i] - c) * f)); };
const INK = [235, 235, 235], DIM = [170, 170, 170], TEE_BADGE = [255, 255, 255], STRAIGHT = [0, 220, 255];
const fmt = (v, d = 2) => (v == null ? 'N/A' : Array.isArray(v) ? v.map((x) => fmt(x, d)).join(' / ') : String(Math.round(v * 10 ** d) / 10 ** d));

function line(cv, a, b, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let k = 0; k <= n; k++) { const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n; cv.put(x, y, c); cv.put(x + 1, y, c); cv.put(x, y + 1, c); }
}

export function renderRegionHeat(address, v, { canvas }) {
  if (v.condition) return { kind: 'regionHeat', parts: [{ address, kind: 'ledger', data: { rows: [{ field: 'condition', value: v.condition }] } }] };
  const s = Math.max(1, Math.round(900 / v.gridW)), top = 74, legend = 58, w = v.gridW * s, h = top + v.gridH * s + legend, cv = canvas(Math.max(w, 640), h);
  cv.fill(0, 0, cv.w, h, [20, 20, 24]);
  for (let j = 0; j < v.gridH; j++) for (let i = 0; i < v.gridW; i++) cv.fill(i * s, top + j * s, s, s, ramp(v.P[j * v.gridW + i] / 255));
  const k = s / v.cellPx;   // px (canonical frame) -> image px
  for (const g of v.segments ?? []) line(cv, [g.V[0][0] * k, top + g.V[0][1] * k], [g.V[1][0] * k, top + g.V[1][1] * k], g.kind === 'straight' ? STRAIGHT : TEE_BADGE);
  const o = v.model?.overlay, t = v.model?.training, ho = v.model?.heldOut;
  cv.text(8, 6, `S7 REGION MODEL: STATION P(HALLWAY), BEST OF 8 HEADINGS, GRID W/4 = ${fmt(v.cellPx, 1)} PX`, INK);
  cv.text(8, 18, `OVERLAY FIT (PER IMAGE): INSIDE = A x UNDER + B; A ${fmt(o?.a)}  B ${fmt(o?.b, 0)}  R2 ${fmt(o?.r2)} (R / G / B)`, DIM);
  cv.text(8, 30, `TRAINING: ${t?.segments ?? 0} SEGMENTS (${t?.teeBadge ?? 0} TEE>BADGE, ${t?.straight ?? 0} S6-STRAIGHT); STATIONS PASSING: ${fmt(t?.positivePass)} OF HALLWAY, ${fmt(t?.negativePass)} OF SHIFTED`, DIM);
  cv.text(8, 42, `DARK-UNDER (DARKEST QUARTER OF THE FLANKS): ${fmt(t?.darkUnderPass)} PASS (N ${t?.darkUnder ?? 0}); REST ${fmt(t?.restPass)}`, DIM);
  cv.text(8, 54, ho?.auc != null ? `HELD OUT (EVEN HOLES -> ODD HOLES): AUC ${fmt(ho.auc, 3)}; HALLWAY PASS ${fmt(ho.positivePass)}, DARK-UNDER ${fmt(ho.darkUnderPass)}, SHIFTED ${fmt(ho.negativePass)}` : `HELD OUT: ${ho?.condition ?? 'N/A'}`, DIM);
  let y = top + v.gridH * s + 8, x = 8;
  for (let q = 0; q <= 20; q++) cv.fill(x + q * 8, y, 8, 10, ramp(q / 20));
  cv.text(x, y + 13, 'P 0', DIM); cv.text(x + 132, y + 13, 'P 1', DIM); x += 190;
  const sw = (c, label) => { cv.fill(x, y + 3, 14, 3, c); x = cv.text(x + 18, y + 2, label, INK) + 16; };
  sw(TEE_BADGE, 'TRAINING: TEE CAP > BADGE'); sw(STRAIGHT, 'TRAINING: S6-STRAIGHT HOLE');
  cv.text(8, y + 30, 'TEAL = P 0.5 (A STATION PASSES AT P >= 0.5); PURPLE ALSO = NOT VISIBLE (SPRITES, RINGS)', DIM);
  const W = cv.w;
  return { kind: 'regionHeat', parts: [
    { address: `${address}#heat`, kind: 'raster', data: { width: W, height: h, png: base64(encodePngRgb({ width: W, height: h, rgb: cv.rgb })) } },
    { address: `${address}#legend`, kind: 'ledger', data: { rows: [
      { colour: 'purple rgb(68, 1, 84) .. teal rgb(33, 145, 140) .. yellow rgb(253, 231, 37)', meaning: 'station P(hallway) 0 .. 0.5 .. 1, the best of 8 headings at the cell centre (purple also: not visible)' },
      { colour: 'white line', meaning: 'training segment: a tee cap -> its badge (Sam: straight hallway)' }, { colour: 'cyan line', meaning: 'training segment: an S6-STRAIGHT hole, tee cap -> its on-axis basket' }] } },
    { address, kind: 'ledger', data: { rows: [
      { field: 'overlay a (R / G / B)', value: fmt(o?.a, 3) }, { field: 'overlay b (R / G / B, 0..255)', value: fmt(o?.b, 1) }, { field: 'residual sigma (R / G / B)', value: fmt(o?.sigma, 1) },
      { field: 'R^2 of the overlay fit (R / G / B)', value: fmt(o?.r2, 3) }, { field: 'ground the layer hides on, b / (1 - a) (R / G / B)', value: fmt(o?.invisibleOnRgb, 0) },
      { field: 'training: hallway stations passing (P >= 0.5)', value: fmt(t?.positivePass, 3) }, { field: 'training: dark-under stations passing', value: `${fmt(t?.darkUnderPass, 3)} of ${t?.darkUnder ?? 0}` },
      { field: 'training: shifted stations passing', value: fmt(t?.negativePass, 3) }, { field: 'training AUC', value: fmt(t?.auc, 3) },
      { field: 'held-out AUC (even -> odd holes)', value: ho?.auc != null ? fmt(ho.auc, 3) : ho?.condition ?? 'N/A' }, { field: 'held-out dark-under passing', value: fmt(ho?.darkUnderPass, 3) },
      { field: 'grid cells with P >= 0.5 (share)', value: v.emits?.hotCellsPct != null ? `${v.emits.hotCellsPct} %` : 'N/A' }] } }
  ] };
}

export function renderRegionMean(address, v, { canvas }) {
  const { widthPx: X, heightPx: Y, cover } = v, step = Math.max(1, Math.ceil(Math.max(X, Y) / 480)), w = Math.ceil(X / step), h = Math.ceil(Y / step) + 30, cv = canvas(w, h);
  for (let y = 0; y < h - 30; y++) for (let x = 0; x < w; x++) {
    const c = cover[Math.min(Y - 1, y * step) * X + Math.min(X - 1, x * step)];
    cv.put(x, y + 30, c < 128 ? [200, 40, 40] : [c, c, c]);
  }
  cv.text(4, 4, `REGION MEAN: UNMASKED COVER OF THE ${v.windowPx} PX WINDOW`, [20, 20, 20]); cv.text(4, 16, 'GREY = COVER (WHITE 100 %); RED = < 50 % (A SAMPLE THERE IS NOT VISIBLE)', [90, 90, 90]);
  return { kind: 'regionMean', parts: [
    { address: `${address}#cover`, kind: 'raster', data: { width: w, height: h, scale: 1 / step, png: base64(encodePngRgb({ width: w, height: h, rgb: cv.rgb })) } },
    { address, kind: 'ledger', data: { rows: [{ field: 'imagePx', value: `${X} x ${Y}` }, { field: 'windowPx (round(W/4), odd)', value: v.windowPx }, { field: 'hallway width W (px, LOCAL)', value: v.hallwayWidthPx },
      { field: 'px with >= 50 % cover (share)', value: `${v.emits?.coveredPct} %` }, { field: 'legend', value: 'grey: unmasked share of the window; red: < 50 % (sprites, C1 / C2 ring strokes)' }] } }
  ] };
}
