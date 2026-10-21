/** Node-side: a PNG file's pixels as a PxC raster (the header reader's tile and training inputs). */
import { decodePng } from '../node-flipbook.mjs';

/** An 8-bit RGB/RGBA PNG's pixels as a raster { widthPx, heightPx, rgba } (node: fg/node-flipbook.mjs decodePng). */
export function rasterOfPng(bytes) {
  const { width, height, channels, pixels } = decodePng(bytes);
  if (channels === 4) return { widthPx: width, heightPx: height, rgba: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length) };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) { rgba[i * 4] = pixels[j]; rgba[i * 4 + 1] = pixels[j + 1]; rgba[i * 4 + 2] = pixels[j + 2]; rgba[i * 4 + 3] = 255; }
  return { widthPx: width, heightPx: height, rgba };
}

