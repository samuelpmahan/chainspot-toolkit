/**
 * Attention crops (fg/attention layer, browser-safe, pure JS): a window of
 * the canonical raster, upscaled (default 3x, nearest neighbour), with
 * overlays drawn ON TOP in the upscaled grid so pixel edges stay exact.
 *
 *   drawCrop(raster, window, overlays, { scale }) -> { width, height, rgb }
 *     raster   { width, height, rgba }  canonical frame (alpha ignored: RGB is the picture)
 *     window   [x, y, w, h] in canonical px
 *     overlays drawn in order:
 *       { kind: 'px', px: Set|[index], color: [r,g,b], alpha?: 0..1, edge?: true }
 *           fill blended at alpha; edge draws the set's outline on the boundary
 *           between member and non-member pixels (so "does it cover exactly"
 *           is answerable at the pixel edge)
 *       { kind: 'box', bbox: [x, y, w, h], color, dash?: true }   outline just outside the box
 *       { kind: 'cross', x, y, color, arm? }
 *   hstack(images, { gap, color }) -> one image, side by side
 *   COLORS: the palette, also written to the packet legend
 */
export const COLORS = {
  own: [40, 110, 255], mute: [150, 150, 150], cand: [0, 200, 230], elim: [230, 0, 230],
  added: [0, 210, 60], removed: [255, 40, 40], reown: [255, 150, 0], split: [240, 220, 0], evidence: [0, 200, 230], elimAdded: [230, 0, 230],
  objAdded: [0, 230, 80], objRemoved: [255, 40, 40], objChanged: [255, 220, 0], objRefit: [0, 230, 255], objElim: [230, 0, 230], objPrev: [255, 255, 255], objBefore: [80, 140, 255]
};

export function drawCrop(raster, [wx, wy, ww, wh], overlays = [], { scale = 3 } = {}) {
  const W = ww * scale, H = wh * scale;
  const rgb = new Uint8Array(W * H * 3).fill(128);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const sx = wx + x, sy = wy + y;
    if (sx < 0 || sy < 0 || sx >= raster.width || sy >= raster.height) continue;
    const s = (sy * raster.width + sx) * 4;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const d = ((y * scale + dy) * W + x * scale + dx) * 3;
      rgb[d] = raster.rgba[s]; rgb[d + 1] = raster.rgba[s + 1]; rgb[d + 2] = raster.rgba[s + 2];
    }
  }
  const put = (X, Y, c, a = 1) => {
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    const d = (Y * W + X) * 3;
    for (let i = 0; i < 3; i++) rgb[d + i] = Math.round(rgb[d + i] * (1 - a) + c[i] * a);
  };
  for (const o of overlays) {
    if (o.kind === 'px') {
      const set = o.px instanceof Set ? o.px : new Set(o.px);
      const alpha = o.alpha ?? 0.4;
      const inWin = [];
      for (const p of set) { const x = p % raster.width, y = (p - x) / raster.width; if (x >= wx && x < wx + ww && y >= wy && y < wy + wh) inWin.push([p, x - wx, y - wy]); }
      if (alpha > 0) for (const [, lx, ly] of inWin) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(lx * scale + dx, ly * scale + dy, o.color, alpha);
      if (o.edge !== false) for (const [p, lx, ly] of inWin) {
        const x = lx + wx;
        const left = x > 0 && set.has(p - 1), right = x < raster.width - 1 && set.has(p + 1), up = set.has(p - raster.width), down = set.has(p + raster.width);
        for (let t = 0; t < scale; t++) {
          if (!left) put(lx * scale, ly * scale + t, o.color);
          if (!right) put(lx * scale + scale - 1, ly * scale + t, o.color);
          if (!up) put(lx * scale + t, ly * scale, o.color);
          if (!down) put(lx * scale + t, ly * scale + scale - 1, o.color);
        }
      }
    } else if (o.kind === 'box') {
      const [bx, by, bw, bh] = o.bbox;
      const X0 = (bx - wx) * scale - 1, Y0 = (by - wy) * scale - 1, X1 = (bx + bw - wx) * scale, Y1 = (by + bh - wy) * scale;
      const on = (t) => !o.dash || Math.floor(t / 4) % 2 === 0;
      const th = o.thickness ?? (scale > 1 ? 2 : 1); // drawn outward, so the box interior stays visible
      for (let k = 0; k < th; k++) {
        for (let X = X0 - k; X <= X1 + k; X++) if (on(X - X0)) { put(X, Y0 - k, o.color); put(X, Y1 + k, o.color); }
        for (let Y = Y0 - k; Y <= Y1 + k; Y++) if (on(Y - Y0)) { put(X0 - k, Y, o.color); put(X1 + k, Y, o.color); }
      }
    } else if (o.kind === 'cross') {
      const arm = (o.arm ?? 3) * scale;
      const X = Math.round((o.x - wx) * scale), Y = Math.round((o.y - wy) * scale);
      for (let d = -arm; d <= arm; d++) { put(X + d, Y, o.color); put(X, Y + d, o.color); }
    } else throw new Error(`drawCrop: unknown overlay kind ${o.kind}`);
  }
  return { width: W, height: H, rgb };
}

export function hstack(images, { gap = 6, color = [255, 255, 255] } = {}) {
  const H = Math.max(...images.map((i) => i.height));
  const W = images.reduce((s, i) => s + i.width, 0) + gap * (images.length - 1);
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set(color, i * 3);
  let ox = 0;
  for (const im of images) {
    for (let y = 0; y < im.height; y++) rgb.set(im.rgb.subarray(y * im.width * 3, (y + 1) * im.width * 3), (y * W + ox) * 3);
    ox += im.width + gap;
  }
  return { width: W, height: H, rgb };
}
