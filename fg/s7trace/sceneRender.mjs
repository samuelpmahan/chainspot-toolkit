/**
 * Render case for tk.s7.scene / tk.s7.sceneS4 (S7 trace lane block of fg/render.mjs; browser-safe): the hallway scene
 * as one raster (luminance in grey, masked px, the opaque sprites and the C1 / C2 ring strokes, tinted red; BasketPoints
 * as yellow crosses), downsampled to at most 480 px on its long side, plus a ledger of its scalars (R1, pad template,
 * counts, all px).
 */
import { encodePngRgb, base64 } from '../png.mjs';

export const SCENE_SCHEMA = 'nctk-s7-hallway-scene@1';
export const isHallwayScene = (v) => Boolean(v && typeof v === 'object' && v.schema === SCENE_SCHEMA);

export function renderHallwayScene(address, v) {
  const { W, H, lum, mask, bp } = v, step = Math.max(1, Math.ceil(Math.max(W, H) / 480)), w = Math.ceil(W / step), h = Math.ceil(H / step);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = Math.min(H - 1, y * step) * W + Math.min(W - 1, x * step), g = Math.round(lum[i]), d = (y * w + x) * 3;
    if (mask[i]) { rgb[d] = Math.min(255, 0.5 * g + 120); rgb[d + 1] = 0.5 * g; rgb[d + 2] = 0.5 * g; } else { rgb[d] = g; rgb[d + 1] = g; rgb[d + 2] = g; }
  }
  for (const [bx, by] of bp) for (let k = -3; k <= 3; k++) for (const [x, y] of [[bx / step + k, by / step], [bx / step, by / step + k]]) {
    const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const d = (Y * w + X) * 3; rgb[d] = 255; rgb[d + 1] = 225; rgb[d + 2] = 25;
  }
  let masked = 0; for (let i = 0; i < W * H; i++) masked += mask[i];
  return { kind: 'hallwayScene', parts: [
    { address: `${address}#mask`, kind: 'raster', data: { width: w, height: h, scale: 1 / step, origin: [0, 0], png: base64(encodePngRgb({ width: w, height: h, rgb })) } },
    { address, kind: 'ledger', data: { rows: [
      { field: 'imagePx', value: `${W} x ${H}` }, { field: 'R1Px (C1 radius, LOCAL)', value: v.R1 }, { field: 'padTemplatePx (L x W)', value: `${v.L} x ${v.Wd}` },
      { field: 'basketPoints', value: bp.length }, { field: 'badges', value: Object.keys(v.badges).length }, { field: 'pads', value: v.pads.length },
      { field: 'maskedPx (opaque sprites + rings)', value: masked }, { field: 'legend', value: 'grey: luminance; red: masked (sprites dilated 2 px, C1/C2 ring strokes); yellow cross: BasketPoint' }] } }
  ] };
}
