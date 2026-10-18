/**
 * Test fixture: a synthetic photo (deterministic texture) with a semi-transparent ribbon composited along a segment at
 * a KNOWN alpha (contracts/alpha.profile@1 composite), optionally with a gap; and the fixture alpha profile. Browser-safe.
 */
import { composite, ALPHA_PROFILE_SCHEMA } from '../../../contracts/alpha.profile@1.mjs';

export const FIXTURE_ALPHA = 0.4;
export const FIXTURE_RGB = Object.freeze([200, 200, 205]);
export const FIXTURE_PROFILE = Object.freeze({
  schema: ALPHA_PROFILE_SCHEMA, course: 'fixture', r1Px: 30,
  overlays: { path: { rgb: [...FIXTURE_RGB], alpha: FIXTURE_ALPHA, sigmaRgb: 0, sigmaAlpha: 0, samplesPx: 0, fitOn: 'fixture', residualRms: 0 },
    c1Fill: { status: 'not fitted', reason: 'fixture' }, c2Fill: { status: 'not fitted', reason: 'fixture' }, c2Dash: { status: 'not fitted', reason: 'fixture' } },
  method: 'fixture: the alpha the ribbon was composited at'
});

/** A textured background (grass-like, +-5 RGB levels) with the ribbon |lateral| <= halfPx along from -> to, minus gapAlongPx. */
export function ribbonRaster({ W, H, from, to, halfPx, gapAlongPx = null, alpha = FIXTURE_ALPHA, rgb = FIXTURE_RGB, seed = 7 }) {
  const rgba = new Uint8Array(W * H * 4);
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]), u = [(to[0] - from[0]) / L, (to[1] - from[1]) / L];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = rnd() * 10 - 5, bg = [70 + t, 95 + t * 0.8, 60 + rnd() * 6 - 3];
    const dx = x - from[0], dy = y - from[1], along = dx * u[0] + dy * u[1], lat = Math.abs(-dx * u[1] + dy * u[0]);
    const onRibbon = lat <= halfPx && along >= -halfPx && along <= L + halfPx && !(gapAlongPx && along >= gapAlongPx[0] && along < gapAlongPx[1]);
    const c = onRibbon ? composite(bg, { rgb, alpha }) : bg;
    const i = (y * W + x) * 4; rgba[i] = Math.round(c[0]); rgba[i + 1] = Math.round(c[1]); rgba[i + 2] = Math.round(c[2]); rgba[i + 3] = 255;
  }
  return { rgba, widthPx: W, heightPx: H };
}
