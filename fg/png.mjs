/**
 * Minimal PNG encoder and raster crop for Frames (browser-safe, pure JS).
 *
 * The flipbook's background-raster path embeds one full-resolution RGBA
 * buffer per book; a contact sheet needs many SMALL images instead (one
 * crop per disagreement), carried inline in a Frame part so the Frame stays
 * the single source of truth. This writes an 8-bit RGB PNG with STORED
 * (uncompressed) deflate blocks: no compressor, no node:zlib, so it runs
 * unchanged in the FE. A 120 x 120 crop is ~43 KB of PNG (~58 KB base64),
 * which is fine for a handful of contact-sheet pages and wrong for a whole
 * raster (use the background raster or an artifact ref for that).
 *
 *   encodePngRgb({ width, height, rgb })  -> Uint8Array (PNG bytes)
 *   cropWindow({ rgba, width, height }, { cx, cy, size, overlays? })
 *       -> { origin: [x0, y0], width, height, png: base64 }
 *     overlays: [{ kind: 'rect', bbox: [x, y, w, h], color: [r, g, b] }
 *               | { kind: 'cross', x, y, color, arm? }]  in RASTER coords;
 *     pixels outside the raster are mid-gray, so the window is always
 *     size x size and the target stays centered.
 */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function zlibStored(raw) {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535, len = Math.min(65535, raw.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff; out[o++] = len >>> 8;
    out[o++] = ~len & 0xff; out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), o); o += len;
  }
  new DataView(out.buffer).setUint32(o, adler32(raw));
  return out;
}

export function encodePngRgb({ width, height, rgb }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('encodePngRgb: width/height must be positive integers');
  if (rgb.length !== width * height * 3) throw new Error(`encodePngRgb: rgb has ${rgb.length} bytes, expected ${width * height * 3}`);
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width); v.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor RGB
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function cropWindow({ rgba, width, height }, { cx, cy, size = 120, overlays = [] }) {
  const x0 = Math.round(cx) - Math.floor(size / 2), y0 = Math.round(cy) - Math.floor(size / 2);
  const rgb = new Uint8Array(size * size * 3).fill(128);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    const s = (sy * width + sx) * 4, d = (y * size + x) * 3;
    rgb[d] = rgba[s]; rgb[d + 1] = rgba[s + 1]; rgb[d + 2] = rgba[s + 2];
  }
  const put = (x, y, [r, g, b]) => {
    const lx = Math.round(x) - x0, ly = Math.round(y) - y0;
    if (lx < 0 || ly < 0 || lx >= size || ly >= size) return;
    const d = (ly * size + lx) * 3;
    rgb[d] = r; rgb[d + 1] = g; rgb[d + 2] = b;
  };
  for (const o of overlays) {
    if (o.kind === 'rect') {
      const [bx, by, bw, bh] = o.bbox;
      for (let x = bx - 1; x <= bx + bw; x++) { put(x, by - 1, o.color); put(x, by + bh, o.color); }
      for (let y = by - 1; y <= by + bh; y++) { put(bx - 1, y, o.color); put(bx + bw, y, o.color); }
    } else if (o.kind === 'cross') {
      const arm = o.arm ?? 3;
      for (let d = -arm; d <= arm; d++) { put(o.x + d, o.y, o.color); put(o.x, o.y + d, o.color); }
    } else throw new Error(`cropWindow: unknown overlay kind ${o.kind}`);
  }
  return { origin: [x0, y0], width: size, height: size, png: base64(encodePngRgb({ width: size, height: size, rgb })) };
}
