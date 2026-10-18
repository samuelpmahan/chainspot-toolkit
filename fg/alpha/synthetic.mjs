/**
 * A synthetic scene for fn.q.alpha.* tests (browser-safe): a background (flat patches or a smooth texture with pixel
 * noise), discs composited at a known rgb / alpha with a translucent stroke at their edge (the C1 / C2 build), and a
 * straight ribbons composited at another rgb / alpha (drawn under the discs). Deterministic (seeded).
 */
import { composite } from '../../contracts/alpha.profile@1.mjs';

export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** background(x, y) -> [r, g, b]: 'flat' patches of random colour, or 'textured' (smooth waves + pixel noise). */
export function background(kind, { W, H, seed = 7, waveAmp: AMP = 2 }) {
  const R = rng(seed);
  if (kind === 'flat') {
    const cell = 110, cols = new Map();   // px: flat patches larger than a disc, so most pairs see one background
    const col = (i, j) => { const k = `${i},${j}`; if (!cols.has(k)) cols.set(k, [20 + 200 * R(), 20 + 200 * R(), 20 + 200 * R()]); return cols.get(k); };
    const ox = R() * cell, oy = R() * cell;
    return (x, y) => col(Math.floor((x + ox) / cell), Math.floor((y + oy) / cell));
  }
  // grass-like: a gentle gradient, faint short-wavelength blobs (8-25 px) and pixel noise (std 11.5 levels per channel)
  const waves = Array.from({ length: 24 }, () => { const lam = 8 + 17 * R(), th = R() * Math.PI; return { kx: (2 * Math.PI / lam) * Math.cos(th), ky: (2 * Math.PI / lam) * Math.sin(th), ph: R() * 6.283, amp: [AMP * R(), AMP * R(), AMP * R()] }; });
  const noise = new Float32Array(W * H * 3); for (let i = 0; i < noise.length; i++) noise[i] = (R() - 0.5) * 40;
  const gx = (R() - 0.5) * 0.1, gy = (R() - 0.5) * 0.1;
  return (x, y) => [0, 1, 2].map((c) => { let v = 100 + 15 * c + gx * x + gy * y; for (const w of waves) v += w.amp[c] * Math.sin(w.kx * x + w.ky * y + w.ph); return v + noise[(y * W + x) * 3 + c]; });
}

/**
 * Build the scene. discs: [{ centre, radiusPx, fill?, stroke? }] drawn in order, each with its own (or the shared)
 * `fill` ({ rgb, alpha }) and a stroke ({ rgb, alpha, widthPx }) centred on the edge; ribbons: [{ a, b, widthPx,
 * overlay }] drawn first (under the discs). Returns { raster: { widthPx, heightPx, rgba } }.
 */
export function scene({ W = 400, H = 300, bg = 'textured', seed = 7, discs = [], fill = null, stroke = null, ribbon = null, ribbons = ribbon ? [ribbon] : [] }) {
  const B = background(bg, { W, H, seed }), rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = B(x, y).map((c) => Math.max(0, Math.min(255, c)));
    for (const rb of ribbons) {
      const { a, b, widthPx } = rb, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
      if (t >= 0 && t <= 1 && Math.abs(((x - a[0]) * dy - (y - a[1]) * dx) / Math.sqrt(L2)) <= widthPx / 2) { v = composite(v, rb.overlay); break; }
    }
    for (const d of discs) {
      const r = Math.hypot(x - d.centre[0], y - d.centre[1]), f = d.fill ?? fill, st = d.stroke ?? stroke;
      if (f && r <= d.radiusPx) v = composite(v, f);
      if (st && Math.abs(r - d.radiusPx) <= st.widthPx / 2) v = composite(v, st);
    }
    const i = (y * W + x) * 4; rgba[i] = Math.round(v[0]); rgba[i + 1] = Math.round(v[1]); rgba[i + 2] = Math.round(v[2]); rgba[i + 3] = 255;
  }
  return { raster: { widthPx: W, heightPx: H, rgba } };
}

/**
 * A toy S3 board for the Calculation: baskets whose BasketPoints are the ring centres (C2 = 2 x C1, drawn C2 first),
 * a badge at the end of each straight tee -> badge ribbon, tees at its start, the S4 hallway width and the S3
 * association rows. Every sprite owns the px of its bbox (opaque by ownership; not drawn).
 */
export function toyBoard({ W = 900, H = 720, bg = 'textured', seed = 5, r1Px = 30, c1, c2, path, stroke = { rgb: [200, 205, 210], alpha: 0.6, widthPx: 3 } } = {}) {
  const centres = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) centres.push([90 + i * 175, 90 + j * 175]);
  const lanes = [[[40, 600], [860, 585]], [[40, 680], [860, 690]]];
  const discs = centres.flatMap((c) => [{ centre: c, radiusPx: 2 * r1Px, fill: c2, stroke: { ...stroke, widthPx: 4 } }, { centre: c, radiusPx: r1Px, fill: c1, stroke }]);
  const boxPx = ([x, y, w, h]) => { const px = []; for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(H, Math.ceil(y + h)); yy++) for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(W, Math.ceil(x + w)); xx++) px.push(yy * W + xx); return px; };
  const baskets = centres.map(([cx, cy]) => { const bbox = [Math.round(cx - 22.84), Math.round(cy - 71.73), 46, 72]; return { bbox, px: boxPx([bbox[0] + 8, bbox[1], 30, 30]) }; });
  const badges = lanes.map(([, b], k) => { const bbox = [Math.round(b[0] - 27), Math.round(b[1] - 21), 54, 42]; return { label: String(k + 1), bbox, px: boxPx(bbox) }; });
  const tees = lanes.map(([a]) => ({ center: a, bbox: [a[0] - 15, a[1] - 10, 30, 20], px: boxPx([a[0] - 15, a[1] - 10, 30, 20]) }));
  const badgeCentre = (b) => [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2];
  // the ribbon in the scene runs to the badge centre the Calculation will compute
  const association = { rows: lanes.map(([a], k) => ({ candidate: `Tee c${'ab'[k]}`, center: a, best: { badge: String(k + 1) } })) };
  const { raster } = scene({ W, H, bg, seed, discs, ribbons: lanes.map(([a], k) => ({ a, b: badgeCentre(badges[k]), widthPx: 30, overlay: path })) });
  return { raster: { imageId: 'toy', ...raster }, baskets, badges, tees, association, hallway: { widthPx: 30, fromSegments: 2 }, centres };
}
